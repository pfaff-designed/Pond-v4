import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { NewPondSheet } from './NewPondSheet'
import { PondSwitcher } from './PondSwitcher'
import { PondContext, PondProvider } from '@/lib/pond/context'
import type { Pond } from '@/lib/pond/client'
import { RailView } from './Rail'
import { srgbAsRgba } from './story-colour'
import { RAIL_WIDTH_PX } from '@/lib/layout/rail-width'

/**
 * The pond switcher in the rail head, and the sheet it opens — `Pond 06.13`
 * `s6m1`–`s6m4`, `PondRail` state `switcher` (#312 / #316 / #319).
 *
 * TWO surfaces, one file, because they are one affordance: the head opens a menu,
 * and the menu's `new pond` row opens the board's three-step sheet.
 *
 * **What is NOT here, and why.** The open menu (the list of ponds, the ✓ on the
 * current one, each row's `?pond=<id>` href) cannot be a story today:
 * `PondSwitcher` takes its ponds from `usePond()`, whose provider loads them
 * through `@/lib/pond/client` → Supabase, and the only seam for that is
 * `sb.mock()`, which Storybook reads **from `.storybook/preview.tsx` alone** (the
 * mock list is built by an AST scan of the preview config — a `sb.mock()` call in
 * a story file is ignored at build time and the real module loads). Adding
 * `sb.mock(import('@/lib/pond/client'))` to the preview is the one line that
 * unlocks `TheList`, `ActiveFromTheUrl` and the two `createPond` paths; it is a
 * shared-file edit and is recorded rather than made here. Until then those
 * assertions stay in jest, and the URL logic under them already has its own home
 * in `src/__tests__/pond-active.test.ts`.
 *
 * Board literals are asserted, never rounded. The head's come from
 * `wayfinder/board-values.generated.json` (`.components.PondRail.base.vals`),
 * which is `PondRail.dc.html`'s own `renderVals()` output. The sheet's come from
 * `Pond 06.13` `s6m2` as quoted inline in `NewPondSheet`'s header — that screen
 * board is not in the tree (only the nine component boards are, through the
 * generated values), so the quote is the best grounding available and is marked
 * as such.
 */

// One spy pair, cleared per story: the sheet's props are callbacks, and
// `component` is `PondSwitcher`, so these cannot ride in `meta.args`.
const onCreate = fn()
const onCancel = fn()

/**
 * The board's raw hex at an alpha, as Chromium reports it.
 *
 * Tailwind v4 compiles `bg-raw-paper/[0.62]` to `color-mix(in oklab, …)`, so a
 * computed background comes back as `oklab(… / 0.62)` and cannot be compared to
 * an `rgba()` string. Resolving the BOARD's own literal through the same mix is
 * the honest comparison: the hex below is the value, not a token name.
 */
function mixed(hex: string, alpha: number): string {
  const probe = document.createElement('div')
  probe.style.backgroundColor = `color-mix(in oklab, ${hex} ${alpha * 100}%, transparent)`
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).backgroundColor
  probe.remove()
  return resolved
}

/** The rail card the head sits in — board `rail`: width 206, padding 18/14. */
const inRailHead: Decorator = (Story) => (
  <PondProvider>
    <div
      className="rounded-mn-card bg-mn-card shadow-mn-card relative flex min-h-[220px] flex-col overflow-visible pt-[18px] pb-[14px] font-sans text-mn-text"
      style={{ width: RAIL_WIDTH_PX }}
    >
      <Story />
    </div>
  </PondProvider>
)

const paper: Decorator = (Story) => (
  <div className="bg-mn-surface rounded-mn-card min-h-[520px] p-mn-6 font-sans">
    <Story />
  </div>
)

const ink: Decorator = (Story) => (
  <div className="dark bg-raw-ink rounded-mn-card min-h-[520px] p-mn-6 font-sans">
    <Story />
  </div>
)

const meta = {
  title: 'Organisms/PondRail/Switcher',
  component: PondSwitcher,
  parameters: {
    layout: 'fullscreen',
    // `?pond=` is the app's only pond-addressing convention; the provider and
    // `pondHref` both read it.
    nextjs: { appDirectory: true, navigation: { query: { pond: 'p-life' } } },
  },
  args: { fallbackName: 'life' },
  beforeEach: async () => {
    onCreate.mockClear()
    onCancel.mockClear()
  },
} satisfies Meta<typeof PondSwitcher>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Before migration 0018 the table does not exist, `listPonds` answers PGRST205,
 * and the head renders the glyph and the name, and NO chevron.
 *
 * This is the state that matters most while the table is missing, and the one
 * that fails silently — a switcher that opens an empty menu is the dead
 * affordance that kept `import from notes` out of #177. It needs no mock: with no
 * session the client resolves to [], which is the before-0018 list.
 */
