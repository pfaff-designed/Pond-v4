/**
 * Attachment upload helper (#61) — validates, writes to the `attachments`
 * Supabase Storage bucket under the OWNER's folder (`<userId>/…`, which the
 * bucket RLS insert policy requires), and returns the public URL the composer
 * and the image block both render from.
 */

import { uploadAttachment, ATTACHMENTS_BUCKET } from '@/lib/attachments/upload'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

function makeSupabase(overrides?: { uploadError?: { message: string } }): {
  client: SupabaseClient<Database>
  upload: jest.Mock
  from: jest.Mock
} {
  const upload = jest
    .fn()
    .mockResolvedValue(
      overrides?.uploadError
        ? { data: null, error: overrides.uploadError }
        : { data: { path: 'stored' }, error: null }
    )
  const getPublicUrl = jest.fn((path: string) => ({
    data: { publicUrl: `https://cdn.example/${path}` },
  }))
  const from = jest.fn(() => ({ upload, getPublicUrl }))
  const client = { storage: { from } } as unknown as SupabaseClient<Database>
  return { client, upload, from }
}

function makeFile(name: string, type: string, bytes = 4): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

describe('uploadAttachment', () => {
  it('uploads a valid image under the user folder and returns the public URL', async () => {
    const { client, upload, from } = makeSupabase()
    const result = await uploadAttachment(
      client,
      'user-1',
      makeFile('board photo.png', 'image/png')
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(from).toHaveBeenCalledWith(ATTACHMENTS_BUCKET)
    // Path is owner-scoped (first folder = userId, per the bucket RLS policy)
    // and the filename is sanitized (no spaces).
    const [path, file, options] = upload.mock.calls[0]
    expect(path).toMatch(/^user-1\/[^/]+board-photo\.png$/)
    expect(file).toBeInstanceOf(File)
    expect(options).toEqual({ contentType: 'image/png' })
    expect(result.attachment.url).toBe(`https://cdn.example/${path}`)
    expect(result.attachment.path).toBe(path)
    expect(result.attachment.mediaType).toBe('image/png')
    expect(result.attachment.filename).toBe('board photo.png')
  })

  it('rejects an invalid type WITHOUT hitting storage', async () => {
    const { client, upload } = makeSupabase()
    const result = await uploadAttachment(client, 'user-1', makeFile('movie.mp4', 'video/mp4'))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.message).toContain('movie.mp4')
    expect(upload).not.toHaveBeenCalled()
  })

  it('surfaces a storage failure as a clear message, never a throw', async () => {
    const { client } = makeSupabase({ uploadError: { message: 'bucket not found' } })
    const result = await uploadAttachment(client, 'user-1', makeFile('a.png', 'image/png'))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.message).toContain('bucket not found')
  })
})
