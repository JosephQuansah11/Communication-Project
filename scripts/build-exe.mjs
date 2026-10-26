/**
 * Build the packaged single-file application.
 *
 *   1. bundles the server (plus every dependency and the inlined client build)
 *      into one CommonJS file with esbuild;
 *   2. turns that file into a Node Single Executable Application blob;
 *   3. copies the Node runtime and injects the blob with postject.
 *
 * Result: build/Slidesmith.exe (Windows) or build/Slidesmith (macOS/Linux).
 * The executable is built for the platform it runs on — SEA cannot cross-compile.
 *
 * Usage: node scripts/build-exe.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(root, 'build');
const generatedClient = path.join(root, 'server', 'generated', 'client-assets.js');
const bundlePath = path.join(buildDir, 'slidesmith.cjs');
const configPath = path.join(buildDir, 'sea-config.json');
const blobPath = path.join(buildDir, 'sea-prep.blob');
const appName = 'Slidesmith';
const exeName = process.platform === 'win32' ? `${appName}.exe` : appName;
const exePath = path.join(buildDir, exeName);
const iconPath = path.join(buildDir, 'icon.ico');
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function step(message) {
  console.log(`\n==> ${message}`);
}

/**
 * Delete the previous build, or say plainly why it cannot be replaced.
 *
 * A running copy of the app holds the file open, and Windows refuses to delete or
 * overwrite it — which used to surface as a bare `EPERM` in the middle of the
 * build. The app has to be closed before it can be rebuilt, so say so.
 */
function removePreviousExe(file) {
  if (!fs.existsSync(file)) return;
  try {
    fs.rmSync(file, { force: true });
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EBUSY' && error.code !== 'EACCES') throw error;
    console.error('');
    console.error(`   ${path.relative(root, file)} is in use — a running copy of the app holds it open.`);
    console.error('   Close Slidesmith (check the notification area for a running instance) and build again.');
    console.error('   Tip: `npm run preview:app` runs the same app from source and never locks the build.');
    process.exit(1);
  }
}

if (!fs.existsSync(generatedClient)) {
  console.error('The client build has not been embedded yet.');
  console.error('Run `npm run build:client && node scripts/embed-client.mjs` first, or use `npm run build:exe`.');
  process.exit(1);
}

fs.mkdirSync(buildDir, { recursive: true });

step('Bundling the server with esbuild');
const result = await esbuild.build({
  entryPoints: [path.join(root, 'server', 'standalone.js')],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  legalComments: 'none',
  sourcemap: false,
  minify: false,
  // `vite` is only imported in development; the ws native add-ons are optional.
  external: ['vite', 'bufferutil', 'utf-8-validate'],
  logOverride: { 'empty-import-meta': 'silent' },
  logLevel: 'warning',
  metafile: true,
});
const bundledInputs = Object.keys(result.metafile.inputs).length;
console.log(`   bundled ${bundledInputs} module(s) -> ${path.relative(root, bundlePath)} (${kb(bundlePath)})`);

step('Generating the Single Executable Application blob');
fs.writeFileSync(
  configPath,
  `${JSON.stringify(
    {
      main: bundlePath,
      output: blobPath,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
    },
    null,
    2
  )}\n`,
  'utf8'
);
execFileSync(process.execPath, ['--experimental-sea-config', configPath], { stdio: 'inherit', cwd: root });
console.log(`   blob -> ${path.relative(root, blobPath)} (${kb(blobPath)})`);

step(`Copying the Node runtime to ${exeName}`);
removePreviousExe(exePath);
fs.copyFileSync(process.execPath, exePath);
fs.chmodSync(exePath, 0o755);

if (process.platform === 'win32') {
  step('Applying the app icon and version metadata');
  try {
    const { writeIcon, ICON_SIZES } = await import('./make-icon.mjs');
    writeIcon(iconPath);
    const { rcedit } = await import('rcedit');
    const { PUBLISHER } = await import('./sign-exe.mjs');
    await rcedit(exePath, {
      icon: iconPath,
      'file-version': version,
      'product-version': version,
      'version-string': {
        CompanyName: PUBLISHER,
        FileDescription: 'Slidesmith Studio - presentation workspace',
        InternalFilename: appName,
        OriginalFilename: exeName,
        ProductName: 'Slidesmith Studio',
        LegalCopyright: `MIT licensed - ${PUBLISHER}`,
      },
    });
    console.log(`   icon (${ICON_SIZES.join('/')}px), version ${version} and publisher "${PUBLISHER}" applied`);
  } catch (error) {
    console.warn(`   skipped: ${error.message}`);
    console.warn('   the app still runs, it just keeps the default Node icon.');
  }
}

