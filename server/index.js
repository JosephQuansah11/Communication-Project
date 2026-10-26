import express from 'express';
import multer from 'multer';
import { WebSocketServer, WebSocket } from 'ws';
import { createPresence } from './presence.js';

/** Set once the server is listening: closes everything and stops the process. */
const shutdownRef = { current: null };
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { importPptx, ImportError, isLegacyOfficeBuffer, isZipBuffer } from './pptx.js';
import { createDemoDeck } from './demo.js';
import { detectServerPlatform, openCommand, platformLabel } from '../shared/platform.js';

const __dirname = moduleDir();
const ROOT = path.resolve(__dirname, '..');
/** True when running from the packaged single-file executable (Node SEA). */
const APP_FOLDER = 'QuandrionSlideMaster';
const PORTABLE_FOLDER = 'QuandrionSlideMasterData';
const STANDALONE = process.env.SLIDESMITH_STANDALONE === '1' || process.env.QUANDRION_STANDALONE === '1';
const isProduction = process.env.NODE_ENV === 'production';
const DATA_DIR = STANDALONE ? path.join(userDataRoot(), 'data') : path.join(ROOT, 'data');
const DECKS_DIR = path.join(DATA_DIR, 'decks');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const requestedPort = Number(cliOption('port') || process.env.PORT || 3000);
let PORT = Number.isFinite(requestedPort) && requestedPort > 0 ? requestedPort : 3000;

/** Directory of this module. Tolerates a bundled CommonJS build where `import.meta` is empty. */
function moduleDir() {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
}

/** Read `--name value` or `--name=value` from the command line. */
function cliOption(name) {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === `--${name}`) return args[i + 1];
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
  }
  return null;
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
}

/** Per-user application data folder, used when the install directory is read-only. */
function userAppDataDir() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), APP_FOLDER);
  }
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', APP_FOLDER);
  return path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'quandrion-slide-master');
}

/**
 * Writable folder for decks and uploads. The packaged app keeps everything next
 * to the executable when that folder is writable (portable install), and falls
 * back to the per-user application data folder otherwise.
 */
function userDataRoot() {
  const override = process.env.SLIDESMITH_DATA_DIR || process.env.QUANDRION_DATA_DIR;
  if (override) return override;
  const candidates = [];
  if (STANDALONE) {
    // The new folder first, then the one earlier builds used, so decks made
    // before the rename keep working.
    candidates.push(path.join(path.dirname(process.execPath), PORTABLE_FOLDER));
    candidates.push(path.join(path.dirname(process.execPath), 'SlidesmithData'));
  }
  candidates.push(userAppDataDir());
  for (const candidate of candidates) {
    try {
      fsSync.mkdirSync(candidate, { recursive: true });
      const probe = path.join(candidate, '.write-test');
      fsSync.writeFileSync(probe, 'ok');
      fsSync.rmSync(probe, { force: true });
      return candidate;
    } catch {
      /* not writable — try the next location */
    }
  }
  return path.join(os.tmpdir(), 'quandrion-data');
}

