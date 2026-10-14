/**
 * Finds every `@<title>` run in a composer value that matches one of the
 * live whole-page reference titles (KAN-99's mention pill). The `@` is
 * preceded by start-of-string or whitespace (`activeMentionQuery`'s own leading
 * rule), and the run ends at a non-word character or the string's end — board
 * 6e frame 4's example (`...blocking @kitchen renovation?`) still pills
 * through the trailing `?`, while `@kitchen renovations` doesn't paint a pill
 * for the shorter title `kitchen renovation`.
 */
export interface MentionPillRun {
  start: number
  end: number
}

export function mentionPillRuns(value: string, titles: readonly string[]): MentionPillRun[] {
  const runs: MentionPillRun[] = []
  for (const title of titles) {
    if (!title) continue
    const needle = `@${title}`
    let from = 0
    while (from <= value.length) {
      const i = value.indexOf(needle, from)
      if (i === -1) break
      from = i + 1
      const before = i === 0 || /\s/.test(value[i - 1])
      const end = i + needle.length
      const after = end >= value.length || !/\w/.test(value[end])
      if (before && after) runs.push({ start: i, end })
    }
  }
  return runs.sort((a, b) => a.start - b.start)
}
