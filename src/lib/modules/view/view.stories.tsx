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
  { id: 'p-fired', name: 'Fired', type: 'checkbox' },
]

const rows: CollectionRow[] = [
  {
    id: 'r1',
    title: 'Trim the rim',
    values: { 'p-status': 'o-doing', 'p-stage': 's-throw', 'p-priority': 2, 'p-fired': false },
  },
  {
    id: 'r2',
    title: 'Celadon glaze test',
    values: { 'p-status': 'o-done', 'p-stage': 's-glaze', 'p-priority': 1, 'p-fired': true },
  },
  {
    id: 'r3',
    title: 'Wedge stoneware',
    values: { 'p-status': 'o-todo', 'p-stage': 's-throw', 'p-priority': 3, 'p-fired': false },
  },
  { id: 'r4', title: 'Kiln maintenance', values: {} },
]

const tableConfig: ViewBlock = { id: 'v-table', type: 'view', mode: 'table' }
const boardConfig: ViewBlock = { id: 'v-board', type: 'view', mode: 'board', groupBy: 'p-status' }

/** A stateful host so editable stories exercise real optimistic round-trips. */
function StatefulView({
  config,
  initialRows,
}: {
  config: ViewBlock
  initialRows?: CollectionRow[]
}) {
  const [data, setData] = useState<CollectionRow[]>(initialRows ?? rows)
  const onEdit = (rowId: string, key: string, value: PropertyValue) =>
    setData((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [key]: value } } : r))
    )
  return <CollectionView config={config} schema={schema} rows={data} editable onEdit={onEdit} />
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
