/**
 * JSON writer that keeps a whole element's spec on one line.
 *
 * `JSON.stringify(doc, null, 2)` explodes every style object over 6–20 lines,
 * which both doubles the file and makes it unreadable: the values that belong
 * together end up scattered down the page. Any subtree short enough to fit a line
 * is written compactly instead, so one grep hit returns one element's whole spec —
 *
 *   "eyebrow": { "fontSize": 10.5, "fontWeight": 500, "letterSpacing": ".1em", … }
 *   "hover": { "btn": { "opacity": 0.9 } }
 *
 * Output is deterministic (insertion order throughout), so the regeneration test
 * can compare it byte for byte.
 */

const INDENT = '  '
/** Above this a one-liner stops being readable, so the subtree is expanded. */
const INLINE_MAX = 600

/** Single-line form, used both as the output and as the fits-on-a-line test. */
function compact(v: unknown): string {
  if (typeof v !== 'object' || v === null) return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(compact).join(', ')}]`
  const parts = Object.entries(v)
    .filter(([, x]) => x !== undefined)
    .map(([k, x]) => `${JSON.stringify(k)}: ${compact(x)}`)
  return parts.length ? `{ ${parts.join(', ')} }` : '{}'
}

function write(v: unknown, depth: number, out: string[]): void {
  const one = compact(v)
  if (typeof v !== 'object' || v === null || one.length <= INLINE_MAX) {
    out.push(one)
    return
  }
  const pad = INDENT.repeat(depth + 1)
  const close = INDENT.repeat(depth)
  if (Array.isArray(v)) {
    out.push('[\n')
    v.forEach((item, i) => {
      out.push(pad)
      write(item, depth + 1, out)
      out.push(i === v.length - 1 ? '\n' : ',\n')
    })
    out.push(`${close}]`)
    return
  }
  const entries = Object.entries(v).filter(([, x]) => x !== undefined)
  out.push('{\n')
  entries.forEach(([k, x], i) => {
    out.push(pad, JSON.stringify(k), ': ')
    write(x, depth + 1, out)
    out.push(i === entries.length - 1 ? '\n' : ',\n')
  })
  out.push(`${close}}`)
}

export function serialise(doc: unknown): string {
  const out: string[] = []
  write(doc, 0, out)
  out.push('\n')
  return out.join('')
}
