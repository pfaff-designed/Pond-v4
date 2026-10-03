import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { RailView, type RailNode } from './Rail'

const node = (
  id: string,
  type: string,
  title: string,
  children: RailNode[] = [],
  order = 0,
  parentId: string | null = null
): RailNode => ({ id, parentId, type, title, order, children })

/** A small realistic tree: three areas (one nested), one free-floating leaf. */
const TREE: RailNode[] = [
  node('health', 'page', 'Health', [
    node('sleep', 'page', 'Sleep', [], 0, 'health'),
    node('marathon', 'project', 'Marathon Training', [], 1, 'health'),
  ]),
  node(
    'personal',
    'page',
    'Personal',
    [
      node(
        'food',
        'page',
        'Food',
        [node('recipes', 'page', 'Recipes', [], 0, 'food')],
        0,
        'personal'
      ),
      node('trips', 'page', 'Trips', [], 1, 'personal'),
    ],
    1
  ),
  node(
    'creativity',
    'page',
    'Creativity',
    [node('shelf', 'page', 'Walnut Shelf', [], 0, 'creativity')],
    2
  ),
  node('scratch', 'page', 'Scratchpad', [], 3),
]

const meta = {
  title: 'Organisms/Rail',
  component: RailView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen bg-mn-surface">
        <Story />
      </div>
    ),
  ],
  args: {
    tree: TREE,
    pondName: 'life',
    selectedId: null,
    expanded: new Set<string>(),
    lifeExpanded: true,
    busyId: null,
    isLoading: false,
    isEmpty: false,
    onSelect: fn(),
    onToggle: fn(),
    onAddChild: fn(),
    onDelete: fn(),
    onLife: fn(),
    onToggleLife: fn(),
    onNewPage: fn(),
    canDrop: () => true,
    onMove: fn(),
  },
} satisfies Meta<typeof RailView>

export default meta
type Story = StoryObj<typeof meta>

/** Resting rail: Life root open, area folders collapsed, children hidden. */
export const Resting: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // life is the root treeitem, and the whole thing is one tree. (#96: the pond's
    // NAME also reads "life" in the head, so scope the row query to the tree. #101:
    // both are lowercase — the rail's source copy is, and the head's capitals are
    // its own text-transform.)
    const tree = canvas.getByRole('tree', { name: 'Workspace' })
    await expect(tree).toBeInTheDocument()
    await expect(within(tree).getByText('life')).toBeInTheDocument()
    await expect(canvasElement.querySelector('[data-part="pond-name"]')).toHaveTextContent('life')
    await expect(canvas.getByText('Health')).toBeInTheDocument()
    await expect(canvas.getByText('Scratchpad')).toBeInTheDocument()
    // collapsed folder — children not rendered
    await expect(canvas.queryByText('Sleep')).not.toBeInTheDocument()
  },
}

/** Collapsing the Life root hides the entire tree beneath it. */
export const LifeCollapsed: Story = {
  args: { lifeExpanded: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(within(canvas.getByRole('tree')).getByText('life')).toBeInTheDocument()
    // everything under Life is hidden
    await expect(canvas.queryByText('Health')).not.toBeInTheDocument()
    await expect(canvas.queryByText('Scratchpad')).not.toBeInTheDocument()
  },
}

/** An expanded area folder shows its leaves; a nested sub-area stays a folder. */
export const Expanded: Story = {
  args: { expanded: new Set(['health', 'personal']), selectedId: 'sleep' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sleep')).toBeInTheDocument()
    await expect(canvas.getByText('Trips')).toBeInTheDocument()
    // nested sub-area folder is itself collapsed
    await expect(canvas.queryByText('Recipes')).not.toBeInTheDocument()
  },
}

/** ARIA coordinates: levels and sibling positions come from the flattened tree. */
export const AriaCoordinates: Story = {
  args: { expanded: new Set(['health']) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const life = canvas.getByRole('treeitem', { name: /life/ })
    await expect(life).toHaveAttribute('aria-level', '1')
    await expect(life).toHaveAttribute('aria-setsize', '1')
    const health = canvas.getByRole('treeitem', { name: /Health/ })
    await expect(health).toHaveAttribute('aria-level', '2')
    await expect(health).toHaveAttribute('aria-posinset', '1')
    await expect(health).toHaveAttribute('aria-setsize', '4')
    const sleep = canvas.getByRole('treeitem', { name: /Sleep/ })
    await expect(sleep).toHaveAttribute('aria-level', '3')
    await expect(sleep).toHaveAttribute('aria-posinset', '1')
    await expect(sleep).toHaveAttribute('aria-setsize', '2')
  },
}

