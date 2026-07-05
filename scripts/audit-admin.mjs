/**
 * Live audit of the admin/reports surfaces: reports vs DB truth, product
 * create→appears-on-menu→delete round-trip, bundle create→delete round-trip,
 * settings modal. Complements verify-live.mjs (entry/kitchen/orders flows).
 *
 *   VINO_EMAIL=... VINO_PASSWORD=... node scripts/audit-admin.mjs
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5173';
const EMAIL = process.env.VINO_EMAIL;
const PASSWORD = process.env.VINO_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('set VINO_EMAIL and VINO_PASSWORD');
  process.exit(1);
}
const TEST_PRODUCT = 'בדיקת-אודיט (זמני)';
const TEST_BUNDLE = 'מבצע-אודיט (זמני)';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const auth = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then((r) => r.json());
const H = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' };
const rest = (q, init) => fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${q}`, { headers: H, ...init }).then((r) => r.json().catch(() => null));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const steps = [];
const log = (ok, name, info = '') => {
  steps.push(ok);
  console.log(`${ok ? 'OK ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`);
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await browser.newPage();
await p.setViewport({ width: 1280, height: 800 });
p.on('dialog', (d) => d.accept()); // window.confirm on deletes
const pageErrors = [];
p.on('pageerror', (e) => pageErrors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

const clickByText = (sel, t) =>
  p.evaluate((s, x) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.textContent.includes(x));
    if (el) { el.click(); return true; }
    return false;
  }, sel, t);

try {
  // login
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await p.type('input[type=email]', EMAIL);
  await p.type('input[type=password]', PASSWORD);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.topbar', { timeout: 10000 });
  log(true, 'login');

  // ---------- reports vs DB truth ----------
  await p.goto(`${BASE}/reports`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.stat__value', { timeout: 10000 });
  await sleep(1200);
  const stats = await p.evaluate(() =>
    [...document.querySelectorAll('.stat')].map((s) => ({
      label: s.querySelector('.stat__label')?.textContent.trim(),
      value: s.querySelector('.stat__value')?.textContent.trim(),
    }))
  );
  const today = new Date().toLocaleDateString('en-CA');
  const rows = await rest(`orders?select=total,status&order_day=eq.${today}`);
  const live = rows.filter((o) => o.status !== 'cancelled');
  const dbRevenue = live.reduce((s, o) => s + o.total, 0);
  const revenueStat = stats.find((s) => s.label?.includes('הכנסות') || s.label?.includes('פדיון'));
  const countStat = stats.find((s) => s.label?.includes('הזמנות'));
  const revenueShown = Number((revenueStat?.value ?? '').replace(/[^\d]/g, ''));
  const countShown = Number((countStat?.value ?? '').replace(/[^\d]/g, ''));
  log(revenueShown === Math.round(dbRevenue / 100), 'reports revenue matches DB',
    `shown ${revenueStat?.value} vs DB ₪${dbRevenue / 100} (${live.length} live orders)`);
  log(countShown === live.length, 'reports order count matches DB', `shown ${countStat?.value} vs DB ${live.length}`);
  await p.screenshot({ path: '/tmp/audit-reports.png' });

  // ---------- product round-trip: create → DB → entry menu → delete ----------
  await p.goto(`${BASE}/menu`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.dtop__new', { timeout: 10000 });
  await clickByText('.dtop__new', 'פריט חדש');
  await p.waitForSelector('.scrim input[type=text]', { timeout: 5000 });
  await p.type('.scrim input[type=text]', TEST_PRODUCT);
  await p.evaluate(() => {
    const price = document.querySelector('.scrim input[inputmode=numeric]');
    if (price) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(price, '10');
      price.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await clickByText('.scrim .btn--send', 'שמור');
  await sleep(1500);
  const dbProd = await rest(`products?select=id,name,base_price,active&name=eq.${encodeURIComponent(TEST_PRODUCT)}`);
  log(dbProd?.length === 1 && dbProd[0].base_price === 1000, 'new product row in live DB',
    JSON.stringify(dbProd?.[0] ?? null));
  const prodId = dbProd?.[0]?.id;

  // appears on the order-entry menu?
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.item', { timeout: 10000 });
  await sleep(800);
  let found = false;
  const catCount = await p.$$eval('.cats .cat', (els) => els.length);
  for (let i = 0; i < catCount && !found; i++) {
    await p.evaluate((idx) => document.querySelectorAll('.cats .cat')[idx].click(), i);
    await sleep(250);
    found = await p.evaluate((name) =>
      [...document.querySelectorAll('.item__name')].some((e) => e.textContent.trim() === name), TEST_PRODUCT);
  }
  log(found, 'new product appears on order-entry menu');

  // delete it via admin UI (confirm dialog auto-accepted)
  await p.goto(`${BASE}/menu`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.mcard', { timeout: 10000 });
  const deleted = await p.evaluate((name) => {
    const card = [...document.querySelectorAll('.mcard')].find((c) => c.querySelector('.mcard__name')?.textContent.trim() === name);
    const btn = card?.querySelector('.dcard__del');
    if (btn) { btn.click(); return true; }
    return false;
  }, TEST_PRODUCT);
  await sleep(1500);
  const dbProdAfter = await rest(`products?select=id&name=eq.${encodeURIComponent(TEST_PRODUCT)}`);
  log(deleted && dbProdAfter?.length === 0, 'product deleted via UI → gone from live DB');
  if (prodId && dbProdAfter?.length) await rest(`products?id=eq.${prodId}`, { method: 'DELETE' }); // safety net

  // ---------- bundle round-trip ----------
  await p.goto(`${BASE}/deals`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.dtop__new', { timeout: 10000 });
  await clickByText('.dtop__new', 'מבצע חדש');
  await p.waitForSelector('.scrim input[type=text]', { timeout: 5000 });
  await p.type('.scrim input[type=text]', TEST_BUNDLE);
  // pick the first product from the item dropdown, then set the price
  await p.evaluate(() => {
    const sel = document.querySelector('.dadd select');
    const first = [...sel.options].find((o) => o.value);
    const setSel = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setSel.call(sel, first.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(300);
  await p.evaluate(() => {
    const price = document.querySelector('.deditor input[inputmode=numeric], .deditor input[type=number]');
    if (price) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(price, '50');
      price.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await clickByText('.scrim .btn--send', 'שמור');
  await sleep(1500);
  const dbBundle = await rest(`bundles?select=id,name,price,items&name=eq.${encodeURIComponent(TEST_BUNDLE)}`);
  log(dbBundle?.length === 1, 'new bundle row in live DB', JSON.stringify(dbBundle?.[0] ?? null)?.slice(0, 140));
  const bundleId = dbBundle?.[0]?.id;

  const bDeleted = await p.evaluate((name) => {
    const card = [...document.querySelectorAll('.dcard, .mcard')].find((c) => c.textContent.includes(name));
    const btn = card?.querySelector('.dcard__del');
    if (btn) { btn.click(); return true; }
    return false;
  }, TEST_BUNDLE);
  await sleep(1500);
  const dbBundleAfter = await rest(`bundles?select=id&name=eq.${encodeURIComponent(TEST_BUNDLE)}`);
  log(bDeleted && dbBundleAfter?.length === 0, 'bundle deleted via UI → gone from live DB');
  if (bundleId && dbBundleAfter?.length) await rest(`bundles?id=eq.${bundleId}`, { method: 'DELETE' }); // safety net

  // ---------- settings modal ----------
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.topbar', { timeout: 10000 });
  await clickByText('.topbar button', 'הגדרות');
  await sleep(600);
  const links = await p.$$eval('.srow', (els) => els.map((e) => e.getAttribute('href')).filter(Boolean));
  log(links.length >= 5, 'settings modal lists all screens', links.join(' '));
  await p.screenshot({ path: '/tmp/audit-settings.png' });
} catch (e) {
  log(false, 'script error', e.message);
} finally {
  await browser.close();
}

console.log('\n--- summary ---');
console.log(`${steps.filter(Boolean).length}/${steps.length} ok`);
console.log(pageErrors.length ? `PAGE ERRORS:\n${[...new Set(pageErrors)].join('\n').slice(0, 600)}` : 'no page errors');
