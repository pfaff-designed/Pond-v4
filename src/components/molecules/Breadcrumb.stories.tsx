import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { ComponentProps } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'

import { Breadcrumb } from './Breadcrumb'
import { AreaMark } from '@/components/atoms/AreaMark'

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

// ════════════════════════════════════════════════════════════════════════════
// Relocated from jest (`shell-reskin`, `glyph-marks`).
//
// The pill's geometry and its glass are asserted as COMPUTED values against the
// board literals, in both themes — not as the Tailwind classes (`h-10`, `py-2`,
// `pl-3.5`, `gap-2.5`, `mn-glass`) that are supposed to produce them. A right
// class name over a wrong role is exactly how #252 shipped.
// ════════════════════════════════════════════════════════════════════════════

/** The floating-glass recipe (handoff README § Surfaces), resolved per theme. */
const GLASS = {
  light: {
    ground: 'rgb(250, 249, 239)',
    bg: 'linear-gradient(160deg, rgba(255, 255, 255, 0.86), rgba(255, 255, 255, 0.64))',
    border: 'rgb(255, 255, 255)',
    borderAlpha: 'rgba(255, 255, 255, 0.9)',
  },
  dark: {
    ground: 'rgb(27, 29, 20)',
    bg: 'linear-gradient(160deg, rgba(72, 73, 64, 0.86), rgba(48, 49, 42, 0.66))',
    border: 'rgb(250, 249, 239)',
    borderAlpha: 'rgba(250, 249, 239, 0.2)',
  },
} as const

type Theme = keyof typeof GLASS
const THEMES: Theme[] = ['light', 'dark']

function BothThemes(args: ComponentProps<typeof Breadcrumb>) {
  return (
    <div className="flex flex-col gap-6">
      {THEMES.map((theme) => (
        <div
          key={theme}
          data-theme-probe={theme}
          className={`bg-mn-surface p-6 ${theme === 'dark' ? 'dark' : ''}`}
        >
          <Breadcrumb {...args} />
        </div>
      ))}
    </div>
  )
}

const probe = (root: HTMLElement, theme: Theme) =>
  root.querySelector<HTMLElement>(`[data-theme-probe="${theme}"]`)!

/**
 * The pill is floating glass, in pixels, in both themes.
 *
 * `Pond 05 Shell` (measured): height 40, radius 999, padding `8px 8px 8px 14px`,
 * gap 10, and the pond's own mark at 12 leading it. The glass is the README
 * recipe read through the `--mn-glass-*` roles — `blur(24px) saturate(1.3)`,
 * which Chromium honours only UNPREFIXED (a hand-written `-webkit-` twin makes
 * Lightning CSS drop the standard declaration and the blur silently vanishes,
 * which is why the computed value is what gets asserted).
 *
 * Also pins what the pill does NOT do: it positions nothing itself — where the
 * pill sits is the shell slot's job — so a `position` other than `static` here
 * means the slot and the pill are both trying to place it.
 */
export const GlassPillComputed: Story = {
  args: { onCommandK: fn() },
  render: (args) => <BothThemes {...args} />,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      const scope = probe(canvasElement, theme)
      const nav = within(scope).getByRole('navigation', { name: 'Breadcrumb' })
      const css = getComputedStyle(nav)

      await expect(Math.round(nav.getBoundingClientRect().height)).toBe(40)
      await expect(css.borderTopLeftRadius).toBe('9999px')
      await expect(css.padding).toBe('8px 8px 8px 14px')
      await expect(css.columnGap).toBe('10px')

      // the glass, by role — the one thing light and dark genuinely differ on
      await expect(css.backgroundImage).toBe(GLASS[theme].bg)
      await expect(css.backdropFilter).toBe('blur(24px) saturate(1.3)')
      await expect(css.borderTopWidth).toBe('1px')
      await expect(css.borderTopStyle).toBe('solid')
      await expect(css.borderTopColor).toBe(GLASS[theme].borderAlpha)
      await expect(getComputedStyle(scope).backgroundColor).toBe(GLASS[theme].ground)

      // The pill floats; it does not place itself.
      await expect(css.position).toBe('static')
      // Nothing re-cases the segments: a crumb is its page title verbatim, and
      // the root reads lowercase because the DATA is lowercase (#101 review).
      await expect(css.textTransform).toBe('none')

      // The lead mark is the POND's (a plain mask in currentColor at 12), never
      // an area mark — the pond is not an area.
      const pond = nav.querySelector<HTMLElement>('[data-pond-mark] [data-icon]')!
      await expect(pond.getBoundingClientRect().width).toBe(12)
      await expect(nav.querySelector('[data-area-mark]')).toBeNull()
    }
  },
}

/**
 * The area mark is INJECTED, not derived (#134 made it a control that writes to
 * the database, which a presentational molecule has no business owning). What
 * the pill still owns is WHERE it goes: the first crumb, and nowhere else.
 *
 * Beside the crumb, never inside it — a crumb is a `<button>` and so is the
 * mark, and nesting them is invalid HTML React reports as a hydration error.
 * The hue is a ROLE, read here as the resolved colour in both themes: `area-c`
 * is navy on light and mist on dark (navy→mist, 1g), so a theme that resolved
 * the role to the wrong hue fails here while the old `/^var\(--mn-area-c\)$/`
 * match on the inline style would have passed.
 */
export const InjectedLeadMark: Story = {
  args: {
    crumbs: [
      { id: 'health', type: 'page', title: 'Health' },
      { id: 'sleep', type: 'page', title: 'Sleep' },
    ],
    current: 'Dreams',
    leadMark: <AreaMark glyph="leaf-01" color="var(--mn-area-c)" size={11} />,
  },
  render: (args) => <BothThemes {...args} />,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      const canvas = within(probe(canvasElement, theme))
      const health = canvas.getByRole('button', { name: /Health/ })
      const glyph = health.parentElement!.querySelector<HTMLElement>('[data-icon="leaf-01"]')!
      await expect(glyph).toBeInTheDocument()
      await expect(health.querySelector('[data-icon]')).toBeNull()
      await expect(glyph.getBoundingClientRect().width).toBe(11)

      const slot = glyph.closest<HTMLElement>('[data-area-mark]')!
      await expect(getComputedStyle(slot).color).toBe(
        theme === 'light' ? 'rgb(18, 53, 78)' : 'rgb(165, 200, 209)'
      )

      // Only the lead crumb carries one.
      const sleep = canvas.getByRole('button', { name: /Sleep/ })
      await expect(sleep.parentElement!.querySelector('[data-icon]')).toBeNull()
    }
  },
}

/** No `leadMark`, no area mark at all — only the pond's own glyph (2t). */
export const NoLeadMark: Story = {
  args: { crumbs: [{ id: 'health', type: 'page', title: 'Health' }], current: undefined },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-area-mark]')).toBeNull()
    await expect(canvasElement.querySelectorAll('[data-icon]')).toHaveLength(1)
  },
}
