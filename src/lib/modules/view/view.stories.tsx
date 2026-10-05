import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test'

import { CollectionView } from './view'
import { PondBlock } from '@/components/organisms/PondBlock'
import type { CollectionRow } from './apply'
import type { ViewBlock } from './schema'
import type { PropertySchema, PropertyValue } from '@/lib/properties/schema'

/**
 * The `view` module (#19) — an inline view that draws a collection's rows as a
 * TABLE or a BOARD. Config-only block; rows are the collection page's children.
 * These stories render the presentational `CollectionView` with static schema/rows
 * (no Supabase), the same way the kanban/table stories render their views directly.
 */
const meta = {
  title: 'Modules/View',
  component: CollectionView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CollectionView>

export default meta
type Story = StoryObj<typeof meta>

// ── Fixture: a "Ceramics Studio Plan"-shaped collection ──────────────────────
const schema: PropertySchema = [
  {
    id: 'p-status',
    name: 'Status',
    type: 'status',
    options: [
      { id: 'o-todo', label: 'To do', color: 'zinc' },
      { id: 'o-doing', label: 'Doing', color: 'amber' },
      { id: 'o-done', label: 'Done', color: 'green' },
    ],
  },
  {
    id: 'p-stage',
    name: 'Stage',
    type: 'select',
    options: [
      { id: 's-throw', label: 'Throwing', color: 'sky' },
      { id: 's-glaze', label: 'Glazing', color: 'violet' },
    ],
  },
  { id: 'p-priority', name: 'Priority', type: 'number' },
  { id: 'p-due', name: 'Due', type: 'date' },
  { id: 'p-fired', name: 'Fired', type: 'checkbox' },
]

/** The schema minus its date property — a collection a calendar can't place. */
const noDateSchema: PropertySchema = schema.filter((d) => d.type !== 'date')

const rows: CollectionRow[] = [
  {
    id: 'r1',
    title: 'Trim the rim',
    values: {
      'p-status': 'o-doing',
      'p-stage': 's-throw',
      'p-priority': 2,
      'p-due': '2026-09-10',
      'p-fired': false,
    },
  },
  {
    id: 'r2',
    title: 'Celadon glaze test',
    values: {
      'p-status': 'o-done',
      'p-stage': 's-glaze',
      'p-priority': 1,
      'p-due': '2026-09-01',
      'p-fired': true,
    },
  },
  {
    id: 'r3',
    title: 'Wedge stoneware',
    values: {
      'p-status': 'o-todo',
      'p-stage': 's-throw',
      'p-priority': 3,
      'p-due': '2026-09-20',
      'p-fired': false,
    },
  },
  { id: 'r4', title: 'Kiln maintenance', values: {} },
]

const tableConfig: ViewBlock = { id: 'v-table', type: 'view', mode: 'table' }
const boardConfig: ViewBlock = { id: 'v-board', type: 'view', mode: 'board', groupBy: 'p-status' }
const calendarConfig: ViewBlock = { id: 'v-cal', type: 'view', mode: 'calendar' }
const galleryConfig: ViewBlock = { id: 'v-gallery', type: 'view', mode: 'gallery' }
const ganttConfig: ViewBlock = { id: 'v-gantt', type: 'view', mode: 'gantt' }

// ── Gantt fixture: a plan collection with Start + End date properties ──────────
const ganttSchema: PropertySchema = [
  { id: 'g-start', name: 'Start', type: 'date' },
  { id: 'g-end', name: 'End', type: 'date' },
  { id: 'g-name', name: 'Phase', type: 'text' },
]
const ganttRows: CollectionRow[] = [
  { id: 'gr1', title: 'Wedge & throw', values: { 'g-start': '2026-09-10', 'g-end': '2026-09-14' } },
  { id: 'gr2', title: 'Bisque fire', values: { 'g-start': '2026-09-02', 'g-end': '2026-09-08' } },
  { id: 'gr3', title: 'Glaze day', values: { 'g-start': '2026-09-20' } }, // no end → single-day tick
  { id: 'gr4', title: 'Someday idea', values: {} }, // no start → omitted from the timeline
]

/** A stateful host so editable stories exercise real optimistic round-trips. */
function StatefulView({
  config,
  initialRows,
  schema: hostSchema = schema,
}: {
  config: ViewBlock
  initialRows?: CollectionRow[]
  schema?: PropertySchema
}) {
  const [data, setData] = useState<CollectionRow[]>(initialRows ?? rows)
  const onEdit = (rowId: string, key: string, value: PropertyValue) =>
    setData((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [key]: value } } : r))
    )
  return <CollectionView config={config} schema={hostSchema} rows={data} editable onEdit={onEdit} />
}

// ── Table ─────────────────────────────────────────────────────────────────────

/** Read-only table: columns from the schema, status/select cells as colored chips. */
export const TableReadOnly: Story = {
  args: { config: tableConfig, schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Header columns (Name + each property).
    await expect(canvas.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
    await expect(canvas.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    // Row titles + resolved chip labels (ids → labels).
    await expect(canvas.getByText('Trim the rim')).toBeInTheDocument()
    await expect(canvas.getByText('Doing')).toBeInTheDocument()
    await expect(canvas.getByText('Celadon glaze test')).toBeInTheDocument()
    // Read-only: no inputs.
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument()
  },
}

/** Editable table: a status cell is a select; changing it updates that row only. */
export const TableEditCell: Story = {
  args: { config: tableConfig, schema, rows },
  render: (args) => <StatefulView config={args.config} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Each row exposes a "Status value" select; change r1 (Trim the rim) To do → Done.
    const statusSelects = canvas.getAllByLabelText('Status value')
    await expect(statusSelects[0]).toHaveValue('o-doing')
    await userEvent.selectOptions(statusSelects[0], 'o-done')
    await expect(statusSelects[0]).toHaveValue('o-done')
    // A text/number cell edit persists to the row.
    const priority = canvas.getAllByLabelText('Priority value')[2]
    await userEvent.clear(priority)
    await userEvent.type(priority, '9')
    await expect(priority).toHaveValue(9)
  },
}

/**
 * A legacy row that stored a status by LABEL ("Doing"), not the option id (a
 * pre-slice-1 / #18 row). The editable select must still resolve it to its option
 * via optionForValue rather than falling back to "—" (caught in live-verify).
 */
export const TableLegacyLabelValue: Story = {
  args: {
    config: tableConfig,
    schema,
    rows: [{ id: 'r-legacy', title: 'Legacy row', values: { 'p-status': 'Doing' } }],
  },
  render: (args) => (
    <StatefulView
      config={args.config}
      initialRows={[{ id: 'r-legacy', title: 'Legacy row', values: { 'p-status': 'Doing' } }]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The select resolves the stored label to the "Doing" option id, so it is the
    // selected value (not the empty "—").
    await expect(canvas.getByLabelText('Status value')).toHaveValue('o-doing')
  },
}

/**
 * Empty collection (schema, no rows): the view draws NO empty line of its own
 * (#239). On a page the frame owns it — this is the product composition: the
 * table-kind card in state `empty`, its box offering `add a row`, the view
 * suppressed underneath.
 */
export const TableEmpty: Story = {
  args: { config: tableConfig, schema, rows: [] },
  render: (args) => (
    <PondBlock kind="table" heading="table" headNote="0 rows" state="empty" onEmptyAction={fn()}>
      <CollectionView {...args} />
    </PondBlock>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('No rows yet')).not.toBeInTheDocument()
    await expect(canvas.getByText('no rows yet')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'add a row' })).toBeInTheDocument()
    await expect(canvas.queryByText('Name')).not.toBeInTheDocument()
  },
}

