import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { DefineSchemaProposalCard } from './DefineSchemaProposalCard'
import type { AiPropertyDef } from '@/lib/properties/schema'

const readingProps: AiPropertyDef[] = [
  { name: 'Author', type: 'text' },
  { name: 'Rating', type: 'number' },
  {
    name: 'Status',
    type: 'status',
    options: [{ label: 'To read' }, { label: 'Reading' }, { label: 'Finished' }],
  },
  { name: 'Finished on', type: 'date' },
]

const meta = {
  title: 'Molecules/DefineSchemaProposalCard',
  component: DefineSchemaProposalCard,
  parameters: { layout: 'centered' },
  args: {
    properties: readingProps,
    reason: 'Track each book as it moves through the list.',
    selectedTargetId: 'p-reading',
    targetOptions: [
      { id: 'p-reading', title: 'Reading List' },
      { id: 'p-personal', title: 'Personal' },
    ],
    // The terminal passes collectionTitleResolver over the workspace's pages;
    // stories resolve against a fixed two-collection workspace (#37).
    resolveTargetTitle: (name) =>
      ({ purchases: 'Purchases', trips: 'Trips' })[name.trim().toLowerCase()],
    onTargetChange: fn(),
    onAccept: fn(),
    onReject: fn(),
  },
} satisfies Meta<typeof DefineSchemaProposalCard>

export default meta
type Story = StoryObj<typeof meta>

/** Pending: property count, each column with its type, a status option list, the
 *  target picker, and actions. */
export const Pending: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('New schema · 4 properties')).toBeInTheDocument()
    await expect(canvas.getByText('Author')).toBeInTheDocument()
    await expect(canvas.getByText('Rating')).toBeInTheDocument()
    // The status property's option labels are previewed.
    await expect(canvas.getByText('To read · Reading · Finished')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Define schema' })).toBeInTheDocument()
    await expect(canvas.getByRole('combobox', { name: 'Target page' })).toBeInTheDocument()
  },
}

/** Accept raises onAccept exactly once. */
export const AcceptFires: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Define schema' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

/** Changing the target raises onTargetChange with the chosen page id. */
export const PickTarget: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const select = canvas.getByRole('combobox', { name: 'Target page' })
    await userEvent.selectOptions(select, 'p-personal')
    await expect(args.onTargetChange).toHaveBeenCalledWith('p-personal')
  },
}

/** The proposed target is pre-selected; Accept fires with it intact. */
export const TargetPreselected: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const select = canvas.getByRole('combobox', { name: 'Target page' }) as HTMLSelectElement
    await expect(select.value).toBe('p-reading')
    await userEvent.click(canvas.getByRole('button', { name: 'Define schema' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

/** Resolved (accepted): picker + actions gone, "Schema defined" status remains. */
export const Accepted: Story = {
  args: { status: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Schema defined')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Define schema' })).not.toBeInTheDocument()
  },
}

/** Resolved (rejected): "Dismissed" status line. */
export const Rejected: Story = {
  args: { status: 'rejected' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Dismissed')).toBeInTheDocument()
  },
}

/**
 * A rollup previews its DEFINITION by name — "sum of Amount via Purchases" (#20) —
 * next to its `rollup` type chip; a `count` needs no rolled property.
 */
export const WithRollup: Story = {
  args: {
    properties: [
      { name: 'Purchases', type: 'relation', target: 'Purchases' },
      {
        name: 'Total spent',
        type: 'rollup',
        relation: 'Purchases',
        rollupProperty: 'Amount',
        aggregate: 'sum',
      },
      { name: 'Order count', type: 'rollup', relation: 'Purchases', aggregate: 'count' },
    ] as AiPropertyDef[],
    reason: 'Roll each order up onto the customer.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('sum of Amount via Purchases')).toBeInTheDocument()
    await expect(canvas.getByText('count via Purchases')).toBeInTheDocument()
  },
}

/**
 * A relation previews its RESOLVED target collection — "→ Trips" — so the user can
 * correct it before accept (#37, spec decision 8). An unmatched name is flagged
 * ("· no match" → accept leaves it untargeted); an untargeted relation shows just
 * its type chip.
 */
export const WithRelationTargets: Story = {
  args: {
    properties: [
      // Proposed lowercase — the preview shows the canonical resolved title.
      { name: 'Trip', type: 'relation', target: 'trips' },
      { name: 'Companion', type: 'relation', target: 'People' },
      { name: 'Anything', type: 'relation' },
    ] as AiPropertyDef[],
    reason: 'Link each entry to the trip it happened on.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('→ Trips')).toBeInTheDocument()
    await expect(canvas.getByText('→ People · no match')).toBeInTheDocument()
    await expect(canvas.queryByText(/^→ Anything/)).not.toBeInTheDocument()
  },
}
