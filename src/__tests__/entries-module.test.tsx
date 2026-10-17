/**
 * The `entries` block (#250, child 228b) — dated prose, serif only for the journal.
 * Row geometry and serif size follow `PondMolecule.dc.html`'s `entry` kind
 * (conductor's ruling, KAN-356: the library wins over the superseded
 * `PondTemplate.dc.html` reading):
 *
 *   stack  flex column · gap 8
 *   entry  grid `56px minmax(0,1fr)` · gap 14 · padding 10px 8px · radius 10 ·
 *          align-items baseline
 *   edate  mono 10.5 · ink .68
 *   text   d.serif && filled ? serif 200 / 16.5 / 1.6 · full ink
 *                            : sans 13.5 / 1.5 · full ink when filled, ink .68 when not
 *          both `text-wrap: pretty`
 *
 * The serif is CONDITIONAL on the block's own `serif` flag (ruling 4 in the issue:
 * a field on the schema, set by the journal template at instantiation — never
 * looked up from an ancestor template at render time, ADR 0005). The board exercises
 * both media itself: `project` → `updates` (sans), `journal` → `entries` (serif).
 *
 * Registry facets, the emit union (nested ids stripped at `nestedIdPaths`), the
 * palette, the `log` frame mapping and the view's two media. Computed values are
 * asserted in `view.stories.tsx`; jsdom has no layout, so here the class recipe is
 * the contract.
 */

import React, { useState } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'

import {
  entriesSchema,
  entriesDescriptor,
  ENTRIES_EMPTY_LINE,
  type EntriesBlock,
} from '@/lib/modules/entries/schema'
import { EntriesView, addEntry, entryDateLabel } from '@/lib/modules/entries/view'
import { blockSchema } from '@/lib/modules/content'
import { moduleDescriptors } from '@/lib/modules/registry'
import { moduleRenderers } from '@/lib/modules/renderers'
import {
  moduleDataSchema,
  createPageBlockSchema,
  moduleCatalog,
} from '@/lib/modules/ai-composition'
import { emptyBlockForType, slashRows } from '@/lib/modules/palette'
import { blockFrame, blockIsEmpty, POND_BLOCK_EMPTY_ACTION_WIRED } from '@/lib/modules/block-frame'

/** The board's `project` → `updates` fixture: sans. */
const updates: EntriesBlock = {
  id: 'e1',
  type: 'entries',
  entries: [
    { id: 'u1', date: '28 oct', text: 'Van booked for the morning of the 14th.' },
    { id: 'u2', date: '24 oct', text: 'Landlord confirmed the inventory date.' },
  ],
}

/** The board's `journal` → `entries` fixture: `serif: 1`. */
const journal: EntriesBlock = {
  id: 'e2',
  type: 'entries',
  serif: true,
  entries: [
    {
      id: 'j1',
      date: '25 oct',
      text: 'Slept badly, walked it off. The light on the canal was worth getting up for.',
    },
    { id: 'j2', date: '24 oct', text: 'Quiet day. Finished the chapter and started the next.' },
    {
      id: 'j3',
      date: '23 oct',
      text: 'Long call with Mum. She has decided on the trip after all.',
    },
  ],
}

const has = (el: Element, ...classes: string[]) => {
  const list = el.className.split(' ')
  for (const c of classes) expect(list).toContain(c)
}
const lacks = (el: Element, ...classes: string[]) => {
  const list = el.className.split(' ')
  for (const c of classes) expect(list).not.toContain(c)
}

const datesOf = (root: ParentNode) =>
  Array.from(root.querySelectorAll<HTMLElement>('[data-part="date"]'))
const textsOf = (root: ParentNode) =>
  Array.from(root.querySelectorAll<HTMLElement>('[data-part="text"]'))

// ── Schema + registry facets ────────────────────────────────────────────────────

