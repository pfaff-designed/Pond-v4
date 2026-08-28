import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { ProposalGroup } from './ProposalGroup'
import type { ChangePreview } from '@/lib/modules/preview'

const changes: ChangePreview[] = [
  {
    op: 'create',
    before: null,
    after: { id: '__preview__', type: 'text', content: 'A brand-new paragraph.' },
  },
  {
    op: 'edit',
    before: { id: 'b', type: 'text', content: 'The old line.' },
    after: { id: '__preview__', type: 'text', content: 'The sharper line.' },
  },
  {
    op: 'remove',
    before: { id: 'm', type: 'metric', label: 'Weekly mileage', value: 38, unit: 'mi' },
    after: null,
  },
]

const meta = {
  title: 'Molecules/ProposalGroup',
  component: ProposalGroup,
  parameters: { layout: 'centered' },
  args: {
    changes,
    statuses: ['pending', 'pending', 'pending'],
    onAccept: fn(),
    onReject: fn(),
    onEdit: fn(),
    onAcceptAll: fn(),
    onRejectAll: fn(),
  },
} satisfies Meta<typeof ProposalGroup>

export default meta
type Story = StoryObj<typeof meta>

/** A create + edit + remove batch: three cards under a group bar. */
export const Batch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('A brand-new paragraph.')).toBeInTheDocument()
    await expect(canvas.getByText('The sharper line.')).toBeInTheDocument()
    await expect(canvas.getByText('Will be removed')).toBeInTheDocument()
    // group bar present for a multi-change batch
    await expect(canvas.getByRole('button', { name: 'Accept all' })).toBeInTheDocument()
  },
}

/** Accept-all raises the group intent once. */
export const AcceptAllFires: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Accept all' }))
    await expect(args.onAcceptAll).toHaveBeenCalledTimes(1)
  },
}

/** Accepting one card raises onAccept with that card's index. */
export const PerCardAccept: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // first card is the create — its Accept is the first in the DOM
    const accepts = canvas.getAllByRole('button', { name: 'Accept' })
    await userEvent.click(accepts[0])
    await expect(args.onAccept).toHaveBeenCalledWith(0)
  },
}

/** Partial-accepted: one card resolved, group bar still offered for the rest. */
export const PartiallyResolved: Story = {
  args: { statuses: ['accepted', 'pending', 'pending'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Accepted')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Accept all' })).toBeInTheDocument()
  },
}

/** Single change: no group bar — the card's own footer is enough. */
export const SingleChange: Story = {
  args: { changes: [changes[0]], statuses: ['pending'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Accept all' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
  },
}

/** The stamped proposal target renders above the cards, so an accept is
 *  auditable before it lands on that page. */
export const TargetLabel: Story = {
  args: { targetName: 'Garage → Woodworking Shop Renovation' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('→ Garage → Woodworking Shop Renovation')).toBeInTheDocument()
  },
}

/** Cross-page (ticket-30): the batch targets a page other than the open one, so an
 *  "open page" secondary action sits next to the target label. */
export const CrossPageOpenAction: Story = {
  args: { targetName: 'Ceramics Studio Plan', onOpenTarget: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('→ Ceramics Studio Plan')).toBeInTheDocument()
    const open = canvas.getByRole('button', { name: 'open page' })
    await userEvent.click(open)
    await expect(args.onOpenTarget).toHaveBeenCalledTimes(1)
  },
}

/** Inferred split (ticket-30): a change the model inferred as a side-effect is
 *  badged "Inferred" so the user decides it separately from the requested ones,
 *  and the group accept relabels to say it only takes the requested changes. */
export const InferredMarker: Story = {
  args: {
    changes: [changes[0], { ...changes[1], inferred: true }, changes[2]],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // Exactly one card carries the badge.
    await expect(canvas.getByText('Inferred')).toBeInTheDocument()
    // The group accept is scoped to requested changes — the copy says so — and
    // the inferred card keeps its own per-card Accept (all 3 still present).
    const acceptRequested = canvas.getByRole('button', { name: 'Accept requested' })
    await expect(canvas.queryByRole('button', { name: 'Accept all' })).not.toBeInTheDocument()
    await expect(canvas.getAllByRole('button', { name: 'Accept' })).toHaveLength(3)
    await userEvent.click(acceptRequested)
    await expect(args.onAcceptAll).toHaveBeenCalledTimes(1)
  },
}

/** Only inferred changes left pending: no group accept at all — each inferred
 *  card is its own decision (ticket-30 review must-fix 3). */
export const OnlyInferredPending: Story = {
  args: {
    changes: [changes[0], { ...changes[1], inferred: true }, { ...changes[2], inferred: true }],
    statuses: ['accepted', 'pending', 'pending'],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.queryByRole('button', { name: /Accept (all|requested)/ })
    ).not.toBeInTheDocument()
    // The inferred cards remain individually actionable.
    await expect(canvas.getAllByRole('button', { name: 'Accept' })).toHaveLength(2)
  },
}

/** Ticket-30 review must-fix 1: a batch whose target page no longer exists shows
 *  a notice instead of the target label; there is no "open page" to offer. */
export const TargetMissing: Story = {
  args: { targetName: '', targetMissing: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Target page not found — this proposal can’t be applied.')
    ).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'open page' })).not.toBeInTheDocument()
  },
}

/** All resolved: group bar gone, per-card status lines remain as an audit trail. */
export const AllResolved: Story = {
  args: { statuses: ['accepted', 'rejected', 'accepted'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Accept all' })).not.toBeInTheDocument()
    await expect(canvas.getAllByText('Accepted')).toHaveLength(2)
    await expect(canvas.getByText('Rejected')).toBeInTheDocument()
  },
}
