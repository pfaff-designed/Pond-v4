import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { ComponentProps } from 'react'
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test'

import { RailView, type RailNode } from './Rail'
import { LIFE_GLYPH } from '@/lib/rail/area-glyph'
import type { AreaRole } from '@/lib/rail/glyph-library'
import { derivedRole, type MarkSource } from '@/lib/pages/mark'

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
    // The root row carries its mark and name only.
    await expect(canvas.getByRole('treeitem', { name: /life/ })).not.toHaveTextContent(/\ball\b/)
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

/**
 * An expanded area folder shows its leaves; a nested sub-area stays a folder.
 *
 * #95 (the TreeRow absorption): every visible row is a presentational
 * `PondMolecule kind="list-row"` hosted by exactly one interactive `treeitem` —
 * one molecule per row, no row drawn by hand and none left behind.
 */
export const Expanded: Story = {
  args: { expanded: new Set(['health', 'personal']), selectedId: 'sleep' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sleep')).toBeInTheDocument()
    await expect(canvas.getByText('Trips')).toBeInTheDocument()
    // nested sub-area folder is itself collapsed
    await expect(canvas.queryByText('Recipes')).not.toBeInTheDocument()

    // life + 4 top-level + Health's 2 + Personal's 2 = 9 visible rows.
    const items = canvas.getAllByRole('treeitem')
    const rows = [...canvasElement.querySelectorAll<HTMLElement>('[data-kind="list-row"]')]
    await expect(items).toHaveLength(9)
    await expect(rows).toHaveLength(items.length)
    for (const [i, row] of rows.entries()) {
      await expect(row.closest('[role="treeitem"]')).toBe(items[i])
    }
  },
}

/**
 * The board's row geometry, pinned on the treeitem HOST. `PondRail.dc.html`
 * renders its rows at `padding '5px 8px 5px 4px'` / `gap 7` / `radius 10` /
 * `line-height: normal`, with the 9px chevron INSIDE the padded row, measuring
 * 26px on an area row (13.5 type) and 25px below it (13 type). The label body
 * (the `list-row` molecule) carries none of that: no padding, no wash. #294 closed
 * a fixed 34px against those numbers; this story is what stops them drifting
 * back — the looseness is invisible in jsdom and in review, and only a real
 * browser catches it.
 */
export const BoardRowGeometry: Story = {
  args: { expanded: new Set(['health', 'personal']) },
  play: async ({ canvasElement }) => {
    const hosts = [...canvasElement.querySelectorAll<HTMLElement>('[role="treeitem"]')]
    await expect(hosts.length).toBeGreaterThan(4)

    for (const host of hosts) {
      const css = getComputedStyle(host)
      const depth = Number(host.getAttribute('aria-level')) - 1
      await expect(css.paddingTop).toBe('5px')
      await expect(css.paddingRight).toBe('8px')
      await expect(css.paddingBottom).toBe('5px')
      // 4 of board padding, plus one 14px step per level of depth
      await expect(css.paddingLeft).toBe(`${4 + 14 * depth}px`)
      if (depth === 0) await expect(css.padding).toBe('5px 8px 5px 4px')
      await expect(css.columnGap).toBe('7px')
      await expect(css.borderTopLeftRadius).toBe('10px')

      // the chevron / leaf spacer is the first in-flow child, 9 wide, inside the row
      const slot = [...host.children].find((c) => getComputedStyle(c).position !== 'absolute')!
      await expect(getComputedStyle(slot).width).toBe('9px')

      // the label body is bare: no padding of its own
      const body = host.querySelector<HTMLElement>('[data-kind="list-row"]')!
      await expect(getComputedStyle(body).padding).toBe('0px')
      // the board's metric leading, not Tailwind's preflight 1.5 (= 20.25px here)
      await expect(getComputedStyle(body).lineHeight).toBe('normal')
    }

    const heightAt = (size: string) =>
      hosts
        .filter(
          (h) => getComputedStyle(h.querySelector('[data-kind="list-row"]')!).fontSize === size
        )
        .map((h) => Math.round(h.getBoundingClientRect().height))

    // the board's own split: areas carry 13.5 type, everything deeper 13
    const areas = heightAt('13.5px')
    const nested = heightAt('13px')
    await expect(areas.length).toBeGreaterThan(0)
    await expect(nested.length).toBeGreaterThan(0)
    await expect([...new Set(areas)]).toEqual([26])
    await expect([...new Set(nested)]).toEqual([25])
  },
}

