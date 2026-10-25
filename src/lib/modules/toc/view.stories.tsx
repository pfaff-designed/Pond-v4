import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { TocView } from './view'
import { SiblingBlocksProvider } from '../sibling-context'
import { TOC_EMPTY_LINE } from './schema'
import type { Block } from '../content'

/**
 * The `toc` block (KAN-482) — a live list of the page's own headings, drawn in
 * the board's list card (the frame comes from `blockFrame`, not this view).
 * `TocView` reads its headings off `useSiblingBlocks()`, never its own `data`
 * (it stores none), so every story supplies them through
 * `SiblingBlocksProvider` rather than through args.
 */
const meta = {
  title: 'Modules/TableOfContents',
  component: TocView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TocView>

export default meta
type Story = StoryObj<typeof meta>

const flat: Block[] = [
  { id: 'h1', type: 'text', content: '# one' },
  { id: 'h2', type: 'text', content: '# two' },
  { id: 'h3', type: 'text', content: '# three' },
]

const nested: Block[] = [
  { id: 'h1', type: 'text', content: '# one' },
  { id: 'h2', type: 'text', content: '## two' },
  { id: 'h3', type: 'text', content: '### three' },
]

function withSiblings(blocks: Block[]) {
  function WithSiblings() {
    return (
      <SiblingBlocksProvider value={{ blocks }}>
        <TocView />
      </SiblingBlocksProvider>
    )
  }
  return WithSiblings
}

export const Filled: Story = {
  render: withSiblings(flat),
  play: async ({ canvasElement }) => {
    const rows = within(canvasElement).getAllByRole('button')
    await expect(rows.map((row) => row.textContent)).toEqual(['one', 'two', 'three'])
  },
}

/** Each level below the page's shallowest heading indents 14px (the board is silent). */
export const NestedLevels: Story = {
  render: withSiblings(nested),
  play: async ({ canvasElement }) => {
    const rows = within(canvasElement).getAllByRole('button')
    await expect(rows[0]).toHaveStyle({ paddingLeft: '0px' })
    await expect(rows[1]).toHaveStyle({ paddingLeft: '14px' })
    await expect(rows[2]).toHaveStyle({ paddingLeft: '28px' })
  },
}

export const Empty: Story = {
  render: withSiblings([]),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(TOC_EMPTY_LINE)).toBeInTheDocument()
    await expect(within(canvasElement).queryByRole('button')).not.toBeInTheDocument()
  },
}