describe('entries schema + registry facets', () => {
  it('persists through blockSchema (round-trips both media)', () => {
    expect(blockSchema.parse(updates)).toEqual(updates)
    expect(blockSchema.parse(journal)).toEqual(journal)
  })

  it('the serif flag is OPTIONAL and defaults to sans: an entries block without it is valid', () => {
    const parsed = entriesSchema.parse(updates)
    expect(parsed.serif).toBeUndefined()
  })

  it('every entry carries its own id (targeted edits), a date label and its text', () => {
    expect(
      entriesSchema.safeParse({
        ...updates,
        entries: [{ date: '28 oct', text: 'no id' }],
      }).success
    ).toBe(false)
    expect(
      entriesSchema.safeParse({ ...updates, entries: [{ id: 'x', text: 'no date' }] }).success
    ).toBe(false)
  })

  it('is registered in both halves of the two-map contract', () => {
    expect(moduleDescriptors.entries).toBe(entriesDescriptor)
    expect(moduleRenderers.entries.view).toBe(EntriesView)
  })

  it('declares its rows as the id-bearing collection', () => {
    expect(entriesDescriptor.nestedIdPaths).toEqual(['entries'])
  })

  it('serializes every entry, date then prose, behind an Entries: marker', () => {
    // `blocksToText` joins serialized lines with no type label — the marker keeps a
    // dated log from coming back as a `text` block on a wholesale re-emit.
    expect(entriesDescriptor.serialize(updates)).toBe(
      [
        'Entries:',
        '28 oct — Van booked for the morning of the 14th.',
        '24 oct — Landlord confirmed the inventory date.',
      ].join('\n')
    )
    expect(entriesDescriptor.serialize({ ...updates, entries: [] })).toBe(
      'Entries: (no entries yet)'
    )
  })

  it('serializes the serif flag so a wholesale re-emit keeps a journal a journal', () => {
    expect(entriesDescriptor.serialize(journal).split('\n')[0]).toBe('Entries (serif):')
  })

  it('previews as the dates alone, comma-joined', () => {
    expect(entriesDescriptor.preview!(updates)).toBe('28 oct, 24 oct')
  })
})

// ── The emit union (ADR 0006's named work item) ─────────────────────────────────

describe('entries in moduleDataSchema (the AI emit union)', () => {
  it('is composable id-less — block id AND entry ids stripped at nestedIdPaths', () => {
    const data = {
      type: 'entries',
      entries: [{ date: '28 oct', text: 'Van booked.' }],
    }
    const r = moduleDataSchema.safeParse(data)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toEqual(data)
    // Ids the model volunteers are dropped, not honoured — at both levels.
    const stripped = moduleDataSchema.parse({
      id: 'ai-made',
      type: 'entries',
      entries: [{ id: 'ai-made-too', date: '28 oct', text: 'Van booked.' }],
    })
    expect('id' in stripped).toBe(false)
    expect(stripped.type === 'entries' && 'id' in stripped.entries[0]).toBe(false)
  })

  it('carries the serif flag through the emit union (a journal Pond composes stays serif)', () => {
    const r = moduleDataSchema.parse({ type: 'entries', serif: true, entries: [] })
    expect(r.type === 'entries' && r.serif).toBe(true)
  })

  it('carries the block-level placeholder through the emit union untouched', () => {
    const r = moduleDataSchema.parse({ type: 'entries', placeholder: 'first update', entries: [] })
    expect(r.type === 'entries' && r.placeholder).toBe('first update')
  })

  it('a page can be created WITH an entries block', () => {
    expect(
      createPageBlockSchema.safeParse({
        type: 'entries',
        bindKey: 'k',
        entries: [{ date: 'today', text: 'first update' }],
      }).success
    ).toBe(true)
  })

  it('teaches the model when a dated log is right: dated prose, not a table, not a text block', () => {
    const line = moduleCatalog.split('\n').find((l) => l.startsWith('- entries:'))
    expect(line).toBeDefined()
    expect(line).toMatch(/dated|date/i)
    expect(line).toMatch(/journal/i)
    expect(line).toMatch(/table/i)
    expect(line).toMatch(/text/i)
    expect(line).toMatch(/serif/i)
  })
})

