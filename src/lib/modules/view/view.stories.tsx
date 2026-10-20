import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test'
import { page, userEvent as realUserEvent } from 'vitest/browser'

import { CollectionView } from './view'
import { CollectionList } from './list'
import { BOARD_EMPTY_LINE, CALENDAR_EMPTY_LINE } from './kinds'
import { localDateIso } from './due'
import { formatAtomDate } from '@/lib/properties/date-input'
import { PondBlock } from '@/components/organisms/PondBlock'
import { PageCanvas } from '@/lib/modules/page-canvas'
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
    // Each row exposes a "Status value" tag trigger; change r1 (Trim the rim) To do → Done.
    const statusTriggers = canvas.getAllByRole('button', { name: 'Status value' })
    await expect(within(statusTriggers[0]).getByText('Doing')).toBeInTheDocument()
    await userEvent.click(statusTriggers[0])
    // The popover portals to document.body, outside canvasElement.
    await userEvent.click(await within(document.body).findByRole('option', { name: 'Done' }))
    await expect(within(statusTriggers[0]).getByText('Done')).toBeInTheDocument()
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
    // The chip resolves the stored label to the "Doing" option, so it reads
    // "Doing" (not the empty "—").
    const statusTrigger = canvas.getByRole('button', { name: 'Status value' })
    await expect(within(statusTrigger).getByText('Doing')).toBeInTheDocument()
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

// ── The head row ───────────────────────────────────────────────────────────────

/**
 * `Pond 06.21 Tasks` 6u.1's head row (KAN-59): the database's name and how the view
 * reads it. An editable head carries the layout chip named with the current layout
 * (KAN-519). The bar over a block's saved views is KAN-32's.
 *
 * Values read inline from 6u.1:
 *
 *   head      flex · space-between · padding 4px 4px 0
 *   name      15px / 500
 *   facts     10.5px / 500 / ink .8 — read-only text, no record count, no select
 */
export const ViewHeadGeometry: Story = {
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
    // The layout chip is the button named with the current layout (KAN-519).
    await expect(within(head).getByRole('button', { name: 'board' })).toBeInTheDocument()
  },
}

/** An editable gantt head carries the layout chip named timeline (KAN-519). */
export const ViewHeadSwitchesNoKind: Story = {
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
    await expect(canvasElement.querySelector('[data-part="db-name"]')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'timeline' })).toBeInTheDocument()
    await expect(args.onConfigChange).not.toHaveBeenCalled()
  },
}

/**
 * The layout chip is named with the current layout, and the body behind it is
 * that layout (KAN-524). Gallery is one of list, timeline, gallery, and chart.
 * Opening the chip lists those four by their kind labels. The gallery stays
 * the body while the menu is open.
 */
export const LayoutChipOffersListTimelineGalleryAndChart: Story = {
  args: {
    config: galleryConfig,
    schema,
    rows,
    editable: true,
    onConfigChange: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'gallery' })).toBeInTheDocument()
    const gallery = canvasElement.querySelector('[data-part="gallery"]')
    await expect(gallery).toHaveTextContent('Trim the rim')

    await userEvent.click(canvas.getByRole('button', { name: 'gallery' }))
    const menu = await within(document.body).findByRole('menu', { name: 'layout' })
    const items = within(menu)
    await expect(items.getByRole('menuitem', { name: 'list' })).toBeInTheDocument()
    await expect(items.getByRole('menuitem', { name: 'timeline' })).toBeInTheDocument()
    await expect(items.getByRole('menuitem', { name: 'gallery' })).toBeInTheDocument()
    await expect(items.getByRole('menuitem', { name: 'chart' })).toBeInTheDocument()
    await expect(canvasElement.querySelector('[data-part="gallery"]')).toHaveTextContent(
      'Trim the rim'
    )
  },
}

