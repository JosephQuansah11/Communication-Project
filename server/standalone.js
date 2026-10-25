/**
 * Entry point for the packaged single-file application (`npm run build:exe`).
 *
 * The runtime flags are set *before* the server module is evaluated, so the
 * server boots in packaged mode: production assets, a per-user data folder, an
 * embedded client bundle and an automatic browser launch.
 *
 * This module is bundled to CommonJS by `scripts/build-exe.mjs` and injected
 * into a copy of the Node runtime as a Node Single Executable Application.
 */
process.env.NODE_ENV = 'production';
process.env.SLIDESMITH_STANDALONE = '1';

// A dynamic import keeps the assignment above ahead of the server's module body.
import('./index.js').catch((error) => {
  console.error('');
  console.error('  Slidesmith Studio could not start.');
  console.error(`  ${error && error.message ? error.message : error}`);
  console.error('');
  process.exit(1);
});
