/**
 * The addresses a file points at: which Pond can follow, which are on the web, and
 * which of those are safe for the server to fetch.
 */
import { privateHostReason } from '@/lib/context/paste-link'

/** Where a link leads that Pond can follow: a web page or file, or an email. */
export type Reach = 'web' | 'mail'

const PROTOCOLS = new Map<string, Reach>([
  ['http:', 'web'],
  ['https:', 'web'],
  ['mailto:', 'mail'],
])

/** An address resolved against a base; `undefined` when it can't be. */
export const resolveUrl = (href: string, base: string | undefined): string | undefined => {
  try {
    return new URL(href, base).href
  } catch {
    return undefined
  }
}

/** How an absolute address can be followed, or `undefined` when it can't. */
export const reachOf = (url: string): Reach | undefined => {
  try {
    return PROTOCOLS.get(new URL(url).protocol)
  } catch {
    return undefined
  }
}

export const isWebUrl = (url: string): boolean => reachOf(url) === 'web'

/**
 * Whether the server may fetch it: on the web, and not at a loopback, private,
 * link-local or metadata address (the same guard as a pasted link).
 */
export const isPublicWebUrl = (url: string): boolean =>
  isWebUrl(url) && privateHostReason(new URL(url).hostname) === null

/** The last path segment of a link, decoded — the file's name. */
export const fileNameOf = (url: string): string | undefined => {
  const path = url.split(/[?#]/)[0]
  const last = path.split('/').pop()
  if (!last) return undefined
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}
