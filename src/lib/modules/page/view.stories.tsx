import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { PageView } from './view'
import { samplePage as page } from './sample'
import type { PageModule } from './schema'
import type { Block } from '../content'
import { blockDomId } from '../block-dom'

/**
 * The `page` container rendering a mixed block list — text, todo, table and an image —
 * entirely through the registry (recursive composition, t12 §6). No block type is
 * hard-coded in the container, so these stories are the registry-dispatch guard:
 * every child type reaches its view, an unregistered type renders nothing (t12 §2 —
 * no read-side validation, a stale persisted block must never hard-fail a page
 * load), and `editable` is a host-passed prop that the container threads down.
 */
const meta = {
  title: 'Modules/Page',
  component: PageView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PageView>

export default meta
type Story = StoryObj<typeof meta>

const INK = 'rgb(27, 29, 20)' // #1B1D14
const PAPER = 'rgb(250, 249, 239)' // #FAF9EF

const blockEl = (root: HTMLElement, id: string) =>
  root.querySelector<HTMLElement>(`#${blockDomId(id)}`)!

/** Read-only: every child type reaches its view through the registry. */
export const ReadOnly: Story = {
  args: { data: page },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Marathon Training')).toBeInTheDocument()
    await expect(
      canvas.getByText('Base build week — hold easy pace on the long run.')
    ).toBeInTheDocument()
    // Both todo items, not just the first — a child view that drops rows would
    // otherwise pass on the heading alone.
    await expect(canvas.getByText('Long run')).toBeInTheDocument()
    await expect(canvas.getByText('Recovery swim')).toBeInTheDocument()
    await expect(canvas.getByText('Weekly mileage')).toBeInTheDocument()
    await expect(canvas.getByText('The long-run route')).toBeInTheDocument()
    // One wrapper per block, in the persisted order.
    for (const block of page.blocks) {
      await expect(blockEl(canvasElement, block.id)).toBeInTheDocument()
    }
  },
}

/**
 * #219 — a read-only page is inert BUT still announced. The check rows are spans
 * wearing `role="checkbox"` with `aria-readonly`, because a done step must read as
 * checked to assistive tech even though its strike is CSS-only. Clicking emits
 * nothing: without `editable`, the container passes no working editor down.
 */
export const ReadOnlyIsInertButAnnounced: Story = {
  args: { data: page, onChange: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const boxes = canvas.getAllByRole('checkbox')
    await expect(boxes).toHaveLength(2)
    for (const box of boxes) {
      await expect(box.tagName).toBe('SPAN')
      await expect(box).toHaveAttribute('aria-readonly', 'true')
    }
    await expect(boxes[0]).toHaveAttribute('aria-checked', 'true')
    await expect(boxes[1]).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(boxes[1])
    await expect(canvas.getAllByRole('checkbox')[1]).toHaveAttribute('aria-checked', 'false')
    await expect(args.onChange).not.toHaveBeenCalled()
  },
}

/** Stateful host so the editable play exercises a real onChange round-trip. */
function Stateful({ data }: { data: PageModule }) {
  const [state, setState] = useState(data)
  return <PageView data={state} editable onChange={setState} />
}

/**
 * Editable: the container replaces the ONE child it was handed a new state for and
 * leaves its siblings byte-identical (full-state onChange, no ops). The untouched
 * sibling item is the assertion that matters — a merge that rebuilt the list from
 * the event would silently reset it.
 */
export const Editable: Story = {
  args: { data: page, editable: true },
  render: (args) => <Stateful data={args.data as PageModule} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const boxes = canvas.getAllByRole('checkbox')
    await expect(boxes).toHaveLength(2)
    await expect(boxes[0]).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(boxes[1])
    const after = canvas.getAllByRole('checkbox')
    await expect(after[1]).toHaveAttribute('aria-checked', 'true')
    // The item nobody touched keeps its state…
    await expect(after[0]).toHaveAttribute('aria-checked', 'true')
    // …and so do the sibling blocks: the text, table and image are untouched.
    await expect(
      canvas.getByText('Base build week — hold easy pace on the long run.')
    ).toBeInTheDocument()
    await expect(canvas.getByText('Weekly mileage')).toBeInTheDocument()
    await expect(canvas.getByText('The long-run route')).toBeInTheDocument()
  },
}

/**
 * t12 §2 — a block whose `type` is not in the registry renders NOTHING rather than
 * throwing: a stale persisted block must never hard-fail a page load. And it leaves
 * no trace — the wrapper collapses to zero height, so the stack shows no phantom
 * gap where the dead block was.
 */
export const UnregisteredBlock: Story = {
  args: {
    data: {
      ...page,
      blocks: [page.blocks[0], { id: 'stale', type: 'gantt' } as unknown as Block, page.blocks[1]],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The siblings on either side still render — the page did not fail to load.
    await expect(
      canvas.getByText('Base build week — hold easy pace on the long run.')
    ).toBeInTheDocument()
    await expect(canvas.getByText('Long run')).toBeInTheDocument()
    const stale = blockEl(canvasElement, 'stale')
    await expect(stale).toBeInTheDocument()
    await expect(stale).toBeEmptyDOMElement()
    await expect(stale.getBoundingClientRect().height).toBe(0)
  },
}

/** The dark role flip: the registry's children read on ink, not just on paper. */
export const ReadOnlyDark: Story = {
  args: { data: page },
  decorators: [
    (Story) => (
      <div className="dark bg-raw-ink p-mn-6">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const title = canvas.getByText('Marathon Training')
    // Paper carries the prose on ink ground: the `.dark` role flip, read off the
    // computed value against the board literal — not the class name, which is the
    // same `text-mn-text` in both themes (#252 shipped the right class at the
    // wrong tier).
    await expect(getComputedStyle(title).color).toBe(PAPER)
    await expect(getComputedStyle(title).color).not.toBe(INK)
    await expect(canvas.getByText('Recovery swim')).toBeInTheDocument()
    await expect(canvas.getByText('Weekly mileage')).toBeInTheDocument()
  },
}
