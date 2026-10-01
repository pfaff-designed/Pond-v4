import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { ModuleDiffCard } from './ModuleDiffCard'
import type { ChangePreview } from '@/lib/modules/preview'

/** Board 6c frame 2: "move the electrician to the week of the 6th." */
const edit: ChangePreview = {
  op: 'edit',
  before: { id: 'b1', type: 'text', content: 'electrician — provisional, w/c 29 sep' },
  after: { id: '__preview__', type: 'text', content: 'electrician — confirmed, w/c 6 oct' },
}
const create: ChangePreview = {
  op: 'create',
  before: null,
  after: { id: '__preview__', type: 'text', content: 'worktop template — w/c 13 oct' },
}
const morph: ChangePreview = {
  op: 'edit',
  before: { id: 'a', type: 'text', content: 'The old paragraph that needs work.' },
  after: {
    id: '__preview__',
    type: 'todo',
    items: [
      { id: 'i1', label: 'Draft the outline', checked: false },
      { id: 'i2', label: 'Book the room', checked: false },
    ],
  },
}
const remove: ChangePreview = {
  op: 'remove',
  before: {
    id: 'm',
    type: 'table',
    title: 'Weekly mileage',
    columns: ['Week', 'Miles'],
    rows: [{ id: 'r1', cells: ['1', '38'] }],
  },
  after: null,
}

const meta = {
  title: 'Molecules/ModuleDiffCard',
  component: ModuleDiffCard,
  parameters: { layout: 'centered' },
  args: {
    changes: [edit, create],
    targetName: 'schedule',
    onAccept: fn(),
    onReject: fn(),
    onRequestChanges: fn(),
    onRevise: fn(),
    onAskAgain: fn(),
  },
} satisfies Meta<typeof ModuleDiffCard>

export default meta
type Story = StoryObj<typeof meta>

/** The board's card: one removal row (red), two addition rows (ink), three buttons. */
export const Proposed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/proposed edit — schedule/)).toBeInTheDocument()
    await expect(canvas.getByText('2 changes')).toBeInTheDocument()
    await expect(canvas.getByText('electrician — provisional, w/c 29 sep')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'accept' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'reject' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'request changes' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /accept all/ })).not.toBeInTheDocument()
  },
}

/** Type-morph edit: a text block becomes a todo — old text struck → new todo rows. */
export const TypeMorph: Story = {
  args: { changes: [morph] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('The old paragraph that needs work.')).toBeInTheDocument()
    await expect(canvas.getByText('Draft the outline')).toBeInTheDocument()
  },
}

/** Remove: the block being removed as a red removal row. */
export const Remove: Story = {
  args: { changes: [remove] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Weekly mileage')).toBeInTheDocument()
    await expect(canvas.getByText('1 change')).toBeInTheDocument()
  },
}

/** Accept fires once for the whole diff. */
export const AcceptFires: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'accept' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

/** Board 6c frame 3: request changes opens a note to pond under the card. */
export const RequestChanges: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'request changes' }))
    await expect(canvas.getByText('to pond')).toBeInTheDocument()
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'note to pond' }),
      "keep the electrician, but the worktop can't be the 13th"
    )
    await userEvent.click(canvas.getByRole('button', { name: 'send' }))
    await expect(args.onRequestChanges).toHaveBeenCalledTimes(1)
  },
}

/** Settled: changes requested, the note kept under the inert card. */
export const ChangesRequested: Story = {
  args: { status: 'changes_requested', note: 'keep the electrician, drop the worktop' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('changes requested')).toBeInTheDocument()
    await expect(canvas.getByText('keep the electrician, drop the worktop')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
  },
}

/** Pond's revision of an earlier card. */
export const Revised: Story = {
  args: { revised: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/revised edit — schedule/)).toBeInTheDocument()
  },
}

/** G2: the target was edited after the proposal — greyed, no accept, revise offered. */
export const Outdated: Story = {
  args: { status: 'outdated' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('outdated')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'revise' }))
    await expect(args.onRevise).toHaveBeenCalledTimes(1)
  },
}

/** Resolved (accepted): the card settles to inert with its status line. */
export const Accepted: Story = {
  args: { status: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('accepted')).toBeInTheDocument()
    const card = canvas.getByRole('group', { name: /proposed edit/ })
    await expect(card).toHaveClass('motion-resolve')
    await expect(card).toHaveClass('opacity-70')
  },
}

/** Board 6c frame 5: reject leaves one line, with ask again / show proposal. */
export const Rejected: Story = {
  args: { status: 'rejected' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('rejected — nothing changed')).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'show proposal' }))
    await expect(canvas.getByText('electrician — confirmed, w/c 6 oct')).toBeInTheDocument()
  },
}

/** The three statuses the log can hand a card without a click in this session. */
export const Withdrawn: Story = { args: { status: 'withdrawn' } }
export const Undone: Story = { args: { status: 'undone' } }
export const Reverted: Story = { args: { status: 'reverted' } }

/** "show original": the target as it stands, no diff marks, no red. */
export const ShowOriginal: Story = {
  args: { changes: [edit, remove, create] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'show original' }))
    await expect(canvas.getByText(/new block/)).toBeInTheDocument()
    await expect(canvas.queryByText('electrician — confirmed, w/c 6 oct')).not.toBeInTheDocument()
  },
}
