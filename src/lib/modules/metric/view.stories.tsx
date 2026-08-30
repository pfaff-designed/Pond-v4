import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { MetricView } from './view'
import type { MetricBlock } from './schema'
import { TodoView } from '../todo/view'
import type { TodoBlock } from '../todo/schema'
import type { Block } from '../content'
import { SiblingBlocksProvider } from '../sibling-context'

/**
 * A QueryClient pre-seeded with the exact caches the cross-page seam reads (ticket-38):
 * `['page', id]` for a cross-page block, `['pages']` for the child scope. `staleTime:
 * Infinity` keeps react-query from firing the real `getPage`/`fetchPages` queryFns in
 * the story — the seam resolves synchronously from cache, so the story exercises the
 * view's cross-page/aggregate rendering without any network. (The fetch + freshness of
 * the seam itself is jest-covered in use-cross-page-metric.test.tsx.)
 */
function seededClient(seed: {
  pages?: { id: string; blocks: Block[] }[]
  tree?: { id: string; parent_id: string | null }[]
}): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  for (const p of seed.pages ?? []) {
    client.setQueryData(['page', p.id], { id: p.id, title: p.id, blocks: p.blocks })
  }
  // ticket-43: the ['pages'] tree is now scoped by workspace; stories render
  // without a WorkspaceProvider so the hook reads the 'main' default.
  if (seed.tree) client.setQueryData(['pages', 'main'], seed.tree)
  return client
}

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
    // Derived from one checked item, not the manual 0. Asserted via the value's
    // accessible label — NumberFlow animates by splitting digits across nodes, so a
    // plain getByText('1') would be brittle; the aria-label is the stable string.
    await expect(canvas.getByText('Books finished')).toBeInTheDocument()
    await expect(canvas.getByLabelText('Books finished: 1')).toBeInTheDocument()
    // The `→` link is present when bound.
    await expect(canvas.getByLabelText('Go to source block')).toBeInTheDocument()
    // Check a second box → derived value counts up to 2, live (NumberFlow animates).
    const boxes = canvas.getAllByRole('checkbox')
    await userEvent.click(boxes[1])
    await expect(canvas.getByLabelText('Books finished: 2')).toBeInTheDocument()
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

// ── ticket-38: cross-page & aggregate rollups ─────────────────────────────────

const childTodo = (id: string, checked: number, total: number): Block => ({
  id,
  type: 'todo',
  items: Array.from({ length: total }, (_, i) => ({
    id: `${id}-${i}`,
    label: `task ${i}`,
    checked: i < checked,
  })),
})

/**
 * Cross-page: a metric on THIS page bound to a checklist on ANOTHER page (page-A). The
 * seam reads page-A from the seeded `['page','page-A']` cache and derives 2 of 4 checked
 * — not the manual fallback (99). No `→` scroll (the source is off-page).
 */
export const CrossPageBound: Story = {
  args: {
    data: {
      id: 'm-x',
      type: 'metric',
      label: 'Milestone tasks',
      value: 99,
      source: { pageId: 'page-A', blockId: 'todo-A', kind: 'checklist-checked' },
    },
  },
  render: (args) => (
    <QueryClientProvider
      client={seededClient({ pages: [{ id: 'page-A', blocks: [childTodo('todo-A', 2, 4)] }] })}
    >
      <SiblingBlocksProvider value={{ blocks: [args.data as Block], pageId: 'this-page' }}>
        <MetricView data={args.data} />
      </SiblingBlocksProvider>
    </QueryClientProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Derived cross-page value (2), never the manual 99.
    await expect(canvas.getByLabelText('Milestone tasks: 2')).toBeInTheDocument()
    await expect(canvas.queryByText('99')).not.toBeInTheDocument()
    await expect(canvas.queryByText('source missing')).not.toBeInTheDocument()
  },
}

/**
 * Aggregate rollup: a metric on a parent page summing checked items across ALL its
 * direct child pages. The seam reads the `['pages']` tree (two children of parent-1)
 * and each child's blocks, sums 1 + 2 = 3, and shows the quiet "across 2 pages" scope
 * caption (w2-design-brief).
 */
export const ChildPagesRollup: Story = {
  args: {
    data: {
      id: 'm-agg',
      type: 'metric',
      label: 'Tasks across milestones',
      value: 0,
      source: { pages: 'children', kind: 'checklist-checked' },
    },
  },
  render: (args) => (
    <QueryClientProvider
      client={seededClient({
        tree: [
          { id: 'c1', parent_id: 'parent-1' },
          { id: 'c2', parent_id: 'parent-1' },
          { id: 'other', parent_id: 'somewhere-else' },
        ],
        pages: [
          { id: 'c1', blocks: [childTodo('t1', 1, 3)] },
          { id: 'c2', blocks: [childTodo('t2', 2, 2)] },
        ],
      })}
    >
      <SiblingBlocksProvider value={{ blocks: [args.data as Block], pageId: 'parent-1' }}>
        <MetricView data={args.data} />
      </SiblingBlocksProvider>
    </QueryClientProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // 1 (c1) + 2 (c2) = 3, and the scope caption names the 2 contributing pages.
    await expect(canvas.getByLabelText('Tasks across milestones: 3')).toBeInTheDocument()
    await expect(canvas.getByText('across 2 pages')).toBeInTheDocument()
  },
}
