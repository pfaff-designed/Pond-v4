import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { GlyphPickerSheet } from './GlyphPickerSheet'

/**
 * `PondPicker kind="glyph"` size="mobile" (KAN-250 4/4): the sheet is the only
 * host of the `mob` branch now (the anchored `GlyphPicker` is desktop-only —
 * `size` was dropped from its props once Rail stopped reaching it on the
 * phone), so `Sheet` pins the DC's own mobile numbers (width, radii, padding,
 * cell size/radius, column count) as well as the chrome the sheet adds over
 * the anchored glass: the backdrop/escape close paths (`Drawer.Root`'s own
 * drag-down dismiss is Base UI's tested gesture, not re-simulated here —
 * confirmed live). The search/pick behaviour itself is `GlyphPickerBody`'s,
 * already pinned by `GlyphPicker.stories.tsx`'s `Desktop`/`AreaTarget`/`Keyboard`
 * stories.
 */

const meta = {
  title: 'Organisms/pickers/2h · the glyph picker sheet',
  component: GlyphPickerSheet,
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    target: { isArea: false, title: 'workouts' },
    current: null,
    inheritsFrom: 'health',
    recentGlyphs: ['heart', 'leaf-01'],
    onPick: fn(),
    onPickColour: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof GlyphPickerSheet>

export default meta
type Story = StoryObj<typeof meta>

const glassOf = () => document.body.querySelector<HTMLElement>('[data-part="glass"]')!
const libraryOf = (glass: HTMLElement) =>
  [...glass.querySelectorAll<HTMLElement>('[data-part="section"]')].find(
    (s) => s.querySelector('span')!.textContent === 'library'
  )!.lastElementChild as HTMLElement

/** `GlyphPickerSheet` portals to `document.body`, same as the anchored `GlyphPicker`. */
export const Sheet: Story = {
  name: 'sheet · mobile',
  play: async () => {
    const body = within(document.body)
    const glass = glassOf()
    const g = getComputedStyle(glass)
    await expect(parseFloat(g.width)).toBe(390)
    await expect(g.borderTopLeftRadius).toBe('28px')
    await expect(g.borderBottomLeftRadius).toBe('0px')
    await expect(g.paddingTop).toBe('10px')
    await expect(g.paddingLeft).toBe('23px')
    await expect(g.paddingBottom).toBe('34px')

    const library = libraryOf(glass)
    const rows = library.querySelectorAll<HTMLElement>('[role="row"]')
    await expect(rows[0].querySelectorAll('[role="gridcell"]')).toHaveLength(7)
    const cell = library.querySelector<HTMLElement>('[role="gridcell"]')!
    const c = getComputedStyle(cell)
    await expect(parseFloat(c.width)).toBe(44)
    await expect(parseFloat(c.height)).toBe(44)
    await expect(c.borderTopLeftRadius).toBe('12px')

    const head = glass.querySelector<HTMLElement>('[data-part="head"]')!
    await expect(parseFloat(getComputedStyle(head).minHeight)).toBe(44)
    await body.getByRole('combobox', { name: 'search glyphs' })
  },
}

/**
 * A press on the backdrop closes it, same as the anchored glass's
 * outside-press rule — and the backdrop itself paints no scrim (06.24
 * 's24.6 phone' shows the rail undimmed behind the sheet).
 */
export const BackdropCloses: Story = {
  args: { onClose: fn() },
  play: async ({ args }) => {
    const backdrop = document.body.querySelector<HTMLElement>('[data-part="backdrop"]')!
    await expect(getComputedStyle(backdrop).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    await userEvent.click(backdrop)
    await expect(args.onClose).toHaveBeenCalledTimes(1)
  },
}

/** Esc closes it — same as the anchored glass's own `onClose` on esc. */
export const EscapeCloses: Story = {
  args: { onClose: fn() },
  play: async ({ args }) => {
    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).toHaveBeenCalled()
  },
}

/**
 * Below the board's own 390px viewport (AUDIT X1): `SHEET_POPUP`'s
 * `max-w-[390px]` must still fit a 320px phone, not overflow it sideways.
 */
export const FitsNarrowPhone: Story = {
  name: 'sheet · narrowest phone (320px)',
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async () => {
    const glass = glassOf()
    await expect(glass.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth)
  },
}

/**
 * At 360px (no named preset covers it — `mobile1` is 320, `mobile2` is 414),
 * the fixed board padding (23px either side) leaves only 314px for a row
 * that needs 344px (7×44 cells + 6×6 gaps), clipping the 7th column by 8px
 * (AUDIT X1). `SHEET_POPUP`'s side-padding clamp gives way to an 8px floor
 * at exactly this width, so the full row must fit without clipping.
 */
export const FitsRowAt360: Story = {
  name: 'sheet · 360px phone',
  globals: { viewport: { value: '360-780', isRotated: false } },
  play: async () => {
    const glass = glassOf()
    const library = libraryOf(glass)
    const row = library.querySelector<HTMLElement>('[role="row"]')!
    const cells = [...row.querySelectorAll<HTMLElement>('[role="gridcell"]')]
    await expect(cells).toHaveLength(7)
    for (const cell of cells) {
      await expect(parseFloat(getComputedStyle(cell).width)).toBe(44)
    }
    const lastCell = cells[cells.length - 1]!
    await expect(lastCell.getBoundingClientRect().right).toBeLessThanOrEqual(
      glass.getBoundingClientRect().right
    )
  },
}

/** Picking a colour (an area target) keeps the sheet open, same as the desktop rule. */
export const PickColourStaysOpen: Story = {
  args: {
    target: { isArea: true, title: 'health' },
    accent: '#648F7B',
    onPickColour: fn(),
    onClose: fn(),
  },
  play: async ({ args }) => {
    const body = within(document.body)
    const swatch = body.getByRole('gridcell', { name: 'sage' })
    await userEvent.click(swatch)
    await expect(args.onPickColour).toHaveBeenCalledWith('area-a')
    await expect(args.onClose).not.toHaveBeenCalled()
    // the component never calls `onClose` itself on a colour pick, so a host
    // leaving `open` untouched keeps the sheet mounted — verified here as
    // "still in the DOM", not a re-render of a stateful `open`.
    await expect(body.getByRole('listbox', { name: 'glyphs' })).toBeInTheDocument()
  },
}

/**
 * A query short enough to leave the library grid with no scrollable overflow
 * still has to deliver the click: `Drawer.Viewport`'s own `onPointerDown`
 * starts a swipe (and `setPointerCapture`s the pointer) on any target that
 * isn't `DEFAULT_IGNORE_SELECTOR` and has no scrollable ancestor — our cells
 * are `role="gridcell"`/`role="option"` divs, so without a guard the pick
 * press is retargeted to the drawer and `onPick` never fires.
 */
export const PicksAfterNarrowingSearch: Story = {
  args: { onPick: fn() },
  play: async ({ args }) => {
    const body = within(document.body)
    const search = body.getByRole('combobox', { name: 'search glyphs' })
    await userEvent.type(search, 'fl')
    const cell = body.getAllByRole('gridcell')[0]
    await userEvent.click(cell)
    await expect(args.onPick).toHaveBeenCalled()
  },
}

/** Same swipe-capture hazard on the colour row's swatches. */
export const PicksColourAfterNarrowingSearch: Story = {
  args: {
    target: { isArea: true, title: 'health' },
    accent: '#648F7B',
    onPickColour: fn(),
  },
  play: async ({ args }) => {
    const body = within(document.body)
    const search = body.getByRole('combobox', { name: 'search glyphs' })
    await userEvent.type(search, 'fl')
    const swatch = body.getByRole('gridcell', { name: 'sage' })
    await userEvent.click(swatch)
    await expect(args.onPickColour).toHaveBeenCalledWith('area-a')
  },
}
