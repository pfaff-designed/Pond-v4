/**
 * The one reach beyond the file (6z frame 2: "reading looks only at the file and the
 * images it links to"). Each linked image is fetched once, under the same limit as
 * any attachment, since that is what it becomes. Nothing else is ever requested.
 *
 * The fetch itself is injected, so the reader stays pure and tests never touch the
 * network. `fetchImage` is told the limit and may stop early; the limit is checked
 * again here on what it returns.
 */
import { isImageMediaType, MAX_ATTACHMENT_BYTES } from '@/lib/attachments/validate'
import { collectLeftOut } from './left-out'
import type { LeftOut } from './types'

export interface FetchedBytes {
  bytes: Uint8Array
  mediaType: string
}

/** Fetch one image, or null when it can't be had. */
export type FetchImage = (url: string, limits: { maxBytes: number }) => Promise<FetchedBytes | null>

export interface FetchedImage extends FetchedBytes {
  url: string
}

const WEB_IMAGE = /^https?:\/\//i

export const fetchLinkedImages = async (
  urls: readonly string[],
  { fetchImage }: { fetchImage: FetchImage }
): Promise<{ images: FetchedImage[]; leftOut: LeftOut[] }> => {
  const images: FetchedImage[] = []
  const leftOut = collectLeftOut()
  const unique = [...new Set(urls)].filter((url) => WEB_IMAGE.test(url))

  for (const url of unique) {
    const fetched = await fetchImage(url, { maxBytes: MAX_ATTACHMENT_BYTES })
    if (!fetched) leftOut.add('imageUnfetched', url)
    else if (fetched.bytes.byteLength > MAX_ATTACHMENT_BYTES) leftOut.add('imageTooLarge', url)
    else if (!isImageMediaType(fetched.mediaType.toLowerCase())) leftOut.add('notAnImage', url)
    else images.push({ url, ...fetched })
  }

  return { images, leftOut: leftOut.list() }
}
