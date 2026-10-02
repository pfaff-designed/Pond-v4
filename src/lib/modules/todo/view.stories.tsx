import { useState } from 'react'
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'

import { TodoView } from './view'
import type { TodoBlock } from './schema'
import { PondMolecule } from '@/components/molecules/PondMolecule'
import { PondBlock } from '@/components/organisms/PondBlock'
import { blockFrame, POND_BLOCK_WIDTHS } from '@/lib/modules/block-frame'

/**
 * The check row and the `list` block (#219). The play functions assert the COMPUTED
 * values against the board literals — `PondMolecule.dc.html`'s `row` / `handle` /
 * `checkText` (via `wayfinder/board-values.generated.json`, generated from the
 * board's own `renderVals()`; the frames render under a transform, so DOM geometry
 * read off the board lies) and `PondTemplate.dc.html`'s `renderVals()` for the
 * three markers and the `b` column:
 *
 *   row      flex · align center · gap 10 · 360 × ≥36 · padding 0 10 0 4 · radius 10 · 13.5
 *   handle   12 wide · opacity 0 at rest / done / empty · 1 on hover / dragging
 *   rest     transparent · label full ink
 *   done     label ink .68 · line-through at ink .4
 *   hover    rgba(27,29,20,.05)
 *   dragging paper #FAF9EF + lift shadow
 *   empty    `add a step` / `add an item` at ink .68
 *   meta     `bStyle`: PP Neue Montreal Mono 10.5 · ink .68 · nowrap
 *   check    the checkbox atom · label 400
 *   dot      the ink-.5 dot · label 400
 *   none     no dot · label 500 (`fontWeight: d.links ? 500 : 400`)
 */

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

const meta = {
  title: 'Modules/Todo',
  component: TodoView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TodoView>

export default meta
type Story = StoryObj<typeof meta>

/** The board's `check-row` fixtures (`PondBlock.dc.html`'s checklist card): one done. */
const method: TodoBlock = {
  id: 'c1',
  type: 'todo',
  label: 'method',
  items: [
    { id: 'm1', label: 'soak overnight', checked: true },
    { id: 'm2', label: 'simmer 25 min with bay', checked: false },
    { id: 'm3', label: 'stir through harissa', checked: false },
  ],
}

/** The board's `meeting → actions`: `['Sam — final copy', '27 oct', 0]`, `['Ana — book the room', '', 1]`. */
const actions: TodoBlock = {
  id: 'c2',
  type: 'todo',
  label: 'actions',
  items: [
    { id: 'a1', label: 'Sam — final copy', checked: false, meta: '27 oct' },
    { id: 'a2', label: 'Ana — book the room', checked: true },
  ],
}

/** A checklist whose one step has no label yet — the board's empty row. */
const blank: TodoBlock = {
  id: 'c3',
  type: 'todo',
  items: [{ id: 'b1', label: '', checked: false }],
}

/** The board's `list → items` (`groceries`, `note: '5'`). */
const groceries: TodoBlock = {
  id: 'l1',
  type: 'todo',
  label: 'items',
  marker: 'dot',
  items: ['oat milk', 'lemons', 'rice', 'coffee beans', 'bin bags'].map((label, i) => ({
    id: `g${i}`,
    label,
    checked: false,
  })),
}

/** The board's `dashboard → pages` (`links: 1`). */
const pages: TodoBlock = {
  id: 'l2',
  type: 'todo',
  label: 'pages',
  marker: 'none',
  items: [
    { id: 'p1', label: 'running', checked: false, meta: '18.4 km this week' },
    { id: 'p2', label: 'move house', checked: false, meta: '2 of 4 tasks' },
    { id: 'p3', label: 'reading list', checked: false, meta: '3 in progress' },
  ],
}

const INK = 'rgb(27, 29, 20)' // #1B1D14
const PAPER = 'rgb(250, 249, 239)' // #FAF9EF
const INK_68 = 'rgba(27, 29, 20, 0.68)'
const PAPER_68 = 'rgba(250, 249, 239, 0.68)'
const TRANSPARENT = 'rgba(0, 0, 0, 0)'

/**
 * The board writes its washes as `a(.05)`, `a(.4)`, `a(.5)` — ink at an alpha.
 * Tailwind v4 renders the `/5` · `/40` · `/50` modifiers as
 * `color-mix(in oklab, <ink> N%, transparent)`, which Chromium serialises as an
 * `oklab(…)` string, so the computed value cannot be compared to an `rgba()`
 * literal. The probe below mixes the board's own literal ink the same way the
 * stylesheet does and returns the browser's serialisation of it: the assertion is
 * still "ink #1B1D14 at 40%", read off real computed styles, with no tolerance.
 */
function mix(base: string, pct: number): string {
  const probe = document.createElement('span')
  probe.style.color = `color-mix(in oklab, ${base} ${pct}%, transparent)`
  document.body.appendChild(probe)
  const out = getComputedStyle(probe).color
  probe.remove()
  return out
}

interface Ink {
  fg: string
  a68: string
  a5: string
  a40: string
  a50: string
}
const inkOf = (fg: string, a68: string): Ink => ({
  fg,
  a68,
  a5: mix(fg, 5),
  a40: mix(fg, 40),
  a50: mix(fg, 50),
})
const onPaper = () => inkOf(INK, INK_68)
const onInk = () => inkOf(PAPER, PAPER_68)

const rowsOf = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('[data-kind="check-row"],[data-kind="list-row"]'))
const titleOf = (row: HTMLElement) => row.querySelector<HTMLElement>('[data-part="title"]')!
const handleOf = (row: HTMLElement) => row.querySelector<HTMLElement>('[data-part="handle"]')!

