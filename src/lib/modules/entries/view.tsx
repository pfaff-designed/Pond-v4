'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MutableRefObject } from 'react'
import type { ModuleViewProps } from '../types'
import { ENTRIES_EMPTY_LINE, type Entry, type EntriesBlock } from './schema'
import { SESSION_UNDO_SCOPE_ATTR } from '@/lib/shell-commands'
import { useBlockRow } from '@/lib/modules/block-row-context'

/**
 * The block's own placeholder wins over the board's generic empty line. "Write
 * the first entry" means the first one WRITTEN — the OLDEST — not index 0: the
 * log is newest-first and every insert lands at index 0, so the oldest entry is
 * always the LAST index. Only that row ever shows the placeholder; every other
 * blank row in the stack shows nothing (KAN-444).
 */
const blankLine = (data: EntriesBlock, index: number) =>
  index === data.entries.length - 1 ? data.placeholder ?? ENTRIES_EMPTY_LINE : ''

/**
 * Entries view (#250) — dated prose. Row geometry and serif size follow
 * `PondMolecule.dc.html`'s `entry` kind values:
 *
 *   stack  { display: 'flex', flexDirection: 'column', gap: 2 }
 *   entry  { display: 'grid', gridTemplateColumns: '56px minmax(0,1fr)', gap: 14,
 *            padding: '10px 8px', borderRadius: 10, alignItems: 'baseline',
 *            background: hover ? ink/.05 : 'transparent' }
 *   edate  { fontFamily: mono, fontSize: 10.5, color: a(.68) }  (the molecule's `cellMeta`)
 *   text   { fontFamily: serif, fontWeight: 200, fontSize: 16.5, lineHeight: 1.6,
 *            color: filled ? fg : a(.68), textWrap: 'pretty' }
 *
 * The serif is UNCONDITIONAL (KAN-444) — every entries block renders the board's one
 * register, never a per-block flag or an ancestor template's. The board's `filled`
 * is still read per row: an entry with prose is at full ink, a blank one at ink .68.
 *
 * An empty row keeps the medium and drops the ink rather than switching registers:
 * `renderVals()`'s idiom for an empty authored-prose block is KEEP THE MEDIUM, DROP
 * THE INK — `text` is `fontFamily: serif … color: filled ? fg : a(.68)`, and
 * `highlight`'s empty branch is serif 200 at `a(.68)`, which `highlight/view.tsx`
 * follows.
 *
 * NOT delegated to `<PondMolecule kind="entry">` itself: that component has no
 * `onTitleChange` / `trailing` for `entry`, so a block built on it could not wire the
 * row's own edit affordances (textarea, remove button, hover state). Row geometry is
 * matched by hand here instead.
 *
 * Editing folds into the view: each row keeps the read-only date LABEL (no board
 * draws a live date field for `entry` — the date is system-set at `addEntry` time,
 * not something a person retypes) and turns the text into a textarea in the
 * block's medium, emitting the whole next block through `onChange`. The focused
 * row wears the molecule's `editing` state — `boxShadow: inset 0 0 0 1.4px fg`.
 *
 * A second insert path sits above the stack: a quiet mono add line, editable mode
 * only. ↵ prepends a dated entry through `addEntry`'s optional `text` param (the
 * same whole-block `onChange` contract `patchEntry` rides), clears the line, and
 * focuses the new row's textarea once it exists post-round-trip (hence the
 * `useEffect`, not an inline `.focus()` in the key handler). An empty ↵ is a no-op.
 * The frame's `write one` on the empty `log` card still works too, via the same
 * `addEntry`.
 *
 * A third insert path lives inside each entry's own field: ↵ with no Shift inserts
 * a new blank entry at the top of the stack (index 0), focused — newest-first
 * (schema.ts, PondBlock `log`) means any insert belongs at the top, never spliced
 * in beside the row being typed into, so this reuses `addEntry` rather than
 * rebuilding the entry shape inline. The field's own `onChange` already commits
 * every keystroke, so there is nothing left for ↵ to do but insert and move focus.
 * Shift+↵ is left to the textarea's native newline, which multi-line prose (and
 * `serialize`'s line-collapsing) already assumes.
 *
 * The pending-focus signal (`pendingFocusByBlock`) is a module-level registry,
 * not a ref on the component instance: `write one` (the frame's empty-card
 * action, `BlockCanvas.tsx`'s `useBlockEmptyState`) fires `onEmptyAction` while
 * the log is still in its `empty` frame state, which renders `PondBlockEmpty`
 * instead of this view at all — there is no `EntriesView` instance yet for a
 * ref to live on. The id has to be set BEFORE the view's first mount and read
 * back once it exists, so the registry is keyed by the block's own id (stable
 * across that mount) rather than an instance ref, and read on every
 * `data.entries` change so the add-line and row-↵ paths (where the view was
 * already mounted) keep working too.
 */

