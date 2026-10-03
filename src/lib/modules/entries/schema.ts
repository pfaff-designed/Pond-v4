import { z } from 'zod'
import { labelledBlockFields, type ModuleDescriptor } from '../types'

/**
 * `entries` (#250, child 228b of #228) — dated prose: a log of short things the
 * person wrote, each under its date. A block under ADR 0007's sorting rule (authored
 * content, not an aggregation of records), measured off `PondTemplate.dc.html`'s
 * `renderVals()` (`k === 'entries'`). The board places it twice — `project`'s
 * `updates` (sans) and `journal`'s `entries` (`serif: 1`) — so the medium is a real
 * conditional, exercised by the board itself.
 *
 * **Where the serif flag lives — decided (issue #250, ruling 4; ADR 0005).** The
 * board's `serif` is a property of the TEMPLATE definition, but a template is data
 * with no live tie to the page made from it (`AUDIT.md` 6f), so nothing could look
 * the flag up at render time. It is therefore a field on this block's own schema,
 * optional and defaulting to sans, which the journal template sets to `true` when it
 * instantiates (228e's work). Named after the board's own flag so the lineage is
 * greppable. The view reads `data.serif` and nothing else — never an ancestor.
 *
 * `date` is the label the board draws (`28 oct`, `today`): short authored copy in
 * the mono column, not a typed date — a dated log is prose with a date beside it,
 * and anything that needs date arithmetic is a database's job. Rows carry their own
 * ids for targeted edits, like `todo`'s items.
 *
 * The block-level `label` (#258) is the board's eyebrow — `updates` in `project`,
 * `entries` in `journal` — and follows the same reasoning as `serif`: template data
 * with no live tie back to the template, so it is persisted on the block, set by
 * 228e at instantiation. The shared mixin from `types.ts`; `blockFrame()` reads it
 * over the kind.
 */
export const entrySchema = z.object({
  id: z.string(),
  /** The date label as the board writes it — lowercase `d mmm` (`28 oct`), or `today`. */
  date: z.string(),
  /** The entry's prose, plain text. Empty string = written nothing yet. */
  text: z.string(),
})

export const entriesSchema = z
  .object({
    id: z.string(),
    type: z.literal('entries'),
    /** Newest first, as the board's `note: 'newest first'` and both its fixtures read. */
    entries: z.array(entrySchema),
    /**
     * The board's `serif` flag: the text is serif 200 / 16 / 1.55 when set, sans
     * 13.5 / 1.5 otherwise. Set by the journal template at instantiation; absent means
     * sans. See the module doc-comment for why it lives here.
     */
    serif: z.boolean().optional(),
  })
  .extend(labelledBlockFields)

export type Entry = z.infer<typeof entrySchema>
export type EntriesBlock = z.infer<typeof entriesSchema>

/**
 * The board's empty line for an entry (`PondTemplate.dc.html`, the journal's `e:`
 * row text) — lowercase, in the product's voice. Shown for a blank entry and as the
 * editing placeholder. (The project's `first update` is template copy, 228e's.)
 *
 * Byte-identical to `EMPTY_TITLE.entry` in `PondMolecule.tsx` by coincidence of two
 * boards landing on the same sentence, not by sharing. They are deliberately two
 * literals — `PondMolecule.dc.html` and `PondTemplate.dc.html` are different boards
 * and a value in a board is final — so if one board's copy changes, change only that
 * one. Noted here so the pair is a recorded decision rather than drift.
 */
export const ENTRIES_EMPTY_LINE = 'write the first entry'

export const entriesDescriptor: ModuleDescriptor<EntriesBlock> = {
  type: 'entries',
  // The board's `entry log` row.
  label: 'entry log',
  schema: entriesSchema,
  // The board's own hint for this row (`PondPicker.dc.html`, filtered: `entry log ·
  // dated table`) — it is what makes the board's `/ta` exemplar reproducible.
  paletteDescription: 'dated table',
  description:
    'A dated log of short written entries, newest first — journal entries, project updates, a record of what happened on which day. ' +
    'Each entry is a date label (lowercase, like "28 oct" or "today") and a few sentences of prose the person wrote. ' +
    'Use a table for structured records with columns, a plain text block for undated prose, and a checklist for things to do; ' +
    'use entries when the point is what was written on which day. Set `serif: true` only for a journal (diary prose); leave it off for updates and logs.',
  // `blocksToText` joins serialized lines with no type label, so bare rows would read
  // as prose and come back as a `text` block on a wholesale re-emit. The marker keeps
  // a dated log a dated log, and carries the serif flag so a journal stays a journal.
  serialize: (data) => {
    const head = data.serif ? 'Entries (serif):' : 'Entries:'
    if (data.entries.length === 0) return `${head} (no entries yet)`
    // One entry per line, so the boundary survives: the view supports multi-line
    // prose (`whitespace-pre-wrap`, an auto-growing textarea), and a raw newline would
    // emit an entry's second paragraph as an unlabelled line that a wholesale re-emit
    // could reattach to the wrong date. Newlines collapse to a space — whitespace is
    // the only thing lost, and `serialize`'s contract (render every piece of user
    // content) is kept. `todo` has the same shape without the hazard: its rows are
    // single-line inputs.
    const line = (text: string) => text.replace(/\s*\n+\s*/g, ' ')
    return [head, ...data.entries.map((e) => `${e.date} — ${line(e.text)}`)].join('\n')
  },
  preview: (data) => data.entries.map((e) => e.date).join(', '),
  nestedIdPaths: ['entries'],
}
