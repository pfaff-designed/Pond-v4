import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'

import { MetricView } from './view'
import type { MetricBlock } from './schema'
import { TodoView } from '../todo/view'
import type { TodoBlock } from '../todo/schema'
import type { Block } from '../content'
import { SiblingBlocksProvider } from '../sibling-context'

/**
 * The `metric` module (ticket-23) — a single labelled figure. Unbound it shows a
 * manual value; bound (`source`) it derives its value LIVE from a sibling checklist
 * or table read through the SiblingBlocks context. A bound metric shows a `→` link
 * to its source; a stale binding (source deleted) falls back to the manual value
 * with a "source missing" note.
 */
const meta = {
  title: 'Modules/Metric',
  component: MetricView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MetricView>

export default meta
type Story = StoryObj<typeof meta>

const manual: MetricBlock = {
  id: 'm1',
  type: 'metric',
  label: 'Weekly mileage',
  value: 38,
  unit: 'mi',
  trend: 'up',
}

/** Unbound: shows the manual value, no `→` affordance, no "source missing". */
export const Unbound: Story = {
  args: { data: manual },
  render: (args) => (
    <SiblingBlocksProvider value={{ blocks: [args.data as Block] }}>
      <MetricView data={args.data} />
    </SiblingBlocksProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Weekly mileage')).toBeInTheDocument()
    await expect(canvas.getByText('38 mi')).toBeInTheDocument()
    await expect(canvas.queryByLabelText('Go to source block')).not.toBeInTheDocument()
    await expect(canvas.queryByText('source missing')).not.toBeInTheDocument()
  },
}

/**
 * Bound + live: a checklist sibling and a metric counting its checked items. Toggling
 * a checkbox re-derives the metric in the same render. Shows the `→` source link.
 */
function LiveBound() {
  const [todo, setTodo] = useState<TodoBlock>({
    id: 'todo-1',
    type: 'todo',
    items: [
      { id: 'i1', label: 'Dune', checked: true },
      { id: 'i2', label: 'Hyperion', checked: false },
      { id: 'i3', label: 'Neuromancer', checked: false },
    ],
  })
  const metric: MetricBlock = {
    id: 'm2',
    type: 'metric',
    label: 'Books finished',
    value: 0,
    source: { blockId: 'todo-1', kind: 'checklist-checked' },
  }
  const blocks: Block[] = [todo, metric]
  return (
    <SiblingBlocksProvider value={{ blocks, scrollToBlock: () => {} }}>
      <div className="space-y-3">
        <TodoView data={todo} editable onChange={setTodo} />
        <MetricView data={metric} />
      </div>
    </SiblingBlocksProvider>
  )
}

export const BoundLive: Story = {
  args: { data: manual },
  render: () => <LiveBound />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Derived from one checked item, not the manual 0.
    await expect(canvas.getByText('Books finished')).toBeInTheDocument()
    await expect(canvas.getByText('1')).toBeInTheDocument()
    // The `→` link is present when bound.
    await expect(canvas.getByLabelText('Go to source block')).toBeInTheDocument()
    // Check a second box → derived value climbs to 2, live.
    const boxes = canvas.getAllByRole('checkbox')
    await userEvent.click(boxes[1])
    await expect(canvas.getByText('2')).toBeInTheDocument()
  },
}

/** Stale: bound to a blockId that isn't in the sibling set → falls back + note. */
export const StaleSource: Story = {
  args: {
    data: {
      id: 'm3',
      type: 'metric',
      label: 'Books finished',
      value: 5,
      source: { blockId: 'gone', kind: 'checklist-checked' },
    },
  },
  render: (args) => (
    <SiblingBlocksProvider value={{ blocks: [args.data as Block] }}>
      <MetricView data={args.data} />
    </SiblingBlocksProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Falls back to the manual value (5), shows the missing-source note, no `→`.
    await expect(canvas.getByText('5')).toBeInTheDocument()
    await expect(canvas.getByText('source missing')).toBeInTheDocument()
    await expect(canvas.queryByLabelText('Go to source block')).not.toBeInTheDocument()
  },
}
