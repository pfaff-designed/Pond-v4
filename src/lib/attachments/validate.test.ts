/**
 * Attachment validation (#61) — the one type+size gate every attach surface
 * (composer paperclip, page image block) runs before an upload. Pure function,
 * no Supabase: rejections must be decided client-side with a clear message,
 * never by a failed storage round-trip.
 */

import {
  MAX_ATTACHMENT_BYTES,
  validateAttachment,
  isImageMediaType,
  mediaTypeForFilename,
} from '@/lib/attachments/validate'

describe('validateAttachment — allowed types', () => {
  it.each([
    ['photo.png', 'image/png'],
    ['photo.jpg', 'image/jpeg'],
    ['anim.gif', 'image/gif'],
    ['pic.webp', 'image/webp'],
    ['doc.pdf', 'application/pdf'],
    ['notes.txt', 'text/plain'],
    ['readme.md', 'text/markdown'],
  ])('accepts %s (%s)', (name, type) => {
    const r = validateAttachment({ name, type, size: 1024 })
    expect(r).toEqual({ ok: true, mediaType: type })
  })

  it('falls back to the extension when the browser reports no type (.md is commonly empty)', () => {
    const r = validateAttachment({ name: 'notes.md', type: '', size: 10 })
    expect(r).toEqual({ ok: true, mediaType: 'text/markdown' })
  })

  it('normalizes a nonstandard markdown mime to text/markdown', () => {
    const r = validateAttachment({ name: 'notes.md', type: 'text/x-markdown', size: 10 })
    expect(r).toEqual({ ok: true, mediaType: 'text/markdown' })
  })
})

describe('validateAttachment — rejections', () => {
  it('rejects an unsupported type with a message naming the file and the allowed set', () => {
    const r = validateAttachment({ name: 'movie.mp4', type: 'video/mp4', size: 1024 })
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.message).toContain('movie.mp4')
    expect(r.message.toLowerCase()).toContain('png')
    expect(r.message.toLowerCase()).toContain('pdf')
  })

  it('rejects an oversize file with a message naming the 10MB cap', () => {
    const r = validateAttachment({
      name: 'huge.png',
      type: 'image/png',
      size: MAX_ATTACHMENT_BYTES + 1,
    })
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.message).toContain('huge.png')
    expect(r.message).toContain('10MB')
  })

  it('accepts a file exactly at the cap', () => {
    const r = validateAttachment({
      name: 'edge.png',
      type: 'image/png',
      size: MAX_ATTACHMENT_BYTES,
    })
    expect(r.ok).toBe(true)
  })

  it('the cap is ~10MB', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(10 * 1024 * 1024)
  })
})

describe('isImageMediaType', () => {
  it('is true for image/* and false otherwise', () => {
    expect(isImageMediaType('image/png')).toBe(true)
    expect(isImageMediaType('image/webp')).toBe(true)
    expect(isImageMediaType('application/pdf')).toBe(false)
    expect(isImageMediaType('text/plain')).toBe(false)
  })
})

describe('mediaTypeForFilename', () => {
  it('maps known extensions (case-insensitively) and returns null for unknown', () => {
    expect(mediaTypeForFilename('Board.PNG')).toBe('image/png')
    expect(mediaTypeForFilename('a.jpeg')).toBe('image/jpeg')
    expect(mediaTypeForFilename('a.exe')).toBeNull()
    expect(mediaTypeForFilename('noextension')).toBeNull()
  })
})
