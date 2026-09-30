import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fireEvent, userEvent, within } from 'storybook/test'

import { CollectionView } from './view'
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

/** Empty collection (schema, no rows): the table shows its "No rows yet" line. */
export const TableEmpty: Story = {
  args: { config: tableConfig, schema, rows: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No rows yet')).toBeInTheDocument()
  },
}

// ── Board ──────────────────────────────────────────────────────────────────────

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
    const handle = canvas.getByLabelText('Drag card: Trim the rim')
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
  args: { config: { id: 'v', type: 'view', mode: 'board' }, schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('This board needs a group-by (select or status) property.')
    ).toBeInTheDocument()
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

/** Read-only card grid: one card per row, title over resolved property values. */
export const GalleryReadOnly: Story = {
  args: { config: galleryConfig, schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Every row is a card; values resolve (status id → "Doing" chip label).
    await expect(canvas.getByText('Trim the rim')).toBeInTheDocument()
    await expect(canvas.getByText('Kiln maintenance')).toBeInTheDocument()
    await expect(canvas.getByText('Doing')).toBeInTheDocument()
    // Read-only: no editors, no drag handles.
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument()
    await expect(canvas.queryByLabelText(/Drag card/)).not.toBeInTheDocument()
  },
}

/** Empty collection in gallery mode: the "No rows yet" line, not a bare grid. */
export const GalleryEmpty: Story = {
  args: { config: galleryConfig, schema, rows: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No rows yet')).toBeInTheDocument()
  },
}

// ── Gantt (read-only timeline) ────────────────────────────────────────────────

/**
 * Read-only gantt: one bar per dated row over a single adaptive timeline, ordered by
 * start ascending. The end-less row (Glaze day) is a single-day tick; the start-less
 * row (Someday idea) is omitted. Date properties auto-infer (1st=Start, 2nd=End).
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
      chart: { kind: 'bar', xProperty: 'p-stage', series: [{ property: 'p-priority', agg: 'sum' }] },
    },
    schema,
    rows,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The axis labels name the PROPERTIES the chart reads — it is a view of the
    // database, so the category axis is a field and the value axis is a field+verb.
    await expect(canvas.getByText('Stage')).toBeInTheDocument()
    await expect(canvas.getByText('Priority')).toBeInTheDocument()
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
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Record')).toBeInTheDocument()
    // The verb is named in the series label, so the read is never ambiguous.
    await expect(canvas.getByText('Priority (latest)')).toBeInTheDocument()
  },
}

/**
 * A chart KIND with no renderer yet (#94 builds the remaining eight). Valid config —
 * it reads as a calm notice, so #94 lands renderers without touching this contract.
 */
export const ChartKindNotDrawnYet: Story = {
  args: {
    config: {
      id: 'v-chart-radar',
      type: 'view',
      mode: 'chart',
      chart: { kind: 'radar', series: [{ property: 'p-priority', agg: 'sum' }] },
    },
    schema,
    rows,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('A radar chart isn’t drawn yet.')).toBeInTheDocument()
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
    await expect(canvas.getByText('over 4 records')).toBeInTheDocument()
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
    await expect(canvas.getByText('over 1 record')).toBeInTheDocument()
  },
}

/**
 * #111 AC 5 — the mode switcher offers chart and big-number beside the older modes,
 * and switching to one keeps the SAME database: only the view config changes, so the
 * records are still there when you switch back.
 */
export const SwitchTableToBigNumber: Story = {
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
    // The switcher offers every mode, the two new ones included.
    await expect(canvas.getByRole('button', { name: 'Chart' })).toBeInTheDocument()
    await expect(canvas.getByText('Trim the rim')).toBeInTheDocument()

    // Switch to the big number: an unconfigured mode INFERS a drawable figure from the
    // schema (first numeric field, summed) rather than showing nothing — the same
    // tolerance a gantt has when its date properties aren't named.
    await userEvent.click(canvas.getByRole('button', { name: 'Big number' }))
    await expect(canvas.getByRole('status', { name: 'Priority: 6' })).toBeInTheDocument()
    // The picker rewrites only the view config — here, down to counting records.
    await userEvent.selectOptions(canvas.getByLabelText('Figure'), '')
    await expect(canvas.getByRole('status', { name: 'Records: 4' })).toBeInTheDocument()

    // Back to the table: the records were never copied or moved.
    await userEvent.click(canvas.getByRole('button', { name: 'Table' }))
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