/** The bare view with no rows: headers only, no placeholder of its own. */
export const TableEmptyBare: Story = {
  args: { config: tableConfig, schema, rows: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Name')).toBeInTheDocument()
    await expect(canvas.queryByText('No rows yet')).not.toBeInTheDocument()
  },
}

// ── The view bar ───────────────────────────────────────────────────────────────

/**
 * `Pond 06.21 Tasks` 6u.1's head row (KAN-59):
 *
 *     tasks   grouped by status                 board │ timeline │ table │ calendar
 *
 * `list` is the fifth segment and arrives with the list mode (KAN-63).
 *
 * Values read inline from 6u.1:
 *
 *   head      flex · space-between · padding 4px 4px 0
 *   name      15px / 500
 *   facts     10.5px / 500 / ink .8 — read-only text, no record count, no select
 *   track     ink .055 · padding 3 · radius 999 · gap 4 · 10.5 / 500
 *   active    #1B1D14 ground · #FAF9EF text · 4px 10px · radius 999
 *   inactive  ink .68, same padding, no ground
 */
export const ViewBarGeometry: Story = {
  args: {
    config: boardConfig,
    schema,
    rows,
    collectionName: 'tasks',
    editable: true,
    onConfigChange: fn(),
  },
  play: async ({ canvasElement }) => {
    const head = canvasElement.querySelector<HTMLElement>('[data-part="view-head"]')!
    const hs = getComputedStyle(head)
    await expect(hs.justifyContent).toBe('space-between')
    await expect(pxOf(hs.paddingLeft)).toBeCloseTo(4, 1)

    const name = getComputedStyle(head.querySelector<HTMLElement>('[data-part="db-name"]')!)
    await expect(pxOf(name.fontSize)).toBeCloseTo(15, 1)

    const facts = head.querySelector<HTMLElement>('[data-part="db-facts"]')!
    await expect(pxOf(getComputedStyle(facts).fontSize)).toBeCloseTo(10.5, 1)
    // How this view reads the database — and nothing else: no record count.
    await expect(facts).toHaveTextContent(/^grouped by status$/)
    // …as text. There is no group-by select.
    await expect(within(head).queryByRole('combobox')).toBeNull()

    const bar = getComputedStyle(head.querySelector<HTMLElement>('[data-part="view-bar"]')!)
    await expect(pxOf(bar.columnGap)).toBeCloseTo(4, 1)
    await expect(pxOf(bar.padding)).toBeCloseTo(3, 1)
    // A pill TRACK, not a row of buttons — a tinted ground at .055.
    await expectTier(bar.backgroundColor, 'ink', 0.055)

    const active = canvasElement.querySelector<HTMLElement>(
      '[data-part="view-segment"][data-active]'
    )!
    const as = getComputedStyle(active)
    await expect(pxOf(as.paddingLeft)).toBeCloseTo(10, 1)
    await expect(pxOf(as.paddingTop)).toBeCloseTo(4, 1)
    // Inverted: full-ink ground, paper text.
    await expectTier(as.backgroundColor, 'ink', 1)
    await expectTier(as.color, 'paper', 1)
    // …and it is the mode the config names.
    await expect(active).toHaveTextContent(/^board$/)
  },
}

export const ViewBarGeometryInk: Story = {
  args: {
    config: boardConfig,
    schema,
    rows,
    collectionName: 'tasks',
    editable: true,
    onConfigChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className="dark bg-raw-ink p-mn-4">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const head = canvasElement.querySelector<HTMLElement>('[data-part="view-head"]')!
    // The track's tint and the active segment's inversion both reassign.
    await expectTier(
      getComputedStyle(head.querySelector<HTMLElement>('[data-part="view-bar"]')!).backgroundColor,
      'paper',
      0.055
    )
    const as = getComputedStyle(
      canvasElement.querySelector<HTMLElement>('[data-part="view-segment"][data-active]')!
    )
    await expectTier(as.backgroundColor, 'paper', 1)
    await expectTier(as.color, 'ink', 1)
  },
}

/** The switcher is the four modes that exist, lowercase, in the board's order. */
export const ViewBarSegments: Story = {
  args: {
    config: boardConfig,
    schema,
    rows,
    collectionName: 'tasks',
    editable: true,
    onConfigChange: fn(),
  },
  play: async ({ canvasElement }) => {
    const segments = [...canvasElement.querySelectorAll('[data-part="view-segment"]')]
    await expect(segments.map((el) => el.textContent)).toEqual([
      'board',
      'timeline',
      'table',
      'calendar',
    ])
  },
}

/** Timeline is the gantt mode: its segment writes `gantt`, and lights when the block is one. */
export const ViewBarTimelineIsGantt: Story = {
  args: {
    config: ganttConfig,
    schema: ganttSchema,
    rows: ganttRows,
    collectionName: 'plan',
    editable: true,
    onConfigChange: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'timeline' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await userEvent.click(canvas.getByRole('button', { name: 'board' }))
    await expect(args.onConfigChange).toHaveBeenCalledWith({ mode: 'board' })
  },
}

/** Gallery, chart and big number are their own blocks (ADR 0009): no switcher over them. */
export const ViewBarAbsentOnOwnBlocks: Story = {
  args: {
    config: galleryConfig,
    schema,
    rows,
    collectionName: 'tasks',
    editable: true,
    onConfigChange: fn(),
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-part="view-bar"]')).toBeNull()
    await expect(canvasElement.querySelector('[data-part="db-name"]')).toBeInTheDocument()
  },
}

/** The group-by clause belongs to the mode that has one — a table claims no grouping. */
export const ViewBarFactsPerMode: Story = {
  args: {
    config: { id: 'v', type: 'view', mode: 'table' } as ViewBlock,
    schema,
    rows,
    collectionName: 'tasks',
    editable: true,
    onConfigChange: fn(),
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-part="db-facts"]')).toBeNull()
  },
}

/** Off a page host there is no database name — the row simply omits it. */
export const ViewBarWithoutAName: Story = {
  args: { config: boardConfig, schema, rows, editable: true, onConfigChange: fn() },
  play: async ({ canvasElement }) => {
    const head = canvasElement.querySelector<HTMLElement>('[data-part="view-head"]')!
    await expect(head.querySelector('[data-part="db-name"]')).toBeNull()
    // The bar is still there — the views do not depend on the name.
    await expect(head.querySelector('[data-part="view-bar"]')).toBeInTheDocument()
  },
}