/**
 * The board's registers, composed as plain strings, never through `cn`:
 * tailwind-merge cannot tell the `text-[16.5px]` SIZE from the `text-mn-text*`
 * COLOUR — both match `text-*` — and silently drops one. That is **#252**; once
 * `cn` is taught the `--text-mn-*` scale via `extendTailwindMerge`, these can go
 * back to `cn` and this note can be deleted.
 */
/** `PondBlock.dc.html`'s `log` stack is gap 2 — tighter than the `--spacing-mn-*`
 *  ramp's floor (4), so the board's literal wins as an arbitrary value (AGENTS.md:
 *  "a value written in a board is final") rather than rounding up to `gap-mn-1`. */
const STACK = 'flex flex-col gap-[2px]'
const ROW =
  'grid items-baseline gap-3.5 rounded-mn-row px-2 py-2.5 [grid-template-columns:56px_minmax(0,1fr)]'
/**
 * The molecule's `hover` wash (`a(.05)`), the ink-alpha role token, never a raw
 * colour — applied through `hoveredId` state (`onMouseEnter`/`onMouseLeave`), the
 * same idiom `todo/view.tsx`'s `hovered` row uses, rather than a `group-hover:`
 * CSS variant: real pointer hover works either way, but `userEvent.hover` in the
 * story's play function dispatches synthetic mouse events that do not update the
 * browser's own `:hover` match, only a JS listener's state.
 */
const HOVER = 'bg-mn-text/5'
const DATE = 'font-mono text-[10.5px] text-mn-text-secondary'
const SERIF = 'font-serif font-extralight text-[16.5px] leading-[1.6] [text-wrap:pretty]'
/** The molecule's `editing` state: `boxShadow: inset 0 0 0 1.4px fg`, no background change. */
const EDIT_RING = 'ring-[1.4px] ring-inset ring-mn-text'
/**
 * The hover `remove` — no board draws it on `entry` either, so it follows
 * `BlockCanvas.tsx`'s own hover-handle idiom: `opacity-0` revealed by
 * `group-hover`/`group-focus-within` (keyboard parity with a mouse hover),
 * trailing-aligned over the row's end, and after the textarea in DOM order so
 * Tab reaches the row's text first. The textarea reserves the button's width
 * with right padding so it never covers the end of a long line. Stays at ink
 * .68 throughout — it never earns full ink, same register as the add line.
 *
 * The row's own group is NAMED (`group/row`), not the bare `group` BlockCanvas's
 * outer hover-handle chrome also carries — a bare `group` on the row would match
 * that outer wrapper's hover too, revealing every row's button as soon as the
 * pointer entered the block, not just the hovered row's.
 */
const REMOVE =
  'absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10.5px] tracking-tight text-mn-text-secondary opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100'
/**
 * The add line — no board draws this row: machine-surface register, ink .68
 * throughout rather than the content rows' full ink, since it is an affordance, not
 * authored prose.
 */
const ADD_LINE =
  'w-full bg-transparent px-2 py-2 font-mono text-[12.5px] tracking-tight text-mn-text-secondary outline-none placeholder:text-mn-text-secondary'

/**
 * Keyed by block id, not a component instance — set by whichever caller creates
 * the new entry's id, read by `EntriesView` once it (re)mounts for that block.
 * `write one` (`BlockCanvas.tsx`'s `useBlockEmptyState`) is the caller that needs
 * this: it fires while the block is still `empty` and this view isn't mounted at
 * all yet, so there is no instance to hold the pending id on.
 */
const pendingFocusByBlock = new Map<string, string>()

/** Called by any insert path's caller before the entry it names exists in `data`. */
export function requestEntryFocus(blockId: string, entryId: string): void {
  pendingFocusByBlock.set(blockId, entryId)
}

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
 * row to type into); the add line passes its own typed text instead.
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

