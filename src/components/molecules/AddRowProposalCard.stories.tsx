import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { AddRowProposalCard } from './AddRowProposalCard'

const meta = {
  title: 'Molecules/AddRowProposalCard',
  component: AddRowProposalCard,
  parameters: { layout: 'centered' },
  args: {
    title: 'Dune',
    props: {
      Author: 'Frank Herbert',
      Rating: 5,
      Status: 'Reading',
      'Finished on': '',
    },
    reason: 'A new entry for the reading list.',
    selectedTargetId: 'c-reading',
    targetOptions: [
      { id: 'c-reading', title: 'Reading List' },
      { id: 'c-films', title: 'Films to Watch' },
    ],
    onTargetChange: fn(),
    onAccept: fn(),
    onReject: fn(),
  },
} satisfies Meta<typeof AddRowProposalCard>

export default meta
type Story = StoryObj<typeof meta>

/** Pending: field count, the title, each provided value, the collection picker,
 *  and the actions. Empty values render as an em dash. */
export const Pending: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('New row · 4 fields')).toBeInTheDocument()
    await expect(canvas.getByText('Dune')).toBeInTheDocument()
    await expect(canvas.getByText('Frank Herbert')).toBeInTheDocument()
    await expect(canvas.getByText('Reading')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Add row' })).toBeInTheDocument()
    await expect(canvas.getByRole('combobox', { name: 'Target collection' })).toBeInTheDocument()
  },
}

/** Accept raises onAccept exactly once. */
export const AcceptFires: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add row' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

/** Changing the collection raises onTargetChange with the chosen id. */
export const PickTarget: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const select = canvas.getByRole('combobox', { name: 'Target collection' })
    await userEvent.selectOptions(select, 'c-films')
    await expect(args.onTargetChange).toHaveBeenCalledWith('c-films')
  },
}

/** The proposed collection is pre-selected; Accept fires with it intact. */
export const TargetPreselected: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const select = canvas.getByRole('combobox', {
      name: 'Target collection',
    }) as HTMLSelectElement
    await expect(select.value).toBe('c-reading')
    await userEvent.click(canvas.getByRole('button', { name: 'Add row' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

/** An untitled row shows a quiet placeholder rather than a blank line. */
export const Untitled: Story = {
  args: { title: '' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Untitled row')).toBeInTheDocument()
  },
}

/** Resolved (accepted): picker + actions gone, "Row added" status remains. */
export const Accepted: Story = {
  args: { status: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Row added')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Add row' })).not.toBeInTheDocument()
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
