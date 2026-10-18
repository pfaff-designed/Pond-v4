import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState, type ComponentProps } from 'react'
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test'

import { RailView, type RailNode } from './Rail'
import { srgbAsRgba } from './story-colour'
import { LIFE_GLYPH } from '@/lib/rail/area-glyph'
import { pushRecentGlyph, type AreaRole } from '@/lib/rail/glyph-library'
import type { MarkSource } from '@/lib/pages/mark'

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
  title: 'Organisms/2r · the rail',
  component: RailView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, { parameters }) => (
      <div className={`h-screen bg-mn-surface ${parameters.theme === 'ink' ? 'dark' : ''}`}>
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
    onRename: fn(),
    onPickGlyph: fn(),
    onLife: fn(),
    onToggleLife: fn(),
    onOpenDatabases: fn(),
    canDrop: () => true,
    onMove: fn(),
  },
} satisfies Meta<typeof RailView>

export default meta
type Story = StoryObj<typeof meta>

/** Resting rail: Life root open, area folders collapsed, children hidden. */
export const Resting: Story = {
  name: 'rest',
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

export const RestInk: Story = {
  name: 'rest · ink',
  parameters: { theme: 'ink' },
}

/** Collapsing the Life root hides the entire tree beneath it. */
export const LifeCollapsed: Story = {
  tags: ['!dev'],
  args: { lifeExpanded: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      within(canvas.getByRole('tree', { name: 'Workspace' })).getByText('life')
    ).toBeInTheDocument()
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
  tags: ['!dev'],
  args: { expanded: new Set(['health', 'personal']), selectedId: 'sleep' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sleep')).toBeInTheDocument()
    await expect(canvas.getByText('Trips')).toBeInTheDocument()
    // nested sub-area folder is itself collapsed
    await expect(canvas.queryByText('Recipes')).not.toBeInTheDocument()

    // life + 4 top-level + Health's 2 + Personal's 2 = 9 visible rows, plus the
    // foot's databases row.
    const items = canvas.getAllByRole('treeitem')
    const rows = [...canvasElement.querySelectorAll<HTMLElement>('[data-kind="list-row"]')]
    await expect(items).toHaveLength(10)
    await expect(rows).toHaveLength(items.length)
    for (const [i, row] of rows.entries()) {
      await expect(row.closest('[role="treeitem"]')).toBe(items[i])
    }
  },
}

/**
 * KAN-248 (2/4): every rail row's mark is a real button now, not the
 * decorative `span[aria-hidden]` it was — an area's glyph (`Health`) and a
 * plain page's kind dot (`Scratchpad`) alike, both at rest (closed).
 */
export const MarkButton: Story = {
  name: 'mark · button',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = (name: RegExp) => canvas.getByRole('treeitem', { name })

    for (const [rowName, markName] of [
      [/^Health/, 'change icon for Health'],
      [/Scratchpad/, 'change icon for Scratchpad'],
    ] as const) {
      const mark = within(row(rowName)).getByRole('button', { name: markName })
      await expect(mark).toHaveAttribute('aria-expanded', 'false')
      await expect(mark).not.toHaveAttribute('aria-hidden')
    }
  },
}

/**
 * KAN-248 (5/8): clicking a row's mark opens the glyph picker anchored under
 * it (PATH_STEPS 2–3) — the row stays selected and the button reads
 * `aria-expanded="true"`. Esc closes it, leaves the mark unchanged, and
 * returns focus to the button (PATH_STEP 8). The glass portals to
 * `document.body`, outside `canvasElement`, so its parts are read off the
 * document (`ConfirmDialog.stories.tsx`'s own pattern for a portaled part).
 * Also covers clicking the mark of a row that is NOT yet selected (6y frame
 * 1: "clicking the workouts dot opens the picker under it" with the row
 * selected) — `onSelect` must fire for that row too, not just the one the
 * story starts out on.
 */
export const MarkOpensPicker: Story = {
  name: 'mark · opens the glyph picker',
  args: { selectedId: 'health' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('treeitem', { name: /^Health/ })
    const mark = within(row).getByRole('button', { name: 'change icon for Health' })

    await userEvent.click(mark)
    await expect(mark).toHaveAttribute('aria-expanded', 'true')
    await expect(row).toHaveAttribute('aria-selected', 'true')
    await expect(args.onSelect).toHaveBeenCalledWith('health')

    const glass = document.body.querySelector('[data-part="glass"][data-kind="glyph"]')
    await expect(glass).toBeTruthy()
    // top to bottom: search head, the listbox (automatic row + the library
    // grid), the foot — the glass's own direct children, not every nested
    // `data-part` (the head's own `esc` key hint carries one too). The
    // automatic row and the grid sit one level deeper now, inside the
    // `role="listbox"` that gives `role="option"` its required ancestor.
    const parts = [...glass!.children].map((p) => p.getAttribute('data-part'))
    await expect(parts).toEqual(['head', 'list', 'foot'])
    await within(document.body).findByRole('combobox', { name: 'search glyphs' })

    await userEvent.keyboard('{Escape}')
    await expect(document.body.querySelector('[data-part="glass"]')).toBeNull()
    await expect(mark).toHaveAttribute('aria-expanded', 'false')
    await expect(mark).toHaveFocus()

    // Health was already selected above — Scratchpad is not (`selectedId`
    // stays 'health' throughout this story), so clicking ITS mark is the
    // unselected-row case 6y frame 1 draws: `onSelect` must still fire for
    // Scratchpad, not just open the picker under it.
    const scratchRow = canvas.getByRole('treeitem', { name: /Scratchpad/ })
    const scratchMark = within(scratchRow).getByRole('button', {
      name: 'change icon for Scratchpad',
    })
    await userEvent.click(scratchMark)
    await expect(scratchMark).toHaveAttribute('aria-expanded', 'true')
    await expect(args.onSelect).toHaveBeenCalledWith('scratch')
  },
}

/**
 * KAN-248 path walk 1/3 (PATH_STEPS 9, and 2-3 by key): the mark is reached by
 * Tab alone, never a click, and ↵ opens its picker. `MarkOpensPicker` already
 * covers the click route and Esc; this covers only the key route — that the
 * mark carries no `tabIndex` override (unlike the ＋/× tools, which are
 * deliberately `-1`) and is a normal stop in the tab order, and that ↵ opens
 * the same picker once it has focus.
 */
export const MarkOpensPickerByKeyboard: Story = {
  name: 'mark · opens the glyph picker from the keyboard',
  args: { selectedId: 'scratchpad' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('treeitem', { name: /Scratchpad/ })
    const mark = within(row).getByRole('button', { name: 'change icon for Scratchpad' })

    // `scratchpad` is this tree's one roving tab stop (selectedId), so a
    // keyboard user tabbing through the rail lands on its row first; the
    // story picks the story up from there, scoped to the mark's own step.
    row.focus()
    await expect(row).toHaveFocus()

    await userEvent.tab()
    await expect(mark).toHaveFocus()
    await expect(mark.tabIndex).toBe(0)
    await expect(mark).toHaveAttribute('aria-expanded', 'false')

    await userEvent.keyboard('{Enter}')
    await expect(mark).toHaveAttribute('aria-expanded', 'true')
    await within(document.body).findByRole('combobox', { name: 'search glyphs' })
  },
}

/**
 * KAN-250 (4/4, 6y frame 6): below the phone breakpoint, tapping a mark opens
 * the picker as a bottom sheet (`GlyphPickerSheet`) instead of the anchored
 * desktop glass — same `data-kind="glyph"` glass, but with the sheet's own
 * backdrop and no `useAnchoredBox` inline position. `useBelowMd`'s own
 * `matchMedia` query is this story's `globals.viewport`, same as
 * `GlyphPickerSheet.stories.tsx`'s `mobile2`.
 */
export const MarkOpensSheetOnPhone: Story = {
  name: 'mark · opens the sheet on the phone',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  args: { selectedId: 'health' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('treeitem', { name: /^Health/ })
    const mark = within(row).getByRole('button', { name: 'change icon for Health' })

    await userEvent.click(mark)
    await expect(mark).toHaveAttribute('aria-expanded', 'true')

    const glass = document.body.querySelector<HTMLElement>('[data-part="glass"][data-kind="glyph"]')
    await expect(glass).toBeTruthy()
    // the anchored glass carries an inline `top`/`left` from `useAnchoredBox`;
    // the sheet positions itself through its own fixed Tailwind classes alone.
    await expect(glass!.style.top).toBe('')
    await expect(glass!.style.left).toBe('')
    await expect(document.body.querySelector('[data-part="backdrop"]')).toBeTruthy()

    await userEvent.keyboard('{Escape}')
    await expect(document.body.querySelector('[data-part="glass"]')).toBeNull()
    await expect(mark).toHaveFocus()
  },
}

