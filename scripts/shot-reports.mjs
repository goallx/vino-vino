import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4317';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await browser.newPage();
await p.setViewport({ width: 1024, height: 1180, deviceScaleFactor: 2 });
await p.evaluateOnNewDocument(() => localStorage.setItem('vino:auth', JSON.stringify({ username: 'admin' })));
// ?demo seeds a believable day including two bundle-deal orders
await p.goto(`${BASE}/reports?demo=1`, { waitUntil: 'networkidle0' });
await p.waitForSelector('.card--deals');
await new Promise((r) => setTimeout(r, 1200));
await p.screenshot({ path: '/tmp/vino-reports-deals.png' });
await browser.close();
console.log('done');
