import express from 'express';
import multer from 'multer';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { importPptx, ImportError, isLegacyOfficeBuffer, isZipBuffer } from './pptx.js';
import { createDemoDeck } from './demo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DECKS_DIR = path.join(DATA_DIR, 'decks');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

await fs.mkdir(DECKS_DIR, { recursive: true });
await fs.mkdir(UPLOADS_DIR, { recursive: true });

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

async function convertLegacy(buffer, originalName) {
  if (!LO_BIN) {
    throw new ImportError(
      'Legacy binary PowerPoint/WPS files (.ppt, .dps, .dpt, .pt) need a converter. Save the file as .pptx in PowerPoint or WPS, or install LibreOffice on the server so Slidesmith can convert it automatically.',
      415
    );
  }
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slidesmith-'));
  const ext = path.extname(originalName) || '.ppt';
  const input = path.join(tempDir, `input${ext}`);
  await fs.writeFile(input, buffer);
  await new Promise((resolve, reject) => {
    const proc = spawn(LO_BIN, ['--headless', '--norestore', '--convert-to', 'pptx', '--outdir', tempDir, input], {
      stdio: 'ignore',
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

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'slidesmith-studio', converter: Boolean(LO_BIN), time: new Date().toISOString() });
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
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(session, payload, exclude = null) {
  for (const client of session.clients) {
    if (client === exclude) continue;
    send(client, payload);
  }
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
    presenting: true,
  };
}

export function attachLiveServer(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
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
        if (ws.sessionCode && sessions.has(ws.sessionCode)) sessions.delete(ws.sessionCode);
        const code = newCode();
        const session = {
          code,
          deck: message.deck,
          slideIndex: Math.max(0, Number(message.slideIndex) || 0),
          clients: new Set(),
          host: ws,
          createdAt: Date.now(),
          ended: false,
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
            broadcast(session, { type: 'navigate', slideIndex: index });
            break;
          }
          case 'deck:update': {
            if (message.deck && Array.isArray(message.deck.slides)) {
              session.deck = message.deck;
              session.slideIndex = Math.max(0, Math.min(message.deck.slides.length - 1, session.slideIndex));
              broadcast(session, { type: 'deck', deck: message.deck, slideIndex: session.slideIndex });
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
            broadcast(session, { type: 'pointer', x: Number(message.x), y: Number(message.y), name: ws.name }, ws);
            break;
          }
          case 'presenting': {
            session.slideIndex = Math.max(0, Number(message.slideIndex) || 0);
            session.deck = message.deck || session.deck;
            broadcast(session, { type: 'deck', deck: session.deck, slideIndex: session.slideIndex }, ws);
            break;
          }
          case 'end': {
            session.ended = true;
            broadcast(session, { type: 'ended' });
            for (const client of session.clients) {
              if (client.readyState === WebSocket.OPEN) client.close(1000, 'Session ended');
            }
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
 * Static app, error handling, bootstrap
 * ------------------------------------------------------------------ */

async function ensureDemoDeck() {
  const decks = await listDecks();
  if (decks.length) return;
  const demo = createDemoDeck();
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

async function start() {
  if (isProduction) {
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
  attachLiveServer(server);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  Slidesmith Studio  →  http://localhost:${PORT}`);
    console.log(`  Live presentation socket: ws://localhost:${PORT}/ws`);
    console.log(`  Legacy converter: ${LO_BIN ? LO_BIN : 'not installed (export legacy files as .pptx)'}\n`);
  });
}

start().catch((error) => {
  console.error('Failed to start Slidesmith Studio', error);
  process.exit(1);
});
