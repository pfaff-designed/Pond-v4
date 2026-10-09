/**
 * The one reach beyond the file (6z frame 2: "reading looks only at the file and the
 * images it links to"). Each linked image is fetched once, under the same limit as
 * any attachment, since that is what it becomes. Nothing else is ever requested.
 *
 * The fetch itself is injected, so the reader stays pure and tests never touch the
 * network. `fetchImage` is told the limit and may stop early; the limit is checked
 * again here on what it returns. It must not follow redirects: it hands each one
 * back, and this module decides whether to follow it, so no address — first or
 * redirected — reaches it unless it is on the open web.
 */
import { isImageMediaType, MAX_ATTACHMENT_BYTES } from '@/lib/attachments/validate'
import { collectLeftOut, type LeftOutCollector } from './left-out'
import type { LeftOut } from './types'
import { isPublicWebUrl, isWebUrl, resolveUrl } from './urls'

export interface FetchedBytes {
  bytes: Uint8Array
  mediaType: string
}

export interface FetchLimits {
  maxBytes: number
  redirect: 'manual'
}

/** One image, a redirect to follow (its `Location`), or null when it can't be had. */
export type FetchImage = (
  url: string,
  limits: FetchLimits
) => Promise<FetchedBytes | { redirectTo: string } | null>

export interface FetchedImage extends FetchedBytes {
  url: string
}

const LIMITS: Readonly<FetchLimits> = Object.freeze({
  maxBytes: MAX_ATTACHMENT_BYTES,
  redirect: 'manual',
})
const MAX_REDIRECTS = 3

type Fetched = FetchedBytes | 'unfetched' | 'private'

/** A fetch that fails, by throwing or rejecting, is one image that couldn't be had. */
const attempt = async (fetchImage: FetchImage, url: string) => {
  try {
    return await fetchImage(url, LIMITS)
  } catch {
    return null
  }
}

/** Fetch one image, following at most three redirects, each to a public address. */
const fetchFollowing = async (url: string, fetchImage: FetchImage): Promise<Fetched> => {
  let address = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isPublicWebUrl(address)) return 'private'
    const fetched = await attempt(fetchImage, address)
    if (!fetched) return 'unfetched'
    if (!('redirectTo' in fetched)) return fetched
    const next = resolveUrl(fetched.redirectTo, address)
    if (!next || !isWebUrl(next)) return 'unfetched'
    address = next
  }
  return 'unfetched'
}

const settle = (url: string, fetched: Fetched, leftOut: LeftOutCollector): FetchedImage | null => {
  if (fetched === 'private') leftOut.add('imagePrivate', url)
  else if (fetched === 'unfetched') leftOut.add('imageUnfetched', url)
  else if (fetched.bytes.byteLength > MAX_ATTACHMENT_BYTES) leftOut.add('imageTooLarge', url)
  else if (!isImageMediaType(fetched.mediaType.toLowerCase())) leftOut.add('notAnImage', url)
  else return { url, ...fetched }
  return null
}

export const fetchLinkedImages = async (
  urls: readonly string[],
  { fetchImage }: { fetchImage: FetchImage }
): Promise<{ images: FetchedImage[]; leftOut: LeftOut[] }> => {
  const images: FetchedImage[] = []
  const leftOut = collectLeftOut()

  for (const url of new Set(urls)) {
    if (!isWebUrl(url)) continue
    const image = settle(url, await fetchFollowing(url, fetchImage), leftOut)
    if (image) images.push(image)
  }

  return { images, leftOut: leftOut.list() }
}
