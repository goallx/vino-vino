import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5173';
const OUT = '/tmp';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox'],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

async function page(auth = true) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1.5 });
  if (auth) {
    await p.evaluateOnNewDocument(() => {
      localStorage.setItem('vino:auth', JSON.stringify({ username: 'admin' }));
    });
  }
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return p;
}

// login screen (unauthenticated)
{
  const p = await page(false);
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await sleep(600);
  await p.screenshot({ path: `${OUT}/v-login.png` });
  await p.close();
}

// order entry with demo order seeded
{
  const p = await page();
  await p.goto(`${BASE}/?demo=order`, { waitUntil: 'networkidle0' });
  await sleep(900);
  await p.screenshot({ path: `${OUT}/v-entry.png` });
  // deals tab + apply coupon
  await p.click('.cat--deals');
  await p.waitForSelector('.coupon');
  await sleep(500);
  await p.click('.coupon');
  await p.waitForSelector('.disc');
  await sleep(600);
  await p.screenshot({ path: `${OUT}/v-entry-deal.png` });
  await p.close();
}

// pizza builder demo
{
  const p = await page();
  await p.goto(`${BASE}/?demo=builder`, { waitUntil: 'networkidle0' });
  await sleep(1100);
  await p.screenshot({ path: `${OUT}/v-builder.png` });
  await p.close();
}

// kitchen
{
  const p = await page();
  await p.goto(`${BASE}/kitchen?demo=1`, { waitUntil: 'networkidle0' });
  await sleep(900);
  await p.screenshot({ path: `${OUT}/v-kitchen.png` });
  await p.close();
}

// reports
{
  const p = await page();
  await p.goto(`${BASE}/reports?demo=1`, { waitUntil: 'networkidle0' });
  await sleep(900);
  await p.screenshot({ path: `${OUT}/v-reports.png` });
  await p.close();
}

// orders
{
  const p = await page();
  await p.goto(`${BASE}/orders?demo=1`, { waitUntil: 'networkidle0' });
  await sleep(900);
  await p.screenshot({ path: `${OUT}/v-orders.png` });
  await p.close();
}

// deals admin
{
  const p = await page();
  await p.goto(`${BASE}/deals`, { waitUntil: 'networkidle0' });
  await sleep(700);
  await p.screenshot({ path: `${OUT}/v-deals.png` });
  await p.close();
}

await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