/** Create the storage folders. Called from `start()` so the bundle stays CommonJS-safe. */
async function ensureStorage() {
  await fs.mkdir(DECKS_DIR, { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '30mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

const ID_RE = /^[a-zA-Z0-9_-]{4,64}$/;

function safeId(id) {
  if (!ID_RE.test(String(id || ''))) throw new ImportError('Invalid identifier.', 400);
  return id;
}

function deckPath(id) {
  return path.join(DECKS_DIR, `${safeId(id)}.json`);
}

async function readDeck(id) {
  try {
    const raw = await fs.readFile(deckPath(id), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeDeck(deck) {
  deck.updatedAt = new Date().toISOString();
  await fs.writeFile(deckPath(deck.id), JSON.stringify(deck, null, 2));
  return deck;
}

async function listDecks() {
  const files = await fs.readdir(DECKS_DIR);
  const decks = [];
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    try {
      const deck = JSON.parse(await fs.readFile(path.join(DECKS_DIR, file), 'utf8'));
      decks.push({
        id: deck.id,
        title: deck.title,
        slides: deck.slides?.length || 0,
        width: deck.width,
        height: deck.height,
        updatedAt: deck.updatedAt,
        createdAt: deck.createdAt,
      });
    } catch {
      /* ignore corrupt deck */
    }
  }
  return decks.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function saveMediaFor(deckId) {
  const dir = path.join(UPLOADS_DIR, safeId(deckId));
  await fs.mkdir(dir, { recursive: true });
  return async (ext, data, baseName) => {
    const cleanExt = String(ext || '.bin').replace(/[^.a-z0-9]/gi, '').slice(0, 8) || '.bin';
    const fileName = `${baseName}${cleanExt}`;
    await fs.writeFile(path.join(dir, fileName), data);
    return `/media/${deckId}/${fileName}`;
  };
}

/* ------------------------------------------------------------------ *
 * Import pipeline
 * ------------------------------------------------------------------ */

function hasLibreOffice() {
  const candidates = ['soffice', 'libreoffice'];
  for (const bin of candidates) {
    try {
      const result = requireWhich(bin);
      if (result) return bin;
    } catch {
      /* continue */
    }
  }
  return null;
}

function requireWhich(bin) {
  const paths = (process.env.PATH || '').split(path.delimiter);
  for (const dir of paths) {
    const candidate = path.join(dir, bin);
    try {
      fsSync.accessSync(candidate, fsSync.constants.X_OK);
      return candidate;
    } catch {
      /* continue */
    }
  }
  return null;
}

const LO_BIN = hasLibreOffice();
/** Set once the packaged app starts logging to its data folder. */
let loggingStarted = false;

async function convertLegacy(buffer, originalName) {
  if (!LO_BIN) {
    throw new ImportError(
      'Legacy binary PowerPoint/WPS files (.ppt, .dps, .dpt, .pt) need a converter. Save the file as .pptx in PowerPoint or WPS, or install LibreOffice on the server so QuandrionSlideMaster can convert it automatically.',
      415
    );
  }
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quandrion-'));
  const ext = path.extname(originalName) || '.ppt';
  const input = path.join(tempDir, `input${ext}`);
  await fs.writeFile(input, buffer);
  await new Promise((resolve, reject) => {
    const proc = spawn(LO_BIN, ['--headless', '--norestore', '--convert-to', 'pptx', '--outdir', tempDir, input], {
      stdio: 'ignore',
      // LibreOffice must not flash a console window while converting.
      windowsHide: true,
    });
    proc.on('error', reject);
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`LibreOffice exited with code ${code}`))));
  });
  const output = path.join(tempDir, 'input.pptx');
  const converted = await fs.readFile(output).catch(() => null);
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  if (!converted) throw new ImportError('The presentation could not be converted to PPTX.', 422);
  return converted;
}


/*
 * Window presence: every open page says hello, and says goodbye when it closes.
 * The packaged app uses this to shut itself down with its last window instead of
 * lingering in the background.
 */
const presence = createPresence({
  onIdle: () => {
    // Only the packaged app lives and dies with its window: the dev server and the
    // end-to-end runs keep going, so a reload or a closed tab is not fatal.
    if (!STANDALONE || hasFlag('keep-running')) return;
    if (process.env.QUANDRION_KEEP_RUNNING === '1' || process.env.SLIDESMITH_KEEP_RUNNING === '1') return;
    if (!shutdownRef.current) return;
    console.log('   The last window closed � stopping QuandrionSlideMaster.');
    shutdownRef.current();
  },
});

app.post('/api/beat', (req, res) => {
  const { id, leaving } = req.body || {};
  if (leaving) presence.drop(id);
  else presence.beat(id);
  res.json({ ok: true, pages: presence.count() });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'quandrion-slide-master', converter: Boolean(LO_BIN), time: new Date().toISOString() });
});

