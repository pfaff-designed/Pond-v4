import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { RollupValueField } from './RollupValueField'
import { SCHEMA_KEY } from '@/lib/properties/schema'
import type { PropertyDef } from '@/lib/properties/schema'

/**
 * The connected rollup field (#20): the fetch boundary between the presentational
 * `RollupValue` molecule and the app's data. Given the sibling relation's def +
 * value (the linked ids on this row), `useRollup` reads the target collection's rows
 * (`['rows', targetId]`) and schema (`['page', targetId]`) and runs the pure
 * compute.
 *
 * Stories seed those exact caches with `staleTime: Infinity`, so the seam resolves
 * synchronously from cache — no network, no supabase — mirroring
 * RelationValueField.stories. The compute itself is covered in
 * compute-rollup.test.ts; these stories cover the wiring.
 */
const TARGET = 'coll-books'

// The rolled property lives on the TARGET collection's schema.
const ratingDef: PropertyDef = { id: 'p-rating', name: 'Rating', type: 'number' }

// The sibling relation on the row carrying the rollup.
const shelfDef: PropertyDef = { id: 'p-shelf', name: 'Shelf', type: 'relation', target: TARGET }

// The rollup itself — average of Rating over the linked rows.
const avgDef: PropertyDef = {
  id: 'p-avg',
  name: 'Avg rating',
  type: 'rollup',
  relationId: 'p-shelf',
  rollupProperty: 'p-rating',
  aggregate: 'average',
}

const countDef: PropertyDef = {
  id: 'p-count',
  name: 'Books',
  type: 'rollup',
  relationId: 'p-shelf',
  aggregate: 'count',
}

const ROWS = [
  { id: 'r1', title: 'Dune', rating: 5 },
  { id: 'r2', title: 'Neuromancer', rating: 4 },
  { id: 'r3', title: 'Snow Crash', rating: 3 },
]

function seededClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  // The target collection's rows — the values the rollup aggregates.
  client.setQueryData(
    ['rows', TARGET],
    ROWS.map((r) => ({
      id: r.id,
      title: r.title,
      type: 'row',
      parentId: TARGET,
      blocks: [],
      order: 0,
      props: { 'p-rating': r.rating },
    }))
  )
  // The target collection page — carries the _schema the rolled prop is found in.
  client.setQueryData(['page', TARGET], {
    id: TARGET,
    title: 'Books',
    type: 'page',
    parentId: null,
    blocks: [],
    order: 0,
    props: { [SCHEMA_KEY]: [ratingDef] },
  })
  return client
}

const meta = {
  title: 'Organisms/RollupValueField',
  component: RollupValueField,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof RollupValueField>

export default meta
type Story = StoryObj<typeof meta>

/** Average of Rating over the two linked rows: (5 + 4) / 2 = 4.5. */
export const Average: Story = {
  args: { def: avgDef, relationDef: shelfDef, relationValue: ['r1', 'r2'] },
  render: (args) => (
    <QueryClientProvider client={seededClient()}>
      <RollupValueField {...args} />
    </QueryClientProvider>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('4.5')).toBeInTheDocument()
  },
}

/** Count is just the number of linked pages — no target property needed. */
export const Count: Story = {
  args: { def: countDef, relationDef: shelfDef, relationValue: ['r1', 'r2', 'r3'] },
  render: (args) => (
    <QueryClientProvider client={seededClient()}>
      <RollupValueField {...args} />
    </QueryClientProvider>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('3')).toBeInTheDocument()
  },
}

/** An unresolvable relation (no relationDef) computes nothing → faded "—" (D7). */
export const Unresolved: Story = {
  args: { def: avgDef, relationDef: undefined, relationValue: [] },
  render: (args) => (
    <QueryClientProvider client={seededClient()}>
      <RollupValueField {...args} />
    </QueryClientProvider>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('—')).toBeInTheDocument()
  },
}