/** The group-by clause belongs to the mode that has one — a table claims no grouping. */
export const ViewHeadFactsPerMode: Story = {
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
export const ViewHeadWithoutAName: Story = {
  args: { config: boardConfig, schema, rows, editable: true, onConfigChange: fn() },
  play: async ({ canvasElement }) => {
    const head = canvasElement.querySelector<HTMLElement>('[data-part="view-head"]')!
    await expect(head.querySelector('[data-part="db-name"]')).toBeNull()
    // The facts still read — they do not depend on the name.
    await expect(head.querySelector('[data-part="db-facts"]')).toHaveTextContent('grouped by status')
  },
}

// ── The saved-view bar (KAN-242) ─────────────────────────────────────────────

const savedViewsConfig: ViewBlock = {
  id: 'v-saved-views',
  type: 'view',
  mode: 'board',
  groupBy: 'p-status',
  label: 'tasks',
  views: [
    { id: 'view-board', label: 'board', kind: 'board', config: { groupBy: 'p-status' } },
    { id: 'view-timeline', label: 'timeline', kind: 'gantt', config: {} },
  ],
  activeViewId: 'view-board',
}

/**
 * KAN-36's ruling (done-when): a non-editable block still shows its name, record
 * count and both saved-view segments — identification always renders. "＋ view"
 * is an editing affordance (Views 3/4 wires it), so a reader never sees it.
 */
async function assertSavedViewsReadOnly(canvasElement: HTMLElement, base: 'ink' | 'paper') {
  const canvas = within(canvasElement)
  await expect(canvas.getByText('tasks')).toBeInTheDocument()
  await expect(canvas.getByText(/4 records/)).toBeInTheDocument()
  const boardTab = canvas.getByRole('tab', { name: 'board' })
  await expect(boardTab).toBeInTheDocument()
  await expect(canvas.getByRole('tab', { name: 'timeline' })).toBeInTheDocument()
  await expect(canvas.queryByText('＋ view')).not.toBeInTheDocument()
  // The active segment is a solid chip: fill resolves to the base tier, text to its opposite.
  await expectTier(getComputedStyle(boardTab).backgroundColor, base, 1)
  await expectTier(getComputedStyle(boardTab).color, base === 'ink' ? 'paper' : 'ink', 1)
}

export const ViewBarReadOnlyState: Story = {
  args: { config: savedViewsConfig, schema, rows, collectionName: 'tasks' },
  play: async ({ canvasElement }) => assertSavedViewsReadOnly(canvasElement, 'ink'),
}

export const ViewBarReadOnlyStateInk: Story = {
  args: { config: savedViewsConfig, schema, rows, collectionName: 'tasks' },
  decorators: [
    (Story) => (
      <div className="dark bg-raw-ink p-mn-4">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => assertSavedViewsReadOnly(canvasElement, 'paper'),
}

/**
 * PATH_STEPS 2–4, light theme: the real tasks block, not `ViewBar` alone.
 * Clicking "timeline" moves the active chip and swaps the block's body — the
 * bar's own node (`Tabs.Root`, holding the pill + "＋ view") never moves on a
 * switch (KAN-321's engine) — and arrow keys then move focus and selection
 * together.
 */
export const ViewBarSwitchesView: Story = {
  args: { config: savedViewsConfig, schema, rows, collectionName: 'tasks', editable: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const boardTab = canvas.getByRole('tab', { name: 'board' })
    const timelineTab = canvas.getByRole('tab', { name: 'timeline' })
    const tablist = boardTab.closest('[role="tablist"]') as HTMLElement
    const bar = tablist.parentElement as HTMLElement

    // The pill's own line-height is 'normal' so segments inherit it — not the
    // house --leading-normal (1.5), which would make the pill 29px tall
    // instead of the board's 26.5px (PondCalendar.dc.html:143).
    await expect(getComputedStyle(tablist).lineHeight).toBe('normal')
    await expect(Math.round(tablist.getBoundingClientRect().height)).not.toBe(29)

    await expect(boardTab).toHaveAttribute('aria-selected', 'true')
    await expect(boardTab.className).toContain('bg-mn-text')
    await expect(canvasElement.querySelector('[data-part="lanes"]')).toBeInTheDocument()

    const before = bar.getBoundingClientRect()
    await userEvent.click(timelineTab)
    const after = bar.getBoundingClientRect()

    await expect(timelineTab).toHaveAttribute('aria-selected', 'true')
    await expect(timelineTab.className).toContain('bg-mn-text')
    await expect(boardTab).toHaveAttribute('aria-selected', 'false')
    await expect(boardTab.className).not.toContain('bg-mn-text')
    // The body swapped: the board's lane grid is gone, the gantt's rows are up.
    await expect(canvasElement.querySelector('[data-part="lanes"]')).not.toBeInTheDocument()
    await expect(canvasElement.querySelector('[data-part="gantt-row"]')).toBeInTheDocument()
    // The bar node itself did not move.
    await expect(after.top).toBe(before.top)
    await expect(after.left).toBe(before.left)
    await expect(after.width).toBe(before.width)
    await expect(after.height).toBe(before.height)

    // Arrow keys move focus and selection together — click left focus on "timeline".
    await userEvent.keyboard('{ArrowLeft}')
    await expect(boardTab).toHaveFocus()
    await expect(boardTab).toHaveAttribute('aria-selected', 'true')
    await expect(timelineTab).toHaveAttribute('aria-selected', 'false')

    await userEvent.keyboard('{ArrowRight}')
    await expect(timelineTab).toHaveFocus()
    await expect(timelineTab).toHaveAttribute('aria-selected', 'true')
    await expect(boardTab).toHaveAttribute('aria-selected', 'false')
  },
}

/**
 * PATH_STEPS 5: the same path, under the `.dark` decorator `ViewBarReadOnlyStateInk`
 * uses — the container tint, active chip, and inactive label colours must match
 * PondCalendar's on-ink variant (the board's `a(ink ? .08 : .055)` and `fg`/`INK` swap).
 */
export const ViewBarSwitchesViewInk: Story = {
  args: { config: savedViewsConfig, schema, rows, collectionName: 'tasks', editable: true },
  decorators: [
    (Story) => (
      <div className="dark bg-raw-ink p-mn-4">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const boardTab = canvas.getByRole('tab', { name: 'board' })
    const timelineTab = canvas.getByRole('tab', { name: 'timeline' })
    const row = boardTab.closest('[role="tablist"]') as HTMLElement

    // Container: paper tint at .08 — the dark-theme value, not light's .055.
    await expectTier(getComputedStyle(row).backgroundColor, 'paper', 0.08)
    // Active chip: solid paper fill, ink text.
    await expectTier(getComputedStyle(boardTab).backgroundColor, 'paper', 1)
    await expectTier(getComputedStyle(boardTab).color, 'ink', 1)
    // Inactive label: paper .68, no fill.
    await expect(alphaOf(getComputedStyle(timelineTab).backgroundColor)).toBe(0)
    await expectTier(getComputedStyle(timelineTab).color, 'paper', 0.68)

    await userEvent.click(timelineTab)

    // The chip follows the click: now timeline is the solid paper-on-ink chip.
    await expectTier(getComputedStyle(timelineTab).backgroundColor, 'paper', 1)
    await expectTier(getComputedStyle(timelineTab).color, 'ink', 1)
    await expect(alphaOf(getComputedStyle(boardTab).backgroundColor)).toBe(0)
    await expectTier(getComputedStyle(boardTab).color, 'paper', 0.68)
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
    await expect(canvas.getByText(BOARD_EMPTY_LINE)).toBeInTheDocument()
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

/**
 * `groupBy` is shared by board, calendar and list. After a switch from a calendar it
 * names a date property (or one since deleted); the board falls back to the default
 * lanes rather than a dead end.
 */
export const BoardWithAStaleGroupByFallsBackToLanes: Story = {
  args: {
    config: { id: 'v', type: 'view', mode: 'board', groupBy: 'p-due' },
    schema,
    rows,
    editable: true,
    onConfigChange: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('grouped by status')).toBeInTheDocument()
    await expect(canvasElement.querySelectorAll('[data-part="lane"]').length).toBeGreaterThan(0)
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

const listRowOf = (root: HTMLElement, title: string) =>
  [...root.querySelectorAll<HTMLElement>('[data-part="list-row"]')].find(
    (row) => row.querySelector('[data-row-focus]')?.textContent === title
  )!

const cardByTitle = (root: HTMLElement, title: string) =>
  within(root).getByText(title).closest<HTMLElement>('[data-part="card"]')!

/** A page's canvas: the one element views draw their peek against. */
const onPageCanvas: NonNullable<Story['decorators']> = [
  (Story) => (
    <PageCanvas className="h-[720px] w-[1000px] overflow-y-auto">
      <Story />
    </PageCanvas>
  ),
]

/**
 * 6u.2: a click selects the card — an ink .5 outline, 1.5px, offset 1 — and the record
 * opens beside the view at right 44 / top 150, 330 wide. Another card swaps the record;
 * the lanes stay live (no scrim); Esc and empty paper close it.
 */
export const BoardCardSelectsAndPeeks: Story = {
  args: peekArgs,
  decorators: onPageCanvas,
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
    // Against the canvas, not the window: a block's overflow cannot clip it.
    await expect(ps.position).toBe('absolute')
    await expect(p.parentElement).toBe(canvasElement.querySelector('[data-part="page-canvas"]'))
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
    await userEvent.click(peek.getByRole('button', { name: 'status value' }))
    // The popover portals to document.body, outside canvasElement.
    await userEvent.click(await within(document.body).findByRole('option', { name: 'done' }))
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

// ── List (6v) ──────────────────────────────────────────────────────────────────

/** A fixed Wednesday, so the buckets read the same on any day the suite runs. */
const LIST_TODAY = new Date(2026, 9, 21)

const listSchema: PropertySchema = [
  {
    id: 'l-status',
    name: 'status',
    type: 'status',
    options: [
      { id: 'l-todo', label: 'to do' },
      { id: 'l-done', label: 'done' },
    ],
  },
  { id: 'l-due', name: 'due', type: 'date' },
  { id: 'l-repeat', name: 'repeats', type: 'text' },
]

const listRows: CollectionRow[] = [
  { id: 'l1', title: 'cabinet quote', values: { 'l-status': 'l-todo', 'l-due': '2026-10-21' } },
  {
    id: 'l2',
    title: 'chase the cabinet quote',
    values: { 'l-status': 'l-todo', 'l-due': '2026-10-23', 'l-repeat': 'every 4 days' },
  },
  {
    id: 'l3',
    title: 'confirm alcove at 84cm',
    values: { 'l-status': 'l-todo', 'l-due': '2026-10-22' },
  },
  { id: 'l4', title: 'order the worktop', values: { 'l-status': 'l-todo', 'l-due': '2026-10-27' } },
  {
    id: 'l5',
    title: 'check the dehumidifier',
    values: { 'l-status': 'l-done', 'l-due': '2026-10-19', 'l-repeat': 'every mon' },
  },
  {
    id: 'l6',
    title: 'skip hire returned',
    values: { 'l-status': 'l-done', 'l-due': '2026-10-13' },
  },
]

const listArgs = {
  config: { id: 'v', type: 'view', mode: 'list' } as ViewBlock,
  schema: listSchema,
  rows: listRows,
}

const renderList = (props: Partial<ComponentProps<typeof CollectionList>> = {}) => (
  <CollectionList viewKey="v" schema={listSchema} rows={listRows} today={LIST_TODAY} {...props} />
)

async function assertListGeometry(root: HTMLElement, base: 'ink' | 'paper') {
  const card = getComputedStyle(root.querySelector<HTMLElement>('[data-part="list-card"]')!)
  await expect(pxOf(card.borderTopLeftRadius)).toBeCloseTo(20, 1)
  await expect(card.paddingTop).toBe('16px')
  await expect(card.paddingLeft).toBe('18px')
  await expect(pxOf(card.rowGap)).toBeCloseTo(20, 1)
  await expect(shadowLayers(card.boxShadow)).toHaveLength(2)

  const label = getComputedStyle(root.querySelector<HTMLElement>('[data-part="list-group-label"]')!)
  await expect(pxOf(label.fontSize)).toBeCloseTo(10.5, 1)
  await expect(label.fontWeight).toBe('500')
  await expect(pxOf(label.letterSpacing)).toBeCloseTo(1.05, 1)
  await expect(label.textTransform).toBe('uppercase')
  await expect(pxOf(label.paddingBottom)).toBeCloseTo(4, 1)
  await expectTier(label.color, base, 0.68)

  const row = getComputedStyle(root.querySelector<HTMLElement>('[data-part="list-row"]')!)
  await expect(pxOf(row.columnGap)).toBeCloseTo(11, 1)
  await expect(pxOf(row.fontSize)).toBeCloseTo(14, 1)
  await expect(row.paddingTop).toBe('8px')
  await expect(row.paddingLeft).toBe('6px')
  await expect(row.marginLeft).toBe('-6px')
  await expect(pxOf(row.borderTopLeftRadius)).toBeCloseTo(8, 1)
  await expect(pxOf(row.borderBottomWidth)).toBeCloseTo(1, 1)
  await expect(alphaOf(row.borderBottomColor)).toBeCloseTo(0.055, 2)

  const box = root.querySelector<HTMLElement>('[data-part="list-row"] [role="checkbox"]')!
  const bs = getComputedStyle(box)
  await expect(pxOf(bs.width)).toBeCloseTo(15, 1)
  await expect(pxOf(bs.height)).toBeCloseTo(15, 1)
  await expect(pxOf(bs.borderTopLeftRadius)).toBeCloseTo(4, 1)

  const due = getComputedStyle(root.querySelector<HTMLElement>('[data-part="list-due"]')!)
  await expect(pxOf(due.minWidth)).toBeCloseTo(64, 1)
  await expect(due.textAlign).toBe('right')
  await expect(pxOf(due.fontSize)).toBeCloseTo(11, 1)
  await expect(due.fontWeight).toBe('500')
  await expectTier(due.color, base, 0.8)

  // A done row steps down to .68 and fills its box with the ink.
  const doneRow = root.querySelector<HTMLElement>('[data-part="list-row"][data-done]')!
  await expectTier(getComputedStyle(doneRow).color, base, 0.68)
  const doneBox = getComputedStyle(doneRow.querySelector<HTMLElement>('[role="checkbox"]')!)
  await expectTier(doneBox.backgroundColor, base, 1)
  await expect(doneRow.querySelector('[role="checkbox"] svg')).not.toBeNull()
}

/** 6v: one card, groups in the board's order — today, this week, next week, done. */
export const ListMatchesTheBoard: Story = {
  args: listArgs,
  render: () => renderList(),
  play: async ({ canvasElement }) => {
    const groups = [...canvasElement.querySelectorAll<HTMLElement>('[data-part="list-group"]')]
    await expect(groups.map((g) => g.dataset.group)).toEqual([
      'today',
      'this week',
      'next week',
      'done',
    ])
    await expect(
      [...groups[1].querySelectorAll('[data-part="list-row"]')].map(
        (r) => r.querySelector('[data-row-focus]')?.textContent
      )
    ).toEqual(['confirm alcove at 84cm', 'chase the cabinet quote'])
    await expect(canvasElement.querySelectorAll('[data-part="list-card"]')).toHaveLength(1)
    // A single card: the list is not wrapped in a block frame, and has no eyebrow.
    await expect(canvasElement.querySelector('[data-part="list-eyebrow"]')).toBeNull()
    await assertListGeometry(canvasElement, 'ink')

    const repeat = canvasElement.querySelector<HTMLElement>('[data-part="list-repeat"]')!
    await expect(repeat).toHaveTextContent('every 4 days')
    await expect(repeat.querySelector('svg')).toHaveAttribute('stroke-width', '1.4')
    await expectTier(getComputedStyle(repeat).color, 'ink', 0.8)
  },
}

export const ListMatchesTheBoardInk: Story = {
  args: listArgs,
  render: () => renderList(),
  decorators: [
    (Story) => (
      <div className="dark bg-raw-ink p-mn-4">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await assertListGeometry(canvasElement, 'paper')
    const card = getComputedStyle(
      canvasElement.querySelector<HTMLElement>('[data-part="list-card"]')!
    )
    for (const l of shadowLayers(card.boxShadow)) await expect(lightnessOf(l)).toBeLessThan(0.25)
  },
}

/** One orange `today` per screen: only the first open record due today wears it. */
export const ListOnlyTheFirstTodayIsOrange: Story = {
  args: listArgs,
  render: () =>
    renderList({
      rows: [
        {
          id: 'a',
          title: 'ship the invoice',
          values: { 'l-status': 'l-done', 'l-due': '2026-10-21' },
        },
        {
          id: 'b',
          title: 'call the joiner',
          values: { 'l-status': 'l-todo', 'l-due': '2026-10-21' },
        },
        {
          id: 'c',
          title: 'confirm the delivery',
          values: { 'l-status': 'l-todo', 'l-due': '2026-10-21' },
        },
      ],
    }),
  play: async ({ canvasElement }) => {
    const rowOf = (title: string) => listRowOf(canvasElement, title)
    await expect(canvasElement.querySelectorAll('[data-part="due-today"]')).toHaveLength(1)
    const pill = rowOf('call the joiner').querySelector<HTMLElement>('[data-part="due-today"]')!
    await expect(getComputedStyle(pill).backgroundColor).toBe('rgb(217, 102, 41)')
    for (const title of ['confirm the delivery', 'ship the invoice']) {
      const due = rowOf(title).querySelector<HTMLElement>('[data-part="list-due"]')!
      await expect(due).toHaveTextContent('today')
      await expect(due.querySelector('[data-part="due-today"]')).toBeNull()
    }
  },
}

/** The tick is the person's own edit: it writes the `done` status, and unticks to the first open one. */
export const ListTickWritesStatus: Story = {
  args: { ...listArgs, onEdit: fn() },
  render: (args) => renderList({ editable: true, onEdit: args.onEdit }),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('checkbox', { name: 'chase the cabinet quote done' }))
    await expect(args.onEdit).toHaveBeenLastCalledWith('l2', 'l-status', 'l-done')
    await userEvent.click(canvas.getByRole('checkbox', { name: 'skip hire returned done' }))
    await expect(args.onEdit).toHaveBeenLastCalledWith('l6', 'l-status', 'l-todo')
    // The tick is its own control: it did not select the row.
    await expect(canvasElement.querySelector('[data-part="record-peek"]')).toBeNull()
  },
}

/** A read-only list ticks nothing — the boxes are drawn, inert. */
export const ListReadOnlyBoxesAreInert: Story = {
  args: { ...listArgs, onEdit: fn() },
  render: (args) => renderList({ onEdit: args.onEdit }),
  play: async ({ canvasElement, args }) => {
    const box = within(canvasElement).getByRole('checkbox', {
      name: 'chase the cabinet quote done',
    })
    await expect(box).toBeDisabled()
    await userEvent.click(box)
    await expect(args.onEdit).not.toHaveBeenCalled()
  },
}

/**
 * The row's title is its tab stop; click or Enter selects the record and opens the peek.
 * The row itself is not focusable, and focus returns to the title when the peek closes.
 */
export const ListRowSelectsAndPeeks: Story = {
  args: listArgs,
  decorators: onPageCanvas,
  render: () => renderList({ editable: true, onEdit: fn() }),
  play: async ({ canvasElement }) => {
    const rowOf = (title: string) => listRowOf(canvasElement, title)
    const titleOf = (title: string) => within(rowOf(title)).getByRole('button', { name: title })
    const peek = () => canvasElement.querySelector<HTMLElement>('[data-part="record-peek"]')

    const first = rowOf('chase the cabinet quote')
    await expect(first).not.toHaveAttribute('tabindex')
    await expect(first.querySelectorAll('[tabindex]')).toHaveLength(0)
    await userEvent.click(titleOf('chase the cabinet quote'))
    await expect(titleOf('chase the cabinet quote')).toHaveAttribute('aria-current', 'true')
    await expect(within(peek()!).getByText('chase the cabinet quote')).toBeInTheDocument()
    await expect(peek()!.parentElement).toBe(
      canvasElement.querySelector('[data-part="page-canvas"]')
    )
    const outline = getComputedStyle(first)
    await expect(outline.outlineStyle).toBe('solid')
    await expect(alphaOf(outline.outlineColor)).toBeCloseTo(0.5, 1)

    await userEvent.click(titleOf('order the worktop'))
    await expect(canvasElement.querySelectorAll('[data-part="record-peek"]')).toHaveLength(1)
    await expect(titleOf('chase the cabinet quote')).not.toHaveAttribute('aria-current')

    await userEvent.keyboard('{Escape}')
    await expect(peek()).toBeNull()

    titleOf('skip hire returned').focus()
    await userEvent.keyboard('{Enter}')
    await expect(peek()!.contains(document.activeElement)).toBe(true)
    await userEvent.keyboard('{Escape}')
    await expect(document.activeElement).toBe(titleOf('skip hire returned'))
  },
}

/**
 * A board and a list on one page, both holding records due today: the page shows one
 * orange pill (the board's, first in the document) and one peek, whichever view the
 * record was chosen in.
 */
export const PageHoldsOneOrangeAndOnePeek: Story = {
  args: listArgs,
  decorators: onPageCanvas,
  render: () => (
    <>
      <CollectionView
        config={{ id: 'page-board', type: 'view', mode: 'board', groupBy: 't-status' }}
        schema={taskSchema}
        rows={[
          {
            id: 'b1',
            title: 'board record',
            values: { 't-status': 't-todo', 't-due': localIso(0) },
          },
        ]}
        collectionName="tasks"
        editable
        onConfigChange={fn()}
      />
      <CollectionView
        config={{ id: 'page-list', type: 'view', mode: 'list' }}
        schema={taskSchema}
        rows={[
          {
            id: 'l1',
            title: 'list record',
            values: { 't-status': 't-todo', 't-due': localIso(0) },
          },
        ]}
        collectionName="tasks"
        editable
        onConfigChange={fn()}
      />
    </>
  ),
  play: async ({ canvasElement }) => {
    const pills = canvasElement.querySelectorAll('[data-part="due-today"]')
    await expect(pills).toHaveLength(1)
    await expect(canvasElement.querySelector('[data-part="lanes"]')!.contains(pills[0])).toBe(true)
    await expectTier(getComputedStyle(pills[0]).color, 'ink', 1)

    await userEvent.click(cardByTitle(canvasElement, 'board record'))
    await expect(canvasElement.querySelectorAll('[data-part="record-peek"]')).toHaveLength(1)
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'list record' }))
    const peeks = canvasElement.querySelectorAll('[data-part="record-peek"]')
    await expect(peeks).toHaveLength(1)
    await expect(peeks[0]).toHaveTextContent('list record')
  },
}

/**
 * 6v's head: the database's name and `grouped by due`, drawn above the card, not
 * inside it. An editable head carries the layout chip named list (KAN-519).
 */
export const ListHead: Story = {
  args: { ...listArgs, collectionName: 'tasks', editable: true, onConfigChange: fn() },
  play: async ({ canvasElement }) => {
    const head = canvasElement.querySelector<HTMLElement>('[data-part="view-head"]')!
    await expect(head).toHaveTextContent('tasks')
    await expect(head).toHaveTextContent('grouped by due')
    await expect(within(head).getByRole('button', { name: 'list' })).toBeInTheDocument()
    await expect(canvasElement.querySelector('[data-part="list-card"]')!.contains(head)).toBe(false)
  },
}

/** A collection with no date property has nothing to group by, and says so. */
export const ListNeedsADate: Story = {
  args: { ...listArgs, schema: listSchema.filter((d) => d.type !== 'date') },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        'nothing in this view has a date. records show here once they have one.'
      )
    ).toBeInTheDocument()
  },
}

const statusGroupRows: CollectionRow[] = [
  { id: 'cabinet', title: 'cabinet quote', values: { 'l-status': 'l-todo' } },
  { id: 'skip', title: 'skip hire returned', values: { 'l-status': 'l-done' } },
  { id: 'samples', title: 'order samples', values: {} },
]

/**
 * A list grouped by status, and the same rows flat when grouping is none
 * (KAN-524). `listSchema`'s field is already named `status`, so the unset
 * bucket reads `No status`. Each group has a heading and a count. A record
 * with no value for that field sits in the unset group. The second view sets
 * `listFlat` and omits `groupBy`, so those rows draw with no group headings.
 */
export const ListGroupedByStatusAndFlatWhenNone: Story = {
  args: {
    config: { id: 'v-list-status', type: 'view', mode: 'list', groupBy: 'l-status' },
    schema: listSchema,
    rows: statusGroupRows,
  },
  render: (args) => (
    <>
      <CollectionView {...args} />
      <CollectionView
        config={{ id: 'v-list-flat', type: 'view', mode: 'list', listFlat: true }}
        schema={args.schema}
        rows={args.rows}
      />
    </>
  ),
  play: async ({ canvasElement }) => {
    const groups = [...canvasElement.querySelectorAll<HTMLElement>('[data-part="list-group"]')]
    const headingOf = (group: HTMLElement) => {
      const heading = group.querySelector('[data-part="list-group-label"]')
      const label = heading?.querySelector('span')
      return (label ?? heading)?.textContent ?? ''
    }
    for (const group of groups) {
      await expect(group.querySelector('[data-part="list-group-label"]')).not.toBeNull()
      await expect(group.querySelector('[data-part="list-group-count"]')).not.toBeNull()
    }
    await expect(groups.map(headingOf)).toEqual(['to do', 'done', 'No status'])
    const unset = groups.find((group) => headingOf(group) === 'No status')!
    const unsetTitle = within(unset).getByRole('button', { name: 'order samples' })
    await userEvent.click(unsetTitle)
    await expect(within(unset).getByRole('button', { name: 'order samples' })).toBeInTheDocument()

    const flat = [...canvasElement.querySelectorAll<HTMLElement>('[data-part="list-card"]')].find(
      (card) => card.querySelector('[data-part="list-group"]') === null
    )
    await expect(flat).toBeTruthy()
    const flatView = within(flat!)
    for (const name of ['cabinet quote', 'skip hire returned', 'order samples']) {
      await expect(flatView.getByRole('button', { name })).toBeInTheDocument()
    }
    await expect(flat!.querySelector('[data-part="list-group"]')).toBeNull()
    await expect(flat!.querySelector('[data-part="list-group-label"]')).toBeNull()
  },
}

// ── Calendar (month span, #262 1/3) ──────────────────────────────────────────────

/** The month span's chrome over a dated collection: period label, prev/next, today. */
export const CalendarMonthChrome: Story = {
  args: { config: calendarConfig, schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Previous month')).toBeInTheDocument()
    await expect(canvas.getByLabelText('Next month')).toBeInTheDocument()
    await expect(canvas.getByText('today')).toBeInTheDocument()
  },
}

/** A collection with no date property at all: the DC's `emptyLine` inside the card,
 *  chrome and the (empty) grid still drawn — `isMonthD`/`isMonthM` don't depend on `isEmpty`. */
export const CalendarNeedsDate: Story = {
  args: { config: calendarConfig, schema: noDateSchema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(CALENDAR_EMPTY_LINE)).toBeInTheDocument()
    await expect(canvas.getByLabelText('Previous month')).toBeInTheDocument()
    await expect(canvas.getByLabelText('Next month')).toBeInTheDocument()
    await expect(canvas.getByText('today')).toBeInTheDocument()
  },
}