/**
 * The trail to the current node (ticket-25): ancestors of the selection carry
 * the raised on-path tone (data-on-path) so "you are here" reads in the rail;
 * the selected row and off-path rows don't.
 */
export const PathToSelection: Story = {
  args: {
    expanded: new Set(['personal', 'food']),
    selectedId: 'recipes',
    pathIds: new Set(['personal', 'food']),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('treeitem', { name: /Personal/ })).toHaveAttribute('data-on-path')
    await expect(canvas.getByRole('treeitem', { name: /Food/ })).toHaveAttribute('data-on-path')
    // the selected row itself uses the selected treatment, not the path tone
    await expect(canvas.getByRole('treeitem', { name: /Recipes/ })).not.toHaveAttribute(
      'data-on-path'
    )
    // an area off the path stays at resting tone
    await expect(canvas.getByRole('treeitem', { name: /Health/ })).not.toHaveAttribute(
      'data-on-path'
    )
  },
}

/** The caret toggles a folder without navigating; the name opens the page. */
export const Interactions: Story = {
  play: async ({ canvas, args }) => {
    // caret click on Health toggles, does not open
    const health = canvas.getByRole('treeitem', { name: /Health/ })
    const caret = health.querySelector('svg')?.closest('button') as HTMLButtonElement
    await userEvent.click(caret)
    await expect(args.onToggle).toHaveBeenCalledWith('health')
    await expect(args.onSelect).not.toHaveBeenCalled()

    await userEvent.click(canvas.getByText('Health'))
    await expect(args.onSelect).toHaveBeenCalledWith('health')

    // Life label (the tree ROW, not the pond-name head) opens the root page
    await userEvent.click(within(canvas.getByRole('tree')).getByText('life'))
    await expect(args.onLife).toHaveBeenCalled()
  },
}

/** The Life root's caret is a collapse-all for the whole tree. */
export const LifeCaretCollapsesAll: Story = {
  play: async ({ canvas, args }) => {
    const life = canvas.getByRole('treeitem', { name: /life/ })
    const caret = life.querySelector('svg')?.closest('button') as HTMLButtonElement
    await userEvent.click(caret)
    await expect(args.onToggleLife).toHaveBeenCalled()
  },
}

/**
 * Hover CRUD is present per row, revealed on hover / focus-within — and the
 * controls are REAL tab stops (ticket-27 keyboard reachability): no
 * tabindex=-1 on ＋/×.
 */
export const HoverCrud: Story = {
  play: async ({ canvas, args }) => {
    const add = canvas.getByRole('button', { name: 'Add sub-page to Health' })
    const del = canvas.getByRole('button', { name: 'Delete Scratchpad' })
    // reachable by keyboard: not opted out of the tab order
    await expect(add).not.toHaveAttribute('tabindex', '-1')
    await expect(del).not.toHaveAttribute('tabindex', '-1')
    await userEvent.click(add)
    await expect(args.onAddChild).toHaveBeenCalledWith('health')
    await userEvent.click(del)
    await expect(args.onDelete).toHaveBeenCalledWith('scratch')
    // the Life root has no CRUD affordances
    await expect(canvas.queryByRole('button', { name: /Delete Life/ })).not.toBeInTheDocument()
  },
}

/**
 * Keyboard nav (WAI-ARIA tree): a single roving tab stop that arrow keys move
 * for real — ArrowDown walks Life → Health; Delete on a focused row raises
 * onDelete (same confirm/undo path as ×); + raises onAddChild.
 */
export const KeyboardNav: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const life = canvas.getByRole('treeitem', { name: /life/ })
    const health = canvas.getByRole('treeitem', { name: /Health/ })

    // exactly one tab stop at rest: the Life root
    await expect(life).toHaveAttribute('tabindex', '0')
    await expect(health).toHaveAttribute('tabindex', '-1')

    // ArrowDown moves the roving focus to the first area — for real
    life.focus()
    await userEvent.keyboard('{ArrowDown}')
    await expect(health).toHaveAttribute('tabindex', '0')
    await expect(health).toHaveFocus()
    await expect(life).toHaveAttribute('tabindex', '-1')

    // ArrowRight on a closed folder expands it (raised to the container)
    await userEvent.keyboard('{ArrowRight}')
    await expect(args.onToggle).toHaveBeenCalledWith('health')

    // Delete on the focused row deletes it through the shared path
    await userEvent.keyboard('{Delete}')
    await expect(args.onDelete).toHaveBeenCalledWith('health')

    // + adds a child to the focused row
    await userEvent.keyboard('+')
    await expect(args.onAddChild).toHaveBeenCalledWith('health')
  },
}

