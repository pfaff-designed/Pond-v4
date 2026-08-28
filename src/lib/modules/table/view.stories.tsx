import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'

import { TableView } from './view'
import type { TableBlock } from './schema'

/**
 * The `table` content block (M3) — the primitive that stops inventories and
 * collections being faked as markdown tables inside text blocks. Muted header row,
 * hairline dividers, inline cell editing + add/remove row when editable.
 */
const meta = {
  title: 'Modules/Table',
  component: TableView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TableView>

export default meta
type Story = StoryObj<typeof meta>

/** A realistic scaffolded inventory — the shape the AI proposes via create_page. */
const inventory: TableBlock = {
  id: 'tbl-1',
  type: 'table',
  title: 'Workshop tools',
  columns: ['Tool', 'Category', 'Qty', 'Location'],
  rows: [
    { id: 'r1', cells: ['Cordless drill', 'Power tools', '1', 'Bench shelf'] },
    { id: 'r2', cells: ['Circular saw', 'Power tools', '1', 'Cabinet'] },
    { id: 'r3', cells: ['Chisel set', 'Hand tools', '6', 'Drawer 2'] },
    { id: 'r4', cells: ['Tape measure', 'Measuring', '2', 'Pegboard'] },
  ],
}

/** Read-only: headers + all rows render as inert text; no inputs, no row chrome. */
export const ReadOnly: Story = {
  args: { data: inventory },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Workshop tools')).toBeInTheDocument()
    await expect(canvas.getByText('Tool')).toBeInTheDocument()
    await expect(canvas.getByText('Cordless drill')).toBeInTheDocument()
    await expect(canvas.getByText('Pegboard')).toBeInTheDocument()
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument()
    await expect(canvas.queryByText('+ Add row')).not.toBeInTheDocument()
  },
}

/** Stateful host so editable play tests exercise real onChange round-trips. */
function StatefulTable({ data }: { data: TableBlock }) {
  const [state, setState] = useState(data)
  return <TableView data={state} editable onChange={setState} />
}

/** Editable: cells are inputs; typing patches one cell and preserves the rest. */
export const Editable: Story = {
  args: { data: inventory },
  render: (args) => <StatefulTable data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const cell = canvas.getByLabelText('Qty, row 1')
    await userEvent.clear(cell)
    await userEvent.type(cell, '2')
    await expect(cell).toHaveValue('2')
    // Neighbouring cells untouched.
    await expect(canvas.getByLabelText('Tool, row 1')).toHaveValue('Cordless drill')
    await expect(canvas.getByLabelText('Location, row 4')).toHaveValue('Pegboard')
  },
}

/** Editable: add-row appends an empty row; remove-row deletes only its row. */
export const AddAndRemoveRows: Story = {
  args: { data: inventory },
  render: (args) => <StatefulTable data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('+ Add row'))
    await expect(canvas.getByLabelText('Tool, row 5')).toHaveValue('')
    await userEvent.click(canvas.getByLabelText('Remove row 2'))
    // Circular saw's row is gone; the rest survive.
    await expect(canvas.queryByDisplayValue('Circular saw')).not.toBeInTheDocument()
    await expect(canvas.getByDisplayValue('Cordless drill')).toBeInTheDocument()
    await expect(canvas.getByDisplayValue('Chisel set')).toBeInTheDocument()
  },
}

/** A budget table with a sum footer (ticket-31): the Cost column totals in a footer. */
const budget: TableBlock = {
  id: 'tbl-3',
  type: 'table',
  title: 'Ceramics studio budget',
  columns: ['Item', 'Cost'],
  rows: [
    { id: 'b1', cells: ['Wheel', '$459 (bought!)'] },
    { id: 'b2', cells: ['Kiln', '$1,200'] },
    { id: 'b3', cells: ['Clay (bulk)', '$85'] },
    { id: 'b4', cells: ['Glaze set', '$20–60'] }, // midpoint 40
    { id: 'b5', cells: ['Apron', 'TBD'] }, // skipped, not counted as 0
  ],
  sumColumn: 1,
}

/** Read-only sum footer: totals the money column leniently, junk skipped. */
export const SumFooter: Story = {
  args: { data: budget },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Total')).toBeInTheDocument()
    // 459 + 1200 + 85 + 40 = 1784, "TBD" skipped → carries the $ prefix.
    await expect(canvas.getByText('$1,784')).toBeInTheDocument()
  },
}

/** Editable sum footer re-totals live as a cell is edited (ticket-31). */
export const SumFooterLiveEdit: Story = {
  args: { data: budget },
  render: (args) => <StatefulTable data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('$1,784')).toBeInTheDocument()
    const kiln = canvas.getByLabelText('Cost, row 2')
    await userEvent.clear(kiln)
    await userEvent.type(kiln, '$1,000')
    // 459 + 1000 + 85 + 40 = 1584 — the footer re-parsed and re-totalled live.
    await expect(canvas.getByText('$1,584')).toBeInTheDocument()
  },
}

/** Empty table (columns only): read-only shows a quiet placeholder row. */
export const Empty: Story = {
  args: {
    data: { id: 'tbl-2', type: 'table', columns: ['Item', 'Qty'], rows: [] } as TableBlock,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Item')).toBeInTheDocument()
    await expect(canvas.getByText('No entries yet')).toBeInTheDocument()
  },
}
