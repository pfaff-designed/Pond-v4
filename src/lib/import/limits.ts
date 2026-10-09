import type { ReadHtmlError } from './types'

/** 6z frame 6: "over 20 MB. Pond says the size and the limit." */
export const MAX_HTML_BYTES = 20 * 1024 * 1024

/** UTF-8 byte length without allocating an encoded copy of a file that may be huge. */
const utf8ByteLength = (text: string): number => {
  let bytes = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}

const MARKUP = /<(?:!doctype\s+html|[a-z][a-z0-9-]*)(?:\s[^>]*)?\/?>/i

/**
 * The checks that refuse a file before it is parsed: too large, empty, binary, or
 * with no markup at all. A file that parses to nothing is refused after reading.
 */
export const checkHtml = (html: string): ReadHtmlError | null => {
  const size = utf8ByteLength(html)
  if (size > MAX_HTML_BYTES) return { kind: 'too-large', size, limit: MAX_HTML_BYTES }
  if (html.trim() === '' || html.includes('\u0000') || !MARKUP.test(html)) {
    return { kind: 'unreadable' }
  }
  return null
}
