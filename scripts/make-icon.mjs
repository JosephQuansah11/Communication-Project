/**
 * Generate the application icon (build/icon.ico).
 *
 * The artwork is rasterised from scratch — a rounded indigo-to-cyan tile with a
 * presentation screen on a stand — and written as a classic 32-bit BMP icon so
 * every Windows version (and rcedit) can read it. No image libraries required.
 *
 * Usage: node scripts/make-icon.mjs [outputPath]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const SIZES = [256, 64, 32, 16];
export const ICON_SIZES = SIZES;
const SAMPLES = 4; // 4x4 supersampling per pixel

const ACCENT = [99, 102, 241];
const CYAN = [34, 211, 238];
const INK = [67, 56, 202];
const WHITE = [255, 255, 255];

function insideRoundRect(px, py, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Colour of the artwork at normalised coordinates (0..1, y down), topmost layer first. */
function shade(x, y) {
  if (!insideRoundRect(x, y, 0.045, 0.045, 0.955, 0.955, 0.205)) return null;
  // Content lines sit on top of the presentation screen.
  if (insideRoundRect(x, y, 0.27, 0.325, 0.6, 0.365, 0.02)) return INK;
  if (insideRoundRect(x, y, 0.27, 0.405, 0.73, 0.445, 0.02)) return INK;
  if (insideRoundRect(x, y, 0.27, 0.485, 0.52, 0.525, 0.02)) return INK;
  // Stand.
  if (insideRoundRect(x, y, 0.465, 0.615, 0.535, 0.735, 0.012)) return WHITE;
  if (insideRoundRect(x, y, 0.355, 0.735, 0.645, 0.8, 0.032)) return WHITE;
  // Presentation screen.
  if (insideRoundRect(x, y, 0.185, 0.235, 0.815, 0.615, 0.055)) return WHITE;
  return mix(ACCENT, CYAN, Math.min(1, Math.max(0, (x + y) / 2)));
}

/** Render one square size to straight-alpha RGBA pixels (top-down). */
export function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SAMPLES);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px * SAMPLES + sx + 0.5) * step;
          const y = (py * SAMPLES + sy + 0.5) * step;
          const colour = shade(x, y);
          if (!colour) continue;
          r += colour[0];
          g += colour[1];
          b += colour[2];
          a += 1;
        }
      }
      const total = SAMPLES * SAMPLES;
      const offset = (py * size + px) * 4;
      if (a) {
        pixels[offset] = Math.round(r / a);
        pixels[offset + 1] = Math.round(g / a);
        pixels[offset + 2] = Math.round(b / a);
        pixels[offset + 3] = Math.round((a / total) * 255);
      }
    }
  }
  return pixels;
}

/** Encode one size as a BITMAPINFOHEADER + BGRA bitmap + AND mask (bottom-up). */
function encodeBitmap(size) {
  const pixels = render(size);
  const maskStride = Math.ceil(size / 32) * 4;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR + AND bitmaps
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(size * size * 4 + maskStride * size, 20);

  const xor = Buffer.alloc(size * size * 4);
  const and = Buffer.alloc(maskStride * size);
  for (let y = 0; y < size; y += 1) {
    const srcRow = (size - 1 - y) * size * 4;
    for (let x = 0; x < size; x += 1) {
      const src = srcRow + x * 4;
      const dst = (y * size + x) * 4;
      xor[dst] = pixels[src + 2];
      xor[dst + 1] = pixels[src + 1];
      xor[dst + 2] = pixels[src];
      xor[dst + 3] = pixels[src + 3];
      if (pixels[src + 3] < 128) and[y * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Buffer.concat([header, xor, and]);
}

/** Build the complete .ico container. */
export function buildIcon() {
  const images = SIZES.map((size) => ({ size, data: encodeBitmap(size) }));
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);
  let offset = directory.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry);
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1);
    directory.writeUInt8(0, entry + 2);
    directory.writeUInt8(0, entry + 3);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });
  return Buffer.concat([directory, ...images.map((image) => image.data)]);
}

export function writeIcon(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buildIcon());
  return target;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** PNG version of the icon — used as the README/preview image. */
export function buildIconPng(size = 256) {
  const pixels = render(size);
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // no filter
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function writeIconPng(target, size = 256) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buildIconPng(size));
  return target;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const base = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon');
  const icoFile = writeIcon(`${base}.ico`);
  const pngFile = writeIconPng(`${base}.png`, 256);
  console.log(
    `Wrote ${path.relative(process.cwd(), icoFile)} (${(fs.statSync(icoFile).size / 1024).toFixed(1)} kB, ${SIZES.join('/')}px)`
  );
  console.log(`Wrote ${path.relative(process.cwd(), pngFile)} (preview)`);
}