/**
 * #96: the rail is a PAPER card (`PondRail`, measured: the card paper, the card
 * shadow, radius 20, 206 wide, no backdrop blur) headed by the pond's NAME as a
 * small-meta label — sans 500 / 11, uppercase, .14em tracking, and NO mark, per
 * all 18 frames of `Pond 05 Shell`. No switcher, no chevron (ADR 0002).
 */
export const PaperCardHead: Story = {
  play: async ({ canvasElement }) => {
    const aside = canvasElement.querySelector('aside')!
    await expect(aside).toHaveClass('bg-mn-card')
    await expect(aside).toHaveClass('shadow-mn-card')
    await expect(aside).toHaveClass('rounded-mn-card')
    await expect(aside).not.toHaveClass('mn-glass')
    await expect(aside.getBoundingClientRect().width).toBe(206)
    const head = aside.querySelector<HTMLElement>('[data-part="rail-head"]')!
    const name = head.querySelector<HTMLElement>('[data-part="pond-name"]')!
    await expect(name).toHaveClass('text-mn-11')
    await expect(name).toHaveClass('uppercase')
    await expect(head.querySelector('[data-pond-mark]')).toBeNull()
    await expect(head.querySelector('button')).toBeNull()
  },
}

/** The foot (`PondRail`): a hairline, then "＋ new page" — the one New page affordance. */
export const FootNewPage: Story = {
  play: async ({ canvas, args }) => {
    const plus = canvas.getByRole('button', { name: 'New page' })
    await expect(plus).toHaveTextContent('＋ new page')
    await userEvent.click(plus)
    await expect(args.onNewPage).toHaveBeenCalledTimes(1)
  },
}

/** First-login states. Loading = `PondRail`'s eight skeleton bars, behind an accessible status. */
export const Loading: Story = {
  args: { tree: [], isLoading: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent(/loading/i)
    await expect(canvasElement.querySelectorAll('[data-part="rail-skeleton"] > span')).toHaveLength(
      8
    )
  },
}

/** Empty = `PondRail`'s hint, pointing at the foot's ＋ and at pond — all lowercase. */
export const Empty: Story = {
  args: { tree: [], isEmpty: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'no pages yet. ＋ new page, or ask pond to start one.'
    )
  },
}

// ── #229 — the board's values, measured live in BOTH themes ──────────────────
//
// Everything below asserts computed styles, not class names, against
// `PondRail.dc.html`'s `renderVals()` (the generator of the board's inline
// styles). Light: ink `27,29,20` on paper `#FAF9EF`; dark: paper `250,249,239`
// on the card `#30312A`.

const LIGHT = {
  card: 'rgb(250, 249, 239)',
  ink: [27, 29, 20] as [number, number, number],
  inkStr: 'rgb(27, 29, 20)',
  ink68: 'rgba(27, 29, 20, 0.68)',
  ink07: 'rgba(27, 29, 20, 0.07)',
  shadow: ['rgba(40, 34, 24, 0.04) 0px 1px 2px', 'rgba(40, 34, 24, 0.06) 0px 8px 24px'],
}
const DARK = {
  card: 'rgb(48, 49, 42)',
  ink: [250, 249, 239] as [number, number, number],
  inkStr: 'rgb(250, 249, 239)',
  ink68: 'rgba(250, 249, 239, 0.68)',
  ink07: 'rgba(250, 249, 239, 0.07)',
  shadow: ['rgba(0, 0, 0, 0.3) 0px 1px 2px', 'rgba(0, 0, 0, 0.34) 0px 8px 24px'],
}
type Theme = typeof LIGHT

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark h-screen bg-raw-ink">
    <Story />
  </div>
)