/**
 * KAN-385, live verifier round 3: 5 of 7 REAL calendar drags left a native text
 * selection over the day cells (one opened `BlockCanvas`'s formatting toolbar).
 * `fireEvent`'s synthetic pointer sequence (used by every other drag test in this
 * file/suite) never anchors a selection the way Chromium's own mousedown does —
 * only a REAL mouse catches this, so this story drives one with `vitest/browser`'s
 * own `userEvent` (real Playwright input), never `storybook/test`'s synthetic one.
 *
 * Dates are relative to the real system clock (no mocking in browser mode): day 5
 * and day 15 of the current month exist in every month, and the grid's initial
 * `focusIso` is always the current month, so both are always on screen.
 */
const dragMonthPrefix = localDateIso(new Date()).slice(0, 8)
const dragSourceIso = `${dragMonthPrefix}05`
const dragTargetIso = `${dragMonthPrefix}15`
const dragRows: CollectionRow[] = [
  { id: 'r-drag', title: 'Glaze firing', values: { 'p-due': dragSourceIso } },
]

export const CalendarDragLeavesNoNativeSelection: Story = {
  name: 'a real mouse drag moves the date and leaves no native selection',
  args: { config: calendarConfig, schema, rows: dragRows, editable: true, onMoveDate: fn() },
  // The month grid is `hidden md:flex` — a desktop viewport, not just a wide
  // container, is what unhides it (same pattern as `GlyphPicker.stories.tsx`'s
  // `OnScreenBelowAnchor`).
  loaders: [
    async () => {
      const prevViewport = { width: window.innerWidth, height: window.innerHeight }
      await page.viewport(1440, 900)
      return { prevViewport }
    },
  ],
  play: async ({ canvasElement, args, loaded }) => {
    try {
      const card = canvasElement.querySelector<HTMLElement>('[data-row-id="r-drag"]')
      const target = canvasElement.querySelector<HTMLElement>(`[data-iso="${dragTargetIso}"]`)
      if (!card || !target) {
        throw new Error('calendar drag story: source card or target day cell not found')
      }
      await realUserEvent.dragAndDrop(card, target)

      const selection = window.getSelection()
      await expect(selection === null || selection.isCollapsed).toBe(true)
      await expect(selection?.toString() ?? '').toBe('')
      await expect(args.onMoveDate).toHaveBeenCalledWith('r-drag', 'p-due', dragTargetIso)
    } finally {
      const { width, height } = loaded.prevViewport as { width: number; height: number }
      await page.viewport(width, height)
    }
  },
}