/**
 * ARIA coordinates: levels and sibling positions come from the flattened tree —
 * and a folder states its own open/shut (`aria-expanded`), while a leaf omits
 * the attribute entirely rather than claiming to be a collapsed folder.
 */
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
    await expect(health).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByRole('treeitem', { name: /Personal/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    // A real leaf omits the attribute rather than claiming hidden content. Note
    // `isFolderNode` counts EVERY top-level page as a folder (so childless
    // `Scratchpad` does carry aria-expanded="false" — it is an area you can open
    // and add into); only a NESTED childless row is a leaf to the tree.
    await expect(canvas.getByRole('treeitem', { name: /Sleep/ })).not.toHaveAttribute(
      'aria-expanded'
    )
    const sleep = canvas.getByRole('treeitem', { name: /Sleep/ })
    await expect(sleep).toHaveAttribute('aria-level', '3')
    await expect(sleep).toHaveAttribute('aria-posinset', '1')
    await expect(sleep).toHaveAttribute('aria-setsize', '2')
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
 * The tools reserve no width at rest — the label owns the whole row — and
 * appear on keyboard focus-within as well as on hover.
 */
export const HoverCrudReservesNoWidth: Story = {
  play: async ({ canvas }) => {
    const scratch = canvas.getByRole('treeitem', { name: /Scratchpad/ })
    const tools = canvas.getByRole('button', { name: 'Delete Scratchpad' }).parentElement!
    await expect(tools.getBoundingClientRect().width).toBe(0)
    await expect(getComputedStyle(tools).opacity).toBe('0')
    const title = scratch.querySelector<HTMLElement>('[data-part="title"]')!
    const row = scratch.getBoundingClientRect()
    // 8px right padding is all that sits between the label's box and the row's edge
    await expect(Math.round(row.right - title.getBoundingClientRect().right)).toBe(8)

    canvas.getByRole('button', { name: 'Delete Scratchpad' }).focus()
    await waitFor(() => expect(getComputedStyle(tools).opacity).toBe('1'))
    await expect(tools.getBoundingClientRect().width).toBeGreaterThan(24)
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
 * shadow, radius 20, 206 wide, no backdrop blur) headed by the pond's glyph and
 * name (13.5 / 500, full ink) with the reminders bell at
 * the right. With no pond provider there are no ponds, so no switcher button and
 * no chevron — and the bell is decorative, never a button.
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
    await expect(name).toHaveClass('font-medium')
    await expect(name).not.toHaveClass('uppercase')
    await expect(head.querySelector('[data-pond-mark]')).not.toBeNull()
    await expect(head.querySelector('button')).toBeNull()
    await expect(head.querySelector('[data-part="reminders-bell"]')).not.toBeNull()
  },
}

/**
 * The foot is the databases root and `settings`, and nothing else — no
 * "＋ new page". `settings` has no surface yet, so it is plain text with a gear:
 * not a button, not a tab stop.
 */
export const FootSettings: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByRole('button', { name: 'New page' })).not.toBeInTheDocument()
    const settings = canvasElement.querySelector<HTMLElement>('[data-part="settings"]')!
    await expect(settings).toHaveTextContent('settings')
    await expect(settings.tagName).toBe('DIV')
    await expect(settings.querySelector('button, a, [tabindex]')).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'settings' })).not.toBeInTheDocument()
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

/** Empty = `PondRail`'s hint, pointing at the foot's ＋ and at Pond. */
export const Empty: Story = {
  args: { tree: [], isEmpty: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'no pages yet. ＋ new page, or ask pond to start one.'
    )
  },
}

// ════════════════════════════════════════════════════════════════════════════
// Relocated from jest (`shell-reskin`, `glyph-marks`, `rail-databases-root`).
//
// Everything below asserts the COMPUTED value against the board literal, in a
// real Chromium with the real CSS — not the Tailwind class string that is
// supposed to produce it. #252 shipped an error line at the wrong ink tier with
// the right class name present, which is exactly the hole a class assertion
// leaves open.
// ════════════════════════════════════════════════════════════════════════════

/**
 * `PondRail`, measured: `rail.background '#FAF9EF'` / `borderRadius 20` /
 * `boxShadow '0 1px 2px rgba(40,34,24,.04),0 8px 24px rgba(40,34,24,.06)'` /
 * `width 206`. Light is ONE paper (ground and card the same `#FAF9EF`), so the
 * card reads by shadow alone; dark flips `--mn-card` to `#30312A` over a
 * `#1B1D14` ground. A raw never moves — only the role reassigns.
 */
const PAPER = {
  light: {
    ground: 'rgb(250, 249, 239)',
    card: 'rgb(250, 249, 239)',
    // `--mn-shadow-card`, resolved. The dark ground needs a heavier shadow to
    // read at all, so the ROLE is reassigned there — which the jest spec never
    // saw: it scraped the `:root` block only, so the dark card's shadow was
    // asserted nowhere and could have been dropped silently.
    shadow: 'rgba(40, 34, 24, 0.04) 0px 1px 2px 0px, rgba(40, 34, 24, 0.06) 0px 8px 24px 0px',
  },
  dark: {
    ground: 'rgb(27, 29, 20)',
    card: 'rgb(48, 49, 42)',
    shadow: 'rgba(0, 0, 0, 0.3) 0px 1px 2px 0px, rgba(0, 0, 0, 0.34) 0px 8px 24px 0px',
  },
} as const

/** `--mn-area-{a,b,c}` resolved: sage · mist · navy, navy→mist on dark (1g). */
const AREA: Record<'light' | 'dark', Record<AreaRole, string>> = {
  light: {
    'area-a': 'rgb(100, 143, 123)',
    'area-b': 'rgb(165, 200, 209)',
    'area-c': 'rgb(18, 53, 78)',
  },
  dark: {
    'area-a': 'rgb(100, 143, 123)',
    'area-b': 'rgb(165, 200, 209)',
    'area-c': 'rgb(165, 200, 209)',
  },
}

type Theme = 'light' | 'dark'
const THEMES: Theme[] = ['light', 'dark']

/**
 * Mounts the rail twice — once under `.dark` — so every value below is pinned as
 * the pixel the theme actually produces rather than once, in whichever theme the
 * runner happened to boot in.
 */
function BothThemes(args: ComponentProps<typeof RailView>) {
  return (
    <div className="flex h-screen">
      {THEMES.map((theme) => (
        <div
          key={theme}
          data-theme-probe={theme}
          className={`flex bg-mn-surface ${theme === 'dark' ? 'dark' : ''}`}
        >
          <RailView {...args} />
        </div>
      ))}
    </div>
  )
}

const probe = (root: HTMLElement, theme: Theme) =>
  root.querySelector<HTMLElement>(`[data-theme-probe="${theme}"]`)!

