import { useState } from 'react'
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { EntriesView, addEntryFocused } from './view'
import { ENTRIES_EMPTY_LINE, type EntriesBlock } from './schema'
import { PondBlock } from '@/components/organisms/PondBlock'
import { blockFrame, blockIsEmpty } from '@/lib/modules/block-frame'

/**
 * The `entries` block (#250) — dated prose, serif unconditionally (KAN-444): both
 * the board's fixtures (`project` → `updates`, `journal` → `entries`) render the
 * same register, no per-block flag left to toggle. The play functions assert the
 * COMPUTED values against `PondMolecule.dc.html`'s `entry` kind (conductor's ruling,
 * KAN-356: the library wins over the superseded `PondTemplate.dc.html` reading these
 * numbers used to cite):
 *
 *   stack   flex column · gap 2
 *   entry   grid 56px minmax(0,1fr) · gap 14 · padding 10px 8px · radius 10 ·
 *           align-items baseline · hover bg ink .05 (ink-alpha token, editable only)
 *   edate   PP Neue Montreal Mono 10.5 · ink .68
 *   serif   PP Editorial New 200 / 16.5 / 1.6 · full ink, ink .68 blank
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

/** The board's `project` → `updates` fixture — serif too, like every entries block. */
const updates: EntriesBlock = {
  id: 'e1',
  type: 'entries',
  entries: [
    { id: 'u1', date: '28 oct', text: 'Van booked for the morning of the 14th.' },
    { id: 'u2', date: '24 oct', text: 'Landlord confirmed the inventory date.' },
  ],
}

