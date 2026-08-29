import { parseCsv, formatCsvContext, MAX_CSV_BYTES, MAX_CSV_ROWS } from '../parse-csv'

// ── Happy path ────────────────────────────────────────────────────────────────

describe('parseCsv — happy path', () => {
  test('parses a simple 3-column CSV', () => {
    const result = parseCsv('Name,Age,City\nAlice,30,NYC\nBob,25,LA')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.headers).toEqual(['Name', 'Age', 'City'])
    expect(result.rows).toEqual([
      ['Alice', '30', 'NYC'],
      ['Bob', '25', 'LA'],
    ])
    expect(result.totalRows).toBe(2)
    expect(result.truncated).toBe(false)
  })

  test('handles CRLF line endings', () => {
    const result = parseCsv('a,b\r\n1,2\r\n3,4')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.headers).toEqual(['a', 'b'])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual(['1', '2'])
  })

  test('handles standalone CR line endings', () => {
    const result = parseCsv('a,b\r1,2\r3,4')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(2)
  })

  test('handles quoted fields with embedded commas', () => {
    const result = parseCsv('Name,Address\n"Smith, John","123 Main St, Apt 4"')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0]).toEqual(['Smith, John', '123 Main St, Apt 4'])
  })

  test('handles doubled quotes inside a quoted field', () => {
    const result = parseCsv('Quote\n"He said ""hello"""')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0][0]).toBe('He said "hello"')
  })

  test('handles embedded newlines in quoted fields', () => {
    const result = parseCsv('id,note\n1,"line one\nline two"')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0][1]).toBe('line one\nline two')
  })

  test('strips UTF-8 BOM', () => {
    const result = parseCsv('﻿a,b\n1,2')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.headers[0]).toBe('a')
  })

  test('trims whitespace from headers', () => {
    const result = parseCsv(' Name , Age \n Alice , 30 ')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.headers).toEqual(['Name', 'Age'])
  })

  test('handles a trailing newline without adding an empty row', () => {
    const result = parseCsv('a,b\n1,2\n')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(1)
  })

  test('pads short rows to header width', () => {
    const result = parseCsv('a,b,c\n1,2')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0]).toEqual(['1', '2', ''])
  })

  test('trims long rows to header width', () => {
    const result = parseCsv('a,b\n1,2,3,4')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0]).toEqual(['1', '2'])
  })
})

// ── Headers-only ─────────────────────────────────────────────────────────────

describe('parseCsv — headers-only', () => {
  test('returns ok with empty rows when only header row present', () => {
    const result = parseCsv('Name,Age,City')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.headers).toEqual(['Name', 'Age', 'City'])
    expect(result.rows).toHaveLength(0)
    expect(result.totalRows).toBe(0)
  })
})

// ── Empty / degenerate inputs ─────────────────────────────────────────────────

describe('parseCsv — empty inputs', () => {
  test('empty string → empty error', () => {
    const result = parseCsv('')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('empty')
  })

  test('whitespace-only string → empty error', () => {
    const result = parseCsv('   \n\n  ')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('empty')
  })

  test('BOM-only → empty error', () => {
    const result = parseCsv('﻿')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('empty')
  })
})

// ── Row cap ───────────────────────────────────────────────────────────────────

describe('parseCsv — row cap', () => {
  test('caps at MAX_CSV_ROWS and sets truncated=true', () => {
    // Generate 510 data rows + 1 header = 511 lines
    const lines = ['col1,col2']
    for (let i = 0; i < MAX_CSV_ROWS + 10; i++) lines.push(`val${i},${i}`)
    const result = parseCsv(lines.join('\n'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(MAX_CSV_ROWS)
    expect(result.truncated).toBe(true)
    expect(result.totalRows).toBe(MAX_CSV_ROWS + 10)
  })

  test('exactly MAX_CSV_ROWS rows is NOT truncated', () => {
    const lines = ['col1,col2']
    for (let i = 0; i < MAX_CSV_ROWS; i++) lines.push(`v${i},${i}`)
    const result = parseCsv(lines.join('\n'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.truncated).toBe(false)
    expect(result.rows).toHaveLength(MAX_CSV_ROWS)
  })
})

// ── Size cap ──────────────────────────────────────────────────────────────────

describe('parseCsv — size cap', () => {
  test('rejects a string larger than MAX_CSV_BYTES', () => {
    // Use a string of char length well above the byte cap — each char is 1 byte ASCII
    // but the pessimistic branch (no Buffer in some envs) doubles it; ensure
    // actual byte length > MAX_CSV_BYTES regardless.
    const bigRow = 'a'.repeat(201_000) // definitely > 200 KB as UTF-8
    const result = parseCsv(`col\n${bigRow}`)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('too_large')
  })

  test('accepts exactly one byte under MAX_CSV_BYTES', () => {
    // Build a CSV just under the limit — 'a' chars are 1 byte each
    const content = 'a'.repeat(MAX_CSV_BYTES - 5)
    // This is just a big field, no newlines — parser will see header+0 rows
    const result = parseCsv(`col\n${content}`)
    // May be ok or parse_error depending on content, but NOT too_large
    if (!result.ok) {
      expect(result.reason).not.toBe('too_large')
    }
  })
})

// ── Malformed CSV ─────────────────────────────────────────────────────────────

describe('parseCsv — malformed CSV', () => {
  test('a CSV with normal structure still parses even with mixed quoting', () => {
    // Mixed quoting (some fields quoted, some not) is allowed by RFC 4180 variations
    const result = parseCsv('a,b\n"hello",world')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0]).toEqual(['hello', 'world'])
  })

  test('ragged rows are handled gracefully (no throw)', () => {
    const result = parseCsv('a,b,c\n1\n2,3')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0]).toEqual(['1', '', ''])
    expect(result.rows[1]).toEqual(['2', '3', ''])
  })
})

// ── formatCsvContext ──────────────────────────────────────────────────────────

describe('formatCsvContext', () => {
  test('formats a simple result with filename', () => {
    const parseResult = parseCsv('Name,Score\nAlice,95\nBob,80')
    if (!parseResult.ok) throw new Error('parse failed')
    const ctx = formatCsvContext(parseResult, 'grades.csv')
    expect(ctx).toContain('grades.csv')
    expect(ctx).toContain('Name | Score')
    expect(ctx).toContain('Alice | 95')
    expect(ctx).toContain('propose_changes')
    expect(ctx).toContain('THIS turn only')
  })

  test('notes truncation when rows are capped', () => {
    const lines = ['col1,col2']
    for (let i = 0; i < MAX_CSV_ROWS + 5; i++) lines.push(`v${i},${i}`)
    const parseResult = parseCsv(lines.join('\n'))
    if (!parseResult.ok) throw new Error('parse failed')
    const ctx = formatCsvContext(parseResult, 'big.csv')
    expect(ctx).toContain('truncated')
  })

  test('does not note truncation for small files', () => {
    const parseResult = parseCsv('a,b\n1,2\n3,4')
    if (!parseResult.ok) throw new Error('parse failed')
    const ctx = formatCsvContext(parseResult, 'small.csv')
    expect(ctx).not.toContain('truncated')
  })
})
