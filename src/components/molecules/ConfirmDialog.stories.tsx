import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog'

// The dialog is controlled; this host ACTUALLY controls `open` — args are spread
// first and the harness's state overrides them, so Cancel/Esc visibly close the
// dialog in the story.
function Harness(props: ConfirmDialogProps) {
  const [open, setOpen] = useState(true)
  return <ConfirmDialog {...props} open={open} onOpenChange={setOpen} />
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
    // the default consequence line, unchanged for any caller that still hard-deletes.
    await expect(body.getByText("This can't be undone.")).toBeInTheDocument()
    // confirming fires onConfirm
    await userEvent.click(body.getByRole('button', { name: 'Delete' }))
    await expect(args.onConfirm).toHaveBeenCalled()
  },
}

/** A caller whose delete goes to trash, not permanent — e.g. Rail's page delete. */
export const TrashConsequence: Story = {
  args: {
    consequence: 'It stays in the trash for 30 days. Restore it from the change log.',
  },
  play: async () => {
    const body = within(document.body)
    await expect(
      body.getByText('It stays in the trash for 30 days. Restore it from the change log.')
    ).toBeInTheDocument()
    await expect(body.queryByText("This can't be undone.")).not.toBeInTheDocument()
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

/** Cancel visibly closes the dialog without confirming. */
export const CancelCloses: Story = {
  play: async ({ args }) => {
    const body = within(document.body)
    await userEvent.click(body.getByRole('button', { name: 'Cancel' }))
    await expect(args.onConfirm).not.toHaveBeenCalled()
    await waitFor(() => expect(body.queryByRole('alertdialog')).not.toBeInTheDocument())
  },
}
