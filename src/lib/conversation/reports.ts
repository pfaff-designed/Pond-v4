/**
 * file_report (KAN-572) — what the person decided on a drafted report card.
 *
 * A report is not a diff: nothing on a page changes, so it never touches the
 * change log. Its outcome rides the conversation's resolutions envelope like a
 * question-card answer does, so a filed card stays filed across a reload (and
 * shows its key), a cancelled one stays gone, and `applyResolutions` tells the
 * model what happened instead of letting it re-draft the same report.
 *
 * Server-safe: pure data, no React.
 */

export type ReportResolution =
  { status: 'filed'; key: string; url: string } | { status: 'cancelled' }

/** file_report outcomes, by toolCallId. */
export type ReportResolutions = Record<string, ReportResolution>

function isReportResolution(x: unknown): x is ReportResolution {
  if (typeof x !== 'object' || x === null) return false
  const r = x as Record<string, unknown>
  if (r.status === 'cancelled') return true
  return (
    r.status === 'filed' &&
    typeof r.key === 'string' &&
    r.key.length > 0 &&
    typeof r.url === 'string'
  )
}

/** Tolerant parse — never throws, drops anything malformed. */
export function parseReportResolutions(value: unknown): ReportResolutions {
  if (typeof value !== 'object' || value === null) return {}
  const out: ReportResolutions = {}
  for (const [id, r] of Object.entries(value)) {
    if (!isReportResolution(r)) continue
    out[id] = r.status === 'filed' ? { status: 'filed', key: r.key, url: r.url } : r
  }
  return out
}