/**
 * At ≥768px the same mark still opens the anchored desktop glass, unchanged —
 * re-asserted here (`MarkOpensPicker` above already covers it at the default
 * viewport) to keep the phone/desktop split explicit in one place.
 */
export const MarkOpensPickerOnDesktop: Story = {
  name: 'mark · keeps the anchored glass at desktop widths',
  globals: { viewport: { value: 'desktop', isRotated: false } },
  args: { selectedId: 'health' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('treeitem', { name: /^Health/ })
    const mark = within(row).getByRole('button', { name: 'change icon for Health' })

    await userEvent.click(mark)
    const glass = document.body.querySelector<HTMLElement>('[data-part="glass"][data-kind="glyph"]')
    await expect(glass).toBeTruthy()
    await expect(glass!.style.top).not.toBe('')
    await expect(document.body.querySelector('[data-part="backdrop"]')).toBeNull()

    await userEvent.keyboard('{Escape}')
    await expect(document.body.querySelector('[data-part="glass"]')).toBeNull()
  },
}

/** The real node for `id` in `tree`, so a fabricated `MarkSource` carries its true `parentId` — `isArea` reads that, not the row's own id. */
function findNode(tree: readonly RailNode[], id: string): RailNode | undefined {
  for (const n of tree) {
    if (n.id === id) return n
    const found = findNode(n.children, id)
    if (found) return found
  }
  return undefined
}

/**
 * Plays the part of `Rail()`'s own `marks` memo (built from the `pagesKey()`
 * cache `applyGlyphOptimistic` writes) AND its `recentGlyphs` overlay (built
 * from the pond's own list plus `pushedGlyphs`, KAN-248 7/8): `onPickGlyph`
 * updates both synchronously, so this story can show the row's mark
 * redrawing through `resolveMark`, and the picker's own `recent` section
 * carrying the pick on its next open, without a container, a QueryClient, or
 * anything awaited in between — the same "before the write settles" instant
 * this component owns, container aside.
 */
function GlyphPickHarness(args: ComponentProps<typeof RailView>) {
  const [marks, setMarks] = useState<ReadonlyMap<string, MarkSource>>(new Map())
  const [recentGlyphs, setRecentGlyphs] = useState<readonly string[]>(args.recentGlyphs ?? [])
  return (
    <RailView
      {...args}
      marks={marks}
      recentGlyphs={recentGlyphs}
      onPickGlyph={(id, glyph) => {
        args.onPickGlyph(id, glyph)
        const node = findNode(args.tree, id)
        setMarks((prev) =>
          new Map(prev).set(id, {
            id,
            parentId: node?.parentId ?? null,
            title: node?.title ?? id,
            glyph,
          })
        )
        if (glyph) setRecentGlyphs((prev) => pushRecentGlyph(prev, glyph))
      }}
      onPickColour={(id, role) => {
        args.onPickColour?.(id, role)
        const node = findNode(args.tree, id)
        setMarks((prev) => {
          const existing = prev.get(id)
          return new Map(prev).set(id, {
            id,
            parentId: node?.parentId ?? null,
            title: node?.title ?? id,
            ...existing,
            areaRole: role,
          })
        })
      }}
    />
  )
}

/**
 * KAN-248 (6/8): picking a cell commits at once. `onPickGlyph` fires with the
 * row's id and the picked glyph (PATH_STEPS 5), the picker closes and focus
 * returns to the mark, and the row's `AreaMark` repaints with the new glyph
 * the instant `marks` carries it — no promise awaited, matching
 * `applyGlyphOptimistic` landing in the cache ahead of `setPageGlyph`'s write.
 */
export const PickCommitsGlyph: Story = {
  name: 'mark · a pick commits the glyph at once',
  args: { selectedId: 'health' },
  render: (args) => <GlyphPickHarness {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('treeitem', { name: /^Health/ })
    const mark = within(row).getByRole('button', { name: 'change icon for Health' })
    const iconOf = () => row.querySelector('[data-area-mark] [data-icon]')?.getAttribute('data-icon')
    const before = iconOf()

    await userEvent.click(mark)
    const input = await within(document.body).findByRole('combobox', { name: 'search glyphs' })
    await userEvent.type(input, 'fl')
    await userEvent.keyboard('{Enter}')

    await expect(args.onPickGlyph).toHaveBeenCalledWith('health', 'fat-flake')
    await expect(document.body.querySelector('[data-part="glass"]')).toBeNull()
    await expect(mark).toHaveAttribute('aria-expanded', 'false')
    await expect(mark).toHaveFocus()
    await expect(iconOf()).toBe('fat-flake')
    await expect(iconOf()).not.toBe(before)
  },
}

/**
 * KAN-248 path walk 2/3 (PATH_STEPS 8): picking `automatic` on a row that
 * already carries a glyph restores the plain kind dot IN THE RAIL —
 * `GlyphPicker.stories.tsx`'s own `PickAutomatic` only proves the component
 * calls `onPick(null)`; this proves the row the pick is anchored to actually
 * repaints. Reuses `PickCommitsGlyph`'s own `GlyphPickHarness` rather than a
 * second one (the harness now resolves the fabricated `MarkSource`'s
 * `parentId`/`title` off the real `args.tree` node instead of a hardcoded
 * `'health'` shape, so it carries any row truthfully). `Sleep` (a CHILD of
 * `Health`, not a top-level row) is the target — `isArea` reads
 * `parentId === null`, so a top-level page like `Scratchpad` is itself an
 * "area" and its own automatic is a title-derived glyph, never a bare dot;
 * only a nested leaf's automatic is the plain `KindDot` this item checks for.
 * `Sleep` first gets a real glyph the same way `PickCommitsGlyph` does.
 * Reopening the picker with a glyph already current initialises `active` to
 * that glyph's OWN cell (the component's `useState(() =>
 * cells.findIndex(…))` init), not `automatic` — so a bare `{Enter}` would
 * just re-pick the same cell. A no-match query (`GlyphPicker.stories.tsx`'s
 * own `NoMatch` story) drives `active` to the automatic row regardless of
 * where the current glyph's cell sits in the grid, then `{Enter}` picks it.
 */
export const PickAutomaticRestoresKindDot: Story = {
  name: 'mark · picking automatic restores the kind dot in the rail',
  args: { expanded: new Set(['health']), selectedId: 'sleep' },
  render: (args) => <GlyphPickHarness {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('treeitem', { name: /Sleep/ })
    const mark = within(row).getByRole('button', { name: 'change icon for Sleep' })
    const iconOf = () => row.querySelector('[data-area-mark] [data-icon]')?.getAttribute('data-icon')

    await userEvent.click(mark)
    const input = await within(document.body).findByRole('combobox', { name: 'search glyphs' })
    await userEvent.type(input, 'fl')
    await userEvent.keyboard('{Enter}')
    await expect(iconOf()).toBe('fat-flake')

    await userEvent.click(mark)
    const reopened = await within(document.body).findByRole('combobox', { name: 'search glyphs' })
    await userEvent.type(reopened, 'zzzz')
    await userEvent.keyboard('{Enter}')

    await expect(args.onPickGlyph).toHaveBeenCalledWith('sleep', null)
    await expect(document.body.querySelector('[data-part="glass"]')).toBeNull()
    await expect(mark).toHaveAttribute('aria-expanded', 'false')
    await expect(mark).toHaveFocus()
    await expect(row.querySelector('[data-area-mark]')).toBeNull()
    await expect(iconOf()).toBeUndefined()
  },
}

/**
 * KAN-248 (7/8): a pick also pushes onto the pond's recent list (KAN-27), and
 * the picker's own `recent` section reads it back — not the empty list it drew
 * before this item. Picks `fat-flake` once, closes (automatic, esc), reopens,
 * and finds it first among the recent cells, ahead of the fixture's own seed.
 */