app.get('/api/decks', async (req, res, next) => {
  try {
    res.json({ decks: await listDecks() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/decks/:id', async (req, res, next) => {
  try {
    const deck = await readDeck(req.params.id);
    if (!deck) return res.status(404).json({ error: 'Presentation not found.' });
    res.json({ deck });
  } catch (error) {
    next(error);
  }
});

app.post('/api/decks', async (req, res, next) => {
  try {
    const incoming = req.body?.deck;
    if (!incoming || !Array.isArray(incoming.slides)) {
      return res.status(400).json({ error: 'A deck with slides is required.' });
    }
    const id = incoming.id && ID_RE.test(incoming.id) ? incoming.id : crypto.randomUUID();
    const now = new Date().toISOString();
    const deck = {
      ...incoming,
      id,
      title: String(incoming.title || 'Untitled presentation').slice(0, 200),
      width: Number(incoming.width) || 1280,
      height: Number(incoming.height) || 720,
      createdAt: incoming.createdAt || now,
    };
    await writeDeck(deck);
    res.json({ deck });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/decks/:id', async (req, res, next) => {
  try {
    await fs.rm(deckPath(req.params.id), { force: true });
    await fs.rm(path.join(UPLOADS_DIR, req.params.id), { recursive: true, force: true });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a .pptx, .ppt, .dps or .dpt file to import.' });
    let buffer = req.file.buffer;
    const originalName = req.file.originalname || 'presentation.pptx';
    const ext = path.extname(originalName).toLowerCase();

    if (isLegacyOfficeBuffer(buffer) || !isZipBuffer(buffer)) {
      buffer = await convertLegacy(buffer, originalName);
    }
    if (!isZipBuffer(buffer)) {
      throw new ImportError('This file was not recognised as a PowerPoint or WPS presentation.', 415);
    }

    const deckId = crypto.randomUUID();
    const saveMedia = await saveMediaFor(deckId);
    const imported = await importPptx(buffer, saveMedia);
    const now = new Date().toISOString();
    const deck = {
      id: deckId,
      title: path.basename(originalName, ext).replace(/[_-]+/g, ' ').trim() || 'Imported presentation',
      width: imported.width,
      height: imported.height,
      slides: imported.slides,
      importedFonts: imported.fonts,
      // The deck's own theme, so "generate a similar background" can reuse it.
      theme: imported.theme || null,
      sourceFile: originalName,
      createdAt: now,
      updatedAt: now,
    };
    await writeDeck(deck);
    res.json({ deck });
  } catch (error) {
    next(error);
  }
});

app.post('/api/decks/:id/assets', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    safeId(req.params.id);
    const dir = path.join(UPLOADS_DIR, req.params.id);
    await fs.mkdir(dir, { recursive: true });
    const ext = path.extname(req.file.originalname || '').toLowerCase().slice(0, 8) || '.bin';
    const base = `${crypto.randomBytes(6).toString('hex')}`;
    const fileName = `${base}${ext}`;
    await fs.writeFile(path.join(dir, fileName), req.file.buffer);
    res.json({ url: `/media/${req.params.id}/${fileName}`, name: req.file.originalname });
  } catch (error) {
    next(error);
  }
});

app.get('/api/fonts', (req, res) => {
  res.json({
    strategy: 'system',
    note: 'Fonts are resolved from the operating system. Use queryLocalFonts() in Chromium for the full installed list.',
    stacks: {
      ui: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      serif: 'Georgia, "Times New Roman", serif',
      mono: '"SF Mono", "Cascadia Code", Consolas, "Liberation Mono", monospace',
    },
    families: [
      'system-ui', 'Segoe UI', 'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Calibri',
      'Georgia', 'Times New Roman', 'Garamond', 'Palatino Linotype', 'Cambria',
      'Consolas', 'Courier New', 'Menlo', 'Monaco', 'Cascadia Code',
      'Inter', 'Roboto', 'Ubuntu', 'DejaVu Sans', 'Liberation Sans', 'Noto Sans',
    ],
  });
});

app.use('/media', express.static(UPLOADS_DIR, { maxAge: '7d', fallthrough: true }));

/* ------------------------------------------------------------------ *
 * Live presentation sessions (WebSocket)
 * ------------------------------------------------------------------ */

const sessions = new Map();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  } while (sessions.has(code));
  return code;
}

function send(ws, payload) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

/**
 * Send one payload to everyone in a session.
 *
 * The payload is serialised **once** — a deck update to twenty viewers used to
 * mean twenty `JSON.stringify` calls of the same (possibly large) object.
 */
function broadcast(session, payload, exclude = null) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  for (const client of session.clients) {
    if (client === exclude) continue;
    send(client, text);
  }
  return text;
}

/**
 * High-frequency messages (a laser pointer, a drawing stroke) arrive hundreds of
 * times a second. Each session keeps only the newest one and flushes it on a
 * short timer, so the audience still sees every movement but the server does a
 * fraction of the work.
 */
function coalesceFor(session, kind, intervalMs) {
  session.coalescers = session.coalescers || new Map();
  let entry = session.coalescers.get(kind);
  if (entry) return entry.push;
  entry = {};
  const push = (payload) => {
    entry.payload = payload;
    if (entry.timer) return;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      const pending = entry.payload;
      entry.payload = null;
      if (pending) broadcast(session, pending);
    }, intervalMs);
    entry.timer.unref?.();
  };
  entry.push = push;
  session.coalescers.set(kind, entry);
  return push;
}