// ── Board ──────────────────────────────────────────────────────────────────────

/**
 * The board's geometry, from `Pond 06.21 Tasks` (KAN-31).
 *
 * The stories below this block assert TEXT. These assert the computed values, in
 * both themes — the board draws each lane as a faint recessed wash, and a lane
 * rendered as a raised card passes every text assertion while looking wrong.
 *
 *   lanes     grid · repeat(N,minmax(0,1fr)) · gap 10   (NOT a scrolling row)
 *   lane      flex column · gap 7 · padding 7 · radius 16 · ink .04 · min-h 380
 *   laneHead  3px 4px 2px · 10.5 · 500 · tracking .1em · uppercase · ink .68
 *   laneN     inherits the head (06.21's is a bare span)
 *   card      card paper · radius 12 · 10/11 · gap 7 · two-layer shadow
 *   title     13.5 / 1.35
 *   ＋        padding 4 · 11 · 500 · ink .68
 *
 * (`PondTemplate`'s `kanban`/`lane` set is the MINIATURE inside a template preview
 * card — lane min-height 90 against this 380. Same design, two scales.)
 */
const pxOf = (v: string) => parseFloat(v)

/**
 * Tailwind v4 computes an alpha variant (`bg-mn-text/[0.04]`) to **oklab**, not
 * rgba, so a string compare is useless here. These read the two things that
 * actually carry the meaning: how transparent it is, and whether the base is ink
 * or paper — which is the whole of what reassigns between themes.
 */
function alphaOf(color: string): number {
  if (/^rgb\(/.test(color) && !color.includes('/')) return 1
  if (color === 'rgba(0, 0, 0, 0)') return 0
  const m = color.match(/(?:\/|,)\s*([\d.]+%?)\s*\)\s*$/)
  if (!m) return NaN
  return m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1])
}
/** Perceptual lightness: oklab's first component, or luma from rgb. Ink ≈ .2, paper ≈ .98. */
function lightnessOf(color: string): number {
  const ok = color.match(/^oklab\(\s*([\d.]+)/)
  if (ok) return parseFloat(ok[1])
  const rgb = color.match(/(\d+),\s*(\d+),\s*(\d+)/)
  if (!rgb) return NaN
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(rgb[i], 10) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/**
 * PAINTED `box-shadow` layers, outermost first. Tailwind composes ring + shadow
 * through `0 0 #0000` placeholders, and `ring-0` leaves a zero-width coloured
 * ring — neither paints a pixel, so both are dropped and only what the board
 * draws remains. (Same filter as `PondControl.stories.tsx`.)
 */
function shadowLayers(boxShadow: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of boxShadow) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out.filter((l) => !/^rgba\(0, 0, 0, 0\) /.test(l) && !/ 0px 0px 0px 0px( inset)?$/.test(l))
}

/** `ink` is the dark base, `paper` the light one — whichever colour space says it. */
async function expectTier(color: string, base: 'ink' | 'paper', alpha: number) {
  await expect(alphaOf(color)).toBeCloseTo(alpha, 2)
  const l = lightnessOf(color)
  if (base === 'ink') await expect(l).toBeLessThan(0.5)
  else await expect(l).toBeGreaterThan(0.7)
}

async function assertBoardGeometry(root: HTMLElement, base: 'ink' | 'paper') {
  const lanes = root.querySelector<HTMLElement>('[data-part="lanes"]')!
  const ls = getComputedStyle(lanes)
  await expect(ls.display).toBe('grid')
  await expect(pxOf(ls.gap)).toBeCloseTo(10, 1)
  // Equal columns, one per lane — every track the same width.
  const tracks = ls.gridTemplateColumns.split(' ').map(pxOf)
  await expect(tracks.length).toBeGreaterThan(1)
  for (const t of tracks) await expect(t).toBeCloseTo(tracks[0], 0)

  const lane = root.querySelector<HTMLElement>('[data-part="lane"]')!
  const cs = getComputedStyle(lane)
  await expect(pxOf(cs.padding)).toBeCloseTo(7, 1)
  await expect(pxOf(cs.borderRadius)).toBeCloseTo(16, 1)
  await expect(pxOf(cs.minHeight)).toBeCloseTo(380, 1)
  await expect(pxOf(cs.rowGap)).toBeCloseTo(7, 1)
  // A WASH, not a card: a tinted ground and no shadow of its own.
  await expectTier(cs.backgroundColor, base, 0.04)
  await expect(cs.boxShadow).toBe('none')

  const head = getComputedStyle(root.querySelector<HTMLElement>('[data-part="lane-head"]')!)
  await expect(pxOf(head.fontSize)).toBeCloseTo(10.5, 1)
  await expect(head.textTransform).toBe('uppercase')
  await expectTier(head.color, base, 0.68)
  // .1em at 10.5px = 1.05px — not the 0.14em this shipped with.
  await expect(pxOf(head.letterSpacing)).toBeCloseTo(1.05, 1)

  // The count inherits the head: 06.21's is a bare `<span>3</span>`. It must NOT
  // be mono — that is `PondTemplate`'s `laneN`, which belongs to the miniature.
  const n = getComputedStyle(root.querySelector<HTMLElement>('[data-part="lane-n"]')!)
  await expect(n.fontFamily).toBe(head.fontFamily)
  await expect(n.letterSpacing).toBe(head.letterSpacing)
}

export const BoardGeometry: Story = {
  args: { config: boardConfig, schema, rows },
  play: async ({ canvasElement }) => {
    await assertBoardGeometry(canvasElement, 'ink')

    const card = getComputedStyle(canvasElement.querySelector<HTMLElement>('[data-part="card"]')!)
    await expect(pxOf(card.borderRadius)).toBeCloseTo(12, 1)
    await expect(pxOf(card.paddingTop)).toBeCloseTo(10, 1)
    await expect(pxOf(card.paddingLeft)).toBeCloseTo(11, 1)
    await expect(pxOf(card.rowGap)).toBeCloseTo(7, 1)
    // Two PAINTED layers — the board's own, which matches no shadow token.
    await expect(shadowLayers(card.boxShadow)).toHaveLength(2)
  },
}

export const BoardGeometryInk: Story = {
  args: { config: boardConfig, schema, rows },
  decorators: [
    (Story) => (
      <div className="dark bg-raw-ink p-mn-4">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    // Geometry is identical between themes; only the tiers reassign.
    await assertBoardGeometry(canvasElement, 'paper')

    // The CARD's shadow too. Asserting geometry alone is how a light-only
    // `rgba(40,34,24,…)` shadow shipped: invisible on the dark ground, and every
    // other raw shadow in the repo supplies its ink counterpart.
    const card = getComputedStyle(canvasElement.querySelector<HTMLElement>('[data-part="card"]')!)
    const layers = shadowLayers(card.boxShadow)
    await expect(layers).toHaveLength(2)
    for (const l of layers) await expect(lightnessOf(l)).toBeLessThan(0.25)
  },
}

/**
 * What the board does not draw is not there, on an editable board with every
 * handler wired: no lane name input, no lane arrows, no `＋ lane`, no card `⠿`
 * handle and no card `↗`. The card itself is what drags and what selects.
 */
export const BoardDrawsNoControlsTheBoardDoesNot: Story = {
  args: {
    config: boardConfig,
    schema,
    rows,
    editable: true,
    onAddRow: fn(async () => null),
    onRenameRow: fn(),
    onUpdateSchema: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByLabelText(/^Lane name/)).not.toBeInTheDocument()
    await expect(canvas.queryByLabelText(/^Move .* (left|right)$/)).not.toBeInTheDocument()
    await expect(canvas.queryByText('＋ lane')).not.toBeInTheDocument()
    await expect(canvas.queryByLabelText(/^Drag card/)).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /^Open card/ })).not.toBeInTheDocument()
    // The lane heads are plain text, not fields.
    for (const head of canvasElement.querySelectorAll('[data-part="lane-head"]')) {
      await expect(head.querySelector('input')).toBeNull()
    }
  },
}

