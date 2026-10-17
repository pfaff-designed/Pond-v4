import { useState } from 'react'
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'

import { EntriesView } from './view'
import { ENTRIES_EMPTY_LINE, type EntriesBlock } from './schema'
import { PondBlock } from '@/components/organisms/PondBlock'
import { blockFrame } from '@/lib/modules/block-frame'

/**
 * The `entries` block (#250) — dated prose, serif only for the journal. The play
 * functions assert the COMPUTED values against `PondMolecule.dc.html`'s `entry` kind
 * (conductor's ruling, KAN-356: the library wins over the superseded
 * `PondTemplate.dc.html` reading these numbers used to cite):
 *
 *   stack   flex column · gap 8
 *   entry   grid 56px minmax(0,1fr) · gap 14 · padding 10px 8px · radius 10 ·
 *           align-items baseline
 *   edate   PP Neue Montreal Mono 10.5 · ink .68
 *   sans    PP Neue Montreal 13.5 / 1.5 · full ink              (project → updates)
 *   serif   PP Editorial New 200 / 16.5 / 1.6 · full ink         (journal → entries)
 *   empty   sans 13.5 / 1.5 · ink .68 — even on a serif block (`d.serif && filled`)
 *   both    text-wrap: pretty
 */

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

const meta = {
  title: 'Modules/Entries',
  component: EntriesView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof EntriesView>

export default meta
type Story = StoryObj<typeof meta>

/** The board's `project` → `updates` fixture (no flag → sans). */
const updates: EntriesBlock = {
  id: 'e1',
  type: 'entries',
  entries: [
    { id: 'u1', date: '28 oct', text: 'Van booked for the morning of the 14th.' },
    { id: 'u2', date: '24 oct', text: 'Landlord confirmed the inventory date.' },
  ],
}

/** The board's `journal` → `entries` fixture (`serif: 1`). */
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

/** A serif block whose one entry has no prose yet — the board's empty row. */
const blankJournal: EntriesBlock = {
  ...journal,
  entries: [{ id: 'b1', date: 'today', text: '' }],
}

/** The same empty row on a SANS block: the medium is the block's, not the state's. */
const blankUpdates: EntriesBlock = {
  ...updates,
  entries: [{ id: 'b2', date: 'today', text: '' }],
}

const INK = 'rgb(27, 29, 20)' // #1B1D14
const PAPER = 'rgb(250, 249, 239)' // #FAF9EF
const INK_68 = 'rgba(27, 29, 20, 0.68)'
const PAPER_68 = 'rgba(250, 249, 239, 0.68)'

const rowsOf = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('[data-part="date"]')).map((d) => d.parentElement!)
const datesOf = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('[data-part="date"]'))
const textsOf = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('[data-part="text"]'))

/** The stack and the row grid, common to every medium and state. */
async function assertGeometry(canvasElement: HTMLElement, count: number) {
  const rows = rowsOf(canvasElement)
  await expect(rows).toHaveLength(count)
  const stack = rows[0].parentElement!
  const ss = getComputedStyle(stack)
  await expect(ss.display).toBe('flex')
  await expect(ss.flexDirection).toBe('column')
  await expect(ss.rowGap).toBe('8px')
  for (const row of rows) {
    const cs = getComputedStyle(row)
    await expect(cs.display).toBe('grid')
    // A laid-out grid resolves its tracks to px: the first is the molecule's 56.
    await expect(cs.gridTemplateColumns.startsWith('56px ')).toBe(true)
    await expect(cs.columnGap).toBe('14px')
    await expect(cs.alignItems).toBe('baseline')
    await expect(cs.paddingTop).toBe('10px')
    await expect(cs.paddingBottom).toBe('10px')
    await expect(cs.paddingLeft).toBe('8px')
    await expect(cs.paddingRight).toBe('8px')
    await expect(cs.borderRadius).toBe('10px')
  }
}

/** `edate`: mono 10.5 at ink .68 (paper .68 on ink). */
async function assertDates(canvasElement: HTMLElement, ink68: string) {
  for (const d of datesOf(canvasElement)) {
    const cs = getComputedStyle(d)
    await expect(cs.fontFamily).toContain('PP Neue Montreal Mono')
    await expect(cs.fontSize).toBe('10.5px')
    await expect(cs.color).toBe(ink68)
  }
}