/** The board's `row`, every state: flex · center · gap 10 · 360 × ≥36 · 0 10 0 4 · r10 · 13.5. */
async function assertRow(row: HTMLElement) {
  const cs = getComputedStyle(row)
  await expect(cs.display).toBe('flex')
  await expect(cs.alignItems).toBe('center')
  await expect(cs.columnGap).toBe('10px')
  await expect(cs.width).toBe('360px')
  await expect(cs.minHeight).toBe('36px')
  await expect(cs.paddingTop).toBe('0px')
  await expect(cs.paddingRight).toBe('10px')
  await expect(cs.paddingBottom).toBe('0px')
  await expect(cs.paddingLeft).toBe('4px')
  await expect(cs.borderRadius).toBe('10px')
  await expect(cs.fontSize).toBe('13.5px')
  await expect(cs.fontFamily).toContain('PP Neue Montreal')
  await expect(cs.fontFamily).not.toContain('Mono')
  await expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(36)
  // The handle is the board's 12 wide.
  await expect(getComputedStyle(handleOf(row)).width).toBe('12px')
}

/** `bStyle`: PP Neue Montreal Mono 10.5 · ink .68 · nowrap — the molecule's `cellMeta`. */
async function assertMeta(row: HTMLElement, text: string, ink: Ink) {
  const date = row.querySelector<HTMLElement>('[data-part="meta"]')!
  await expect(date).not.toBeNull()
  await expect(date.textContent).toBe(text)
  // Not `today`, so no dated signal.
  await expect(row.querySelector('[data-part="due-dot"]')).toBeNull()
  const cs = getComputedStyle(date)
  await expect(cs.fontFamily).toContain('PP Neue Montreal Mono')
  await expect(cs.fontSize).toBe('10.5px')
  await expect(cs.color).toBe(ink.a68)
  await expect(cs.whiteSpace).toBe('nowrap')
}

async function assertRest(row: HTMLElement, ink: Ink) {
  await assertRow(row)
  await expect(getComputedStyle(row).backgroundColor).toBe(TRANSPARENT)
  await expect(getComputedStyle(handleOf(row)).opacity).toBe('0')
  const t = getComputedStyle(titleOf(row))
  await expect(t.color).toBe(ink.fg)
  await expect(t.textDecorationLine).toBe('none')
}

