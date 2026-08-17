import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { CreatePageProposalCard, TOP_LEVEL_VALUE } from './CreatePageProposalCard'
import type { ModuleData } from '@/lib/modules/ai-composition'

const recipeBlocks: ModuleData[] = [
  { type: 'text', content: '# Lasagna\nA hearty weeknight classic.' },
  {
    type: 'todo',
    items: [
      { label: 'Brown the beef', checked: false },
      { label: 'Layer with pasta and cheese', checked: false },
    ],
  },
  { type: 'metric', label: 'Calories', value: 520, unit: 'kcal' },
]

const meta = {
  title: 'Molecules/CreatePageProposalCard',
  component: CreatePageProposalCard,
  parameters: { layout: 'centered' },
  args: {
    title: 'Lasagna',
    type: 'page',
    kind: 'recipe',
    blocks: recipeBlocks,
    reason: 'A recipe page to cook from.',
    selectedParentId: TOP_LEVEL_VALUE,
    parentOptions: [
      { id: 'p-personal', title: 'Personal' },
      { id: 'p-food', title: 'Food' },
    ],
    onParentChange: fn(),
    onAccept: fn(),
    onReject: fn(),
  },
} satisfies Meta<typeof CreatePageProposalCard>

export default meta
type Story = StoryObj<typeof meta>

/** Pending: title, kind tag, scaffolded blocks, destination picker, and actions. */
export const Pending: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Lasagna')).toBeInTheDocument()
    await expect(canvas.getByText('New page · recipe')).toBeInTheDocument()
    // Scaffolded block content is previewed read-only.
    await expect(canvas.getByText('Brown the beef')).toBeInTheDocument()
    await expect(canvas.getByText('Calories')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Create page' })).toBeInTheDocument()
    await expect(canvas.getByRole('combobox', { name: 'Destination' })).toBeInTheDocument()
  },
}

/** Accept raises onAccept exactly once. */
export const AcceptFires: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Create page' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

/** Changing the destination raises onParentChange with the chosen parent id. */
export const PickParent: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const select = canvas.getByRole('combobox', { name: 'Destination' })
    await userEvent.selectOptions(select, 'p-personal')
    await expect(args.onParentChange).toHaveBeenCalledWith('p-personal')
  },
}

/** A non-top-level parent is pre-selected (the AI's inferred placement) and Accept
 *  fires with that destination intact — the accept-with-parent path end to end. */
export const ParentPreselected: Story = {
  args: { selectedParentId: 'p-personal' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const select = canvas.getByRole('combobox', { name: 'Destination' }) as HTMLSelectElement
    await expect(select.value).toBe('p-personal')
    await userEvent.click(canvas.getByRole('button', { name: 'Create page' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

/** Structural type with no kind → the header falls back to the type tag. */
export const StructuralProject: Story = {
  args: {
    title: 'Website Redesign',
    type: 'project',
    kind: undefined,
    reason: undefined,
    blocks: [
      { type: 'text', content: '# Website Redesign' },
      {
        type: 'todo',
        items: [
          { label: 'Audit current site', checked: false },
          { label: 'Draft new IA', checked: false },
        ],
      },
      { type: 'metric-ring', label: 'Progress', sub: 'DONE', pct: 0.1 },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('New page · project')).toBeInTheDocument()
    await expect(canvas.getByText('Audit current site')).toBeInTheDocument()
  },
}

/** Resolved (accepted): picker + actions gone, "Page created" status remains. */
export const Accepted: Story = {
  args: { status: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Page created')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Create page' })).not.toBeInTheDocument()
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