export const RecentGlyphPersists: Story = {
  name: 'mark · a pick lands first in recent, next time the picker opens',
  args: { selectedId: 'health', recentGlyphs: ['heart', 'leaf-01'] },
  render: (args) => <GlyphPickHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('treeitem', { name: /^Health/ })
    const mark = within(row).getByRole('button', { name: 'change icon for Health' })

    await userEvent.click(mark)
    const input = await within(document.body).findByRole('combobox', { name: 'search glyphs' })
    await userEvent.type(input, 'fl')
    await userEvent.keyboard('{Enter}')
    await expect(document.body.querySelector('[data-part="glass"]')).toBeNull()

    await userEvent.click(mark)
    const recentGrid = await within(document.body).findByRole('grid', { name: 'recent' })
    const cells = within(recentGrid).getAllByRole('gridcell')
    await expect(cells[0]).toHaveAttribute('aria-label', 'fat-flake')
    await expect(cells.map((c) => c.getAttribute('aria-label'))).toEqual([
      'fat-flake',
      'heart',
      'leaf-01',
    ])
  },
}

/**
 * KAN-250 (4/4) PATH_STEPS, walked end to end on the real `RailView` at the
 * phone breakpoint: a page mark's sheet opens and filters and picks exactly
 * as the anchored glass does, an area mark's sheet takes a colour pick
 * without closing, and both Escape and the backdrop return focus to the mark
 * that opened it. `MarkOpensPickerOnDesktop` above already re-asserts
 * PATH_STEPS 6 (the anchored glass, unchanged at ≥768px); this story stays
 * at `mobile2` throughout, since a Storybook `play` function cannot change
 * `globals.viewport` mid-run. Drag-down itself is Base UI's own tested
 * gesture (`GlyphPickerSheet.stories.tsx`'s own doc comment) — not
 * simulable in jsdom, so Escape stands in here, flagged for the live
 * verifier.
 */
export const PathWalksTheSheetOnThePhone: Story = {
  name: 'path · the sheet on the phone (glyph, colour, close)',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  args: { expanded: new Set(['health']), selectedId: 'sleep' },
  render: (args) => <GlyphPickHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sleepRow = canvas.getByRole('treeitem', { name: /Sleep/ })
    const sleepMark = within(sleepRow).getByRole('button', { name: 'change icon for Sleep' })
    const iconOf = (row: HTMLElement) =>
      row.querySelector('[data-area-mark] [data-icon]')?.getAttribute('data-icon')

    // 1. tap the page mark → sheet, not the anchored glass; search focusable;
    // 7 cells/row at 44px.
    await userEvent.click(sleepMark)
    await expect(sleepMark).toHaveAttribute('aria-expanded', 'true')
    const glass = document.body.querySelector<HTMLElement>('[data-part="glass"][data-kind="glyph"]')!
    await expect(glass.style.top).toBe('')
    await expect(document.body.querySelector('[data-part="backdrop"]')).toBeTruthy()
    const input = within(document.body).getByRole('combobox', { name: 'search glyphs' })
    await expect(input).toHaveFocus()
    const library = [...glass.querySelectorAll<HTMLElement>('[data-part="section"]')].find(
      (s) => s.querySelector('span')!.textContent === 'library'
    )!.lastElementChild as HTMLElement
    const firstRow = library.querySelectorAll<HTMLElement>('[role="row"]')[0]
    await expect(firstRow.querySelectorAll('[role="gridcell"]')).toHaveLength(7)
    const firstCell = getComputedStyle(firstRow.querySelectorAll('[role="gridcell"]')[0])
    await expect(parseFloat(firstCell.width)).toBe(44)
    await expect(parseFloat(firstCell.height)).toBe(44)

    // 2. type `fl` → the grid filters exactly as on desktop (`Keyboard` story,
    // `GlyphPicker.stories.tsx`): one `matches` section, `fat-flake` first.
    await userEvent.type(input, 'fl')
    const sections = glass.querySelectorAll<HTMLElement>('[data-part="section"]')
    await expect([...sections].map((s) => s.querySelector('span')!.textContent)).toEqual([
      'matches',
    ])
    const hit = sections[0].querySelector<HTMLElement>('[role="gridcell"]')!
    await expect(hit).toHaveAttribute('aria-label', 'fat-flake')

    // 3. tap the glyph cell → sheet closes, the mark shows it, focus returns.
    await userEvent.click(hit)
    await expect(document.body.querySelector('[data-part="glass"]')).toBeNull()
    await expect(sleepMark).toHaveAttribute('aria-expanded', 'false')
    await expect(sleepMark).toHaveFocus()
    await expect(iconOf(sleepRow)).toBe('fat-flake')

    // 4. tap the area mark → sheet opens with the colour row.
    const healthRow = canvas.getByRole('treeitem', { name: /^Health/ })
    const healthMark = within(healthRow).getByRole('button', { name: 'change icon for Health' })
    await userEvent.click(healthMark)
    const sageSwatch = within(document.body).getByRole('gridcell', { name: 'sage' })

    // 5. tap sage → the mark turns sage, the sheet stays open.
    await userEvent.click(sageSwatch)
    await expect(document.body.querySelector('[data-part="glass"]')).toBeTruthy()
    await expect(getComputedStyle(healthRow.querySelector('[data-area-mark]')!).color).toBe(
      AREA.light['area-a']
    )

    // 6. Escape (standing in for drag-down) → closes, focus returns.
    await userEvent.keyboard('{Escape}')
    await expect(document.body.querySelector('[data-part="glass"]')).toBeNull()
    await expect(healthMark).toHaveFocus()

    // 7. reopen, tap the backdrop → closes, focus returns.
    await userEvent.click(healthMark)
    const backdrop = document.body.querySelector<HTMLElement>('[data-part="backdrop"]')!
    await userEvent.click(backdrop)
    await expect(document.body.querySelector('[data-part="glass"]')).toBeNull()
    await expect(healthMark).toHaveFocus()
  },
}

/** The board's `deep` tree (`PondRail.dc.html` `DEEP_PIN` + `DEEP`): five levels down, `ground floor` selected. */
const DEEP_TREE: RailNode[] = [
  node('creativity', 'page', 'creativity', [
    node(
      'kitchen',
      'page',
      'kitchen renovation',
      [
        node(
          'floorplan',
          'page',
          'floorplan',
          [
            node(
              'ground',
              'page',
              'ground floor',
              [
                node('electrics', 'page', 'electrics', [], 0, 'ground'),
                node(
                  'plumbing',
                  'page',
                  'plumbing',
                  [node('sink', 'page', 'sink move', [], 0, 'plumbing')],
                  1,
                  'ground'
                ),
                node('lighting', 'page', 'lighting', [], 2, 'ground'),
              ],
              0,
              'floorplan'
            ),
            node(
              'first',
              'page',
              'first floor',
              [node('landing', 'page', 'landing', [], 0, 'first')],
              1,
              'floorplan'
            ),
            node('loft', 'page', 'loft', [], 2, 'floorplan'),
          ],
          0,
          'kitchen'
        ),
        node(
          'suppliers',
          'page',
          'suppliers',
          [node('quotes', 'page', 'quotes', [], 0, 'suppliers')],
          1,
          'kitchen'
        ),
        node('kitchen-budget', 'page', 'budget', [], 2, 'kitchen'),
        node('notes', 'page', 'notes', [], 3, 'kitchen'),
      ],
      0,
      'creativity'
    ),
    node(
      'books',
      'page',
      'books',
      [node('reading', 'page', 'reading list', [], 0, 'books')],
      1,
      'creativity'
    ),
    node(
      'recipes',
      'page',
      'recipes',
      [node('soups', 'page', 'soups', [], 0, 'recipes')],
      2,
      'creativity'
    ),
  ]),
]

const deepArgs = {
  tree: DEEP_TREE,
  pondName: 'make noise',
  expanded: new Set(['creativity', 'kitchen', 'floorplan', 'ground']),
  selectedId: 'ground',
}

export const Deep: Story = {
  name: 'deep',
  args: deepArgs,
}

export const DeepInk: Story = {
  name: 'deep · ink',
  args: deepArgs,
  parameters: { theme: 'ink' },
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
  tags: ['!dev'],
  args: { expanded: new Set(['health', 'personal']) },
  play: async ({ canvasElement }) => {
    const hosts = [
      ...within(canvasElement)
        .getByRole('tree', { name: 'Workspace' })
        .querySelectorAll<HTMLElement>('[role="treeitem"]'),
    ]
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

      // the label body is bare: no padding of its own — except the open row
      // (life, here, since `selectedId` is null and the tree isn't empty: the
      // board's own home state), which rightly gives its resting ＋ clearance
      // (row gap 7 + ＋ 12 = 19).
      const body = host.querySelector<HTMLElement>('[data-kind="list-row"]')!
      if (host.getAttribute('aria-selected') !== 'true') {
        await expect(getComputedStyle(body).padding).toBe('0px')
      } else {
        await expect(getComputedStyle(body).padding).toBe('0px 19px 0px 0px')
      }
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
  tags: ['!dev'],
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
  tags: ['!dev'],
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
    await userEvent.click(within(canvas.getByRole('tree', { name: 'Workspace' })).getByText('life'))
    await expect(args.onLife).toHaveBeenCalled()
  },
}