async function assertDone(row: HTMLElement, ink: Ink) {
  await assertRow(row)
  await expect(getComputedStyle(row).backgroundColor).toBe(TRANSPARENT)
  await expect(getComputedStyle(handleOf(row)).opacity).toBe('0')
  const t = getComputedStyle(titleOf(row))
  await expect(t.color).toBe(ink.a68)
  await expect(t.textDecorationLine).toBe('line-through')
  await expect(t.textDecorationColor).toBe(ink.a40)
  // The ticked box: the atom's inverse-ink fill carries the check mark.
  await expect(row.querySelector('[data-kind="checkbox"] [data-part="check"]')).not.toBeNull()
}

async function assertHover(row: HTMLElement, ink: Ink) {
  await assertRow(row)
  await expect(getComputedStyle(row).backgroundColor).toBe(ink.a5)
  await expect(getComputedStyle(handleOf(row)).opacity).toBe('1')
  await expect(getComputedStyle(titleOf(row)).color).toBe(ink.fg)
}

async function assertEmpty(row: HTMLElement, copy: string, ink: Ink) {
  await assertRow(row)
  await expect(row.dataset.state).toBe('empty')
  await expect(getComputedStyle(row).backgroundColor).toBe(TRANSPARENT)
  await expect(getComputedStyle(handleOf(row)).opacity).toBe('0')
  await expect(titleOf(row).textContent).toBe(copy)
  await expect(getComputedStyle(titleOf(row)).color).toBe(ink.a68)
}

/** The checklist: rest · done · rest, three children each (handle · box · label). */
async function assertMethod(canvasElement: HTMLElement, ink: Ink) {
  const rows = rowsOf(canvasElement)
  await expect(rows).toHaveLength(3)
  for (const row of rows) {
    await expect(row.dataset.kind).toBe('check-row')
    await expect(row.children).toHaveLength(3)
    await expect(row.querySelector('[data-kind="checkbox"]')).not.toBeNull()
    await expect(getComputedStyle(titleOf(row)).fontWeight).toBe('400')
  }
  await assertDone(rows[0], ink)
  await assertRest(rows[1], ink)
  await assertRest(rows[2], ink)
  // The stack is the frame's row gap for the checklist kind.
  await expect(getComputedStyle(rows[0].parentElement!.parentElement!).rowGap).toBe('2px')
}

/** `dot`: list-rows with the 7px ink-.5 dot, weight 400, no box, no meta. */
async function assertGroceries(canvasElement: HTMLElement, ink: Ink) {
  const rows = rowsOf(canvasElement)
  await expect(rows).toHaveLength(5)
  for (const row of rows) {
    await expect(row.dataset.kind).toBe('list-row')
    await assertRest(row, ink)
    await expect(row.querySelector('[data-kind="checkbox"]')).toBeNull()
    await expect(row.querySelector('[data-part="meta"]')).toBeNull()
    const dot = row.querySelector<HTMLElement>('[data-part="dot"]')!
    await expect(dot).not.toBeNull()
    await expect(getComputedStyle(dot).backgroundColor).toBe(ink.a50)
    await expect(getComputedStyle(titleOf(row)).fontWeight).toBe('400')
  }
}

/** `none`: list-rows with no dot, label 500, the summary in the `b` column. */
async function assertPages(canvasElement: HTMLElement, ink: Ink) {
  const rows = rowsOf(canvasElement)
  await expect(rows).toHaveLength(3)
  for (const row of rows) {
    await expect(row.dataset.kind).toBe('list-row')
    await assertRest(row, ink)
    await expect(row.querySelector('[data-part="dot"]')).toBeNull()
    await expect(row.querySelector('[data-kind="checkbox"]')).toBeNull()
    await expect(getComputedStyle(titleOf(row)).fontWeight).toBe('500')
  }
  await assertMeta(rows[0], '18.4 km this week', ink)
  await assertMeta(rows[1], '2 of 4 tasks', ink)
  await assertMeta(rows[2], '3 in progress', ink)
}

