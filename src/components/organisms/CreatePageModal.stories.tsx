import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { CreatePageModalView, TOP_LEVEL_VALUE } from './CreatePageModal'

const PARENT_OPTIONS = [
  { id: 'health', title: 'Health' },
  { id: 'creativity', title: 'Creativity' },
  { id: 'wood-area', title: 'Woodworking (Creativity)' },
  { id: 'wood-proj', title: 'Woodworking (Personal › Projects)' },
]

const meta = {
  title: 'Organisms/CreatePageModal',
  component: CreatePageModalView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen bg-mn-surface">
        <Story />
      </div>
    ),
  ],
  args: {
    open: true,
    onOpenChange: fn(),
    title: '',
    onTitleChange: fn(),
    parentValue: TOP_LEVEL_VALUE,
    onParentChange: fn(),
    parentOptions: PARENT_OPTIONS,
    pondName: 'life',
    busy: false,
    error: null,
    onCreate: fn(),
  },
} satisfies Meta<typeof CreatePageModalView>

export default meta
type Story = StoryObj<typeof meta>

/** The resting dialog: title field + a "Save to" destination picker. The picker
 *  carries the AI save-path's disambiguated parent labels. */
export const Default: Story = {
  play: async ({ args }) => {
    // The popup renders through a portal, so query the whole document.
    const body = within(document.body)
    await expect(body.getByRole('dialog')).toBeInTheDocument()

    // Name-first: the title field holds focus the moment the dialog opens
    // (base-ui initialFocus) — the caret is already where you type.
    const titleInput = body.getByRole('textbox', { name: /page title/i })
    await waitFor(() => expect(titleInput).toHaveFocus())

    await userEvent.type(titleInput, 'Marathon Plan')
    await expect(args.onTitleChange).toHaveBeenCalled()

    // Duplicate "Woodworking" titles are disambiguated by their ancestor path.
    await expect(body.getByRole('option', { name: 'Woodworking (Creativity)' })).toBeInTheDocument()

    await userEvent.click(body.getByRole('button', { name: /create page/i }))
    await expect(args.onCreate).toHaveBeenCalled()
  },
}

/** A page is being created — the primary action shows progress and is disabled. */
export const Busy: Story = {
  args: { busy: true, title: 'Marathon Plan' },
  play: async () => {
    const body = within(document.body)
    await expect(body.getByRole('button', { name: /creating/i })).toBeDisabled()
  },
}

/** The destination defaulted to a specific parent (the current context). */
export const NestedDefault: Story = {
  args: { parentValue: 'health', title: 'Sleep Log' },
  play: async () => {
    const body = within(document.body)
    const select = body.getByRole('combobox', { name: /destination/i }) as HTMLSelectElement
    await expect(select.value).toBe('health')
  },
}
