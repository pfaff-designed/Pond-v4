/**
 * The `image` module (#61) — an uploaded image / file attachment embedded in a
 * page. Registry facets (schema + serialize/preview) plus the view's three
 * faces: rendered <img> for images, a file link for documents, and the
 * editable empty state that uploads via the shared attachments helper
 * (validate → Supabase Storage → onChange persists the URL).
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

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

import { imageSchema, imageDescriptor, type ImageBlock } from '@/lib/modules/image/schema'
import { blockSchema } from '@/lib/modules/content'
import { moduleDataSchema, createPageBlockSchema } from '@/lib/modules/ai-composition'
import { emptyBlockForType } from '@/lib/modules/palette'
import { ImageView } from '@/lib/modules/image/view'

const photo: ImageBlock = {
  id: 'b1',
  type: 'image',
  url: 'https://cdn.example/user-1/board.png',
  filename: 'board.png',
  mediaType: 'image/png',
  caption: 'The workbench',
}

beforeEach(() => {
  mockUpload.mockReset().mockResolvedValue({ data: { path: 'p' }, error: null })
  mockGetPublicUrl
    .mockReset()
    .mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }))
})

describe('image schema + registry facets', () => {
  it('persists through blockSchema (round-trips a full image block)', () => {
    const parsed = blockSchema.parse(photo)
    expect(parsed).toEqual(photo)
  })

  it('accepts the palette empty state (no url yet)', () => {
    const empty = emptyBlockForType('image')
    expect(empty).not.toBeNull()
    expect(empty!.type).toBe('image')
    expect(blockSchema.safeParse(empty).success).toBe(true)
  })

  it('is AI-composable id-less (moduleDataSchema + createPageBlockSchema)', () => {
    const idless = { type: 'image', url: photo.url, filename: 'board.png' }
    expect(moduleDataSchema.safeParse(idless).success).toBe(true)
    expect(createPageBlockSchema.safeParse(idless).success).toBe(true)
  })

  it('serialize renders every user-visible piece: filename, caption, url', () => {
    const s = imageDescriptor.serialize(photo)
    expect(s).toContain('board.png')
    expect(s).toContain('The workbench')
    expect(s).toContain(photo.url)
  })

  it('preview is a one-line listing naming the attachment', () => {
    const p = imageDescriptor.preview!(photo)
    expect(p).toContain('board.png')
    expect(p).not.toContain('\n')
  })

  it('rejects a block with no type discriminator', () => {
    expect(imageSchema.safeParse({ id: 'x', url: 'u' }).success).toBe(false)
  })
})

describe('ImageView', () => {
  it('renders an <img> with alt text for an image attachment, plus the caption', () => {
    render(<ImageView data={photo} />)
    const img = screen.getByRole('img', { name: 'The workbench' })
    expect(img).toHaveAttribute('src', photo.url)
    expect(screen.getByText('The workbench')).toBeInTheDocument()
  })

  it('renders a link (not an <img>) for a document attachment', () => {
    render(
      <ImageView
        data={{
          id: 'b2',
          type: 'image',
          url: 'https://cdn.example/user-1/spec.pdf',
          filename: 'spec.pdf',
          mediaType: 'application/pdf',
        }}
      />
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: /spec\.pdf/ })
    expect(link).toHaveAttribute('href', 'https://cdn.example/user-1/spec.pdf')
  })

  it('infers image-ness from the URL extension when mediaType is absent (AI-emitted)', () => {
    render(<ImageView data={{ id: 'b3', type: 'image', url: 'https://cdn.example/pic.jpg' }} />)
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('empty + editable: uploads a picked file and emits the persisted block via onChange', async () => {
    const onChange = jest.fn()
    render(<ImageView data={{ id: 'b4', type: 'image', url: '' }} editable onChange={onChange} />)

    const input = screen.getByLabelText(/upload/i) as HTMLInputElement
    const file = new File([new Uint8Array(4)], 'shot.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const next = onChange.mock.calls[0][0] as ImageBlock
    expect(next.id).toBe('b4')
    expect(next.type).toBe('image')
    expect(next.url).toMatch(/^https:\/\/cdn\.example\/user-1\//)
    expect(next.filename).toBe('shot.png')
    expect(next.mediaType).toBe('image/png')
  })

  it('empty + editable: an invalid pick shows the rejection message and uploads nothing', async () => {
    const onChange = jest.fn()
    render(<ImageView data={{ id: 'b5', type: 'image', url: '' }} editable onChange={onChange} />)

    const input = screen.getByLabelText(/upload/i) as HTMLInputElement
    const file = new File([new Uint8Array(4)], 'movie.mp4', { type: 'video/mp4' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText(/movie\.mp4/)).toBeInTheDocument())
    expect(mockUpload).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('empty + read-only: renders a calm placeholder, no upload affordance', () => {
    render(<ImageView data={{ id: 'b6', type: 'image', url: '' }} />)
    expect(screen.queryByLabelText(/upload/i)).not.toBeInTheDocument()
    expect(screen.getByText(/no file/i)).toBeInTheDocument()
  })
})