/** The Life root's caret is a collapse-all for the whole tree. */
export const LifeCaretCollapsesAll: Story = {
  tags: ['!dev'],
  play: async ({ canvas, args }) => {
    const life = canvas.getByRole('treeitem', { name: /life/ })
    const caret = life.querySelector('svg')?.closest('button') as HTMLButtonElement
    await userEvent.click(caret)
    await expect(args.onToggleLife).toHaveBeenCalled()
  },
}

const isShown = (el: HTMLElement) =>
  getComputedStyle(el).opacity === '1' && el.getBoundingClientRect().width > 0

/**
 * A hovered row shows ＋ and × (`PondRail.dc.html` `hasTools`). Neither is a tab
 * stop — the tree has the one roving stop — so both carry tabindex=-1. The root
 * takes ＋ and never ×.
 */
export const HoverCrud: Story = {
  name: 'hover',
  play: async ({ canvas, args }) => {
    const add = canvas.getByRole('button', { name: 'Add sub-page to Scratchpad' })
    const del = canvas.getByRole('button', { name: 'Delete Scratchpad' })
    await expect(add).toHaveAttribute('tabindex', '-1')
    await expect(del).toHaveAttribute('tabindex', '-1')

    await userEvent.hover(canvas.getByRole('treeitem', { name: /Scratchpad/ }))
    await waitFor(() => expect(isShown(add) && isShown(del.parentElement!)).toBe(true))
    // the board's `tools`: 12×12 marks, 8 apart
    const mark = (button: HTMLElement) => button.querySelector('svg')!.getBoundingClientRect()
    await expect(mark(add).width).toBe(12)
    await expect(mark(del).width).toBe(12)
    await expect(Math.round(mark(del).left - mark(add).right)).toBe(8)
    await userEvent.click(add)
    await userEvent.click(await within(document.body).findByRole('menuitem', { name: /^page/ }))
    await expect(args.onAddChild).toHaveBeenCalledWith('scratch', 'page')
    await userEvent.click(del)
    await expect(args.onDelete).toHaveBeenCalledWith('scratch')

    await expect(canvas.queryByRole('button', { name: /Delete life/ })).not.toBeInTheDocument()
  },
}

export const HoverInk: Story = {
  name: 'hover · ink',
  parameters: { theme: 'ink' },
  play: async ({ canvas }) => {
    await userEvent.hover(canvas.getByRole('treeitem', { name: /Scratchpad/ }))
  },
}

/**
 * The selected row shows ＋ alone (`hasPlus`: selected, not hovered); hovering it
 * adds ×. Every other row stays bare at rest.
 */
export const SelectedRowShowsPlus: Story = {
  tags: ['!dev'],
  args: { expanded: new Set(['personal', 'food']), selectedId: 'recipes' },
  play: async ({ canvas }) => {
    const recipes = canvas.getByRole('treeitem', { name: /Recipes/ })
    const add = within(recipes).getByRole('button', { name: 'Add sub-page to Recipes' })
    const del = within(recipes).getByRole('button', { name: 'Delete Recipes' })
    await expect(isShown(add.parentElement!)).toBe(true)
    await expect(isShown(del.parentElement!)).toBe(false)

    const trips = canvas.getByRole('button', { name: 'Add sub-page to Trips' })
    await expect(isShown(trips.parentElement!)).toBe(false)

    // selected, unhovered: ＋'s slot draws alone, inside the row's own 8px
    // right padding (`PondRail.dc.html` rowPad; `hasPlus: isSel && !hov`).
    // Measure the wrapper, not the button — the button's own `-m-0.5`
    // enlarges its hit target past the slot's edge.
    await expect(
      Math.round(recipes.getBoundingClientRect().right - add.parentElement!.getBoundingClientRect().right)
    ).toBe(8)

    await userEvent.hover(recipes)
    await waitFor(() => expect(isShown(del.parentElement!)).toBe(true))
  },
}

/** The root row: ＋ when selected or hovered, × never (a pond's root can't be deleted). */
export const RootRowTools: Story = {
  tags: ['!dev'],
  play: async ({ canvas, args }) => {
    const life = canvas.getByRole('treeitem', { name: /life/ })
    const add = within(life).getByRole('button', { name: 'Add sub-page to life' })
    // The outer `row-tools` span is now a constant-class positioning shell (KAN-314
    // fix round 2) — it can't fail `isShown` by itself, so assert on the ＋'s own
    // visibility wrapper instead.
    await expect(isShown(add.parentElement!)).toBe(true)
    await expect(within(life).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
    await userEvent.click(add)
    await userEvent.click(await within(document.body).findByRole('menuitem', { name: /^page/ }))
    await expect(args.onAddChild).toHaveBeenCalledWith('__life__', 'page')
  },
}

/**
 * At rest, the row reserves no space for ＋/× — the label runs to the row's own
 * 8px right padding (`PondRail.dc.html` rowPad), not a reserved tools slot. The
 * ×'s slot is laid out at a fixed position at rest and on hover alike (KAN-314)
 * — only opacity/pointer-events toggle, so it never shifts and always lies
 * inside the row. It also appears on keyboard focus-within, not just on hover.
 */
export const HoverCrudReservesNoWidth: Story = {
  tags: ['!dev'],
  play: async ({ canvas }) => {
    const row = canvas.getByRole('treeitem', { name: /Scratchpad/ })
    const title = row.querySelector<HTMLElement>('[data-part="title"]')!
    const del = canvas.getByRole('button', { name: 'Delete Scratchpad' })
    const tools = del.parentElement!

    // Scratchpad is a non-top-level row, so it settles in on mount (a translate
    // animation) — wait it out before measuring position, or the geometry below
    // races the animation's transform.
    await waitFor(() => expect(row.className).not.toMatch(/motion-settle-in/))

    await expect(getComputedStyle(tools).opacity).toBe('0')
    await expect(getComputedStyle(tools).pointerEvents).toBe('none')
    // nothing reserved at rest: the label runs to the row's own 8px padding
    await expect(
      Math.round(row.getBoundingClientRect().right - title.getBoundingClientRect().right)
    ).toBe(8)

    // measure the slot (tools, the visibility wrapper), not the × button — the
    // button's own `-m-0.5` enlarges its hit target past the slot's edges
    const restRect = tools.getBoundingClientRect()

    del.focus()
    await waitFor(() => expect(getComputedStyle(tools).opacity).toBe('1'))
    await expect(getComputedStyle(tools).pointerEvents).toBe('auto')
    del.blur()

    await userEvent.hover(row)
    await waitFor(() => expect(getComputedStyle(tools).opacity).toBe('1'))

    // × never moves between rest and hovered, and always lies inside the row
    const hoveredRect = tools.getBoundingClientRect()
    await expect(hoveredRect.left).toBe(restRect.left)
    await expect(hoveredRect.right).toBe(restRect.right)
    await expect(hoveredRect.top).toBe(restRect.top)
    await expect(hoveredRect.bottom).toBe(restRect.bottom)
    const rowRect = row.getBoundingClientRect()
    await expect(hoveredRect.left).toBeGreaterThanOrEqual(rowRect.left)
    await expect(hoveredRect.right).toBeLessThanOrEqual(rowRect.right)
  },
}

/**
 * Keyboard nav (WAI-ARIA tree): a single roving tab stop that arrow keys move
 * for real — ArrowDown walks Life → Health; a bare Delete/Backspace on a
 * focused row never deletes it (KAN-275 — only the row's own ⋯/× control
 * does); + raises onAddChild.
 */
export const KeyboardNav: Story = {
  tags: ['!dev'],
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

    // Delete/Backspace on the focused row no longer delete it
    await userEvent.keyboard('{Delete}')
    await userEvent.keyboard('{Backspace}')
    await expect(args.onDelete).not.toHaveBeenCalled()
    await expect(health).toBeInTheDocument()

    // + opens the new-page menu on the focused row; picking "page" adds a child
    await userEvent.keyboard('+')
    await userEvent.click(await within(document.body).findByRole('menuitem', { name: /^page/ }))
    await expect(args.onAddChild).toHaveBeenCalledWith('health', 'page')
  },
}

/**
 * #96: the rail is a PAPER card (`PondRail`, measured: the card paper, the card
 * shadow, radius 20, 206 wide, no backdrop blur) headed by the pond's glyph and
 * name (13.5 / 500, full ink). With no pond provider there are no ponds, so no
 * switcher button and no chevron.
 */