/**
 * 06.21: "The last line of every lane is ＋ task." A line INSIDE the lane, after
 * the cards — not a button beside or below it. Pond's word for a row in a
 * database is `record`; the board says `task` because its records are tasks.
 */
export const BoardAddIsTheLastLineOfTheLane: Story = {
  args: { config: boardConfig, schema, rows, editable: true, onAddRow: fn(async () => null) },
  play: async ({ canvasElement }) => {
    const lane = canvasElement.querySelector<HTMLElement>('[data-part="lane"]')!
    const add = lane.querySelector<HTMLElement>('[data-part="lane-add"]')!
    await expect(add).toBeInTheDocument()
    // Last child of the lane, after every card.
    await expect(lane.lastElementChild).toBe(add)
    const cs = getComputedStyle(add)
    await expect(pxOf(cs.padding)).toBeCloseTo(4, 1)
    await expect(pxOf(cs.fontSize)).toBeCloseTo(11, 1)
    await expectTier(cs.color, 'ink', 0.68)
    await expect(add).toHaveTextContent('＋ task')
  },
}

/** Read-only board grouped by status: one column per option + a "No Status" bucket. */
export const BoardReadOnly: Story = {
  args: { config: boardConfig, schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('To do')).toBeInTheDocument()
    await expect(canvas.getByText('Doing')).toBeInTheDocument()
    await expect(canvas.getByText('Done')).toBeInTheDocument()
    // The unset row (Kiln maintenance) lands in the trailing "No Status" bucket.
    await expect(canvas.getByText('No Status')).toBeInTheDocument()
    await expect(canvas.getByText('Kiln maintenance')).toBeInTheDocument()
    // Read-only cards have no drag handle.
    await expect(canvas.queryByLabelText(/Drag card/)).not.toBeInTheDocument()
  },
}

/**
 * Drag a card between status columns (the F4 pointer mechanism, ported from kanban).
 * Grab "Trim the rim" (Doing) and drop it on the Done column — it re-buckets there.
 */
export const BoardDragBetweenColumns: Story = {
  args: { config: boardConfig, schema, rows },
  render: (args) => <StatefulView config={args.config} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const handle = canvas.getByText('Trim the rim').closest<HTMLElement>('[data-part="card"]')!
    const doneColumn = canvas.getByText('Done').closest('section') as HTMLElement

    const grip = handle.getBoundingClientRect()
    const to = doneColumn.getBoundingClientRect()
    const center = { x: to.x + to.width / 2, y: to.y + to.height / 2 }

    fireEvent.pointerDown(handle, { clientX: grip.x + 4, clientY: grip.y + 4 })
    fireEvent.pointerMove(doneColumn, { clientX: to.x + 8, clientY: to.y + 8 })
    fireEvent.pointerMove(doneColumn, { clientX: center.x, clientY: center.y })
    fireEvent.pointerUp(doneColumn, { clientX: center.x, clientY: center.y })

    // The Done column now holds Trim the rim alongside Celadon glaze test.
    const done = within(doneColumn)
    await expect(done.getByText('Trim the rim')).toBeInTheDocument()
    await expect(done.getByText('Celadon glaze test')).toBeInTheDocument()
  },
}

/** Board with no valid group-by: a calm hint rather than an empty frame. */
export const BoardNeedsGroupBy: Story = {
  args: {
    config: { id: 'v', type: 'view', mode: 'board' },
    schema: schema.filter((d) => d.type !== 'status' && d.type !== 'select'),
    rows,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('This board needs a group-by (select or status) property.')
    ).toBeInTheDocument()
  },
}

/**
 * With no group-by control (6u.1), a board that names none still draws lanes: the
 * first status property. A board that names a property which is gone does not.
 */
export const BoardInfersGroupBy: Story = {
  args: {
    config: { id: 'v', type: 'view', mode: 'board' },
    schema,
    rows,
    collectionName: 'tasks',
    editable: true,
    onConfigChange: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('grouped by status')).toBeInTheDocument()
    await expect(canvas.getByText('Doing').closest('section')).toBeInTheDocument()
  },
}

export const BoardNamingAMissingGroupByStaysBroken: Story = {
  args: { config: { id: 'v', type: 'view', mode: 'board', groupBy: 'gone' }, schema, rows },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('This board needs a group-by (select or status) property.')
    ).toBeInTheDocument()
  },
}

// ── Board card meta (6u.1) ─────────────────────────────────────────────────────

