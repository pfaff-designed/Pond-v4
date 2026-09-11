import { z } from 'zod'
import type { ModuleDescriptor } from '../types'

/**
 * `image` (#61) — an uploaded image or file attachment embedded in a page.
 * The block persists only the attachment's public URL (Supabase Storage,
 * `attachments` bucket) plus display metadata; the bytes live in storage, so
 * pages stay light and the same upload can be referenced from chat and page
 * alike. Images render inline; non-image files (pdf/txt/md) render as a
 * download link. An empty `url` is the authoring state — the editable view
 * offers the upload affordance until a file lands.
 */
export const imageSchema = z.object({
  id: z.string(),
  type: z.literal('image'),
  /** Public URL of the stored file. Empty string = not uploaded yet. */
  url: z.string(),
  /** Original filename, for the link label and alt-text fallback. */
  filename: z.string().optional(),
  /** Canonical media type (image/png, application/pdf, …). Inferred from the
   *  URL extension when absent (an AI-emitted block may omit it). */
  mediaType: z.string().optional(),
  /** Optional one-line caption under the image (also the alt text). */
  caption: z.string().optional(),
})

export type ImageBlock = z.infer<typeof imageSchema>

export const imageDescriptor: ModuleDescriptor<ImageBlock> = {
  type: 'image',
  schema: imageSchema,
  paletteDescription: 'An uploaded image or file — png/jpg/gif/webp inline, pdf/txt/md as a link.',
  description:
    'An uploaded image or file attachment, referenced by URL: images (png/jpg/gif/webp) render inline, documents (pdf/txt/md) render as a download link, with an optional caption. ' +
    'Only reference URLs you have actually seen — a file the user attached in chat or an existing block’s url — NEVER invent or guess a URL. ' +
    'Use when the user asks to place an attached image or file into a page.',
  serialize: (data) => {
    const name = data.filename ?? data.url.split('/').pop() ?? 'file'
    const cap = data.caption ? ` — ${data.caption}` : ''
    return data.url
      ? `[Attachment: ${name}${cap}] (${data.url})`
      : `[Attachment: ${name} — no file uploaded yet]`
  },
  preview: (data) => `Attachment: ${data.filename ?? data.url.split('/').pop() ?? '(no file yet)'}`,
}
