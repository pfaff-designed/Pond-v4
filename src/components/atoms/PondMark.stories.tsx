import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor } from 'storybook/test'

import { PondMark } from './PondMark'
import { LIFE_GLYPH } from '@/lib/rail/area-glyph'

/**
 * The pond's own mark (#96): the pond glyph as a plain mask over `currentColor`
 * — 13 at the rail head, 12 leading the breadcrumb pill. One component at the
 * two measured sizes, never an AreaMark (the pond is not an area).
 */
const meta = {
  title: 'Atoms/PondMark',
  component: PondMark,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof PondMark>

export default meta
type Story = StoryObj<typeof meta>

/** The two sizes the shell draws, side by side, inheriting the text colour. */
export const TwoSizes: Story = {
  render: () => (
    <div className="flex items-center gap-4 text-foreground">
      <PondMark size={13} />
      <PondMark size={12} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const marks = canvasElement.querySelectorAll<HTMLElement>('[data-pond-mark]')
    await expect(marks).toHaveLength(2)
    const glyphs = canvasElement.querySelectorAll<HTMLElement>(`[data-icon="${LIFE_GLYPH}"]`)
    await expect(glyphs).toHaveLength(2)
    await expect(glyphs[0]).toHaveStyle({ width: '13px', height: '13px' })
    await expect(glyphs[1]).toHaveStyle({ width: '12px', height: '12px' })
    // a plain mask glyph in currentColor — not an area mark, no hue of its own
    await expect(canvasElement.querySelector('[data-area-mark]')).toBeNull()
    await waitFor(() => expect(glyphs[0].style.mask).toContain('data:'))
    await expect(glyphs[0].style.background).toBe('currentcolor')
  },
}
