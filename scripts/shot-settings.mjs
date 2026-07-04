import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4317';
const OUT = '/tmp';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox'],
});

async function page(width, height) {
  const p = await browser.newPage();
  await p.setViewport({ width, height, deviceScaleFactor: 2 });
  // skip the auth gate (local fallback) before any app code runs
  await p.evaluateOnNewDocument(() => {
    localStorage.setItem('vino:auth', JSON.stringify({ username: 'admin' }));
  });
  return p;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// entry topbar (slimmed) → settings modal
{
  const p = await page(1024, 768);
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.topbar');
  await sleep(500);
  await p.screenshot({ path: `${OUT}/vino-topbar.png` });

  await p.click('.topbar__link--push');
  await p.waitForSelector('.settings');
  await sleep(700);
  await p.screenshot({ path: `${OUT}/vino-settings.png` });
  await p.close();
}

await browser.close();
console.log('done');