const localIso = (offsetDays: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const taskSchema: PropertySchema = [
  {
    id: 't-status',
    name: 'status',
    type: 'status',
    options: [
      { id: 't-todo', label: 'to do' },
      { id: 't-done', label: 'done' },
    ],
  },
  { id: 't-due', name: 'due', type: 'date' },
  { id: 't-repeat', name: 'repeats', type: 'text' },
]

const taskRows: CollectionRow[] = [
  {
    id: 'k1',
    title: 'chase the cabinet quote',
    values: { 't-status': 't-todo', 't-due': localIso(0), 't-repeat': 'every 4 days' },
  },
  {
    id: 'k2',
    title: 'choose oak veneer finish',
    values: { 't-status': 't-todo', 't-due': '2026-10-23' },
  },
  {
    id: 'k3',
    title: 'skip hire returned',
    values: { 't-status': 't-done', 't-due': '2026-10-15' },
  },
  { id: 'k4', title: 'order samples', values: { 't-status': 't-todo' } },
]

/**
 * 6u.1's card meta, in order: the due atom, then the repeat tag. Today is the one
 * burnt-orange mark (`#D96629`, ink text); every other date is plain `.8` ink. A
 * done card's title steps down to `.68`.
 */
export const BoardCardMeta: Story = {
  args: {
    config: { id: 'v', type: 'view', mode: 'board', groupBy: 't-status' },
    schema: taskSchema,
    rows: taskRows,
  },
  play: async ({ canvasElement }) => {
    const cardOf = (title: string) =>
      within(canvasElement).getByText(title).closest<HTMLElement>('[data-part="card"]')!

    const today =
      cardOf('chase the cabinet quote').querySelector<HTMLElement>('[data-part="due-today"]')!
    await expect(today).toHaveTextContent('today')
    const ts = getComputedStyle(today)
    await expect(ts.backgroundColor).toBe('rgb(217, 102, 41)')
    await expect(pxOf(ts.borderRadius)).toBeCloseTo(5, 1)
    await expect(pxOf(ts.paddingLeft)).toBeCloseTo(6, 1)
    await expect(pxOf(ts.paddingTop)).toBeCloseTo(1, 1)
    await expectTier(ts.color, 'ink', 1)

    const repeat = cardOf('chase the cabinet quote').querySelector<HTMLElement>(
      '[data-part="card-repeat"]'
    )!
    await expect(repeat).toHaveTextContent('every 4 days')
    await expect(repeat.querySelector('svg')).toHaveAttribute('stroke-width', '1.4')

    const plain = cardOf('choose oak veneer finish').querySelector<HTMLElement>(
      '[data-part="card-due"]'
    )!
    await expect(plain).toHaveTextContent('fri 23')
    await expect(plain.getAttribute('data-part')).not.toBe('due-today')
    await expect(getComputedStyle(plain).backgroundColor).toBe('rgba(0, 0, 0, 0)')

    // A card with no date draws no due atom, and no meta row at all.
    await expect(cardOf('order samples').querySelector('[data-part="card-meta"]')).toBeNull()

    // Only today paints orange.
    await expect(canvasElement.querySelectorAll('[data-part="due-today"]')).toHaveLength(1)

    const doneTitle = within(cardOf('skip hire returned')).getByText('skip hire returned')
    await expectTier(getComputedStyle(doneTitle).color, 'ink', 0.68)
    const openTitle = within(cardOf('choose oak veneer finish')).getByText(
      'choose oak veneer finish'
    )
    await expectTier(getComputedStyle(openTitle).color, 'ink', 1)
  },
}

/**
 * Burnt orange is the one dated thing per screen. With three cards due today only the
 * first in RENDER order (lane order, then card order) wears the pill — here the row
 * that comes first in the data sits in the later lane, so it is not the orange one.
 * The others read `today` as a plain date: 11px / 500 / ink .8.
 */
export const BoardOnlyTheFirstTodayIsOrange: Story = {
  args: {
    config: { id: 'v', type: 'view', mode: 'board', groupBy: 't-status' },
    schema: taskSchema,
    rows: [
      {
        id: 'd1',
        title: 'ship the invoice',
        values: { 't-status': 't-done', 't-due': localIso(0) },
      },
      {
        id: 'd2',
        title: 'call the joiner',
        values: { 't-status': 't-todo', 't-due': localIso(0) },
      },
      {
        id: 'd3',
        title: 'confirm the delivery',
        values: { 't-status': 't-todo', 't-due': localIso(0) },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const cardOf = (title: string) =>
      within(canvasElement).getByText(title).closest<HTMLElement>('[data-part="card"]')!

    await expect(canvasElement.querySelectorAll('[data-part="due-today"]')).toHaveLength(1)
    await expect(
      cardOf('call the joiner').querySelector('[data-part="due-today"]')
    ).toHaveTextContent('today')

    for (const title of ['confirm the delivery', 'ship the invoice']) {
      const card = cardOf(title)
      await expect(card.querySelector('[data-part="due-today"]')).toBeNull()
      const plain = card.querySelector<HTMLElement>('[data-part="card-due"]')!
      await expect(plain).toHaveTextContent('today')
      const cs = getComputedStyle(plain)
      await expect(cs.backgroundColor).toBe('rgba(0, 0, 0, 0)')
      await expect(pxOf(cs.fontSize)).toBeCloseTo(11, 1)
      await expect(cs.fontWeight).toBe('500')
      await expectTier(cs.color, 'ink', 0.8)
    }
  },
}

// ── Card selection + the record peek (6u.2) ────────────────────────────────────

const peekSchema: PropertySchema = [...taskSchema, { id: 't-notes', name: 'notes', type: 'text' }]

const peekRows: CollectionRow[] = [
  {
    id: 'k1',
    title: 'chase the cabinet quote',
    values: { 't-status': 't-todo', 't-due': '2026-10-23' },
  },
  {
    id: 'k2',
    title: 'choose oak veneer finish',
    values: { 't-status': 't-todo', 't-notes': 'sample 3' },
  },
  { id: 'k3', title: 'skip hire returned', values: { 't-status': 't-done' } },
]

const peekArgs = {
  config: { id: 'v', type: 'view', mode: 'board', groupBy: 't-status' } as ViewBlock,
  schema: peekSchema,
  rows: peekRows,
}

const cardByTitle = (root: HTMLElement, title: string) =>
  within(root).getByText(title).closest<HTMLElement>('[data-part="card"]')!

/**
 * 6u.2: a click selects the card — an ink .5 outline, 1.5px, offset 1 — and the record
 * opens beside the view at right 44 / top 150, 330 wide. Another card swaps the record;
 * the lanes stay live (no scrim); Esc and empty paper close it.
 */
export const BoardCardSelectsAndPeeks: Story = {
  args: peekArgs,
  play: async ({ canvasElement }) => {
    const peek = () => canvasElement.querySelector<HTMLElement>('[data-part="record-peek"]')
    await expect(peek()).toBeNull()

    const first = cardByTitle(canvasElement, 'chase the cabinet quote')
    await userEvent.click(first)
    await expect(first).toHaveAttribute('aria-current', 'true')
    const outline = getComputedStyle(first)
    // Chrome snaps outline widths to whole device pixels (1.5 → 1 at DPR 1), so the
    // computed value cannot prove the 1.5; the class is what writes it.
    await expect(first.className).toContain('outline-[1.5px]')
    await expect(pxOf(outline.outlineWidth)).toBeGreaterThanOrEqual(1)
    await expect(pxOf(outline.outlineOffset)).toBeCloseTo(1, 1)
    await expect(outline.outlineStyle).toBe('solid')
    await expect(lightnessOf(outline.outlineColor)).toBeLessThan(0.25)
    await expect(alphaOf(outline.outlineColor)).toBeCloseTo(0.5, 1)

    const p = peek()!
    const ps = getComputedStyle(p)
    await expect(ps.position).toBe('fixed')
    await expect(pxOf(ps.right)).toBeCloseTo(44, 1)
    await expect(pxOf(ps.top)).toBeCloseTo(150, 1)
    await expect(pxOf(ps.width)).toBeCloseTo(330, 1)
    await expect(pxOf(ps.borderTopLeftRadius)).toBeCloseTo(20, 1)
    await expect(ps.paddingTop).toBe('16px')
    await expect(ps.paddingLeft).toBe('12px')
    await expect(ps.paddingBottom).toBe('12px')
    await expect(pxOf(ps.rowGap)).toBeCloseTo(6, 1)
    await expect(shadowLayers(ps.boxShadow)).toHaveLength(2)

    const title = within(p).getByText('chase the cabinet quote')
    const ts = getComputedStyle(title)
    await expect(pxOf(ts.fontSize)).toBeCloseTo(16, 1)
    await expect(ts.fontWeight).toBe('500')
    // No scrim, no trap: another card is still a live click and swaps the record.
    const second = cardByTitle(canvasElement, 'choose oak veneer finish')
    await userEvent.click(second)
    await expect(first).not.toHaveAttribute('aria-current')
    await expect(second).toHaveAttribute('aria-current', 'true')
    await expect(within(peek()!).getByText('choose oak veneer finish')).toBeInTheDocument()
    await expect(canvasElement.querySelectorAll('[data-part="record-peek"]')).toHaveLength(1)

    await userEvent.keyboard('{Escape}')
    await expect(peek()).toBeNull()
    await expect(second).not.toHaveAttribute('aria-current')

    await userEvent.click(first)
    await expect(peek()).not.toBeNull()
    await userEvent.click(canvasElement.querySelector('[data-part="lanes"]')!)
    await expect(peek()).toBeNull()
  },
}

/**
 * The peek draws the schema's fields and only those: grid 92 / 1fr, gap 10, padding
 * 7 / 8, radius 8, 13.5px; labels 500 / 11 / ink .8; an empty value is a `—` at ink .68.
 */
export const RecordPeekFields: Story = {
  args: peekArgs,
  play: async ({ canvasElement }) => {
    await userEvent.click(cardByTitle(canvasElement, 'choose oak veneer finish'))
    const peek = canvasElement.querySelector<HTMLElement>('[data-part="record-peek"]')!
    const fields = [...peek.querySelectorAll<HTMLElement>('[data-part="peek-field"]')]
    await expect(fields.map((f) => f.firstElementChild!.textContent)).toEqual(
      peekSchema.map((d) => d.name)
    )

    const row = getComputedStyle(fields[0])
    await expect(row.gridTemplateColumns.startsWith('92px ')).toBe(true)
    await expect(pxOf(row.columnGap)).toBeCloseTo(10, 1)
    await expect(row.paddingTop).toBe('7px')
    await expect(row.paddingLeft).toBe('8px')
    await expect(pxOf(row.borderTopLeftRadius)).toBeCloseTo(8, 1)
    await expect(pxOf(row.fontSize)).toBeCloseTo(13.5, 1)

    const label = getComputedStyle(fields[0].firstElementChild!)
    await expect(pxOf(label.fontSize)).toBeCloseTo(11, 1)
    await expect(label.fontWeight).toBe('500')
    await expectTier(label.color, 'ink', 0.8)

    // due is empty on this record: a read-only dash at the .68 tier.
    const dueRow = fields.find((f) => f.firstElementChild!.textContent === 'due')!
    const dash = dueRow.lastElementChild as HTMLElement
    await expect(dash).toHaveTextContent('—')
    await expectTier(getComputedStyle(dash).color, 'ink', 0.68)
    await expect(within(peek).getByText('sample 3')).toBeInTheDocument()
  },
}

/** `open ›` is drawn only when the host can navigate, and asks for the row's page. */
export const RecordPeekOpensTheRowPage: Story = {
  args: { ...peekArgs, onOpenRow: fn() },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(cardByTitle(canvasElement, 'skip hire returned'))
    const open = within(canvasElement).getByRole('button', { name: 'open ›' })
    const os = getComputedStyle(open)
    await expect(pxOf(os.fontSize)).toBeCloseTo(11, 1)
    await expect(os.fontWeight).toBe('500')
    await expectTier(os.color, 'ink', 0.68)
    await userEvent.click(open)
    await expect(args.onOpenRow).toHaveBeenCalledWith('k3')
  },
}

export const RecordPeekWithoutHostHasNoOpen: Story = {
  args: peekArgs,
  play: async ({ canvasElement }) => {
    await userEvent.click(cardByTitle(canvasElement, 'skip hire returned'))
    await expect(
      within(canvasElement).queryByRole('button', { name: 'open ›' })
    ).not.toBeInTheDocument()
  },
}

/** An edit in the peek is the person's own edit: it lands on the record and on its card. */
export const RecordPeekEditsTheRecord: Story = {
  args: peekArgs,
  render: (args) => (
    <StatefulView config={args.config} initialRows={peekRows} schema={peekSchema} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(cardByTitle(canvasElement, 'choose oak veneer finish'))
    const peek = within(canvasElement.querySelector<HTMLElement>('[data-part="record-peek"]')!)
    await userEvent.selectOptions(peek.getByLabelText('status value'), 't-done')
    // The card moved to the done lane, and the peek's checkbox draws filled.
    const doneLane = canvas.getByText('done', { selector: 'header span' }).closest('section')!
    await expect(within(doneLane).getByText('choose oak veneer finish')).toBeInTheDocument()
  },
}

/**
 * A card is a keyboard stop: Enter or Space on the card selects it and moves focus into
 * the peek; Esc closes it and hands focus back to the card.
 */
export const BoardCardIsKeyboardReachable: Story = {
  args: peekArgs,
  play: async ({ canvasElement }) => {
    const card = cardByTitle(canvasElement, 'skip hire returned')
    await expect(card).toHaveAttribute('tabindex', '0')
    card.focus()
    await userEvent.keyboard('{Enter}')
    const peek = canvasElement.querySelector<HTMLElement>('[data-part="record-peek"]')!
    await expect(card).toHaveAttribute('aria-current', 'true')
    await expect(peek.contains(document.activeElement)).toBe(true)

    await userEvent.keyboard('{Escape}')
    await expect(canvasElement.querySelector('[data-part="record-peek"]')).toBeNull()
    await expect(document.activeElement).toBe(card)

    await userEvent.keyboard(' ')
    await expect(canvasElement.querySelector('[data-part="record-peek"]')).not.toBeNull()
  },
}

// ── Calendar (agenda) ───────────────────────────────────────────────────────────

/**
 * Read-only agenda: one lane per date (chronological) + a trailing "No date" lane
 * for the undated row. No date property is named, so it auto-picks the first (Due).
 */
export const CalendarReadOnly: Story = {
  args: { config: calendarConfig, schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The undated row lands in the trailing "No date" lane.
    const noDate = canvas.getByText('No date').closest('section') as HTMLElement
    await expect(within(noDate).getByText('Kiln maintenance')).toBeInTheDocument()
    // A dated row sits under its date header (Sep is locale-stable in the test env).
    await expect(canvas.getByText(/Sep 1\b/)).toBeInTheDocument()
    await expect(canvas.getByText('Celadon glaze test')).toBeInTheDocument()
    // Read-only: no drag handles, no inline date fields.
    await expect(canvas.queryByLabelText(/Drag card/)).not.toBeInTheDocument()
    await expect(canvas.queryByLabelText('Due value')).not.toBeInTheDocument()
  },
}

/**
 * Inline date reschedule: editing the undated row's date field moves it out of the
 * "No date" lane — the write any-date path (drag can only reach lanes that exist).
 */
export const CalendarEditDate: Story = {
  args: { config: calendarConfig, schema, rows },
  render: (args) => <StatefulView config={args.config} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const noDate = canvas.getByText('No date').closest('section') as HTMLElement
    // The undated lane's row carries an editable date field; set it to a real date.
    const dateField = within(noDate).getByLabelText('Due value')
    await fireEvent.change(dateField, { target: { value: '2026-09-05' } })
    // Kiln maintenance has left the "No date" lane (it now has a date).
    await expect(canvas.queryByText('No date')).not.toBeInTheDocument()
    await expect(canvas.getByText('Kiln maintenance')).toBeInTheDocument()
  },
}

/**
 * Drag a card between date lanes: grab "Trim the rim" (Sep 10) and drop it on the
 * Sep 1 lane (Celadon glaze test) — it re-buckets to that date via optimistic write.
 */
export const CalendarDragBetweenLanes: Story = {
  args: { config: calendarConfig, schema, rows },
  render: (args) => <StatefulView config={args.config} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const handle = canvas.getByLabelText('Drag card: Trim the rim')
    const target = canvas.getByText('Celadon glaze test').closest('section') as HTMLElement

    const grip = handle.getBoundingClientRect()
    const to = target.getBoundingClientRect()
    const center = { x: to.x + to.width / 2, y: to.y + to.height / 2 }

    fireEvent.pointerDown(handle, { clientX: grip.x + 4, clientY: grip.y + 4 })
    fireEvent.pointerMove(target, { clientX: to.x + 8, clientY: to.y + 8 })
    fireEvent.pointerMove(target, { clientX: center.x, clientY: center.y })
    fireEvent.pointerUp(target, { clientX: center.x, clientY: center.y })

    // The Sep 1 lane now holds both rows.
    const lane = within(canvas.getByText('Celadon glaze test').closest('section') as HTMLElement)
    await expect(lane.getByText('Trim the rim')).toBeInTheDocument()
    await expect(lane.getByText('Celadon glaze test')).toBeInTheDocument()
  },
}

