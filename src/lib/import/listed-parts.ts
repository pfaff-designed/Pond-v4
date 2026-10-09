/**
 * The parts of a file that are named in what was left out, never placed: the code
 * and styling it hides in attributes, the site around the page, what it loads, the
 * apps it embeds, and links whose address no block carries.
 */
import type { Element } from 'hast'
import { leaveOut, placeOf, type PartWord, type Reader } from './context'
import { closestAncestors, prop } from './hast'
import { followableHref } from './inline'

const CHROME_ROLES = new Map<string, PartWord>([
  ['navigation', 'nav'],
  ['banner', 'header'],
  ['contentinfo', 'footer'],
])
const STYLE_RELS = new Set(['stylesheet', 'preconnect', 'dns-prefetch', 'preload', 'prefetch'])
const HOLDER_WORDS = new Map<string, PartWord>([
  ['li', 'list'],
  ['td', 'table'],
  ['th', 'table'],
])

const MAP_WORDS = /(^|[^a-z])maps?([^a-z]|$)|openstreetmap|mapbox|leaflet/
const VIDEO_WORDS = /youtube|youtu\.be|vimeo|(^|[^a-z])video([^a-z]|$)|\.(mp4|webm|mov)([^a-z]|$)/

/**
 * Inline styles and the code a file hides in attributes: handlers and `javascript:`
 * links. Only the attribute is dropped, so the element itself is still read.
 */
export const scanAttributes = (r: Reader) => {
  for (const el of r.elements) {
    if (prop(el, 'style') !== undefined || el.tagName === 'font') {
      r.leftOut.add('styling', placeOf(el, 'styling', r))
    }
    const handlers = Object.keys(el.properties).some((name) => /^on[A-Z]/.test(name))
    const scriptLink = /^\s*javascript:/i.test(prop(el, 'href') ?? '')
    if (handlers || scriptLink) r.leftOut.add('scripts', placeOf(el, 'script', r))
  }
}

/** The site around the page: its navigation, and a header or footer outside its content. */
export const siteChrome = (el: Element, r: Reader): PartWord | undefined => {
  if (el.tagName === 'nav') return 'nav'
  const role = CHROME_ROLES.get(prop(el, 'role') ?? '')
  if (role) return role
  if (el.tagName !== 'header' && el.tagName !== 'footer') return undefined
  return r.contentOf.has(el) ? undefined : el.tagName
}

/** A `<link>`: a script or styling the file loads; an icon or feed is the file's own metadata. */
export const resource = (el: Element, r: Reader) => {
  const rels = (prop(el, 'rel') ?? '').toLowerCase().split(/\s+/)
  if (rels.includes('modulepreload') || prop(el, 'as') === 'script') {
    return leaveOut('scripts', el, 'script', r)
  }
  if (rels.some((rel) => STYLE_RELS.has(rel))) leaveOut('styling', el, 'styling', r)
}

/** An embedded app, named by what it shows. */
export const embed = (el: Element, r: Reader) => {
  const words = ['src', 'data', 'title', 'ariaLabel']
    .map((name) => prop(el, name) ?? '')
    .join(' ')
    .toLowerCase()
  if (MAP_WORDS.test(words)) return leaveOut('map', el, 'map', r)
  if (VIDEO_WORDS.test(words)) return leaveOut('video', el, 'video', r)
  leaveOut('app', el, 'embedded app', r)
}

/**
 * Every followable link whose address no block carries, by where it sat: a list,
 * a table, or loose. Links inside a part already listed are that part's.
 */
export const listUncarriedLinks = (r: Reader) => {
  const listed = closestAncestors(r.elements, r.parents, (up) => r.accounted.has(up))
  const holders = closestAncestors(r.elements, r.parents, (up) => HOLDER_WORDS.has(up.tagName))
  for (const a of r.elements) {
    if (a.tagName !== 'a' || r.carried.has(a) || !followableHref(a, r.baseUrl)) continue
    if (r.accounted.has(a) || listed.has(a)) continue
    const holder = holders.get(a)
    const word = (holder && HOLDER_WORDS.get(holder.tagName)) ?? 'link'
    r.leftOut.add('linkAddress', placeOf(a, word, r))
  }
}
