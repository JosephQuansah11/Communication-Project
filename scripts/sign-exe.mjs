/**
 * Authenticode signing for the packaged app.
 *
 * Smart App Control and SmartScreen judge the *signature*, not the version
 * resource: an unsigned `Slidesmith.exe` is "an app we couldn't find a publisher
 * for" whatever `CompanyName` says. Signing the file is what puts a publisher on
 * it — the name Windows shows is the subject of the certificate that signed it.
 *
 * The machine's own tools are used, so no Windows SDK is needed: PowerShell's
 * `Set-AuthenticodeSignature` does the work when `signtool.exe` is missing.
 *
 * Configure it with environment variables (all optional):
 *
 *   SLIDESMITH_CERT_PFX        path to a code-signing .pfx / .p12 file
 *   SLIDESMITH_CERT_PASSWORD   that file's password
 *   SLIDESMITH_CERT_SHA1       thumbprint of a certificate in the user/machine store
 *   SLIDESMITH_TIMESTAMP_URL   RFC 3161 timestamp server (defaults to DigiCert)
 *   SLIDESMITH_SIGN_COMMAND    a command to run instead, with {file} as the path
 *   SLIDESMITH_REQUIRE_SIGNING 1 to make a build fail when signing is not configured
 *
 * Usage: node scripts/sign-exe.mjs build/Slidesmith.exe
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Where the timestamp authority lives unless the caller says otherwise. */
export const DEFAULT_TIMESTAMP_URL = 'http://timestamp.digicert.com';

/** The publisher name the app ships under. */
export const PUBLISHER = process.env.SLIDESMITH_PUBLISHER || 'josephQuansah11';

/**
 * Work out how this machine wants to sign, from the environment alone.
 *
 * The order matters: an explicit .pfx beats a store thumbprint, which beats a
 * custom command, and with none of them there is nothing to do.
 */
export function signingConfig(env = {}) {
  const pfx = env.SLIDESMITH_CERT_PFX ? path.resolve(env.SLIDESMITH_CERT_PFX) : null;
  const thumbprint = env.SLIDESMITH_CERT_SHA1 ? String(env.SLIDESMITH_CERT_SHA1).replace(/\s+/g, '') : null;
  const command = env.SLIDESMITH_SIGN_COMMAND ? String(env.SLIDESMITH_SIGN_COMMAND) : null;
  const timestamp = env.SLIDESMITH_TIMESTAMP_URL || DEFAULT_TIMESTAMP_URL;
  const method = pfx ? 'pfx' : thumbprint ? 'store' : command ? 'command' : 'none';
  return {
    method,
    pfx,
    password: env.SLIDESMITH_CERT_PASSWORD || '',
    thumbprint,
    command,
    timestamp,
    required: env.SLIDESMITH_REQUIRE_SIGNING === '1',
  };
}

/** Quote a value for a PowerShell single-quoted string. */
export function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Run a PowerShell script and return its trimmed stdout. */
function powershell(script) {
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
}

/**
 * Find signtool.exe, which is the tool that reliably signs large binaries.
 *
 * It ships with the Windows SDK / Visual Studio, so it is often missing on a plain
 * machine — `findSignTool()` returns null then and the PowerShell signer is used
 * instead (fine for small files, but it cannot hash a 90 MB single-file app).
 */
export function findSignTool(env = process.env) {
  if (env.SLIDESMITH_SIGNTOOL && fs.existsSync(env.SLIDESMITH_SIGNTOOL)) return env.SLIDESMITH_SIGNTOOL;
  const kits = ['C:\\Program Files (x86)\\Windows Kits\\10\\bin', 'C:\\Program Files\\Windows Kits\\10\\bin'];
  for (const root of kits) {
    if (!fs.existsSync(root)) continue;
    const candidates = [];
    for (const version of fs.readdirSync(root)) {
      for (const arch of ['x64', 'x86', 'arm64']) {
        const tool = path.join(root, version, arch, 'signtool.exe');
        if (fs.existsSync(tool)) candidates.push(tool);
      }
    }
    if (candidates.length) return candidates.sort().pop();
  }
  return null;
}

/** The signtool command line for a certificate file or a store thumbprint. */
function signToolArgs(file, config) {
  const args = ['sign', '/fd', 'SHA256', '/tr', config.timestamp, '/td', 'SHA256'];
  if (config.method === 'pfx') args.push('/f', config.pfx, ...(config.password ? ['/p', config.password] : []));
  else args.push('/sha1', config.thumbprint);
  args.push(file);
  return args;
}

/**
 * The PowerShell that signs the file, depending on where the certificate lives.
 *
 * A .pfx is loaded straight from disk, so the build never has to touch the user's
 * certificate store; a thumbprint looks the certificate up in the store instead.
 */
