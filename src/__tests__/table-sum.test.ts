/**
 * Table numeric intelligence (ticket-31) — the lenient cell parser + column sum.
 *
 * A budget/price column is free text; we extract ONE figure per cell as a person
 * would and total the cells that yielded a number, skipping the rest (never counting
 * junk as zero). These fences pin the documented rules: currency, thousands commas,
 * parenthesised notes, accounting negatives, ranges→midpoint, percentages, junk.
 */
import { parseNumericCell, sumColumn } from '@/lib/modules/table/sum'

describe('parseNumericCell', () => {
  it('strips currency symbols and trailing notes', () => {
    expect(parseNumericCell('$459 (bought!)')).toBe(459)
    expect(parseNumericCell('£40')).toBe(40)
    expect(parseNumericCell('€12.50')).toBe(12.5)
    expect(parseNumericCell('USD 40')).toBe(40)
  })

  it('handles thousands separators and decimals', () => {
    expect(parseNumericCell('$1,299.50')).toBe(1299.5)
    expect(parseNumericCell('1,200')).toBe(1200)
    expect(parseNumericCell('12,000,000')).toBe(12_000_000)
  })

  it('honours negatives — leading minus and parenthesised accounting form', () => {
    expect(parseNumericCell('-12')).toBe(-12)
    expect(parseNumericCell('($45.00)')).toBe(-45)
    expect(parseNumericCell('(45)')).toBe(-45)
  })

  it('resolves a range to its midpoint (documented choice)', () => {
    expect(parseNumericCell('$20–60')).toBe(40) // en-dash
    expect(parseNumericCell('20—60')).toBe(40) // em-dash
    expect(parseNumericCell('5-7')).toBe(6) // hyphen
    expect(parseNumericCell('10 to 15')).toBe(12.5) // word "to"
    expect(parseNumericCell('$1,000-2,000')).toBe(1500)
  })

  it('keeps the numeric part of a percentage', () => {
    expect(parseNumericCell('35%')).toBe(35)
    expect(parseNumericCell('-5%')).toBe(-5)
  })

  it('returns null for junk, blanks, and lone dashes', () => {
    expect(parseNumericCell('n/a')).toBeNull()
    expect(parseNumericCell('TBD')).toBeNull()
    expect(parseNumericCell('')).toBeNull()
    expect(parseNumericCell('   ')).toBeNull()
    expect(parseNumericCell('-')).toBeNull()
    expect(parseNumericCell('—')).toBeNull()
  })

  it('a leading minus is a sign, not an open range', () => {
    // "-5" must be -5, not a range with a missing right side.
    expect(parseNumericCell('-5')).toBe(-5)
  })
})

describe('sumColumn', () => {
  const rows = [
    { cells: ['Drill', '$120'] },
    { cells: ['Saw', '$89.50'] },
    { cells: ['Clamps', '$20–40'] }, // midpoint 30
    { cells: ['Gift card', 'TBD'] }, // skipped
    { cells: ['Sander', '($15)'] }, // accounting negative → -15
  ]

  it('totals only the cells that parse, skipping junk (not counting it as 0)', () => {
    const { total, counted } = sumColumn(rows, 1)
    expect(total).toBeCloseTo(120 + 89.5 + 30 - 15)
    expect(counted).toBe(4)
  })

  it('a column with no numbers contributes nothing and counts zero', () => {
    const { total, counted } = sumColumn(rows, 0)
    expect(total).toBe(0)
    expect(counted).toBe(0)
  })

  it('tolerates rows shorter than the column index', () => {
    const ragged = [{ cells: ['only-one-col'] }, { cells: ['x', '10'] }]
    const { total, counted } = sumColumn(ragged, 1)
    expect(total).toBe(10)
    expect(counted).toBe(1)
  })
})
