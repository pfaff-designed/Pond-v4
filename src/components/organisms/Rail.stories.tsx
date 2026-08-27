import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { RailView, type RailNode } from './Rail'

const node = (
  id: string,
  type: string,
  title: string,
  children: RailNode[] = [],
  order = 0
): RailNode => ({ id, parentId: null, type, title, order, children })

/** A small realistic tree: three areas (one nested), one free-floating leaf. */
const TREE: RailNode[] = [
  node('health', 'area', 'Health', [
    node('sleep', 'page', 'Sleep'),
    node('marathon', 'project', 'Marathon Training'),
  ]),
  node(
    'personal',
    'area',
    'Personal',
    [
      node('food', 'area', 'Food', [node('recipes', 'page', 'Recipes')]),
      node('trips', 'page', 'Trips'),
    ],
    1
  ),
  node('creativity', 'area', 'Creativity', [node('shelf', 'page', 'Walnut Shelf')], 2),
  node('scratch', 'page', 'Scratchpad', [], 3),
]

const meta = {
  title: 'Organisms/Rail',
  component: RailView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen bg-press-paper">
        <Story />
      </div>
    ),
  ],
  args: {
    tree: TREE,
    selectedId: null,
    expanded: new Set<string>(),
    busyId: null,
    isLoading: false,
    isEmpty: false,
    lifeActive: true,
    onLife: fn(),
    onSelect: fn(),
    onToggle: fn(),
    onAddChild: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof RailView>

export default meta
type Story = StoryObj<typeof meta>

/** Resting rail: all folders collapsed, Life active, children hidden. */
export const Resting: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Health')).toBeInTheDocument()
    await expect(canvas.getByText('Scratchpad')).toBeInTheDocument()
    // collapsed folder — children not rendered
    await expect(canvas.queryByText('Sleep')).not.toBeInTheDocument()
  },
}

/** An expanded area folder shows its leaves; a nested sub-area stays a folder. */
export const Expanded: Story = {
  args: { expanded: new Set(['health', 'personal']), selectedId: 'sleep' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sleep')).toBeInTheDocument()
    await expect(canvas.getByText('Trips')).toBeInTheDocument()
    // nested sub-area folder is itself collapsed
    await expect(canvas.queryByText('Recipes')).not.toBeInTheDocument()
  },
}

/** The caret toggles a folder without navigating; the name opens the page. */
export const Interactions: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Expand Health' }))
    await expect(args.onToggle).toHaveBeenCalledWith('health')
    await expect(args.onSelect).not.toHaveBeenCalled()

    await userEvent.click(canvas.getByRole('button', { name: 'Health' }))
    await expect(args.onSelect).toHaveBeenCalled()

    await userEvent.click(canvas.getByRole('button', { name: /^Life/ }))
    await expect(args.onLife).toHaveBeenCalled()
  },
}

/** Hover CRUD is present per row (revealed on hover; always in the a11y tree). */
export const HoverCrud: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Add sub-page to Health' }))
    await expect(args.onAddChild).toHaveBeenCalled()
    await userEvent.click(canvas.getByRole('button', { name: 'Delete Scratchpad' }))
    await expect(args.onDelete).toHaveBeenCalled()
  },
}

/** First-login states. */
export const Loading: Story = {
  args: { tree: [], isLoading: true },
}

export const Empty: Story = {
  args: { tree: [], isEmpty: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Setting up your workspace…')).toBeInTheDocument()
  },
}