// ── Palette + frame ─────────────────────────────────────────────────────────────

describe('entries in the palette and the frame', () => {
  it('is offered by the palette and mints an EMPTY log (the frame’s `no entries yet` / `write one` is the authoring state)', () => {
    expect(slashRows.some((r) => r.type === 'entries')).toBe(true)
    const empty = emptyBlockForType('entries')
    expect(empty).toMatchObject({ type: 'entries', entries: [] })
    expect(blockSchema.safeParse(empty).success).toBe(true)
  })

  it('renders in the `log` card (460) — its kind as the eyebrow, the entry count as the note', () => {
    // PondBlock.dc.html's `log` kind draws exactly this: a stack of { meta: date,
    // title: prose } rows. Mapping here makes the log card reachable for the first time.
    expect(blockFrame(updates)).toEqual({ kind: 'log', heading: 'entries', headNote: '2 entries' })
    expect(blockFrame({ ...updates, entries: [updates.entries[0]] })!.headNote).toBe('1 entry')
    expect(blockFrame({ ...updates, entries: [] })!.headNote).toBe('0 entries')
  })

  it('is empty with no entries, and the log kind’s `write one` has an engine path', () => {
    expect(blockIsEmpty({ ...updates, entries: [] })).toBe(true)
    expect(blockIsEmpty(updates)).toBe(false)
    // Keep `log: true` — addEntry IS the path the canvas wires `write one` to.
    expect(POND_BLOCK_EMPTY_ACTION_WIRED.log).toBe(true)
  })
})

// ── addEntry — the insert path ──────────────────────────────────────────────────

describe('addEntry / entryDateLabel — the engine-shaped insert, newest first', () => {
  it('prepends one blank entry dated today, in the board’s lowercase `d mmm`; the rest by reference', () => {
    const next = addEntry(updates, new Date(2026, 9, 2))
    expect(next.entries).toHaveLength(3)
    expect(next.entries[0]).toMatchObject({ date: '2 oct', text: '' })
    expect(typeof next.entries[0].id).toBe('string')
    expect(next.entries[1]).toBe(updates.entries[0])
    expect(next.entries[2]).toBe(updates.entries[1])
    expect(updates.entries).toHaveLength(2) // pure
    expect(next.serif).toBeUndefined()
  })

  it('keeps the serif flag on a journal', () => {
    expect(addEntry(journal, new Date(2026, 0, 14)).serif).toBe(true)
    expect(addEntry(journal, new Date(2026, 0, 14)).entries[0].date).toBe('14 jan')
  })

  it('entryDateLabel is the board’s copy: lowercase English month, no leading zero', () => {
    expect(entryDateLabel(new Date(2026, 10, 14))).toBe('14 nov')
    expect(entryDateLabel(new Date(2026, 2, 1))).toBe('1 mar')
  })
})

// ── The view: two media, one flag ───────────────────────────────────────────────

const ROW = [
  'grid',
  'items-baseline',
  'gap-3.5',
  'rounded-mn-row',
  'px-2',
  'py-2.5',
  '[grid-template-columns:56px_minmax(0,1fr)]',
]
const DATE = ['font-mono', 'text-[10.5px]', 'text-mn-text-secondary']
const SANS = ['font-sans', 'text-[13.5px]', 'leading-normal', '[text-wrap:pretty]']
const SERIF = [
  'font-serif',
  'font-extralight', // 200 — never 400
  'text-[16.5px]',
  'leading-[1.6]',
  '[text-wrap:pretty]',
]

