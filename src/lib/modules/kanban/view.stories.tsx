import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fireEvent, userEvent, within } from 'storybook/test'

import { KanbanView } from './view'
import type { KanbanBlock } from './schema'

/**
 * The `kanban` module (ticket-35, finding F4) — a workflow with stages: columns as
 * quiet paper wells, small Press cards, drag a card between columns via pointer
 * events (no new dep). ONE kanban per workflow, not kanban + checklist for the same
 * tasks.
 */
const meta = {
  title: 'Modules/Kanban',
  component: KanbanView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof KanbanView>

export default meta
type Story = StoryObj<typeof meta>

/** A realistic board — the shape the AI proposes / a user builds up. */
const board: KanbanBlock = {
  id: 'k1',
  type: 'kanban',
  title: 'Bookshelf build',
  columns: [
    {
      id: 'todo',
      title: 'To do',
      cards: [
        { id: 'c1', title: 'Cut boards to length' },
        { id: 'c2', title: 'Sand', note: 'to 220 grit' },
      ],
    },
    { id: 'doing', title: 'Doing', cards: [{ id: 'c3', title: 'Glue-up' }] },
    { id: 'done', title: 'Done', cards: [{ id: 'c4', title: 'Buy lumber' }] },
  ],
}

/** Read-only: columns, counts and cards render as inert text; no inputs, no chrome. */
export const ReadOnly: Story = {
  args: { data: board },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Bookshelf build')).toBeInTheDocument()
    await expect(canvas.getByText('To do')).toBeInTheDocument()
    await expect(canvas.getByText('Cut boards to length')).toBeInTheDocument()
    await expect(canvas.getByText('to 220 grit')).toBeInTheDocument()
    // No editing affordances when read-only.
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument()
    await expect(canvas.queryByText('+ Column')).not.toBeInTheDocument()
  },
}

/** Stateful host so editable play tests exercise real onChange round-trips. */
function StatefulKanban({ data }: { data: KanbanBlock }) {
  const [state, setState] = useState(data)
  return <KanbanView data={state} editable onChange={setState} />
}

/** Editable: the add-card field appends a card to that column's foot on Enter. */
export const AddCard: Story = {
  args: { data: board },
  render: (args) => <StatefulKanban data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const adders = canvas.getAllByLabelText('Add a card')
    await userEvent.type(adders[1], 'Clamp dry-fit') // "Doing" column
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByDisplayValue('Clamp dry-fit')).toBeInTheDocument()
    // Existing cards untouched.
    await expect(canvas.getByDisplayValue('Glue-up')).toBeInTheDocument()
  },
}

/** Editable: editing a card title patches only that card; archiving removes only it. */
export const EditAndArchiveCard: Story = {
  args: { data: board },
  render: (args) => <StatefulKanban data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const title = canvas.getByLabelText('Card title: Glue-up')
    await userEvent.clear(title)
    await userEvent.type(title, 'Glue and clamp')
    await expect(title).toHaveValue('Glue and clamp')

    await userEvent.click(canvas.getByLabelText('Archive card: Buy lumber'))
    await expect(canvas.queryByDisplayValue('Buy lumber')).not.toBeInTheDocument()
    // Sibling cards survive.
    await expect(canvas.getByDisplayValue('Cut boards to length')).toBeInTheDocument()
  },
}

/** Editable: renaming a column header updates just that column's title. */
export const RenameColumn: Story = {
  args: { data: board },
  render: (args) => <StatefulKanban data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const header = canvas.getByLabelText('Column title: Doing')
    await userEvent.clear(header)
    await userEvent.type(header, 'In progress')
    await expect(header).toHaveValue('In progress')
  },
}

/** Adding a column appends an empty "New column" well. */
export const AddColumn: Story = {
  args: { data: board },
  render: (args) => <StatefulKanban data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('+ Column'))
    await expect(canvas.getByLabelText('Column title: New column')).toBeInTheDocument()
  },
}

/**
 * Drag a card between columns via pointer events (the F4 mechanism). Presses the
 * card, moves past the threshold onto the target column, releases — the card lands
 * at the target's foot. Coordinates come from real getBoundingClientRect (Chromium).
 */
export const DragBetweenColumns: Story = {
  args: { data: board },
  render: (args) => <StatefulKanban data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Grab "Glue-up" (in Doing) by its drag handle and drop it on the Done column.
    // Editable column titles are inputs, so locate the Done well via its title field.
    const handle = canvas.getByLabelText('Drag card: Glue-up')
    const doneColumn = canvas.getByLabelText('Column title: Done').closest('section') as HTMLElement

    const grip = handle.getBoundingClientRect()
    const to = doneColumn.getBoundingClientRect()
    const center = { x: to.x + to.width / 2, y: to.y + to.height / 2 }

    // Explicit pointer events with clientX/Y (deterministic vs. userEvent target
    // coords). Press the handle, move past the threshold onto Done, release there.
    fireEvent.pointerDown(handle, { clientX: grip.x + 4, clientY: grip.y + 4 })
    fireEvent.pointerMove(doneColumn, { clientX: to.x + 8, clientY: to.y + 8 })
    // The lift is showing: a floating ghost clone tracks under the pointer.
    await expect(canvas.getByText('Glue-up', { selector: 'div' })).toBeInTheDocument()
    fireEvent.pointerMove(doneColumn, { clientX: center.x, clientY: center.y })
    fireEvent.pointerUp(doneColumn, { clientX: center.x, clientY: center.y })

    // The Done column now shows Glue-up; the Doing column no longer does.
    const doneCards = within(doneColumn)
    await expect(doneCards.getByDisplayValue('Glue-up')).toBeInTheDocument()
    await expect(doneCards.getByDisplayValue('Buy lumber')).toBeInTheDocument()
  },
}

/** Long card titles wrap inside the card without breaking the column layout. */
const longTitles: KanbanBlock = {
  id: 'k2',
  type: 'kanban',
  columns: [
    {
      id: 'a',
      title: 'Backlog',
      cards: [
        {
          id: 'l1',
          title:
            'Refactor the joinery jig so the through-tenons register off the reference face instead of the offcut edge',
          note: 'this note is also intentionally long to check that the note line wraps and does not overflow the card',
        },
      ],
    },
    { id: 'b', title: 'Doing', cards: [] },
  ],
}

export const LongTitles: Story = {
  args: { data: longTitles },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Refactor the joinery jig/)).toBeInTheDocument()
  },
}

/** Empty board (the t37 manual-creation starting state): three columns, no cards. */
export const EmptyBoard: Story = {
  args: {
    data: {
      id: 'k3',
      type: 'kanban',
      columns: [
        { id: 't', title: 'To do', cards: [] },
        { id: 'd', title: 'Doing', cards: [] },
        { id: 'n', title: 'Done', cards: [] },
      ],
    } as KanbanBlock,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('To do')).toBeInTheDocument()
    // Read-only empty columns read "Empty".
    await expect(canvas.getAllByText('Empty')).toHaveLength(3)
  },
}