/** The board's `journal` → `entries` fixture. */
const journal: EntriesBlock = {
  id: 'e2',
  type: 'entries',
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

const INK = 'rgb(27, 29, 20)' // #1B1D14
const PAPER = 'rgb(250, 249, 239)' // #FAF9EF
const INK_68 = 'rgba(27, 29, 20, 0.68)'
const PAPER_68 = 'rgba(250, 249, 239, 0.68)'

/**
 * The board writes its hover wash as `a(.05)` — ink at an alpha. Tailwind v4
 * renders `bg-mn-text/5` as `color-mix(in oklab, <ink> 5%, transparent)`, which
 * Chromium serialises as an `oklab(…)` string, not an `rgba()` literal (see
 * `todo/view.stories.tsx`'s own `mix` probe, the repo's convention for this).
 */
function mix(base: string, pct: number): string {
  const probe = document.createElement('span')
  probe.style.color = `color-mix(in oklab, ${base} ${pct}%, transparent)`
  document.body.appendChild(probe)
  const out = getComputedStyle(probe).color
  probe.remove()
  return out
}
const INK_05 = () => mix(INK, 5)
const PAPER_05 = () => mix(PAPER, 5)

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
  await expect(ss.rowGap).toBe('2px')
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
  for (const t of textsOf(canvasElement)) await assertSerif(getComputedStyle(t), ink)
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

// ── Serif: project → updates ────────────────────────────────────────────────────

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

// ── Empty: a blank entry keeps the serif medium, dropping only the ink ──────────

export const Empty: Story = {
  args: { data: blankJournal },
  play: async ({ canvasElement }) => assertBlank(canvasElement, INK_68),
}

export const EmptyDark: Story = {
  args: { data: blankJournal },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertBlank(canvasElement, PAPER_68),
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

/**
 * Editable journal: the textarea wears the serif register; typing lands in the
 * block. The date stays the read-only mono LABEL (no board draws a live date field
 * for `entry` — it is system-set at `addEntry` time), and a focused row wears the
 * molecule's `editing` ring: `boxShadow: inset 0 0 0 1.4px fg`.
 */
export const EditableJournal: Story = {
  args: { data: journal },
  render: (args) => <Stateful data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const texts = canvas.getAllByRole('textbox', { name: 'Entry text' })
    await expect(texts).toHaveLength(3)
    await assertSerif(getComputedStyle(texts[0]), INK)
    await expect((texts[0] as HTMLTextAreaElement).placeholder).toBe('')
    await expect((texts[texts.length - 1] as HTMLTextAreaElement).placeholder).toBe(
      ENTRIES_EMPTY_LINE,
    )
    await expect(canvas.queryAllByRole('textbox', { name: 'Entry date' })).toHaveLength(0)
    const dates = datesOf(canvasElement)
    await expect(dates).toHaveLength(3)
    const ds = getComputedStyle(dates[0])
    await expect(ds.fontFamily).toContain('PP Neue Montreal Mono')
    await expect(ds.fontSize).toBe('10.5px')
    await expect(ds.color).toBe(INK_68)
    // The editable row keeps the read-only row's geometry: the molecule's 56px grid
    // at gap 14, baseline — the fields swap in, the layout does not change.
    const rows = texts.map((t) => t.parentElement!)
    for (const row of rows) {
      const cs = getComputedStyle(row)
      await expect(cs.display).toBe('grid')
      await expect(cs.gridTemplateColumns.startsWith('56px ')).toBe(true)
      await expect(cs.columnGap).toBe('14px')
      await expect(cs.alignItems).toBe('baseline')
      await expect(cs.boxShadow).toBe('none')
    }
    await userEvent.click(texts[0])
    await expect(getComputedStyle(rows[0]).boxShadow).toContain('inset')
    await expect(getComputedStyle(rows[0]).boxShadow).toContain('1.4px')
    await expect(getComputedStyle(rows[1]).boxShadow).toBe('none')
    await userEvent.tab()
    await expect(getComputedStyle(rows[0]).boxShadow).toBe('none')
    await userEvent.type(texts[1], ' Early night.')
    await expect(texts[1]).toHaveValue(
      'Quiet day. Finished the chapter and started the next. Early night.'
    )
  },
}

/** Editable updates: the textarea is serif too — no flag left to pick a different medium. */
export const EditableUpdates: Story = {
  args: { data: updates },
  render: (args) => <Stateful data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const t of canvas.getAllByRole('textbox', { name: 'Entry text' })) {
      await assertSerif(getComputedStyle(t), INK)
    }
    // The date is a read-only label here too — the project's `updates` has no
    // more claim to a live date field than the journal does.
    await expect(canvas.queryAllByRole('textbox', { name: 'Entry date' })).toHaveLength(0)
    await expect(datesOf(canvasElement)).toHaveLength(2)
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

/**
 * `InLogCard`, made editable and stateful: the empty state's `write one` is wired
 * through `addEntryFocused`, the same shared insert-and-focus helper
 * `BlockCanvas.tsx`'s `useBlockEmptyState` calls — it registers the new entry's
 * id with `requestEntryFocus` BEFORE returning the next block, since this flips
 * the frame from `empty` to `rest`, a true first mount of `EntriesView` (the
 * empty card renders no view at all) with no ref on it yet to carry the id
 * (KAN-444). This is the whole host a person sees, not `EntriesView` in isolation.
 */
function EditableLogHost({ data: initial }: { data: EntriesBlock }) {
  const [data, setData] = useState(initial)
  const frame = blockFrame(data)!
  return (
    <PondBlock
      kind={frame.kind}
      heading={frame.heading}
      headNote={frame.headNote}
      state={blockIsEmpty(data) ? 'empty' : 'rest'}
      onEmptyAction={() => setData(addEntryFocused(data))}
    >
      <EntriesView data={data} editable onChange={setData} />
    </PondBlock>
  )
}

/**
 * KAN-444's path test (`PATH_STEPS`): write one → type "first" at once, serif →
 * add "second" via the add line → a row's own ↵ → hover the oldest row (only its
 * `remove` shows, the rest stay at `opacity: 0`) → remove it, the rest remain →
 * paste a long entry, nothing clips. This is the thin slice a person actually
 * reaches, walked against `EditableLogHost` — the real card, not `EntriesView`
 * alone — so it fails before any of KAN-444's items land and passes once they all
 * do. ⌘Z is NOT exercised here — add/remove ride the ordinary `onChange` →
 * debounced `commitBlocks({ ownEdit: true })` path (`use-page-draft.ts`), which
 * already logs a change-log record and calls `sessionUndo.remember` for every
 * ordinary edit (the same path `patchEntry`'s typing already rides), identical in
 * effect to `persistBlocksAsOwnEdit`'s immediate variant used for
 * template-apply/drag-drop in `BlockCanvas.tsx`. The live verifier confirms ⌘Z in
 * the real browser.
 *
 * Every `document.activeElement` assertion below runs BEFORE any typing into that
 * element: `userEvent.type` focuses its target itself, so typing first would prove
 * nothing about whether the INSERT focused it (KAN-444) — only that typing does.
 */
async function walkPath(canvasElement: HTMLElement, hoverBg: () => string, ink: string) {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: 'write one' }))

  const firstText = canvas.getByRole('textbox', { name: 'Entry text' })
  await expect(document.activeElement).toBe(firstText)
  await userEvent.type(firstText, 'first')
  await expect(firstText).toHaveValue('first')
  await assertSerif(getComputedStyle(firstText), ink)

  const addLine = canvas.getByRole('textbox', { name: 'Add entry' })
  await userEvent.type(addLine, 'second{Enter}')
  await expect(addLine).toHaveValue('')

  let texts = canvas.getAllByRole('textbox', { name: 'Entry text' })
  await expect(texts).toHaveLength(2)
  await expect(texts[0]).toHaveValue('second') // newest first
  await expect(texts[1]).toHaveValue('first')
  await expect(document.activeElement).toBe(texts[0])

  /**
   * Row-scoped `remove` (`group/row`, KAN-444): row 0's textarea already has
   * focus (asserted above) — `group-focus-within/row:opacity-100` must reveal
   * ONLY that row's button, never row 1's (the bare `group` bug this ticket
   * fixed matched every row in the stack from one pointer anywhere over the
   * block). Proven via focus, not `userEvent.hover`: that call only dispatches
   * synthetic mouse events in this real-browser runner (see
   * `MadeFromChip.stories.tsx`'s "Parking uses a CLICK" note) and neither it nor
   * a dispatched click moves the real cursor, so neither can drive a CSS
   * `:hover` match here — `:focus-within` is real DOM focus state regardless,
   * which is exactly the "same for keyboard focus" half of the same rule.
   */
  const removeOf = (row: HTMLElement) => within(row).getByRole('button', { name: 'Remove entry' })
  const rowsAt2 = texts.map((t) => t.parentElement!)
  await waitFor(() => expect(getComputedStyle(removeOf(rowsAt2[0])).opacity).toBe('1'))
  await expect(getComputedStyle(removeOf(rowsAt2[1])).opacity).toBe('0')

  // A row's own ↵ inserts another blank entry at the top, focused — pressed from
  // `texts[1]` ("first"), not the row already focused above, so this proves the
  // path on its own rather than riding the add line's leftover focus.
  await userEvent.type(texts[1], '{Enter}')
  texts = canvas.getAllByRole('textbox', { name: 'Entry text' })
  await expect(texts).toHaveLength(3)
  await expect(texts[0]).toHaveValue('')
  await expect(texts[1]).toHaveValue('second')
  await expect(texts[2]).toHaveValue('first')
  await expect(document.activeElement).toBe(texts[0])

  const oldestRow = texts[2].parentElement!
  // The row's own ↵ just above was typed into this very row (the "first" entry
  // keeps its identity as new ones prepend) — move off it explicitly before
  // asserting its rest state.
  await userEvent.unhover(oldestRow)
  await expect(getComputedStyle(oldestRow).backgroundColor).toBe('rgba(0, 0, 0, 0)')
  await userEvent.hover(oldestRow)
  // `hoveredId` state (`onMouseEnter`/`onMouseLeave`) applies the molecule's
  // `hover` wash (`a(.05)`) through the ink-alpha role token, so it reads
  // correctly on both themes without a separate class.
  await expect(getComputedStyle(oldestRow).backgroundColor).toBe(hoverBg())
  await userEvent.click(within(oldestRow).getByRole('button', { name: 'Remove entry' }))

  const remaining = canvas.getAllByRole('textbox', { name: 'Entry text' })
  await expect(remaining).toHaveLength(2)
  await expect(remaining[0]).toHaveValue('')
  await expect(remaining[1]).toHaveValue('second')

  /**
   * "Paste a ~300-character entry" (`PATH_STEPS` step 6): a single paragraph with
   * no `\n`, long enough to wrap several visual lines, pasted through the add
   * line. `field-sizing: content` must size the new row to its full wrapped
   * height — `rows={Math.max(1, text.split('\n').length)}` used to clip it to one
   * visible line regardless of how far it wrapped (KAN-444).
   */
  await userEvent.click(addLine)
  await userEvent.paste(LONG_ENTRY)
  await expect(addLine).toHaveValue(LONG_ENTRY)
  await userEvent.type(addLine, '{Enter}')
  const grown = canvas.getAllByRole('textbox', { name: 'Entry text' })[0] as HTMLTextAreaElement
  await expect(grown).toHaveValue(LONG_ENTRY)
  await expect(grown.scrollHeight).toBe(grown.clientHeight)
}

