-- Product photos move to Supabase Storage: the owner uploads images from the
-- menu admin; the repo no longer ships image files.
-- (Already applied to the live project via `supabase db query --linked`.)

alter table public.products add column if not exists photo_url text;

-- Public bucket: photos are served straight to the menu grid via public URL.
insert into storage.buckets (id, name, public)
values ('menu-photos', 'menu-photos', true)
on conflict (id) do nothing;

-- Staff (any authenticated user) manage photos; anyone can read.
-- Upsert needs INSERT + SELECT + UPDATE, delete needs DELETE.
-- Idempotent: this was first applied directly to the live project.
drop policy if exists "menu photos read" on storage.objects;
drop policy if exists "menu photos insert" on storage.objects;
drop policy if exists "menu photos update" on storage.objects;
drop policy if exists "menu photos delete" on storage.objects;

create policy "menu photos read" on storage.objects
  for select using (bucket_id = 'menu-photos');
create policy "menu photos insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'menu-photos');
create policy "menu photos update" on storage.objects
  for update to authenticated using (bucket_id = 'menu-photos') with check (bucket_id = 'menu-photos');
create policy "menu photos delete" on storage.objects
  for delete to authenticated using (bucket_id = 'menu-photos');
