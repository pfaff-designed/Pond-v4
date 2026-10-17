'use client'

import type { ModuleViewProps } from '../types'
import { ENTRIES_EMPTY_LINE, type Entry, type EntriesBlock } from './schema'

/** The block's own placeholder wins over the board's generic empty line. */
const blankLine = (data: EntriesBlock) => data.placeholder ?? ENTRIES_EMPTY_LINE

/**
 * Entries view (#250) — dated prose. Row geometry and serif size follow
 * `PondMolecule.dc.html`'s `entry` kind values (conductor's ruling, KAN-356: the
 * library wins over the superseded `PondTemplate.dc.html` reading below):
 *
 *   stack  { display: 'flex', flexDirection: 'column', gap: 8 }
 *   entry  { display: 'grid', gridTemplateColumns: '56px minmax(0,1fr)', gap: 14,
 *            padding: '10px 8px', borderRadius: 10, alignItems: 'baseline' }
 *   edate  { fontFamily: mono, fontSize: 10.5, color: a(.68) }  (the molecule's `cellMeta`)
 *   text   d.serif && filled
 *            ? { fontFamily: serif, fontWeight: 200, fontSize: 16.5, lineHeight: 1.6,
 *                color: fg, textWrap: 'pretty' }
 *            : { fontSize: 13.5, lineHeight: 1.5, color: filled ? fg : a(.68),
 *                textWrap: 'pretty' }
 *
 * The serif is CONDITIONAL — on the block's own `serif` flag (schema.ts says why it
 * lives there), never on an ancestor template. The board's `filled` is read per row
 * here: an entry with prose is at full ink, a blank one at ink .68 — but BOTH keep
 * the block's medium.
 *
 * The old `PondTemplate.dc.html` literal was `d.serif && filled`, which reads as "a
 * blank row is sans even on a journal". It does not support that: `serif: 1` appears
 * ONLY on the journal's FILLED descriptor, so the two flip together and the board
 * never renders a serif-flagged block through the non-filled branch. It gave no
 * evidence for this state. `renderVals()`'s idiom for an empty authored-prose block
 * is KEEP THE MEDIUM, DROP THE INK — `text` is `fontFamily: serif … color: filled ?
 * fg : a(.68)`, and `highlight`'s empty branch is serif 200 at `a(.68)`, which
 * `highlight/view.tsx` follows. The deciding fact is ours, not the board's: the
 * editable path below wears `medium(data.serif)` unconditionally, so a sans blank row
 * would be serif while focused and sans on blur — a medium flip on every blur.
 *
 * NOT delegated to `<PondMolecule kind="entry">` itself, even though its VALUES now
 * win: that component hardcodes the serif register and has no `onTitleChange` /
 * `trailing` / sans variant for `entry`, so a block built on it could not render
 * `project`'s sans `updates`. The #250 exclusion stands for the COMPONENT; this
 * ticket overturns it only for the geometry and serif size, which this view now
 * matches by hand.
 *
 * Editing folds into the view: each row is a mono date field and a textarea in the
 * block's medium, emitting the whole next block through `onChange`. No add
 * affordance is drawn here (as `todo`): the frame's `write one` on the empty `log`
 * card is the insert path, via `addEntry`.
 */

/**
 * The board's registers, composed as plain strings, never through `cn`:
 * tailwind-merge cannot tell the `text-[16.5px]` / `text-[13.5px]` SIZE from the
 * `text-mn-text*` COLOUR — both match `text-*` — and silently drops one. That is
 * **#252**; once `cn` is taught the `--text-mn-*` scale via `extendTailwindMerge`,
 * these can go back to `cn` and this note can be deleted.
 */
const STACK = 'flex flex-col gap-mn-2'
const ROW =
  'grid items-baseline gap-3.5 rounded-mn-row px-2 py-2.5 [grid-template-columns:56px_minmax(0,1fr)]'
const DATE = 'font-mono text-[10.5px] text-mn-text-secondary'
const SANS = 'font-sans text-[13.5px] leading-normal [text-wrap:pretty]'
const SERIF = 'font-serif font-extralight text-[16.5px] leading-[1.6] [text-wrap:pretty]'

/** The block's medium for prose — the board's `d.serif` branch. */
const medium = (serif: boolean | undefined) => (serif ? SERIF : SANS)

/** The board's month copy — lowercase English, three letters (`28 oct`, `14 nov`). */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** A date as the board labels an entry: `d mmm`, lowercase, no leading zero. */
export function entryDateLabel(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

/**
 * Prepend one blank entry dated today — the log's insert path (#239), pure, through
 * the same whole-block `onChange(nextBlock)` contract the fields use. Newest first,
 * as the board's journal notes (`note: 'newest first'`) and both its fixtures read.
 * The frame's empty state (`write one`) is its one caller today.
 */
export function addEntry(data: EntriesBlock, now: Date = new Date()): EntriesBlock {
  return {
    ...data,
    entries: [{ id: crypto.randomUUID(), date: entryDateLabel(now), text: '' }, ...data.entries],
  }
}

export function EntriesView({ data, editable, onChange }: ModuleViewProps<EntriesBlock>) {
  function patchEntry(index: number, patch: Partial<Entry>) {
    onChange?.({
      ...data,
      entries: data.entries.map((e, k) => (k === index ? { ...e, ...patch } : e)),
    })
  }

  if (editable) {
    return (
      <div className={STACK}>
        {data.entries.map((entry, i) => (
          <div key={entry.id} className={ROW}>
            <input
              aria-label="Entry date"
              className={`${DATE} min-w-0 bg-transparent outline-none`}
              value={entry.date}
              onChange={(e) => patchEntry(i, { date: e.target.value })}
            />
            <textarea
              aria-label="Entry text"
              className={`${medium(data.serif)} w-full resize-none bg-transparent text-mn-text outline-none placeholder:text-mn-text-secondary`}
              value={entry.text}
              rows={Math.max(1, entry.text.split('\n').length)}
              placeholder={blankLine(data)}
              onChange={(e) => patchEntry(i, { text: e.target.value })}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={STACK}>
      {data.entries.map((entry) => {
        const filled = entry.text.trim() !== ''
        return (
          <div key={entry.id} className={ROW}>
            <span data-part="date" className={DATE}>
              {entry.date}
            </span>
            {filled ? (
              <p
                data-part="text"
                className={`${medium(data.serif)} whitespace-pre-wrap text-mn-text`}
              >
                {entry.text}
              </p>
            ) : (
              <p
                data-part="text"
                data-empty=""
                className={`${medium(data.serif)} text-mn-text-secondary`}
              >
                {blankLine(data)}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
