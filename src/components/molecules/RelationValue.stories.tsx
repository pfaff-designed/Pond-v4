import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { RelationValue } from './RelationValue'

/**
 * A relation value: linked pages as chips + a bespoke picker (#20 slice 4).
 * Presentational — value, titles, and candidates are injected.
 */
const meta = {
  title: 'Molecules/RelationValue',
  component: RelationValue,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-md bg-press-paper p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    onChange: fn(),
    onOpen: fn(),
    candidates: [
      { id: 'a', title: 'Alpha' },
      { id: 'b', title: 'Beta' },
      { id: 'c', title: 'Gamma' },
    ],
    titles: new Map([
      ['a', 'Alpha'],
      ['b', 'Beta'],
    ]),
  },
} satisfies Meta<typeof RelationValue>

export default meta
type Story = StoryObj<typeof meta>

/** Read-only host: chips render, but no × and no picker. */
export const ReadOnly: Story = {
  args: { value: ['a', 'b'], editable: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Alpha' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Beta' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Link a page' })).not.toBeInTheDocument()
    await expect(canvas.queryByLabelText('Remove Alpha')).not.toBeInTheDocument()
  },
}

/** Editable multi: pick an unlinked page → it's appended. */
export const AddLink: Story = {
  args: { value: ['a'], editable: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Link a page' }))
    // The already-linked page is not offered; the rest are.
    await expect(canvas.queryByRole('menuitem', { name: 'Alpha' })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Beta' }))
    await expect(args.onChange).toHaveBeenCalledWith(['a', 'b'])
  },
}

/** The filter narrows the candidate list. */
export const FilterCandidates: Story = {
  args: { value: [], editable: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Link a page' }))
    await userEvent.type(canvas.getByLabelText('Search pages to link'), 'gam')
    await expect(canvas.getByRole('menuitem', { name: 'Gamma' })).toBeInTheDocument()
    await expect(canvas.queryByRole('menuitem', { name: 'Alpha' })).not.toBeInTheDocument()
  },
}

/** A chip's × unlinks it. */
export const RemoveLink: Story = {
  args: { value: ['a', 'b'], editable: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByLabelText('Remove Alpha'))
    await expect(args.onChange).toHaveBeenCalledWith(['b'])
  },
}

/** single: selecting replaces the whole value (radio). */
export const SingleReplace: Story = {
  args: { value: ['a'], editable: true, single: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Link a page' }))
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Gamma' }))
    await expect(args.onChange).toHaveBeenCalledWith(['c'])
  },
}

/** An id with no resolved title renders as a faded "missing" chip. */
export const WithMissing: Story = {
  args: { value: ['a', 'gone'], editable: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Alpha' })).toBeInTheDocument()
    await expect(canvas.getByText('Missing page')).toBeInTheDocument()
  },
}
