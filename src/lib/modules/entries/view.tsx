'use client'

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
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
 * Editing folds into the view: each row keeps the read-only date LABEL (no board
 * draws a live date field for `entry` — the date is system-set at `addEntry` time,
 * not something a person retypes) and turns the text into a textarea in the
 * block's medium, emitting the whole next block through `onChange`. The focused
 * row wears the molecule's `editing` state — `boxShadow: inset 0 0 0 1.4px fg` — a
 * state the pre-KAN-356 implementation never drew.
 *
 * A second insert path sits above the stack (KAN-356): a quiet mono add line,
 * editable mode only — unlike `todo`, whose only add path is the frame's empty-state
 * `add a step`, the ticket's own build instruction asks for this one explicitly.
 * ↵ prepends a dated entry through `addEntry`'s now-optional `text` param (the same
 * whole-block `onChange` contract `patchEntry` rides), clears the line, and focuses
 * the new row's textarea once it exists post-round-trip (hence the `useEffect`, not
 * an inline `.focus()` in the key handler). An empty ↵ is a no-op. The frame's
 * `write one` on the empty `log` card still works too, via the same `addEntry`.
 *
 * A third insert path lives inside each entry's own field (KAN-356): ↵ with no
 * Shift inserts a new blank entry at the top of the stack (index 0), focused —
 * newest-first (schema.ts, PondBlock `log`) means any insert belongs at the
 * top, never spliced in beside the row being typed into, so this reuses
 * `addEntry` rather than rebuilding the entry shape inline. The field's own
 * `onChange` already commits every keystroke, so there is nothing left for ↵
 * to do but insert and move focus. Shift+↵ is left to the textarea's native
 * newline, which multi-line prose (and `serialize`'s line-collapsing) already
 * assumes. `pendingFocusId` is keyed by id rather than index because the
 * Backspace removal path (below) still needs to focus a neighbour row that is
 * not always at the top.
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
/** The molecule's `editing` state: `boxShadow: inset 0 0 0 1.4px fg`, no background change. */
const EDIT_RING = 'ring-[1.4px] ring-inset ring-mn-text'
/**
 * The hover `remove` (KAN-356) — no board draws it on `entry` either, so it
 * follows `BlockCanvas.tsx`'s own hover-handle idiom: `group` on the row,
 * `opacity-0` revealed by `group-hover`/`group-focus-within` (keyboard parity
 * with a mouse hover), trailing-aligned over the row's end. Stays at ink .68
 * throughout — it never earns full ink, same register as the add line.
 */
const REMOVE =
  'absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10.5px] tracking-tight text-mn-text-secondary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'
/**
 * The add line (KAN-356) — no board draws this row, the ticket's own build
 * instruction does ("as a quiet mono line"): machine-surface register, ink .68
 * throughout rather than the content rows' full ink, since it is an affordance, not
 * authored prose.
 */
const ADD_LINE =
  'w-full bg-transparent px-2 py-2 font-mono text-[12.5px] tracking-tight text-mn-text-secondary outline-none placeholder:text-mn-text-secondary'

/** The block's medium for prose — the board's `d.serif` branch. */
const medium = (serif: boolean | undefined) => (serif ? SERIF : SANS)

/** The board's month copy — lowercase English, three letters (`28 oct`, `14 nov`). */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** A date as the board labels an entry: `d mmm`, lowercase, no leading zero. */
export function entryDateLabel(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

/**
 * Prepend one entry dated today — the log's insert path (#239), pure, through the
 * same whole-block `onChange(nextBlock)` contract the fields use. Newest first, as
 * the board's journal notes (`note: 'newest first'`) and both its fixtures read.
 * `text` defaults to `''` for the frame's empty-state caller (`write one`, a blank
 * row to type into); the add line (KAN-356) passes its own typed text instead.
 */
export function addEntry(
  data: EntriesBlock,
  now: Date = new Date(),
  text: string = '',
  id: string = crypto.randomUUID()
): EntriesBlock {
  return {
    ...data,
    entries: [{ id, date: entryDateLabel(now), text }, ...data.entries],
  }
}

export function EntriesView({ data, editable, onChange }: ModuleViewProps<EntriesBlock>) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addValue, setAddValue] = useState('')
  const textRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const pendingFocusId = useRef<string | null>(null)

  // Runs after an insert's `onChange` round-trips back through the host — the new
  // entry's textarea doesn't exist in the DOM until then, so the focus can't happen
  // inline in the key handler.
  useEffect(() => {
    if (!pendingFocusId.current) return
    textRefs.current.get(pendingFocusId.current)?.focus()
    pendingFocusId.current = null
  }, [data.entries])

  function patchEntry(index: number, patch: Partial<Entry>) {
    onChange?.({
      ...data,
      entries: data.entries.map((e, k) => (k === index ? { ...e, ...patch } : e)),
    })
  }

  function removeEntry(index: number) {
    onChange?.({ ...data, entries: data.entries.filter((_, k) => k !== index) })
  }

  function handleAddKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (addValue.trim() === '') return
    const id = crypto.randomUUID()
    pendingFocusId.current = id
    onChange?.(addEntry(data, new Date(), addValue, id))
    setAddValue('')
  }

  /**
   * ↵ in an entry's own field (KAN-356) inserts a new blank entry at the top
   * of the stack, focused — newest-first (schema.ts, PondBlock `log`) means
   * the new entry always belongs at index 0, regardless of which row it was
   * typed into, so this reuses `addEntry` rather than splicing a hand-built
   * entry in beside `index`. The row being typed into is already committed by
   * every keystroke's own `onChange` via `patchEntry`, so there is nothing
   * left to commit here. Shift+↵ is left untouched: the textarea's native
   * behaviour inserts the literal newline multi-line prose needs.
   *
   * ⌫ in an entry already emptied by its own `onChange` removes the row via
   * `removeEntry` and moves focus to its neighbour — the previous entry, else
   * the next, else nowhere — mirroring `BlockCanvas.tsx`'s `removeEmptyLineAt`
   * idiom, built locally since this is within-block, not a block removal.
   */
  function handleTextKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    if (e.key === 'Backspace' && data.entries[index].text === '') {
      e.preventDefault()
      const neighbour = data.entries[index - 1] ?? data.entries[index + 1]
      if (neighbour) pendingFocusId.current = neighbour.id
      removeEntry(index)
      return
    }
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    const id = crypto.randomUUID()
    pendingFocusId.current = id
    onChange?.(addEntry(data, new Date(), '', id))
  }

  if (editable) {
    return (
      <div className={STACK}>
        <input
          aria-label="Add entry"
          className={ADD_LINE}
          value={addValue}
          placeholder="add an entry"
          onChange={(e) => setAddValue(e.target.value)}
          onKeyDown={handleAddKeyDown}
        />
        {data.entries.map((entry, i) => (
          <div
            key={entry.id}
            className={`${ROW} group relative ${editingId === entry.id ? EDIT_RING : ''}`}
          >
            <span data-part="date" className={DATE}>
              {entry.date}
            </span>
            <button
              type="button"
              aria-label="Remove entry"
              className={REMOVE}
              onClick={() => removeEntry(i)}
            >
              remove
            </button>
            <textarea
              ref={(el) => {
                if (el) textRefs.current.set(entry.id, el)
                else textRefs.current.delete(entry.id)
              }}
              aria-label="Entry text"
              className={`${medium(data.serif)} w-full resize-none bg-transparent text-mn-text outline-none placeholder:text-mn-text-secondary`}
              value={entry.text}
              rows={Math.max(1, entry.text.split('\n').length)}
              placeholder={blankLine(data)}
              onFocus={() => setEditingId(entry.id)}
              onBlur={() => setEditingId((id) => (id === entry.id ? null : id))}
              onChange={(e) => patchEntry(i, { text: e.target.value })}
              onKeyDown={(e) => handleTextKeyDown(e, i)}
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