/** A collection with no date property: a calm hint instead of an empty agenda. */
export const CalendarNeedsDate: Story = {
  args: { config: calendarConfig, schema: noDateSchema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('This calendar needs a date property.')).toBeInTheDocument()
  },
}

// ── Gallery ─────────────────────────────────────────────────────────────────────

/**
 * Read-only card grid: one card per row — a tile, the title and ONE meta line (the
 * first field with a value, until a card layout names it, #253). The board's
 * geometry is asserted in `view-mapped-modes.stories.tsx` (#260).
 */
export const GalleryReadOnly: Story = {
  args: { config: galleryConfig, schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Every row is a card; the meta resolves (status id → "Doing" label).
    await expect(canvas.getByText('Trim the rim')).toBeInTheDocument()
    await expect(canvas.getByText('Kiln maintenance')).toBeInTheDocument()
    await expect(canvas.getByText('Doing')).toBeInTheDocument()
    // Read-only: no editors, no drag handles.
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument()
    await expect(canvas.queryByLabelText(/Drag card/)).not.toBeInTheDocument()
  },
}

/** Empty collection in gallery mode under its frame (#239): `no records yet` · `add a record`. */
export const GalleryEmpty: Story = {
  args: { config: galleryConfig, schema, rows: [] },
  render: (args) => (
    <PondBlock
      kind="gallery"
      heading="gallery"
      headNote="0 records"
      state="empty"
      onEmptyAction={fn()}
    >
      <CollectionView {...args} />
    </PondBlock>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('No rows yet')).not.toBeInTheDocument()
    await expect(canvas.getByText('no records yet')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'add a record' })).toBeInTheDocument()
  },
}