/**
 * KAN-453. Hovering a day of the current month shows the plus, and clicking it
 * opens the new record's peek with the title focused and that day already set.
 *
 * `StatefulView` does not implement `onAddRow`, so this harness appends the
 * minted row with the date values the calendar passed. The month grid is
 * `hidden md:flex`, and `storybook/test` hover does not apply `:hover` — the
 * same real-input constraint as `CalendarDragLeavesNoNativeSelection`. The day
 * is `localDateIso(new Date())`, so it stays on the current month without a
 * clock mock. The date reads `formatAtomDate` (`en-US`, UTC noon).
 */
const hoverAddIso = localDateIso(new Date())

function CalendarHoverAddHarness({
  config,
  hostSchema,
}: {
  config: ViewBlock
  hostSchema: PropertySchema
}) {
  const [data, setData] = useState<CollectionRow[]>([])
  const handleAddRow = async (values?: Record<string, PropertyValue>) => {
    const id = 'r-new'
    setData((prev) => [...prev, { id, title: '', values: values ?? {} }])
    return id
  }
  // The peek draws a title input only when a rename handler is present.
  const handleRenameRow = (rowId: string, title: string) => {
    setData((prev) => prev.map((row) => (row.id === rowId ? { ...row, title } : row)))
  }
  return (
    <CollectionView
      config={config}
      schema={hostSchema}
      rows={data}
      editable
      onAddRow={handleAddRow}
      onRenameRow={handleRenameRow}
    />
  )
}

