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

async function page() {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1.5 });
  await p.evaluateOnNewDocument(() => {
    localStorage.setItem('vino:auth', JSON.stringify({ username: 'admin' }));
  });
  return p;
}

// menu tab via /menu deep link
{
  const p = await page();
  await p.goto(`${BASE}/menu`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.mcard');
  await sleep(600);
  await p.screenshot({ path: `${OUT}/m-admin.png` });

  // hide the first item to show the off state
  await p.click('.mcard .dcard__toggle');
  await sleep(400);
  await p.screenshot({ path: `${OUT}/m-admin-hidden.png` });

  // open the editor for a new item
  await p.click('.dtop__new');
  await p.waitForSelector('.deditor');
  await p.type('.deditor input[type="text"]', 'קלצונה');
  await p.type('.dprice input', '45');
  await sleep(500);
  await p.screenshot({ path: `${OUT}/m-editor.png` });
  await p.close();
}

// entry menu should not offer the hidden item (vino:menu persisted above? new page = same origin storage)
{
  const p = await page();
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await sleep(800);
  await p.screenshot({ path: `${OUT}/m-entry-after-hide.png` });
  await p.close();
}

await browser.close();
console.log('done');
