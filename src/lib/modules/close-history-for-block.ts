import type { Block } from './content'
import { closeBlockHistory } from './text/active-editor'
import { toggleFieldIds } from './toggle/schema'

/**
 * Closes the mounted editor(s) backing a just-saved block's own text, once
 * the save is durable (KAN-139, KAN-480's seam) — the one home callers
 * (`commit.ts`, `use-page-draft.ts`) use instead of reaching for
 * `closeBlockHistory` by `block.id` directly. A toggle hosts two editors
 * under stand-in ids (`toggleFieldIds`), never its own block id, so both
 * close against their own saved value; every other block with `content`
 * closes against that, as before.
 */
export function closeHistoryForBlock(block: Block): void {
  if (block.type === 'toggle') {
    const { summary, body } = toggleFieldIds(block.id)
    closeBlockHistory(summary, block.content)
    closeBlockHistory(body, block.body ?? '')
    return
  }
  if ('content' in block) closeBlockHistory(block.id, block.content)
}