// ── Gantt (read-only timeline) ────────────────────────────────────────────────

/**
 * Read-only gantt: one bar per dated row over a single adaptive timeline, ordered by
 * start ascending. The end-less row (Glaze day) is a single-day tick; the start-less
 * row (Someday idea) is omitted. Date properties auto-infer (1st=Start, 2nd=End).
 * The board's geometry is asserted in `view-mapped-modes.stories.tsx` (#260).
 */
export const GanttReadOnly: Story = {
  args: { config: ganttConfig, schema: ganttSchema, rows: ganttRows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Bars carry an aria-label "<title>: <span>"; the start-less row has none.
    const bars = canvas.getAllByRole('img')
    const labels = bars.map((b) => b.getAttribute('aria-label'))
    // Ordered by start: Bisque (Sep 2) before Wedge (Sep 10) before Glaze (Sep 20).
    expect(labels).toEqual([
      'Bisque fire: 2026-09-02 – 2026-09-08',
      'Wedge & throw: 2026-09-10 – 2026-09-14',
      'Glaze day: 2026-09-20', // single-day tick (no end)
    ])
    // The start-less row is omitted from the timeline entirely.
    await expect(canvas.queryByText('Someday idea')).not.toBeInTheDocument()
  },
}

/**
 * Editable gantt: bars become draggable reschedule affordances. Every drawn bar gets a
 * body (move) button; real spans additionally get left (start) + right (end) edge
 * handles, while a single-day tick (Glaze day) gets the right edge only — move + extend,
 * never a shrink. The actual pixel drag is proven by live /verify (jsdom has no layout,
 * so the px→day math is a no-op here); this story guards the affordance shape.
 */
export const GanttReschedule: Story = {
  args: { config: ganttConfig, schema: ganttSchema, rows: ganttRows },
  render: (args) => (
    <StatefulView config={args.config} schema={args.schema ?? undefined} initialRows={args.rows} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Every drawn bar exposes a move (reschedule) button; the start-less row stays omitted.
    expect(canvas.getByRole('button', { name: /Reschedule Wedge & throw/ })).toBeInTheDocument()
    expect(canvas.getByRole('button', { name: /Reschedule Bisque fire/ })).toBeInTheDocument()
    expect(canvas.getByRole('button', { name: /Reschedule Glaze day/ })).toBeInTheDocument()
    await expect(canvas.queryByText('Someday idea')).not.toBeInTheDocument()

    // Real spans resize from both edges; the single-day tick offers the end edge only.
    expect(canvas.getByRole('button', { name: 'Move start of Wedge & throw' })).toBeInTheDocument()
    expect(canvas.getByRole('button', { name: 'Move end of Wedge & throw' })).toBeInTheDocument()
    expect(
      canvas.queryByRole('button', { name: 'Move start of Glaze day' })
    ).not.toBeInTheDocument()
    expect(canvas.getByRole('button', { name: 'Move end of Glaze day' })).toBeInTheDocument()

    // Editable bars are interactive buttons, not the read-only img treatment.
    expect(canvas.queryAllByRole('img')).toHaveLength(0)
  },
}