/** The alpha of a computed colour — `rgba(…, a)`, `color(srgb … / a)` or `oklab(… / a)`. */
function alphaOf(color: string): number {
  if (/^rgb\(/.test(color) && !color.includes('/')) return 1
  const m = color.match(/(?:\/|,)\s*([\d.]+%?)\s*\)\s*$/)
  if (!m) return NaN
  return m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1])
}

/** The sRGB channels (0–255) of a computed colour, when it is expressed in sRGB. */
function rgbOf(color: string): [number, number, number] | null {
  let m = color.match(/^rgba?\(\s*([\d.]+),?\s+([\d.]+),?\s+([\d.]+)/)
  if (m) return [+m[1], +m[2], +m[3]]
  m = color.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
  if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255]
  return null
}

/** Is this colour the theme's ink (any alpha) — and in particular NOT sage `100,143,123`? */
async function expectInk(color: string, theme: Theme) {
  const rgb = rgbOf(color)
  // oklab serialisations are not decodable here; the alpha + class assertions
  // around every call still hold, and sage never serialises to these channels.
  if (!rgb) return
  for (let i = 0; i < 3; i++) await expect(Math.abs(rgb[i] - theme.ink[i])).toBeLessThan(3)
  await expect(rgb).not.toEqual([100, 143, 123])
}

const WIDE_TREE: RailNode[] = [
  node('health', 'page', 'Health', [
    node('sleep', 'page', 'Sleep', [], 0, 'health'),
    node('workouts', 'page', 'Workouts', [], 1, 'health'),
  ]),
  node(
    'personal',
    'page',
    'Personal',
    [
      node(
        'food',
        'page',
        'Food',
        [node('recipes', 'page', 'Recipes', [], 0, 'food')],
        0,
        'personal'
      ),
      node('trips', 'page', 'Trips', [], 1, 'personal'),
    ],
    1
  ),
]

const item = (root: HTMLElement, name: RegExp) => within(root).getByRole('treeitem', { name })
const titleOf = (row: HTMLElement) => row.querySelector<HTMLElement>('[data-part="title"]')!

/** The card chrome — VERIFIED, not changed: 206 wide, padding 18px 0 14px, radius 20, the card paper + shadow; head padding 0 16px 12px. */
async function assertChrome(canvasElement: HTMLElement, theme: Theme) {
  const aside = canvasElement.querySelector<HTMLElement>('aside')!
  const cs = getComputedStyle(aside)
  await expect(aside.getBoundingClientRect().width).toBe(206)
  await expect(cs.paddingTop).toBe('18px')
  await expect(cs.paddingBottom).toBe('14px')
  await expect(cs.paddingLeft).toBe('0px')
  await expect(cs.borderRadius).toBe('20px')
  await expect(cs.backgroundColor).toBe(theme.card)
  for (const layer of theme.shadow) await expect(cs.boxShadow).toContain(layer)
  await expect(cs.overflow).toBe('hidden')
  const head = getComputedStyle(aside.querySelector<HTMLElement>('[data-part="rail-head"]')!)
  await expect(head.paddingLeft).toBe('16px')
  await expect(head.paddingRight).toBe('16px')
  await expect(head.paddingBottom).toBe('12px')
  // the row margin `0 8px` is the scroller's own padding, not a second margin
  const scroller = getComputedStyle(
    aside.querySelector<HTMLElement>('[data-part="rail-scroller"]')!
  )
  await expect(scroller.paddingLeft).toBe('8px')
  await expect(scroller.paddingRight).toBe('8px')
}