function signScript(file, config) {
  const load =
    config.method === 'pfx'
      ? `$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(${psQuote(config.pfx)}, ${psQuote(config.password)})`
      : `$cert = Get-ChildItem Cert:\\CurrentUser\\My, Cert:\\LocalMachine\\My -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Thumbprint -eq ${psQuote(config.thumbprint)} } | Select-Object -First 1
if (-not $cert) { throw "no certificate with thumbprint ${config.thumbprint} in the store" }`;
  return `$ErrorActionPreference = 'Stop'
${load}
if (-not $cert.HasPrivateKey) { throw 'the certificate has no private key' }
$result = Set-AuthenticodeSignature -FilePath ${psQuote(file)} -Certificate $cert -HashAlgorithm SHA256 -TimestampServer ${psQuote(config.timestamp)}
if ($result.Status -ne 'Valid') { throw "signing failed: $($result.Status) - $($result.StatusMessage)" }
Write-Output $result.SignerCertificate.Subject`;
}

/** Read back what Windows thinks of the file's signature. */
/**
 * Sign a built executable.
 *
 * Never throws for a missing configuration — a developer building locally gets a
 * warning and a working file. `SLIDESMITH_REQUIRE_SIGNING=1` turns that into a
 * failure, which is what a release build wants.
 */
export async function signFile(file, { env = process.env, log = console.log } = {}) {
  const config = signingConfig(env);
  if (!fs.existsSync(file)) throw new Error(`cannot sign ${file}: no such file`);

  if (config.method === 'none') {
    log('   no signing certificate configured — the file stays unsigned.');
    log('   Windows Smart App Control keeps blocking it ("no publisher"), because it');
    log('   reads the signature, not the version resource.');
    log(`   For a real publisher name, create a code-signing certificate in the name`);
    log(`   of "${PUBLISHER}" and set:`);
    log('     SLIDESMITH_CERT_PFX=C:\\path\\to\\publisher.pfx');
    log('     SLIDESMITH_CERT_PASSWORD=…');
    log('   (`npm run cert:new` makes a self-signed one for testing.)');
    return { signed: false, reason: 'not-configured', publisher: PUBLISHER };
  }

  if (config.method === 'pfx' && !fs.existsSync(config.pfx)) {
    const message = `the certificate file ${config.pfx} does not exist`;
    if (config.required) throw new Error(message);
    log(`   skipped: ${message}`);
    return { signed: false, reason: 'missing-certificate', publisher: PUBLISHER };
  }

  try {
    let subject;
    if (config.method === 'command') {
      const line = config.command.replace(/\{file\}/g, `"${file}"`);
      subject = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', line], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } else if (findSignTool(env)) {
      const tool = findSignTool(env);
      log(`   using ${tool}`);
      execFileSync(tool, signToolArgs(file, config), { stdio: ['ignore', 'pipe', 'pipe'] });
    } else {
      log('   signtool.exe was not found — falling back to PowerShell.');
      log('   PowerShell cannot sign a single-file app this large, so install the');
      log('   Windows SDK signing tools (or set SLIDESMITH_SIGNTOOL) for a signed build.');
      subject = powershell(signScript(file, config));
    }
    const check = verifyFile(file);
    log(`   signed as ${check.subject || subject || PUBLISHER}`);
    log(`   signature status: ${check.status}`);
    return { signed: check.status === 'Valid', status: check.status, subject: check.subject, publisher: PUBLISHER };
  } catch (error) {
    const detail = String(error.stderr || error.message || error).trim();
    if (config.required) throw new Error(`signing failed: ${detail}`);
    log(`   signing skipped: ${detail}`);
    return { signed: false, reason: 'signing-failed', detail, publisher: PUBLISHER };
  }
}

/** Command-line use: `node scripts/sign-exe.mjs build/Slidesmith.exe`. */
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const target = process.argv[2] || path.join('build', process.platform === 'win32' ? 'Slidesmith.exe' : 'Slidesmith');
  const result = await signFile(path.resolve(target));
  console.log('');
  if (result.signed) console.log(`Signed ${target} — publisher: ${result.subject}`);
  else console.log(`Left ${target} unsigned (${result.reason}).`);
  process.exitCode = result.signed || !signingConfig(process.env).required ? 0 : 1;
}

export function verifyFile(file) {
  const output = powershell(`$s = Get-AuthenticodeSignature -FilePath ${psQuote(file)}
$subject = if ($s.SignerCertificate) { $s.SignerCertificate.Subject } else { '' }
Write-Output ("{0}|{1}" -f $s.Status, $subject)`);
  const [status, subject = ''] = output.split('|');
  return { status, subject };
}
