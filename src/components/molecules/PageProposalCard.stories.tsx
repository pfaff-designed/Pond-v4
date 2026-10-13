import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { PageProposalCard } from './PageProposalCard'

/**
 * `Pond 06.01` 6a frame 4 — the `new page — proposed` card inside the composer.
 * Rendered over the composer's glass so the pane reads as the frame does.
 */
const meta = {
  title: 'Molecules/PageProposalCard',
  component: PageProposalCard,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="mn-glass w-[508px] rounded-mn-card p-3">
        <Story />
      </div>
    ),
  ],
  args: {
    name: 'renovation blockers',
    parentId: 'kr',
    kind: 'page',
    status: 'proposed',
    parentOptions: [
      { id: 'cre', title: 'creativity' },
      { id: 'kr', title: 'creativity › kitchen renovation' },
      { id: 'bud', title: 'budget' },
    ],
    onNameChange: fn(),
    onParentChange: fn(),
    onKindChange: fn(),
    onMakePage: fn(),
    onCancel: fn(),
    onOpenPage: fn(),
  },
} satisfies Meta<typeof PageProposalCard>

export default meta
type Story = StoryObj<typeof meta>

/** Pending: the eyebrow, "3 fields", three editable rows, three controls. */
export const Proposed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('new page — proposed')).toBeInTheDocument()
    await expect(canvas.getByText('3 fields')).toBeInTheDocument()
    await expect(canvas.getByRole('textbox', { name: 'name' })).toHaveValue('renovation blockers')
    await expect(canvas.getByRole('combobox', { name: 'under' })).toHaveValue('kr')
    await expect(canvas.getByRole('textbox', { name: 'kind' })).toHaveValue('page')
    await expect(canvas.getByRole('button', { name: 'make page' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'change place' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'cancel' })).toBeInTheDocument()
    await expect(canvas.queryByText(/keep as note/i)).not.toBeInTheDocument()
  },
}

/** make page raises onMakePage once; cancel raises onCancel. */
export const Controls: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'make page' }))
    await expect(args.onMakePage).toHaveBeenCalledTimes(1)
    await userEvent.click(canvas.getByRole('button', { name: 'cancel' }))
    await expect(args.onCancel).toHaveBeenCalledTimes(1)
  },
}

/** Each field shows every keystroke at once, and commits on blur. */
export const Editing: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('textbox', { name: 'kind' }), '!')
    await expect(args.onKindChange).not.toHaveBeenCalled()
    await userEvent.tab()
    await expect(args.onKindChange).toHaveBeenCalledWith('page!')
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'under' }), 'bud')
    await expect(args.onParentChange).toHaveBeenCalledWith('bud')
  },
}

/** The place was deleted between proposal and make page. */
export const PlaceGone: Story = {
  args: { parentId: null, error: 'that place was deleted — pick another' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(/deleted/)
    await expect(canvas.getByRole('combobox', { name: 'under' })).toHaveValue('')
  },
}

/** A very long proposed name stays inside the field. */
export const LongName: Story = {
  args: {
    name: 'everything the renovation is waiting on before the worktop template can be booked and the electrician can hold the week',
  },
}

/** After make page: the quiet receipt with an open chip. */
export const Made: Story = {
  args: { status: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('page made')).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'open renovation blockers' })
    ).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'make page' })).not.toBeInTheDocument()
  },
}
