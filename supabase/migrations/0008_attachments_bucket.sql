-- ─── Attachments bucket (#61) ───────────────────────────────────────────────
-- One Supabase Storage bucket for user uploads: composer attachments (images +
-- documents Pond can see) and page `image` blocks (which persist only the
-- public URL). The bucket enforces the SAME type + size limits the client
-- validates (src/lib/attachments/validate.ts), so a file that passes the
-- client gate never bounces off storage — and a client bypass still can't
-- store an oversize/off-type object.
--
-- Public bucket by design: pages render attachments with a plain <img src>
-- and the AI provider fetches file URLs directly. Paths are unguessable
-- (`<userId>/<uuid>-<name>`), and writes are RLS-locked to the owner's folder.
--
-- Additive + reversible. Down (manual, if ever needed):
--   delete from storage.objects where bucket_id = 'attachments';
--   delete from storage.buckets where id = 'attachments';
--   drop policy if exists "attachments_insert_own_folder" on storage.objects;
--   drop policy if exists "attachments_read" on storage.objects;
--   drop policy if exists "attachments_delete_own_folder" on storage.objects;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  true,
  10485760, -- ~10MB, mirroring MAX_ATTACHMENT_BYTES
  array[
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'text/markdown'
  ]
)
on conflict (id) do nothing;

-- Owners may write only under their own folder: the path's first segment must
-- be their auth uid (the client always uploads to `<userId>/<uuid>-<name>`).
create policy "attachments_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read — the bucket is public, but storage.objects still needs a
-- select policy for the API surface (listing, signed operations).
create policy "attachments_read"
  on storage.objects for select
  using (bucket_id = 'attachments');

-- Owners may delete their own uploads (future cleanup UX; nothing calls this yet).
create policy "attachments_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
