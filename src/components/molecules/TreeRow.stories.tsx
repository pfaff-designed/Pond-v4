import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { TreeRow } from './TreeRow'

const meta = {
  title: 'Molecules/TreeRow',
  component: TreeRow,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div role="tree" className="w-[250px] bg-press-paper p-2 font-sans">
        <Story />
      </div>
    ),
  ],
  args: {
    id: 'health',
    title: 'Health',
    depth: 1,
    isFolder: true,
    isExpanded: false,
    isSelected: false,
    isOnPath: false,
    isFocused: false,
    isBusy: false,
    accent: '#5f7355',
    onSelect: fn(),
    onToggle: fn(),
    onAddChild: fn(),
    onDelete: fn(),
    onFocus: fn(),
    onKeyDown: fn(),
  },
} satisfies Meta<typeof TreeRow>

export default meta
type Story = StoryObj<typeof meta>

/** A collapsed area folder — caret closed, sage dot, resting tone. */
export const AreaFolder: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('treeitem')
    await expect(row).toHaveAttribute('aria-expanded', 'false')
    await expect(row).toHaveAttribute('aria-level', '2')
  },
}

/** An expanded folder announces itself open to assistive tech. */
export const Expanded: Story = {
  args: { isExpanded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('treeitem')).toHaveAttribute('aria-expanded', 'true')
  },
}

/** A leaf page — no caret, deeper indent, no dot. */
export const Leaf: Story = {
  args: {
    id: 'recipes',
    title: 'Ceramics Studio Plan',
    depth: 3,
    isFolder: false,
    accent: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('treeitem')
    // a leaf has no expand state
    await expect(row).not.toHaveAttribute('aria-expanded')
    await expect(row).toHaveAttribute('aria-level', '4')
  },
}

/** The selected row — the "you are here" treatment. */
export const Selected: Story = {
  args: { isSelected: true, isFocused: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('treeitem')).toHaveAttribute('aria-selected', 'true')
  },
}

/** An ancestor of the selection — raised on-path tone (ticket-25). */
export const OnPath: Story = {
  args: { isOnPath: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('treeitem')).toHaveAttribute('data-on-path')
  },
}

/** The Life root — depth 0, no caret spacer offset, no ＋/× affordances. */
export const Root: Story = {
  args: {
    id: 'life',
    title: 'Life',
    depth: 0,
    isRoot: true,
    isFolder: true,
    isExpanded: true,
    accent: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // root can't be deleted or added to
    await expect(canvas.queryByRole('button', { name: /Delete Life/ })).not.toBeInTheDocument()
    await expect(
      canvas.queryByRole('button', { name: /Add sub-page to Life/ })
    ).not.toBeInTheDocument()
  },
}

/** Caret toggles the folder; the label opens the page — the two are distinct. */
export const CaretVsLabel: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('treeitem')

    // caret click toggles, does not open
    const caret = row.querySelector('svg')?.closest('button') as HTMLButtonElement
    await userEvent.click(caret)
    await expect(args.onToggle).toHaveBeenCalledWith('health')
    await expect(args.onSelect).not.toHaveBeenCalled()

    // label click opens, does not toggle
    await userEvent.click(canvas.getByText('Health'))
    await expect(args.onSelect).toHaveBeenCalledWith('health')
  },
}

/** Hover CRUD fires add / delete for the row (revealed on hover / focus). */
export const HoverCrud: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add sub-page to Health' }))
    await expect(args.onAddChild).toHaveBeenCalledWith('health')
    await userEvent.click(canvas.getByRole('button', { name: 'Delete Health' }))
    await expect(args.onDelete).toHaveBeenCalledWith('health')
  },
}

/**
 * Keyboard: the focused row is the single roving tab stop and its key events
 * bubble to the container's arrow-key handler (APG tree). Pressing an arrow key
 * on the row calls back with the key so the container can move focus / toggle.
 */
export const KeyboardNav: Story = {
  args: { isFocused: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('treeitem')
    // the focused row is the tab stop
    await expect(row).toHaveAttribute('tabindex', '0')
    row.focus()
    await userEvent.keyboard('{ArrowDown}')
    await expect(args.onKeyDown).toHaveBeenCalled()
    const [passedId, event] = (args.onKeyDown as ReturnType<typeof fn>).mock.calls.at(-1)!
    await expect(passedId).toBe('health')
    await expect((event as KeyboardEvent).key).toBe('ArrowDown')
  },
}