/**
 * The rail is a floating PAPER card, in pixels, in both themes — and its head is
 * the pond's glyph and name.
 *
 * The paper is read off the element rather than inferred from class names: the
 * classes could all be right while the roles behind them (`--mn-surface`,
 * `--mn-card`, `--mn-radius-card`, `--mn-shadow-card`) resolved to the wrong paper.
 *
 * Head: the 13px pond glyph, the name at 13.5 / 500 in full ink,
 * `padding 0 16px 12px`, centred, `gap 8`.
 */
export const PaperCardComputed: Story = {
  render: (args) => <BothThemes {...args} />,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      const scope = probe(canvasElement, theme)
      const aside = scope.querySelector('aside')!
      const css = getComputedStyle(aside)

      // one sheet, by role: light's card IS the ground paper; dark steps up
      await expect(css.backgroundColor).toBe(PAPER[theme].card)
      await expect(getComputedStyle(scope).backgroundColor).toBe(PAPER[theme].ground)
      await expect(css.borderTopLeftRadius).toBe('20px')
      await expect(css.borderBottomRightRadius).toBe('20px')
      // Separated by shadow, not borders. Tailwind's utility stacks four
      // transparent ring/inset placeholders ahead of the real shadow, so the
      // board's two layers are asserted as the TAIL of the computed stack.
      await expect(css.boxShadow.endsWith(PAPER[theme].shadow)).toBe(true)
      await expect(css.backdropFilter).toBe('none')
      await expect(css.borderRightWidth).toBe('0px')
      await expect(Math.round(aside.getBoundingClientRect().width)).toBe(206)

      const head = aside.querySelector<HTMLElement>('[data-part="rail-head"]')!
      const name = head.querySelector<HTMLElement>('[data-part="pond-name"]')!
      const type = getComputedStyle(name)
      await expect(type.fontSize).toBe('13.5px')
      await expect(type.fontWeight).toBe('500')
      await expect(type.textTransform).toBe('none')
      await expect(type.letterSpacing).toBe('normal')
      await expect(type.color).toBe(theme === 'light' ? 'rgb(27, 29, 20)' : 'rgb(250, 249, 239)')
      await expect(type.fontFamily).toContain('PP Neue Montreal')
      // The pond's own 13px mark, a plain mask in the name's colour — not an area mark.
      const mark = head.querySelector<HTMLElement>('[data-pond-mark] [data-icon]')!
      await expect(mark.getAttribute('data-icon')).toBe(LIFE_GLYPH)
      await expect(mark.style.width).toBe('13px')
      await expect(head.querySelector('[data-area-mark]')).toBeNull()

      // `head`: padding 0 16px 12px, name left / bell right, centred, gap 8.
      const headCss = getComputedStyle(head)
      await expect(headCss.padding).toBe('0px 16px 12px')
      await expect(headCss.justifyContent).toBe('space-between')
      await expect(headCss.alignItems).toBe('center')
      await expect(headCss.columnGap).toBe('8px')
      // `switcher`: gap 7, padding 4px 6px, margin -4px -6px, radius 8.
      const switcherCss = getComputedStyle(name.parentElement!)
      await expect(switcherCss.columnGap).toBe('7px')
      await expect(switcherCss.padding).toBe('4px 6px')
      await expect(switcherCss.margin).toBe('-4px -6px')
      await expect(switcherCss.borderTopLeftRadius).toBe('8px')
      // With no pond provider there are no ponds: no switcher button, and the bell
      // is not one.
      await expect(head.querySelector('button')).toBeNull()

      // The reminders bell: 12×12, stroke 1.4, the .8 ink tier, a decorative mark
      // outside the ARIA tree that is neither a button nor a tab stop (#198 owns
      // its behaviour).
      const bell = head.querySelector<HTMLElement>('[data-part="reminders-bell"]')!
      await expect(bell).not.toBeNull()
      await expect(bell.closest('[role="tree"]')).toBeNull()
      await expect(bell.getAttribute('aria-hidden')).toBe('true')
      await expect(bell.hasAttribute('tabindex')).toBe(false)
      const bellBox = bell.getBoundingClientRect()
      await expect(bellBox.width).toBe(12)
      await expect(bellBox.height).toBe(12)
      await expect(bell.getAttribute('viewBox')).toBe('0 0 14 14')
      await expect(getComputedStyle(bell).strokeWidth).toBe('1.4px')
      await expect(getComputedStyle(bell).color).toBe(
        theme === 'light' ? 'rgba(27, 29, 20, 0.8)' : 'rgba(250, 249, 239, 0.8)'
      )
    }
  },
}

/**
 * #91's glyph wiring, with no chosen marks anywhere: a mapped area row leads
 * with its DEFAULT glyph, tinted with the area role its id derives, and drops
 * its dot; an unmapped top-level area keeps its `KindDot`; a nested page carries
 * neither. The Life root leads with its waves glyph in ink (`var(--mn-text)`), not an
 * area hue — #229 paints a hue there only once a person picks one.
 *
 * The tint is read as a COLOUR, in both themes, against `--mn-area-*` resolved:
 * `glyph-marks` matched `/^var\(--mn-area-[abc]\)$/` on the inline style, which
 * a theme that resolved the role to the wrong hue would still satisfy — and
 * `area-c` is the one that genuinely differs (navy → mist on dark).
 */
