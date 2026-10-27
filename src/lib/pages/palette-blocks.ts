/**
 * Pure helpers for the ⌘K palette's `in pages` group (KAN-473) — body-text
 * matches, below the page and record title groups. No React, no Supabase:
 * `use-palette-blocks.ts` calls the RPC and maps rows through these.
 *
 * `BLOCK_MIN_QUERY` is `palette-records.ts`'s own gate, re-exported under this
 * group's name rather than re-declared (one home for the value). The row's
 * `label` (`area › … › page`) reuses `ancestorPathLabel` — no second path
 * builder. `snippetRuns` underlines every occurrence of the query in a
 * snippet, unlike `slash-entries.ts`'s `matchRuns`, which only ever splits one
 * contiguous span: a snippet can repeat the query ("second fix" twice in one
 * line), and all of them read as matches.
 */

import { fold, type MatchRun } from '@/components/molecules/slash-entries'

import { ancestorPathLabel, type ParentPageRow } from './parent-options'

export { RECORD_MIN_QUERY as BLOCK_MIN_QUERY } from './palette-records'

/** The row's `label`: the page's ancestor path plus its own title. */
export const blockPageLabel = ancestorPathLabel
export type { ParentPageRow }

/**
 * `snippet` folded one code point at a time via `fold` (NFD, combining marks
 * stripped, lowercased), so a matched range can grow back to the exact
 * original character it came from — `map[i]` names `source[map[i]]` as
 * `text[i]`'s origin, the same technique `slash-entries.ts`'s `foldLabel`
 * uses for the palette's other highlights.
 */
function foldedChars(
  snippet: string
): { text: string; map: readonly number[]; source: readonly string[] } {
  const source = Array.from(snippet)
  const text: string[] = []
  const map: number[] = []
  source.forEach((ch, i) => {
    for (const folded of fold(ch)) {
      text.push(folded)
      map.push(i)
    }
  })
  return { text: text.join(''), map, source }
}

/**
 * Every case- and mark-insensitive, non-overlapping occurrence of `query` in
 * `snippet`, underlined: a run each where the text matched and where it
 * didn't, in order. An empty `query` returns the whole snippet as one
 * unmatched run, as `matchRuns` does.
 */
export function snippetRuns(snippet: string, query: string): MatchRun[] {
  const q = fold(query)
  if (!q) return [{ text: snippet, hit: false }]
  const { text, map, source } = foldedChars(snippet)
  const hitAt = new Set<number>()
  let from = 0
  for (;;) {
    const at = text.indexOf(q, from)
    if (at === -1) break
    for (let i = at; i < at + q.length; i++) hitAt.add(i)
    from = at + q.length
  }
  const sourceHit = new Array<boolean>(source.length).fill(false)
  hitAt.forEach((i) => {
    sourceHit[map[i]] = true
  })
  const runs: MatchRun[] = []
  let run = ''
  let runHit = false
  source.forEach((ch, i) => {
    const hit = sourceHit[i]
    if (run && hit === runHit) {
      run += ch
      return
    }
    if (run) runs.push({ text: run, hit: runHit })
    run = ch
    runHit = hit
  })
  if (run) runs.push({ text: run, hit: runHit })
  return runs
}
