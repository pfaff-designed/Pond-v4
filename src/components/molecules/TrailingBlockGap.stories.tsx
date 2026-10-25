import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { TrailingBlockGap } from './TrailingBlockGap'
import { PageCanvas } from '@/lib/modules/page-canvas'
import { PAGE_COLUMN_FILL_CLASS, useSurfaceColumn } from '@/lib/layout/surface-column'

/**
 * KAN-498's real-layout proof: jsdom can't measure (scrollHeight/clientHeight
 * are always 0 there), so this renders the actual page-canvas scroller and a
 * column built from the same `useSurfaceColumn` + `PAGE_COLUMN_FILL_CLASS`
 * DocumentPanel uses, with the real `TrailingBlockGap` as its last flex
 * child — not BlockCanvas/DocumentPanel, whose mocks are heavy and which no
 * other story renders either.
 */

function Page({
  blockCount,
  blockHeightPx,
  onClick,
}: {
  blockCount: number
  blockHeightPx: number
  onClick: () => void
}) {
  const { column } = useSurfaceColumn(680)
  return (
    <PageCanvas className="h-[720px] w-[1000px] overflow-y-auto">
      <div
        data-testid="page-column"
        className={`${column.className} ${PAGE_COLUMN_FILL_CLASS}`}
        style={column.style}
      >
        <div className="h-10" data-testid="title-row" />
        <div data-testid="block-list">
          {Array.from({ length: blockCount }, (_, i) => (
            <div key={i} style={{ height: blockHeightPx }} />
          ))}
        </div>
        <TrailingBlockGap onClick={onClick} />
      </div>
    </PageCanvas>
  )
}

const meta = {
  title: 'Molecules/TrailingBlockGap',
  component: TrailingBlockGap,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TrailingBlockGap>

export default meta
type Story = StoryObj<typeof meta>

/** A two-block page: the column is at least the canvas height, so the gap
 *  fills all the way to it — a short page never scrolls, and a click near
 *  the gap's very bottom edge still lands on it. */
export const ShortPageDoesNotScroll: Story = {
  args: { onClick: fn() },
  render: (args) => <Page blockCount={2} blockHeightPx={60} onClick={args.onClick} />,
  play: async ({ args, canvasElement }) => {
    const scroller = canvasElement.querySelector<HTMLElement>('[data-part="page-canvas"]')!
    await expect(scroller.scrollHeight).toBe(scroller.clientHeight)

    const column = within(canvasElement).getByTestId('page-column')
    const gap = within(canvasElement).getByTestId('trailing-block-gap')
    const columnBottom = column.getBoundingClientRect().bottom
    const paddingBottom = parseFloat(getComputedStyle(column).paddingBottom)
    const diff = Math.abs(gap.getBoundingClientRect().bottom - (columnBottom - paddingBottom))
    await expect(diff).toBeLessThanOrEqual(1)

    const gapRect = gap.getBoundingClientRect()
    const hit = document.elementFromPoint(gapRect.left + 10, gapRect.bottom - 2)
    await expect(gap.contains(hit)).toBe(true)
    await userEvent.click(hit as Element)
    await expect(args.onClick).toHaveBeenCalledTimes(1)

    await expect(scroller.scrollTop).toBe(0)
  },
}

/** A long page (40 tall blocks): it scrolls, and the gap stops shrinking at
 *  its 80px floor (`min-h-20`) rather than being squeezed away. */
export const LongPageScrollsAndTheGapHitsItsFloor: Story = {
  args: { onClick: fn() },
  render: (args) => <Page blockCount={40} blockHeightPx={60} onClick={args.onClick} />,
  play: async ({ canvasElement }) => {
    const scroller = canvasElement.querySelector<HTMLElement>('[data-part="page-canvas"]')!
    await expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight)

    const gap = within(canvasElement).getByTestId('trailing-block-gap')
    await expect(Math.round(gap.getBoundingClientRect().height)).toBe(80)
  },
}
