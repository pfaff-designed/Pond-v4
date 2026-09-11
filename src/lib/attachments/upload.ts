/**
 * Attachment upload (#61) — validate, write to the `attachments` Supabase
 * Storage bucket, return the public URL. Framework-agnostic (takes a
 * SupabaseClient, like lib/pages/client) so the composer hook and the page
 * `image` block share one transport.
 *
 * Paths are owner-scoped: `<userId>/<uuid>-<sanitized name>`. The first folder
 * segment MUST be the caller's auth uid — the bucket's RLS insert policy
 * (migration 0008) checks it — and the uuid prefix means re-attaching the same
 * filename never collides or overwrites.
 *
 * Result is a plain ok/error union, never a throw: every failure here is a
 * user-facing "couldn't attach" moment, not a programmer error.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { validateAttachment } from './validate'

/** The Supabase Storage bucket for user attachments (migration 0008). */
export const ATTACHMENTS_BUCKET = 'attachments'

/** A stored attachment, as every render surface consumes it. */
export interface UploadedAttachment {
  /** Public URL — what the composer sends and the `image` block persists. */
  url: string
  /** Bucket-relative storage path (also the attachment's stable identity). */
  path: string
  mediaType: string
  filename: string
  size: number
}

export type UploadResult =
  { ok: true; attachment: UploadedAttachment } | { ok: false; message: string }

/** Keep the original name readable in the URL but strip anything path- or
 *  encoding-hostile. The uuid segment carries uniqueness; this carries legibility. */
function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.-]+/g, '-')
}

export async function uploadAttachment(
  supabase: SupabaseClient<Database>,
  userId: string,
  file: File
): Promise<UploadResult> {
  const validation = validateAttachment(file)
  if (!validation.ok) return validation

  const path = `${userId}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`
  const { error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(path, file, { contentType: validation.mediaType })
  if (error) {
    return { ok: false, message: `Upload of “${file.name}” failed — ${error.message}` }
  }

  const { data } = supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path)
  return {
    ok: true,
    attachment: {
      url: data.publicUrl,
      path,
      mediaType: validation.mediaType,
      filename: file.name,
      size: file.size,
    },
  }
}