export const PaperCardHead: Story = {
  tags: ['!dev'],
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
    await expect(head.querySelector('[data-part="reminders-bell"]')).toBeNull()
  },
}

/**
 * The foot is the databases root and `settings`, and nothing else — no
 * "＋ new page". `settings` has no surface yet, so it is plain text with a gear:
 * not a button, not a tab stop.
 */
export const FootSettings: Story = {
  tags: ['!dev'],
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByRole('button', { name: 'New page' })).not.toBeInTheDocument()
    const settings = canvasElement.querySelector<HTMLElement>('[data-part="settings"]')!
    await expect(settings).toHaveTextContent('settings')
    await expect(settings.tagName).toBe('DIV')
    await expect(settings.querySelector('button, a, [tabindex]')).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'settings' })).not.toBeInTheDocument()
  },
}

const cardOf = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('aside')!.getBoundingClientRect()

/**
 * `PondRail` `loading`: rows are empty — the root row is NOT drawn above the
 * skeleton. Eight bars, 9 high, radius 5, 8px 20px of padding from the CARD edge,
 * 14 apart, widths 40/62/54/70/48/66/58/44% of the 166px between the paddings,
 * stepped in by `(i % 3) * 14`.
 */
export const Loading: Story = {
  name: 'loading',
  args: { tree: [], isLoading: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent(/loading/i)
    await expect(canvas.queryByRole('treeitem', { name: /life/ })).not.toBeInTheDocument()

    const card = cardOf(canvasElement)
    const bars = [
      ...canvasElement.querySelectorAll<HTMLElement>('[data-part="rail-skeleton"] > span'),
    ]
    await expect(bars).toHaveLength(8)
    const WIDTHS = [40, 62, 54, 70, 48, 66, 58, 44]
    const wrap = canvasElement.querySelector<HTMLElement>('[data-part="rail-skeleton"]')!
    await expect(getComputedStyle(wrap.parentElement!).padding).toBe('8px 12px')
    for (const [i, bar] of bars.entries()) {
      const box = bar.getBoundingClientRect()
      const css = getComputedStyle(bar)
      await expect(box.height).toBe(9)
      await expect(css.borderTopLeftRadius).toBe('5px')
      await expect(Math.round(box.left - card.left)).toBe(20 + (i % 3) * 14)
      await expect(Math.abs(box.width - ((card.width - 40) * WIDTHS[i]) / 100)).toBeLessThan(0.5)
      if (i > 0) {
        await expect(Math.round(box.top - bars[i - 1].getBoundingClientRect().bottom)).toBe(14)
      }
    }
  },
}

/**
 * `PondRail` `empty`: the root row alone — not selected, no resting ＋, its ＋ on
 * hover like any row (`hasTools: hov`) — and the hint, verbatim, at
 * `margin 8px 16px 0 34px` measured from the CARD edge, 12.5 / 1.5.
 */
export const Empty: Story = {
  name: 'empty',
  args: { tree: [], isEmpty: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const hint = canvas.getByRole('status')
    await expect(hint.textContent).toBe('no pages yet. ＋ new page, or ask pond to start one.')

    const root = canvas.getByRole('treeitem', { name: /life/ })
    await expect(
      within(canvas.getByRole('tree', { name: 'Workspace' })).getAllByRole('treeitem')
    ).toHaveLength(1)
    await expect(root).toHaveAttribute('aria-selected', 'false')
    const tools = root.querySelector<HTMLElement>('[data-part="row-tools"]')
    await expect(tools).not.toBeNull()
    const add = within(root).getByRole('button', { name: /^Add sub-page to/ })
    await expect(getComputedStyle(add.parentElement!).opacity).toBe('0')
    await userEvent.hover(root)
    await waitFor(() => expect(getComputedStyle(add.parentElement!).opacity).toBe('1'))
    await expect(add).toBeVisible()
    await expect(within(root).queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument()
    await userEvent.unhover(root)

    const card = cardOf(canvasElement)
    const box = hint.getBoundingClientRect()
    await expect(Math.round(box.left - card.left)).toBe(34)
    await expect(Math.round(card.right - box.right)).toBe(16)
    await expect(Math.round(box.top - root.getBoundingClientRect().bottom)).toBe(8)
    const css = getComputedStyle(hint)
    await expect(css.fontSize).toBe('12.5px')
    await expect(css.lineHeight).toBe('18.75px')
  },
}

/**
 * `PondRail` `dragging`: the drop line is 2 high, radius 2, ink, 58px from the
 * card's left and 16px from its right — the row sits 8px inside the card, so the
 * line is measured from the CARD, not the row.
 */
export const DropLine: Story = {
  tags: ['!dev'],
  render: (args) => <BothThemes {...args} />,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      const scope = probe(canvasElement, theme)
      const canvas = within(scope)
      const health = canvas.getByRole('treeitem', { name: /Health/ })
      const target = canvas.getByRole('treeitem', { name: /Scratchpad/ })
      await expect(scope.querySelector('[data-part="drop-line"]')).toBeNull()

      await fireEvent.dragStart(health, { dataTransfer: new DataTransfer() })
      await fireEvent.dragOver(target, {
        dataTransfer: new DataTransfer(),
        clientY: target.getBoundingClientRect().top + 1,
      })
      await waitFor(() => expect(scope.querySelector('[data-part="drop-line"]')).not.toBeNull())

      const line = scope.querySelector<HTMLElement>('[data-part="drop-line"]')!
      const card = scope.querySelector('aside')!.getBoundingClientRect()
      const box = line.getBoundingClientRect()
      const css = getComputedStyle(line)
      await expect(box.height).toBe(2)
      await expect(Math.round(box.left - card.left)).toBe(58)
      await expect(Math.round(card.right - box.right)).toBe(16)
      await expect(css.borderTopLeftRadius).toBe('2px')
      await expect(css.backgroundColor).toBe(INK[theme])
      await expect(css.pointerEvents).toBe('none')

      await fireEvent.dragEnd(health)
      await waitFor(() => expect(scope.querySelector('[data-part="drop-line"]')).toBeNull())
    }
  },
}

/** `PondRail` `dragging`, held: Health lifted over Scratchpad, ghost and drop line both showing. */
export const Dragging: Story = {
  name: 'dragging',
  render: (args) => <BothThemes {...args} />,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      const scope = probe(canvasElement, theme)
      const canvas = within(scope)
      const target = canvas.getByRole('treeitem', { name: /Scratchpad/ })
      await fireEvent.dragStart(canvas.getByRole('treeitem', { name: /Health/ }), {
        dataTransfer: new DataTransfer(),
      })
      await fireEvent.dragOver(target, {
        dataTransfer: new DataTransfer(),
        clientY: target.getBoundingClientRect().top + 1,
      })
      await waitFor(() => expect(scope.querySelector('[data-part="drop-line"]')).not.toBeNull())
    }
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

/** Full ink, resolved. */
const INK: Record<Theme, string> = {
  light: 'rgb(27, 29, 20)',
  dark: 'rgb(250, 249, 239)',
}

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
  tags: ['!dev'],
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

      // `head`: padding 0 16px 12px, centred, gap 8.
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
      // With no pond provider there are no ponds: no switcher button, and no bell.
      await expect(head.querySelector('button')).toBeNull()
      await expect(head.querySelector('[data-part="reminders-bell"]')).toBeNull()
    }
  },
}

/** The board's own pond (`PondRail.dc.html` `CANON`), so the glyph map is read against it. */
const BOARD_TREE: RailNode[] = [
  node('personal', 'page', 'personal', [], 0),
  node('professional', 'page', 'professional', [], 1),
  node(
    'health',
    'page',
    'health',
    [
      node('workouts', 'page', 'workouts', [], 0, 'health'),
      node('sleep', 'page', 'sleep', [], 1, 'health'),
    ],
    2
  ),
  node('money', 'page', 'money', [node('budget', 'page', 'budget', [], 0, 'money')], 3),
  node('creativity', 'page', 'creativity', [], 4),
]

/** `PondRail.dc.html` `G`, row by row. */
const BOARD_GLYPHS: [string, string][] = [
  ['personal', 'house'],
  ['professional', 'ramp'],
  ['health', 'heart'],
  ['money', 'ring'],
  ['creativity', 'star-01'],
]

/**
 * `areaColours` off (`PondRail.dc.html`: `tint = areaColours ?? false`): with no
 * colour chosen anywhere every mark is ink — the root's glyph, each area's glyph
 * and the page dots inside them — and the glyphs are the board's map. The root
 * wears the pond's own glyph, not a fixed one.
 */