export const DerivedAreaMarks: Story = {
  args: {
    // 'Financial' is what pre-#108 seeds wrote; the map still answers for it.
    tree: [...TREE, node('fin', 'page', 'Financial', [], 4)],
    expanded: new Set(['health', 'personal']),
  },
  render: (args) => <BothThemes {...args} />,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      const canvas = within(probe(canvasElement, theme))
      const row = (name: RegExp) => canvas.getByRole('treeitem', { name })

      // The Life root: its glyph, in ink — and no hand-drawn half-disc left over.
      const life = row(/life/)
      await expect(life.querySelector(`[data-icon="${LIFE_GLYPH}"]`)).toBeInTheDocument()
      await expect(life.querySelector('circle')).toBeNull()
      const lifeSlot = life.querySelector<HTMLElement>('[data-area-mark]')!
      await expect(getComputedStyle(lifeSlot).color).toBe(
        theme === 'light' ? 'rgb(27, 29, 20)' : 'rgb(250, 249, 239)'
      )

      // Mapped areas lead with their fixed default glyph, in the derived role's
      // hue, and the dot retires. `areaGlyph`'s own table is pure logic and stays
      // in jest; what is pinned here is that the rail WIRES it through.
      const MAPPED: [RegExp, string, string][] = [
        [/Health/, 'leaf-01', 'health'],
        [/Personal/, 'house', 'personal'],
        [/Creativity/, 'flower-05', 'creativity'],
        [/Financial/, 'stairs-01', 'fin'],
      ]
      for (const [name, glyph, id] of MAPPED) {
        const el = row(name)
        await expect(el.querySelector(`[data-icon="${glyph}"]`)).toBeInTheDocument()
        await expect(el.querySelector('[data-part="dot"]')).toBeNull()
        const slot = el.querySelector<HTMLElement>('[data-area-mark]')!
        await expect(getComputedStyle(slot).color).toBe(AREA[theme][derivedRole(id)])
        // The board draws the mark at 13 square (`PondRail.rows[].mark`).
        const mark = slot.querySelector<HTMLElement>('[data-icon]')!.getBoundingClientRect()
        await expect(mark.width).toBe(13)
        await expect(mark.height).toBe(13)
      }

      // An unmapped TOP-LEVEL area still speaks the area voice — through the dot.
      const scratch = row(/Scratchpad/)
      await expect(scratch.querySelector('[data-icon]')).toBeNull()
      await expect(scratch.querySelector('[data-part="dot"]')).toBeInTheDocument()

      // Nested pages carry no glyph until someone chooses one (#108); like every
      // row without a glyph they draw the dot.
      for (const name of [/Sleep/, /Food/, /Trips/]) {
        await expect(row(name).querySelector('[data-icon]')).toBeNull()
        await expect(row(name).querySelector('[data-part="dot"]')).toBeInTheDocument()
      }
    }
  },
}

/**
 * #134, all four cases in one pond: a chosen mark beats the derived one, and the
 * ROLE is inherited from the nearest ancestor that carries one.
 *
 * The ancestor walk is the load-bearing part and it is silent when broken — the
 * first version of these tests all passed with `resolveMark`'s walk destroyed,
 * because each set the role on the very row it asserted. Here `Sleep` carries a
 * glyph and NO role while `Health` carries the role, so breaking the walk fails
 * this story. The dot-only case was unreachable for a different silent reason:
 * the dot was gated on `isArea` as well as on the accent, so a hue chosen on a
 * nested page showed in the breadcrumb and the kicker and nowhere in the rail.
 */
export const ChosenMarks: Story = {
  args: {
    expanded: new Set(['health', 'personal']),
    marks: new Map<string, MarkSource>([
      // top-level: its own glyph AND its own role
      [
        'health',
        { id: 'health', parentId: null, title: 'Health', glyph: 'tulip-01', areaRole: 'area-c' },
      ],
      // nested: its own glyph, no role — the hue must come from Health
      ['sleep', { id: 'sleep', parentId: 'health', title: 'Sleep', glyph: 'moon' }],
      // nested: a COLOUR only — no glyph, so the dot carries it
      [
        'marathon',
        { id: 'marathon', parentId: 'health', title: 'Marathon Training', areaRole: 'area-b' },
      ],
      // nested: untouched
      ['trips', { id: 'trips', parentId: 'personal', title: 'Trips' }],
      ['personal', { id: 'personal', parentId: null, title: 'Personal' }],
    ]),
  },
  render: (args) => <BothThemes {...args} />,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      const canvas = within(probe(canvasElement, theme))
      const row = (name: RegExp) => canvas.getByRole('treeitem', { name })
      const slotColor = (name: RegExp) =>
        getComputedStyle(row(name).querySelector<HTMLElement>('[data-area-mark]')!).color

      // 1. the chosen glyph wins over the title-derived leaf
      const health = row(/Health/)
      await expect(health.querySelector('[data-icon="tulip-01"]')).toBeInTheDocument()
      await expect(health.querySelector('[data-icon="leaf-01"]')).toBeNull()
      await expect(slotColor(/Health/)).toBe(AREA[theme]['area-c'])

      // 2. the nested glyph is tinted with the role INHERITED from its area
      const sleep = row(/Sleep/)
      await expect(sleep.querySelector('[data-icon="moon"]')).toBeInTheDocument()
      await expect(slotColor(/Sleep/)).toBe(AREA[theme]['area-c'])

      // 3. colour only → the KindDot carries it (7×7, 2px radius — `PondAtom`)
      const dot = row(/Marathon/).querySelector<HTMLElement>('[data-part="dot"]')!
      await expect(dot).toBeInTheDocument()
      await expect(getComputedStyle(dot).backgroundColor).toBe(AREA[theme]['area-b'])
      await expect(row(/Marathon/).querySelector('[data-icon]')).toBeNull()

      // 4. untouched nested row: no glyph, just the ink dot. Asserted as the
      //    ABSENCE of the glyph element — an earlier version read a style off a
      //    node that was never there, so it could not have failed.
      await expect(row(/Trips/).querySelector('[data-icon]')).toBeNull()
      await expect(row(/Trips/).querySelector('[data-part="dot"]')).toBeInTheDocument()
    }
  },
}

