/**
 * Extracts the static boards (`Pond NN …dc.html`) frame by frame.
 *
 * Unlike the component files, these ARE static markup: every value is written
 * inline in a `style` attribute. Those attributes are the spec. The rendered rect
 * is not — the frames sit under a CSS `transform`, so a measured box lies about
 * every number. Hence parse, never browse.
 *
 * Per frame we keep the `data-screen-label`, the caption prose beside it, the
 * frame root's own style, every `<dc-import>` usage (which is the board's record
 * of which component variants it shows), and every styled element with its text.
 */

import { directText, parseHtml, walk, type ElNode } from './html.mts'
import { parseStyle } from './style.mts'

export type BoardElement = {
  path: string
  tag: string
  text?: string
  style: Record<string, string>
}

export type BoardImport = {
  component: string
  props: Record<string, string>
}

export type BoardFrame = {
  id: string
  label: string
  caption?: string
  style: Record<string, string>
  imports: BoardImport[]
  elements: BoardElement[]
}

export type BoardValues = {
  source: string
  frames: BoardFrame[]
}

const TEXT_CAP = 200
/** Annotation chrome from the handoff's own doc viewer, not product surface. */
const CHROME_CLASS = /\bdv-(turn|thd|tid|tname|grp|opts|opt|olabel|oid|note)\b/

function frameRoots(roots: ElNode[]): ElNode[] {
  const found: ElNode[] = []
  walk(roots, (el) => {
    if (el.attrs['data-screen-label']) found.push(el)
  })
  return found
}

function captionFor(roots: ElNode[], frame: ElNode): string | undefined {
  // The caption is the `.dv-olabel` sibling inside the same `.dv-opt` wrapper.
  let caption: string | undefined
  walk(roots, (el) => {
    if (!/\bdv-opt\b/.test(el.attrs.class ?? '')) return
    let holds = false
    walk([el], (inner) => {
      if (inner === frame) holds = true
    })
    if (!holds) return
    walk([el], (inner) => {
      if (caption === undefined && /\bdv-olabel\b/.test(inner.attrs.class ?? '')) {
        caption = allText(inner)
      }
    })
  })
  return caption
}

/** Caption prose, skipping the `dv-oid` badge that repeats the frame id. */
function allText(el: ElNode): string {
  let out = ''
  for (const c of el.children) {
    if (c.type === 'text') out += c.text
    else if (!/\bdv-oid\b/.test(c.attrs.class ?? '')) out += `${allText(c)} `
  }
  return out
    .replace(/\s+/g, ' ')
    .replace(/ ([,.;:)])/g, '$1')
    .trim()
}

function frameId(roots: ElNode[], frame: ElNode, label: string): string {
  let id: string | undefined
  walk(roots, (el) => {
    if (!/\bdv-opt\b/.test(el.attrs.class ?? '') || !el.attrs.id) return
    walk([el], (inner) => {
      if (inner === frame) id = el.attrs.id
    })
  })
  return id ?? label.split(/\s+/)[0]
}

function importsOf(frame: ElNode): BoardImport[] {
  const out: BoardImport[] = []
  walk([frame], (el) => {
    if (el.tag !== 'dc-import') return
    const props: Record<string, string> = {}
    for (const [k, v] of Object.entries(el.attrs)) {
      if (k === 'name' || k.startsWith('hint-')) continue
      props[k] = v
    }
    out.push({ component: el.attrs.name ?? '(unnamed)', props })
  })
  return out
}

function elementsOf(frame: ElNode): BoardElement[] {
  const out: BoardElement[] = []
  const visit = (el: ElNode, trail: string[]) => {
    for (let i = 0; i < el.children.length; i++) {
      const c = el.children[i]
      if (c.type !== 'el') continue
      const path = [...trail, `${c.tag}[${i}]`]
      const styleSrc = c.attrs.style
      if (styleSrc && !CHROME_CLASS.test(c.attrs.class ?? '')) {
        const text = directText(c)
        out.push({
          path: path.join('>'),
          tag: c.tag,
          ...(text ? { text: text.slice(0, TEXT_CAP) } : {}),
          style: parseStyle(styleSrc),
        })
      }
      visit(c, path)
    }
  }
  visit(frame, [])
  return out
}

export function buildBoard(html: string, source: string): BoardValues {
  // The trailing logic block is the doc viewer's own runtime, never product spec.
  const cut = html.indexOf('<script type="text/x-dc"')
  const roots = parseHtml(cut > 0 ? html.slice(0, cut) : html).filter(
    (n): n is ElNode => n.type === 'el'
  )
  const frames = frameRoots(roots).map((frame) => {
    const label = frame.attrs['data-screen-label'] ?? ''
    const caption = captionFor(roots, frame)
    return {
      id: frameId(roots, frame, label),
      label,
      ...(caption ? { caption } : {}),
      style: parseStyle(frame.attrs.style ?? ''),
      imports: importsOf(frame),
      elements: elementsOf(frame),
    }
  })
  return { source, frames }
}
