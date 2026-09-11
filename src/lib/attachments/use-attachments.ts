'use client'

/**
 * useAttachments (#61) — the composer's attachment state: add a file
 * (validate → upload → chip), remove one before send, clear all on send, and
 * project the list as AI SDK `FileUIPart`s for `sendMessage({ text, files })`.
 *
 * Rejections (bad type / oversize / failed upload) surface through `onReject`
 * with a user-facing message — the terminal routes it to the notify toast.
 * Supabase is constructed lazily on first upload (never at render), so an
 * envless mount (Storybook, CI) stays safe — same #38 discipline as the
 * terminal's other Supabase touches.
 */

import { useCallback, useMemo, useState } from 'react'
import type { FileUIPart } from 'ai'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { uploadAttachment, type UploadedAttachment } from './upload'

export interface UseAttachmentsOptions {
  /** Called with a user-facing message when a file can't be attached. */
  onReject: (message: string) => void
}

export function useAttachments({ onReject }: UseAttachmentsOptions) {
  const getSupabase = useLazySupabase()
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([])
  const [uploadCount, setUploadCount] = useState(0)

  const addFile = useCallback(
    async (file: File) => {
      setUploadCount((n) => n + 1)
      try {
        const supabase = getSupabase()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          onReject(`Couldn’t attach “${file.name}” — you’re not signed in.`)
          return
        }
        const result = await uploadAttachment(supabase, user.id, file)
        if (!result.ok) {
          onReject(result.message)
          return
        }
        setAttachments((prev) => [...prev, result.attachment])
      } catch (err) {
        onReject(`Couldn’t attach “${file.name}” — ${err instanceof Error ? err.message : err}`)
      } finally {
        setUploadCount((n) => n - 1)
      }
    },
    [getSupabase, onReject]
  )

  const remove = useCallback((path: string) => {
    setAttachments((prev) => prev.filter((a) => a.path !== path))
  }, [])

  const clear = useCallback(() => setAttachments([]), [])

  /** The pending set as AI SDK file parts — what `sendMessage` carries so the
   *  model can see the attachment (URL-referenced; the SDK downloads when the
   *  provider can't fetch the URL itself). */
  const fileParts = useMemo<FileUIPart[]>(
    () =>
      attachments.map((a) => ({
        type: 'file',
        mediaType: a.mediaType,
        url: a.url,
        filename: a.filename,
      })),
    [attachments]
  )

  return { attachments, addFile, remove, clear, fileParts, isUploading: uploadCount > 0 }
}
