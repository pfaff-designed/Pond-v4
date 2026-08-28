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
    lifeExpanded: true,
    busyId: null,
    isLoading: false,
    isEmpty: false,
    focusedId: null,
    onSelect: fn(),
    onToggle: fn(),
    onAddChild: fn(),
    onDelete: fn(),
    onLife: fn(),
    onToggleLife: fn(),
    onFocusRow: fn(),
    onKeyDown: fn(),
  },
} satisfies Meta<typeof RailView>

export default meta
type Story = StoryObj<typeof meta>

/** Resting rail: Life root open, area folders collapsed, children hidden. */
export const Resting: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Life is the root treeitem, and the whole thing is one tree.
    await expect(canvas.getByRole('tree', { name: 'Workspace' })).toBeInTheDocument()
    await expect(canvas.getByText('Life')).toBeInTheDocument()
    await expect(canvas.getByText('Health')).toBeInTheDocument()
    await expect(canvas.getByText('Scratchpad')).toBeInTheDocument()
    // collapsed folder — children not rendered
    await expect(canvas.queryByText('Sleep')).not.toBeInTheDocument()
  },
}

/** Collapsing the Life root hides the entire tree beneath it. */
export const LifeCollapsed: Story = {
  args: { lifeExpanded: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Life')).toBeInTheDocument()
    // everything under Life is hidden
    await expect(canvas.queryByText('Health')).not.toBeInTheDocument()
    await expect(canvas.queryByText('Scratchpad')).not.toBeInTheDocument()
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

/**
 * The trail to the current node (ticket-25): ancestors of the selection carry
 * the raised on-path tone (data-on-path) so "you are here" reads in the rail;
 * the selected row and off-path rows don't.
 */
export const PathToSelection: Story = {
  args: {
    expanded: new Set(['personal', 'food']),
    selectedId: 'recipes',
    pathIds: new Set(['personal', 'food']),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('treeitem', { name: /Personal/ })).toHaveAttribute('data-on-path')
    await expect(canvas.getByRole('treeitem', { name: /Food/ })).toHaveAttribute('data-on-path')
    // the selected row itself uses the selected treatment, not the path tone
    await expect(canvas.getByRole('treeitem', { name: /Recipes/ })).not.toHaveAttribute(
      'data-on-path'
    )
    // an area off the path stays at resting tone
    await expect(canvas.getByRole('treeitem', { name: /Health/ })).not.toHaveAttribute(
      'data-on-path'
    )
  },
}

/** The caret toggles a folder without navigating; the name opens the page. */
export const Interactions: Story = {
  play: async ({ canvas, args }) => {
    // caret click on Health toggles, does not open
    const health = canvas.getByRole('treeitem', { name: /Health/ })
    const caret = health.querySelector('svg')?.closest('button') as HTMLButtonElement
    await userEvent.click(caret)
    await expect(args.onToggle).toHaveBeenCalledWith('health')
    await expect(args.onSelect).not.toHaveBeenCalled()

    await userEvent.click(canvas.getByText('Health'))
    await expect(args.onSelect).toHaveBeenCalledWith('health')

    // Life label opens the root overview
    await userEvent.click(canvas.getByText('Life'))
    await expect(args.onLife).toHaveBeenCalled()
  },
}

/** The Life root's caret is a collapse-all / expand-all for the whole tree. */
export const LifeCaretCollapsesAll: Story = {
  play: async ({ canvas, args }) => {
    const life = canvas.getByRole('treeitem', { name: /Life/ })
    const caret = life.querySelector('svg')?.closest('button') as HTMLButtonElement
    await userEvent.click(caret)
    await expect(args.onToggleLife).toHaveBeenCalled()
  },
}

/** Hover CRUD is present per row (revealed on hover; always in the a11y tree). */
export const HoverCrud: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Add sub-page to Health' }))
    await expect(args.onAddChild).toHaveBeenCalledWith('health')
    await userEvent.click(canvas.getByRole('button', { name: 'Delete Scratchpad' }))
    await expect(args.onDelete).toHaveBeenCalledWith('scratch')
    // the Life root has no CRUD affordances
    await expect(canvas.queryByRole('button', { name: /Delete Life/ })).not.toBeInTheDocument()
  },
}

/**
 * Keyboard nav (WAI-ARIA tree): a single roving tab stop; arrow keys move it.
 * The focused row is the one tabbable treeitem; pressing an arrow raises the
 * key to the container's handler.
 */
export const KeyboardNav: Story = {
  args: { focusedId: 'health' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const health = canvas.getByRole('treeitem', { name: /Health/ })
    // exactly the focused row is the tab stop
    await expect(health).toHaveAttribute('tabindex', '0')
    await expect(canvas.getByRole('treeitem', { name: /Scratchpad/ })).toHaveAttribute(
      'tabindex',
      '-1'
    )
    health.focus()
    await userEvent.keyboard('{ArrowDown}')
    await expect(args.onKeyDown).toHaveBeenCalled()
    const [, event] = (args.onKeyDown as ReturnType<typeof fn>).mock.calls.at(-1)!
    await expect((event as KeyboardEvent).key).toBe('ArrowDown')
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