export const InkMarks: Story = {
  tags: ['!dev'],
  args: {
    tree: BOARD_TREE,
    pondName: 'make noise',
    pondGlyph: 'lightning-03',
    expanded: new Set(['health', 'money']),
  },
  render: (args) => <BothThemes {...args} />,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      const canvas = within(probe(canvasElement, theme))
      const row = (name: RegExp) => canvas.getByRole('treeitem', { name })
      const slotOf = (name: RegExp) => row(name).querySelector<HTMLElement>('[data-area-mark]')!

      const root = row(/make noise/)
      await expect(root.querySelector('[data-area-mark]')).toBeNull()
      await expect(root.querySelector('[data-icon="lightning-03"]')).toBeInTheDocument()
      await expect(root.querySelector(`[data-icon="${LIFE_GLYPH}"]`)).toBeNull()
      await expect(
        getComputedStyle(root.querySelector<HTMLElement>('[data-pond-mark]')!).color
      ).toBe(INK[theme])

      for (const [title, glyph] of BOARD_GLYPHS) {
        const el = row(new RegExp(`^${title}`))
        await expect(el.querySelector(`[data-icon="${glyph}"]`)).toBeInTheDocument()
        await expect(el.querySelector('[data-part="dot"]')).toBeNull()
        await expect(getComputedStyle(slotOf(new RegExp(`^${title}`))).color).toBe(INK[theme])
        // the board draws the mark at 13 square
        const box = el.querySelector<HTMLElement>('[data-icon]')!.getBoundingClientRect()
        await expect(box.width).toBe(13)
        await expect(box.height).toBe(13)
      }

      // the dots inside an area are the muted ink, not a hue
      for (const name of [/workouts/, /sleep/, /budget/]) {
        const dot = row(name).querySelector<HTMLElement>('[data-part="dot"]')!
        await expect(dot).toBeInTheDocument()
        await expect(dot.style.background).toBe('')
        await expect(dot.className).toContain('bg-mn-text/50')
      }
    }
  },
}

/**
 * `areaColours` on, as the board's `colour` map draws it: professional and money
 * navy (mist on the dark ground), health sage, creativity mist. The colour paints
 * the area's glyph and the dots of the pages inside it — and nothing else: an
 * area nobody coloured stays ink.
 */
export const ColouredMarks: Story = {
  name: 'rest · area colours',
  args: {
    tree: BOARD_TREE,
    pondName: 'make noise',
    expanded: new Set(['health', 'money']),
    marks: new Map<string, MarkSource>([
      [
        'professional',
        { id: 'professional', parentId: null, title: 'professional', areaRole: 'area-c' },
      ],
      ['health', { id: 'health', parentId: null, title: 'health', areaRole: 'area-a' }],
      ['money', { id: 'money', parentId: null, title: 'money', areaRole: 'area-c' }],
      ['creativity', { id: 'creativity', parentId: null, title: 'creativity', areaRole: 'area-b' }],
    ]),
  },
  render: (args) => <BothThemes {...args} />,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      const canvas = within(probe(canvasElement, theme))
      const row = (name: RegExp) => canvas.getByRole('treeitem', { name })
      const slotColor = (name: RegExp) =>
        getComputedStyle(row(name).querySelector<HTMLElement>('[data-area-mark]')!).color
      const dotColor = (name: RegExp) =>
        getComputedStyle(row(name).querySelector<HTMLElement>('[data-part="dot"]')!).backgroundColor

      await expect(slotColor(/^health/)).toBe(AREA[theme]['area-a'])
      await expect(dotColor(/workouts/)).toBe(AREA[theme]['area-a'])
      await expect(dotColor(/sleep/)).toBe(AREA[theme]['area-a'])

      await expect(slotColor(/^money/)).toBe(AREA[theme]['area-c'])
      await expect(dotColor(/budget/)).toBe(AREA[theme]['area-c'])

      await expect(slotColor(/^professional/)).toBe(AREA[theme]['area-c'])
      await expect(slotColor(/^creativity/)).toBe(AREA[theme]['area-b'])

      // uncoloured areas, and the root, stay ink
      await expect(slotColor(/^personal/)).toBe(INK[theme])
      await expect(
        getComputedStyle(row(/make noise/).querySelector<HTMLElement>('[data-pond-mark]')!).color
      ).toBe(INK[theme])
    }
  },
}

/**
 * `Pond 06.24` frame 4, all four cases in one pond: a chosen glyph beats the
 * automatic one, and every page takes its AREA's colour — a role stored on a page
 * is ignored.
 *
 * The walk up to the area is the load-bearing part and it is silent when broken:
 * `Sleep` carries a glyph and NO role while `Health` carries the role, and
 * `Marathon` carries a role of its own that must lose to Health's.
 */
export const ChosenMarks: Story = {
  tags: ['!dev'],
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
      // nested: a stored role of its own, which its area's overrides
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

      // 3. a page has no colour of its own: the KindDot takes its area's
      const dot = row(/Marathon/).querySelector<HTMLElement>('[data-part="dot"]')!
      await expect(dot).toBeInTheDocument()
      await expect(getComputedStyle(dot).backgroundColor).toBe(AREA[theme]['area-c'])
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
 * `font-weight 500`, radius 10, and — KAN-486 — the rail's existing folder
 * chevron, since change log and trash are always its first two children once
 * the root exists. Its mark is a hand-drawn cylinder in `currentColor` — a
 * FUNCTIONAL mark (stroke 1.4, round caps and joins), not an area glyph,
 * because the root is not one of Life's areas.
 */
const DATABASES: RailNode = node(
  'root-db',
  'page',
  'databases',
  [node('db-1', 'page', 'ingredients', [], 0, 'root-db')],
  9
)

export const DatabasesRoot: Story = {
  tags: ['!dev'],
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
    // `svg[width="13"]` is the mark itself — the caret (KAN-486) is its own 9×9
    // svg and also carries `stroke="currentColor"`, so a bare selector would hit it instead.
    const rootRow = canvas.getByRole('treeitem', { name: /databases/ })
    const svg = rootRow.querySelector<SVGSVGElement>('svg[width="13"][stroke="currentColor"]')!
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

    // The row box: padding 6px 8px, the mark and label 9px apart, and the
    // caret — KAN-486 — now leads the row, the same slot a folder row draws.
    const rowCss = getComputedStyle(rootRow)
    await expect(rowCss.padding).toBe('6px 8px')
    await expect(rowCss.columnGap).toBe('9px')
    await expect(css.columnGap).toBe('9px')
    await expect(rootRow).toHaveAttribute('aria-expanded', 'true')
    const caret = rootRow.querySelector<HTMLButtonElement>('button[aria-hidden="true"]')!
    await expect(caret).not.toBeNull()
    // KAN-486: its rows sit above it, never below, so the caret points UP
    // when open — unlike an ordinary folder row's down caret.
    await expect(caret.querySelector('svg')).toHaveClass('-rotate-90') // expanded
    const inFlow = [...rootRow.children].filter((c) => getComputedStyle(c).position !== 'absolute')
    await expect(inFlow).toEqual([caret, body])
    // 8px foot padding + 8px row padding + the 9px caret + the 9px gap to it
    // = the mark at x 34 from the rail's edge.
    const aside = canvasElement.querySelector('aside')!
    const markLeft = svg.getBoundingClientRect().left - aside.getBoundingClientRect().left
    await expect(Math.abs(markLeft - 34)).toBeLessThan(0.01)
  },
}

/** Toggles `expanded` for real on click — the plain `RailView` is a controlled
 *  component, so a story that needs expanding to actually move pixels (not
 *  just call `onToggle`) wraps it the way `GlyphPickHarness` wraps marks. */
function ExpandHarness(args: ComponentProps<typeof RailView>) {
  const [expanded, setExpanded] = useState<Set<string>>(args.expanded ?? new Set())
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  return (
    <RailView
      {...args}
      expanded={expanded}
      onToggle={(id) => {
        args.onToggle(id)
        toggle(id)
      }}
      // The databases root click->toggle branch (KAN-486) lives in the real
      // `Rail` container's `handleSelect`, which `RailView` alone has no
      // equivalent of — the harness stands in for it, same as the real
      // container does, so a click toggles here too.
      onSelect={(id) => {
        args.onSelect(id)
        if (id === DATABASES.id) toggle(id)
      }}
    />
  )
}

/**
 * Conductor decision A: the databases heading is bottom-anchored and never
 * moves — expanding draws change log/trash/the databases ABOVE it, inside the
 * scroller, not below it. A click that opens the section must not leave a
 * second click, at the same screen position, landing on a database row
 * instead of the heading.
 */
