import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'

import { Icon } from './Icon'
import { LIFE_GLYPH, areaGlyph } from '@/lib/rail/area-glyph'

/**
 * The Make Noise glyph atom (#91): a PNG silhouette from `public/icons/`
 * (served by Storybook's `staticDirs`) applied as a data-URI CSS mask over
 * `background: currentColor`. These play tests run in real Chromium, which is
 * where `-webkit-mask` can be asserted — jsdom's cssstyle drops vendor-prefixed
 * properties, so the jest spec only covers `mask`.
 */
const meta = {
  title: 'Atoms/Icon',
  component: Icon,
  parameters: { layout: 'centered' },
  args: { name: 'star-01', size: 32 },
} satisfies Meta<typeof Icon>

export default meta
type Story = StoryObj<typeof meta>

/** Pull the painted glyph span; waits for the async data-URI to land. */
async function paintedGlyph(canvasElement: HTMLElement, name: string) {
  const el = canvasElement.querySelector<HTMLElement>(`[data-icon="${name}"]`)!
  // 5s, not waitFor's 1s default. Each glyph is fetched and base64-decoded before
  // the mask is set, and `AreaDefaults` waits on six of them; under the full
  // `test-storybook` run (63 story files in parallel) 1s is not enough margin and
  // this went red as `expected '' to contain 'data:'` while passing in isolation.
  await waitFor(() => expect(el.style.mask).toContain('data:'), { timeout: 5000 })
  return el
}

/** A single glyph, masked over the inherited ink. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const el = await paintedGlyph(canvasElement, 'star-01')
    // Both the standard and the WebKit-prefixed mask carry the data-URI, and the
    // ground is currentColor — a solid square would mean the mask failed.
    // (Chromium re-serialises the shorthand's order, so match the parts.)
    await expect(el.style.mask).toMatch(/^url\("data:image\/png;base64,/)
    await expect(el.style.mask).toContain('contain')
    await expect(el.style.mask).toContain('no-repeat')
    await expect(el.style.webkitMask).toContain('data:image/png;base64,')
    await expect(el.style.background).toBe('currentcolor')
    await expect(el.getAttribute('aria-hidden')).toBe('true')
    await expect(el.getBoundingClientRect().width).toBe(32)
  },
}

/** The glyph inherits colour exactly like text — via `color` on an ancestor. */
export const InheritsColor: Story = {
  render: (args) => (
    <span style={{ color: 'rgb(100, 143, 123)' }}>
      <Icon {...args} />
    </span>
  ),
  play: async ({ canvasElement }) => {
    const el = await paintedGlyph(canvasElement, 'star-01')
    await expect(getComputedStyle(el).backgroundColor).toBe('rgb(100, 143, 123)')
  },
}

/** The six fixed area defaults + the Life glyph, in the three area hues. */
export const AreaDefaults: Story = {
  render: () => {
    const areas = ['Personal', 'Professional', 'Health', 'Finances', 'Creativity']
    return (
      <div className="flex items-center gap-4 text-mn-text">
        <Icon name={LIFE_GLYPH} size={28} className="text-mn-area-a" />
        {areas.map((title, i) => (
          <Icon
            key={title}
            name={areaGlyph(title)!}
            size={28}
            className={['text-mn-area-a', 'text-mn-area-b', 'text-mn-area-c'][i % 3]}
          />
        ))}
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    for (const name of [LIFE_GLYPH, 'house', 'star-01', 'leaf-01', 'stairs-01', 'flower-05']) {
      await paintedGlyph(canvasElement, name)
    }
    await expect(canvasElement.querySelectorAll('[data-icon]')).toHaveLength(6)
  },
}

/** A glyph that doesn't exist stays unpainted — no solid square, no throw. */
export const Missing: Story = {
  args: { name: 'no-such-glyph' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const el = canvasElement.querySelector<HTMLElement>('[data-icon="no-such-glyph"]')!
    await expect(el).toBeInTheDocument()
    // Give the (failing) fetch a beat, then confirm nothing was painted.
    await new Promise((r) => setTimeout(r, 300))
    await expect(el.style.mask).toBe('')
    await expect(el.style.background).toBe('')
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument()
  },
}
