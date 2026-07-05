/**
 * One-time migration: upload the repo's public/menu/*.jpg photos to the
 * `menu-photos` Storage bucket and set products.photo_url — after which the
 * image files can be deleted from the repo.
 *
 * Only non-pizza products get photo_url set: pizzas render the SVG
 * illustration unless the owner explicitly uploads a photo in the admin.
 *
 *   VINO_EMAIL=... VINO_PASSWORD=... node scripts/migrate-photos.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';

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
const URL_ = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;

const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then((r) => r.json());
if (!auth.access_token) {
  console.error('login failed', auth);
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${auth.access_token}` };

const products = await fetch(`${URL_}/rest/v1/products?select=id,is_pizza`, { headers: H }).then((r) => r.json());
const byId = Object.fromEntries(products.map((p) => [p.id, p]));

const dir = new URL('../public/menu/', import.meta.url);
let uploaded = 0, linked = 0, skipped = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.jpg'))) {
  const productId = file.replace(/\.jpg$/, '');
  const product = byId[productId];
  if (!product) { console.log(`skip ${file} — no matching product`); skipped++; continue; }

  const body = readFileSync(new URL(file, dir));
  const up = await fetch(`${URL_}/storage/v1/object/menu-photos/${productId}.jpg`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' },
    body,
  });
  if (!up.ok) { console.log(`FAIL upload ${file}: ${up.status} ${await up.text()}`); continue; }
  uploaded++;

  if (product.is_pizza) { skipped++; continue; } // art stays the pizza look

  const publicUrl = `${URL_}/storage/v1/object/public/menu-photos/${productId}.jpg`;
  const patch = await fetch(`${URL_}/rest/v1/products?id=eq.${productId}`, {
    method: 'PATCH',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo_url: publicUrl }),
  });
  if (patch.ok) linked++;
  else console.log(`FAIL photo_url ${productId}: ${patch.status}`);
}

console.log(`uploaded ${uploaded} images, linked photo_url on ${linked} products, ${skipped} pizzas/unmatched left art-only`);
