/**
 * Client-side CSV parser for the CSV-upload composer attachment (ticket-40 F16).
 *
 * Parses a raw CSV string into a typed result:
 *   - Detects BOM and strips it.
 *   - Detects CRLF vs LF line endings.
 *   - RFC 4180 quoted fields (embedded commas, quotes, newlines).
 *   - Hard caps: MAX_CSV_BYTES / MAX_CSV_ROWS — anything over these yields a
 *     ParseError so the caller can surface an honest "too big for now" toast.
 *
 * Pure — no browser globals, no React — jest-safe.
 */

/** ~200 KB file-size cap (checked against string byte length via TextEncoder). */
export const MAX_CSV_BYTES = 200_000
/** Row cap — the first 500 data rows are kept, header excluded. */
export const MAX_CSV_ROWS = 500
/** Max columns per row — ragged rows are padded/trimmed to the header width. */
const MAX_COLS = 500

export interface CsvParseOk {
  ok: true
  headers: string[]
  rows: string[][]
  /** The total number of data rows BEFORE the cap (may exceed rows.length). */
  totalRows: number
  /** True when the file was truncated to MAX_CSV_ROWS. */
  truncated: boolean
}

export interface CsvParseError {
  ok: false
  reason: 'too_large' | 'empty' | 'parse_error'
  message: string
}

export type CsvParseResult = CsvParseOk | CsvParseError

/**
 * Parse a raw CSV string. Accepts Windows CRLF, Unix LF, and classic CR.
 * Handles BOM, quoted fields with embedded delimiters/newlines, and ragged rows.
 * Returns CsvParseError on size violations or unrecoverable parse failure.
 */
export function parseCsv(raw: string): CsvParseResult {
  // Size cap (bytes, not chars — TextEncoder.encode is unavailable in Node
  // test env without polyfill, so approximate with Buffer when available or
  // fall back to char count * 2 pessimistic bound).
  const byteLength = typeof Buffer !== 'undefined' ? Buffer.byteLength(raw, 'utf8') : raw.length * 2 // pessimistic upper bound safe for the cap

  if (byteLength > MAX_CSV_BYTES) {
    return {
      ok: false,
      reason: 'too_large',
      message: `File exceeds the ~200 KB limit (${Math.round(byteLength / 1024)} KB). Try a smaller export.`,
    }
  }

  // Strip UTF-8 BOM if present.
  const text = raw.startsWith('﻿') ? raw.slice(1) : raw

  if (!text.trim()) {
    return { ok: false, reason: 'empty', message: 'The file appears to be empty.' }
  }

  // Parse into rows of fields using a state machine (RFC 4180).
  let allRows: string[][]
  try {
    allRows = parseFields(text)
  } catch (e) {
    return {
      ok: false,
      reason: 'parse_error',
      message: e instanceof Error ? e.message : 'Could not parse the CSV.',
    }
  }

  if (allRows.length === 0) {
    return { ok: false, reason: 'empty', message: 'No rows found in the file.' }
  }

  const headers = allRows[0].map((h) => h.trim())
  if (headers.length === 0 || headers.every((h) => h === '')) {
    return { ok: false, reason: 'empty', message: 'No column headers found.' }
  }

  const colCount = Math.min(headers.length, MAX_COLS)
  const trimmedHeaders = headers.slice(0, colCount)

  const dataRows = allRows.slice(1)
  const totalRows = dataRows.length
  const truncated = totalRows > MAX_CSV_ROWS
  const capped = dataRows.slice(0, MAX_CSV_ROWS)

  // Normalise each row to exactly colCount cells.
  const rows = capped.map((row) => {
    const padded = [...row.slice(0, colCount)]
    while (padded.length < colCount) padded.push('')
    return padded
  })

  return { ok: true, headers: trimmedHeaders, rows, totalRows, truncated }
}

/**
 * RFC 4180 state-machine field parser. Returns an array of rows, each an array
 * of field strings. Supports CRLF, LF, and standalone CR as line terminators.
 * Quoted fields may contain any character including embedded delimiters and newlines.
 */
function parseFields(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead: doubled quote → literal quote char.
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        // Closing quote — exit quoted mode.
        inQuotes = false
        i++
        continue
      }
      // Any other char (including newline) is part of the quoted field.
      field += ch
      i++
      continue
    }

    // Unquoted mode.
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }

    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }

    // Line terminator: CRLF, LF, or standalone CR.
    if (ch === '\r' || ch === '\n') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      // Skip \n that follows a \r (CRLF pair).
      if (ch === '\r' && text[i + 1] === '\n') i++
      i++
      continue
    }

    field += ch
    i++
  }

  // Flush the last field/row.
  if (field || row.length > 0) {
    row.push(field)
    // Ignore a trailing empty row (file ends with a newline → last split is [''])
    if (!(row.length === 1 && row[0] === '')) {
      rows.push(row)
    }
  }

  return rows
}

/**
 * Format a parsed CSV result as a single-turn context block for injection into
 * the Pond chat (mirrors paste-link's formatLinkContext pattern). Includes headers
 * and the first sample rows so the model can propose a table/chart.
 *
 * Kept pure — no React dependency, fully testable.
 */
export function formatCsvContext(result: CsvParseOk, filename: string): string {
  const SAMPLE_ROWS = 10
  const headerLine = result.headers.join(' | ')
  const sampleLines = result.rows
    .slice(0, SAMPLE_ROWS)
    .map((r) => r.join(' | '))
    .join('\n')

  const truncNote = result.truncated
    ? `\n(Showing ${SAMPLE_ROWS} of ${result.totalRows} rows; full upload truncated to ${MAX_CSV_ROWS} rows.)`
    : result.rows.length > SAMPLE_ROWS
      ? `\n(Showing ${SAMPLE_ROWS} of ${result.rows.length} rows.)`
      : ''

  return [
    `The user uploaded a CSV file ("${filename}") for THIS turn only. ` +
      `Use it to propose a table or chart block via propose_changes. ` +
      `On later turns you will no longer have this data.`,
    `Columns: ${result.headers.join(', ')}`,
    `--- CSV preview ---\n${headerLine}\n${sampleLines}${truncNote}`,
  ].join('\n\n')
}
