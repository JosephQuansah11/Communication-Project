/**
 * Create a self-signed code-signing certificate for the app's publisher.
 *
 * A certificate is what gives the executable a publisher: Windows reads the name
 * out of the signature, so `QuandrionSlideMaster.exe` signed with a certificate whose subject
 * is `CN=josephQuansah11` shows josephQuansah11 as its publisher.
 *
 * A self-signed certificate is enough for that name to appear, and it stops the
 * "unverified publisher" wording — but Smart App Control also wants the certificate
 * to chain to a trusted authority and the file to have reputation, so a self-signed
 * build may still be blocked on a machine with Smart App Control switched on. The
 * only complete answer there is a certificate from a real authority (see README).
 *
 * Usage: node scripts/make-signing-cert.mjs [publisher] [password]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PUBLISHER, psQuote } from './sign-exe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publisher = process.argv[2] || PUBLISHER;
const password = process.argv[3] || 'quandrion';
const certDir = path.join(root, 'build', 'certs');
const pfxPath = path.join(certDir, `${publisher.replace(/[^a-z0-9._-]+/gi, '-')}.pfx`);

fs.mkdirSync(certDir, { recursive: true });

console.log(`Creating a code-signing certificate for "${publisher}"…`);
const script = `$ErrorActionPreference = 'Stop'
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject ${psQuote(`CN=${publisher}`)} -FriendlyName ${psQuote(
  `${publisher} code signing`
)} -CertStoreLocation 'Cert:\\CurrentUser\\My' -KeyUsage DigitalSignature -KeyAlgorithm RSA -KeyLength 3072 -NotAfter (Get-Date).AddYears(3) -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3','2.5.29.19={text}false')
$secure = ConvertTo-SecureString -String ${psQuote(password)} -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath ${psQuote(pfxPath)} -Password $secure | Out-Null
Write-Output $cert.Thumbprint`;

let thumbprint = '';
try {
  thumbprint = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
} catch (error) {
  console.error('Could not create the certificate:');
  console.error(String(error.stderr || error.message).trim());
  process.exit(1);
}

console.log('');
console.log('  ==============================================================');
console.log(`   Certificate ready for ${publisher}`);
console.log('  ==============================================================');
console.log(`   file        ${path.relative(root, pfxPath)}`);
console.log(`   thumbprint  ${thumbprint}`);
console.log(`   password    ${password}`);
console.log('');
console.log('   Sign the packaged app with it:');
console.log(`     $env:SLIDESMITH_CERT_PFX="${pfxPath}"`);
console.log(`     $env:SLIDESMITH_CERT_PASSWORD="${password}"`);
console.log('     npm run build:exe        # signs the exe as it builds');
console.log('     npm run sign:exe         # or sign an existing build/QuandrionSlideMaster.exe');
console.log('');
console.log('   Trust it on your own machine so Windows stops calling it unverified:');
console.log(`     Import-Certificate -FilePath (Export-Certificate -Cert (Get-Item Cert:\\CurrentUser\\My\\${thumbprint}) -FilePath "$env:TEMP\\${publisher}.cer") -CertStoreLocation Cert:\\LocalMachine\\Root`);
console.log('');
