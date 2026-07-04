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

// 1) order entry → deals tab → apply a coupon
{
  const p = await page(1024, 768);
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.cat--deals');
  await p.click('.cat--deals');
  await p.waitForSelector('.coupon');
  await sleep(500);
  await p.screenshot({ path: `${OUT}/vino-deals-tab.png` });

  await p.click('.coupon'); // apply first bundle
  await p.waitForSelector('.disc');
  await sleep(700);
  await p.screenshot({ path: `${OUT}/vino-ticket-discount.png` });
  await p.close();
}

// 2) /deals admin list + editor
{
  const p = await page(1024, 768);
  await p.goto(`${BASE}/deals`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.dcard');
  await sleep(500);
  await p.screenshot({ path: `${OUT}/vino-deals-admin.png` });

  await p.click('.dtop__new');
  await p.waitForSelector('.deditor');
  await sleep(600);
  await p.screenshot({ path: `${OUT}/vino-deals-editor.png` });
  await p.close();
}

await browser.close();
console.log('done');
