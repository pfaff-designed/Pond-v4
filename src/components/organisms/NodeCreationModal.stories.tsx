import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, within } from 'storybook/test'

import { NodeCreationModal } from './NodeCreationModal'

// The modal calls useQueryClient; useChat stays idle until a message is sent,
// and Supabase is only touched on create — so the stories render without mocks.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

const meta = {
  title: 'Organisms/NodeCreationModal',
  component: NodeCreationModal,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  args: {
    isOpen: true,
    onClose: () => {},
    onCreated: () => {},
  },
} satisfies Meta<typeof NodeCreationModal>

export default meta
type Story = StoryObj<typeof meta>

/** Empty state — awaiting the user's description of what to create. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('dialog', { name: 'Create new node' })).toBeInTheDocument()
    await expect(
      canvas.getByPlaceholderText(/describe what you.d like to create/i)
    ).toBeInTheDocument()
  },
}

/** AI has proposed an entity (intent pre-loaded from a tool call) — shows the action card. */
export const WithActionCard: Story = {
  args: {
    intent: { type: 'project', name: 'Kitchen Renovation' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Kitchen Renovation')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Create' })).toBeInTheDocument()
  },
}