export const CalendarHoverAdd: Story = {
  args: { config: calendarConfig, schema, rows: [] },
  render: (args) => (
    <CalendarHoverAddHarness config={args.config} hostSchema={args.schema ?? schema} />
  ),
  loaders: [
    async () => {
      const prevViewport = { width: window.innerWidth, height: window.innerHeight }
      await page.viewport(1440, 900)
      return { prevViewport }
    },
  ],
  play: async ({ canvasElement, loaded }) => {
    try {
      const cell = canvasElement.querySelector<HTMLElement>(`[data-iso="${hoverAddIso}"]`)
      if (!cell) throw new Error('calendar hover-add story: day cell not found')
      const plus = within(cell).getByRole('button', { name: /^Add on / })
      await realUserEvent.hover(cell)
      await expect(getComputedStyle(plus).opacity).toBe('1')
      await realUserEvent.click(plus)

      const body = within(document.body)
      const peek = await body.findByRole('complementary', { name: 'Record: Untitled' })
      await expect(peek).toBeInTheDocument()
      const title = await body.findByRole('textbox', { name: 'Record title' })
      await expect(title).toHaveFocus()
      await expect(body.getByRole('button', { name: 'Due value' })).toHaveTextContent(
        formatAtomDate(hoverAddIso)
      )
    } finally {
      const { width, height } = loaded.prevViewport as { width: number; height: number }
      await page.viewport(width, height)
    }
  },
}

/**
 * KAN-454. The quiet line `n without a date` opens the undated records.
 * Picking one arms placement (`pick a day for <title>`). Clicking a day of
 * the current month writes that date through `onMoveDate`, the record sits
 * on the day, and the line count drops.
 *
 * The month grid is `hidden md:flex`, so this story sets a desktop viewport
 * the same way `CalendarHoverAdd` does. The day is the 21st of the current
 * month, which every month contains, and the grid opens on the current month.
 */
const placeDayIso = `${localDateIso(new Date()).slice(0, 8)}21`

const undatedCalendarRows: CollectionRow[] = [
  { id: 'r-dentist', title: 'dentist', values: {} },
  { id: 'r-optician', title: 'optician', values: {} },
]

function CalendarWithoutADateHarness({
  config,
  hostSchema,
}: {
  config: ViewBlock
  hostSchema: PropertySchema
}) {
  const [data, setData] = useState<CollectionRow[]>(undatedCalendarRows)
  const handleMoveDate = (rowId: string, key: string, value: PropertyValue) => {
    setData((prev) =>
      prev.map((row) =>
        row.id === rowId ? { ...row, values: { ...row.values, [key]: value } } : row
      )
    )
  }
  return (
    <CollectionView
      config={config}
      schema={hostSchema}
      rows={data}
      editable
      onMoveDate={handleMoveDate}
    />
  )
}

export const CalendarWithoutADate: Story = {
  args: { config: calendarConfig, schema, rows: undatedCalendarRows, editable: true },
  render: (args) => (
    <CalendarWithoutADateHarness config={args.config} hostSchema={args.schema ?? schema} />
  ),
  loaders: [
    async () => {
      const prevViewport = { width: window.innerWidth, height: window.innerHeight }
      await page.viewport(1440, 900)
      return { prevViewport }
    },
  ],
  play: async ({ canvasElement, loaded }) => {
    try {
      const canvas = within(canvasElement)
      await expect(canvas.getByRole('button', { name: '2 without a date' })).toBeInTheDocument()
      await userEvent.click(canvas.getByRole('button', { name: '2 without a date' }))

      const list = await canvas.findByRole('listbox', { name: 'without a date' })
      await expect(within(list).getByRole('option', { name: 'dentist' })).toBeInTheDocument()
      await expect(within(list).getByRole('option', { name: 'optician' })).toBeInTheDocument()
      await userEvent.click(within(list).getByRole('option', { name: 'dentist' }))

      await expect(canvas.queryByRole('listbox', { name: 'without a date' })).not.toBeInTheDocument()
      await expect(canvas.getByRole('button', { name: 'pick a day for dentist' })).toBeInTheDocument()

      const cell = canvasElement.querySelector<HTMLElement>(`[data-iso="${placeDayIso}"]`)
      if (!cell) throw new Error('calendar without-a-date story: day cell not found')
      await expect(cell).toHaveClass('hover:bg-mn-hover-fill')
      await userEvent.click(cell)

      await expect(within(cell).getByText('dentist')).toBeInTheDocument()
      await expect(within(cell).queryByText('optician')).not.toBeInTheDocument()
      await expect(canvas.getByRole('button', { name: '1 without a date' })).toBeInTheDocument()
      await expect(
        canvas.queryByRole('button', { name: 'pick a day for dentist' })
      ).not.toBeInTheDocument()
    } finally {
      const { width, height } = loaded.prevViewport as { width: number; height: number }
      await page.viewport(width, height)
    }
  },
}

/**
 * KAN-455. A blank click on the 21st — the day number, not the dentist row —
 * opens that day. Previous day steps back one. Month returns the month label.
 *
 * The month grid is `hidden md:flex`, so the loader sets a 1440×900 viewport
 * before render. It also fixes `new Date()` at local noon on 19 Oct 2026, so
 * the grid opens on October and the 21st is on screen.
 */
const blankDayRows: CollectionRow[] = [
  { id: 'dentist', title: 'dentist', values: { 'p-due': '2026-10-21' } },
]

/** `new Date()` and `Date.now()` stay at local noon on 19 Oct 2026. Dated
 *  constructions (`new Date(y, m, d)`, an ISO string) keep the real clock. */
function fixClockAtLocalNoonOn19Oct2026(): () => void {
  const RealDate = globalThis.Date
  const fixed = new RealDate(2026, 9, 19, 12, 0, 0).getTime()

  class FixedDate extends RealDate {
    // `ConstructorParameters<typeof Date>` is a 1-tuple, so `length === 0`
    // does not typecheck. `unknown[]` is the zero-arg `new Date()` this freezes.
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(fixed)
      } else {
        super(...(args as unknown as [number]))
      }
    }

    static override now(): number {
      return fixed
    }
  }

  globalThis.Date = FixedDate as DateConstructor
  return () => {
    globalThis.Date = RealDate
  }
}