/** Stop the coalescing timers of a session that is going away. */
function stopCoalescers(session) {
  for (const entry of session.coalescers?.values() || []) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.payload = null;
  }
  session.coalescers?.clear();
}

function viewersPayload(session) {
  return {
    type: 'viewers',
    count: session.clients.size,
    viewers: [...session.clients].map((client) => client.name),
  };
}

function notifyViewers(session) {
  const payload = viewersPayload(session);
  broadcast(session, payload);
  if (session.host && session.host !== null) send(session.host, payload);
}

function sessionSnapshot(session) {
  return {
    type: 'session',
    code: session.code,
    title: session.deck?.title || 'Live presentation',
    deck: session.deck,
    slideIndex: session.slideIndex,
    step: session.step || 0,
    blank: session.blank || 'none',
    annotations: session.annotations || {},
    presenting: true,
  };
}

export function attachLiveServer(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  // ws re-emits socket errors; without a handler an occupied port would crash the app.
  wss.on('error', () => {});
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        /* ignore */
      }
    }
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.role = null;
    ws.sessionCode = null;
    ws.name = 'Guest';
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return send(ws, { type: 'error', error: 'Invalid message.' });
      }
      if (message.type === 'host') {
        if (!message.deck || !Array.isArray(message.deck.slides)) {
          return send(ws, { type: 'error', error: 'A deck is required to host.' });
        }
        if (ws.sessionCode && sessions.has(ws.sessionCode)) {
          stopCoalescers(sessions.get(ws.sessionCode));
          sessions.delete(ws.sessionCode);
        }
        const code = newCode();
        const session = {
          code,
          deck: message.deck,
          slideIndex: Math.max(0, Number(message.slideIndex) || 0),
          clients: new Set(),
          host: ws,
          createdAt: Date.now(),
          ended: false,
          /** Newest high-frequency payloads waiting to be flushed. */
          coalescers: new Map(),
          /** The last deck payload that went out, so identical ones are skipped. */
          lastDeckPayload: null,
        };
        sessions.set(code, session);
        ws.role = 'host';
        ws.sessionCode = code;
        ws.name = message.name || 'Presenter';
        send(ws, {
          type: 'hosted',
          code,
          url: `/live/${code}`,
          wsUrl: req.headers.host ? `ws://${req.headers.host}/ws` : '/ws',
        });
        send(ws, sessionSnapshot(session));
        return;
      }

      if (message.type === 'join') {
        const code = String(message.code || '').toUpperCase();
        const session = sessions.get(code);
        if (!session || session.ended) {
          return send(ws, { type: 'error', error: 'That live session has ended or does not exist.' });
        }
        ws.role = 'viewer';
        ws.sessionCode = code;
        ws.name = String(message.name || 'Guest').slice(0, 60);
        session.clients.add(ws);
        send(ws, sessionSnapshot(session));
        notifyViewers(session);
        return;
      }

      const session = sessions.get(ws.sessionCode);
      if (!session) return send(ws, { type: 'error', error: 'Not attached to a live session.' });

      if (ws.role === 'host') {
        switch (message.type) {
          case 'navigate': {
            const index = Math.max(0, Math.min((session.deck?.slides?.length || 1) - 1, Number(message.slideIndex) || 0));
            session.slideIndex = index;
            // `step` is the animation step inside the slide, so the audience sees
            // each item appear exactly when the presenter does.
            session.step = Math.max(0, Number(message.step) || 0);
            broadcast(session, { type: 'navigate', slideIndex: index, step: session.step });
            break;
          }
          case 'deck:update': {
            if (message.deck && Array.isArray(message.deck.slides)) {
              session.deck = message.deck;
              session.slideIndex = Math.max(0, Math.min(message.deck.slides.length - 1, session.slideIndex));
              const payload = { type: 'deck', deck: message.deck, slideIndex: session.slideIndex };
              // A whole deck is expensive to send; only do it when it changed.
              const text = JSON.stringify(payload);
              if (text !== session.lastDeckPayload) {
                session.lastDeckPayload = text;
                broadcast(session, text);
              }
            }
            break;
          }
          case 'table:update': {
            const { slideIndex, elementId, table } = message;
            const slide = session.deck?.slides?.[slideIndex];
            const element = slide?.elements?.find((el) => el.id === elementId);
            if (element) {
              element.table = table;
              broadcast(session, { type: 'table', slideIndex, elementId, table }, ws);
            }
            break;
          }
          case 'pointer': {
            // The laser pointer moves constantly: keep only the newest position.
            coalesceFor(session, 'pointer', 40)({ type: 'pointer', x: Number(message.x), y: Number(message.y), name: ws.name });
            break;
          }
          case 'blank': {
            // B / W blanking: the audience screen follows the presenter.
            session.blank = ['black', 'white'].includes(message.blank) ? message.blank : 'none';
            broadcast(session, { type: 'blank', blank: session.blank }, ws);
            break;
          }
          case 'annotation': {
            // Drawings are stored per slide so late joiners still see them.
            const slideIndex = Math.max(0, Number(message.slideIndex) || 0);
            const strokes = Array.isArray(message.strokes) ? message.strokes : [];
            session.annotations = { ...(session.annotations || {}), [slideIndex]: strokes };
            // A stroke arrives with every mouse move; 20 a second is plenty.
            coalesceFor(session, 'annotation', 50)({ type: 'annotation', slideIndex, strokes });
            break;
          }
          case 'presenting': {
            session.slideIndex = Math.max(0, Number(message.slideIndex) || 0);
            session.deck = message.deck || session.deck;
            const payload = { type: 'deck', deck: session.deck, slideIndex: session.slideIndex };
            const text = JSON.stringify(payload);
            if (text !== session.lastDeckPayload) {
              session.lastDeckPayload = text;
              broadcast(session, text);
            }
            break;
          }
          case 'end': {
            session.ended = true;
            broadcast(session, { type: 'ended' });
            for (const client of session.clients) {
              if (client.readyState === WebSocket.OPEN) client.close(1000, 'Session ended');
            }
            stopCoalescers(session);
            sessions.delete(session.code);
            send(ws, { type: 'ended' });
            break;
          }
          default:
            break;
        }
        return;
      }

      if (ws.role === 'viewer') {
        if (message.type === 'reaction') {
          const emoji = String(message.emoji || '').slice(0, 4);
          const payload = { type: 'reaction', emoji, name: ws.name };
          broadcast(session, payload);
          send(session.host, payload);
        } else if (message.type === 'request-state') {
          send(ws, sessionSnapshot(session));
        }
      }
    });

    ws.on('close', () => {
      const session = sessions.get(ws.sessionCode);
      if (!session) return;
      if (ws.role === 'host') {
        session.ended = true;
        broadcast(session, { type: 'ended' });
        for (const client of session.clients) {
          if (client.readyState === WebSocket.OPEN) client.close(1000, 'Presenter left');
        }
        stopCoalescers(session);
        sessions.delete(session.code);
      } else {
        session.clients.delete(ws);
        notifyViewers(session);
      }
    });
  });

  return wss;
}

