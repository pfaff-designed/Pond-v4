/** @jest-environment node */
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachments/validate'
import { fetchLinkedImages, type FetchImage } from '../images'

const png = (size: number) => ({ bytes: new Uint8Array(size), mediaType: 'image/png' })

describe('fetchLinkedImages', () => {
  it('fetches each linked image once, under the attachment size limit', async () => {
    const fetchImage = jest.fn<ReturnType<FetchImage>, Parameters<FetchImage>>(async () => png(3))
    const result = await fetchLinkedImages(
      ['https://cdn.example/a.png', 'https://cdn.example/b.png', 'https://cdn.example/a.png'],
      { fetchImage }
    )
    expect(fetchImage.mock.calls).toEqual([
      ['https://cdn.example/a.png', { maxBytes: MAX_ATTACHMENT_BYTES }],
      ['https://cdn.example/b.png', { maxBytes: MAX_ATTACHMENT_BYTES }],
    ])
    expect(result.images.map((i) => i.url)).toEqual([
      'https://cdn.example/a.png',
      'https://cdn.example/b.png',
    ])
    expect(result.leftOut).toEqual([])
  })

  it('never requests anything but an http(s) image link', async () => {
    const fetchImage = jest.fn<ReturnType<FetchImage>, Parameters<FetchImage>>(async () => png(3))
    await fetchLinkedImages(['data:image/png;base64,AAAA', 'finish.png', 'ftp://x/y.png'], {
      fetchImage,
    })
    expect(fetchImage).not.toHaveBeenCalled()
  })

  it('lists an image over the limit, one that fails, and one that is not an image', async () => {
    const fetchImage: FetchImage = async (url) => {
      if (url.endsWith('big.png')) return png(MAX_ATTACHMENT_BYTES + 1)
      if (url.endsWith('gone.png')) return null
      return { bytes: new Uint8Array(4), mediaType: 'text/html' }
    }
    const result = await fetchLinkedImages(
      [
        'https://cdn.example/big.png',
        'https://cdn.example/gone.png',
        'https://cdn.example/page.png',
      ],
      { fetchImage }
    )
    expect(result.images).toEqual([])
    expect(result.leftOut.map((l) => [l.name, l.from])).toEqual([
      ['an image over 10 MB', ['https://cdn.example/big.png']],
      ['an image that couldn’t be fetched', ['https://cdn.example/gone.png']],
      ['a link that isn’t an image', ['https://cdn.example/page.png']],
    ])
  })
})
