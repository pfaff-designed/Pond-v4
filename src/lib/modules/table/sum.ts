/**
 * Table numeric intelligence (ticket-31) — pure, server-safe, no React.
 *
 * A table cell is free text ("$459 (bought!)", "1,200", "$20–60", "n/a"). To total a
 * column we extract ONE number per cell as leniently as a person reading the table
 * would, then sum the cells that yielded a number. Cells that yield nothing (junk,
 * blanks, notes) are skipped, never counted as zero — a footer over ten prices and
 * two "TBD" rows should total the ten, not dilute them.
 *
 * Parsing rules (documented + fenced by `table-sum.test.ts`):
 *
 *  - Currency symbols, thousands separators, and surrounding text are stripped:
 *    "$1,299.50" → 1299.5, "USD 40" → 40, "$459 (bought!)" → 459.
 *  - A leading minus (or parenthesised accounting negative "(45)") is honoured:
 *    "-12" → -12, "(45)" → -45.
 *  - A RANGE ("$20–60", "10 to 15", "5-7") resolves to its MIDPOINT — the most
 *    honest single figure for a budget estimate (a "$20–60" line contributes $40).
 *    En-dash, em-dash, hyphen, and the word "to" are all accepted as separators.
 *  - A bare hyphen with no second number ("-") is a negative sign only if a number
 *    follows; a lone "-" or "—" is treated as no value (a common "blank" marker).
 *  - Percentages keep their numeric part ("35%" → 35); the caller decides meaning.
 *  - Junk with no digits ("n/a", "TBD", "") yields null and is skipped from the sum.
 */

/** Parse one cell to a single number, or `null` when it carries no usable figure. */
export function parseNumericCell(raw: string): number | null {
  const text = raw.trim()
  if (text === '') return null

  // Range → midpoint. Look for two numbers separated by a dash/en-dash/em-dash or
  // the word "to". Guard against a leading-sign hyphen ("-5") being read as a range.
  const range = matchRange(text)
  if (range) return (range[0] + range[1]) / 2

  return extractNumber(text)
}

/**
 * Sum a table column by index across rows, leniently parsing each cell. Returns the
 * running total and how many cells actually contributed (so the footer can stay
 * quiet when a column has no numbers at all). Out-of-range cells are skipped.
 */
export function sumColumn(
  rows: readonly { cells: string[] }[],
  columnIndex: number
): {
  total: number
  counted: number
} {
  let total = 0
  let counted = 0
  for (const row of rows) {
    const cell = row.cells[columnIndex]
    if (cell === undefined) continue
    const n = parseNumericCell(cell)
    if (n === null) continue
    total += n
    counted++
  }
  return { total, counted }
}

// --- internals -------------------------------------------------------------------

const NUMBER = String.raw`-?\d[\d,]*(?:\.\d+)?`
// Two numbers with a range separator between them: "20-60", "20 – 60", "10 to 15".
// The right-hand number must be unsigned (a second minus would be nonsensical here),
// which also stops "-5" from matching as an open range.
const RANGE_RE = new RegExp(String.raw`(${NUMBER})\s*(?:–|—|-|\bto\b)\s*(\d[\d,]*(?:\.\d+)?)`, 'i')

function matchRange(text: string): [number, number] | null {
  const m = RANGE_RE.exec(text)
  if (!m) return null
  const lo = toNumber(m[1])
  const hi = toNumber(m[2])
  if (lo === null || hi === null) return null
  return [lo, hi]
}

function extractNumber(text: string): number | null {
  // Parenthesised accounting negative: "(45)" or "($45.00)" → -45.
  const paren = /^\(\s*[^\d(]*(\d[\d,]*(?:\.\d+)?)[^)\d]*\)$/.exec(text)
  if (paren) {
    const n = toNumber(paren[1])
    return n === null ? null : -n
  }
  // First signed number anywhere in the string ("$459 (bought!)" → 459, "-12" → -12).
  const m = new RegExp(NUMBER).exec(text)
  return m ? toNumber(m[0]) : null
}

function toNumber(s: string): number | null {
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