/* ------------------------------------------------------------------ *
 * Client delivery: embedded assets (packaged app) or disk (dev / server)
 * ------------------------------------------------------------------ */

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/** Serve the React build that was inlined into the executable at build time. */
async function mountEmbeddedClient() {
  const { CLIENT_ASSETS } = await import('./generated/client-assets.js');
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/media/') || req.path.startsWith('/ws')) return next();
    const direct = CLIENT_ASSETS[req.path];
    const asset = direct || (path.extname(req.path) ? null : CLIENT_ASSETS['/index.html']);
    if (!asset) return next();
    res.setHeader('Content-Type', asset.type || CONTENT_TYPES[path.extname(req.path)] || 'application/octet-stream');
    res.setHeader('Cache-Control', direct && req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store');
    res.end(Buffer.from(asset.body, 'base64'));
  });
}

/* ------------------------------------------------------------------ *
 * Launch helpers for the packaged app
 * ------------------------------------------------------------------ */

/** Locate a Chromium browser so the app can open in a chrome-less window. */
function findChromiumBrowser() {
  const candidates = [];
  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env.LOCALAPPDATA || '';
    candidates.push(
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge');
  }
  for (const candidate of candidates) {
    try {
      if (candidate && fsSync.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Open the app in a window without browser chrome, falling back to the default
 * browser. The platform rules live in `shared/platform.js`; every child process
 * is started hidden so no console window ever pops up beside the app.
 */
function openBrowser(url) {
  if (hasFlag('no-open') || process.env.SLIDESMITH_NO_OPEN === '1') return;
  const launch = ({ command, args }) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  };
  try {
    const platform = detectServerPlatform(process.platform);
    launch(openCommand(platform, url, findChromiumBrowser()));
  } catch {
    /* the URL is logged either way */
  }
}

function tryListen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening);
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false);
      else reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve(true);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

/** Bind the first free port, so a stale instance never blocks the packaged app. */
async function listenWithFallback(server) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const port = PORT + attempt;
    // eslint-disable-next-line no-await-in-loop
    if (await tryListen(server, port, '0.0.0.0')) {
      PORT = port;
      return;
    }
  }
  throw new Error(`No free port between ${PORT} and ${PORT + 11}.`);
}

