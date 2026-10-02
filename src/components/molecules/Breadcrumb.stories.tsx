import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { Breadcrumb } from './Breadcrumb'

const meta = {
  title: 'Molecules/Breadcrumb',
  component: Breadcrumb,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-2xl bg-mn-surface p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    crumbs: [
      { id: 'health', type: 'page', title: 'Health' },
      { id: 'routines', type: 'page', title: 'Workout Routines' },
    ],
    current: '3-Day Full-Body Routine',
    onNavigate: fn(),
  },
} satisfies Meta<typeof Breadcrumb>

export default meta
type Story = StoryObj<typeof meta>

/** Full trail: life › Health › Workout Routines › current. Ancestors navigate. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // The root crumb is lowercase, as `Pond 06.10` draws the whole pill.
    await expect(canvas.getByText('life')).toBeInTheDocument()
    await expect(canvas.queryByText('Life')).toBeNull()
    await expect(canvas.getByText('3-Day Full-Body Routine')).toBeInTheDocument()

    // life navigates to the root (null)
    await userEvent.click(canvas.getByText('life'))
    await expect(args.onNavigate).toHaveBeenCalledWith(null)

    // an ancestor crumb navigates with the whole crumb (id + type + title)
    await userEvent.click(canvas.getByText('Health'))
    await expect(args.onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'health', type: 'page' })
    )
  },
}

/** The current node is not a link — clicking it navigates nowhere at all. */
export const CurrentIsNotClickable: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const current = canvas.getByText('3-Day Full-Body Routine')
    await userEvent.click(current)
    await expect(args.onNavigate).not.toHaveBeenCalled()
    await expect(current).toHaveAttribute('aria-current', 'page')
  },
}

/**
 * Editor variant: no `current` tail (the title input owns the tail), so the
 * breadcrumb shows only the ancestor path.
 */
export const AncestorPathOnly: Story = {
  args: { current: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Workout Routines')).toBeInTheDocument()
    await expect(canvas.queryByText('3-Day Full-Body Routine')).not.toBeInTheDocument()
  },
}

/** A root page: just "life", still a home affordance. */
export const RootOnly: Story = {
  args: { crumbs: [], current: undefined },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('life'))
    await expect(args.onNavigate).toHaveBeenCalledWith(null)
  },
}

/**
 * The pond's SECOND root (#101 review / ADR 0003 / 3c): a page under `databases`
 * starts its trail AT databases — no "life" ahead of it — and that root crumb is
 * the real page, so a click opens it rather than the root page.
 */
export const DatabasesRoot: Story = {
  args: {
    root: { id: 'root-db', type: 'page', title: 'databases' },
    crumbs: [],
    current: 'ingredients',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('databases')).toBeInTheDocument()
    await expect(canvas.queryByText('life')).toBeNull()

    await userEvent.click(canvas.getByText('databases'))
    await expect(args.onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'root-db', title: 'databases' })
    )
  },
}

/**
 * #96 / ADR 0002: with `onCommandK` the pill ends in a hairline and the ⌘K
 * chip — the shell's one palette affordance. `Pond 05 Shell` (measured): the
 * pill is 40px tall, radius 999, glass; the chip 4px 9px on the hover fill.
 */
export const WithCommandK: Story = {
  args: { onCommandK: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const nav = canvas.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(nav).toHaveClass('mn-glass')
    await expect(nav).toHaveClass('rounded-mn-pill')
    await expect(nav.getBoundingClientRect().height).toBe(40)
    await expect(nav.querySelector('[data-pond-mark] [data-icon]')).toHaveStyle({ width: '12px' })
    const chip = canvas.getByRole('button', { name: 'Command palette (⌘K)' })
    await expect(chip).toHaveTextContent('⌘K')
    await userEvent.click(chip)
    await expect(args.onCommandK).toHaveBeenCalledTimes(1)
  },
}

/** Without `onCommandK` there is no chip and no hairline — nothing dead in the pill. */
export const WithoutCommandK: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Command palette (⌘K)' })).toBeNull()
  },
}

/**
 * An editable tail (ticket-26): a `tail` node renders inside the
 * pill in place of `current`, so a rename happens in the trail itself.
 */
export const EditableTail: Story = {
  args: {
    current: undefined,
    tail: <input aria-label="Rename page" defaultValue="3-Day Full-Body Routine" />,
    onCommandK: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const nav = canvas.getByRole('navigation', { name: 'Breadcrumb' })
    const field = within(nav).getByRole('textbox', { name: 'Rename page' })
    await expect(field).toHaveValue('3-Day Full-Body Routine')
    // the static tail is gone — the field IS the tail
    await expect(canvas.queryByText('3-Day Full-Body Routine')).toBeNull()
    await userEvent.clear(field)
    await userEvent.type(field, 'Push day')
    await expect(field).toHaveValue('Push day')
  },
}