/**
 * The one home for "insert an entry and focus it" (KAN-444) — every insert path
 * (`write one`, the add line, a row's own ↵, and the story's mirror of `write
 * one`) generates the id, registers it with `requestEntryFocus` BEFORE the
 * caller's `onChange`, and inserts through `addEntry`, in that order. Duplicating
 * these three lines at each call site let one of them (`write one`'s own wiring)
 * drift out of step with the other two.
 */
export function addEntryFocused(data: EntriesBlock, text: string = ''): EntriesBlock {
  const id = crypto.randomUUID()
  requestEntryFocus(data.id, id)
  return addEntry(data, new Date(), text, id)
}

/**
 * `field-sizing: content` alone is unsupported in Firefox stable, where every
 * row (even a multi-line one) would otherwise render `rows={1}` tall
 * regardless of content — clipping worse than main (KAN-444). Feature-detect
 * once, at module scope (it can't change mid-session), and run exactly one
 * mechanism per browser rather than both at once: field-sizing where it
 * exists (synchronous — it reacts within the same layout pass a width or
 * content change happens in, which the JS fallback's `ResizeObserver`
 * cannot), a `scrollHeight`-driven fallback where it doesn't. Running both
 * together would have the JS path fight the CSS one for the same box.
 */
const SUPPORTS_FIELD_SIZING = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')

/**
 * The `scrollHeight` fallback: a `useLayoutEffect` on the text re-measures
 * before paint, the same idiom `ComposerLine.tsx` uses (`height: 'auto'`
 * then `scrollHeight`px); a `ResizeObserver` on the textarea re-measures on
 * a width change (a column resize), the same guarded idiom
 * `BlockCanvas.tsx`'s stacking measurement uses. The observer only reads,
 * through `setWidth` — it never writes to the box it observes, so it can't
 * re-trigger itself (the browser's "ResizeObserver loop" warning) the way
 * an observer that mutates its own target would; the fit effect reacts to
 * `width` on its own render, one tick later. jsdom has no `ResizeObserver`,
 * so that half is skipped there and only the height effect runs in jest.
 */
function EntryTextarea({
  entry,
  index,
  placeholder,
  textRefs,
  onFocusRow,
  onBlurRow,
  onChangeText,
  onKeyDownRow,
}: {
  entry: Entry
  index: number
  placeholder: string
  textRefs: MutableRefObject<Map<string, HTMLTextAreaElement>>
  onFocusRow: () => void
  onBlurRow: () => void
  onChangeText: (index: number, text: string) => void
  onKeyDownRow: (e: KeyboardEvent<HTMLTextAreaElement>, index: number) => void
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    if (SUPPORTS_FIELD_SIZING) return
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (SUPPORTS_FIELD_SIZING) return
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [entry.text, width])

  return (
    <textarea
      ref={(el) => {
        ref.current = el
        if (el) textRefs.current.set(entry.id, el)
        else textRefs.current.delete(entry.id)
      }}
      aria-label="Entry text"
      className={`${SERIF} w-full resize-none overflow-hidden bg-transparent pr-12 text-mn-text outline-none placeholder:text-mn-text-secondary ${SUPPORTS_FIELD_SIZING ? '[field-sizing:content]' : ''}`}
      value={entry.text}
      rows={1}
      placeholder={placeholder}
      onFocus={onFocusRow}
      onBlur={onBlurRow}
      onChange={(e) => onChangeText(index, e.target.value)}
      onKeyDown={(e) => onKeyDownRow(e, index)}
    />
  )
}