/**
 * The pond's SECOND root (`Pond 03 Concepts` 3c: "two roots: life for reading,
 * databases for data" — peers, one beside the other). `PondRail` draws it in the
 * FOOT band, under the one hairline: its own ARIA tree, so the
 * structure says what the rail says rather than nesting data inside life.
 *
 * Geometry: `padding 6px 8px`
 * (the foot supplies the 10px under the hairline), `gap 9`, `font-size 13.5` /
 * `font-weight 500`, radius 10, and no chevron. Its mark is a hand-drawn
 * cylinder in `currentColor` — a FUNCTIONAL mark (stroke 1.4, round caps and
 * joins), not an area glyph, because the root is not one of Life's areas.
 */
const DATABASES: RailNode = node(
  'root-db',
  'page',
  'databases',
  [node('db-1', 'page', 'ingredients', [], 0, 'root-db')],
  9
)

export const DatabasesRoot: Story = {
  args: { tree: [...TREE, DATABASES], expanded: new Set(['root-db']) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Out of the Life tree…
    const life = canvas.getByRole('tree', { name: 'Workspace' })
    await expect(within(life).getByText('Health')).toBeInTheDocument()
    await expect(within(life).queryByText('databases')).not.toBeInTheDocument()

    // …and into its own, with its databases nested under it — in the foot band,
    // not the scrolling body.
    const foot = canvas.getByRole('tree', { name: 'Databases' })
    await expect(within(foot).getByText('databases')).toBeInTheDocument()
    await expect(within(foot).getByText('ingredients')).toBeInTheDocument()
    await expect(foot.closest('[data-part="rail-foot"]')).not.toBeNull()
    await expect(life.parentElement!.contains(foot)).toBe(false)

    // A functional mark, not an area one — and so no area hue to disagree with.
    const rootRow = canvas.getByRole('treeitem', { name: /databases/ })
    const svg = rootRow.querySelector<SVGSVGElement>('svg[stroke="currentColor"]')!
    await expect(svg).toBeInTheDocument()
    await expect(svg.getAttribute('stroke-width')).toBe('1.4')
    await expect(svg.getAttribute('stroke-linecap')).toBe('round')
    await expect(svg.getAttribute('stroke-linejoin')).toBe('round')
    await expect(rootRow.querySelector('[data-area-mark]')).toBeNull()
    await expect(rootRow.querySelector('[data-part="dot"]')).toBeNull()

    // The board's row metrics, computed — `dbRow` is a 13.5 / 500 / radius-10
    // row, the same recipe as an area row (it is a root, so it reads as one).
    // The weight rides the title span, which is where the molecule puts the
    // area emphasis; the row box itself stays at the sans's 400.
    const body = rootRow.querySelector<HTMLElement>('[data-kind="list-row"]')!
    const css = getComputedStyle(body)
    await expect(css.fontSize).toBe('13.5px')
    await expect(css.borderTopLeftRadius).toBe('10px')
    const title = body.querySelector<HTMLElement>('[data-part="title"]')!
    await expect(getComputedStyle(title).fontWeight).toBe('500')

    // The row box: padding 6px 8px, the mark and label 9px apart, and no caret
    // slot — the mark is the first thing in the row.
    const rowCss = getComputedStyle(rootRow)
    await expect(rowCss.padding).toBe('6px 8px')
    await expect(rowCss.columnGap).toBe('9px')
    await expect(css.columnGap).toBe('9px')
    await expect(rootRow).toHaveAttribute('aria-expanded', 'true')
    const inFlow = [...rootRow.children].filter((c) => getComputedStyle(c).position !== 'absolute')
    await expect(inFlow).toEqual([body])
    await expect(rootRow.querySelector('button[aria-hidden="true"]')).toBeNull()
    // 8px foot padding + 8px row padding = the mark at x 16 from the rail's edge.
    const aside = canvasElement.querySelector('aside')!
    const markLeft = svg.getBoundingClientRect().left - aside.getBoundingClientRect().left
    await expect(Math.abs(markLeft - 16)).toBeLessThan(0.01)
  },
}

/** One keyboard order across both trees: ↓ from Life's last row lands on databases, ↑ returns. */
export const KeyboardIntoDatabases: Story = {
  args: { tree: [...TREE, DATABASES], expanded: new Set(['root-db']) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const lastLifeRow = canvas.getByRole('treeitem', { name: /Scratchpad/ })
    const databases = canvas.getByRole('treeitem', { name: /databases/ })

    lastLifeRow.focus()
    await userEvent.keyboard('{ArrowDown}')
    await expect(databases).toHaveFocus()
    await expect(databases).toHaveAttribute('tabindex', '0')
    await expect(lastLifeRow).toHaveAttribute('tabindex', '-1')

    await userEvent.keyboard('{ArrowUp}')
    await expect(lastLifeRow).toHaveFocus()
    await expect(lastLifeRow).toHaveAttribute('tabindex', '0')
    await expect(databases).toHaveAttribute('tabindex', '-1')
  },
}

/** No databases, no tree: the rail never offers a root with nothing under it. */
export const NoDatabasesRoot: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('tree', { name: 'Databases' })
    ).not.toBeInTheDocument()
  },
}

/**
 * The row wash lives on the treeitem HOST, so it covers the caret and the indent
 * (`PondRail.dc.html` row `background`): selected = ink .07, hover = the rail-only
 * SAGE wash (.07 light / .14 dark). The `list-row` molecule inside is transparent —
 * its own `bg-mn-text/5` hover is the molecule's board, not the rail's.
 */
