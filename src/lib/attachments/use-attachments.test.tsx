/**
 * useAttachments (#61) — the composer's attachment state machine: add a file
 * (validate → upload → chip), remove before send, clear on send, and project
 * the list as AI SDK FileUIParts so `sendMessage` can carry them.
 */

import { renderHook, act, waitFor } from '@testing-library/react'

const mockUpload = jest.fn()
const mockGetPublicUrl = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    storage: {
      from: jest.fn(() => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl })),
    },
  }),
}))

import { useAttachments } from '@/lib/attachments/use-attachments'
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachments/validate'

function makeFile(name: string, type: string, bytes = 4): File {
  const f = new File([new Uint8Array(Math.min(bytes, 64))], name, { type })
  // jsdom Files are tiny; fake the size for the oversize case.
  Object.defineProperty(f, 'size', { value: bytes })
  return f
}

beforeEach(() => {
  mockUpload.mockReset().mockResolvedValue({ data: { path: 'p' }, error: null })
  mockGetPublicUrl
    .mockReset()
    .mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }))
})

describe('useAttachments', () => {
  it('adds a valid image: uploads and exposes it as an attachment + file part', async () => {
    const onReject = jest.fn()
    const { result } = renderHook(() => useAttachments({ onReject }))

    await act(async () => {
      await result.current.addFile(makeFile('board.png', 'image/png'))
    })

    expect(onReject).not.toHaveBeenCalled()
    expect(result.current.attachments).toHaveLength(1)
    const a = result.current.attachments[0]
    expect(a.filename).toBe('board.png')
    expect(a.mediaType).toBe('image/png')
    expect(a.url).toMatch(/^https:\/\/cdn\.example\/user-1\//)
    expect(result.current.fileParts).toEqual([
      { type: 'file', mediaType: 'image/png', url: a.url, filename: 'board.png' },
    ])
  })

  it('rejects an invalid type via onReject and never uploads', async () => {
    const onReject = jest.fn()
    const { result } = renderHook(() => useAttachments({ onReject }))

    await act(async () => {
      await result.current.addFile(makeFile('movie.mp4', 'video/mp4'))
    })

    expect(onReject).toHaveBeenCalledWith(expect.stringContaining('movie.mp4'))
    expect(mockUpload).not.toHaveBeenCalled()
    expect(result.current.attachments).toHaveLength(0)
  })

  it('rejects an oversize file with the 10MB message', async () => {
    const onReject = jest.fn()
    const { result } = renderHook(() => useAttachments({ onReject }))

    await act(async () => {
      await result.current.addFile(makeFile('huge.png', 'image/png', MAX_ATTACHMENT_BYTES + 1))
    })

    expect(onReject).toHaveBeenCalledWith(expect.stringContaining('10MB'))
    expect(result.current.attachments).toHaveLength(0)
  })

  it('remove drops one attachment; clear drops all', async () => {
    const { result } = renderHook(() => useAttachments({ onReject: jest.fn() }))

    await act(async () => {
      await result.current.addFile(makeFile('a.png', 'image/png'))
      await result.current.addFile(makeFile('b.pdf', 'application/pdf'))
    })
    expect(result.current.attachments).toHaveLength(2)

    act(() => result.current.remove(result.current.attachments[0].path))
    expect(result.current.attachments).toHaveLength(1)
    expect(result.current.attachments[0].filename).toBe('b.pdf')

    act(() => result.current.clear())
    expect(result.current.attachments).toHaveLength(0)
    expect(result.current.fileParts).toEqual([])
  })

  it('surfaces an upload failure via onReject', async () => {
    mockUpload.mockResolvedValue({ data: null, error: { message: 'quota exceeded' } })
    const onReject = jest.fn()
    const { result } = renderHook(() => useAttachments({ onReject }))

    await act(async () => {
      await result.current.addFile(makeFile('a.png', 'image/png'))
    })

    expect(onReject).toHaveBeenCalledWith(expect.stringContaining('quota exceeded'))
    expect(result.current.attachments).toHaveLength(0)
  })

  it('reports isUploading while an upload is in flight', async () => {
    let release: (v: { data: { path: string }; error: null }) => void
    mockUpload.mockImplementation(
      () => new Promise((resolve) => (release = resolve as typeof release))
    )
    const { result } = renderHook(() => useAttachments({ onReject: jest.fn() }))

    let pending: Promise<void>
    act(() => {
      pending = result.current.addFile(makeFile('a.png', 'image/png'))
    })
    await waitFor(() => expect(result.current.isUploading).toBe(true))

    await act(async () => {
      release!({ data: { path: 'p' }, error: null })
      await pending!
    })
    expect(result.current.isUploading).toBe(false)
    expect(result.current.attachments).toHaveLength(1)
  })
})