// ── Rest + done ───────────────────────────────────────────────────────────────────

export const Checklist: Story = {
  args: { data: method },
  play: async ({ canvasElement }) => assertMethod(canvasElement, onPaper()),
}

export const ChecklistDark: Story = {
  args: { data: method },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertMethod(canvasElement, onInk()),
}

// ── Hover: that row only ──────────────────────────────────────────────────────────

export const Hover: Story = {
  args: { data: method },
  play: async ({ canvasElement }) => {
    const rows = rowsOf(canvasElement)
    await userEvent.hover(rows[1])
    await assertHover(rows[1], onPaper())
    // Only the hovered row washes; its neighbours stay at rest.
    await expect(getComputedStyle(rows[2]).backgroundColor).toBe(TRANSPARENT)
    await expect(getComputedStyle(handleOf(rows[2])).opacity).toBe('0')
    await userEvent.unhover(rows[1])
    await expect(getComputedStyle(rows[1]).backgroundColor).toBe(TRANSPARENT)
  },
}

export const HoverDark: Story = {
  args: { data: method },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => {
    const rows = rowsOf(canvasElement)
    await userEvent.hover(rows[1])
    await assertHover(rows[1], onInk())
  },
}

// ── Dragging: the molecule's lift — the row the view composes, in that state ─────

/**
 * Row reorder is not wired in this slice, so the dragging state is shown on the
 * row itself: paper ground, the lift shadow, the handle revealed. It is the same
 * `check-row` the view renders, with `state="dragging"`.
 */
export const Dragging: Story = {
  args: { data: method },
  render: () => <PondMolecule kind="check-row" title="simmer 25 min with bay" state="dragging" />,
  play: async ({ canvasElement }) => {
    const [row] = rowsOf(canvasElement)
    await assertRow(row)
    const cs = getComputedStyle(row)
    await expect(cs.backgroundColor).toBe(PAPER)
    await expect(cs.boxShadow).not.toBe('none')
    await expect(getComputedStyle(handleOf(row)).opacity).toBe('1')
    await expect(getComputedStyle(titleOf(row)).color).toBe(INK)
  },
}

// ── Empty: `add a step` / `add an item` ───────────────────────────────────────────

export const Empty: Story = {
  args: { data: blank },
  play: async ({ canvasElement }) => {
    const [row] = rowsOf(canvasElement)
    await assertEmpty(row, 'add a step', onPaper())
  },
}

export const EmptyDark: Story = {
  args: { data: blank },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => {
    const [row] = rowsOf(canvasElement)
    await assertEmpty(row, 'add a step', onInk())
  },
}

export const EmptyListItem: Story = {
  args: { data: { ...groceries, items: [{ id: 'z', label: '', checked: false }] } },
  play: async ({ canvasElement }) => {
    const [row] = rowsOf(canvasElement)
    await expect(row.dataset.kind).toBe('list-row')
    await assertEmpty(row, 'add an item', onPaper())
  },
}

// ── Meta: the `b` column on a check row, and the done + meta combination ─────────

export const WithMeta: Story = {
  args: { data: actions },
  play: async ({ canvasElement }) => {
    const [due, done] = rowsOf(canvasElement)
    await assertRest(due, onPaper())
    await expect(due.children).toHaveLength(4)
    await assertMeta(due, '27 oct', onPaper())
    await assertDone(done, onPaper())
    await expect(done.querySelector('[data-part="meta"]')).toBeNull()
    await expect(done.children).toHaveLength(3)
  },
}

export const WithMetaDark: Story = {
  args: { data: actions },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => {
    const [due, done] = rowsOf(canvasElement)
    await assertMeta(due, '27 oct', onInk())
    await assertDone(done, onInk())
  },
}

/** Done AND dated: the strike at .68 with the meta still in the column. */
export const DoneWithMeta: Story = {
  args: {
    data: {
      ...actions,
      items: [{ id: 'd1', label: 'Sam — final copy', checked: true, meta: '27 oct' }],
    },
  },
  play: async ({ canvasElement }) => {
    const [row] = rowsOf(canvasElement)
    await assertDone(row, onPaper())
    await assertMeta(row, '27 oct', onPaper())
  },
}

