/**
 * Attachment validation (#61) — the ONE type+size gate every attach surface
 * runs before an upload: the composer paperclip and the page `image` block
 * both call this, so "what Pond accepts" is a single fact, not two drifting
 * lists. Pure data + functions, no Supabase, server-safe.
 *
 * The allowed set is deliberately small (grill decision): images the model can
 * SEE (png/jpg/gif/webp) plus common documents (pdf/txt/md), capped at ~10MB —
 * matching the bucket's own `file_size_limit`/`allowed_mime_types` in migration
 * 0008, so a file that passes here never bounces off storage.
 */

/** ~10MB — mirrors the `attachments` bucket's file_size_limit (migration 0008). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/** Extension → canonical media type. Also the fallback when the browser reports
 *  no `File.type` (Finder-made `.md`/`.txt` files commonly arrive typeless). */
const MEDIA_TYPE_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
}

const ALLOWED_MEDIA_TYPES = new Set(Object.values(MEDIA_TYPE_BY_EXTENSION))

/** Browser-reported variants normalized to the canonical set above. */
const MEDIA_TYPE_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'text/x-markdown': 'text/markdown',
}

/** The `accept` attr / picker filter for every attach surface — extensions plus
 *  mimes so both macOS and Windows pickers filter sensibly. */
export const ATTACHMENT_ACCEPT = [
  ...Object.keys(MEDIA_TYPE_BY_EXTENSION).map((ext) => `.${ext}`),
  ...ALLOWED_MEDIA_TYPES,
].join(',')

/** Canonical media type for a filename by extension, or null when unknown. */
export function mediaTypeForFilename(name: string): string | null {
  const ext = name.toLowerCase().split('.').pop()
  return (ext && MEDIA_TYPE_BY_EXTENSION[ext]) || null
}

/** True for any raster image type the `image` block renders inline. */
export function isImageMediaType(mediaType: string): boolean {
  return mediaType.startsWith('image/')
}

export type AttachmentValidation = { ok: true; mediaType: string } | { ok: false; message: string }

/**
 * Validate a candidate attachment (name/declared type/size — the pieces a
 * `File` carries, structurally typed so tests and non-File callers stay easy).
 * The resolved `mediaType` is canonical: aliases normalized, and a typeless
 * file resolved by extension. Rejection messages are user-facing and name the
 * file, per the acceptance criteria.
 */
export function validateAttachment(file: {
  name: string
  type?: string
  size: number
}): AttachmentValidation {
  const declared = (file.type ?? '').toLowerCase()
  const normalized = MEDIA_TYPE_ALIASES[declared] ?? declared
  const mediaType = ALLOWED_MEDIA_TYPES.has(normalized)
    ? normalized
    : mediaTypeForFilename(file.name)

  if (!mediaType) {
    return {
      ok: false,
      message: `“${file.name}” isn’t a supported file type — images (png, jpg, gif, webp) and documents (pdf, txt, md) only.`,
    }
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1)
    return {
      ok: false,
      message: `“${file.name}” is too large (${mb}MB) — attachments are capped at 10MB.`,
    }
  }
  return { ok: true, mediaType }
}