/** The sans branch: 13.5 / 1.5, `text-wrap: pretty`, the given colour. */
async function assertSans(cs: CSSStyleDeclaration, color: string) {
  await expect(cs.fontFamily).toContain('PP Neue Montreal')
  await expect(cs.fontFamily).not.toContain('PP Editorial New')
  // 'PP Neue Montreal Mono' CONTAINS 'PP Neue Montreal', so without this a mono text
  // column at 13.5 / 1.5 would pass every other assertion here.
  await expect(cs.fontFamily).not.toContain('Mono')
  await expect(cs.fontSize).toBe('13.5px')
  await expect(cs.lineHeight).toBe('20.25px') // 1.5 × 13.5
  await expect(cs.textWrap).toBe('pretty')
  await expect(cs.color).toBe(color)
}

/** The serif branch: PP Editorial New 200 / 16.5 / 1.6, `text-wrap: pretty`, full ink. */
async function assertSerif(cs: CSSStyleDeclaration, ink: string) {
  await expect(cs.fontFamily).toContain('PP Editorial New')
  await expect(cs.fontWeight).toBe('200')
  await expect(cs.fontSize).toBe('16.5px')
  await expect(cs.lineHeight).toBe('26.4px') // 1.6 × 16.5
  await expect(cs.textWrap).toBe('pretty')
  await expect(cs.color).toBe(ink)
}

async function assertUpdates(canvasElement: HTMLElement, ink: string, ink68: string) {
  await assertGeometry(canvasElement, 2)
  await assertDates(canvasElement, ink68)
  for (const t of textsOf(canvasElement)) await assertSans(getComputedStyle(t), ink)
}

async function assertJournal(canvasElement: HTMLElement, ink: string, ink68: string) {
  await assertGeometry(canvasElement, 3)
  await assertDates(canvasElement, ink68)
  for (const t of textsOf(canvasElement)) await assertSerif(getComputedStyle(t), ink)
}

/**
 * Empty: the board's line at .68, in the BLOCK'S OWN MEDIUM. The journal fixture is
 * serif, so its blank row is serif at .68 — `keep the medium, drop the ink`, which is
 * `renderVals()`'s idiom for an empty authored-prose block (`text`, `highlight`). See
 * the fork's rationale in `entries/view.tsx`.
 */
async function assertBlank(canvasElement: HTMLElement, ink68: string) {
  await assertGeometry(canvasElement, 1)
  await assertDates(canvasElement, ink68)
  const [t] = textsOf(canvasElement)
  await expect(t.textContent).toBe(ENTRIES_EMPTY_LINE)
  await assertSerif(getComputedStyle(t), ink68)
}

// ── Sans: project → updates ─────────────────────────────────────────────────────

export const Updates: Story = {
  args: { data: updates },
  play: async ({ canvasElement }) => assertUpdates(canvasElement, INK, INK_68),
}

export const UpdatesDark: Story = {
  args: { data: updates },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertUpdates(canvasElement, PAPER, PAPER_68),
}

// ── Serif: journal → entries ────────────────────────────────────────────────────

export const Journal: Story = {
  args: { data: journal },
  play: async ({ canvasElement }) => assertJournal(canvasElement, INK, INK_68),
}

export const JournalDark: Story = {
  args: { data: journal },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertJournal(canvasElement, PAPER, PAPER_68),
}

// ── Empty: a blank entry on a serif block is still sans .68 ─────────────────────

export const Empty: Story = {
  args: { data: blankJournal },
  play: async ({ canvasElement }) => assertBlank(canvasElement, INK_68),
}

export const EmptyDark: Story = {
  args: { data: blankJournal },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertBlank(canvasElement, PAPER_68),
}

/** The sans twin of `assertBlank`: the empty line in the SANS medium at .68. */
async function assertBlankSans(canvasElement: HTMLElement, ink68: string) {
  await assertGeometry(canvasElement, 1)
  await assertDates(canvasElement, ink68)
  const [t] = textsOf(canvasElement)
  await expect(t.textContent).toBe(ENTRIES_EMPTY_LINE)
  await assertSans(getComputedStyle(t), ink68)
}

/**
 * The block's own flag picks the medium in BOTH directions. The serif `Empty` story
 * above proves a journal keeps its serif; this proves a sans block does not acquire
 * one. A fork that read the state instead of the flag passes one of the two.
 */
export const EmptySans: Story = {
  args: { data: blankUpdates },
  play: async ({ canvasElement }) => assertBlankSans(canvasElement, INK_68),
}

export const EmptySansDark: Story = {
  args: { data: blankUpdates },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertBlankSans(canvasElement, PAPER_68),
}

