/** Isolate the kitchen start/ready flow: seed one order via REST, click through, watch network. */
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
const tok = auth.access_token;
const H = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

// seed a probe order
const ins = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/orders`, {
  method: 'POST',
  headers: { ...H, Prefer: 'return=representation' },
  body: JSON.stringify({
    type: 'pickup', status: 'new', channel: 'phone', payment_status: 'unpaid', payment_method: 'cash',
    subtotal: 5000, discount: 0, total: 5000, customer_name: 'PROBE',
    lines: [{ id: 'l1', productId: 'd_coke', name: 'קולה', qty: 1, unitPrice: 5000, isSplit: false, parts: [] }],
  }),
}).then((r) => r.json());
const probe = ins[0];
console.log('seeded probe order', probe.id, 'daily#', probe.daily_number);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await browser.newPage();
await p.setViewport({ width: 1280, height: 800 });
p.on('console', (m) => console.log(`[page ${m.type()}]`, m.text().slice(0, 200)));
p.on('response', (r) => {
  if (r.url().includes('/rest/v1/orders') && r.request().method() !== 'GET')
    console.log(`[net] ${r.request().method()} ${r.url().slice(0, 120)} → ${r.status()}`);
});

// login
await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
await p.type('input[type=email]', EMAIL);
await p.type('input[type=password]', PASSWORD);
await p.keyboard.press('Enter');
await p.waitForSelector('.topbar', { timeout: 10000 });

// kitchen
await p.goto(`${BASE}/kitchen`, { waitUntil: 'networkidle0' });
await p.waitForSelector('.kcard', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 1500)); // let realtime refetch settle

const cardInfo = await p.evaluate(() => {
  const cards = [...document.querySelectorAll('.kcard')];
  return cards.map((c) => ({
    num: c.querySelector('.kcard__num')?.textContent,
    hasStart: !!c.querySelector('.kbtn--start'),
    startText: c.querySelector('.kbtn--start')?.textContent,
  }));
});
console.log('cards on board:', JSON.stringify(cardInfo));

const clicked = await p.evaluate(() => {
  const btn = document.querySelector('.kbtn--start');
  if (!btn) return false;
  btn.click();
  return true;
});
console.log('clicked start:', clicked);
await new Promise((r) => setTimeout(r, 2500));

const st1 = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/orders?select=status&id=eq.${probe.id}`, { headers: H }).then((r) => r.json());
console.log('DB status after start:', st1[0]?.status);

const clickedReady = await p.evaluate(() => {
  const btn = document.querySelector('.kbtn--ready');
  if (!btn) return false;
  btn.click();
  return true;
});
console.log('clicked ready:', clickedReady);
await new Promise((r) => setTimeout(r, 2500));

const st2 = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/orders?select=status&id=eq.${probe.id}`, { headers: H }).then((r) => r.json());
console.log('DB status after ready:', st2[0]?.status);

// cleanup probe order
await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/orders?id=eq.${probe.id}`, { method: 'DELETE', headers: H });
console.log('probe order deleted');
await browser.close();
