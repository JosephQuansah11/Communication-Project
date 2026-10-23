import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(__dirname, '..', 'data', 'uploads', 'demo');

const id = () => `demo-${Math.random().toString(36).slice(2, 10)}`;

function write(name, contents) {
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  fs.writeFileSync(path.join(DEMO_DIR, name), contents);
}

function makeAurora() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#070b18"/>
      <stop offset="0.55" stop-color="#111c3d"/>
      <stop offset="1" stop-color="#1e1b4b"/>
    </linearGradient>
    <radialGradient id="glow1" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#818cf8" stop-opacity="0.75"/>
      <stop offset="1" stop-color="#818cf8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#22d3ee" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#22d3ee" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow3" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#f472b6" stop-opacity="0.4"/>
      <stop offset="1" stop-color="#f472b6" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="60"/></filter>
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#ffffff" stroke-opacity="0.045" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <ellipse cx="1450" cy="240" rx="520" ry="420" fill="url(#glow1)" filter="url(#blur)"/>
  <ellipse cx="1650" cy="820" rx="480" ry="320" fill="url(#glow2)" filter="url(#blur)"/>
  <ellipse cx="300" cy="920" rx="520" ry="300" fill="url(#glow3)" filter="url(#blur)"/>
  <rect width="1920" height="1080" fill="url(#grid)"/>
  <g stroke="#a5b4fc" stroke-opacity="0.25" fill="none">
    <circle cx="1500" cy="430" r="210" stroke-width="1.5"/>
    <circle cx="1500" cy="430" r="300" stroke-width="1" stroke-dasharray="4 12"/>
    <circle cx="300" cy="160" r="80" stroke-width="1"/>
  </g>
</svg>`;
}

function makePortrait() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1100" viewBox="0 0 900 1100">
  <defs>
    <linearGradient id="p" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f46e5"/>
      <stop offset="0.5" stop-color="#7c3aed"/>
      <stop offset="1" stop-color="#db2777"/>
    </linearGradient>
    <linearGradient id="shirt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="900" height="1100" fill="url(#p)"/>
  <circle cx="450" cy="330" r="260" fill="#ffffff" opacity="0.08"/>
  <circle cx="450" cy="380" r="150" fill="#fde3d3"/>
  <path d="M300 380 q0 -180 150 -180 q150 0 150 180 q0 60 -20 90 q-40 -120 -130 -120 q-90 0 -130 120 q-20 -30 -20 -90z" fill="#2b1b14"/>
  <path d="M120 1100 q20 -380 330 -380 q310 0 330 380z" fill="url(#shirt)"/>
  <path d="M450 720 l-80 70 l80 120 l80 -120z" fill="#e2e8f0" opacity="0.9"/>
  <circle cx="400" cy="380" r="12" fill="#2b1b14"/>
  <circle cx="500" cy="380" r="12" fill="#2b1b14"/>
  <path d="M410 450 q40 30 80 0" stroke="#b45309" stroke-width="8" fill="none" stroke-linecap="round"/>
  <text x="450" y="1040" font-family="system-ui, sans-serif" font-size="42" fill="#ffffff" text-anchor="middle" opacity="0.85">ALEX MERCER</text>
</svg>`;
}

function makeGallery() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0ea5e9"/>
      <stop offset="0.6" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#f59e0b"/>
    </linearGradient>
    <linearGradient id="mtn" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1e293b"/>
      <stop offset="1" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="900" fill="url(#sky)"/>
  <circle cx="860" cy="250" r="90" fill="#fef3c7" opacity="0.95"/>
  <path d="M0 620 L260 340 L470 600 L650 430 L900 660 L1200 420 L1200 900 L0 900z" fill="url(#mtn)"/>
  <path d="M0 760 L220 620 L430 780 L690 600 L960 790 L1200 650 L1200 900 L0 900z" fill="#020617" opacity="0.85"/>
  <g fill="#ffffff" opacity="0.8">
    <circle cx="140" cy="120" r="3"/><circle cx="320" cy="80" r="2"/><circle cx="540" cy="150" r="3"/>
    <circle cx="1040" cy="110" r="2"/><circle cx="1130" cy="200" r="3"/>
  </g>