step('Injecting the blob with postject');
const postjectCli = require.resolve('postject/dist/cli.js');
execFileSync(
  process.execPath,
  [postjectCli, exePath, 'NODE_SEA_BLOB', blobPath, '--sentinel-fuse', SEA_FUSE],
  { stdio: 'inherit', cwd: root }
);

// The injected blob invalidates the runtime's code signature; macOS refuses to
// run a modified signed binary, so re-sign ad-hoc when the tool is available.
if (process.platform === 'darwin') {
  try {
    execFileSync('codesign', ['--sign', '-', '--force', exePath], { stdio: 'inherit' });
    console.log('   re-signed the binary ad-hoc (codesign)');
  } catch {
    console.warn('   codesign unavailable — run `codesign --sign - --force` on the app before shipping it.');
  }
}

/**
 * Turn a console executable into a GUI one by flipping the PE subsystem field.
 *
 * A Node Single Executable Application is a copy of `node.exe`, which is a
 * console program: double-clicking it opens a black terminal window beside the
 * app. Windows only cares about one field in the PE optional header, so setting
 * it to `IMAGE_SUBSYSTEM_WINDOWS_GUI` (2) makes the app start silently — the
 * server still runs, it just has no console. (Logging goes to a file instead.)
 */
function setGuiSubsystem(file) {
  const buffer = fs.readFileSync(file);
  const peOffset = buffer.readUInt32LE(0x3c);
  if (buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    throw new Error('not a PE executable');
  }
  const optionalHeader = peOffset + 24;
  // PE32 and PE32+ both keep Subsystem at optional header + 0x44 (the 64-bit
  // ImageBase is wider, BaseOfData is gone — the field lands in the same place).
  const subsystemOffset = optionalHeader + 0x44;
  const current = buffer.readUInt16LE(subsystemOffset);
  if (current === 2) return { changed: false, from: current };
  buffer.writeUInt16LE(2, subsystemOffset);
  fs.writeFileSync(file, buffer);
  return { changed: true, from: current };
}

// The app must not open a console window beside itself: turn the copied runtime
// into a GUI executable (Windows only — other platforms have no such thing).
if (process.platform === 'win32') {
  step('Making the executable a windowed app (no console)');
  try {
    const { changed, from } = setGuiSubsystem(exePath);
    console.log(changed ? `   subsystem ${from} -> 2 (GUI): double-clicking opens no terminal` : '   already a GUI executable');
  } catch (error) {
    console.warn(`   skipped: ${error.message}`);
  }
}

// Signing comes last: it hashes the finished file, so it has to happen after the
// icon, the version resource, the injected blob and the subsystem flip.
if (process.platform === 'win32') {
  step('Signing the executable');
  const { signFile } = await import('./sign-exe.mjs');
  const signature = await signFile(exePath);
  if (!signature.signed && process.env.SLIDESMITH_REQUIRE_SIGNING === '1') {
    console.error('   SLIDESMITH_REQUIRE_SIGNING=1 and the file could not be signed.');
    process.exit(1);
  }
}

const sizeMb = (fs.statSync(exePath).size / (1024 * 1024)).toFixed(1);
console.log('');
console.log('  ==============================================');
console.log(`   Packaged app ready: build/${exeName} (${sizeMb} MB)`);
console.log('  ==============================================');
console.log('   Double-click it to start Slidesmith Studio.');
console.log('   The app opens in your browser and stores decks in a');
console.log('   "SlidesmithData" folder next to the executable (or in your');
console.log('   user profile when that folder is not writable).');
console.log('');
console.log('   Share the file directly — the recipient needs no Node.js.');
console.log('   A signed file carries the publisher name; an unsigned one is');
console.log('   still "unknown publisher" to SmartScreen and Smart App Control.');
console.log('');

function kb(file) {
  return `${(fs.statSync(file).size / 1024).toFixed(1)} kB`;
}
