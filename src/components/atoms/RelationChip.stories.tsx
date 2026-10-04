import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { RelationChip } from './RelationChip'

/**
 * RelationChip (#20) — the label renders THROUGH `<PondAtom kind="relation">`
 * (#93); this wrapper owns only the interaction (open / remove). A `missing`
 * target drops the atom into its error state, and the board pairs the two
 * halves: the label is STRUCK and there is no way to follow it.
 */

/** The chip's delegate atom — the label must come out of this, not the wrapper. */
const relationAtom = (root: ParentNode) =>
  root.querySelector<HTMLElement>('[data-kind="relation"]')!
/** The atom's text span, which carries the struck/faded error register. */
const label = (root: ParentNode) => root.querySelector<HTMLElement>('[data-part="text"]')!

const meta = {
  title: 'Atoms/RelationChip',
  component: RelationChip,
  parameters: { layout: 'centered' },
  args: {
    id: 'page-42',
    title: 'The Odyssey',
    onOpen: fn(),
  },
} satisfies Meta<typeof RelationChip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('The Odyssey')).toBeInTheDocument()

    // The title is delegated to a relation atom at rest, not drawn by the chip.
    const atom = relationAtom(canvasElement)
    await expect(atom).toBeInTheDocument()
    await expect(atom).toHaveAttribute('data-state', 'rest')
    await expect(label(atom)).toHaveTextContent('The Odyssey')

    // A present chip is a button that opens the linked page by id.
    await userEvent.click(canvas.getByRole('button'))
    await expect(args.onOpen).toHaveBeenCalledWith('page-42')
  },
}

export const Missing: Story = {
  args: { id: 'page-gone', title: undefined, missing: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // Faded placeholder label, and inert — no button, no open.
    await expect(canvas.getByText('Missing page')).toBeInTheDocument()
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
    await expect(args.onOpen).not.toHaveBeenCalled()

    // A missing target is the atom's ERROR state, and the pairing the board
    // draws is struck-AND-inert: clicking the struck label opens nothing.
    const atom = relationAtom(canvasElement)
    await expect(atom).toHaveAttribute('data-state', 'error')
    await expect(getComputedStyle(label(atom)).textDecorationLine).toBe('line-through')
    await userEvent.click(canvas.getByText('Missing page'))
    await expect(args.onOpen).not.toHaveBeenCalled()
  },
}

export const Removable: Story = {
  args: { onRemove: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // The title still opens the linked page…
    await userEvent.click(canvas.getByRole('button', { name: 'The Odyssey' }))
    await expect(args.onOpen).toHaveBeenCalledWith('page-42')
    // …and the × unlinks it.
    await userEvent.click(canvas.getByLabelText('Remove The Odyssey'))
    await expect(args.onRemove).toHaveBeenCalled()
  },
}

export const MissingRemovable: Story = {
  args: { id: 'page-gone', title: undefined, missing: true, onRemove: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Missing page')).toBeInTheDocument()

    // Struck and inert still hold once a × is present: the ONLY button in the
    // chip is the ×, and the struck label itself opens nothing.
    const atom = relationAtom(canvasElement)
    await expect(atom).toHaveAttribute('data-state', 'error')
    await expect(getComputedStyle(label(atom)).textDecorationLine).toBe('line-through')
    await expect(canvas.getAllByRole('button')).toHaveLength(1)
    await userEvent.click(canvas.getByText('Missing page'))
    await expect(args.onOpen).not.toHaveBeenCalled()

    // A missing chip can still be dropped via its ×.
    await userEvent.click(canvas.getByLabelText('Remove missing link'))
    await expect(args.onRemove).toHaveBeenCalled()
  },
}