/** The row formula: two sizes, two weights, two ink tiers; no fixed height; guides at .09; chevron .68; tools .8. */
async function assertRows(canvasElement: HTMLElement, theme: Theme) {
  const aside = canvasElement.querySelector<HTMLElement>('aside')!
  // no fixed row height anywhere — the row is padding 5px around the type
  await expect(aside.querySelector('.h-\\[34px\\]')).toBeNull()
  for (const row of aside.querySelectorAll<HTMLElement>('[role="treeitem"]')) {
    const h = row.getBoundingClientRect().height
    await expect(h).toBeGreaterThan(18)
    await expect(h).toBeLessThan(30)
    const rs = getComputedStyle(row)
    await expect(rs.paddingTop).toBe('5px')
    await expect(rs.paddingBottom).toBe('5px')
    await expect(rs.paddingRight).toBe('8px')
    await expect(rs.paddingLeft).toBe('4px')
    await expect(rs.borderRadius).toBe('10px')
    await expect(rs.columnGap).toBe('7px')
  }

  // area rows (depth ≤ 1): 13.5 / 500 / full ink
  for (const name of [/life/, /Health/, /Personal/]) {
    const cs = getComputedStyle(item(aside, name))
    await expect(cs.fontSize).toBe('13.5px')
    await expect(cs.fontWeight).toBe('500')
    await expect(cs.color).toBe(theme.inkStr)
    await expect(alphaOf(cs.backgroundColor)).toBe(0) // transparent at rest
  }
  // nested, unselected: 13 / 400 / ink .68
  const trips = item(aside, /Trips/)
  const ts = getComputedStyle(trips)
  await expect(ts.fontSize).toBe('13px')
  await expect(ts.fontWeight).toBe('400')
  await expect(ts.color).toBe(theme.ink68)
  await expect(getComputedStyle(titleOf(trips)).color).toBe(theme.ink68)
  // selected nested: 13 / 500 / full ink on ink .07
  const sleep = item(aside, /Sleep/)
  const ss = getComputedStyle(sleep)
  await expect(ss.fontSize).toBe('13px')
  await expect(ss.fontWeight).toBe('500')
  await expect(ss.color).toBe(theme.inkStr)
  await expect(ss.backgroundColor).toBe(theme.ink07)

  // guides: one 9px span per level, hairline ink .09 — ONE value, no on-path brightening
  const guides = sleep.querySelectorAll<HTMLElement>('[data-part="guides"] > span')
  await expect(guides).toHaveLength(2)
  for (const g of guides) {
    const gs = getComputedStyle(g)
    await expect(gs.borderLeftWidth).toBe('1px')
    await expect(alphaOf(gs.borderLeftColor)).toBeCloseTo(0.09, 2)
    await expectInk(gs.borderLeftColor, theme)
    await expect(gs.width).toBe('9px')
    await expect(gs.marginLeft).toBe('4px')
    await expect(gs.marginTop).toBe('-5px')
    await expect(gs.marginBottom).toBe('-5px')
  }
  await expect(getComputedStyle(sleep.querySelector('[data-part="guides"]')!).marginRight).toBe(
    '-7px'
  )
  // the selection's ancestor carries the same hairline as everyone else
  const ancestorGuide = item(aside, /Health/).querySelector<HTMLElement>(
    '[data-part="guides"] > span'
  )!
  await expect(alphaOf(getComputedStyle(ancestorGuide).borderLeftColor)).toBeCloseTo(0.09, 2)

  // chevron: ink .68, 9 × 9 on a 0 0 9 9 box, rotated 90° when OPEN
  const caret = item(aside, /Health/).querySelector<HTMLElement>('button[aria-hidden]')!
  await expect(getComputedStyle(caret).color).toBe(theme.ink68)
  await expect(caret.getBoundingClientRect().width).toBe(9)
  const svg = caret.querySelector('svg')!
  await expect(svg.getAttribute('viewBox')).toBe('0 0 9 9')
  // open → rotate(90deg); closed → none. (Tailwind v4's `rotate-90` writes the
  // individual `rotate` property, which composes to the same transform.)
  await expect(getComputedStyle(svg).rotate).toBe('90deg')
  const closedSvg = item(aside, /Food/).querySelector('svg')!
  await expect(getComputedStyle(closedSvg).rotate).toBe('none')
  // a leaf's chevGap is 9 too, so labels line up
  const gap = trips.querySelector<HTMLElement>('[data-part="guides"] + span')!
  await expect(gap.getBoundingClientRect().width).toBe(9)

  // tools: ink .8 at rest
  const tools = trips.querySelector<HTMLElement>('[data-part="tools"]')!
  await expect(alphaOf(getComputedStyle(tools).color)).toBeCloseTo(0.8, 2)
  await expectInk(getComputedStyle(tools).color, theme)
  for (const b of tools.querySelectorAll('button')) {
    await expect(b.getBoundingClientRect().width).toBe(12)
  }

  // Life's mark is INK by default — never sage
  const lifeMark = item(aside, /life/).querySelector<HTMLElement>('[data-area-mark]')!
  await expect(getComputedStyle(lifeMark).color).toBe(theme.inkStr)

  // the group gap: `marginTop: 4` on depth-1 rows only (not the first row, no pinned band)
  await expect(getComputedStyle(item(aside, /Personal/)).marginTop).toBe('4px')
  await expect(getComputedStyle(item(aside, /life/)).marginTop).toBe('0px')
  await expect(getComputedStyle(sleep).marginTop).toBe('0px')
}

