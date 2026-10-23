// Packages the extension into dist/:
//   sankalpa-extension-<version>.zip  → Chrome Web Store upload, or unzip + "Load unpacked"
//   sankalpa-extension-<version>.crx  → signed package (Chrome only installs off-store .crx via enterprise policy)
// The signing key is kept in keys/ (never shipped, never shared); reuse it so updates keep the same extension ID.
// Run: npm run package
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../form-scanner/node_modules/playwright/index.mjs';

const ext = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
const SHIP = ['manifest.json', 'background.js', 'devtools.html', 'devtools.js', 'panel.html', 'panel.js', 'panel.css',
  'approve.html', 'approve.js', 'lib', 'content', 'icons'];

execFileSync('node', [join(ext, 'scripts', 'build.mjs')], { stdio: 'inherit' });

const dist = join(ext, 'dist');
const stage = join(dist, 'sankalpa-extension');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const f of SHIP) cpSync(join(ext, f), join(stage, f), { recursive: true });

const zip = join(dist, `sankalpa-extension-${version}.zip`);
rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-X', '-q', zip, '.', '-x', '.*'], { cwd: stage });
console.log(`zip: ${zip}`);

// .crx: let Chromium pack and sign it.
const keys = join(ext, 'keys');
const key = join(keys, 'sankalpa-extension.pem');
mkdirSync(keys, { recursive: true });
const args = [`--pack-extension=${stage}`, '--no-message-box'];
if (existsSync(key)) args.push(`--pack-extension-key=${key}`);
execFileSync(chromium.executablePath(), args, { stdio: 'ignore' });
if (!existsSync(key)) renameSync(`${stage}.pem`, key); // first run: keep the new key safe
renameSync(`${stage}.crx`, join(dist, `sankalpa-extension-${version}.crx`));
console.log(`crx: ${join(dist, `sankalpa-extension-${version}.crx`)} (key: ${key})`);
