// Rasterizes public/favicon.svg into the PWA icon sizes.
//   node scripts/gen-icons.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const svg = readFileSync(join(PUB, 'favicon.svg'), 'utf8');

const targets = [
  { size: 512, file: 'pwa-512.png' },
  { size: 192, file: 'pwa-192.png' },
  { size: 180, file: 'apple-touch-icon.png' },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const { size, file } of targets) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(
    `<style>*{margin:0}</style><div style="width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>`,
  );
  await page.screenshot({ path: join(PUB, file) });
  console.log(`wrote public/${file}`);
}
await browser.close();
