import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { BlockHandleMenu } from './BlockHandleMenu'

/**
 * The items the host hands the menu for a LIST block (#101, board 6j frame 2):
 * `turn into › table`, carrying the preview of what will come out, then the
 * block's own actions. The frame's other conversions (checklist, text) and block
 * actions (move into a new page, copy link) are separate features, tracked apart.
 */
const listItems = [
  {
    id: 'turn-into-table',
    group: 'turn into' as const,
    label: 'table',
    preview: '4 rows · 3 columns',
    icon: 'table' as const,
  },
  { id: 'delete', group: 'block' as const, label: 'delete block', icon: 'delete' as const },
]

const meta = {
  title: 'Molecules/BlockHandleMenu',
  component: BlockHandleMenu,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="flex min-h-[260px] justify-start bg-mn-surface p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    items: listItems,
    onSelect: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof BlockHandleMenu>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A list block: the `turn into` group offers `table`, and the row says what will
 * come out before it happens ("4 rows · 3 columns"). Picking it selects by id.
 */
export const ListBlock: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('turn into')).toBeInTheDocument()
    await expect(canvas.getByText('block')).toBeInTheDocument()

    const table = canvas.getByRole('menuitem', { name: /table/i })
    await expect(table).toHaveTextContent('4 rows · 3 columns')
    // ticket-41: the menu grows from its anchor — the painted origin, not the
    // class that asks for it (#252 shipped a right class name and a wrong pixel).
    await expect(getComputedStyle(canvas.getByRole('menu')).transformOrigin).toBe('0px 0px')

    await userEvent.click(table)
    await expect(args.onSelect).toHaveBeenCalledWith('turn-into-table')
  },
}

/**
 * A block that is no list: no conversion is offered at all — the `turn into`
 * group disappears rather than showing a dead row — and the block's own actions
 * remain.
 */
export const NotAList: Story = {
  args: { items: [{ id: 'delete', group: 'block', label: 'delete block', icon: 'delete' }] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('turn into')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('menuitem', { name: /table/i })).not.toBeInTheDocument()

    const del = canvas.getByRole('menuitem', { name: /delete block/i })
    await userEvent.click(del)
    await expect(args.onSelect).toHaveBeenCalledWith('delete')
  },
}

/**
 * Keyboard: the panel takes focus on open so ↓ moves to the second row at once,
 * Enter picks the active one, and Escape closes without picking anything.
 */
export const KeyboardNav: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const menu = canvas.getByRole('menu')
    await expect(menu).toHaveFocus()

    // The first row is active on open; ↓ then ↑ returns to it, and Enter picks it.
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Enter}')
    await expect(args.onSelect).toHaveBeenCalledWith('turn-into-table')

    // ↓ walks past the group label to `delete block`, which Enter then picks.
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await expect(args.onSelect).toHaveBeenCalledWith('delete')

    await expect(args.onClose).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).toHaveBeenCalled()
  },
}

// ── the glass itself, both themes ──────────────────────────────────────────────

const PAPER = {
  ink: 'rgb(27, 29, 20)',
  /** `text-mn-text-secondary` — the .68 tier. */
  tier68: 'rgba(27, 29, 20, 0.68)',
  /** `text-mn-text-meta` — the .8 tier. */
  tier80: 'rgba(27, 29, 20, 0.8)',
}
const INK = {
  ink: 'rgb(250, 249, 239)',
  tier68: 'rgba(250, 249, 239, 0.68)',
  tier80: 'rgba(250, 249, 239, 0.8)',
}

const px = (v: string) => parseFloat(v)
const alphaOf = (color: string) => {
  if (color === 'rgba(0, 0, 0, 0)') return 0
  if (/^rgb\(/.test(color) && !color.includes('/')) return 1
  const m = color.match(/(?:\/|,)\s*([\d.]+%?)\s*\)\s*$/)
  return m ? (m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1])) : NaN
}