/* ------------------------------------------------------------------ *
 * Static app, error handling, bootstrap
 * ------------------------------------------------------------------ */

async function ensureDemoDeck() {
  const decks = await listDecks();
  if (decks.length) return;
  const demo = createDemoDeck({ assetsDir: path.join(UPLOADS_DIR, 'demo') });
  await writeDeck(demo);
}

app.use((error, req, res, next) => {
  if (!req.path.startsWith('/api/')) return next(error);
  if (res.headersSent) return next(error);
  if (error instanceof ImportError) {
    return res.status(error.status || 400).json({ error: error.message });
  }
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'That file is larger than the 150 MB limit.' });
  }
  console.error('[api]', error);
  res.status(500).json({ error: error?.message || 'Unexpected server error.' });
});

/**
 * Keep a log file for the packaged app, whose console window is hidden: every
 * console line is appended to `QuandrionSlideMasterData/quandrion.log` (trimmed when it
 * grows), so a user can still send something useful when something goes wrong.
 */
function startFileLogging() {
  if (loggingStarted) return;
  loggingStarted = true;
  const file = path.join(DATA_DIR, 'quandrion.log');
  const write = (level, args) => {
    try {
      const line = `${new Date().toISOString()} ${level} ${args
        .map((value) => (value instanceof Error ? value.stack || value.message : typeof value === 'string' ? value : JSON.stringify(value)))
        .join(' ')}\n`;
      fs.appendFile(file, line).catch(() => {});
    } catch {
      /* logging must never break the app */
    }
  };
  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      write(level.toUpperCase(), args);
      original(...args);
    };
  }
  // Keep the file from growing without bound.
  fs.stat(file)
    .then((info) => (info.size > 512 * 1024 ? fs.rm(file, { force: true }) : null))
    .catch(() => {});
}

async function start() {
  await ensureStorage();

  if (STANDALONE) {
    await mountEmbeddedClient();
  } else if (isProduction) {
    const dist = path.join(ROOT, 'dist');
    app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '1y', immutable: true }));
    app.use(express.static(dist, { index: false, maxAge: 0 }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/media/') || req.path.startsWith('/assets/')) return next();
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(dist, 'index.html'), (err) => (err ? next(err) : undefined));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: ROOT,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  await ensureDemoDeck();
  const server = new (await import('node:http')).Server(app);
  await listenWithFallback(server);
  // Attach the live socket once the port is secured, so a busy port can fall
  // through to the next one instead of failing the whole start-up.
  attachLiveServer(server);

  const url = `http://localhost:${PORT}`;
  const platform = detectServerPlatform(process.platform);
  // In the packaged app the console window is hidden, so everything worth knowing
  // also goes to a log file next to the decks.
  if (STANDALONE) startFileLogging();

  const lines = [
    '',
    '  ==============================================',
    '    QuandrionSlideMaster',
    '  ==============================================',
    `   System:                ${platformLabel(platform)} (${process.platform} ${process.arch})`,
    `   Open in your browser:  ${url}`,
    `   Live audience socket:  ws://localhost:${PORT}/ws`,
    `   Decks & uploads:       ${DATA_DIR}`,
    `   Legacy .ppt converter: ${LO_BIN ? LO_BIN : 'not installed (export as .pptx)'}`,
    '',
    STANDALONE
      ? '   The app is running in its own window. Close the window to stop it.'
      : '   Keep this window open while you work. Close it to stop the app.',
    '',
  ];
  for (const line of lines) console.log(line);

  if (STANDALONE) openBrowser(url);

  const shutdown = () => {
    presence.stop();
    for (const client of wss.clients) client.close();
    wss.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  shutdownRef.current = shutdown;

  // The app lives as long as one of its windows does. `--keep-running` (or
  // QUANDRION_KEEP_RUNNING=1) keeps the server up for a script or a test.
  const keepRunning = hasFlag('keep-running') || process.env.QUANDRION_KEEP_RUNNING === '1' || process.env.SLIDESMITH_KEEP_RUNNING === '1';
  if (STANDALONE && keepRunning) console.log('   Running with --keep-running: the app stays up when its window closes.');
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('Failed to start QuandrionSlideMaster', error);
  process.exit(1);
});

