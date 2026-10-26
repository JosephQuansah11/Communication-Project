/**
 * Icons for the mobile app: the PNGs a phone needs to install the app on its home
 * screen (`public/icons/`), generated from the same artwork as the executable.
 *
 * iOS and Android both want a square PNG with no transparency in places — iOS paints
 * anything transparent black, and Android's maskable icons are cropped to whatever
 * shape the launcher uses — so the flat variants are composited onto the accent
 * colour first.
 *
 * Usage: node scripts/make-pwa-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICON_SIZES, encodePng, render } from './make-icon.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

/** The accent colour the flat icons are painted on. */
const BACKDROP = [99, 102, 241];

/**
 * Flatten straight-alpha pixels onto a solid colour.
 *
 * A transparent corner becomes the backdrop instead of black, which is what iOS
 * would otherwise show around the rounded square.
 */
export function flatten(pixels, [br, bg, bb]) {
  const out = Buffer.alloc(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    out[i] = Math.round(pixels[i] * alpha + br * (1 - alpha));
    out[i + 1] = Math.round(pixels[i + 1] * alpha + bg * (1 - alpha));
    out[i + 2] = Math.round(pixels[i + 2] * alpha + bb * (1 - alpha));
    out[i + 3] = 255;
  }
  return out;
}

const written = [];
const write = (name, size, { flat = false } = {}) => {
  const pixels = render(size);
  const file = path.join(outDir, name);
  fs.writeFileSync(file, encodePng(flat ? flatten(pixels, BACKDROP) : pixels, size));
  written.push(`${name} (${size}px${flat ? ', flat' : ''})`);
};

// The two sizes every install prompt asks for, plus the ones the platforms pick up
// on their own.
write('icon-192.png', 192);
write('icon-512.png', 512);
write('icon-maskable-512.png', 512, { flat: true });
write('apple-touch-icon.png', 180, { flat: true });

console.log(`Wrote ${written.length} icon(s) to public/icons/:`);
for (const entry of written) console.log(`  ${entry}`);
console.log(`\nSource artwork: ${ICON_SIZES.join('/')}px variants come from scripts/make-icon.mjs.`);