export const CalendarBlankDay: Story = {
  name: 'blank day opens that day',
  args: { config: calendarConfig, schema, rows: blankDayRows },
  loaders: [
    async () => {
      const prevViewport = { width: window.innerWidth, height: window.innerHeight }
      await page.viewport(1440, 900)
      const restoreClock = fixClockAtLocalNoonOn19Oct2026()
      return { prevViewport, restoreClock }
    },
  ],
  play: async ({ canvasElement, loaded }) => {
    try {
      const canvas = within(canvasElement)
      const cell = canvasElement.querySelector<HTMLElement>(
        '[data-part="calendar-day-cell"][data-iso="2026-10-21"]'
      )
      if (!cell) throw new Error('calendar blank-day story: day cell 2026-10-21 not found')
      await userEvent.click(within(cell).getByText('21'))

      // The day body is drawn twice (desktop and mobile). The visible one is
      // the desktop copy; the phone copy is `md:hidden` at this viewport.
      const desktopDay = canvasElement.querySelector<HTMLElement>(
        '[data-part="calendar-day-body"][data-size="desktop"]'
      )
      if (!desktopDay) throw new Error('calendar blank-day story: desktop day body missing')
      await expect(within(desktopDay).getByText('dentist')).toBeVisible()
      await expect(canvas.getByText('wed 21 oct 2026')).toBeInTheDocument()

      await userEvent.click(canvas.getByRole('button', { name: 'Previous day' }))
      await expect(canvas.getByText('tue 20 oct 2026')).toBeInTheDocument()

      await userEvent.click(canvas.getByRole('radio', { name: 'month' }))
      await expect(canvas.getByText('october 2026')).toBeInTheDocument()
    } finally {
      const restoreClock = loaded.restoreClock as (() => void) | undefined
      restoreClock?.()
      const { width, height } = loaded.prevViewport as { width: number; height: number }
      await page.viewport(width, height)
    }
  },
}

/**
 * KAN-525. On a phone the day span draws a week strip. The loader is a
 * 390×844 viewport (under `md`) and the clock is local noon on 19 Oct 2026,
 * so the month opens on October and the open day is Monday the 19th.
 * 22 October 2026 is a Thursday (`thu 22`).
 */
const stripRows: CollectionRow[] = [
  { id: 'r-19', title: 'dentist', values: { 'p-due': '2026-10-19' } },
  { id: 'r-22', title: 'optician', values: { 'p-due': '2026-10-22' } },
]

export const CalendarDayStrip: Story = {
  name: 'CalendarDayStrip',
  args: { config: calendarConfig, schema, rows: stripRows },
  loaders: [
    async () => {
      const prevViewport = { width: window.innerWidth, height: window.innerHeight }
      await page.viewport(390, 844)
      const restoreClock = fixClockAtLocalNoonOn19Oct2026()
      return { prevViewport, restoreClock }
    },
  ],
  play: async ({ canvasElement, loaded }) => {
    try {
      const canvas = within(canvasElement)
      const mobileToday = canvas.getByRole('button', { name: '19 oct' })
      await expect(mobileToday).toBeVisible()
      const desktopCell = canvasElement.querySelector('[data-part="calendar-day-cell"]')
      await expect(desktopCell).not.toBeVisible()

      await userEvent.click(canvas.getByRole('radio', { name: 'day' }))

      const strip = canvasElement.querySelector<HTMLElement>('[data-part="calendar-week-strip"]')
      if (!strip) throw new Error('calendar day-strip story: week strip missing')
      await expect(strip).toBeVisible()
      const monday = within(strip).getByRole('button', { name: 'mon 19' })
      await expect(monday).toBeVisible()
      await expect(monday).toHaveAttribute('aria-current', 'date')

      await userEvent.click(within(strip).getByRole('button', { name: 'thu 22' }))

      await expect(canvas.getByText('thu 22 oct 2026')).toBeVisible()
      const mobileDay = canvasElement.querySelector<HTMLElement>(
        '[data-part="calendar-day-body"][data-size="mobile"]'
      )
      if (!mobileDay) throw new Error('calendar day-strip story: mobile day body missing')
      await expect(mobileDay).toBeVisible()
      await expect(within(mobileDay).getByText('optician')).toBeVisible()
      await expect(within(mobileDay).queryByText('dentist')).not.toBeInTheDocument()

      const focused = within(strip).getByRole('button', { name: 'thu 22' })
      await expect(focused).toHaveAttribute('aria-current', 'date')

      const dow = focused.querySelector<HTMLElement>(':scope > span')
      if (!dow) throw new Error('calendar day-strip story: dow missing')
      await expect(dow.textContent).toBe('t')
      const dowStyle = getComputedStyle(dow)
      await expect(pxOf(dowStyle.fontSize)).toBeCloseTo(10.5, 1)
      await expect(dowStyle.textTransform).toBe('uppercase')
      // `tracking-[.1em]` at 10.5px. The used value is pixels.
      const tracking = dowStyle.letterSpacing
      if (tracking.endsWith('em')) {
        await expect(parseFloat(tracking)).toBeCloseTo(0.1, 2)
      } else {
        await expect(pxOf(tracking)).toBeCloseTo(1.05, 2)
      }
      await expect(dowStyle.color).toBe('rgba(27, 29, 20, 0.68)')

      const chip = within(focused).getByText('22')
      const chipStyle = getComputedStyle(chip)
      await expect(pxOf(chipStyle.width)).toBeCloseTo(28, 0)
      await expect(pxOf(chipStyle.height)).toBeCloseTo(28, 0)
      await expect(pxOf(chipStyle.fontSize)).toBeCloseTo(14, 0)

      const todayChip = monday.querySelector<HTMLElement>('[data-part="due-today"]')
      if (!todayChip) throw new Error('calendar day-strip story: today chip missing')
      const todayStyle = getComputedStyle(todayChip)
      await expect(pxOf(todayStyle.width)).toBeCloseTo(28, 0)
      await expect(pxOf(todayStyle.height)).toBeCloseTo(28, 0)
      await expect(pxOf(todayStyle.fontSize)).toBeCloseTo(14, 0)

      const dot = focused.querySelector<HTMLElement>(':scope > span.size-1')
      if (!dot) throw new Error('calendar day-strip story: dot missing')
      const dotStyle = getComputedStyle(dot)
      await expect(pxOf(dotStyle.width)).toBeCloseTo(4, 0)
      await expect(pxOf(dotStyle.height)).toBeCloseTo(4, 0)

      const paintsInset = (boxShadow: string) =>
        shadowLayers(boxShadow).some((layer) => layer.includes('1.4px') && layer.includes('inset'))
      await expect(paintsInset(getComputedStyle(focused).boxShadow)).toBe(true)
      await expect(paintsInset(getComputedStyle(monday).boxShadow)).toBe(false)
    } finally {
      const restoreClock = loaded.restoreClock as (() => void) | undefined
      restoreClock?.()
      const { width, height } = loaded.prevViewport as { width: number; height: number }
      await page.viewport(width, height)
    }
  },
}

/**
 * KAN-456. Week places a timed row on the hours and a date-only row in all day.
 * Next week steps the open range and leaves both titles behind.
 *
 * The week body is `hidden md:flex`, so the loader sets a 1440×900 viewport
 * before render, the same static `CollectionView` mount as `CalendarBlankDay`.
 * The clock is local noon on 19 Oct 2026, so the month opens on October.
 */
const weekSpanRows: CollectionRow[] = [
  { id: 'dentist', title: 'dentist', values: { 'p-due': '2026-10-21T10:00:00' } },
  { id: 'alcove', title: 'confirm alcove', values: { 'p-due': '2026-10-21' } },
]

const WEEK_SPAN_DAYS = ['mon 19', 'tue 20', 'wed 21', 'thu 22', 'fri 23', 'sat 24', 'sun 25']

