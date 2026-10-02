/**
 * Parses an inline `style` attribute into an ordered property map.
 *
 * The attribute is the spec — the boards are static HTML with every colour, size,
 * radius, shadow and spacing written inline. Nothing here resolves a shorthand or
 * normalises a unit: `13.5px` stays `13.5px`, because a value written in a board
 * is final and must not be rounded to a scale or snapped to a token.
 */

export function parseStyle(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  let depth = 0
  let buf = ''
  const decls: string[] = []
  for (const ch of src) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ';' && depth === 0) {
      decls.push(buf)
      buf = ''
      continue
    }
    buf += ch
  }
  decls.push(buf)
  for (const decl of decls) {
    const i = decl.indexOf(':')
    if (i < 1) continue
    const prop = decl.slice(0, i).trim()
    const value = decl.slice(i + 1).trim()
    if (prop && value) out[prop] = value
  }
  return out
}
