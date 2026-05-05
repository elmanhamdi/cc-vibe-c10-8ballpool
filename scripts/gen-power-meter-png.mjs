/**
 * One-off: rasterize power-meter tracks to PNG (requires sharp: npm i -D sharp).
 */
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public/ui/power-meter');
mkdirSync(outDir, { recursive: true });

const mutedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="520" viewBox="0 0 80 520">
  <defs>
    <linearGradient id="mutedFill" x1="40" y1="0" x2="40" y2="520" gradientUnits="userSpaceOnUse">
      <stop stop-color="#7d8188"/>
      <stop offset="0.45" stop-color="#5f636a"/>
      <stop offset="1" stop-color="#4a4e56"/>
    </linearGradient>
  </defs>
  <rect width="80" height="520" rx="26" fill="url(#mutedFill)"/>
  <g opacity="0.22" stroke="#000" stroke-width="1">
    <line x1="6" y1="104" x2="74" y2="104"/>
    <line x1="6" y1="208" x2="74" y2="208"/>
    <line x1="6" y1="312" x2="74" y2="312"/>
    <line x1="6" y1="416" x2="74" y2="416"/>
  </g>
</svg>`;

const spectrumSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="520" viewBox="0 0 80 520">
  <defs>
    <linearGradient id="spectrumFill" x1="40" y1="0" x2="40" y2="520" gradientUnits="userSpaceOnUse">
      <stop stop-color="#aec050"/>
      <stop offset="0.18" stop-color="#d8c848"/>
      <stop offset="0.42" stop-color="#e8a838"/>
      <stop offset="0.68" stop-color="#e05828"/>
      <stop offset="1" stop-color="#6a1410"/>
    </linearGradient>
  </defs>
  <rect width="80" height="520" rx="26" fill="url(#spectrumFill)"/>
  <g opacity="0.28" stroke="#000" stroke-width="1">
    <line x1="6" y1="104" x2="74" y2="104"/>
    <line x1="6" y1="208" x2="74" y2="208"/>
    <line x1="6" y1="312" x2="74" y2="312"/>
    <line x1="6" y1="416" x2="74" y2="416"/>
  </g>
</svg>`;

const w = 160;
const h = 1040;

await sharp(Buffer.from(mutedSvg)).resize(w, h).png({ compressionLevel: 9 }).toFile(join(outDir, 'track-muted.png'));

await sharp(Buffer.from(spectrumSvg)).resize(w, h).png({ compressionLevel: 9 }).toFile(join(outDir, 'track-spectrum.png'));

console.log('Wrote track-muted.png and track-spectrum.png @', w, 'x', h);