// ── The other two markers ─────────────────────────────────────────────────────────

export const DotList: Story = {
  args: { data: groceries },
  play: async ({ canvasElement }) => assertGroceries(canvasElement, onPaper()),
}

export const DotListDark: Story = {
  args: { data: groceries },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertGroceries(canvasElement, onInk()),
}

export const PlainList: Story = {
  args: { data: pages },
  play: async ({ canvasElement }) => assertPages(canvasElement, onPaper()),
}

export const PlainListDark: Story = {
  args: { data: pages },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertPages(canvasElement, onInk()),
}

// ── Editable ──────────────────────────────────────────────────────────────────────

/** Stateful host so the editable play tests exercise a real onChange round-trip. */
function Stateful({ data }: { data: TodoBlock }) {
  const [state, setState] = useState(data)
  return <TodoView data={state} editable onChange={setState} />
}

/** Editable: the box is a `role="checkbox"` control, the label a field in the same row geometry. */
export const Editable: Story = {
  args: { data: method },
  render: (args) => <Stateful data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rows = rowsOf(canvasElement)
    for (const row of rows) await assertRow(row)
    const boxes = canvas.getAllByRole('checkbox')
    await expect(boxes).toHaveLength(3)
    await expect(boxes[1]).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(boxes[1])
    await expect(canvas.getAllByRole('checkbox')[1]).toHaveAttribute('aria-checked', 'true')
    // The click left the pointer on the row; step off so the done row reads at rest.
    await userEvent.unhover(boxes[1])
    await assertDone(rowsOf(canvasElement)[1], onPaper())
    // The label field wears the title's register and lands in the block.
    const fields = canvas.getAllByRole('textbox', { name: 'Step' }) as HTMLInputElement[]
    await expect(fields).toHaveLength(3)
    const field = fields[2]
    await expect(getComputedStyle(field).fontSize).toBe('13.5px')
    await expect(getComputedStyle(field).color).toBe(INK)
    await expect(field.value).toBe('stir through harissa')
    await userEvent.type(field, ' and serve')
    await expect(field).toHaveValue('stir through harissa and serve')
  },
}

// ── In the card ───────────────────────────────────────────────────────────────────

/**
 * The block as the product frames it: `blockFrame()` maps a `check` todo to the
 * board's `checklist` card and a `dot` / `none` todo to its `list` card, both 400.
 * The eyebrow is the label; the note is `done of n` for boxes, the count otherwise.
 */
export const InChecklistCard: Story = {
  args: { data: method },
  render: (args) => {
    const frame = blockFrame(args.data)!
    return (
      <PondBlock kind={frame.kind} heading={frame.heading} headNote={frame.headNote}>
        <TodoView data={args.data} />
      </PondBlock>
    )
  },
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-block-kind]')!
    await expect(card.dataset.blockKind).toBe('checklist')
    await expect(card.getBoundingClientRect().width).toBe(POND_BLOCK_WIDTHS.checklist)
    await expect(card.textContent).toContain('method')
    await expect(card.textContent).toContain('1 of 3')
    await assertMethod(canvasElement, onPaper())
  },
}

export const InListCard: Story = {
  args: { data: groceries },
  render: (args) => {
    const frame = blockFrame(args.data)!
    return (
      <PondBlock kind={frame.kind} heading={frame.heading} headNote={frame.headNote}>
        <TodoView data={args.data} />
      </PondBlock>
    )
  },
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-block-kind]')!
    await expect(card.dataset.blockKind).toBe('list')
    await expect(card.getBoundingClientRect().width).toBe(POND_BLOCK_WIDTHS.list)
    await expect(card.textContent).toContain('items')
    await expect(card.textContent).toContain('5')
    await expect(card.textContent).not.toContain('of 5')
    await assertGroceries(canvasElement, onPaper())
  },
}