describe('EntriesView — read-only', () => {
  it('the stack is a flex column at gap 8; each row the molecule’s 56px grid, gap 14, baseline', () => {
    const { container } = render(<EntriesView data={updates} />)
    const stack = container.firstElementChild!
    has(stack, 'flex', 'flex-col', 'gap-mn-2')
    const rows = Array.from(stack.children)
    expect(rows).toHaveLength(2)
    for (const row of rows) has(row, ...ROW)
  })

  it('the date is mono 10.5 at ink .68, in the board’s lowercase copy', () => {
    const { container } = render(<EntriesView data={updates} />)
    const dates = datesOf(container)
    expect(dates.map((d) => d.textContent)).toEqual(['28 oct', '24 oct'])
    for (const d of dates) has(d, ...DATE)
  })

  it('without the flag the text is SANS 13.5 / 1.5 at full ink (project → updates)', () => {
    const { container } = render(<EntriesView data={updates} />)
    for (const t of textsOf(container)) {
      has(t, ...SANS, 'text-mn-text')
      lacks(t, 'font-serif', 'font-extralight', 'text-[16.5px]', 'leading-[1.6]')
    }
  })

  it('with `serif: true` the text is SERIF 200 / 16.5 / 1.6 at full ink (journal → entries)', () => {
    const { container } = render(<EntriesView data={journal} />)
    const texts = textsOf(container)
    expect(texts).toHaveLength(3)
    for (const t of texts) {
      has(t, ...SERIF, 'text-mn-text')
      lacks(t, 'font-sans', 'text-[13.5px]', 'leading-normal', 'font-normal')
    }
    // The date column does not change medium with the text.
    for (const d of datesOf(container)) has(d, ...DATE)
  })

  // `renderVals()`'s literal is `d.serif && filled`, which reads as "a blank row is
  // sans even on a journal" — but `serif: 1` sits only on the journal's FILLED
  // descriptor, so the two flip together and the board never renders a serif-flagged
  // block through the non-filled branch. The board's idiom for an empty
  // authored-prose block is KEEP THE MEDIUM, DROP THE INK (`text`, `highlight`), and
  // the editable path wears the medium unconditionally — so a sans blank row would
  // flip serif on focus and sans on blur. Rationale in full in `entries/view.tsx`.
  it('a blank entry reads the board’s empty line at .68 in the BLOCK’S medium — serif on a journal', () => {
    const blank: EntriesBlock = {
      ...journal,
      entries: [{ id: 'b', date: 'today', text: '' }],
    }
    const { container } = render(<EntriesView data={blank} />)
    const [t] = textsOf(container)
    expect(t.textContent).toBe(ENTRIES_EMPTY_LINE)
    expect(ENTRIES_EMPTY_LINE).toBe('write the first entry')
    expect(t.dataset.empty).toBe('')
    has(t, ...SERIF, 'text-mn-text-secondary')
    lacks(t, 'text-mn-text')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('a blank entry draws the block’s own `placeholder` over the board’s generic empty line', () => {
    const blank: EntriesBlock = {
      ...updates,
      placeholder: 'first update',
      entries: [{ id: 'b', date: 'today', text: '' }],
    }
    const { container } = render(<EntriesView data={blank} />)
    expect(textsOf(container)[0].textContent).toBe('first update')
  })

  it('a block with no `placeholder` still falls back to ENTRIES_EMPTY_LINE', () => {
    const blank: EntriesBlock = { ...updates, entries: [{ id: 'b', date: 'today', text: '' }] }
    const { container } = render(<EntriesView data={blank} />)
    expect(textsOf(container)[0].textContent).toBe(ENTRIES_EMPTY_LINE)
  })

  it('a blank entry on a SANS block stays sans at .68', () => {
    const blank: EntriesBlock = {
      ...updates,
      entries: [{ id: 'b', date: 'today', text: '' }],
    }
    const { container } = render(<EntriesView data={blank} />)
    const [t] = textsOf(container)
    has(t, ...SANS, 'text-mn-text-secondary')
    lacks(t, 'font-serif', 'text-mn-text')
  })

  it('whitespace-only text is blank too', () => {
    const { container } = render(
      <EntriesView data={{ ...updates, entries: [{ id: 'w', date: '1 jan', text: '  \n ' }] }} />
    )
    expect(textsOf(container)[0].textContent).toBe(ENTRIES_EMPTY_LINE)
  })

  it('composes the size and colour tokens as plain strings, never through cn (#252)', () => {
    // tailwind-merge drops one of `text-[16.5px]` / `text-mn-text` as both match `text-*`.
    // The recipe must carry BOTH on the same element in both media.
    const { container } = render(<EntriesView data={journal} />)
    has(textsOf(container)[0], 'text-[16.5px]', 'text-mn-text')
    const { container: c2 } = render(<EntriesView data={updates} />)
    has(textsOf(c2)[0], 'text-[13.5px]', 'text-mn-text')
  })
})

function Stateful({ data }: { data: EntriesBlock }) {
  const [state, setState] = useState(data)
  return <EntriesView data={state} editable onChange={setState} />
}

describe('EntriesView — editable (a read-only date label + a prose field, per row)', () => {
  it('keeps the date a read-only mono LABEL — no board draws a live date field for `entry` — and renders a textarea per entry, in the row grid', () => {
    const { container } = render(<Stateful data={updates} />)
    expect(screen.queryAllByRole('textbox', { name: 'Entry date' })).toHaveLength(0)
    const dates = datesOf(container)
    const texts = screen.getAllByRole('textbox', { name: 'Entry text' })
    expect(dates).toHaveLength(2)
    expect(texts).toHaveLength(2)
    expect(dates[0].textContent).toBe('28 oct')
    expect((texts[0] as HTMLTextAreaElement).value).toBe(updates.entries[0].text)
    for (const d of dates) has(d, ...DATE)
    // The add line is the stack's first child now (KAN-356); only the entry
    // rows — found through the text fields, not raw children — keep ROW's geometry.
    for (const t of texts) has(t.parentElement!, ...ROW)
  })

  it('a focused row wears the molecule’s `editing` ring; blurring drops it', () => {
    render(<Stateful data={updates} />)
    const texts = screen.getAllByRole('textbox', { name: 'Entry text' })
    const rows = texts.map((t) => t.parentElement!)
    for (const row of rows) lacks(row, 'ring-mn-text')
    act(() => texts[0].focus())
    has(rows[0], 'ring-[1.4px]', 'ring-inset', 'ring-mn-text')
    lacks(rows[1], 'ring-mn-text')
    act(() => texts[0].blur())
    lacks(rows[0], 'ring-mn-text')
  })

  it('the textarea wears the block’s medium: sans by default, serif 200 / 16.5 / 1.6 on a journal', () => {
    render(<Stateful data={updates} />)
    for (const t of screen.getAllByRole('textbox', { name: 'Entry text' })) {
      has(t, ...SANS, 'text-mn-text')
      lacks(t, 'font-serif')
    }
  })

  it('the editable textarea prefers the block’s `placeholder` over ENTRIES_EMPTY_LINE', () => {
    render(<Stateful data={{ ...updates, placeholder: 'first update' }} />)
    for (const t of screen.getAllByRole('textbox', { name: 'Entry text' })) {
      expect((t as HTMLTextAreaElement).placeholder).toBe('first update')
    }
  })

  it('the journal textarea is serif', () => {
    render(<Stateful data={journal} />)
    for (const t of screen.getAllByRole('textbox', { name: 'Entry text' })) {
      has(t, ...SERIF, 'text-mn-text')
      lacks(t, 'font-sans', 'text-[13.5px]')
      expect((t as HTMLTextAreaElement).placeholder).toBe(ENTRIES_EMPTY_LINE)
    }
  })

  it('onChange emits the whole next block (full-state contract), ids and flag intact', () => {
    const onChange = jest.fn()
    render(<EntriesView data={journal} editable onChange={onChange} />)
    fireEvent.change(screen.getAllByRole('textbox', { name: 'Entry text' })[1], {
      target: { value: 'Quiet day.' },
    })
    expect(onChange).toHaveBeenLastCalledWith({
      ...journal,
      entries: [
        journal.entries[0],
        { ...journal.entries[1], text: 'Quiet day.' },
        journal.entries[2],
      ],
    })
  })

  it('read-only renders no fields at all', () => {
    render(<EntriesView data={journal} />)
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

describe('EntriesView — the add line (KAN-356)', () => {
  it('sits above the stack, editable mode only', () => {
    render(<EntriesView data={journal} />)
    expect(screen.queryByRole('textbox', { name: 'Add entry' })).toBeNull()

    render(<Stateful data={journal} />)
    expect(screen.getAllByRole('textbox', { name: 'Add entry' })).toHaveLength(1)
  })

  it('↵ prepends a dated entry with the typed text, clears itself, and focuses the new row', () => {
    render(<Stateful data={updates} />)
    const add = screen.getByRole('textbox', { name: 'Add entry' })
    fireEvent.change(add, { target: { value: 'booked the van' } })
    fireEvent.keyDown(add, { key: 'Enter' })

    expect((add as HTMLInputElement).value).toBe('')
    const texts = screen.getAllByRole('textbox', { name: 'Entry text' })
    expect(texts).toHaveLength(3)
    expect((texts[0] as HTMLTextAreaElement).value).toBe('booked the van')
    expect(document.activeElement).toBe(texts[0])
  })

  it('empty ↵ does nothing — no onChange, no new row', () => {
    const onChange = jest.fn()
    render(<EntriesView data={updates} editable onChange={onChange} />)
    const add = screen.getByRole('textbox', { name: 'Add entry' })
    fireEvent.keyDown(add, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('whitespace-only ↵ does nothing either', () => {
    const onChange = jest.fn()
    render(<EntriesView data={updates} editable onChange={onChange} />)
    const add = screen.getByRole('textbox', { name: 'Add entry' })
    fireEvent.change(add, { target: { value: '   ' } })
    fireEvent.keyDown(add, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('↵ while composing an IME candidate does nothing — no stray entry', () => {
    const onChange = jest.fn()
    render(<EntriesView data={updates} editable onChange={onChange} />)
    const add = screen.getByRole('textbox', { name: 'Add entry' })
    fireEvent.change(add, { target: { value: '予測' } })
    fireEvent.keyDown(add, { key: 'Enter', isComposing: true })
    expect(onChange).not.toHaveBeenCalled()
    expect((add as HTMLInputElement).value).toBe('予測')
  })
})

describe('EntriesView — ↵ inside an entry’s own field (KAN-356)', () => {
  it('commits the row and inserts a new blank entry at the top of the stack, focused', () => {
    render(<Stateful data={updates} />)
    const texts = screen.getAllByRole('textbox', { name: 'Entry text' })
    fireEvent.change(texts[1], { target: { value: 'Landlord confirmed, and the keys.' } })
    fireEvent.keyDown(texts[1], { key: 'Enter' })

    const next = screen.getAllByRole('textbox', { name: 'Entry text' })
    expect(next).toHaveLength(3)
    // Newest-first: the new blank row always lands at index 0, never beside
    // the row it was typed into — both older entries are pushed down intact.
    expect((next[0] as HTMLTextAreaElement).value).toBe('')
    expect((next[1] as HTMLTextAreaElement).value).toBe(updates.entries[0].text)
    // The committed edit survives the insert.
    expect((next[2] as HTMLTextAreaElement).value).toBe('Landlord confirmed, and the keys.')
    expect(document.activeElement).toBe(next[0])
  })

  it('Shift+↵ inserts a literal newline instead — no new entry', () => {
    const onChange = jest.fn()
    render(<EntriesView data={updates} editable onChange={onChange} />)
    const texts = screen.getAllByRole('textbox', { name: 'Entry text' })
    fireEvent.keyDown(texts[0], { key: 'Enter', shiftKey: true })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('↵ while composing an IME candidate does nothing — no stray entry', () => {
    const onChange = jest.fn()
    render(<EntriesView data={updates} editable onChange={onChange} />)
    const texts = screen.getAllByRole('textbox', { name: 'Entry text' })
    fireEvent.keyDown(texts[0], { key: 'Enter', isComposing: true })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('EntriesView — the hover `remove` (KAN-356)', () => {
  it('is editable mode only, one per row, at ink .68 until a row hover reveals it', () => {
    render(<EntriesView data={updates} />)
    expect(screen.queryByRole('button', { name: 'Remove entry' })).toBeNull()

    render(<Stateful data={updates} />)
    const removes = screen.getAllByRole('button', { name: 'Remove entry' })
    expect(removes).toHaveLength(2)
    for (const r of removes) {
      expect(r.textContent).toBe('remove')
      has(r, 'font-mono', 'text-mn-text-secondary', 'opacity-0', 'group-hover:opacity-100')
    }
  })

  it('clicking it removes that entry via onChange, leaving the others', () => {
    render(<Stateful data={updates} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove entry' })[0])

    const texts = screen.getAllByRole('textbox', { name: 'Entry text' })
    expect(texts).toHaveLength(1)
    expect((texts[0] as HTMLTextAreaElement).value).toBe(updates.entries[1].text)
  })
})

describe('EntriesView — ⌫ in an empty entry’s own field (KAN-356)', () => {
  it('removes that entry via onChange, and blurs rather than focusing a neighbour (so ⌘Z reaches the session undo step, not a focused field’s own undo — KAN-356 fix)', () => {
    render(<Stateful data={{ ...updates, entries: [...updates.entries, { id: 'u3', date: '1 nov', text: '' }] }} />)
    const texts = screen.getAllByRole('textbox', { name: 'Entry text' })
    expect(texts).toHaveLength(3)
    fireEvent.keyDown(texts[2], { key: 'Backspace' })

    const next = screen.getAllByRole('textbox', { name: 'Entry text' })
    expect(next).toHaveLength(2)
    expect(document.activeElement).toBe(document.body)
  })

  it('with no previous entry, still blurs rather than focusing the next one', () => {
    render(<Stateful data={{ ...updates, entries: [{ id: 'u0', date: '1 nov', text: '' }, ...updates.entries] }} />)
    const texts = screen.getAllByRole('textbox', { name: 'Entry text' })
    fireEvent.keyDown(texts[0], { key: 'Backspace' })

    const next = screen.getAllByRole('textbox', { name: 'Entry text' })
    expect(next).toHaveLength(2)
    expect(document.activeElement).toBe(document.body)
  })

  it('as the only entry, removes it and leaves focus nowhere', () => {
    const onlyEmpty: EntriesBlock = { ...updates, entries: [{ id: 'u0', date: '1 nov', text: '' }] }
    render(<Stateful data={onlyEmpty} />)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Entry text' }), { key: 'Backspace' })

    expect(screen.queryByRole('textbox', { name: 'Entry text' })).toBeNull()
    expect(document.activeElement).toBe(document.body)
  })

  it('does nothing when the entry has text — the browser deletes a character instead', () => {
    const onChange = jest.fn()
    render(<EntriesView data={updates} editable onChange={onChange} />)
    fireEvent.keyDown(screen.getAllByRole('textbox', { name: 'Entry text' })[0], { key: 'Backspace' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('⌫ while composing an IME candidate does nothing, even on an empty row', () => {
    const onChange = jest.fn()
    render(
      <EntriesView
        data={{ ...updates, entries: [...updates.entries, { id: 'u3', date: '1 nov', text: '' }] }}
        editable
        onChange={onChange}
      />
    )
    const texts = screen.getAllByRole('textbox', { name: 'Entry text' })
    fireEvent.keyDown(texts[2], { key: 'Backspace', isComposing: true })
    expect(onChange).not.toHaveBeenCalled()
  })
})