export function EntriesView({ data, editable, onChange }: ModuleViewProps<EntriesBlock>) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [addValue, setAddValue] = useState('')
  const textRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const { commitStep } = useBlockRow()
  // No `BlockRowProvider` above this view (page/view.tsx, a Storybook host) —
  // there is no save to flush twice, so removal falls back to the view's own
  // `onChange` rather than the context's absent default.
  const commit = (patch: EntriesBlock) => (commitStep ?? onChange)?.(patch)

  // Runs after an insert's `onChange` round-trips back through the host — the new
  // entry's textarea doesn't exist in the DOM until then, so the focus can't happen
  // inline in the key handler. Reads the module-level registry (not a ref on this
  // instance) so a `write one` request set before this view ever mounted is still
  // honoured on its first render, not just on a later one.
  //
  // Editable only, and only once the textarea is actually there: a read-only
  // `EntriesView` for the same block id never populates `textRefs`, so if it ran
  // this effect too it would delete the request before the editable instance's
  // own render got a turn to claim it — and a commit where `data.entries` changes
  // without the new entry yet (unrelated to this insert) must leave the request
  // standing for the render that does carry it, not consume it on a miss.
  useEffect(() => {
    if (!editable) return
    const id = pendingFocusByBlock.get(data.id)
    if (!id) return
    const el = textRefs.current.get(id)
    if (!el) return
    el.focus()
    // `focus()` on a textarea that already carries a value puts the caret at
    // 0, not the end — without this, continuing to type after an insert
    // prepends instead of appending.
    el.setSelectionRange(el.value.length, el.value.length)
    pendingFocusByBlock.delete(data.id)
  }, [editable, data.id, data.entries])

  function patchEntry(index: number, patch: Partial<Entry>) {
    onChange?.({
      ...data,
      entries: data.entries.map((e, k) => (k === index ? { ...e, ...patch } : e)),
    })
  }

  function removeEntry(index: number) {
    commit({ ...data, entries: data.entries.filter((_, k) => k !== index) })
  }

  function handleAddKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (addValue.trim() === '') return
    onChange?.(addEntryFocused(data, addValue))
    setAddValue('')
  }

  /**
   * ↵ in an entry's own field inserts a new blank entry at the top of the
   * stack, focused — newest-first (schema.ts, PondBlock `log`) means the new
   * entry always belongs at index 0, regardless of which row it was typed
   * into, so this reuses `addEntry` rather than splicing a hand-built entry in
   * beside `index`. The row being typed into is already committed by every
   * keystroke's own `onChange` via `patchEntry`, so there is nothing left to
   * commit here. Shift+↵ is left untouched: the textarea's native behaviour
   * inserts the literal newline multi-line prose needs.
   *
   * ⌫ in an entry already emptied by its own `onChange` removes the row via
   * `removeEntry` and focuses the row above (previous index) when one
   * exists, else the row below (the top-row case), via `requestEntryFocus` —
   * the same registry the insert paths use — so the caret lands at the
   * neighbour's end once it re-renders. The only-row case blurs instead,
   * since there is no neighbour to focus. ⌘Z inside the rows is the
   * session's step, not a focused field's own undo, because the rows carry
   * `SESSION_UNDO_SCOPE_ATTR` (`ShellCommands.tsx`'s `isEditable` exempts it).
   */
  function handleTextKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Backspace' && data.entries[index].text === '') {
      e.preventDefault()
      const neighbour = data.entries[index - 1] ?? data.entries[index + 1]
      if (neighbour) {
        requestEntryFocus(data.id, neighbour.id)
      }
      removeEntry(index)
      if (!neighbour) {
        e.currentTarget.blur()
      }
      return
    }
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    onChange?.(addEntryFocused(data))
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
        {/* Rows only, not the add line above: the add line's value is local
         * state (`addValue`), never a page save, so ⌘Z there must stay the
         * browser's own field undo rather than routing to the session. */}
        <div className={STACK} {...{ [SESSION_UNDO_SCOPE_ATTR]: '' }}>
          {data.entries.map((entry, i) => (
            <div
              key={entry.id}
              className={`${ROW} group/row relative ${editingId === entry.id ? EDIT_RING : ''} ${hoveredId === entry.id ? HOVER : ''}`}
              onMouseEnter={() => setHoveredId(entry.id)}
              onMouseLeave={() => setHoveredId((id) => (id === entry.id ? null : id))}
            >
              <span data-part="date" className={DATE}>
                {entry.date}
              </span>
              <EntryTextarea
                entry={entry}
                index={i}
                placeholder={blankLine(data, i)}
                textRefs={textRefs}
                onFocusRow={() => setEditingId(entry.id)}
                onBlurRow={() => setEditingId((id) => (id === entry.id ? null : id))}
                onChangeText={(index, text) => patchEntry(index, { text })}
                onKeyDownRow={handleTextKeyDown}
              />
              <button
                type="button"
                aria-label="Remove entry"
                className={REMOVE}
                onClick={() => removeEntry(i)}
              >
                remove
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={STACK}>
      {data.entries.map((entry, i) => {
        const filled = entry.text.trim() !== ''
        return (
          <div key={entry.id} className={ROW}>
            <span data-part="date" className={DATE}>
              {entry.date}
            </span>
            {filled ? (
              <p
                data-part="text"
                className={`${SERIF} whitespace-pre-wrap text-mn-text`}
              >
                {entry.text}
              </p>
            ) : (
              <p
                data-part="text"
                data-empty=""
                className={`${SERIF} text-mn-text-secondary`}
              >
                {blankLine(data, i)}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