/** A collection with no date property: a calm hint instead of an empty timeline. */
export const GanttNeedsDate: Story = {
  args: { config: ganttConfig, schema: noDateSchema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('This gantt needs a date property.')).toBeInTheDocument()
  },
}

// ── Non-drawing states ──────────────────────────────────────────────────────────

/** No schema (page isn't a collection): a graceful placeholder, no bare list. */
export const NoSchema: Story = {
  args: { config: tableConfig, schema: null, rows: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('This view needs a collection with properties.')
    ).toBeInTheDocument()
  },
}

// ── Chart + big-number modes (#111) ───────────────────────────────────────────
// The same fixture collection, drawn as a chart and as one oversized figure. These
// hold NO data of their own: every number below is aggregated from `rows` at render
// time, which is the whole point of #111 — edit a record in the table story and this
// figure would move with it.

/** Chart mode: the records bucketed by Stage, priorities summed within each bucket. */
export const ChartByStage: Story = {
  args: {
    config: {
      id: 'v-chart',
      type: 'view',
      mode: 'chart',
      chart: {
        kind: 'bar',
        xProperty: 'p-stage',
        series: [{ property: 'p-priority', agg: 'sum' }],
      },
    },
    schema,
    rows,
    chartProvenance: { source: 'pots' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The card's `reads` row names the PROPERTIES the chart reads (#227) — it is a
    // view of the database, so the source comes first, then the x field, then the series.
    await expect(canvas.getByText('pots · Stage, Priority')).toBeInTheDocument()
  },
}

/** Chart mode, line kind, one point per record (no x property named). */
export const ChartPerRecord: Story = {
  args: {
    config: {
      id: 'v-chart-line',
      type: 'view',
      mode: 'chart',
      chart: { kind: 'line', series: [{ property: 'p-priority', agg: 'latest' }] },
    },
    schema,
    rows,
    chartProvenance: { source: 'pots' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Bucketed by record title, no x field is read: `reads` names the source and the series alone.
    await expect(canvas.getByText('pots · Priority')).toBeInTheDocument()
  },
}

/**
 * Every #94 kind draws (see `view-chart-kinds.stories.tsx`); a kind whose data
 * prerequisite is missing reads as a calm notice that says what to change — here a
 * radar over a Stage field with only two options.
 */
export const ChartRadarNeedsThreeCategories: Story = {
  args: {
    config: {
      id: 'v-chart-radar',
      type: 'view',
      mode: 'chart',
      chart: {
        kind: 'radar',
        xProperty: 'p-stage',
        series: [{ property: 'p-priority', agg: 'sum' }],
      },
    },
    schema,
    // Two staged records → two spokes; an untagged record would add a "No value" third.
    rows: rows.slice(0, 2),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/A radar needs at least three categories/)).toBeInTheDocument()
  },
}

/**
 * Big-number mode — what a data page LEADS with (PROJECT_RULES: "data pages lead with
 * one oversized figure, not a chart"). The figure is read through its aria-label, the
 * stable plain string, because NumberFlow visually splits the digits.
 */
export const BigNumberSum: Story = {
  args: {
    config: {
      id: 'v-figure',
      type: 'view',
      mode: 'big-number',
      bigNumber: { property: 'p-priority', agg: 'sum' },
    },
    schema,
    rows,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // 2 + 1 + 3 = 6 (the fourth record carries no priority and simply doesn't count).
    await expect(canvas.getByRole('status', { name: 'Priority: 6' })).toBeInTheDocument()
    // #260: the record count rides the board's one mono sub line, after the figure's name.
    await expect(canvas.getByText('Priority · over 4 records')).toBeInTheDocument()
  },
}

/** Big-number mode counting RECORDS — no property needed. */
export const BigNumberCount: Story = {
  args: {
    config: { id: 'v-count', type: 'view', mode: 'big-number', bigNumber: { agg: 'count' } },
    schema,
    rows,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status', { name: 'Records: 4' })).toBeInTheDocument()
  },
}

/** Nothing to read: an em dash, never a lying zero. */
export const BigNumberNoValues: Story = {
  args: {
    config: {
      id: 'v-empty-figure',
      type: 'view',
      mode: 'big-number',
      bigNumber: { property: 'p-priority', agg: 'avg', format: 'currency' },
    },
    schema,
    rows: [{ id: 'r-blank', title: 'Kiln maintenance', values: {} }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status', { name: 'Priority (avg): —' })).toBeInTheDocument()
    await expect(canvas.getByText('Priority (avg) · over 1 record')).toBeInTheDocument()
  },
}

/**
 * Switching modes keeps the SAME database: only the view config changes, so the
 * records are still there when you switch back. Chart, gallery and big number are
 * their own blocks (ADR 0009) and are not offered here.
 */
export const SwitchBetweenViews: Story = {
  args: { config: tableConfig, schema, rows },
  render: function Render(args) {
    const [config, setConfig] = useState<ViewBlock>(args.config)
    return (
      <CollectionView
        config={config}
        schema={schema}
        rows={rows}
        editable
        onConfigChange={(patch) => setConfig((prev) => ({ ...prev, ...patch }))}
      />
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const gone of ['Chart', 'chart', 'Big number', 'big number', 'Gallery', 'gallery']) {
      await expect(canvas.queryByRole('button', { name: gone })).not.toBeInTheDocument()
    }
    await expect(canvas.getByText('Trim the rim')).toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'board' }))
    await expect(canvas.getByText('Doing').closest('section')).toBeInTheDocument()
    await expect(canvas.getByText('Trim the rim')).toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'table' }))
    await expect(canvas.getByText('Trim the rim')).toBeInTheDocument()
    await expect(canvas.getByText('Celadon glaze test')).toBeInTheDocument()
  },
}

/** Filter + sort applied: only non-done rows, by priority ascending. */
export const FilteredAndSorted: Story = {
  args: {
    config: {
      id: 'v',
      type: 'view',
      mode: 'table',
      filter: { property: 'p-status', op: 'neq', value: 'o-done' },
      sort: { key: 'p-priority', dir: 'asc' },
    },
    schema,
    rows,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // "Celadon glaze test" is Done → filtered out.
    await expect(canvas.queryByText('Celadon glaze test')).not.toBeInTheDocument()
    await expect(canvas.getByText('Trim the rim')).toBeInTheDocument()
    await expect(canvas.getByText('Wedge stoneware')).toBeInTheDocument()
  },
}