export const RowWashes: Story = {
  args: { expanded: new Set(['health']), selectedId: 'sleep' },
  render: (args) => <BothThemes {...args} />,
  play: async ({ canvasElement }) => {
    const WASH = {
      light: { hover: 'rgba(100, 143, 123, 0.07)', selected: 'rgba(27, 29, 20, 0.07)' },
      dark: { hover: 'rgba(100, 143, 123, 0.14)', selected: 'rgba(250, 249, 239, 0.07)' },
    } as const
    const CLEAR = 'rgba(0, 0, 0, 0)'
    const INK = { light: 'rgb(27, 29, 20)', dark: 'rgb(250, 249, 239)' } as const
    const INK_68 = { light: 'rgba(27, 29, 20, 0.68)', dark: 'rgba(250, 249, 239, 0.68)' } as const

    for (const theme of THEMES) {
      const canvas = within(probe(canvasElement, theme))
      const row = (name: RegExp) => canvas.getByRole('treeitem', { name })
      const bg = (el: Element) => getComputedStyle(el).backgroundColor
      const body = (host: HTMLElement) => host.querySelector('[data-kind="list-row"]')!

      const sleep = row(/Sleep/)
      await expect(bg(sleep)).toBe(WASH[theme].selected)
      await expect(bg(body(sleep))).toBe(CLEAR)
      // a selected NESTED row's title is 500 (`PondRail` `areaRow || isSel`); an
      // unselected nested row stays 400
      const titleOf = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-part="title"]')!
      await expect(getComputedStyle(titleOf(sleep)).fontWeight).toBe('500')
      await expect(getComputedStyle(titleOf(row(/Marathon/))).fontWeight).toBe('400')

      const health = row(/Health/)
      await expect(bg(health)).toBe(CLEAR)
      await userEvent.hover(health)
      await expect(bg(health)).toBe(WASH[theme].hover)
      await expect(bg(body(health))).toBe(CLEAR)
      await userEvent.unhover(health)
      await expect(bg(health)).toBe(CLEAR)

      // a hovered nested row's label lifts from ink-68 to full ink
      const marathon = row(/Marathon/)
      await expect(getComputedStyle(titleOf(marathon)).color).toBe(INK_68[theme])
      await userEvent.hover(marathon)
      await expect(getComputedStyle(titleOf(marathon)).color).toBe(INK[theme])
      await userEvent.unhover(marathon)
      await expect(getComputedStyle(titleOf(marathon)).color).toBe(INK_68[theme])

      // a hovered selected row keeps the selected wash
      await userEvent.hover(sleep)
      await expect(bg(sleep)).toBe(WASH[theme].selected)
      await userEvent.unhover(sleep)
    }
  },
}

/**
 * `PondRail` `dragging`: the source row quiets to .35 and a floating ghost chip —
 * dot + the row's title at 13, padding 6/10, radius 10, tilted -1.5deg, paper
 * (neutral-600 on dark) with the lifted shadow — follows the pointer.
 */
export const DragGhost: Story = {
  render: (args) => <BothThemes {...args} />,
  play: async ({ canvasElement }) => {
    const GHOST = {
      light: {
        bg: 'rgb(250, 249, 239)',
        shadow: 'rgba(27, 29, 20, 0.1) 0px 4px 12px 0px, rgba(27, 29, 20, 0.14) 0px 12px 32px 0px',
      },
      dark: { bg: 'rgb(74, 73, 64)', shadow: 'rgba(0, 0, 0, 0.45) 0px 8px 24px 0px' },
    } as const

    for (const theme of THEMES) {
      const scope = probe(canvasElement, theme)
      const health = within(scope).getByRole('treeitem', { name: /Health/ })
      await expect(scope.querySelector('[data-part="drag-ghost"]')).toBeNull()
      // a revealed row settles in over --motion-settle; wait for it to land
      await waitFor(() => expect(getComputedStyle(health).opacity).toBe('1'))

      await fireEvent.dragStart(health, { dataTransfer: new DataTransfer() })
      await waitFor(() => expect(scope.querySelector('[data-part="drag-ghost"]')).not.toBeNull())
      await expect(getComputedStyle(health).opacity).toBe('0.35')

      const ghost = scope.querySelector<HTMLElement>('[data-part="drag-ghost"]')!
      const css = getComputedStyle(ghost)
      await expect(ghost).toHaveTextContent('Health')
      await expect(ghost.getAttribute('aria-hidden')).toBe('true')
      await expect(css.pointerEvents).toBe('none')
      await expect(css.position).toBe('absolute')
      await expect(css.left).toBe('58px')
      await expect(css.fontSize).toBe('13px')
      await expect(css.borderTopLeftRadius).toBe('10px')
      await expect(css.padding).toBe('6px 10px')
      await expect(css.columnGap).toBe('7px')
      await expect(css.backgroundColor).toBe(GHOST[theme].bg)
      await expect(css.boxShadow.endsWith(GHOST[theme].shadow)).toBe(true)

      // tilted -1.5deg: a rotation matrix, not `none`
      await expect(css.transform).not.toBe('none')
      const m = new DOMMatrix(css.transform)
      const angle = (-1.5 * Math.PI) / 180
      await expect(Math.abs(m.a - Math.cos(angle))).toBeLessThan(1e-4)
      await expect(Math.abs(m.b - Math.sin(angle))).toBeLessThan(1e-4)

      const dot = ghost.firstElementChild as HTMLElement
      await expect(getComputedStyle(dot).width).toBe('7px')
      await expect(getComputedStyle(dot).height).toBe('7px')
      await expect(getComputedStyle(dot).borderTopLeftRadius).toBe('2px')
      await expect(getComputedStyle(dot).backgroundColor).toBe(
        theme === 'light' ? 'rgb(27, 29, 20)' : 'rgb(250, 249, 239)'
      )

      await fireEvent.dragEnd(health)
      await waitFor(() => expect(scope.querySelector('[data-part="drag-ghost"]')).toBeNull())
      await expect(getComputedStyle(health).opacity).toBe('1')
    }
  },
}

