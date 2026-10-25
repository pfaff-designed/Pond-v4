import { z } from 'zod'
import type { ModuleDescriptor } from '../types'

/**
 * `toggle` (KAN-480) — `/toggle`: a summary line with a hand-drawn ▸ that folds or
 * unfolds one body of child text under it. The page model is flat (nesting blocks
 * would break split-on-read, revert, change-log summary, layout rows and
 * BlockCanvas's index-based logic), so a toggle's children are NOT child blocks —
 * `body` is one string of markdown lines, like `content`.
 *
 * `body` and `folded` are both optional: absent `body` means an empty body (never
 * opened yet), absent `folded` means unfolded — so a page that predates this ticket
 * reads unchanged.
 */
export const toggleSchema = z.object({
  id: z.string(),
  type: z.literal('toggle'),
  /** The summary line, markdown. */
  content: z.string(),
  /** The child lines under the summary, markdown. Absent = no body written yet. */
  body: z.string().optional(),
  /** Whether the body is hidden. Absent = unfolded, the state a fresh toggle lands in. */
  folded: z.boolean().optional(),
})
export type ToggleBlock = z.infer<typeof toggleSchema>

/**
 * The stand-in `TextBlock` ids a toggle's two hosted editors register under
 * (`view.tsx`'s `ToggleField`s) — never the toggle's own id, since one block
 * hosts two editors. The one home for that mapping: a saved block's history
 * close (KAN-139/KAN-480) looks a toggle's editors up by these same ids, not
 * `block.id`, or it closes nothing and a field's own ⌘Z never falls through
 * to the shell's.
 */
export const toggleFieldIds = (id: string): { summary: string; body: string } => ({
  summary: `${id}-summary`,
  body: `${id}-body`,
})

export const toggleDescriptor: ModuleDescriptor<ToggleBlock> = {
  type: 'toggle',
  label: 'toggle',
  schema: toggleSchema,
  description:
    'A toggle: a summary line that folds or unfolds one body of text under it (▸). Use it to tuck ' +
    'detail a person can glance past and open later — a packing list under a trip, an aside under a ' +
    'note — never for a block of ordinary prose, which wants a plain text block instead. The fold ' +
    "state (`folded`) is the person's own and is never set here.",
  // `blocksToText` joins serialized lines with no type label, so bare content would
  // read as prose and come back as a plain `text` block on a wholesale re-emit — the
  // marker (as `highlight`'s) keeps a toggle a toggle, body included so the model can
  // still see what is tucked under the fold even though the page may hide it.
  serialize: (data) => {
    const summary = data.content.trim() || '(no summary yet)'
    const body = data.body?.trim()
    return body ? `Toggle: ${summary}\n${body}` : `Toggle: ${summary}`
  },
}