export const BeforeTheTableExists: Story = {
  decorators: [inRailHead, paper],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The provider's first load has to settle before "no chevron" means anything.
    await waitFor(async () => expect(canvas.getByText('life')).toBeInTheDocument())

    const name = canvasElement.querySelector('[data-part="pond-name"]')
    await expect(name).toHaveTextContent('life')
    // 500 / 13.5, no transform. No chevron, hence no svg, and nothing to click.
    const type = getComputedStyle(name!)
    await expect(type.fontSize).toBe('13.5px')
    await expect(type.fontWeight).toBe('500')
    await expect(type.textTransform).toBe('none')
    await expect(type.letterSpacing).toBe('normal')
    await expect(
      canvasElement.querySelector<HTMLElement>('[data-icon="waves-02"]')!.style.width
    ).toBe('13px')
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
    await expect(canvasElement.querySelector('[data-part="pond-switcher"]')).toBeNull()
    await expect(canvasElement.querySelector('svg')).toBeNull()
  },
}

// ── the open menu ───────────────────────────────────────────────────────────

const PONDS: Pond[] = [
  { id: 'p-life', name: 'life', glyph: 'waves-02', theme: 'paper', order: 0 },
  { id: 'p-noise', name: 'make noise', glyph: 'lightning-03', theme: 'paper', order: 1 },
  { id: 'p-door', name: 'red door guys', glyph: 'house', theme: 'paper', order: 2 },
]

/**
 * The whole rail around a switcher whose pond list is stood in through the
 * context, so the menu is measured from the CARD it is anchored to rather than
 * from a stand-in wrapper.
 */
function RailWithPonds({ dark }: { dark: boolean }) {
  return (
    <div className={`flex h-[560px] bg-mn-surface ${dark ? 'dark' : ''}`}>
      <PondContext.Provider
        value={{
          pond: PONDS[0],
          ponds: PONDS,
          loading: false,
          reload: () => {},
          addPond: () => {},
        }}
      >
        <RailView
          tree={[]}
          pondName="life"
          selectedId={null}
          expanded={new Set<string>()}
          lifeExpanded
          busyId={null}
          isLoading={false}
          isEmpty={false}
          onSelect={fn()}
          onToggle={fn()}
          onAddChild={fn()}
          onDelete={fn()}
          onRename={fn()}
          onLife={fn()}
          onToggleLife={fn()}
          onOpenDatabases={fn()}
          canDrop={() => true}
          onMove={fn()}
        />
      </PondContext.Provider>
    </div>
  )
}

const MENU = {
  light: {
    background: 'linear-gradient(160deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.76))',
    border: 'rgba(255, 255, 255, 0.9)',
    shadow:
      'rgba(255, 255, 255, 0.7) 0px 1px 0px 0px inset, rgba(40, 34, 24, 0.16) 0px 20px 54px 0px',
    ink: '#1B1D14',
    secondary: 'rgba(27, 29, 20, 0.68)',
    meta: 'rgba(27, 29, 20, 0.8)',
  },
  dark: {
    background: 'linear-gradient(160deg, rgba(74, 73, 64, 0.96), rgba(74, 73, 64, 0.86))',
    border: 'rgba(250, 249, 239, 0.09)',
    shadow: 'rgba(0, 0, 0, 0.45) 0px 20px 54px 0px',
    ink: '#FAF9EF',
    secondary: 'rgba(250, 249, 239, 0.68)',
    meta: 'rgba(250, 249, 239, 0.8)',
  },
} as const

