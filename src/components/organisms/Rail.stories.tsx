import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { ComponentProps } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'

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
 * The board's row geometry, pinned. `PondRail.dc.html` renders its rows at
 * `padding '5px 8px 5px 4px'` / `gap 7` / `line-height: normal`, measuring
 * 26px on an area row (13.5 type) and 25px below it (13 type). #294 closed a
 * fixed 34px against those numbers; this story is what stops them drifting
 * back — the looseness is invisible in jsdom and in review, and only a real
 * browser catches it.
 */
export const BoardRowGeometry: Story = {
  args: { expanded: new Set(['health', 'personal']) },
  play: async ({ canvasElement }) => {
    const rows = [...canvasElement.querySelectorAll<HTMLElement>('[data-kind="list-row"]')]
    await expect(rows.length).toBeGreaterThan(4)

    for (const row of rows) {
      const css = getComputedStyle(row)
      await expect(css.padding).toBe('5px 8px 5px 4px')
      await expect(css.columnGap).toBe('7px')
      await expect(css.borderTopLeftRadius).toBe('10px')
      // the board's metric leading, not Tailwind's preflight 1.5 (= 20.25px here)
      await expect(css.lineHeight).toBe('normal')
    }

    const heightAt = (size: string) =>
      rows
        .filter((r) => getComputedStyle(r).fontSize === size)
        .map((r) => Math.round(r.getBoundingClientRect().height))

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

    // The three-tier label VOICE the trail is drawn with (`data-voice` → CSS ink
    // tiers; the list-row molecule itself renders one tone, so the rail docks its
    // own). `Food` isolates the on-path raise from the area/root raise — it is a
    // nested plain page, not a top-level area — and `Trips` is its off-path
    // sibling at the same depth. Guards the #95-review regression where the
    // TreeRow→PondMolecule absorption flattened every row to one tone, and the
    // #108 follow-up where a top-level control row read raised for being an area.
    const voice = (name: RegExp) =>
      canvas.getByRole('treeitem', { name }).getAttribute('data-voice')
    const VOICES: [RegExp, string][] = [
      [/Recipes/, 'full'], // selected
      [/Food/, 'raised'], // on-path ancestor (a nested plain page, not an area)
      [/Personal/, 'raised'], // on-path ancestor
      [/Trips/, 'muted'], // plain, off the selection path
    ]
    for (const [name, expected] of VOICES) await expect(voice(name)).toBe(expected)
    // the regression guard: an on-path ancestor must NOT read like a plain row
    await expect(voice(/Food/)).not.toBe(voice(/Trips/))
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
 * the pond's name as a small-meta label.
 *
 * Replaces `shell-reskin`'s `bg-mn-card` / `shadow-mn-card` / `rounded-mn-card`
 * / `text-mn-11` / `tracking-[0.14em]` class assertions and its `globals.css`
 * text scrapes for `--mn-surface` / `--mn-card` / `--mn-radius-card` /
 * `--mn-shadow-card`: the class names could all be right while the roles behind
 * them resolved to the wrong paper. These read the paper off the element.
 *
 * Head treatment from `Pond 05 Shell`, identical in all 18 frames: sans 500 /
 * 11 / uppercase / .14em, and NO mark (`Pond 02`'s PondRail card disagrees at
 * 13.5 with a glyph; the shell board wins — see Rail.tsx's note). 11 × .14em =
 * 1.54px of tracking.
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
      await expect(type.fontSize).toBe('11px')
      await expect(type.fontWeight).toBe('500')
      await expect(type.textTransform).toBe('uppercase')
      await expect(type.letterSpacing).toBe('1.54px')
      await expect(type.fontFamily).toContain('PP Neue Montreal')
      // No mark of either register in the head: the pond is not an area.
      await expect(head.querySelector('[data-pond-mark]')).toBeNull()
      await expect(head.querySelector('[data-area-mark]')).toBeNull()
    }
  },
}

/**
 * #91's glyph wiring, with no chosen marks anywhere: a mapped area row leads
 * with its DEFAULT glyph, tinted with the area role its id derives, and drops
 * its dot; an unmapped top-level area keeps its `KindDot`; a nested page carries
 * neither. The Life root leads with the ring in ink (`var(--mn-text)`), not an
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

      // The Life root: the ring, in ink — and no hand-drawn half-disc left over.
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

      // Nested pages carry neither until someone chooses one (#108).
      for (const name of [/Sleep/, /Food/, /Trips/]) {
        await expect(row(name).querySelector('[data-icon]')).toBeNull()
        await expect(row(name).querySelector('[data-part="dot"]')).toBeNull()
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

      // 4. untouched nested row: no mark of either register. Asserted as the
      //    ABSENCE of the element — an earlier version read a style off a node
      //    that was never there, so it could not have failed.
      await expect(row(/Trips/).querySelector('[data-icon]')).toBeNull()
      await expect(row(/Trips/).querySelector('[data-part="dot"]')).toBeNull()
    }
  },
}

/**
 * The pond's SECOND root (`Pond 03 Concepts` 3c: "two roots: life for reading,
 * databases for data" — peers, one beside the other). `PondRail` draws it at the
 * FOOT, after the Life tree, above a hairline: its own ARIA tree, so the
 * structure says what the rail says rather than nesting data inside life.
 *
 * Geometry from `PondRail.dbRow`, measured: `padding '6px 8px'` / `gap 9` /
 * `fontSize 13.5` / `fontWeight 500` / `borderRadius 10`. Its mark is a
 * hand-drawn cylinder in `currentColor` — a FUNCTIONAL mark (stroke 1.4, round
 * caps), not an area glyph, because the root is not one of Life's areas.
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

    // …and into its own, with its databases nested under it.
    const foot = canvas.getByRole('tree', { name: 'Databases' })
    await expect(within(foot).getByText('databases')).toBeInTheDocument()
    await expect(within(foot).getByText('ingredients')).toBeInTheDocument()

    // A functional mark, not an area one — and so no area hue to disagree with.
    const rootRow = canvas.getByRole('treeitem', { name: /databases/ })
    const svg = rootRow.querySelector<SVGSVGElement>('svg[stroke="currentColor"]')!
    await expect(svg).toBeInTheDocument()
    await expect(svg.getAttribute('stroke-width')).toBe('1.4')
    await expect(svg.getAttribute('stroke-linecap')).toBe('round')
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