export const HeadingStaysPutWhenExpanded: Story = {
  tags: ['!dev'],
  args: { tree: [...TREE, DATABASES], expanded: new Set() },
  render: (args) => <ExpandHarness {...args} />,
  // The meta decorator's `h-screen` div is a block box, so `aside`'s
  // `self-stretch` (which only does anything inside a flex container) is a
  // no-op there — the real shell wraps the rail in a flex row instead
  // (`WorkspaceShell.tsx`'s `data-part="shell"`). Without that, the foot
  // grows the whole aside rather than staying bottom-anchored, and this
  // story's whole premise goes untested.
  decorators: [
    (Story) => (
      <div className="flex h-full">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = canvas.getByRole('treeitem', { name: /^databases/ })
    await expect(heading).toHaveAttribute('aria-expanded', 'false')
    const before = heading.getBoundingClientRect()

    await userEvent.click(heading)
    await waitFor(() => expect(heading).toHaveAttribute('aria-expanded', 'true'))

    const after = heading.getBoundingClientRect()
    await expect(after.top).toBe(before.top)
    await expect(after.left).toBe(before.left)
    await expect(after.height).toBe(before.height)

    const changeLog = canvas.getByRole('treeitem', { name: 'change log' })
    await expect(changeLog.getBoundingClientRect().bottom).toBeLessThanOrEqual(after.top)

    // A real pointer click at the SAME coordinates recorded before expansion —
    // not a re-query by role — must still land on the heading and collapse
    // it, the way a bottom-anchored-and-growing-upward foot would NOT: there,
    // the same screen position would have landed on the last database row.
    const atRecordedSpot = document.elementFromPoint(before.left + 4, before.top + 4)
    await expect(heading.contains(atRecordedSpot)).toBe(true)
    await userEvent.click(atRecordedSpot as HTMLElement)
    await waitFor(() => expect(heading).toHaveAttribute('aria-expanded', 'false'))
    await expect(canvas.queryByRole('treeitem', { name: 'change log' })).not.toBeInTheDocument()
  },
}

/**
 * One keyboard order across both trees: ↓ from Life's last row lands on the
 * first db row, not the heading — KAN-486 renders the heading LAST (its own
 * rows sit above it, never below), so the heading is reached last, not first.
 */
export const KeyboardIntoDatabases: Story = {
  tags: ['!dev'],
  args: { tree: [...TREE, DATABASES], expanded: new Set(['root-db']) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const lastLifeRow = canvas.getByRole('treeitem', { name: /Scratchpad/ })
    const changeLog = canvas.getByRole('treeitem', { name: 'change log' })
    const databases = canvas.getByRole('treeitem', { name: /^databases/ })

    lastLifeRow.focus()
    await userEvent.keyboard('{ArrowDown}')
    await expect(changeLog).toHaveFocus()
    await expect(changeLog).toHaveAttribute('tabindex', '0')
    await expect(lastLifeRow).toHaveAttribute('tabindex', '-1')

    await userEvent.keyboard('{ArrowUp}')
    await expect(lastLifeRow).toHaveFocus()
    await expect(lastLifeRow).toHaveAttribute('tabindex', '0')
    await expect(changeLog).toHaveAttribute('tabindex', '-1')

    // The heading itself is the LAST row in the flat order: change log, trash,
    // ingredients, then the heading.
    changeLog.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    await expect(databases).toHaveFocus()
  },
}

/**
 * The board always draws the databases row. With no root yet it is still there,
 * with its glyph and no tools, and opening it (click or Enter) asks for the root.
 */
export const DatabasesRowAlwaysDrawn: Story = {
  tags: ['!dev'],
  play: async ({ canvas, args }) => {
    const foot = canvas.getByRole('tree', { name: 'Databases' })
    const row = within(foot).getByRole('treeitem', { name: /databases/ })
    await expect(row.querySelector('svg[stroke="currentColor"]')).toBeInTheDocument()
    await expect(within(row).queryByRole('button')).not.toBeInTheDocument()
    await expect(row).not.toHaveAttribute('aria-expanded')
    await expect(row).toHaveAttribute('draggable', 'false')

    await userEvent.click(row)
    await expect(args.onOpenDatabases).toHaveBeenCalledTimes(1)
    await expect(args.onSelect).not.toHaveBeenCalled()

    row.focus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onOpenDatabases).toHaveBeenCalledTimes(2)
    await userEvent.keyboard('{Delete}+')
    await expect(args.onDelete).not.toHaveBeenCalled()
    await expect(args.onAddChild).not.toHaveBeenCalled()
  },
}

/** The databases row is a foot row: no ＋/× on it, and none on Delete or + either. */
export const DatabasesRootHasNoTools: Story = {
  tags: ['!dev'],
  args: { tree: [...TREE, DATABASES], expanded: new Set(['root-db']) },
  play: async ({ canvas, args }) => {
    const root = canvas.getByRole('treeitem', { name: /databases/ })
    await expect(within(root).queryByRole('button')).not.toBeInTheDocument()
    await userEvent.hover(root)
    await expect(root.querySelector('[data-part="row-tools"]')).toBeNull()

    root.focus()
    await userEvent.keyboard('{Delete}')
    await userEvent.keyboard('+')
    await expect(args.onDelete).not.toHaveBeenCalled()
    await expect(args.onAddChild).not.toHaveBeenCalled()

    // its databases are ordinary rows
    await expect(
      canvas.getByRole('button', { name: 'Add sub-page to ingredients' })
    ).toBeInTheDocument()
  },
}

/**
 * The row wash lives on the treeitem HOST, so it covers the caret and the indent
 * (`PondRail.dc.html` row `background`): selected = ink .07, hover = the rail-only
 * SAGE wash (.07 light / .14 dark). The `list-row` molecule inside is transparent —
 * its own `bg-mn-text/5` hover is the molecule's board, not the rail's.
 */