/**
 * Hover (ADR 0004 §6): the ground is INK .05 — not the board's
 * `rgba(100,143,123,.07)` sage, and not `.07` either (that is the selected
 * fill). The rest of the board's hover delta IS built: the label raises to full
 * ink and the tools are revealed.
 */
async function assertHover(canvasElement: HTMLElement, theme: Theme) {
  const aside = canvasElement.querySelector<HTMLElement>('aside')!
  const trips = item(aside, /Trips/)
  await userEvent.hover(trips)
  const hs = getComputedStyle(trips)
  await expect(alphaOf(hs.backgroundColor)).toBeCloseTo(0.05, 2)
  await expectInk(hs.backgroundColor, theme)
  await expect(hs.backgroundColor).not.toContain('100, 143, 123')
  await expect(trips.className).toContain('bg-mn-text/5')
  await expect(trips.className).not.toMatch(/sage|area-a/)
  // hover ≠ selected: the selected row keeps .07
  await expect(getComputedStyle(item(aside, /Sleep/)).backgroundColor).toBe(theme.ink07)
  // the label raises from ink .68 to FULL ink
  await expect(hs.color).toBe(theme.inkStr)
  await expect(getComputedStyle(titleOf(trips)).color).toBe(theme.inkStr)
  await userEvent.unhover(trips)
  await expect(getComputedStyle(trips).color).toBe(theme.ink68)
  await expect(alphaOf(getComputedStyle(trips).backgroundColor)).toBe(0)
}

/** Paper: the row formula, measured. */
export const RowsPaper: Story = {
  args: { tree: WIDE_TREE, expanded: new Set(['health', 'personal']), selectedId: 'sleep' },
  play: async ({ canvasElement }) => {
    await assertChrome(canvasElement, LIGHT)
    await assertRows(canvasElement, LIGHT)
    await assertHover(canvasElement, LIGHT)
  },
}

/** Ink: the same formula on the dark card — ink flips to paper, the card to #30312A. */
export const RowsInk: Story = {
  args: { tree: WIDE_TREE, expanded: new Set(['health', 'personal']), selectedId: 'sleep' },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => {
    await assertChrome(canvasElement, DARK)
    await assertRows(canvasElement, DARK)
    await assertHover(canvasElement, DARK)
  },
}

/** `hint`: 12.5 / 1.5 / ink .68, `margin 8px 16px 0 34px` from the body edge, all-lowercase copy. */
async function assertEmpty(canvasElement: HTMLElement, theme: Theme) {
  const aside = canvasElement.querySelector<HTMLElement>('aside')!
  const hint = within(aside).getByRole('status')
  await expect(hint).toHaveTextContent('no pages yet. ＋ new page, or ask pond to start one.')
  const cs = getComputedStyle(hint)
  await expect(cs.fontSize).toBe('12.5px')
  await expect(cs.lineHeight).toBe('18.75px')
  await expect(cs.color).toBe(theme.ink68)
  await expect(cs.marginTop).toBe('8px')
  const body = aside.querySelector<HTMLElement>('[data-part="rail-body"]')!.getBoundingClientRect()
  const hr = hint.getBoundingClientRect()
  await expect(hr.left - body.left).toBe(34)
  await expect(body.right - hr.right).toBe(16)
  // immediately after the (only) row
  const life = item(aside, /life/).getBoundingClientRect()
  await expect(hr.top - life.bottom).toBe(8)
}

export const EmptyPaper: Story = {
  args: { tree: [], isEmpty: true },
  play: async ({ canvasElement }) => assertEmpty(canvasElement, LIGHT),
}
export const EmptyInk: Story = {
  args: { tree: [], isEmpty: true },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertEmpty(canvasElement, DARK),
}