/**
 * Whitespace-only prose is blank: `filled` is `text.trim() !== ''`. Without the
 * trim a row of spaces renders at FULL ink with no visible text — a row that looks
 * like a rendering bug and reads as nothing, with no error anywhere.
 */
export const WhitespaceIsEmpty: Story = {
  args: {
    data: { ...journal, entries: [{ id: 'w1', date: '1 jan', text: '  \n ' }] },
  },
  play: async ({ canvasElement }) => assertBlank(canvasElement, INK_68),
}

/**
 * Read-only renders NO fields. A field reaching a page the person cannot edit is
 * both an editing affordance the role does not grant and a focus stop in the ARIA
 * tree; nothing about it looks wrong in a screenshot.
 */
export const ReadOnlyHasNoFields: Story = {
  args: { data: journal },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryAllByRole('textbox')).toHaveLength(0)
    await expect(canvasElement.querySelector('input,textarea')).toBeNull()
    await assertJournal(canvasElement, INK, INK_68)
  },
}

// ── Editable ────────────────────────────────────────────────────────────────────

/** Stateful host so the editable play test exercises a real onChange round-trip. */
function Stateful({ data }: { data: EntriesBlock }) {
  const [state, setState] = useState(data)
  return <EntriesView data={state} editable onChange={setState} />
}

/** Editable journal: the textarea wears the serif register; typing lands in the block. */
export const EditableJournal: Story = {
  args: { data: journal },
  render: (args) => <Stateful data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const texts = canvas.getAllByRole('textbox', { name: 'Entry text' })
    await expect(texts).toHaveLength(3)
    await assertSerif(getComputedStyle(texts[0]), INK)
    await expect((texts[0] as HTMLTextAreaElement).placeholder).toBe(ENTRIES_EMPTY_LINE)
    const dates = canvas.getAllByRole('textbox', { name: 'Entry date' })
    const ds = getComputedStyle(dates[0])
    await expect(ds.fontFamily).toContain('PP Neue Montreal Mono')
    await expect(ds.fontSize).toBe('10.5px')
    await expect(ds.color).toBe(INK_68)
    // The editable row keeps the read-only row's geometry: the molecule's 56px grid
    // at gap 14, baseline — the fields swap in, the layout does not change.
    for (const t of texts) {
      const cs = getComputedStyle(t.parentElement!)
      await expect(cs.display).toBe('grid')
      await expect(cs.gridTemplateColumns.startsWith('56px ')).toBe(true)
      await expect(cs.columnGap).toBe('14px')
      await expect(cs.alignItems).toBe('baseline')
    }
    await userEvent.type(texts[1], ' Early night.')
    await expect(texts[1]).toHaveValue(
      'Quiet day. Finished the chapter and started the next. Early night.'
    )
  },
}

/** Editable updates: the textarea is sans — the flag, not editing, picks the medium. */
export const EditableUpdates: Story = {
  args: { data: updates },
  render: (args) => <Stateful data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const t of canvas.getAllByRole('textbox', { name: 'Entry text' })) {
      await assertSans(getComputedStyle(t), INK)
    }
  },
}

// ── In the log card ─────────────────────────────────────────────────────────────

/**
 * The block as the product frames it: `blockFrame()` maps `entries` to the board's
 * `log` kind (460, `PondBlock.dc.html`) — the first block to reach that card. The
 * eyebrow is the kind, the note the entry count.
 */
export const InLogCard: Story = {
  args: { data: journal },
  render: (args) => {
    const frame = blockFrame(args.data)!
    return (
      <PondBlock kind={frame.kind} heading={frame.heading} headNote={frame.headNote}>
        <EntriesView data={args.data} />
      </PondBlock>
    )
  },
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-block-kind]')!
    await expect(card.dataset.blockKind).toBe('log')
    // ADR 0008: the card fills its container, not the board's old 460px.
    const p = card.parentElement!
    const pcs = getComputedStyle(p)
    const avail = p.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight)
    await expect(card.getBoundingClientRect().width).toBeCloseTo(avail, 0)
    await expect(card.textContent).toContain('3 entries')
    await assertJournal(canvasElement, INK, INK_68)
    // The rows fill the card's content box — fluid, not the molecule's fixed 420.
    const row = rowsOf(canvasElement)[0]
    const body = row.parentElement!
    await expect(row.getBoundingClientRect().width).toBe(body.getBoundingClientRect().width)
  },
}
