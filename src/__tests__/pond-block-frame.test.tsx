/**
 * PondBlock 1/4 (#237) — the card frame, per-kind widths and the head row, measured
 * off `PondBlock.dc.html`:
 *
 *   block   { width: W, padding: '16px 18px', borderRadius: 20, gap: 12,
 *             background: card, boxShadow: cardShadow, fontFamily: sans, color: fg }
 *   W       { list: 400, checklist: 400, table: 500, gallery: 580, number: 400,
 *             log: 460, properties: 400 }
 *   head    { display: flex, alignItems: baseline, justifyContent: space-between, gap: 12 }
 *   eyebrow { fontSize: 10.5, fontWeight: 500, letterSpacing: .1em, uppercase, ink .68 }
 *   headMeta{ fontFamily: mono, fontSize: 10.5, ink .68 }
 *
 * Geometry is asserted here on the class recipe (jsdom has no layout); the
 * computed values are asserted in `PondBlock.stories.tsx`. The engine under the
 * frame — registry dispatch, `onChange` whole-block emits — must come through
 * untouched, so the integration half edits a table cell THROUGH the card.
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { PondBlock, POND_BLOCK_KINDS, POND_BLOCK_WIDTHS } from '@/components/organisms/PondBlock'
import { blockFrame } from '@/lib/modules/block-frame'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

// ── The frame recipe ────────────────────────────────────────────────────────────

const CARD_CLASSES = [
  'rounded-mn-card', // radius 20
  'bg-mn-card', // card paper: #FAF9EF light, #30312A dark (the role flips under .dark)
  'shadow-mn-card', // --mn-shadow-card
  'px-[18px]', // padding 16px 18px
  'py-mn-4',
  'gap-mn-3', // gap 12
  'flex',
  'flex-col',
  'font-sans',
  'text-mn-text',
]

describe('PondBlock — the card frame', () => {
  it.each(POND_BLOCK_KINDS)('%s renders the board card at its own width', (kind) => {
    const { container } = render(
      <PondBlock kind={kind} heading="method" headNote="1 of 3">
        <p>body</p>
      </PondBlock>
    )
    const card = container.firstElementChild as HTMLElement
    expect(card.dataset.blockKind).toBe(kind)
    for (const cls of CARD_CLASSES) expect(card.className.split(' ')).toContain(cls)
    expect(card.className.split(' ')).toContain(`w-[${POND_BLOCK_WIDTHS[kind]}px]`)
    // The column may be narrower than the kind's width — clamp, never overflow.
    expect(card.className.split(' ')).toContain('max-w-full')
  })

  it('per-kind widths are the board’s', () => {
    expect(POND_BLOCK_WIDTHS).toEqual({
      list: 400,
      checklist: 400,
      table: 500,
      gallery: 580,
      number: 400,
      log: 460,
      properties: 400,
    })
  })

  it('the head row is a sans uppercase eyebrow and a mono 10.5 headNote, on a baseline', () => {
    render(
      <PondBlock kind="checklist" heading="method" headNote="1 of 3">
        <p>body</p>
      </PondBlock>
    )
    const eyebrow = screen.getByText('method')
    expect(eyebrow.className).toBe(pageEyebrowClass)
    const note = screen.getByText('1 of 3')
    const noteClasses = note.className.split(' ')
    expect(noteClasses).toContain('font-mono')
    expect(noteClasses).toContain('text-[10.5px]')
    expect(noteClasses).toContain('text-mn-text-secondary')
    expect(noteClasses).not.toContain('uppercase')
    const head = eyebrow.parentElement!
    expect(head).toBe(note.parentElement)
    for (const cls of ['flex', 'items-baseline', 'justify-between', 'gap-mn-3']) {
      expect(head.className.split(' ')).toContain(cls)
    }
  })

  it('an empty headNote still renders the head row (the board’s number kind has none)', () => {
    render(
      <PondBlock kind="number" heading="kcal this week">
        <p>body</p>
      </PondBlock>
    )
    const eyebrow = screen.getByText('kcal this week')
    expect(eyebrow.parentElement!.children).toHaveLength(2)
  })
})

// ── Which card a block gets ───────────────────────────────────────────────────────

describe('blockFrame — maps a persisted block to its board kind + head', () => {
  // #258: `PondTemplate.dc.html` — `bare = k === 'text' && !label`, `hasEyebrow:
  // !!label`. `null` means exactly one thing: an UNLABELLED text block, bare at
  // `padding 2px 4px`. Assert the unlabelled case stays bare so a future default
  // can never quietly card every paragraph in the product.
  it('an unlabelled text block is bare prose, not a card (`bare = text && !label`)', () => {
    expect(blockFrame({ id: 't', type: 'text', content: 'hello' })).toBeNull()
    // An empty or whitespace label is no label — the board's `!label` is falsy.
    expect(blockFrame({ id: 't', type: 'text', label: '', content: 'hello' })).toBeNull()
    expect(blockFrame({ id: 't', type: 'text', label: '  ', content: 'hello' })).toBeNull()
  })

  it('a labelled text block is the `list` card with the label as its eyebrow (project → goal)', () => {
    // The board gives a text block no width of its own, so — as highlight — it sits
    // in the standard 400 card. No note: the board draws none for prose.
    expect(
      blockFrame({ id: 't', type: 'text', label: 'goal', content: 'Out of the flat by the 14th.' })
    ).toEqual({ kind: 'list', heading: 'goal', headNote: '' })
    expect(
      blockFrame({ id: 't', type: 'text', label: 'notes', content: 'Launch moves a week.' })
    ).toEqual({ kind: 'list', heading: 'notes', headNote: '' })
  })

  it('todo → checklist, headNote "done of total"', () => {
    expect(
      blockFrame({
        id: 'c',
        type: 'todo',
        items: [
          { id: '1', label: 'soak', checked: true },
          { id: '2', label: 'simmer', checked: false },
          { id: '3', label: 'stir', checked: false },
        ],
      })
    ).toEqual({ kind: 'checklist', heading: 'checklist', headNote: '1 of 3' })
  })

  it('a labelled todo keeps the checklist card and note; the label is the eyebrow (meeting → actions)', () => {
    expect(
      blockFrame({
        id: 'c',
        type: 'todo',
        label: 'actions',
        items: [
          { id: '1', label: 'Sam — final copy', checked: false },
          { id: '2', label: 'Ana — book the room', checked: true },
        ],
      })
    ).toEqual({ kind: 'checklist', heading: 'actions', headNote: '1 of 2' })
  })

  it('table → table, the title as the eyebrow, a row count as the note', () => {
    expect(
      blockFrame({
        id: 'tb',
        type: 'table',
        title: 'Power Tools',
        columns: ['Tool'],
        rows: [
          { id: 'r1', cells: ['Saw'] },
          { id: 'r2', cells: ['Plane'] },
        ],
      })
    ).toEqual({ kind: 'table', heading: 'Power Tools', headNote: '2 rows' })
    expect(
      blockFrame({ id: 'tb', type: 'table', columns: ['Tool'], rows: [{ id: 'r', cells: ['x'] }] })
    ).toEqual({ kind: 'table', heading: 'table', headNote: '1 row' })
  })

  it('view → by mode: gallery 580, big-number 400, the rest table 500', () => {
    expect(blockFrame({ id: 'v', type: 'view', mode: 'gallery' })).toMatchObject({
      kind: 'gallery',
      heading: 'gallery',
    })
    expect(blockFrame({ id: 'v', type: 'view', mode: 'big-number' })).toMatchObject({
      kind: 'number',
      heading: 'big number',
      headNote: '',
    })
    for (const mode of ['table', 'board', 'calendar', 'gantt', 'chart'] as const) {
      expect(blockFrame({ id: 'v', type: 'view', mode })).toMatchObject({ kind: 'table' })
    }
  })

  it('a labelled view keeps its mode’s card; the label replaces the mode name (project → tasks — board)', () => {
    expect(blockFrame({ id: 'v', type: 'view', label: 'tasks — board', mode: 'board' })).toEqual({
      kind: 'table',
      heading: 'tasks — board',
      headNote: '',
    })
    expect(blockFrame({ id: 'v', type: 'view', label: 'records', mode: 'gallery' })).toEqual({
      kind: 'gallery',
      heading: 'records',
      headNote: '',
    })
    expect(blockFrame({ id: 'v', type: 'view', label: 'streak', mode: 'big-number' })).toEqual({
      kind: 'number',
      heading: 'streak',
      headNote: '',
    })
  })

  it('highlight → the default 400 card, its kind as the eyebrow, no note (#249)', () => {
    // PondBlock.dc.html has no highlight kind; PondTemplate.dc.html draws it in the
    // normal block card with the standard head row and gives it no width of its own.
    expect(blockFrame({ id: 'h', type: 'highlight', content: 'a line worth keeping' })).toEqual({
      kind: 'list',
      heading: 'highlight',
      headNote: '',
    })
  })

  it('a labelled highlight’s eyebrow is its label (reading → kept)', () => {
    expect(
      blockFrame({
        id: 'h',
        type: 'highlight',
        label: 'kept',
        content: 'Three books at once is one too many.',
      })
    ).toEqual({ kind: 'list', heading: 'kept', headNote: '' })
  })

  it('entries → the `log` card (460), its kind as the eyebrow, the entry count as the note (#250)', () => {
    // PondBlock.dc.html's `log` kind is a stack of { meta: date, title: prose } rows —
    // exactly a dated log. This mapping makes the log card reachable for the first time.
    expect(
      blockFrame({
        id: 'e',
        type: 'entries',
        entries: [
          { id: '1', date: '28 oct', text: 'Van booked.' },
          { id: '2', date: '24 oct', text: 'Inventory date confirmed.' },
        ],
      })
    ).toEqual({ kind: 'log', heading: 'entries', headNote: '2 entries' })
    expect(blockFrame({ id: 'e', type: 'entries', entries: [] })).toEqual({
      kind: 'log',
      heading: 'entries',
      headNote: '0 entries',
    })
  })

  it('a labelled entries block keeps the log card and count; the label is the eyebrow (project → updates)', () => {
    expect(
      blockFrame({
        id: 'e',
        type: 'entries',
        label: 'updates',
        entries: [{ id: '1', date: '28 oct', text: 'Van booked.' }],
      })
    ).toEqual({ kind: 'log', heading: 'updates', headNote: '1 entry' })
  })

  it('table’s `title` IS its label — unchanged, no second field (#258)', () => {
    // `log` is the tracker's label for its table; persisted rows carry `title`, and
    // a rename would need a migration this slice must not have.
    expect(
      blockFrame({ id: 'tb', type: 'table', title: 'log', columns: ['date', 'value'], rows: [] })
    ).toEqual({ kind: 'table', heading: 'log', headNote: '0 rows' })
  })

  it('image → the default 400 card, the filename as the note', () => {
    expect(
      blockFrame({ id: 'i', type: 'image', url: 'https://x/a.png', filename: 'a.png' })
    ).toEqual({ kind: 'list', heading: 'image', headNote: 'a.png' })
    expect(
      blockFrame({ id: 'i', type: 'image', url: 'https://x/a.pdf', filename: 'a.pdf' })
    ).toEqual({ kind: 'list', heading: 'file', headNote: 'a.pdf' })
  })
})

// ── Integration: BlockCanvas wraps every block in the card, engine untouched ─────

const blocks: Block[] = [
  { id: 'b-text', type: 'text', content: 'Notes on the workbench build' },
  {
    id: 'b-todo',
    type: 'todo',
    items: [
      { id: 'i1', label: 'soak overnight', checked: true },
      { id: 'i2', label: 'simmer 25 min', checked: false },
    ],
  },
  {
    id: 'b-table',
    type: 'table',
    title: 'Power Tools',
    columns: ['Tool', 'Location'],
    rows: [{ id: 'r1', cells: ['Table Saw', 'Centre of shop'] }],
  },
  // #258: the board's `project → goal` — a LABELLED text block is a card.
  { id: 'b-goal', type: 'text', label: 'goal', content: 'Out of the flat by the 14th.' },
]

function renderCanvas(onChange = jest.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlockCanvas blocks={blocks} pageId="page-1" onChange={onChange} onUndoRemove={jest.fn()} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return onChange
}

describe('BlockCanvas — every block renders inside the board card', () => {
  it('a checklist and a table get their cards; prose stays bare', () => {
    renderCanvas()
    const todoCard = document.getElementById('block-b-todo')!.querySelector('[data-block-kind]')!
    expect(todoCard.getAttribute('data-block-kind')).toBe('checklist')
    expect(todoCard.className.split(' ')).toContain('w-[400px]')
    expect(todoCard.className.split(' ')).toContain('rounded-mn-card')
    // The head row sits on the card, the module view under it.
    expect(todoCard.textContent).toContain('1 of 2')
    expect(todoCard.querySelector('input[type="checkbox"]')).not.toBeNull()

    const tableCard = document.getElementById('block-b-table')!.querySelector('[data-block-kind]')!
    expect(tableCard.getAttribute('data-block-kind')).toBe('table')
    expect(tableCard.className.split(' ')).toContain('w-[500px]')
    // The title is the eyebrow; the view's own caption hides under a frame (a
    // CSS variant keyed on the card's data-block-kind) so the name never reads twice,
    // while bare hosts — diff cards, previews — keep it.
    const titles = screen.getAllByText('Power Tools')
    expect(titles).toHaveLength(2)
    expect(titles[0].className).toBe(pageEyebrowClass)
    expect(titles[1].className.split(' ')).toContain('[[data-block-kind]_&]:hidden')
    expect(tableCard.textContent).toContain('1 row')

    expect(document.getElementById('block-b-text')!.querySelector('[data-block-kind]')).toBeNull()
  })

  it('a labelled text block gets the list card with its label as the eyebrow; unlabelled prose stays bare (#258)', () => {
    renderCanvas()
    const goalCard = document.getElementById('block-b-goal')!.querySelector('[data-block-kind]')!
    expect(goalCard.getAttribute('data-block-kind')).toBe('list')
    expect(goalCard.className.split(' ')).toContain('w-[400px]')
    expect(goalCard.className.split(' ')).toContain('rounded-mn-card')
    const eyebrow = screen.getByText('goal')
    expect(eyebrow.className).toBe(pageEyebrowClass)
    expect(goalCard.contains(eyebrow)).toBe(true)
    // The prose renders under the head row, inside the card — the view is untouched.
    expect(goalCard.textContent).toContain('Out of the flat by the 14th.')
    // The sibling with no label is still bare: same type, different frame.
    expect(document.getElementById('block-b-text')!.querySelector('[data-block-kind]')).toBeNull()
  })

  it('an edit inside the card still emits the whole next array (the onChange wiring survives)', () => {
    const onChange = renderCanvas()
    fireEvent.change(screen.getByDisplayValue('Table Saw'), { target: { value: 'Mitre Saw' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as Block[]
    expect(next).toHaveLength(4)
    const table = next[2]
    expect(table.type === 'table' && table.rows[0].cells).toEqual(['Mitre Saw', 'Centre of shop'])
    // Untouched siblings come through by reference.
    expect(next[0]).toBe(blocks[0])
    expect(next[1]).toBe(blocks[1])
  })
})
