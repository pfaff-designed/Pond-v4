/** @jest-environment node */
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachments/validate'
import { fetchLinkedImages, type FetchImage } from '../images'

const png = (size: number) => ({ bytes: new Uint8Array(size), mediaType: 'image/png' })

const mockFetch = (impl: FetchImage) =>
  jest.fn<ReturnType<FetchImage>, Parameters<FetchImage>>(impl)

const LIMITS = { maxBytes: MAX_ATTACHMENT_BYTES, redirect: 'manual' }

describe('fetchLinkedImages', () => {
  it('fetches each linked image once, under the attachment size limit, never following a redirect itself', async () => {
    const fetchImage = mockFetch(async () => png(3))
    const result = await fetchLinkedImages(
      ['https://cdn.example/a.png', 'https://cdn.example/b.png', 'https://cdn.example/a.png'],
      { fetchImage }
    )
    expect(fetchImage.mock.calls).toEqual([
      ['https://cdn.example/a.png', LIMITS],
      ['https://cdn.example/b.png', LIMITS],
    ])
    expect(result.images.map((i) => i.url)).toEqual([
      'https://cdn.example/a.png',
      'https://cdn.example/b.png',
    ])
    expect(result.leftOut).toEqual([])
  })

  it('never requests anything but an http(s) image link', async () => {
    const fetchImage = mockFetch(async () => png(3))
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

  it('lists an image whose fetch throws, and fetches the rest', async () => {
    const fetchImage: FetchImage = async (url) => {
      if (url.endsWith('down.png')) throw new Error('ECONNRESET')
      return png(3)
    }
    const result = await fetchLinkedImages(
      ['https://cdn.example/down.png', 'https://cdn.example/up.png'],
      { fetchImage }
    )
    expect(result.images.map((i) => i.url)).toEqual(['https://cdn.example/up.png'])
    expect(result.leftOut.map((l) => [l.name, l.from])).toEqual([
      ['an image that couldn’t be fetched', ['https://cdn.example/down.png']],
    ])
  })
})

describe('fetchLinkedImages never reaches a private address', () => {
  const PRIVATE = [
    'http://169.254.169.254/latest/meta-data/x.png',
    'http://localhost:3000/a.png',
    'http://10.0.0.7/a.png',
    'http://192.168.1.1/a.png',
    'http://[::1]/a.png',
    'http://[::ffff:127.0.0.1]/a.png',
    'http://metadata.google.internal/a.png',
  ]

  it('refuses every private, loopback, link-local and metadata host before fetching', async () => {
    const fetchImage = mockFetch(async () => png(3))
    const result = await fetchLinkedImages([...PRIVATE, 'https://cdn.example/ok.png'], {
      fetchImage,
    })
    expect(fetchImage.mock.calls.map(([url]) => url)).toEqual(['https://cdn.example/ok.png'])
    expect(result.leftOut).toEqual([
      {
        name: `${PRIVATE.length} images at private addresses`,
        why: 'the address is inside a private network. pond only fetches from the open web.',
        from: PRIVATE,
      },
    ])
  })

  it('follows a redirect only to a public address', async () => {
    const fetchImage = mockFetch(async (url) => {
      if (url === 'https://cdn.example/moved.png') return { redirectTo: '/images/moved.png' }
      if (url === 'https://cdn.example/sneaky.png') {
        return { redirectTo: 'http://169.254.169.254/latest/meta-data/' }
      }
      return png(3)
    })
    const result = await fetchLinkedImages(
      ['https://cdn.example/moved.png', 'https://cdn.example/sneaky.png'],
      { fetchImage }
    )
    expect(fetchImage.mock.calls.map(([url]) => url)).toEqual([
      'https://cdn.example/moved.png',
      'https://cdn.example/images/moved.png',
      'https://cdn.example/sneaky.png',
    ])
    expect(result.images.map((i) => i.url)).toEqual(['https://cdn.example/moved.png'])
    expect(result.leftOut.map((l) => [l.name, l.from])).toEqual([
      ['an image at a private address', ['https://cdn.example/sneaky.png']],
    ])
  })

  it('gives up on a redirect loop', async () => {
    const fetchImage = mockFetch(async (url) => ({ redirectTo: `${url}x` }))
    const result = await fetchLinkedImages(['https://cdn.example/loop.png'], { fetchImage })
    expect(fetchImage.mock.calls.length).toBeLessThanOrEqual(4)
    expect(result.leftOut.map((l) => [l.name, l.from])).toEqual([
      ['an image that couldn’t be fetched', ['https://cdn.example/loop.png']],
    ])
  })
})
