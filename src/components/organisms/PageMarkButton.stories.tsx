import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'

import { PageMarkButton } from './PageMarkButton'
import type { PageMark } from '@/lib/pages/mark'

/**
 * The mark popover's FOCUS and KEYBOARD behaviour (#134) — relocated from
 * `src/__tests__/page-mark-button.test.tsx`, where it was the one file in this
 * silo whose subject was behaviour a real browser judges better than jsdom.
 *
 * All three of this component's shipped defects lived here, and none of them was
 * visible by reading it: the popover was mouse-only (focus never entered it, so
 * Escape could not reach it), and once focus restoration was added it fired from
 * the SCROLL handler too, yanking the caret out of the editor mid-keystroke —
 * after which the next Space re-opened the picker. Both are silent failures, so
 * both earn a place here.
 *
 * The popover is PORTALLED to `document.body` (an animated ancestor carrying
 * `animation: … both` keeps its final transform and is permanently its own
 * stacking context, so a popover rendered in place sat under a later sibling and
 * swallowed every click on the glyph grid). That is why these stories query
 * through `screen` rather than the canvas.
 *
 * The Supabase client is built lazily inside the write callback, so an envless
 * mount here never constructs one — no mock is needed, and no story below
 * commits a choice (`MarkPicker.stories` owns the picker's own behaviour).
 */
const MARK: PageMark = { glyph: 'leaf-01', role: 'area-a', roleIsOwn: false, glyphIsOwn: false }

const meta = {
  title: 'Organisms/PageMarkButton',
  component: PageMarkButton,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      return (
        <QueryClientProvider client={client}>
          <div className="flex items-center gap-4 bg-mn-surface p-6">
            {/* A focusable neighbour, standing in for the editor the caret is
                normally in — the thing the scroll handler used to steal from. */}
            <input
              aria-label="Elsewhere"
              className="rounded-mn-chrome border border-mn-line bg-transparent px-2 py-1"
            />
            <Story />
          </div>
        </QueryClientProvider>
      )
    },
  ],
  args: { pageId: 'p1', pageTitle: 'Health', mark: MARK },
} satisfies Meta<typeof PageMarkButton>

export default meta
type Story = StoryObj<typeof meta>

const trigger = () => screen.getByRole('button', { name: 'Change the mark for Health' })
const picker = () => screen.queryByRole('dialog', { name: 'Mark for Health' })

/**
 * Opening moves focus INTO the picker, so it is reachable without a mouse — and
 * the trigger announces itself as a popup.
 *
 * Focus on a SIBLING of the portal is what made Escape unreachable and left Tab
 * landing behind the click-away overlay, so the assertion is on the search field
 * specifically, not merely "something is focused".
 */
export const OpensIntoThePicker: Story = {
  play: async () => {
    await expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog')
    await expect(trigger()).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger())
    await expect(picker()).toBeInTheDocument()
    await expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    await expect(screen.getByRole('textbox', { name: 'Search glyphs' })).toHaveFocus()

    // Leave the document as it was found — the portal outlives the canvas.
    await userEvent.keyboard('{Escape}')
  },
}

/** Escape closes it and hands focus back to the trigger the person came from. */
export const EscapeReturnsFocus: Story = {
  play: async () => {
    await userEvent.click(trigger())
    await userEvent.keyboard('{Escape}')
    await expect(picker()).not.toBeInTheDocument()
    await expect(trigger()).toHaveFocus()
  },
}

/** A second click on the mark closes it, rather than re-anchoring it. */
export const SecondClickCloses: Story = {
  play: async () => {
    await userEvent.click(trigger())
    await expect(picker()).toBeInTheDocument()
    await userEvent.click(trigger())
    await expect(picker()).not.toBeInTheDocument()
  },
}

/**
 * The round-two regression: `close` doubles as the scroll handler (the popover
 * is anchored to the trigger's viewport rect, so a scroll would strand it), and
 * restoring focus there pulled the caret out of whatever the person was typing
 * in. Only focus the popover actually HOLDS may be reclaimed.
 */
export const ScrollClosesWithoutStealingFocus: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(trigger())
    const elsewhere = within(canvasElement).getByRole('textbox', { name: 'Elsewhere' })
    elsewhere.focus()

    window.dispatchEvent(new Event('scroll'))

    await waitFor(() => expect(picker()).not.toBeInTheDocument())
    await expect(elsewhere).toHaveFocus()
  },
}

/** The same rule for Escape: it closes, but does not yank focus back. */
export const EscapeElsewhereKeepsFocus: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(trigger())
    const elsewhere = within(canvasElement).getByRole('textbox', { name: 'Elsewhere' })
    elsewhere.focus()

    await userEvent.keyboard('{Escape}')

    await expect(picker()).not.toBeInTheDocument()
    await expect(elsewhere).toHaveFocus()
  },
}

/**
 * A page with no glyph is still clickable, showing its `KindDot` — which IS its
 * mark, just the other register (a shape-and-colour code rather than a
 * silhouette). An earlier build returned null here, and only the six SEEDED
 * areas have a title-derived glyph, so every page a person made themselves had
 * no icon to click and therefore no route to ever getting one.
 *
 * The dot's hue is read as the resolved COLOUR in both themes: `area-c` is navy
 * on light and mist on dark (navy→mist, 1g), so the role has to be resolving
 * correctly and not merely be spelled correctly in an inline style.
 */
export const NoGlyphStillClickable: Story = {
  args: {
    pageId: 'p2',
    pageTitle: 'Health',
    mark: { glyph: null, role: 'area-c', roleIsOwn: false, glyphIsOwn: false },
  },
  render: (args) => (
    <div className="flex gap-6">
      {(['light', 'dark'] as const).map((theme) => (
        <span
          key={theme}
          data-theme-probe={theme}
          className={`bg-mn-surface p-2 ${theme === 'dark' ? 'dark' : ''}`}
        >
          <PageMarkButton {...args} />
        </span>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const [theme, expected] of [
      ['light', 'rgb(18, 53, 78)'],
      ['dark', 'rgb(165, 200, 209)'],
    ] as const) {
      const scope = canvasElement.querySelector<HTMLElement>(`[data-theme-probe="${theme}"]`)!
      await expect(
        within(scope).getByRole('button', { name: 'Change the mark for Health' })
      ).toBeInTheDocument()
      const dot = scope.querySelector<HTMLElement>('[data-part="dot"]')!
      await expect(dot).toBeInTheDocument()
      await expect(getComputedStyle(dot).backgroundColor).toBe(expected)
      // the KindDot's board geometry: 7×7, 2px radius (`PondAtom`)
      await expect(dot.getBoundingClientRect().width).toBe(7)
      await expect(getComputedStyle(dot).borderRadius).toBe('2px')
      await expect(scope.querySelector('[data-icon]')).toBeNull()
    }
  },
}