/**
 * The menu's own values, measured off `Pond 06.10` board 6j frame 2 and recorded
 * in `BlockHandleMenu.tsx`'s header: a 250px glass card at radius 20 with 8px
 * padding and a 1px row gap; the group label mono 10.5 / .04em at the .68 tier;
 * rows mono 12.5 / .01em at radius 10 with 7 × 10 padding; the 13px hand-drawn
 * mark and the ↵ at the .8 tier; the preview at 10.5 / .68.
 *
 * Read off COMPUTED styles, so a right class name over a wrong pixel fails here.
 * The three ink tiers are the whole palette this surface may use (PROJECT_RULES),
 * which is why the dark frame asserts the same structure with the tiers flipped
 * rather than a second set of numbers.
 */
async function assertGlass(root: HTMLElement, p: typeof PAPER) {
  const menu = root.querySelector<HTMLElement>('[role="menu"]')!
  const m = getComputedStyle(menu)
  await expect(px(m.width)).toBe(250)
  await expect(m.borderTopLeftRadius).toBe('20px')
  await expect(m.padding).toBe('8px')
  await expect(m.display).toBe('flex')
  await expect(m.flexDirection).toBe('column')
  await expect(m.rowGap).toBe('1px')
  await expect(m.fontFamily).toMatch(/PP Neue Montreal Mono/)
  await expect(m.color).toBe(p.ink)
  await expect(m.textTransform).toBe('lowercase')
  await expect(m.backdropFilter).toBe('blur(24px) saturate(1.3)')
  // Nothing in the panel paints a ring of its own: the menu takes focus itself.
  await expect(m.outlineStyle).toBe('none')

  const group = root.querySelector<HTMLElement>('[role="presentation"]')!
  const gs = getComputedStyle(group)
  await expect(gs.padding).toBe('8px 10px 5px')
  await expect(px(gs.fontSize)).toBe(10.5)
  await expect(px(gs.letterSpacing)).toBeCloseTo(0.42, 2)
  await expect(gs.color).toBe(p.tier68)

  for (const item of root.querySelectorAll<HTMLElement>('[role="menuitem"]')) {
    const s = getComputedStyle(item)
    await expect(s.display).toBe('flex')
    await expect(s.alignItems).toBe('center')
    await expect(s.columnGap).toBe('10px')
    await expect(s.padding).toBe('7px 10px')
    await expect(s.borderTopLeftRadius).toBe('10px')
    await expect(s.fontFamily).toMatch(/PP Neue Montreal Mono/)
    await expect(px(s.fontSize)).toBe(12.5)
    await expect(px(s.letterSpacing)).toBeCloseTo(0.125, 3)
    await expect(s.outlineStyle).toBe('none')
    // The active row wears the house hover fill — ink .07, never a second colour.
    const active = item.getAttribute('data-active') === 'true'
    await expect(alphaOf(s.backgroundColor)).toBeCloseTo(active ? 0.07 : 0, 2)
    const enter = [...item.querySelectorAll<HTMLElement>('span')].find((x) => x.textContent === '↵')
    await expect(enter !== undefined).toBe(active)
    if (enter) {
      await expect(px(getComputedStyle(enter).fontSize)).toBe(10.5)
      await expect(getComputedStyle(enter).color).toBe(p.tier80)
    }
    const svg = item.querySelector('svg')
    if (svg) {
      await expect(svg.getAttribute('width')).toBe('13')
      await expect(svg.getAttribute('stroke-width')).toBe('1.4')
      await expect(getComputedStyle(svg.parentElement!).color).toBe(p.tier80)
    }
  }

  const preview = [...root.querySelectorAll<HTMLElement>('[role="menuitem"] span')].find(
    (x) => x.textContent === '4 rows · 3 columns'
  )!
  const ps = getComputedStyle(preview)
  await expect(px(ps.fontSize)).toBe(10.5)
  await expect(ps.color).toBe(p.tier68)
  await expect(ps.maxWidth).toBe('45%')
  await expect(ps.textOverflow).toBe('ellipsis')
}

/** The glass, the group label, the two rows and the preview — on paper. */
export const Glass: Story = {
  play: async ({ canvasElement }) => assertGlass(canvasElement, PAPER),
}

/** The same card on the dark ground: the three ink tiers flip, the geometry does not. */
export const GlassInk: Story = {
  decorators: [
    (Story) => (
      <div className="dark flex min-h-[260px] justify-start bg-raw-ink p-6">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => assertGlass(canvasElement, INK),
}