/** `skelWrap`: padding 8px 20px, gap 14; eight bars h 9 / r 5 / ink .08 at 0 / 14 / 28 — and no animation. */
async function assertLoading(canvasElement: HTMLElement) {
  const aside = canvasElement.querySelector<HTMLElement>('aside')!
  const stack = aside.querySelector<HTMLElement>('[data-part="rail-skeleton"]')!
  const wrap = getComputedStyle(stack.parentElement!)
  await expect(wrap.paddingTop).toBe('8px')
  await expect(wrap.paddingLeft).toBe('20px')
  await expect(wrap.paddingRight).toBe('20px')
  await expect(getComputedStyle(stack).rowGap).toBe('14px')
  const bars = stack.querySelectorAll<HTMLElement>(':scope > span')
  await expect(bars).toHaveLength(8)
  const widths = [40, 62, 54, 70, 48, 66, 58, 44]
  for (let i = 0; i < 8; i++) {
    const bs = getComputedStyle(bars[i])
    await expect(bs.height).toBe('9px')
    await expect(bs.borderRadius).toBe('5px')
    await expect(alphaOf(bs.backgroundColor)).toBeCloseTo(0.08, 2)
    await expect(bs.marginLeft).toBe(`${(i % 3) * 14}px`)
    await expect(bars[i].style.width).toBe(`${widths[i]}%`)
    await expect(bs.animationName).toBe('none')
  }
}

export const LoadingPaper: Story = {
  args: { tree: [], isLoading: true },
  play: async ({ canvasElement }) => assertLoading(canvasElement),
}
export const LoadingInk: Story = {
  args: { tree: [], isLoading: true },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertLoading(canvasElement),
}

const DB_TREE: RailNode[] = [
  ...WIDE_TREE,
  node('root-db', 'page', 'databases', [node('db-1', 'page', 'ingredients', [], 0, 'root-db')], 9),
]

/** `foot`: hairline .09, padding 10px 8px 0, gap 2; `dbRow` 13.5 / 500 / gap 9 / 6px 8px; `newRow` 12.5 / ink .68. */
async function assertFoot(canvasElement: HTMLElement, theme: Theme, dbSelected: boolean) {
  const aside = canvasElement.querySelector<HTMLElement>('aside')!
  const foot = aside.querySelector<HTMLElement>('[data-part="rail-foot"]')!
  const fs = getComputedStyle(foot)
  await expect(fs.borderTopWidth).toBe('1px')
  // `a(.09)` in BOTH themes — the board's value, not the .12 dark `--mn-line` role
  await expect(alphaOf(fs.borderTopColor)).toBeCloseTo(0.09, 2)
  await expectInk(fs.borderTopColor, theme)
  await expect(fs.paddingTop).toBe('10px')
  await expect(fs.paddingLeft).toBe('8px')
  await expect(fs.paddingRight).toBe('8px')
  await expect(fs.rowGap).toBe('2px')

  // ONE flat databases row, no chevron, no children, and no second tree
  await expect(within(aside).getAllByRole('tree')).toHaveLength(1)
  await expect(within(aside).queryByText('ingredients')).toBeNull()
  const db = within(foot).getByRole('button', { name: 'databases' })
  const ds = getComputedStyle(db)
  await expect(ds.fontSize).toBe('13.5px')
  await expect(ds.fontWeight).toBe('500')
  await expect(ds.color).toBe(theme.inkStr)
  await expect(ds.columnGap).toBe('9px')
  await expect(ds.paddingTop).toBe('6px')
  await expect(ds.paddingLeft).toBe('8px')
  await expect(ds.borderRadius).toBe('10px')
  await expect(db.querySelector('svg')).not.toBeNull()
  await expect(db.querySelector('button')).toBeNull()
  if (dbSelected) await expect(ds.backgroundColor).toBe(theme.ink07)
  else await expect(alphaOf(ds.backgroundColor)).toBe(0)

  const plus = within(foot).getByRole('button', { name: 'New page' })
  const ps = getComputedStyle(plus)
  await expect(ps.fontSize).toBe('12.5px')
  await expect(ps.color).toBe(theme.ink68)
  await expect(ps.paddingTop).toBe('6px')
  await expect(ps.paddingLeft).toBe('8px')
  // dbRow sits ABOVE newRow
  await expect(db.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    plus.getBoundingClientRect().top
  )
}

export const FootPaper: Story = {
  args: { tree: DB_TREE },
  play: async ({ canvasElement, args }) => {
    await assertFoot(canvasElement, LIGHT, false)
    const db = within(canvasElement).getByRole('button', { name: 'databases' })
    await userEvent.click(db)
    await expect(args.onSelect).toHaveBeenCalledWith('root-db')
  },
}
export const FootInk: Story = {
  args: { tree: DB_TREE, selectedId: 'root-db' },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertFoot(canvasElement, DARK, true),
}
