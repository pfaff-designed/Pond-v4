/**
 * Minimal tolerant HTML reader for the design handoff's `.dc.html` files.
 *
 * Why not a dependency: the handoff markup is machine-generated and well formed,
 * and the only thing we need from it is the tag tree plus attributes. A 90-line
 * scanner keeps the extractor dependency-free (it runs under plain `node`, no
 * bundler, no jsdom) and — critically — never computes layout. Geometry in the
 * handoff lives in the `style` attribute; the frames render under a CSS
 * transform, so any computed rect would lie. See README in the generated JSON.
 */

export type Attrs = Record<string, string>
export type ElNode = { type: 'el'; tag: string; attrs: Attrs; children: HtmlNode[] }
export type TextNode = { type: 'text'; text: string }
export type HtmlNode = ElNode | TextNode

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])
const RAW = new Set(['script', 'style'])

// Quoted attribute values may contain `>`, so match them before the catch-all.
const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g
const ATTR_RE = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  middot: '·',
  times: '×',
  rarr: '→',
}

/** Decode the entity forms the handoff actually uses (plus numeric refs). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const n =
        body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1))
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole
    }
    return NAMED[body] ?? whole
  })
}

function parseAttrs(src: string): Attrs {
  const out: Attrs = {}
  ATTR_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ATTR_RE.exec(src))) {
    const name = m[1].toLowerCase()
    if (!name || name === '/') continue
    out[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return out
}

/** Parse an HTML string into a flat list of roots. Comments and doctypes are dropped. */
export function parseHtml(html: string): HtmlNode[] {
  const roots: HtmlNode[] = []
  const stack: ElNode[] = []
  const push = (n: HtmlNode) => (stack.length ? stack[stack.length - 1].children : roots).push(n)
  const text = (raw: string) => {
    if (raw.trim()) push({ type: 'text', text: decodeEntities(raw) })
  }

  let i = 0
  TAG_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TAG_RE.exec(html))) {
    if (m.index < i) continue
    text(html.slice(i, m.index))
    i = m.index + m[0].length
    const [, close, rawTag, attrSrc, selfClose] = m
    const tag = rawTag.toLowerCase()

    if (close) {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].tag === tag) {
          stack.length = k
          break
        }
      }
      continue
    }

    const el: ElNode = { type: 'el', tag, attrs: parseAttrs(attrSrc), children: [] }
    push(el)
    if (selfClose || VOID.has(tag)) continue

    if (RAW.has(tag)) {
      const end = html.indexOf(`</${tag}`, i)
      const stop = end === -1 ? html.length : end
      if (html.slice(i, stop).trim()) el.children.push({ type: 'text', text: html.slice(i, stop) })
      i = stop
      TAG_RE.lastIndex = i
      continue
    }
    stack.push(el)
  }
  text(html.slice(i))
  return roots
}

/** Depth-first visit of every element, deepest-last, with its ancestor chain. */
export function walk(
  nodes: HtmlNode[],
  fn: (el: ElNode, path: ElNode[]) => void,
  path: ElNode[] = []
) {
  for (const n of nodes) {
    if (n.type !== 'el') continue
    fn(n, path)
    if (n.children.length) walk(n.children, fn, [...path, n])
  }
}

/** The element's own text, excluding descendants' — what identifies the thing. */
export function directText(el: ElNode): string {
  return el.children
    .filter((c): c is TextNode => c.type === 'text')
    .map((c) => c.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}
