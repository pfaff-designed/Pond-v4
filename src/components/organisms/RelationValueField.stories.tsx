import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { RelationValueField } from './RelationValueField'
import type { PropertyDef } from '@/lib/properties/schema'

/**
 * The connected relation field (#20 slice 6): the fetch boundary between the
 * presentational `RelationValue` molecule and the app's data. It reads titles +
 * candidates from `useRelationTitles` and derives `onOpen` from the router, so
 * the view `Cell` and `PropertyInspector` stay presentational.
 *
 * Stories seed the exact react-query caches the hook reads (`['rows', targetId]`
 * for a targeted relation) with `staleTime: Infinity`, so the seam resolves
 * synchronously from cache — no network, no supabase — mirroring the pattern in
 * Modules/Metric. The fetch/freshness of the hook itself is covered in
 * use-relation-titles.test.tsx; these stories cover the wiring + edit behavior.
 */
function seededClient(seed: {
  rows?: { targetId: string; rows: { id: string; title: string }[] }
}): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  if (seed.rows) {
    client.setQueryData(
      ['rows', seed.rows.targetId],
      seed.rows.rows.map((r) => ({
        id: r.id,
        title: r.title,
        type: 'row',
        parentId: seed.rows!.targetId,
        blocks: [],
        order: 0,
        props: {},
      }))
    )
  }
  return client
}

const TARGET = 'coll-projects'

const relDef: PropertyDef = {
  id: 'p-rel',
  name: 'Projects',
  type: 'relation',
  target: TARGET,
}

// The rows the target collection holds — the picker's candidates + title source.
const ROWS = [
  { id: 'r1', title: 'Apollo' },
  { id: 'r2', title: 'Borealis' },
  { id: 'r3', title: 'Cascade' },
]

const meta = {
  title: 'Organisms/RelationValueField',
  component: RelationValueField,
  // appDirectory mounts the App Router so the field's `useRouter()` (chip onOpen)
  // resolves in-story; navigation is a no-op action here.
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
} satisfies Meta<typeof RelationValueField>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Read-only host: linked ids resolve to titled chips from the seeded rows cache;
 * no "+ Link" affordance and no × remove.
 */
export const Chips: Story = {
  args: { def: relDef, value: ['r1', 'r2'], editable: false, onChange: () => {} },
  render: (args) => (
    <QueryClientProvider client={seededClient({ rows: { targetId: TARGET, rows: ROWS } })}>
      <RelationValueField {...args} />
    </QueryClientProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Titles resolved from cache, rendered as clickable chips.
    await expect(canvas.getByRole('button', { name: 'Apollo' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Borealis' })).toBeInTheDocument()
    // Read-only: no picker, no remove.
    await expect(canvas.queryByRole('button', { name: 'Link a page' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
  },
}

/**
 * An id that resolves to no row (deleted / off-target, tolerated per #20
 * leniency) renders as a faded "Missing page" chip — inert, not a button.
 */
export const Missing: Story = {
  args: { def: relDef, value: ['r1', 'ghost'], editable: false, onChange: () => {} },
  render: (args) => (
    <QueryClientProvider client={seededClient({ rows: { targetId: TARGET, rows: ROWS } })}>
      <RelationValueField {...args} />
    </QueryClientProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Apollo' })).toBeInTheDocument()
    // The unresolved id shows the missing chip and is NOT an open button.
    await expect(canvas.getByText('Missing page')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'ghost' })).not.toBeInTheDocument()
  },
}

/** Holds the relation value in state so edits (add/remove/replace) re-render. */
function Editable({ def, initial }: { def: PropertyDef; initial: string[] }) {
  const [value, setValue] = useState<string[]>(initial)
  return (
    <QueryClientProvider client={seededClient({ rows: { targetId: def.target!, rows: ROWS } })}>
      <RelationValueField def={def} value={value} editable onChange={setValue} />
    </QueryClientProvider>
  )
}

/**
 * Editable host: the picker offers the target rows minus the already-linked, a
 * click links a page (new chip), and a chip's × removes it — both writing the
 * fresh array back through `onChange`.
 */
export const PickerAddRemove: Story = {
  args: { def: relDef, value: ['r1'], editable: true, onChange: () => {} },
  render: () => <Editable def={relDef} initial={['r1']} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Apollo' })).toBeInTheDocument()
    // Open the picker; the already-linked Apollo is not offered.
    await userEvent.click(canvas.getByRole('button', { name: 'Link a page' }))
    await expect(canvas.getByRole('menuitem', { name: 'Borealis' })).toBeInTheDocument()
    await expect(canvas.queryByRole('menuitem', { name: 'Apollo' })).not.toBeInTheDocument()
    // Link Borealis → it becomes a chip alongside Apollo.
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Borealis' }))
    await expect(canvas.getByRole('button', { name: 'Borealis' })).toBeInTheDocument()
    // Remove Apollo via its × → gone; Borealis remains.
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Apollo' }))
    await expect(canvas.queryByRole('button', { name: 'Apollo' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Borealis' })).toBeInTheDocument()
  },
}

/**
 * A `single` relation is a radio: selecting a new row REPLACES the current link
 * rather than appending.
 */
export const Single: Story = {
  args: { def: { ...relDef, single: true }, value: ['r1'], editable: true, onChange: () => {} },
  render: () => <Editable def={{ ...relDef, single: true }} initial={['r1']} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Apollo' })).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Link a page' }))
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Cascade' }))
    // Replaced, not appended: Cascade in, Apollo out.
    await expect(canvas.getByRole('button', { name: 'Cascade' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Apollo' })).not.toBeInTheDocument()
  },
}
