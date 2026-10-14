import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
const jobs = [
  ['_build/fav-tile.svg', 'favicon/favicon-16.png', 16],
  ['_build/fav-tile.svg', 'favicon/favicon-32.png', 32],
  ['_build/fav-tile.svg', '_build/favicon-48.png', 48],
  ['_build/apple-touch-icon.svg', 'favicon/apple-touch-icon.png', 180],
  ['_build/icon-192.svg', 'favicon/icon-192.png', 192],
  ['_build/icon-512.svg', 'favicon/icon-512.png', 512],
  ['_build/icon-maskable-512.svg', 'favicon/icon-maskable-512.png', 512],
  ['_build/og-image.svg', 'social/og-image.png', 1200],
  ['_build/preview.svg', '_build/preview.png', 1600],
];
for (const [src, dst, w] of jobs) {
  const svg = fs.readFileSync(path.join(out, src));
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng();
  fs.mkdirSync(path.dirname(path.join(out, dst)), { recursive: true });
  fs.writeFileSync(path.join(out, dst), png);
  console.log('ok', dst, w);
}