export const RowWashes: Story = {
  tags: ['!dev'],
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
  tags: ['!dev'],
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
  tags: ['!dev'],
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
      // KAN-486: the max-height / scroll clipping lives on the inner scroller
      // now, not the outer tree — the heading sits after it, outside the clip,
      // so it never moves when the scroller's content grows.
      const scroller = tree.querySelector<HTMLElement>('[data-part="databases-scroller"]')!
      await expect(getComputedStyle(scroller).maxHeight).not.toBe('none')
      // the foot's hairline is the only one: the tree draws none of its own
      await expect(getComputedStyle(tree).borderTopWidth).toBe('0px')
      await expect(scope.querySelectorAll('aside [class*="border-t"]')).toHaveLength(1)
      // measured once the nested row's settle-in entrance has finished moving it
      await Promise.all(tree.getAnimations({ subtree: true }).map((a) => a.finished))
      const dbRows = within(scroller).getAllByRole('treeitem')
      const lastDbRow = dbRows[dbRows.length - 1].getBoundingClientRect()

      // The scroller clips at its padding box: every row's 2px focus ring must
      // fit inside it on all four sides, or a keyboard user loses the indicator.
      const box = scroller.getBoundingClientRect()
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

/** With no databases root the foot is still the databases row, then `settings`. */
export const FootWithoutDatabasesRoot: Story = {
  tags: ['!dev'],
  play: async ({ canvasElement }) => {
    const foot = canvasElement.querySelector<HTMLElement>('[data-part="rail-foot"]')!
    await expect(foot.children).toHaveLength(2)
    await expect(foot.firstElementChild).toHaveAttribute('aria-label', 'Databases')
    await expect(foot.firstElementChild).toHaveTextContent('databases')
    await expect(foot.lastElementChild).toHaveTextContent('settings')
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
  tags: ['!dev'],
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

      // the dot exists on a leaf page (ink .5 at rest); a childless area leads
      // with its title-derived glyph instead
      const marathonDot = dotOf(/Marathon/)
      await expect(marathonDot).toBeInTheDocument()
      const box = marathonDot.getBoundingClientRect()
      await expect([box.width, box.height]).toEqual([7, 7])
      await expect(getComputedStyle(marathonDot).borderTopLeftRadius).toBe('2px')
      await expectInk(getComputedStyle(marathonDot).backgroundColor, theme, 0.5)
      await expect(row(/Scratchpad/).querySelector('[data-area-mark]')).toBeInTheDocument()
      await expect(row(/Scratchpad/).querySelector('[data-part="dot"]')).toBeNull()
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
  tags: ['!dev'],
  args: { tree: [], isEmpty: true },
  play: async ({ canvas }) => {
    const life = canvas.getByRole('treeitem', { name: /life/ })
    await expect(life).not.toHaveAttribute('aria-expanded')
    await expect(life.querySelector('button[aria-hidden="true"]')).toBeNull()
    // the board selects nothing here, so the root draws no resting ＋ — only its hover tools
    const tools = life.querySelector<HTMLElement>('[data-part="row-tools"]')
    await expect(tools).not.toBeNull()
    const add = within(life).getByRole('button', { name: /^Add sub-page to/ })
    await expect(getComputedStyle(add.parentElement!).opacity).toBe('0')
  },
}

// ── Inline rename (`PondRail` `renaming`) ───────────────────────────

/** The board's canon around `books`, the row `renaming` puts the field on. */
const RENAME_TREE: RailNode[] = [
  node('health', 'page', 'health', [], 0),
  node(
    'creativity',
    'page',
    'creativity',
    [
      node('kitchen', 'page', 'kitchen renovation', [], 0, 'creativity'),
      node('books', 'page', 'books', [], 1, 'creativity'),
      node('recipes', 'page', 'recipes', [], 2, 'creativity'),
    ],
    1
  ),
]

const renameArgs = {
  tree: RENAME_TREE,
  expanded: new Set(['creativity']),
  render: (args: ComponentProps<typeof RailView>) => <BothThemes {...args} />,
}

/** `field`'s ring (ink a(.2)) and ground, resolved per theme. */
const RENAME_FIELD: Record<Theme, { ring: string; ground: string }> = {
  light: { ring: 'rgba(27, 29, 20, 0.2) 0px 0px 0px 1px inset', ground: 'rgb(255, 255, 255)' },
  dark: { ring: 'rgba(250, 249, 239, 0.2) 0px 0px 0px 1px inset', ground: 'rgb(27, 29, 20)' },
}

/** Both themes share one `onRename` spy, so each pass starts it afresh. */
const clearRenames = (args: ComponentProps<typeof RailView>) => {
  const spy = args.onRename as ReturnType<typeof fn>
  spy.mockClear()
}

const treeRow = (scope: HTMLElement, id: string) =>
  scope.querySelector<HTMLElement>(`[data-tree-row="${id}"]`)!

/**
 * `PondRail.dc.html` `field`: `flex: 1; padding: 1px 6px; margin: -2px 0;
 * border-radius: 6; box-shadow: inset 0 0 0 1px a(.2); background #FFFFFF (ink:
 * #1B1D14); color ink; font-weight 400`. ＋/× are gone while it is open; the
 * treeitem keeps its role and the field is named `rename books`.
 */
export const Renaming: Story = {
  name: 'renaming',
  args: { tree: renameArgs.tree, expanded: renameArgs.expanded },
  render: renameArgs.render,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      const scope = probe(canvasElement, theme)
      const books = treeRow(scope, 'books')
      const heightAtRest = books.getBoundingClientRect().height
      await expect(
        within(books).getByRole('button', { name: 'Add sub-page to books' })
      ).toBeInTheDocument()

      books.focus()
      await fireEvent.keyDown(books, { key: 'F2' })
      const field = within(books).getByRole<HTMLInputElement>('textbox', { name: 'rename books' })

      await expect(books).toHaveAttribute('role', 'treeitem')
      await expect(field).toHaveFocus()
      await expect(field).toHaveValue('books')
      await expect(field.selectionStart).toBe(0)
      await expect(field.selectionEnd).toBe(5)

      const css = getComputedStyle(field)
      await expect(css.flexGrow).toBe('1')
      await expect(css.minWidth).toBe('0px')
      await expect(css.padding).toBe('1px 6px')
      await expect(css.margin).toBe('-2px 0px')
      await expect(css.borderTopLeftRadius).toBe('6px')
      await expect(srgbAsRgba(css.boxShadow)).toBe(RENAME_FIELD[theme].ring)
      await expect(css.backgroundColor).toBe(RENAME_FIELD[theme].ground)
      await expect(css.color).toBe(INK[theme])
      await expect(css.caretColor).toBe(INK[theme])
      await expect(css.fontWeight).toBe('400')
      await expect(css.outlineStyle).toBe('none')
      // The board's own arithmetic: 1px padding against a -2px margin nets the
      // field 2px SHORTER than the label it replaces, and nothing else in the row
      // is taller, so the row is 2px shorter while open. Never taller.
      await expect(books.getBoundingClientRect().height).toBe(heightAtRest - 2)

      // The ＋/× tools are gone while renaming — the mark button (KAN-248) is not
      // one of them and stays, exactly like a file icon beside a renaming tab.
      await expect(within(books).queryByRole('button', { name: /add sub-page/i })).toBeNull()
      await expect(within(books).queryByRole('button', { name: /^delete/i })).toBeNull()
      await expect(
        within(books).getByRole('button', { name: 'change icon for books' })
      ).toBeInTheDocument()
      await expect(within(treeRow(scope, 'recipes')).queryByRole('textbox')).toBeNull()

      await fireEvent.keyDown(field, { key: 'Escape' })
    }
  },
}

/** F2 → type → ↵ keeps the title and hands focus back to the row. */
export const RenameWithF2: Story = {
  tags: ['!dev'],
  args: { tree: renameArgs.tree, expanded: renameArgs.expanded },
  render: renameArgs.render,
  play: async ({ canvasElement, args }) => {
    for (const theme of THEMES) {
      const scope = probe(canvasElement, theme)
      const books = treeRow(scope, 'books')
      clearRenames(args)

      books.focus()
      await fireEvent.keyDown(books, { key: 'F2' })
      await userEvent.keyboard('reading{Enter}')

      await expect(args.onRename).toHaveBeenCalledTimes(1)
      await expect(args.onRename).toHaveBeenCalledWith('books', 'reading')
      await expect(within(books).queryByRole('textbox')).toBeNull()
      await expect(books).toHaveFocus()
    }
  },
}

/** Double-click opens the field; esc cancels, writes nothing, and the row has focus. */
export const RenameDoubleClickEscape: Story = {
  tags: ['!dev'],
  args: { tree: renameArgs.tree, expanded: renameArgs.expanded },
  render: renameArgs.render,
  play: async ({ canvasElement, args }) => {
    for (const theme of THEMES) {
      const scope = probe(canvasElement, theme)
      const books = treeRow(scope, 'books')
      clearRenames(args)

      await userEvent.dblClick(books)
      await expect(within(books).getByRole('textbox', { name: 'rename books' })).toHaveFocus()
      await userEvent.keyboard('never kept{Escape}')

      await expect(args.onRename).not.toHaveBeenCalled()
      await expect(within(books).queryByRole('textbox')).toBeNull()
      await expect(books).toHaveTextContent('books')
      await expect(books).toHaveFocus()
    }
  },
}

/** Blur keeps — and an emptied field keeps the old title instead. */
export const RenameBlurKeeps: Story = {
  tags: ['!dev'],
  args: { tree: renameArgs.tree, expanded: renameArgs.expanded },
  render: renameArgs.render,
  play: async ({ canvasElement, args }) => {
    for (const theme of THEMES) {
      const scope = probe(canvasElement, theme)
      const books = treeRow(scope, 'books')
      clearRenames(args)

      books.focus()
      await fireEvent.keyDown(books, { key: 'F2' })
      await userEvent.keyboard('reading')
      await userEvent.tab()
      await expect(args.onRename).toHaveBeenCalledTimes(1)
      await expect(args.onRename).toHaveBeenCalledWith('books', 'reading')
      await expect(within(books).queryByRole('textbox')).toBeNull()

      clearRenames(args)
      await fireEvent.keyDown(books, { key: 'F2' })
      await userEvent.keyboard('   {Enter}')
      await expect(args.onRename).not.toHaveBeenCalled()
      await expect(books).toHaveTextContent('books')
    }
  },
}

/** The pond root and the databases foot row are system roots: F2 and double-click do nothing. */
export const RenameSystemRoots: Story = {
  tags: ['!dev'],
  args: { tree: renameArgs.tree, expanded: renameArgs.expanded },
  play: async ({ canvasElement }) => {
    const scope = within(canvasElement)
    for (const id of ['__life__', '__databases__']) {
      const target = canvasElement.querySelector<HTMLElement>(`[data-tree-row="${id}"]`)!
      await expect(target).toBeInTheDocument()
      await fireEvent.keyDown(target, { key: 'F2' })
      await userEvent.dblClick(target)
    }
    await expect(scope.queryByRole('textbox')).toBeNull()
  },
}
