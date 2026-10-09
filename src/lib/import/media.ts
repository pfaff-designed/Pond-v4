/**
 * Images and files (6z frame 3): "images in the file or linked from it become image
 * blocks"; links to files that aren't web pages become file blocks. Both are the
 * registry's `image` block, which draws an image inline and any other file as a link.
 */
import type { Element } from 'hast'
import { MAX_ATTACHMENT_BYTES, mediaTypeForFilename } from '@/lib/attachments/validate'
import type { ImageBlock } from '@/lib/modules/image/schema'
import { prop } from './hast'
import { followableHref } from './inline'
import { fileNameOf, isWebUrl, resolveUrl } from './urls'

/** Extensions that are web pages, so a link to one is a link, not a file. */
const PAGE_EXTENSIONS = new Set([
  'html',
  'htm',
  'xhtml',
  'shtml',
  'php',
  'asp',
  'aspx',
  'jsp',
  'cfm',
  'cgi',
])

/**
 * Where an image is: written into the file (a data url), linked on the web, or
 * beside the file. One written into the file is held to the attachment limit too.
 */
export type ImageSource = { url: string; linked: boolean } | 'beside' | 'too-large'

const firstCandidate = (srcset: string | undefined): string | undefined =>
  srcset?.split(',')[0]?.trim().split(/\s+/)[0]

/** The bytes a data url decodes to, without decoding it. */
const dataUrlBytes = (url: string): number => {
  const comma = url.indexOf(',')
  const payload = url.length - comma - 1
  if (/;base64$/i.test(url.slice(0, comma))) return Math.floor((payload * 3) / 4)
  let escapes = 0
  for (let i = comma + 1; i < url.length; i++) if (url[i] === '%') escapes += 1
  return payload - escapes * 2
}

export const imageSource = (img: Element, baseUrl: string | undefined): ImageSource | undefined => {
  const src = (prop(img, 'src') || firstCandidate(prop(img, 'srcSet')) || '').trim()
  if (src === '') return undefined
  if (/^data:image\//i.test(src)) {
    return dataUrlBytes(src) > MAX_ATTACHMENT_BYTES ? 'too-large' : { url: src, linked: false }
  }
  const url = resolveUrl(src, baseUrl)
  if (!url || !isWebUrl(url)) return 'beside'
  return { url, linked: true }
}

const dataMediaType = (url: string): string | undefined =>
  /^data:(image\/[\w.+-]+)[;,]/i.exec(url)?.[1]?.toLowerCase()

export const imageBlock = (id: string, url: string, caption: string | undefined): ImageBlock => {
  const filename = url.startsWith('data:') ? undefined : fileNameOf(url)
  const mediaType = url.startsWith('data:')
    ? dataMediaType(url)
    : filename && mediaTypeForFilename(filename)
  return {
    id,
    type: 'image',
    url,
    ...(filename ? { filename } : {}),
    ...(mediaType ? { mediaType } : {}),
    ...(caption ? { caption } : {}),
  }
}

/** The file a link points at, when it is a file on the web and not another page. */
export const fileLink = (a: Element, baseUrl: string | undefined): string | undefined => {
  const url = followableHref(a, baseUrl)
  if (!url || !isWebUrl(url)) return undefined
  const name = fileNameOf(url) ?? ''
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return undefined
  return PAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase()) ? undefined : url
}