</svg>`;
}

function makeChime() {
  const sampleRate = 22050;
  const seconds = 3;
  const samples = sampleRate * seconds;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  const notes = [523.25, 659.25, 783.99, 1046.5];
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t * 8) * Math.exp(-1.6 * t) * 0.55;
    let value = Math.sin(2 * Math.PI * 880 * t) * envelope * 0.4;
    notes.forEach((freq, index) => {
      const start = index * 0.28;
      if (t >= start) {
        const local = t - start;
        const localEnv = Math.min(1, local * 30) * Math.exp(-2.2 * local);
        value += Math.sin(2 * Math.PI * freq * local) * localEnv * 0.25;
      }
    });
    const sample = Math.max(-1, Math.min(1, value));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  return buffer;
}

function ensureAssets() {
  write('aurora.svg', makeAurora());
  write('portrait.svg', makePortrait());
  write('gallery.svg', makeGallery());
  write('chime.wav', makeChime());
}

function baseElement(overrides) {
  return {
    rotation: 0,
    opacity: 1,
    ...overrides,
  };
}

function textElement(overrides) {
  return baseElement({
    type: 'text',
    text: '',
    style: {
      fontFamily: 'system-ui',
      fontSize: 24,
      color: '#0f172a',
      bold: false,
      italic: false,
      underline: false,
      align: 'left',
      valign: 'top',
      lineHeight: 1.25,
      letterSpacing: 0,
    },
    fill: 'transparent',
    stroke: null,
    strokeWidth: 0,
    padding: 2,
    radius: 0,
    ...overrides,
  });
}

function shapeElement(overrides) {
  return baseElement({
    type: 'shape',
    shape: 'rect',
    fill: '#6366f1',
    stroke: null,
    strokeWidth: 0,
    radius: 0,
    text: '',
    ...overrides,
  });
}

function tableCell(value, style = {}, formula) {
  return { value, ...(style ? { style } : {}), ...(formula ? { formula } : {}) };
}

export function createDemoDeck() {
  ensureAssets();
  const now = new Date().toISOString();

  const features = [
    ['01', 'Native import', 'Drop in a .pptx or WPS file. Slides, text, tables, images and media are rebuilt as editable objects — no cloud round-trip.'],
    ['02', 'Excel inside', 'Real A1 formulas, ranges and 40+ functions. Format currency, percentages and dates; tables recalculate as you type.'],
    ['03', 'Live by default', 'Pick a display, go full screen and share a six-letter audience link. WebSockets keep every screen in sync.'],
  ];

  const featureCards = features.flatMap(([number, title, body], index) => {
    const x = 90 + index * 388;
    return [
      shapeElement({ id: id(), x, y: 218, w: 344, h: 336, fill: '#ffffff', stroke: '#e2e8f0', strokeWidth: 1, radius: 24 }),
      shapeElement({ id: id(), x: x + 28, y: 248, w: 44, h: 6, fill: index === 0 ? '#6366f1' : index === 1 ? '#0ea5e9' : '#f59e0b', radius: 3 }),
      textElement({ id: id(), x: x + 28, y: 276, w: 80, h: 24, text: number, style: { fontFamily: 'system-ui', fontSize: 13, color: '#94a3b8', bold: true, letterSpacing: 2 } }),
      textElement({ id: id(), x: x + 28, y: 306, w: 288, h: 40, text: title, style: { fontFamily: 'system-ui', fontSize: 25, color: '#0f172a', bold: true } }),
      textElement({ id: id(), x: x + 28, y: 356, w: 288, h: 160, text: body, style: { fontFamily: 'system-ui', fontSize: 15, color: '#475569', lineHeight: 1.55 } }),
    ];
  });

  const header = { bg: '#1e293b', color: '#f8fafc', bold: true, align: 'left', fontSize: 15 };
  const zebra = { bg: '#f8fafc', color: '#0f172a', fontSize: 15 };
  const plain = { bg: '#ffffff', color: '#0f172a', fontSize: 15 };
  const totalStyle = { bg: '#eef2ff', color: '#312e81', bold: true, fontSize: 15 };
  const money = { align: 'right', format: 'currency-usd' };
  const table = {
    rows: 8,
    cols: 4,
    colWidths: [430, 160, 220, 230],
    rowHeights: [46, 48, 48, 48, 48, 50, 46, 46],
    headerRow: true,
    headerCol: false,
    cells: {
      '0,0': tableCell('Engagement', header), '0,1': tableCell('Units', { ...header, align: 'right' }),
      '0,2': tableCell('Unit price', { ...header, align: 'right' }), '0,3': tableCell('Revenue', { ...header, align: 'right' }),
      '1,0': tableCell('Discovery workshop', plain), '1,1': tableCell('3', plain), '1,2': tableCell('1200', { ...plain, align: 'right', format: 'currency-usd' }), '1,3': tableCell('', money, '=B2*C2'),
      '2,0': tableCell('Design sprint', zebra), '2,1': tableCell('2', zebra), '2,2': tableCell('4800', { ...zebra, align: 'right', format: 'currency-usd' }), '2,3': tableCell('', money, '=B3*C3'),
      '3,0': tableCell('Build & ship', plain), '3,1': tableCell('1', plain), '3,2': tableCell('12500', { ...plain, align: 'right', format: 'currency-usd' }), '3,3': tableCell('', money, '=B4*C4'),
      '4,0': tableCell('Enablement', zebra), '4,1': tableCell('4', zebra), '4,2': tableCell('900', { ...zebra, align: 'right', format: 'currency-usd' }), '4,3': tableCell('', money, '=B5*C5'),
      '5,0': tableCell('TOTAL', totalStyle), '5,1': tableCell('', { ...totalStyle, align: 'right' }, '=SUM(B2:B5)'), '5,2': tableCell('', totalStyle), '5,3': tableCell('', { ...money, ...totalStyle, align: 'right' }, '=SUM(D2:D5)'),
      '6,0': tableCell('Average deal', { ...plain, color: '#475569' }), '6,1': tableCell('', plain), '6,2': tableCell('', plain), '6,3': tableCell('', { ...money, ...plain }, '=AVERAGE(D2:D5)'),
      '7,0': tableCell('Largest line', { ...zebra, color: '#475569' }), '7,1': tableCell('', zebra), '7,2': tableCell('', zebra), '7,3': tableCell('', { ...money, ...zebra }, '=MAX(D2:D5)'),
    },
  };

  const deck = {
    id: 'demo',
    title: 'Slidesmith Studio — Product tour',
    width: 1280,
    height: 720,
    createdAt: now,
    updatedAt: now,
    slides: [],
  };

  deck.slides.push({
    id: 'demo-slide-1',
    notes: 'Welcome. This deck is fully editable — every card, table and image is a live object.',
    transition: 'fade',
    background: { color: '#070b18', image: '/media/demo/aurora.svg', fit: 'cover', opacity: 1 },
    elements: [
      textElement({ id: id(), x: 96, y: 76, w: 520, h: 30, text: 'S L I D E S M I T H   S T U D I O', style: { fontFamily: 'system-ui', fontSize: 13, color: '#a5b4fc', bold: true, letterSpacing: 4 } }),
      textElement({ id: id(), x: 92, y: 178, w: 820, h: 210, text: 'Ideas, in motion.', style: { fontFamily: 'system-ui', fontSize: 82, color: '#ffffff', bold: true, lineHeight: 1.02 } }),
      textElement({ id: id(), x: 96, y: 400, w: 640, h: 96, text: 'A presentation workspace with native PowerPoint import, Excel-grade tables and live WebSocket presenting.', style: { fontFamily: 'system-ui', fontSize: 22, color: '#cbd5e1', lineHeight: 1.5 } }),
      textElement({ id: id(), x: 96, y: 532, w: 300, h: 56, text: 'Press → to explore', fill: '#6366f1', radius: 28, padding: 16, style: { fontFamily: 'system-ui', fontSize: 15, color: '#ffffff', bold: true, align: 'center', valign: 'middle' } }),
      baseElement({ id: id(), type: 'image', x: 920, y: 118, w: 268, h: 372, src: '/media/demo/portrait.svg', name: 'portrait.svg', fit: 'cover', clipShape: 'ellipse', expandable: true, stroke: '#c7d2fe', strokeWidth: 2 }),
      textElement({ id: id(), x: 900, y: 522, w: 300, h: 30, text: 'Alex Mercer · Keynote', style: { fontFamily: 'system-ui', fontSize: 13, color: '#a5b4fc', align: 'center' } }),
      shapeElement({ id: id(), x: 1060, y: 60, w: 120, h: 120, shape: 'star5', fill: '#22d3ee', opacity: 0.25 }),
    ],
  });

  deck.slides.push({
    id: 'demo-slide-2',
    notes: 'Three pillars: import fidelity, spreadsheet depth, live delivery.',
    transition: 'slide',
    background: { color: '#f8fafc', image: null, fit: 'cover', opacity: 1 },
    elements: [
      textElement({ id: id(), x: 90, y: 62, w: 760, h: 64, text: 'Built for the way you present', style: { fontFamily: 'system-ui', fontSize: 42, color: '#0f172a', bold: true } }),
      textElement({ id: id(), x: 92, y: 132, w: 700, h: 32, text: 'Everything on this canvas can be edited, resized, restyled and presented.', style: { fontFamily: 'system-ui', fontSize: 17, color: '#64748b' } }),
      ...featureCards,
      textElement({ id: id(), x: 90, y: 596, w: 900, h: 28, text: 'Tip: select an element and drag its handles. Shapes accept images via “Crop to shape”.', style: { fontFamily: 'system-ui', fontSize: 14, color: '#94a3b8' } }),
    ],
  });

  deck.slides.push({
    id: 'demo-slide-3',
    notes: 'Tables run an Excel-compatible formula engine. Edit any cell and dependent cells recalc immediately.',
    transition: 'fade',
    background: { color: '#ffffff', image: null, fit: 'cover', opacity: 1 },
    elements: [
      textElement({ id: id(), x: 90, y: 54, w: 800, h: 56, text: 'Tables that think like Excel', style: { fontFamily: 'system-ui', fontSize: 40, color: '#0f172a', bold: true } }),
      textElement({ id: id(), x: 92, y: 112, w: 780, h: 28, text: 'Double-click a cell, type =B2*C2 or =SUM(D2:D5), and press Enter.', style: { fontFamily: 'system-ui', fontSize: 16, color: '#64748b' } }),
      baseElement({ id: id(), type: 'table', x: 90, y: 168, w: 1090, h: 378, table }),
      textElement({ id: id(), x: 90, y: 566, w: 1000, h: 60, text: 'Supported: SUM · AVERAGE · IF · VLOOKUP · INDEX · MATCH · COUNTIF · SUMIF · ROUND · PMT — plus currency, percent and date formats.', style: { fontFamily: 'system-ui', fontSize: 14, color: '#475569', lineHeight: 1.5 } }),
      shapeElement({ id: id(), x: 1130, y: 600, w: 60, h: 60, shape: 'ellipse', fill: '#eef2ff', stroke: '#c7d2fe', strokeWidth: 1 }),
    ],
  });

  deck.slides.push({
    id: 'demo-slide-4',
    notes: 'Images can be cropped to any shape. Click media in the editor or during a presentation to expand it.',
    transition: 'fade',
    background: { color: '#0b1120', image: null, fit: 'cover', opacity: 1 },
    elements: [
      textElement({ id: id(), x: 80, y: 46, w: 780, h: 56, text: 'Every kind of media', style: { fontFamily: 'system-ui', fontSize: 40, color: '#ffffff', bold: true } }),
      textElement({ id: id(), x: 82, y: 104, w: 800, h: 28, text: 'Crop images into shapes. Expand images, video and audio with a single click.', style: { fontFamily: 'system-ui', fontSize: 16, color: '#94a3b8' } }),
      baseElement({ id: id(), type: 'image', x: 80, y: 164, w: 380, h: 380, src: '/media/demo/gallery.svg', name: 'gallery.svg', fit: 'cover', clipShape: 'star5', expandable: true }),
      baseElement({ id: id(), type: 'image', x: 500, y: 164, w: 340, h: 340, src: '/media/demo/portrait.svg', name: 'portrait.svg', fit: 'cover', clipShape: 'ellipse', expandable: true }),
      baseElement({
        id: id(), type: 'audio', x: 880, y: 164, w: 330, h: 130, src: '/media/demo/chime.wav', name: 'chime.wav',
        expandable: true, label: 'Notification chime',
      }),
      baseElement({
        id: id(), type: 'video', x: 880, y: 314, w: 330, h: 230,
        src: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        poster: '/media/demo/gallery.svg', name: 'ForBiggerBlazes.mp4', fit: 'cover', expandable: true, muted: true, loop: true,
      }),
      textElement({ id: id(), x: 80, y: 574, w: 900, h: 56, text: 'Try it: click the star image, the ellipse portrait, the audio chip or the video card.', style: { fontFamily: 'system-ui', fontSize: 16, color: '#c7d2fe' } }),
      textElement({ id: id(), x: 80, y: 626, w: 900, h: 30, text: 'Shapes → “Crop image to shape” turns any picture into a maskable object.', style: { fontFamily: 'system-ui', fontSize: 13, color: '#64748b' } }),
    ],
  });

  deck.slides.push({
    id: 'demo-slide-5',
    notes: 'Start a live session, share the link, then press Present. Every connected screen follows your navigation.',
    transition: 'fade',
    background: { color: '#111c3d', image: '/media/demo/aurora.svg', fit: 'cover', opacity: 1 },
    elements: [
      textElement({ id: id(), x: 96, y: 180, w: 800, h: 120, text: 'Make it live.', style: { fontFamily: 'system-ui', fontSize: 76, color: '#ffffff', bold: true } }),
      textElement({ id: id(), x: 98, y: 320, w: 720, h: 120, text: 'Share a six-letter audience link. Slides, table edits and cursor trails sync over WebSockets in real time.', style: { fontFamily: 'system-ui', fontSize: 21, color: '#cbd5e1', lineHeight: 1.55 } }),
      shapeElement({ id: id(), x: 96, y: 462, w: 340, h: 58, fill: 'rgba(99,102,241,0.35)', stroke: '#818cf8', strokeWidth: 1, radius: 29 }),
      textElement({ id: id(), x: 96, y: 462, w: 340, h: 58, text: 'Present → Live session', style: { fontFamily: 'system-ui', fontSize: 15, color: '#e0e7ff', bold: true, align: 'center', valign: 'middle' } }),
      textElement({ id: id(), x: 900, y: 640, w: 300, h: 24, text: '← → navigate  ·  F present  ·  Esc exit', style: { fontFamily: 'system-ui', fontSize: 12, color: '#64748b', align: 'right' } }),
    ],
  });

  return deck;
}