export const CalendarWeekSpan: Story = {
  name: 'week span',
  args: { config: calendarConfig, schema, rows: weekSpanRows },
  loaders: [
    async () => {
      const prevViewport = { width: window.innerWidth, height: window.innerHeight }
      await page.viewport(1440, 900)
      const restoreClock = fixClockAtLocalNoonOn19Oct2026()
      return { prevViewport, restoreClock }
    },
  ],
  play: async ({ canvasElement, loaded }) => {
    try {
      const canvas = within(canvasElement)
      await expect(canvas.getByText('october 2026')).toBeVisible()
      await userEvent.click(canvas.getByRole('radio', { name: 'week' }))

      const body = canvasElement.querySelector<HTMLElement>(
        '[data-part="calendar-week-body"][data-size="desktop"]'
      )
      if (!body) throw new Error('calendar week span story: desktop week body missing')
      await expect(body).toBeVisible()
      const heads = WEEK_SPAN_DAYS.map((name) => within(body).getByRole('button', { name }))
      await expect(heads).toHaveLength(7)
      for (const head of heads) await expect(head).toBeVisible()

      const wednesday = body.querySelector<HTMLElement>(
        '[data-part="calendar-week-column"][data-iso="2026-10-21"]'
      )
      if (!wednesday) throw new Error('calendar week span story: 2026-10-21 column missing')
      const dentist = within(wednesday).getByText('dentist')
      await expect(dentist).toBeVisible()
      const timed = dentist.closest<HTMLElement>('[data-part="calendar-timed-event"]')
      if (!timed) throw new Error('calendar week span story: dentist is not a timed event')
      await expect(within(timed).getByText('10:00')).toBeVisible()

      const allDay = body.querySelector<HTMLElement>('[data-part="calendar-all-day"]')
      if (!allDay) throw new Error('calendar week span story: all-day row missing')
      const alcove = within(allDay).getByText('confirm alcove')
      await expect(alcove).toBeVisible()
      await expect(alcove.closest('[data-part="calendar-timed-event"]')).toBeNull()

      await userEvent.click(canvas.getByRole('button', { name: 'Next week' }))
      const nextLabel = canvas.getByText('26 oct \u2013 1 nov 2026')
      await expect(nextLabel).toBeVisible()
      const dash = [...(nextLabel.textContent ?? '')].find((char) => char.charCodeAt(0) === 0x2013)
      await expect(dash).toBe('\u2013')

      const nextBody = canvasElement.querySelector<HTMLElement>(
        '[data-part="calendar-week-body"][data-size="desktop"]'
      )
      if (!nextBody) throw new Error('calendar week span story: week body missing after next week')
      await expect(within(nextBody).queryByText('dentist')).not.toBeInTheDocument()
      await expect(within(nextBody).queryByText('confirm alcove')).not.toBeInTheDocument()
    } finally {
      const restoreClock = loaded.restoreClock as (() => void) | undefined
      restoreClock?.()
      const { width, height } = loaded.prevViewport as { width: number; height: number }
      await page.viewport(width, height)
    }
  },
}

/**
 * KAN-457. Agenda lists what's coming, grouped by day. The month opens first;
 * choosing agenda shows the two-week window from this Monday.
 *
 * Same static `CollectionView` mount as `CalendarWeekSpan`. The loader sets
 * 1440×900 and fixes the clock at local noon on 19 Oct 2026, so October is
 * open and the agenda period is `from 19 oct`.
 */
const agendaSpanRows: CollectionRow[] = [
  { id: 'alcove', title: 'confirm alcove', values: { 'p-due': '2026-10-19' } },
  { id: 'dentist', title: 'dentist', values: { 'p-due': '2026-10-20T10:00:00' } },
  { id: 'plaster', title: 'plaster', values: { 'p-due': '2026-10-21' } },
  { id: 'optician', title: 'optician', values: { 'p-due': '2026-10-21T09:00:00' } },
  { id: 'skip', title: 'skip hire', values: { 'p-due': '2026-10-18' } },
  { id: 'renew', title: 'renew', values: { 'p-due': '2026-11-02' } },
]

export const CalendarAgendaSpan: Story = {
  name: 'agenda span',
  args: { config: calendarConfig, schema, rows: agendaSpanRows },
  loaders: [
    async () => {
      const prevViewport = { width: window.innerWidth, height: window.innerHeight }
      await page.viewport(1440, 900)
      const restoreClock = fixClockAtLocalNoonOn19Oct2026()
      return { prevViewport, restoreClock }
    },
  ],
  play: async ({ canvasElement, loaded }) => {
    try {
      const canvas = within(canvasElement)
      await expect(canvas.getByText('october 2026')).toBeVisible()
      await userEvent.click(canvas.getByRole('radio', { name: 'agenda' }))

      await expect(canvas.getByText('from 19 oct')).toBeVisible()

      const list = canvasElement.querySelector<HTMLElement>('[data-part="calendar-agenda"]')
      if (!list) throw new Error('calendar agenda span story: agenda list missing')

      const today = list.querySelector<HTMLElement>(
        '[data-part="calendar-agenda-day"][data-iso="2026-10-19"]'
      )
      if (!today) throw new Error('calendar agenda span story: today missing')
      const alcove = within(today)
        .getByText('confirm alcove')
        .closest<HTMLElement>('[data-part="calendar-agenda-item"]')
      if (!alcove) throw new Error('calendar agenda span story: confirm alcove is not an agenda item')
      await expect(alcove.querySelector('[data-part="calendar-agenda-time"]')).toBeNull()

      const tomorrow = list.querySelector<HTMLElement>(
        '[data-part="calendar-agenda-day"][data-iso="2026-10-20"]'
      )
      if (!tomorrow) throw new Error('calendar agenda span story: tomorrow missing')
      const dentist = within(tomorrow)
        .getByText('dentist')
        .closest<HTMLElement>('[data-part="calendar-agenda-item"]')
      if (!dentist) throw new Error('calendar agenda span story: dentist is not an agenda item')
      await expect(within(dentist).getByText('10:00')).toBeVisible()

      const wednesday = list.querySelector<HTMLElement>(
        '[data-part="calendar-agenda-day"][data-iso="2026-10-21"]'
      )
      if (!wednesday) throw new Error('calendar agenda span story: Wednesday missing')
      const wednesdayItems = [
        ...wednesday.querySelectorAll<HTMLElement>('[data-part="calendar-agenda-item"]'),
      ]
      await expect(wednesdayItems).toHaveLength(2)
      await expect(wednesdayItems[0]?.textContent).toContain('plaster')
      await expect(wednesdayItems[0]?.querySelector('[data-part="calendar-agenda-time"]')).toBeNull()
      await expect(wednesdayItems[1]?.textContent).toContain('optician')
      const opticianTime = wednesdayItems[1]?.querySelector('[data-part="calendar-agenda-time"]')
      await expect(opticianTime).toHaveTextContent('09:00')

      await expect(canvas.queryByText('skip hire')).not.toBeInTheDocument()

      await userEvent.click(dentist)
      await expect(canvas.getByLabelText('Record: dentist')).toBeVisible()
    } finally {
      const restoreClock = loaded.restoreClock as (() => void) | undefined
      restoreClock?.()
      const { width, height } = loaded.prevViewport as { width: number; height: number }
      await page.viewport(width, height)
    }
  },
}

/**
 * KAN-527. Reaching the end of the agenda appends the next dated days.
 * The sentinel is already in view at 1440×900, so the reach is that end,
 * not a button. The period stays on this Monday.
 */
export const CalendarAgendaReachesTheEnd: Story = {
  name: 'agenda reaches the end',
  args: { config: calendarConfig, schema, rows: agendaSpanRows },
  loaders: CalendarAgendaSpan.loaders,
  play: async ({ canvasElement, loaded }) => {
    try {
      const canvas = within(canvasElement)
      await expect(canvas.getByText('october 2026')).toBeVisible()
      await userEvent.click(canvas.getByRole('radio', { name: 'agenda' }))

      await expect(canvas.getByText('from 19 oct')).toBeVisible()

      const list = canvasElement.querySelector<HTMLElement>('[data-part="calendar-agenda"]')
      if (!list) throw new Error('calendar agenda reach story: agenda list missing')

      const today = list.querySelector<HTMLElement>(
        '[data-part="calendar-agenda-day"][data-iso="2026-10-19"]'
      )
      if (!today) throw new Error('calendar agenda reach story: today missing')
      const alcove = within(today)
        .getByText('confirm alcove')
        .closest<HTMLElement>('[data-part="calendar-agenda-item"]')
      if (!alcove) throw new Error('calendar agenda reach story: confirm alcove is not an agenda item')
      await expect(alcove.querySelector('[data-part="calendar-agenda-time"]')).toBeNull()

      const tomorrow = list.querySelector<HTMLElement>(
        '[data-part="calendar-agenda-day"][data-iso="2026-10-20"]'
      )
      if (!tomorrow) throw new Error('calendar agenda reach story: tomorrow missing')
      const dentist = within(tomorrow)
        .getByText('dentist')
        .closest<HTMLElement>('[data-part="calendar-agenda-item"]')
      if (!dentist) throw new Error('calendar agenda reach story: dentist is not an agenda item')
      await expect(within(dentist).getByText('10:00')).toBeVisible()

      const wednesday = list.querySelector<HTMLElement>(
        '[data-part="calendar-agenda-day"][data-iso="2026-10-21"]'
      )
      if (!wednesday) throw new Error('calendar agenda reach story: Wednesday missing')
      const wednesdayItems = [
        ...wednesday.querySelectorAll<HTMLElement>('[data-part="calendar-agenda-item"]'),
      ]
      await expect(wednesdayItems).toHaveLength(2)
      await expect(wednesdayItems[0]?.textContent).toContain('plaster')
      await expect(wednesdayItems[0]?.querySelector('[data-part="calendar-agenda-time"]')).toBeNull()
      await expect(wednesdayItems[1]?.textContent).toContain('optician')
      const opticianTime = wednesdayItems[1]?.querySelector('[data-part="calendar-agenda-time"]')
      await expect(opticianTime).toHaveTextContent('09:00')

      await expect(canvas.queryByText('skip hire')).not.toBeInTheDocument()

      const end = list.querySelector<HTMLElement>('[data-part="calendar-agenda-end"]')
      if (!end) throw new Error('calendar agenda reach story: end sentinel missing')
      end.scrollIntoView()

      await waitFor(() => {
        const renewDay = list.querySelector<HTMLElement>(
          '[data-part="calendar-agenda-day"][data-iso="2026-11-02"]'
        )
        if (!renewDay) throw new Error('calendar agenda reach story: renew day missing')
        expect(within(renewDay).getByText('renew')).toBeInTheDocument()
      })
      expect(
        list.querySelector('[data-part="calendar-agenda-day"][data-iso="2026-10-22"]')
      ).toBeNull()
      await expect(canvas.getByText('from 19 oct')).toBeVisible()
      await expect(canvas.queryByText('skip hire')).not.toBeInTheDocument()
      await expect(canvas.queryByRole('button', { name: 'load more' })).toBeNull()
    } finally {
      const restoreClock = loaded.restoreClock as (() => void) | undefined
      restoreClock?.()
      const { width, height } = loaded.prevViewport as { width: number; height: number }
      await page.viewport(width, height)
    }
  },
}