/** `PondRail` `menu` / `menuHead` / `menuRow` / `menuRule` / pond rows, computed. */
async function assertOpenMenu(canvasElement: HTMLElement, theme: 'light' | 'dark') {
  const want = MENU[theme]
  const canvas = within(canvasElement)
  const card = canvasElement.querySelector('aside')!
  const switcher = canvasElement.querySelector<HTMLElement>('[data-part="pond-switcher"]')!
  await expect(getComputedStyle(card).overflow).toBe('hidden')

  await userEvent.click(switcher)
  const menu = await canvas.findByRole('menu', { name: 'Ponds' })

  // Anchored to the CARD: top 44, left 10, right 10, over the rail (z 5), and the
  // card stops clipping while it is open.
  await expect(getComputedStyle(card).overflow).toBe('visible')
  const cardBox = card.getBoundingClientRect()
  const box = menu.getBoundingClientRect()
  await expect(Math.round(box.top - cardBox.top)).toBe(44)
  await expect(Math.round(box.left - cardBox.left)).toBe(10)
  await expect(Math.round(cardBox.right - box.right)).toBe(10)
  const css = getComputedStyle(menu)
  await expect(css.position).toBe('absolute')
  await expect(css.zIndex).toBe('5')

  await expect(srgbAsRgba(css.backgroundImage)).toBe(want.background)
  await expect(css.borderTopWidth).toBe('1px')
  await expect(css.borderTopStyle).toBe('solid')
  await expect(srgbAsRgba(css.borderTopColor)).toBe(want.border)
  await expect(css.boxShadow).toBe(want.shadow)
  await expect(css.backdropFilter).toBe('blur(24px) saturate(1.3)')
  await expect(css.display).toBe('flex')
  await expect(css.flexDirection).toBe('column')
  await expect(css.rowGap).toBe('1px')
  await expect(css.padding).toBe('6px')
  await expect(css.borderTopLeftRadius).toBe('16px')

  // section head: sans, not mono
  const head = within(menu).getByText('ponds')
  const headCss = getComputedStyle(head)
  await expect(headCss.padding).toBe('6px 10px 4px')
  await expect(headCss.fontSize).toBe('10.5px')
  await expect(headCss.fontWeight).toBe('500')
  await expect(headCss.letterSpacing).toBe('1.05px')
  await expect(headCss.textTransform).toBe('uppercase')
  await expect(headCss.color).toBe(want.secondary)
  await expect(headCss.fontFamily).toMatch(/PP Neue Montreal/)
  await expect(headCss.fontFamily).not.toMatch(/Mono/)

  // pond rows: 13 glyph, gap 9, padding 7/10, radius 10; the active one is 500 on
  // an ink .07 wash, with the ✓ in 10.5 mono
  const rows = within(menu).getAllByRole('menuitem').slice(0, 3)
  await expect(rows).toHaveLength(3)
  for (const [i, row] of rows.entries()) {
    const rowCss = getComputedStyle(row)
    await expect(rowCss.display).toBe('flex')
    await expect(rowCss.columnGap).toBe('9px')
    await expect(rowCss.padding).toBe('7px 10px')
    await expect(rowCss.borderTopLeftRadius).toBe('10px')
    await expect(rowCss.fontSize).toBe('13px')
    await expect(rowCss.fontWeight).toBe(i === 0 ? '500' : '400')
    await expect(rowCss.backgroundColor).toBe(i === 0 ? mixed(want.ink, 0.07) : 'rgba(0, 0, 0, 0)')
    const glyph = row.querySelector<HTMLElement>('[data-icon]')!
    await expect(glyph.getBoundingClientRect().width).toBe(13)
    await expect(glyph.getBoundingClientRect().height).toBe(13)
  }
  const tick = within(rows[0]).getByText('✓')
  await expect(getComputedStyle(tick).fontSize).toBe('10.5px')
  await expect(getComputedStyle(tick).fontFamily).toMatch(/Mono/)
  await expect(within(rows[1]).queryByText('✓')).not.toBeInTheDocument()

  // the rule: 1 high, margin 4px 8px, ink .09
  const rule = menu.querySelector<HTMLElement>('[role="menuitem"] ~ div')!
  const ruleCss = getComputedStyle(rule)
  await expect(rule.getBoundingClientRect().height).toBe(1)
  await expect(ruleCss.margin).toBe('4px 8px')
  await expect(ruleCss.backgroundColor).toBe(mixed(want.ink, 0.09))

  // `new pond`: a menuRow at ink .8 with a 12×12 plus
  const add = within(menu).getByRole('menuitem', { name: 'new pond' })
  const addCss = getComputedStyle(add)
  await expect(addCss.columnGap).toBe('9px')
  await expect(addCss.padding).toBe('7px 10px')
  await expect(addCss.borderTopLeftRadius).toBe('10px')
  await expect(addCss.fontSize).toBe('13px')
  await expect(addCss.fontWeight).toBe('400')
  await expect(addCss.color).toBe(want.meta)
  const plus = add.querySelector('svg')!
  await expect(plus.getBoundingClientRect().width).toBe(12)
  await expect(plus.getBoundingClientRect().height).toBe(12)
  await expect(plus.querySelector('path')!.getAttribute('d')).toBe('M6 2.4v7.2M2.4 6h7.2')

  // closing gives the card its clip back
  await userEvent.click(switcher)
  await waitFor(() => expect(getComputedStyle(card).overflow).toBe('hidden'))
}

/** `PondRail` `switcher`, paper: the menu's values, measured from the rail card. */
export const MenuOpen: Story = {
  render: () => <RailWithPonds dark={false} />,
  play: ({ canvasElement }) => assertOpenMenu(canvasElement, 'light'),
}

/** `PondRail` `switcher`, ink: the same menu on the dark roles. */
export const MenuOpenDark: Story = {
  render: () => <RailWithPonds dark />,
  play: ({ canvasElement }) => assertOpenMenu(canvasElement, 'dark'),
}

// ── the sheet the menu's `new pond` row opens ───────────────────────────────

interface SheetHarnessProps {
  pending?: boolean
  failure?: string | null
}

