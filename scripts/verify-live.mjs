/**
 * Live end-to-end verification: real browser, real Supabase.
 * Drives login → order entry (every control) → send → kitchen → orders page,
 * verifying rows in the live DB after each write. Tablet viewport throughout.
 *
 *   node scripts/verify-live.mjs
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5173';
const OUT = '/tmp';
const EMAIL = process.env.VINO_EMAIL || 'admin@vinovino.app';
const PASSWORD = process.env.VINO_PASSWORD || 'vinovino';

// Supabase REST creds from .env for row verification
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const SB_URL = env.VITE_SUPABASE_URL;
const SB_KEY = env.VITE_SUPABASE_ANON_KEY;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const steps = [];
const pageErrors = [];
let shotN = 0;

function log(ok, name, info = '') {
  steps.push({ ok, name, info });
  console.log(`${ok ? 'OK ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await browser.newPage();
// budget tablet, landscape: 1280x800 CSS px
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
p.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
p.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`); });

async function shot(name) {
  shotN++;
  const path = `${OUT}/live-${String(shotN).padStart(2, '0')}-${name}.png`;
  await p.screenshot({ path });
  return path;
}

async function clickByText(selector, text) {
  return p.evaluate(
    (sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(t));
      if (el) { el.click(); return true; }
      return false;
    },
    selector,
    text
  );
}

let accessToken = null;
async function rest(pathq) {
  const res = await fetch(`${SB_URL}/rest/v1/${pathq}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${accessToken}` },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

try {
  // ---------- 1. login ----------
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('input[type=email]', { timeout: 8000 });
  await shot('login');
  await p.type('input[type=email]', EMAIL);
  await p.type('input[type=password]', PASSWORD);
  await p.keyboard.press('Enter');
  const loggedIn = await Promise.race([
    p.waitForSelector('.topbar', { timeout: 10000 }).then(() => true),
    p.waitForSelector('.login__error, [class*=error]', { timeout: 10000 }).then(() => false),
  ]).catch(() => false);
  if (!loggedIn) {
    const err = await p.evaluate(() => document.querySelector('.login__error, [class*=error]')?.textContent ?? '(no error text)');
    log(false, 'login', `credentials rejected: ${err}`);
    await shot('login-failed');
    throw new Error('LOGIN_BLOCKED');
  }
  log(true, 'login', `as ${EMAIL}`);
  accessToken = await p.evaluate(() => {
    const k = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    return k ? JSON.parse(localStorage.getItem(k)).access_token : null;
  });
  log(!!accessToken, 'session token captured');

  // ---------- 2. tablet layout measurements ----------
  await p.waitForSelector('.ticket');
  await sleep(800);
  const layout = await p.evaluate(() => {
    const t = document.querySelector('.ticket').getBoundingClientRect();
    const lines = document.querySelector('.lines');
    const send = document.querySelector('.btn--send').getBoundingClientRect();
    return {
      ticketW: Math.round(t.width),
      linesH: Math.round(lines.getBoundingClientRect().height),
      sendVisible: send.bottom <= window.innerHeight && send.width > 0,
      vw: window.innerWidth, vh: window.innerHeight,
    };
  });
  log(layout.ticketW >= 330, 'ticket panel width on 1280x800', `${layout.ticketW}px, lines area ${layout.linesH}px, send button visible: ${layout.sendVisible}`);
  await shot('entry-empty');

  // ---------- 3. add items: quick-add, variant popover, pizza builder ----------
  await p.waitForSelector('.item');
  // quick add on first item of a non-pizza category if any; try each category
  const cats = await p.$$eval('.cats .cat', (els) => els.map((e) => e.textContent.trim()));
  log(cats.length > 0, 'categories rendered from live menu', cats.join(' | '));

  // pizza via builder: first category is pizzas by default
  await p.click('.item');
  const builderOpen = await p.waitForSelector('.builder', { timeout: 5000 }).then(() => true).catch(() => false);
  if (builderOpen) {
    await shot('builder');
    // add first topping if picker exists
    await clickByText('.builder__picker button', '').catch(() => {});
    await clickByText('.btn--add', 'הוסף להזמנה');
    await p.waitForSelector('.line', { timeout: 5000 });
    log(true, 'pizza builder → add to order');
  } else {
    // item added directly or variant popover
    log(false, 'pizza builder did not open on first item tap');
  }

  // find a category with simple/variant items (drinks etc.)
  for (const catName of cats.slice(1)) {
    await clickByText('.cats .cat', catName);
    await sleep(400);
    const hasAdd = await p.$('.item__add');
    if (hasAdd) {
      await p.click('.item__add');
      await sleep(400);
      const popover = await p.$('.popover');
      if (popover) {
        await shot('variant-popover');
        await p.click('.popover .chip');
        log(true, `variant popover flow (${catName})`);
      } else {
        log(true, `quick-add flow (${catName})`);
      }
      break;
    }
  }
  await sleep(400);
  await shot('entry-two-lines');

  // ---------- 4. line controls: qty +/-, edit, remove + undo ----------
  const qtyBefore = await p.$eval('.line .stepper span', (e) => e.textContent.trim());
  await p.click('.line button[aria-label="הוסף"]');
  await sleep(300);
  const qtyAfter = await p.$eval('.line .stepper span', (e) => e.textContent.trim());
  log(Number(qtyAfter) === Number(qtyBefore) + 1, 'stepper + increments', `${qtyBefore} → ${qtyAfter}`);
  await p.click('.line button[aria-label="הפחת"]');
  await sleep(300);
  const qtyBack = await p.$eval('.line .stepper span', (e) => e.textContent.trim());
  log(Number(qtyBack) === Number(qtyBefore), 'stepper − decrements', `${qtyAfter} → ${qtyBack}`);

  // edit first line → builder opens in edit mode → update
  await p.click('.line button[aria-label="ערוך"]');
  const editOpen = await p.waitForSelector('.builder', { timeout: 4000 }).then(() => true).catch(() => false);
  if (editOpen) {
    await clickByText('.btn--add', 'עדכן');
    await sleep(400);
  }
  log(editOpen, 'edit line reopens builder');

  // remove + undo
  const linesBefore = (await p.$$('.line')).length;
  await p.click('.line button[aria-label="מחק"]');
  await sleep(400);
  const linesAfterRemove = (await p.$$('.line')).length;
  const undoShown = await clickByText('.toast button', 'בטל');
  await sleep(400);
  const linesAfterUndo = (await p.$$('.line')).length;
  log(linesAfterRemove === linesBefore - 1 && undoShown && linesAfterUndo === linesBefore,
    'remove line + undo toast restores it', `${linesBefore} → ${linesAfterRemove} → ${linesAfterUndo}`);

  // ---------- 5. customer fields + toggles ----------
  await p.type('.field--phone input', '0500000123');
  await p.type('.customer__row .field:not(.field--phone) input', 'בדיקת קלוד');
  await clickByText('.seg button', 'משלוח');
  await sleep(300);
  const addrInput = await p.$('input[placeholder="כתובת"]');
  log(!!addrInput, 'delivery toggle reveals address field');
  if (addrInput) await p.type('input[placeholder="כתובת"]', 'הרצל 1');
  await clickByText('.seg button', 'שולם');
  await sleep(200);
  const paidActive = await p.evaluate(() =>
    [...document.querySelectorAll('.seg button')].some((b) => b.textContent.trim() === 'שולם' && b.className.includes('is-active')));
  log(paidActive, 'payment toggle שולם activates');
  await shot('entry-filled');

  // lines visibility (the original complaint)
  const vis = await p.evaluate(() => {
    const l = document.querySelector('.lines');
    return { clientH: l.clientHeight, scrollH: l.scrollHeight, count: document.querySelectorAll('.line').length };
  });
  log(vis.clientH > 150, 'order lines area has real height', `${vis.count} lines, visible ${vis.clientH}px of ${vis.scrollH}px content`);

  // ---------- 6. send to kitchen (live DB write) ----------
  const orderNumBefore = await p.$eval('[data-testid=order-number]', (e) => e.textContent.trim());
  await p.click('.btn--send');
  const toastText = await p.waitForSelector('.toast', { timeout: 10000 })
    .then(() => p.$eval('.toast', (e) => e.textContent))
    .catch(() => null);
  const sent = toastText?.includes('נשלחה למטבח');
  log(!!sent, 'send to kitchen', toastText ?? 'no toast');
  await shot('after-send');
  const m = toastText?.match(/#(\d+)/);
  const sentNumber = m ? Number(m[1]) : null;

  // verify in live DB
  await sleep(1200);
  const db = await rest(`orders?select=id,daily_number,status,total,customer_name,customer_phone,address,type,payment_status&order=created_at.desc&limit=1`);
  const row = db.body?.[0];
  const dbOk = row && row.customer_phone === '0500000123' && row.status === 'new';
  log(!!dbOk, 'live DB row created', row ? `daily#${row.daily_number} ${row.type} total=${row.total} name=${row.customer_name} status=${row.status}` : `REST ${db.status}: ${JSON.stringify(db.body)?.slice(0, 200)}`);
  const orderId = row?.id;

  // order lines persisted too?
  if (orderId) {
    const dl = await rest(`order_lines?select=name_snapshot,qty,line_total&order_id=eq.${orderId}`);
    log(Array.isArray(dl.body) && dl.body.length >= 1, 'live DB order_lines rows', JSON.stringify(dl.body)?.slice(0, 200));
  }

  // ticket reset after send
  const resetOk = await p.evaluate(() => document.querySelectorAll('.line').length === 0);
  log(resetOk, 'ticket resets for next order', `number now ${await p.$eval('[data-testid=order-number]', (e) => e.textContent.trim())} (was ${orderNumBefore})`);

  // ---------- 7. kitchen board ----------
  await p.goto(`${BASE}/kitchen`, { waitUntil: 'networkidle0' });
  const kcard = await p.waitForSelector('.kcard', { timeout: 10000 }).then(() => true).catch(() => false);
  await shot('kitchen');
  const kHasOrder = kcard && sentNumber !== null && await p.evaluate((n) =>
    [...document.querySelectorAll('.kcard__num')].some((e) => e.textContent.includes(String(n).padStart(2, '0'))), sentNumber);
  log(!!kHasOrder, 'order appears on kitchen board', `#${sentNumber}`);
  if (kHasOrder) {
    await clickByText('.kbtn--start', 'התחל');
    await sleep(800);
    const prep = await p.evaluate(() => !!document.querySelector('.kcard--prep, .kbadge'));
    log(prep, 'kitchen: start preparing');
    await clickByText('.kbtn--ready', '');
    await sleep(800);
    await shot('kitchen-after');
    if (orderId) {
      const st = await rest(`orders?select=status&id=eq.${orderId}`);
      log(st.body?.[0]?.status === 'ready', 'live DB status advanced by kitchen', `status=${st.body?.[0]?.status}`);
    }
  }

  // ---------- 8. orders page: filters + cancel (cleanup) ----------
  await p.goto(`${BASE}/orders`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.orow, .olist__empty', { timeout: 10000 });
  await shot('orders');
  const hasRow = sentNumber !== null && await p.evaluate((n) =>
    [...document.querySelectorAll('.orow__num')].some((e) => e.textContent.includes(String(n).padStart(2, '0'))), sentNumber);
  log(!!hasRow, 'order listed on orders page', `#${sentNumber}`);

  for (const f of ['הכל', 'בוטלו', 'פעילות']) {
    const ok = await clickByText('.otop__filters button', f);
    await sleep(300);
    log(ok, `orders filter: ${f}`);
  }

  // cancel our test order (also cleans up)
  if (hasRow) {
    await p.evaluate((n) => {
      const row = [...document.querySelectorAll('.orow')].find((r) => r.querySelector('.orow__num')?.textContent.includes(String(n).padStart(2, '0')));
      row?.querySelector('.orow__cancel')?.click();
    }, sentNumber);
    await sleep(300);
    await clickByText('.btn--danger', 'כן, בטל');
    await sleep(1000);
    await shot('orders-after-cancel');
    if (orderId) {
      const st = await rest(`orders?select=status&id=eq.${orderId}`);
      log(st.body?.[0]?.status === 'cancelled', 'cancel flow → live DB status cancelled', `status=${st.body?.[0]?.status}`);
    }
  }

  // ---------- 9. portrait tablet layout ----------
  await p.setViewport({ width: 800, height: 1280, deviceScaleFactor: 1 });
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await sleep(800);
  const portrait = await p.evaluate(() => {
    const t = document.querySelector('.ticket')?.getBoundingClientRect();
    const s = document.querySelector('.btn--send')?.getBoundingClientRect();
    return t && s ? { ticketW: Math.round(t.width), sideBySide: t.width < window.innerWidth - 100, sendVisible: s.bottom <= window.innerHeight } : null;
  });
  log(!!portrait && portrait.sideBySide && portrait.sendVisible, 'portrait 800x1280: two panes + send visible', JSON.stringify(portrait));
  await shot('portrait');
} catch (e) {
  if (e.message !== 'LOGIN_BLOCKED') log(false, 'script error', e.message);
} finally {
  await browser.close();
}

console.log('\n--- summary ---');
console.log(`${steps.filter((s) => s.ok).length}/${steps.length} steps ok`);
if (pageErrors.length) console.log(`PAGE ERRORS:\n${[...new Set(pageErrors)].join('\n')}`);
else console.log('no page errors');
