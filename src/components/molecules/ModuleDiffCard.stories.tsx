import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { ModuleDiffCard } from './ModuleDiffCard'
import type { Block } from '@/lib/documents/types'

const textBefore: Block = { id: 'a', type: 'text', content: 'The old paragraph that needs work.' }
const textAfter: Block = { id: 'a', type: 'text', content: 'The new, sharper paragraph.' }
const todoAfter: Block = {
  id: 'a',
  type: 'todo',
  items: [
    { id: 'i1', label: 'Draft the outline', checked: false },
    { id: 'i2', label: 'Book the room', checked: false },
  ],
}
const metricBefore: Block = {
  id: 'm',
  type: 'metric',
  label: 'Weekly mileage',
  value: 38,
  unit: 'mi',
}

const meta = {
  title: 'Molecules/ModuleDiffCard',
  component: ModuleDiffCard,
  parameters: { layout: 'centered' },
  args: {
    op: 'edit',
    before: textBefore,
    after: textAfter,
    onAccept: fn(),
    onReject: fn(),
    onEdit: fn(),
  },
} satisfies Meta<typeof ModuleDiffCard>

export default meta
type Story = StoryObj<typeof meta>

/** Create: no "before", the proposed content plus a New-content marker (text differ). */
export const Create: Story = {
  args: { op: 'create', before: null, after: textAfter, reason: 'A fresh note.' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('New content')).toBeInTheDocument()
    await expect(canvas.getByText('The new, sharper paragraph.')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
  },
}

/** Edit (same type): the text differ struck-through before + proposed after. */
export const Edit: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('The old paragraph that needs work.')).toBeInTheDocument()
    await expect(canvas.getByText('The new, sharper paragraph.')).toBeInTheDocument()
  },
}

/** Type-morph edit: a text block becomes a todo — old text (faded) → new todo rows. */
export const TypeMorph: Story = {
  args: { op: 'edit', before: textBefore, after: todoAfter },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('The old paragraph that needs work.')).toBeInTheDocument()
    await expect(canvas.getByText('Draft the outline')).toBeInTheDocument()
    await expect(canvas.getByText('Book the room')).toBeInTheDocument()
  },
}

/** Remove: the block being removed, shown faded via its read-only view. */
export const Remove: Story = {
  args: { op: 'remove', before: metricBefore, after: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Will be removed')).toBeInTheDocument()
    await expect(canvas.getByText('Weekly mileage')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
  },
}

/** Accept raises onAccept exactly once. */
export const AcceptFires: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Accept' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

/** Resolved (accepted): actions gone, status line remains for the audit trail. */
export const Accepted: Story = {
  args: { status: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Accepted')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
  },
}

/** Resolved (rejected): actions gone, rejected status line. */
export const Rejected: Story = {
  args: { status: 'rejected' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Rejected')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  },
}