/** The sheet as the switcher mounts it: `naming` true, `create` behind `onCreate`. */
function SheetHarness({ pending, failure = null }: SheetHarnessProps) {
  return (
    <NewPondSheet onCreate={onCreate} onCancel={onCancel} pending={pending} failure={failure} />
  )
}

/**
 * `s6m2`: a SHEET over a paper scrim, not a field in the menu — and the board's
 * rows are PRESENT, not omitted. #316 ships glyph, theme and the later steps in
 * `PondControl`'s own `disabled` state, so nothing is missing from the board and
 * nothing pretends to be live.
 */
export const TheSheet: Story = {
  decorators: [paper],
  render: () => <SheetHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sheet = canvas.getByRole('dialog', { name: 'New pond' })

    await expect(sheet).toHaveTextContent('new pond')
    await expect(sheet).toHaveTextContent('1 of 3')
    await expect(sheet).toHaveTextContent('Name it')
    // The disabled rows are rendered, not dropped.
    await expect(sheet).toHaveTextContent('glyph')
    await expect(sheet).toHaveTextContent('theme')
    await expect(sheet).toHaveTextContent('burnt orange')

    // `s6m2`'s own numbers: 540 wide, top 120, radius 20, padding 22/24, gap 18.
    const style = getComputedStyle(sheet)
    await expect(style.width).toBe('540px')
    await expect(style.top).toBe('120px')
    await expect(style.borderRadius).toBe('20px')
    await expect(style.padding).toBe('22px 24px')
    await expect(style.rowGap).toBe('18px')

    // The scrim is PAPER at .62, not an ink dialog backdrop.
    const scrim = canvasElement.querySelector('[aria-hidden="true"].fixed')
    await expect(getComputedStyle(scrim!).backgroundColor).toBe(mixed('#FAF9EF', 0.62))
  },
}

/** Dark is two papers, and the sheet's scrim inverts with them: ink at .62. */
export const TheSheetDark: Story = {
  decorators: [ink],
  render: () => <SheetHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('dialog', { name: 'New pond' })).toBeInTheDocument()
    const scrim = canvasElement.querySelector('[aria-hidden="true"].fixed')
    await expect(getComputedStyle(scrim!).backgroundColor).toBe(mixed('#1B1D14', 0.62))
  },
}

/**
 * `s6m2` → `s6m3` → `s6m4`, then the pond is made. The last step's primary names
 * what it does (`make pond`, not `continue`), per W6: "an accept may be named for
 * what it does".
 */
export const WalkingTheThreeSteps: Story = {
  decorators: [paper],
  render: () => <SheetHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sheet = canvas.getByRole('dialog', { name: 'New pond' })

    await userEvent.type(canvas.getByPlaceholderText('make noise'), 'red door guys')

    await userEvent.click(canvas.getByRole('button', { name: 'continue' }))
    await expect(sheet).toHaveTextContent('2 of 3')
    await expect(sheet).toHaveTextContent('Areas')
    await expect(sheet).toHaveTextContent('Areas are pages with pages inside')

    await userEvent.click(canvas.getByRole('button', { name: 'continue' }))
    await expect(sheet).toHaveTextContent('3 of 3')
    await expect(sheet).toHaveTextContent('Sources')
    await expect(sheet).toHaveTextContent('google sheet')

    await userEvent.click(canvas.getByRole('button', { name: 'make pond' }))
    await expect(onCreate).toHaveBeenCalledWith('red door guys')
  },
}

/**
 * `s6m2`: "skip gives 'untitled pond'" — so skip CREATES, straight away, and the
 * empty name is legal: the column default supplies the name.
 */
export const SkipMakesItStraightAway: Story = {
  decorators: [paper],
  render: () => <SheetHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'skip' }))
    await expect(onCreate).toHaveBeenCalledWith('')
  },
}

/**
 * A failed write says what went wrong and the sheet STAYS OPEN. Closing silently
 * is the failure worth a story: the person would have no way to tell the pond was
 * never made.
 */
export const MakingItFailed: Story = {
  decorators: [paper],
  render: () => <SheetHarness failure='relation "ponds" does not exist' />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/could not make it/)).toBeInTheDocument()
    await expect(canvas.getByRole('dialog', { name: 'New pond' })).toBeInTheDocument()
  },
}

/**
 * While the write is in flight every control is inert — the sheet's answer to
 * double-submit (AUDIT G9), and a state no board frame draws. All three controls
 * go `disabled`, which in `PondControl` also means `pointer-events: none`, so
 * there is no second `make pond` to click.
 */
export const Pending: Story = {
  decorators: [paper],
  render: () => <SheetHarness pending />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'skip' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'continue' })).toBeDisabled()
    await expect(canvas.getByPlaceholderText('make noise')).toBeDisabled()
  },
}
