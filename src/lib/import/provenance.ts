/**
 * Where each block came from (7k: "each block says which part of the file it came
 * from"), as a short path: `section 2 › table`, `section 1 › paragraph 3`.
 *
 * A part is numbered only when its section holds more than one of its kind, so the
 * total has to be known first: `note` hands back a ticket and `resolve` words it
 * once the whole file has been read.
 */

const SEPARATOR = ' › '

export const joinPath = (segments: readonly string[]): string => segments.join(SEPARATOR)

export interface PathTracker {
  /** The next section inside `within`: `section 1`, `section 2`, … */
  section: (within: readonly string[]) => string
  note: (within: readonly string[], kind: string) => number
  resolve: (ticket: number) => string
}

export const trackPaths = (): PathTracker => {
  const sections = new Map<string, number>()
  const totals = new Map<string, number>()
  const notes: { within: string; kind: string; n: number }[] = []
  const keyOf = (within: string, kind: string) => `${within}\u0000${kind}`

  return {
    section: (within) => {
      const key = joinPath(within)
      const n = (sections.get(key) ?? 0) + 1
      sections.set(key, n)
      return `section ${n}`
    },
    note: (within, kind) => {
      const path = joinPath(within)
      const key = keyOf(path, kind)
      const n = (totals.get(key) ?? 0) + 1
      totals.set(key, n)
      notes.push({ within: path, kind, n })
      return notes.length - 1
    },
    resolve: (ticket) => {
      const { within, kind, n } = notes[ticket]
      const leaf = (totals.get(keyOf(within, kind)) ?? 1) > 1 ? `${kind} ${n}` : kind
      return within === '' ? leaf : `${within}${SEPARATOR}${leaf}`
    },
  }
}