const emptyLog: EntriesBlock = { id: 'e3', type: 'entries', entries: [] }

export const EditablePath: Story = {
  args: { data: emptyLog },
  render: (args) => <EditableLogHost data={args.data} />,
  play: async ({ canvasElement }) => walkPath(canvasElement, INK_05, INK),
}

export const EditablePathDark: Story = {
  args: { data: emptyLog },
  decorators: [inkTheme],
  render: (args) => <EditableLogHost data={args.data} />,
  play: async ({ canvasElement }) => walkPath(canvasElement, PAPER_05, PAPER),
}

// ── No clipping ──────────────────────────────────────────────────────────────────

/**
 * A single paragraph with no `\n` in it, long enough to wrap across several
 * visual lines — the case `rows={Math.max(1, text.split('\n').length)}` got
 * wrong (KAN-444): it counts newlines, not wrapped lines, so a long one-line
 * paragraph used to clip to `rows={1}` regardless of how far it wrapped.
 */
const LONG_ENTRY =
  'The ferry was late again, so I walked the long way round past the boatyard and watched the tide come back in over the mudflats. Nobody else was out. The gulls had the whole estuary to themselves, and for a while so did I, which was worth the wait at the terminal by the time the next one finally came in.'

/** A width-controllable host: `field-sizing: content` must re-fit when the column narrows, not just once on type. */
function AutoGrowHost({ data: initial }: { data: EntriesBlock }) {
  const [data, setData] = useState(initial)
  return (
    <div data-testid="width-probe" style={{ width: 420 }}>
      <EntriesView data={data} editable onChange={setData} />
    </div>
  )
}

export const NoClipping: Story = {
  args: { data: blankJournal },
  render: (args) => <AutoGrowHost data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const textarea = canvas.getByRole('textbox', { name: 'Entry text' }) as HTMLTextAreaElement

    await userEvent.type(textarea, LONG_ENTRY, { delay: null })
    await expect(textarea).toHaveValue(LONG_ENTRY)
    await expect(textarea.scrollHeight).toBe(textarea.clientHeight)

    const probe = canvasElement.querySelector<HTMLElement>('[data-testid="width-probe"]')!
    probe.style.width = '220px'
    await expect(textarea.scrollHeight).toBe(textarea.clientHeight)
  },
}
