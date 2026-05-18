import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const manifestPath = path.join(repoRoot, 'src', 'assets', 'AssetManifest.ts');
const publicRoot = path.join(repoRoot, 'public');
const strict = process.argv.includes('--strict');

const text = fs.readFileSync(manifestPath, 'utf8');
const urls = new Set();

for (const match of text.matchAll(/browserUrl:\s*'([^']+)'/g)) {
  urls.add(match[1]);
}
for (const match of text.matchAll(/browserUrl:\s*`([^`$]+)`/g)) {
  urls.add(match[1]);
}

const tableGlbMatch = text.match(/const\s+tableGlb\s*=\s*'([^']+)'/);
if (tableGlbMatch) urls.add(tableGlbMatch[1]);

for (let n = 1; n <= 15; n += 1) {
  urls.add(`textures/balls/${n}.jpg`);
  urls.add(`ui/balls/${n}.png`);
}

const templateWhitelist = [
  /^template:\/\/ball\.(cue|eight|solid\.\d+|stripe\.\d+)$/,
  /^template:\/\/vfx\.cueStick$/,
  /^template:\/\/line\.(aim|ghostObject|ghostCue|debug)$/,
  /^template:\/\/char\.(tungPlaceholder|tortaPlaceholder|gattottoPlaceholder)$/,
];

const missing = [];
const invalidTemplateUrls = [];

for (const url of urls) {
  if (url.startsWith('template://')) {
    const valid = templateWhitelist.some((rx) => rx.test(url));
    if (!valid) invalidTemplateUrls.push(url);
    continue;
  }
  if (/^(https?:|data:)/i.test(url)) continue;

  const normalized = url.replace(/^[./]+/, '');
  const absPath = path.resolve(publicRoot, normalized);
  if (!absPath.startsWith(publicRoot)) {
    missing.push(`${url} (resolves outside public/)`);
    continue;
  }
  if (!fs.existsSync(absPath)) missing.push(`${url} -> public/${normalized}`);
}

if (invalidTemplateUrls.length || (strict && missing.length)) {
  if (invalidTemplateUrls.length) {
    console.error('Invalid template:// URLs (not in whitelist):');
    for (const url of invalidTemplateUrls) console.error(` - ${url}`);
  }
  if (strict && missing.length) {
    console.error('Missing manifest assets:');
    for (const item of missing) console.error(` - ${item}`);
  }
  process.exit(1);
}

if (missing.length) {
  console.warn('Manifest check warning: missing browserUrl assets (non-strict mode):');
  for (const item of missing) console.warn(` - ${item}`);
}

console.log(`Asset manifest validation passed (${urls.size} browserUrl entries).`);
