import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'

import { TextView } from './view'
import type { TextBlock } from './schema'

/**
 * The `text` content block (ticket-20) — rendered reading by default, click-to-edit
 * source. Read-only always typesets markdown; editable starts in the rendered view
 * and drops into a source textarea on click (extends the ticket-10 edit loop).
 */
const meta = {
  title: 'Modules/Text',
  component: TextView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TextView>

export default meta
type Story = StoryObj<typeof meta>

const sample: TextBlock = {
  id: 'txt-1',
  type: 'text',
  content: '## Warm-up\n\nStart with **light cardio**, then reach for the `foam roller`.',
}

/** Read-only: markdown is typeset, no literal syntax survives, no textarea. */
export const ReadOnly: Story = {
  args: { data: sample },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 2, name: 'Warm-up' })).toBeInTheDocument()
    await expect(canvas.getByText('light cardio').tagName).toBe('STRONG')
    await expect(canvasElement.textContent).not.toContain('## Warm-up')
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument()
  },
}

/** Stateful host so editable play tests exercise real onChange round-trips. */
function StatefulText({ data }: { data: TextBlock }) {
  const [state, setState] = useState(data)
  return <TextView data={state} editable onChange={setState} />
}

/** Editable: rendered by default; clicking opens the source textarea with content intact. */
export const ClickToEdit: Story = {
  args: { data: sample },
  render: (args) => <StatefulText data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Starts rendered — no textarea, markdown typeset.
    await expect(canvas.getByRole('heading', { level: 2, name: 'Warm-up' })).toBeInTheDocument()
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument()
    // Click drops into the source with full markdown intact and focused.
    await userEvent.click(canvas.getByRole('button', { name: 'Edit text block' }))
    const textarea = await canvas.findByRole('textbox')
    await expect(textarea).toHaveValue(sample.content)
    await waitFor(() => expect(textarea).toHaveFocus())
    // Typing extends the source, then blur returns to the rendered view.
    await userEvent.type(textarea, ' Go.')
    await expect(textarea).toHaveValue(sample.content + ' Go.')
    await userEvent.tab()
    await waitFor(() => expect(canvas.queryByRole('textbox')).not.toBeInTheDocument())
    await expect(canvas.getByText('foam roller').tagName).toBe('CODE')
  },
}

/** An empty editable block starts in edit mode so a freshly-added block is typeable. */
export const EmptyStartsEditing: Story = {
  args: { data: { id: 'txt-2', type: 'text', content: '' } as TextBlock },
  render: (args) => <StatefulText data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('textbox')).toBeInTheDocument()
  },
}
