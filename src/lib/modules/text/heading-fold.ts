/**
 * KAN-515: which blocks a page's folded toggle headings hide — pure, derived
 * live from `blocks` every render (same pattern as `toc/headings.ts`), never
 * stored on the hidden blocks themselves.
 *
 * Tracks only the SHALLOWEST active fold's level, not a full stack: a fold
 * nested inside an already-active outer fold always closes at or before the
 * heading that closes the outer one (its level is deeper, so any heading
 * shallow enough to close the outer fold is also shallow enough to close the
 * inner one) — so the deeper fold never needs separate bookkeeping, and a
 * single number is enough to know whether the next block is hidden.
 */
import type { Block } from '../content'
import { headingLevelOfLine } from './heading-line'

export function hiddenBlockIds(blocks: Block[]): Set<string> {
  const hidden = new Set<string>()
  let activeFoldLevel: number | null = null

  for (const block of blocks) {
    const headingLevel = block.type === 'text' ? headingLevelOfLine(block.content) : null

    // A heading at or above (shallower than, or the same as) the active fold's
    // level is "the next heading it meets" — the fold ends there, and that
    // heading's own row is not hidden by the fold it just closed.
    if (headingLevel !== null && activeFoldLevel !== null && headingLevel <= activeFoldLevel) {
      activeFoldLevel = null
    }

    if (activeFoldLevel !== null) {
      hidden.add(block.id)
    }

    // A folded toggle heading's own row is never hidden by its own fold — only
    // what follows it — so this starts (or deepens) the active fold only after
    // the row above decided this block's own visibility.
    if (block.type === 'text' && block.toggle && block.folded && headingLevel !== null) {
      activeFoldLevel = activeFoldLevel === null ? headingLevel : Math.min(activeFoldLevel, headingLevel)
    }
  }

  return hidden
}
