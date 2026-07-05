import { supabase } from './supabase';

// Product photos live in the public `menu-photos` bucket, one object per
// product (`<productId>.jpg`), uploaded from the menu admin.

const BUCKET = 'menu-photos';
const MAX_EDGE = 900; // px — menu cards render ~150-300px, 900 keeps retina crisp
const JPEG_QUALITY = 0.82;

/**
 * Downscale + re-encode in the browser: tablet cameras produce multi-MB
 * images; the menu only needs ~100KB. Falls back to the original file if
 * decoding fails (e.g. exotic format).
 */
async function compress(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Upload (or replace) a product photo; returns the public URL to store on the product. */
export async function uploadProductPhoto(productId: string, file: File): Promise<string | null> {
  if (!supabase) return null;
  const blob = await compress(file);
  const path = `${productId}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '31536000',
  });
  if (error) {
    console.error('[vino] photo upload failed', error);
    return null;
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // same path on replace — the version param busts the CDN/browser cache
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Delete a product's photo object (photo_url on the row is cleared by the caller). */
export async function removeProductPhoto(productId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.storage.from(BUCKET).remove([`${productId}.jpg`]);
  if (error) console.error('[vino] photo delete failed', error);
}
