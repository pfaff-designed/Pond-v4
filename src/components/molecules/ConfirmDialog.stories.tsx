import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'

import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog'

// The dialog is controlled; a tiny host keeps it open so the story renders the
// popup and the play fn can assert on its content / drive the actions.
function Harness(props: Partial<ConfirmDialogProps>) {
  const [open, setOpen] = useState(true)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title='Delete "Health"?'
      blastRadius="Deletes 3 pages inside."
      onConfirm={props.onConfirm ?? fn()}
      {...props}
      // keep the harness in charge of open so Cancel/Esc visibly close it
      // (onOpenChange from props would otherwise clobber this)
    />
  )
}

const meta = {
  title: 'Molecules/ConfirmDialog',
  component: ConfirmDialog,
  parameters: { layout: 'fullscreen' },
  render: (args) => <Harness {...args} />,
  args: {
    open: true,
    onOpenChange: fn(),
    title: 'Delete "Health"?',
    blastRadius: 'Deletes 3 pages inside.',
    onConfirm: fn(),
  },
} satisfies Meta<typeof ConfirmDialog>

export default meta
type Story = StoryObj<typeof meta>

/** Subtree delete — the dialog must state the real blast radius. */
export const Subtree: Story = {
  play: async ({ args }) => {
    // base-ui portals the popup to the body; query the whole document.
    const body = within(document.body)
    await expect(body.getByRole('alertdialog')).toBeInTheDocument()
    await expect(body.getByText('Deletes 3 pages inside.')).toBeInTheDocument()
    await expect(body.getByText('Delete "Health"?')).toBeInTheDocument()
    // confirming fires onConfirm
    await userEvent.click(body.getByRole('button', { name: 'Delete' }))
    await expect(args.onConfirm).toHaveBeenCalled()
  },
}

/** Single-child subtree — copy is singular. */
export const OneChild: Story = {
  args: { title: 'Delete "Trips"?', blastRadius: 'Deletes 1 page inside.' },
  play: async () => {
    const body = within(document.body)
    await expect(body.getByText('Deletes 1 page inside.')).toBeInTheDocument()
  },
}

/** Cancel closes without confirming. */
export const CancelCloses: Story = {
  play: async ({ args }) => {
    const body = within(document.body)
    await userEvent.click(body.getByRole('button', { name: 'Cancel' }))
    await expect(args.onConfirm).not.toHaveBeenCalled()
  },
}