/**
 * A computed colour as [r, g, b, a] in 0–255 / 0–1. `border-mn-text/[0.09]`
 * resolves through `color-mix`, which Chromium serialises as `oklab(…)` rather
 * than `rgba(…)`; the value is converted and compared, not the string.
 */
const toRgba = (value: string): number[] => {
  const [x, y, z, a = 1] = value.match(/-?\d*\.?\d+(?:e-?\d+)?/g)!.map(Number)
  if (value.startsWith('rgb')) return [x, y, z, a]
  if (value.startsWith('color(srgb')) return [x * 255, y * 255, z * 255, a]
  if (!value.startsWith('oklab')) throw new Error(`unhandled colour ${value}`)
  const l = (x + 0.3963377774 * y + 0.2158037573 * z) ** 3
  const m = (x - 0.1055613458 * y - 0.0638541728 * z) ** 3
  const s = (x - 0.0894841775 * y - 1.291485548 * z) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const encode = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
  return [...linear.map(encode), a]
}

/**
 * The foot: a flex column, `gap 2`, `padding 10px 8px 0`,
 * under a `border-top 1px` at ink .09 (paper .09 on dark) that runs the card's
 * FULL width — no margin above it, none beside it. Then the databases tree and
 * the `settings` row (`newRow`: padding 6px 8px, 12.5, ink .68; a 12px gear and an
 * 8px gap). It sits outside the scrolling body, and the databases tree is capped
 * so it cannot swallow the rail.
 */
export const FootBand: Story = {
  args: { tree: [...TREE, DATABASES], expanded: new Set(['root-db']) },
  render: (args) => <BothThemes {...args} />,
  play: async ({ canvasElement }) => {
    const HAIRLINE = { light: [27, 29, 20, 0.09], dark: [250, 249, 239, 0.09] } as const
    const INK_68 = {
      light: 'rgba(27, 29, 20, 0.68)',
      dark: 'rgba(250, 249, 239, 0.68)',
    } as const

    for (const theme of THEMES) {
      const scope = probe(canvasElement, theme)
      const canvas = within(scope)
      const aside = scope.querySelector('aside')!
      const foot = scope.querySelector<HTMLElement>('[data-part="rail-foot"]')!
      const css = getComputedStyle(foot)
      await expect(css.borderTopWidth).toBe('1px')
      const [r, g, b, a] = toRgba(css.borderTopColor)
      const [er, eg, eb, ea] = HAIRLINE[theme]
      for (const [got, want] of [
        [r, er],
        [g, eg],
        [b, eb],
      ])
        await expect(Math.abs(got - want)).toBeLessThan(1)
      await expect(Math.abs(a - ea)).toBeLessThan(0.005)
      // The rule spans the whole card: no inset on either side, none above it.
      await expect(css.marginLeft).toBe('0px')
      await expect(css.marginRight).toBe('0px')
      await expect(css.marginTop).toBe('0px')
      await expect(foot.getBoundingClientRect().width).toBe(aside.getBoundingClientRect().width)
      await expect(css.display).toBe('flex')
      await expect(css.flexDirection).toBe('column')
      await expect(css.rowGap).toBe('2px')
      await expect(css.padding).toBe('10px 8px 0px')

      // databases tree first, then settings — in ONE element
      const tree = canvas.getByRole('tree', { name: 'Databases' })
      const settings = scope.querySelector<HTMLElement>('[data-part="settings"]')!
      await expect([...foot.children]).toEqual([tree, settings])
      await expect(getComputedStyle(tree).maxHeight).not.toBe('none')
      // the foot's hairline is the only one: the tree draws none of its own
      await expect(getComputedStyle(tree).borderTopWidth).toBe('0px')
      await expect(scope.querySelectorAll('aside [class*="border-t"]')).toHaveLength(1)
      // measured once the nested row's settle-in entrance has finished moving it
      await Promise.all(tree.getAnimations({ subtree: true }).map((a) => a.finished))
      const dbRows = within(tree).getAllByRole('treeitem')
      const lastDbRow = dbRows[dbRows.length - 1].getBoundingClientRect()

      // The scroller clips at its padding box: every row's 2px focus ring must
      // fit inside it on all four sides, or a keyboard user loses the indicator.
      const box = tree.getBoundingClientRect()
      for (const row of dbRows) {
        const r = row.getBoundingClientRect()
        await expect(r.left - box.left).toBeGreaterThanOrEqual(2)
        await expect(box.right - r.right).toBeGreaterThanOrEqual(2)
      }
      await expect(dbRows[0].getBoundingClientRect().top - box.top).toBeGreaterThanOrEqual(2)
      await expect(box.bottom - lastDbRow.bottom).toBeGreaterThanOrEqual(2)

      // The board's dbRow sets no colour: its label inherits full ink.
      const dbTitle = canvas
        .getByRole('treeitem', { name: /databases/ })
        .querySelector<HTMLElement>('[data-part="title"]')!
      await expect(getComputedStyle(dbTitle).color).toBe(
        theme === 'light' ? 'rgb(27, 29, 20)' : 'rgb(250, 249, 239)'
      )

      // `newRow`: 12.5 / ink .68 / padding 6px 8px; the gear 12px, 8px from the label.
      const type = getComputedStyle(settings)
      await expect(type.fontSize).toBe('12.5px')
      await expect(type.color).toBe(INK_68[theme])
      await expect(type.padding).toBe('6px 8px')
      await expect(type.borderTopLeftRadius).toBe('0px')
      const inner = settings.firstElementChild as HTMLElement
      await expect(getComputedStyle(inner).display).toBe('inline-flex')
      await expect(getComputedStyle(inner).columnGap).toBe('8px')
      const gear = inner.querySelector('svg')!
      await expect(gear.getBoundingClientRect().width).toBe(12)
      await expect(gear.getBoundingClientRect().height).toBe(12)
      await expect(gear.getAttribute('viewBox')).toBe('0 0 14 14')
      await expect(gear.getAttribute('stroke-width')).toBe('1.4')
      await expect(gear.querySelector('circle')!.getAttribute('r')).toBe('2.2')

      // no board draws a hover on newRow
      await expect(settings.className).not.toMatch(/hover:/)
    }
  },
}

