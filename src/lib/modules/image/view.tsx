'use client'

import { useRef, useState } from 'react'
import type { ModuleViewProps } from '../types'
import type { ImageBlock } from './schema'
import {
  isImageMediaType,
  mediaTypeForFilename,
  ATTACHMENT_ACCEPT,
} from '@/lib/attachments/validate'
import { uploadAttachment } from '@/lib/attachments/upload'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'

/**
 * `image` view (#61). Three faces:
 *   - a stored image → inline <img> with the caption as alt + figcaption;
 *   - a stored document (pdf/txt/md) → a quiet link chip that opens the file;
 *   - no `url` yet + editable → the upload affordance (validate → Supabase
 *     Storage via the shared attachments helper → onChange persists the URL).
 * Read-only with no url (AI terminal preview of an unuploaded block) shows a
 * calm placeholder. Supabase is constructed only inside the change handler —
 * never at render — so envless mounts (Storybook, CI) stay safe (#38).
 */
export function ImageView({ data, editable, onChange }: ModuleViewProps<ImageBlock>) {
  const getSupabase = useLazySupabase()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handlePick(file: File) {
    setError(null)
    setBusy(true)
    try {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('You’re not signed in — sign in to upload files.')
        return
      }
      const result = await uploadAttachment(supabase, user.id, file)
      if (!result.ok) {
        setError(result.message)
        return
      }
      onChange?.({
        ...data,
        url: result.attachment.url,
        filename: result.attachment.filename,
        mediaType: result.attachment.mediaType,
      })
    } catch (err) {
      setError(`Upload failed — ${err instanceof Error ? err.message : err}`)
    } finally {
      setBusy(false)
    }
  }

  // ── No file yet ────────────────────────────────────────────────────────────
  if (!data.url) {
    if (!editable) {
      return <p className="py-1 text-sm text-mn-text-secondary">No file uploaded yet.</p>
    }
    return (
      <div className="py-1">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-mn-inner bg-mn-wash px-3 py-2 text-sm text-mn-text-secondary transition-colors hover:bg-mn-selected-fill hover:text-mn-text">
          <PaperclipIcon />
          <span>{busy ? 'Uploading…' : 'Upload a file — images, pdf, txt, md · up to 10MB'}</span>
          <input
            ref={inputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            aria-label="Upload a file"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              // Reset so re-picking the same file re-fires change.
              e.target.value = ''
              if (file) handlePick(file)
            }}
          />
        </label>
        {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  // ── Stored file ────────────────────────────────────────────────────────────
  const mediaType = data.mediaType ?? mediaTypeForFilename(data.url) ?? ''
  const name = data.filename ?? data.url.split('/').pop() ?? 'file'

  if (isImageMediaType(mediaType)) {
    return (
      <figure className="py-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded
            content from Supabase Storage; dimensions unknown at build time, so
            next/image's required sizing would fight the block's natural flow. */}
        <img
          src={data.url}
          alt={data.caption ?? name}
          className="max-h-[480px] max-w-full rounded-mn-row shadow-mn-sm"
        />
        {data.caption && (
          <figcaption className="mt-1.5 text-xs text-mn-text-secondary">{data.caption}</figcaption>
        )}
      </figure>
    )
  }

  return (
    <div className="py-1">
      <a
        href={data.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-mn-row bg-mn-card px-3 py-2 text-sm text-mn-text-meta shadow-mn-sm transition-colors hover:text-mn-text"
      >
        <PaperclipIcon />
        <span>{name}</span>
      </a>
      {data.caption && <p className="mt-1.5 text-xs text-mn-text-secondary">{data.caption}</p>}
    </div>
  )
}

function PaperclipIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="currentColor"
      width={12}
      height={12}
      className="flex-shrink-0"
    >
      <path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v7a.5.5 0 0 0 1 0V3a1.5 1.5 0 0 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v7a3.5 3.5 0 1 1-7 0V3Z" />
    </svg>
  )
}