/**
 * KAN-526. Dragging a week item onto another day writes that day. A timed
 * value keeps its time; a date-only value stays in the all-day row.
 *
 * The loader matches `CalendarWeekSpan`: 1440×900 and local noon on 19 Oct
 * 2026, so October is open and Wednesday–Friday are on screen. The harness
 * applies `onMoveDate` onto the date field, so the column shows the record.
 * The pointer sequence is `fireEvent` from `storybook/test`.
 */
function CalendarWeekDragHarness({
  config,
  hostSchema,
}: {
  config: ViewBlock
  hostSchema: PropertySchema
}) {
  const [data, setData] = useState<CollectionRow[]>(weekSpanRows)
  const handleMoveDate = (rowId: string, key: string, value: PropertyValue) => {
    setData((prev) =>
      prev.map((row) =>
        row.id === rowId ? { ...row, values: { ...row.values, [key]: value } } : row
      )
    )
  }
  return (
    <CollectionView
      config={config}
      schema={hostSchema}
      rows={data}
      editable
      onMoveDate={handleMoveDate}
    />
  )
}

/** A point inside `column`'s real rect, more than 4px (Manhattan) from the press. */
function dropPointInColumn(
  column: HTMLElement,
  down: { clientX: number; clientY: number }
): { clientX: number; clientY: number } {
  const rect = column.getBoundingClientRect()
  const clientX = rect.left + rect.width / 2
  const clientY = rect.top + rect.height / 2
  const inside =
    rect.width > 0 &&
    rect.height > 0 &&
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  const travel = Math.abs(clientX - down.clientX) + Math.abs(clientY - down.clientY)
  if (!inside || travel <= 4) {
    throw new Error(
      `calendar week drag story: move (${clientX}, ${clientY}) travel ${travel} is outside ${column.dataset.iso} or within 4px`
    )
  }
  return { clientX, clientY }
}

function dragWithFireEvent(source: HTMLElement, column: HTMLElement) {
  const sourceRect = source.getBoundingClientRect()
  const down = { clientX: sourceRect.left + 4, clientY: sourceRect.top + 4 }
  const move = dropPointInColumn(column, down)
  fireEvent.pointerDown(source, down)
  fireEvent.pointerMove(column, move)
  fireEvent.pointerUp(column)
}

function desktopWeekBody(root: HTMLElement): HTMLElement {
  const body = root.querySelector<HTMLElement>(
    '[data-part="calendar-week-body"][data-size="desktop"]'
  )
  if (!body) throw new Error('calendar week drag story: desktop week body missing')
  return body
}

function weekColumn(body: HTMLElement, iso: string): HTMLElement {
  const column = body.querySelector<HTMLElement>(
    `[data-part="calendar-week-column"][data-iso="${iso}"]`
  )
  if (!column) throw new Error(`calendar week drag story: ${iso} column missing`)
  return column
}

export const CalendarWeekDrag: Story = {
  name: 'week drag',
  args: { config: calendarConfig, schema, rows: weekSpanRows, editable: true },
  render: (args) => (
    <CalendarWeekDragHarness config={args.config} hostSchema={args.schema ?? schema} />
  ),
  loaders: [
    async () => {
      const prevViewport = { width: window.innerWidth, height: window.innerHeight }
      await page.viewport(1440, 900)
      const restoreClock = fixClockAtLocalNoonOn19Oct2026()
      return { prevViewport, restoreClock }
    },
  ],
  play: async ({ canvasElement, loaded }) => {
    try {
      const canvas = within(canvasElement)
      await expect(canvas.getByText('october 2026')).toBeVisible()
      await userEvent.click(canvas.getByRole('radio', { name: 'week' }))

      const body = desktopWeekBody(canvasElement)
      await expect(body).toBeVisible()

      const wednesday = weekColumn(body, '2026-10-21')
      const dentist = within(wednesday).getByText('dentist')
      await expect(dentist).toBeVisible()
      const timed = dentist.closest<HTMLElement>('[data-part="calendar-timed-event"]')
      if (!timed) throw new Error('calendar week drag story: dentist is not a timed event')
      await expect(within(timed).getByText('10:00')).toBeVisible()

      const thursday = weekColumn(body, '2026-10-22')
      dragWithFireEvent(timed, thursday)

      const thursdayAfter = weekColumn(desktopWeekBody(canvasElement), '2026-10-22')
      const movedDentist = within(thursdayAfter).getByText('dentist')
      await expect(movedDentist).toBeVisible()
      const movedTimed = movedDentist.closest<HTMLElement>('[data-part="calendar-timed-event"]')
      if (!movedTimed) {
        throw new Error('calendar week drag story: dentist is not a timed event on Thursday')
      }
      await expect(within(movedTimed).getByText('10:00')).toBeVisible()
      const wednesdayAfter = weekColumn(desktopWeekBody(canvasElement), '2026-10-21')
      await expect(within(wednesdayAfter).queryByText('dentist')).not.toBeInTheDocument()

      const allDay = desktopWeekBody(canvasElement).querySelector<HTMLElement>(
        '[data-part="calendar-all-day"]'
      )
      if (!allDay) throw new Error('calendar week drag story: all-day row missing')
      const alcove = within(allDay).getByText('confirm alcove')
      const alcoveItem = alcove.closest<HTMLElement>('[data-part="calendar-all-day-item"]')
      if (!alcoveItem) throw new Error('calendar week drag story: confirm alcove is not all-day')

      const friday = weekColumn(desktopWeekBody(canvasElement), '2026-10-23')
      dragWithFireEvent(alcoveItem, friday)

      const allDayAfter = desktopWeekBody(canvasElement).querySelector<HTMLElement>(
        '[data-part="calendar-all-day"]'
      )
      if (!allDayAfter) throw new Error('calendar week drag story: all-day row missing after drop')
      const movedAlcove = within(allDayAfter).getByText('confirm alcove')
      const movedItem = movedAlcove.closest<HTMLElement>('[data-part="calendar-all-day-item"]')
      if (!movedItem) throw new Error('calendar week drag story: confirm alcove left the all-day row')
      const fridayAfter = weekColumn(desktopWeekBody(canvasElement), '2026-10-23')
      await expect(movedItem.style.gridColumn).toBe(fridayAfter.style.gridColumn)
      await expect(movedAlcove.closest('[data-part="calendar-timed-event"]')).toBeNull()
    } finally {
      const restoreClock = loaded.restoreClock as (() => void) | undefined
      restoreClock?.()
      const { width, height } = loaded.prevViewport as { width: number; height: number }
      await page.viewport(width, height)
    }
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
    // Every row is a card; the meta resolves (status id → "Doing" label) — the
    // same status is also the first grouping field, so it draws the tag chip too.
    await expect(canvas.getByText('Trim the rim')).toBeInTheDocument()
    await expect(canvas.getByText('Kiln maintenance')).toBeInTheDocument()
    await expect(canvas.getAllByText('Doing').length).toBeGreaterThan(0)
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
    await expect(canvas.getByText('tasks with a start and a due date draw here')).toBeInTheDocument()
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