/** With no databases root the foot is just `settings` under the hairline. */
export const FootWithoutDatabases: Story = {
  play: async ({ canvasElement }) => {
    const foot = canvasElement.querySelector<HTMLElement>('[data-part="rail-foot"]')!
    await expect(foot.children).toHaveLength(1)
    await expect(foot.firstElementChild).toHaveTextContent('settings')
  },
}

/**
 * The row recipe (`PondRail.dc.html` `mk`), computed in both themes: root and
 * area rows (d <= 1) and the selected row are full ink, a page row is the .68
 * tier. Every row without a glyph draws the 7×7 dot — ink .5 at rest, full ink
 * when selected. The guides are one 1px hairline at ink .09 (paper .09 on dark),
 * and an area row after the root opens 4px of space above it.
 */
export const RowRecipe: Story = {
  args: { expanded: new Set(['health']), selectedId: 'sleep' },
  render: (args) => <BothThemes {...args} />,
  play: async ({ canvasElement }) => {
    const INK = {
      light: [27, 29, 20],
      dark: [250, 249, 239],
    } as const
    const expectInk = async (css: string, theme: Theme, alpha: number) => {
      const [r, g, b, a] = toRgba(css)
      const [er, eg, eb] = INK[theme]
      for (const [got, want] of [
        [r, er],
        [g, eg],
        [b, eb],
      ])
        await expect(Math.abs(got - want)).toBeLessThan(1)
      await expect(Math.abs(a - alpha)).toBeLessThan(0.005)
    }

    for (const theme of THEMES) {
      const canvas = within(probe(canvasElement, theme))
      const row = (name: RegExp) => canvas.getByRole('treeitem', { name })
      const titleColor = (name: RegExp) =>
        getComputedStyle(row(name).querySelector<HTMLElement>('[data-part="title"]')!).color
      const dotOf = (name: RegExp) => row(name).querySelector<HTMLElement>('[data-part="dot"]')!

      // area rows and the root: full ink
      await expectInk(titleColor(/life/), theme, 1)
      await expectInk(titleColor(/Health/), theme, 1)
      await expectInk(titleColor(/Scratchpad/), theme, 1)
      // a page row: .68; the selected page row: full
      await expectInk(titleColor(/Marathon/), theme, 0.68)
      await expectInk(titleColor(/Sleep/), theme, 1)

      // the dot exists on a leaf page (ink .5 at rest) and on a childless area
      const marathonDot = dotOf(/Marathon/)
      await expect(marathonDot).toBeInTheDocument()
      const box = marathonDot.getBoundingClientRect()
      await expect([box.width, box.height]).toEqual([7, 7])
      await expect(getComputedStyle(marathonDot).borderTopLeftRadius).toBe('2px')
      await expectInk(getComputedStyle(marathonDot).backgroundColor, theme, 0.5)
      await expect(dotOf(/Scratchpad/)).toBeInTheDocument()
      // the selected row's dot is full ink
      await expectInk(getComputedStyle(dotOf(/Sleep/)).backgroundColor, theme, 1)

      // guides: one hairline per ancestor level, ink .09, in both themes
      const guides = [...row(/Sleep/).querySelectorAll<HTMLElement>(':scope > span.w-px')]
      await expect(guides).toHaveLength(2)
      for (const guide of guides) {
        await expectInk(getComputedStyle(guide).backgroundColor, theme, 0.09)
        await expect(guide.getBoundingClientRect().width).toBe(1)
      }

      // the chevron is the .68 tier and points down when open
      const caret = row(/Health/).querySelector<SVGSVGElement>('button svg')!
      await expect(caret.getAttribute('viewBox')).toBe('0 0 9 9')
      await expect(caret).toHaveClass('rotate-90')
      await expect(getComputedStyle(caret).color).toBe(
        theme === 'light' ? 'rgba(27, 29, 20, 0.68)' : 'rgba(250, 249, 239, 0.68)'
      )

      // area rows after the root: 4px above; the root and nested rows: none
      await expect(getComputedStyle(row(/Health/)).marginTop).toBe('4px')
      await expect(getComputedStyle(row(/Scratchpad/)).marginTop).toBe('4px')
      await expect(getComputedStyle(row(/life/)).marginTop).toBe('0px')
      await expect(getComputedStyle(row(/Marathon/)).marginTop).toBe('0px')
    }
  },
}

/** A root with nothing under it is not a folder: no chevron, no aria-expanded. */
export const EmptyRootHasNoChevron: Story = {
  args: { tree: [], isEmpty: true },
  play: async ({ canvas }) => {
    const life = canvas.getByRole('treeitem', { name: /life/ })
    await expect(life).not.toHaveAttribute('aria-expanded')
    await expect(life.querySelector('button')).toBeNull()
  },
}
