import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import {
  PondBlock,
  PondBlockEmpty,
  POND_BLOCK_KINDS,
  POND_BLOCK_STATES,
  POND_BLOCK_WIDTHS,
  POND_BLOCK_HOVER_ROW,
  POND_BLOCK_SKELETON,
  POND_BLOCK_ROW_GAP,
  POND_BLOCK_EMPTY,
  POND_BLOCK_FILTERED_EMPTY_LINE,
  POND_BLOCK_ERROR_LINE,
  POND_BLOCK_TOMB_WIDTH,
  POND_BLOCK_TOMB_NOTE,
  POND_BLOCK_TOMB_FIXTURE,
  BLOCK_LOADING_NOTE,
  blockEmptyCopy,
  blockErrorLine,
  blockRowState,
  blockTombLine,
  type PondBlockKind,
  type PondBlockState,
} from './PondBlock'
import { PondMolecule } from '@/components/molecules/PondMolecule'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { TableView } from '@/lib/modules/table/view'

/**
 * PondBlock (#237 frame · #238 states) — the play functions assert the COMPUTED
 * values against the numbers read off `PondBlock.dc.html`'s `renderVals()` (its
 * frames render under a transform, so the inline `style` is the geometry source
 * and computed styles the type/colour source):
 *
 *   block    padding 16px 18px · radius 20 · gap 12 · card · --mn-shadow-card
 *   W        list 400 · checklist 400 · table 500 · gallery 580 · number 400 · log 460 · properties 400
 *   eyebrow  10.5 / 500 / .1em / uppercase / ink .68 / PP Neue Montreal
 *   headMeta PP Neue Montreal Mono 10.5 / ink .68
 *
 *   hover    card boxShadow === cardShadow (unchanged) · row R[kind] → molecule hover
 *   selected boxShadow `0 0 0 2px fg, cardShadow` · gallery card 1 → molecule selected
 *   loading  headNote `loading…` · static bars (block · h · w · radius 5 · ink .08)
 *   error    PondMolecule notice · reconnect · the kind's errLine
 *   disabled opacity .4 · the card is `inert` (no clicks, typing or Tab reach the body)
 *   empty    emptyBox flex · center · space-between · gap 12 · padding 14 · radius 14 ·
 *            ink .035 — emptyText 13.5 / ink .68 sans — EL[kind] copy, lowercase —
 *            a secondary button at 32px, wired · rows / gallery / big suppressed ·
 *            the head keeps its normal note
 *   deleted  W 460 for EVERY kind · background transparent · boxShadow is ONE layer,
 *            `inset 0 0 0 1.4px ink .2` (solid, not dashed; no card shadow) · the
 *            head keeps its heading, note → `database deleted` · tomb column gap 12 ·
 *            tombText mono 11 / 1.55 / ink .8 (META tier) · the board's sentence
 *            naming the kind's heading · restore (secondary) + remove block (ghost)
 *            at gap 8 / 32px, wired · rows / gallery / big / skeleton / notice suppressed
 */

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

const meta = {
  title: 'Organisms/2i · blocks',
  component: PondBlock,
  parameters: { layout: 'padded' },
  args: { kind: 'list', heading: 'notifications', headNote: '3', children: null },
} satisfies Meta<typeof PondBlock>

export default meta
type Story = StoryObj<typeof meta>

/** The board's fixture head per kind (`H0`). */
const HEAD: Record<PondBlockKind, [string, string]> = {
  list: ['notifications', '3'],
  checklist: ['method', '1 of 3'],
  table: ['calories', 'rows only'],
  gallery: ['recipes', '18 records'],
  number: ['kcal this week', ''],
  log: ['entry log', 'cooked 3 times'],
  properties: ['record', 'recipes'],
}

/**
 * The board's body per kind (`R` / `cards` / `big`), built from PondMolecule so
 * `blockRowState(kind, state, i)` paints the hover/selected row exactly where the
 * board does. These are demo fixtures: in the product the module view is the body.
 */
function Body({ kind, state }: { kind: PondBlockKind; state: PondBlockState }) {
  const rowState = (i: number) => blockRowState(kind, state, i)
  const stack = `flex flex-col ${POND_BLOCK_ROW_GAP[kind]}`
  switch (kind) {
    case 'list':
      return (
        <div className={stack}>
          {(
            [
              ['cabinet quote', 'today'],
              ['renew insurance', '28 sep'],
              ['standup', '30 sep'],
            ] as const
          ).map(([t, m], i) => (
            <PondMolecule key={t} kind="list-row" title={t} meta={m} state={rowState(i)} />
          ))}
        </div>
      )
    case 'checklist':
      return (
        <div className={stack}>
          {['soak overnight', 'simmer 25 min with bay', 'stir through harissa'].map((t, i) => (
            <PondMolecule key={t} kind="check-row" title={t} on={i === 0} state={rowState(i)} />
          ))}
        </div>
      )
    case 'table': {
      const rows = [
        ['19 sep', 'chickpeas, harissa', '2', '1,040', 'rest'],
        ['17 sep', 'cacio e pepe', '1', '710', 'error'],
        ['14 sep', 'chickpeas, harissa', '1', '520', 'rest'],
      ] as const
      return (
        <div className={stack}>
          <div className="grid gap-x-3.5 border-b border-mn-text/[0.09] px-2 pb-2 [grid-template-columns:62px_minmax(0,1fr)_64px_80px]">
            {['date', 'recipe', 'servings'].map((h) => (
              <span key={h} className={pageEyebrowClass}>
                {h}
              </span>
            ))}
            <span className={`${pageEyebrowClass} text-right`}>kcal</span>
          </div>
          {rows.map(([m, t, q, v, st], i) => (
            <PondMolecule
              key={m}
              kind="table-row"
              meta={m}
              title={t}
              qty={q}
              value={v}
              state={rowState(i) === 'rest' ? st : rowState(i)}
            />
          ))}
        </div>
      )
    }
    case 'log':
      return (
        <div className={stack}>
          {(
            [
              ['19 sep', 'Cooked for four. Needs more salt than you think.'],
              ['14 sep', 'Half batch. Breadcrumbs next time.'],
              ['2 sep', 'First go, from the Ottolenghi book.'],
            ] as const
          ).map(([m, t], i) => (
            <PondMolecule key={m} kind="entry" meta={m} title={t} state={rowState(i)} />
          ))}
        </div>
      )
    case 'properties':
      return (
        <div className={stack}>
          {(
            [
              ['kcal per serving', '520', 'number'],
              ['time', '25m', 'duration'],
              ['cooked', '19 sep', 'date'],
              ['source', 'Ottolenghi, Simple', 'text'],
            ] as const
          ).map(([l, v, k], i) => (
            <PondMolecule
              key={l}
              kind="field-row"
              label={l}
              value={v}
              valueKind={k}
              state={rowState(i)}
            />
          ))}
        </div>
      )
    case 'gallery':
      return (
        <div className="flex flex-wrap gap-3">
          {(
            [
              ['chickpeas, harissa, yoghurt', '25m'],
              ['cacio e pepe', '15m'],
              ['sourdough, 78%', '18h'],
            ] as const
          ).map(([t, m], i) => (
            <PondMolecule
              key={t}
              kind="record-card"
              title={t}
              meta={m}
              tag="recipe"
              state={rowState(i)}
            />
          ))}
        </div>
      )
    case 'number':
      return (
        <div className="flex flex-col gap-1.5">
          <span className="text-[76px] leading-[0.9] font-bold tracking-[-0.03em] tabular-nums">
            11,240
          </span>
          <span className="font-mono text-mn-11 text-mn-text-secondary">
            kcal · 6 of 7 days logged
          </span>
        </div>
      )
  }
}

function AllKinds({
  state = 'rest',
  onEmptyAction,
  onRestore,
  onRemoveBlock,
}: {
  state?: PondBlockState
  onEmptyAction?: (kind: PondBlockKind) => void
  onRestore?: (kind: PondBlockKind) => void
  onRemoveBlock?: (kind: PondBlockKind) => void
}) {
  return (
    <div className="flex min-w-[640px] flex-col items-start gap-mn-4">
      {POND_BLOCK_KINDS.map((kind) => (
        <PondBlock
          key={kind}
          kind={kind}
          heading={HEAD[kind][0]}
          headNote={HEAD[kind][1]}
          state={state}
          onEmptyAction={onEmptyAction ? () => onEmptyAction(kind) : undefined}
          onRestore={onRestore ? () => onRestore(kind) : undefined}
          onRemoveBlock={onRemoveBlock ? () => onRemoveBlock(kind) : undefined}
        >
          <Body kind={kind} state={state} />
        </PondBlock>
      ))}
    </div>
  )
}

const LIGHT = {
  card: 'rgb(250, 249, 239)',
  ink: 'rgb(27, 29, 20)',
  ink68: 'rgba(27, 29, 20, 0.68)',
  ink80: 'rgba(27, 29, 20, 0.8)',
  shadow: ['rgba(40, 34, 24, 0.04) 0px 1px 2px', 'rgba(40, 34, 24, 0.06) 0px 8px 24px'],
}
const DARK = {
  card: 'rgb(48, 49, 42)',
  ink: 'rgb(250, 249, 239)',
  ink68: 'rgba(250, 249, 239, 0.68)',
  ink80: 'rgba(250, 249, 239, 0.8)',
  shadow: ['rgba(0, 0, 0, 0.3) 0px 1px 2px', 'rgba(0, 0, 0, 0.34) 0px 8px 24px'],
}
type Theme = typeof LIGHT

/** The alpha of a computed colour — `rgba(…, a)`, `color(srgb … / a)` or `oklab(… / a)`. */
function alphaOf(color: string): number {
  // `rgb(r, g, b)` is opaque — never read its blue channel as an alpha.
  if (/^rgb\(/.test(color) && !color.includes('/')) return 1
  const m = color.match(/(?:\/|,)\s*([\d.]+%?)\s*\)\s*$/)
  if (!m) return NaN
  return m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1])
}

/**
 * The painted layers of a computed `box-shadow`, outermost first. Tailwind v4 composes
 * ring + shadow through empty `0 0 #0000` placeholders, which Chrome serialises as
 * transparent zero layers — drop those so only what the board draws remains.
 */
function shadowLayers(boxShadow: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of boxShadow) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out.filter((l) => !/^rgba\(0, 0, 0, 0\) 0px 0px 0px 0px/.test(l))
}

const card = (root: HTMLElement, kind: PondBlockKind) =>
  root.querySelector<HTMLElement>(`[data-block-kind="${kind}"]`)!
const noteOf = (c: HTMLElement) => (c.firstElementChild as HTMLElement).children[1] as HTMLElement
const contentWidth = (c: HTMLElement) => {
  const cs = getComputedStyle(c)
  return c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
}

/**
 * The board's per-kind TABLES, written out as literals, once. Every loop below reads
 * the constants, so on its own this file would keep agreeing with itself the day a
 * value moved — and a value written in a board is final. This is the one place the
 * numbers and the copy are spelled, so a drift off the board fails here by name.
 */
async function assertBoardTables() {
  await expect(POND_BLOCK_STATES).toEqual([
    'rest',
    'hover',
    'selected',
    'empty',
    'loading',
    'error',
    'deleted',
    'disabled',
  ])
  await expect(POND_BLOCK_WIDTHS).toEqual({
    list: 400,
    checklist: 400,
    table: 500,
    gallery: 580,
    number: 400,
    log: 460,
    properties: 400,
  })
  // `R`: on hover exactly one child row paints, at this index; `number` has no rows.
  await expect(POND_BLOCK_HOVER_ROW).toEqual({
    list: 1,
    checklist: 1,
    table: 0,
    log: 0,
    properties: 0,
    gallery: 0,
    number: null,
  })
  const ten = [
    ['w-[82%]', 'h-[10px]'],
    ['w-[64%]', 'h-[10px]'],
    ['w-[74%]', 'h-[10px]'],
  ]
  await expect(POND_BLOCK_SKELETON).toEqual({
    list: ten,
    checklist: ten,
    table: ten,
    log: ten,
    properties: ten,
    number: [
      ['w-[60%]', 'h-[52px]'],
      ['w-[40%]', 'h-[10px]'],
    ],
    gallery: [
      ['w-full', 'h-[120px]'],
      ['w-[50%]', 'h-[10px]'],
    ],
  })
  // The row stack's gap: 0 for table (its rows draw their own rule), 2 elsewhere.
  for (const kind of POND_BLOCK_KINDS) {
    await expect(POND_BLOCK_ROW_GAP[kind]).toBe(kind === 'table' ? 'gap-0' : 'gap-[2px]')
  }
  // `errLine`, curly apostrophes (U+2019) included.
  const sheet = 'pond can’t reach this sheet any more · showing the last copy'
  const block = 'this block couldn’t load'
  await expect(POND_BLOCK_ERROR_LINE).toEqual({
    list: block,
    checklist: block,
    table: sheet,
    gallery: sheet,
    number: sheet,
    log: block,
    properties: block,
  })
  // `EL` — the board's gallery row reads `no recipes yet` for its recipes fixture;
  // the board's own shape is `records`.
  await expect(POND_BLOCK_EMPTY).toEqual({
    list: { line: 'nothing due', action: 'add an item' },
    checklist: { line: 'no steps yet', action: 'add a step' },
    table: { line: 'no rows yet', action: 'add a row' },
    gallery: { line: 'no records yet', action: 'add a record' },
    number: { line: 'no values this week', action: 'pick a field' },
    log: { line: 'no entries yet', action: 'write one' },
    properties: { line: 'no fields yet', action: 'add a field' },
  })
  // Lowercase as authored, with no sentence case and no `+` prefix on the action.
  for (const kind of POND_BLOCK_KINDS) {
    const { line, action } = blockEmptyCopy(kind)
    await expect(line).toBe(line.toLowerCase())
    await expect(action).toBe(action.toLowerCase())
    await expect(action.startsWith('+')).toBe(false)
  }
  await expect(POND_BLOCK_FILTERED_EMPTY_LINE).toBe('nothing matches this filter')
  // The board's note — a one-character ellipsis (U+2026).
  await expect(BLOCK_LOADING_NOTE).toBe('loading…')
  // The tombstone: ONE width for every kind, not a per-kind map, and its fixtures.
  await expect(POND_BLOCK_TOMB_WIDTH).toBe(460)
  await expect(POND_BLOCK_TOMB_NOTE).toBe('database deleted')
  await expect(POND_BLOCK_TOMB_FIXTURE).toEqual({ deletedOn: '22 sep', restoreWindow: '30 days' })
}

/** The rest card: paper + the two-layer card shadow and nothing more — and live. */
async function assertRestCard(c: HTMLElement, theme: Theme) {
  const cs = getComputedStyle(c)
  await expect(cs.backgroundColor).toBe(theme.card)
  for (const layer of theme.shadow) await expect(cs.boxShadow).toContain(layer)
  await expect(cs.boxShadow).not.toContain('0px 0px 0px 2px')
  await expect(cs.transform).toBe('none')
  await expect(cs.opacity).toBe('1')
  await expect(c.hasAttribute('inert')).toBe(false)
  // The tombstone recipe leaks into no other state: no stone, no hairline ring.
  await expect(c.querySelector('[data-part="tomb"]')).toBeNull()
  await expect(cs.boxShadow).not.toContain('inset')
}

/** Every card on the canvas measures to the board, in the given theme. */
async function assertFrames(canvasElement: HTMLElement, theme: Theme) {
  for (const kind of POND_BLOCK_KINDS) {
    const c = card(canvasElement, kind)
    await expect(c).toBeTruthy()
    const cs = getComputedStyle(c)
    // Width (ADR 0008): every block FILLS the content column — here the Frames flex
    // container — rather than the board's old per-kind px. The padding/radius/etc below
    // are unchanged board values.
    const p = c.parentElement!
    const pcs = getComputedStyle(p)
    const avail = p.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight)
    await expect(c.getBoundingClientRect().width).toBeCloseTo(avail, 0)
    await expect(cs.paddingTop).toBe('16px')
    await expect(cs.paddingBottom).toBe('16px')
    await expect(cs.paddingLeft).toBe('18px')
    await expect(cs.paddingRight).toBe('18px')
    await expect(cs.borderTopLeftRadius).toBe('20px')
    await expect(cs.rowGap).toBe('12px')
    await expect(cs.display).toBe('flex')
    await expect(cs.flexDirection).toBe('column')
    await expect(cs.boxSizing).toBe('border-box')
    // Paper + shadow, not a border.
    await assertRestCard(c, theme)
    await expect(cs.borderTopWidth).toBe('0px')

    // rest draws the module view untouched — no empty box, no skeleton, no notice.
    await expect(c.children).toHaveLength(2)
    await expect(c.querySelector('[data-part="empty"]')).toBeNull()
    await expect(c.querySelector('[data-part="skeleton"]')).toBeNull()
    await expect(c.querySelector('[data-kind="notice"]')).toBeNull()

    // The head row: eyebrow + headNote on one baseline row, 12 apart. `number` has
    // no note and still gets BOTH slots — the board draws the empty one.
    const head = c.firstElementChild as HTMLElement
    await expect(head.children).toHaveLength(2)
    const hs = getComputedStyle(head)
    await expect(hs.display).toBe('flex')
    await expect(hs.alignItems).toBe('baseline')
    await expect(hs.justifyContent).toBe('space-between')
    await expect(hs.columnGap).toBe('12px')

    const [eyebrow, note] = Array.from(head.children) as HTMLElement[]
    const es = getComputedStyle(eyebrow)
    await expect(eyebrow.textContent).toBe(HEAD[kind][0])
    await expect(es.fontSize).toBe('10.5px')
    await expect(es.fontWeight).toBe('500')
    await expect(es.letterSpacing).toBe('1.05px') // .1em of 10.5
    await expect(es.textTransform).toBe('uppercase')
    await expect(es.color).toBe(theme.ink68)
    await expect(es.fontFamily).toContain('PP Neue Montreal')
    await expect(es.fontFamily).not.toContain('Mono')

    const ns = getComputedStyle(note)
    await expect(note.textContent).toBe(HEAD[kind][1])
    await expect(ns.fontFamily).toContain('PP Neue Montreal Mono')
    await expect(ns.fontSize).toBe('10.5px')
    await expect(ns.textTransform).toBe('none')
    await expect(ns.color).toBe(theme.ink68)
  }
}

/** All seven kinds on paper, measured against the board — and the board's tables. */
export const Kinds: Story = {
  render: () => <AllKinds />,
  play: async ({ canvasElement }) => {
    await assertBoardTables()
    await assertFrames(canvasElement, LIGHT)
  },
}

/** The same seven on ink: card #30312A, the heavier dark shadow, ink .68 flips to paper .68. */
export const KindsInk: Story = {
  render: () => <AllKinds />,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertFrames(canvasElement, DARK),
}

// ── hover: the card does NOT change; one row paints ─────────────────────────────

async function assertHover(canvasElement: HTMLElement, theme: Theme) {
  for (const kind of POND_BLOCK_KINDS) {
    const c = card(canvasElement, kind)
    await expect(c.dataset.blockState).toBe('hover')
    // The board's hover boxShadow IS cardShadow — no lift, no swap, no tint.
    await assertRestCard(c, theme)

    const rows = Array.from(
      c.querySelectorAll<HTMLElement>(
        '[data-kind="list-row"],[data-kind="check-row"],[data-kind="table-row"],[data-kind="entry"],[data-kind="field-row"],[data-kind="record-card"]'
      )
    )
    const idx = POND_BLOCK_HOVER_ROW[kind]
    if (idx === null) {
      await expect(rows).toHaveLength(0)
      continue
    }
    const hovered = rows.filter((r) => r.dataset.state === 'hover')
    await expect(hovered).toHaveLength(1)
    await expect(rows.indexOf(hovered[0])).toBe(idx)
    // Rows carry the molecule's `bg-mn-text/5` wash; the gallery card's hover is
    // the molecule's own recipe — the frame only picks WHICH card goes hover.
    if (kind !== 'gallery') {
      await expect(alphaOf(getComputedStyle(hovered[0]).backgroundColor)).toBeCloseTo(0.05, 2)
    }
  }
  // And a REAL pointer over the card changes no pixel of it either: the board gives
  // the frame no `:hover` rule at all, so a stray lift or tint can only come from a
  // class nobody drew — invisible in jsdom, which has no hover.
  const c = card(canvasElement, 'list')
  const before = getComputedStyle(c).boxShadow
  await userEvent.hover(c)
  await expect(getComputedStyle(c).boxShadow).toBe(before)
  await assertRestCard(c, theme)
  await userEvent.unhover(c)
}

/** hover — board parity: the card is identical to rest; row R[kind] carries the wash. */
export const Hover: Story = {
  render: () => <AllKinds state="hover" />,
  play: async ({ canvasElement }) => assertHover(canvasElement, LIGHT),
}

export const HoverInk: Story = {
  render: () => <AllKinds state="hover" />,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertHover(canvasElement, DARK),
}

// ── selected: 0 0 0 2px fg, cardShadow ───────────────────────────────────────────

async function assertSelected(canvasElement: HTMLElement, theme: Theme) {
  for (const kind of POND_BLOCK_KINDS) {
    const c = card(canvasElement, kind)
    const cs = getComputedStyle(c)
    // The ring is PREPENDED to the shadow: both are present, ring first.
    const layers = shadowLayers(cs.boxShadow)
    await expect(layers).toHaveLength(3)
    await expect(layers[0]).toBe(`${theme.ink} 0px 0px 0px 2px`)
    await expect(layers[1].startsWith(theme.shadow[0])).toBe(true)
    await expect(layers[2].startsWith(theme.shadow[1])).toBe(true)
    await expect(cs.backgroundColor).toBe(theme.card)
    await expect(cs.transform).toBe('none')
    await expect(cs.opacity).toBe('1')

    const selectedRows = Array.from(c.querySelectorAll<HTMLElement>('[data-state="selected"]'))
    if (kind === 'gallery') {
      const cards = Array.from(c.querySelectorAll<HTMLElement>('[data-kind="record-card"]'))
      await expect(selectedRows).toHaveLength(1)
      await expect(cards.indexOf(selectedRows[0])).toBe(1)
    } else {
      await expect(selectedRows).toHaveLength(0)
    }
  }
}

/** selected — a 2px full-ink ring outside the card shadow; gallery card 1 selected too. */
export const Selected: Story = {
  render: () => <AllKinds state="selected" />,
  play: async ({ canvasElement }) => assertSelected(canvasElement, LIGHT),
}

export const SelectedInk: Story = {
  render: () => <AllKinds state="selected" />,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertSelected(canvasElement, DARK),
}

// ── loading: the static skeleton ────────────────────────────────────────────────

const BAR_PCT: Record<string, number> = {
  'w-[82%]': 82,
  'w-[64%]': 64,
  'w-[74%]': 74,
  'w-[60%]': 60,
  'w-[40%]': 40,
  'w-full': 100,
  'w-[50%]': 50,
}
const BAR_PX: Record<string, number> = { 'h-[10px]': 10, 'h-[52px]': 52, 'h-[120px]': 120 }

async function assertLoading(canvasElement: HTMLElement, theme: Theme) {
  // The board's note, pinned once: a one-character ellipsis (U+2026).
  await expect(BLOCK_LOADING_NOTE).toBe('loading…')
  for (const kind of POND_BLOCK_KINDS) {
    const c = card(canvasElement, kind)
    await assertRestCard(c, theme)
    await expect(c.getAttribute('aria-busy')).toBe('true')
    await expect(c.hasAttribute('inert')).toBe(false)
    await expect(noteOf(c).textContent).toBe(BLOCK_LOADING_NOTE)
    // Rows, the gallery and the big number are all suppressed.
    await expect(c.querySelectorAll('[data-kind]')).toHaveLength(0)

    const stack = c.querySelector<HTMLElement>('[data-part="skeleton"]')!
    await expect(stack.hasAttribute('aria-busy')).toBe(false)
    const ss = getComputedStyle(stack)
    await expect(ss.display).toBe('flex')
    await expect(ss.flexDirection).toBe('column')
    await expect(ss.rowGap).toBe(kind === 'table' ? '0px' : '2px')

    const bars = Array.from(stack.children) as HTMLElement[]
    const spec = POND_BLOCK_SKELETON[kind]
    await expect(bars).toHaveLength(spec.length)
    const inner = contentWidth(c)
    for (let i = 0; i < bars.length; i++) {
      const bs = getComputedStyle(bars[i])
      const [w, h] = spec[i]
      await expect(bs.display).toBe('block')
      await expect(bs.height).toBe(`${BAR_PX[h]}px`)
      await expect(parseFloat(bs.width)).toBeCloseTo((inner * BAR_PCT[w]) / 100, 0)
      await expect(bs.borderTopLeftRadius).toBe('5px')
      await expect(alphaOf(bs.backgroundColor)).toBeCloseTo(0.08, 2)
      // Static: no sweep, pulse or shimmer.
      await expect(bs.animationName).toBe('none')
      await expect(bs.backgroundImage).toBe('none')
    }
  }
}

/** loading — `loading…` note; per-kind bars at h / w / radius 5 / ink .08; no animation. */
export const Loading: Story = {
  render: () => <AllKinds state="loading" />,
  play: async ({ canvasElement }) => assertLoading(canvasElement, LIGHT),
}

export const LoadingInk: Story = {
  render: () => <AllKinds state="loading" />,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertLoading(canvasElement, DARK),
}

// ── error: the notice molecule ──────────────────────────────────────────────────

async function assertError(canvasElement: HTMLElement, theme: Theme) {
  for (const kind of POND_BLOCK_KINDS) {
    const c = card(canvasElement, kind)
    await assertRestCard(c, theme)
    // The head keeps the kind's own note.
    await expect(noteOf(c).textContent).toBe(HEAD[kind][1])

    const notices = c.querySelectorAll<HTMLElement>('[data-kind="notice"]')
    await expect(notices).toHaveLength(1)
    await expect(c.querySelectorAll('[data-kind]')).toHaveLength(1)
    const notice = notices[0]
    const title = notice.querySelector<HTMLElement>('[data-part="title"]')!
    await expect(title.textContent).toBe(blockErrorLine(kind))
    await expect(title.textContent).toContain('’')
    await expect(notice.querySelector('[data-part="action"]')!.textContent).toBe('reconnect')
    const ts = getComputedStyle(title)
    await expect(ts.fontFamily).toContain('PP Neue Montreal Mono')
    await expect(ts.fontSize).toBe('11px')
    // Ink .8, the notice's own tier. Asserted since #252: `cn()` was dropping this
    // colour because `text-mn-text-meta` and `text-mn-11` looked like one group to
    // tailwind-merge, so the error line shipped at the wrong tier — and this story
    // passed anyway, because it checked the font and the size but never the colour.
    await expect(ts.color).toBe(theme.ink80)
    // The board's notice is 440 wide; it never overflows the paper.
    const nw = parseFloat(getComputedStyle(notice).width)
    await expect(nw).toBeCloseTo(Math.min(440, contentWidth(c)), 0)
  }
}

/** error — PondMolecule's notice, `reconnect`, the kind's copy with its curly apostrophe. */
export const ErrorNotice: Story = {
  render: () => <AllKinds state="error" />,
  play: async ({ canvasElement }) => assertError(canvasElement, LIGHT),
}

export const ErrorNoticeInk: Story = {
  render: () => <AllKinds state="error" />,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertError(canvasElement, DARK),
}

// ── disabled: opacity .4, and the card is inert ─────────────────────────────────

async function assertDisabled(canvasElement: HTMLElement, theme: Theme) {
  for (const kind of POND_BLOCK_KINDS) {
    const c = card(canvasElement, kind)
    const cs = getComputedStyle(c)
    await expect(cs.opacity).toBe('0.4')
    // No pixel but the opacity changes: same paper, same shadow, no ring.
    await expect(cs.backgroundColor).toBe(theme.card)
    for (const layer of theme.shadow) await expect(cs.boxShadow).toContain(layer)
    await expect(cs.boxShadow).not.toContain('0px 0px 0px 2px')
    await expect(cs.transform).toBe('none')
    // Disabled means disabled: the live body under the card takes no clicks, no
    // typing and no Tab — `inert` as a real boolean attribute, not a styling hint.
    await expect(c.hasAttribute('inert')).toBe(true)
    await expect(c.getAttribute('aria-disabled')).toBeNull()
    // The board DRAWS the body at .4 — it is faded, not replaced.
    if (POND_BLOCK_HOVER_ROW[kind] !== null) {
      await expect(c.querySelectorAll('[data-kind]').length).toBeGreaterThan(0)
    }
  }
}

/** disabled — the whole card at opacity .4 and inert; no other pixel changes. */
export const Disabled: Story = {
  render: () => <AllKinds state="disabled" />,
  play: async ({ canvasElement }) => assertDisabled(canvasElement, LIGHT),
}

export const DisabledInk: Story = {
  render: () => <AllKinds state="disabled" />,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertDisabled(canvasElement, DARK),
}

/**
 * disabled, demonstrated rather than asserted by attribute: the body under the card
 * is a LIVE module view, so `inert` has to remove the whole subtree from the focus
 * order, not merely grey it. Only a real browser can show that — jsdom implements
 * `inert` not at all, so the attribute test it can run would pass just as happily
 * over a `pointer-events-none` that still let Tab walk into a text field.
 */
export const DisabledIsInert: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-4">
      <button data-testid="before">before</button>
      <PondBlock kind="table" heading="calories" headNote="rows only" state="disabled">
        <div className="flex flex-col gap-mn-2">
          <button data-testid="inside">add a row</button>
          <input data-testid="cell" defaultValue="Table saw" />
        </div>
      </PondBlock>
      <button data-testid="after">after</button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const c = canvasElement.querySelector<HTMLElement>('[data-block-kind="table"]')!
    await expect(c.hasAttribute('inert')).toBe(true)

    // Nothing inside can take focus, even asked directly.
    for (const id of ['inside', 'cell']) {
      canvas.getByTestId(id).focus()
      await expect(document.activeElement).not.toBe(canvas.getByTestId(id))
    }

    // And no amount of tabbing walks into it. (`userEvent.tab()` is synthetic and
    // does not know about `inert` — it offers the card's button the focus, the
    // BROWSER refuses it, and that refusal is the thing under test.)
    canvas.getByTestId('before').focus()
    for (let i = 0; i < 3; i++) {
      await userEvent.tab()
      await expect(c.contains(document.activeElement)).toBe(false)
    }
  },
}

// ── empty: the box, the line, the offered action (#239) ─────────────────────────

/** The spy every empty story's action lands on — asserted per kind. */
const onEmptyAction = fn()

async function assertEmpty(canvasElement: HTMLElement, theme: Theme) {
  onEmptyAction.mockClear()
  for (const kind of POND_BLOCK_KINDS) {
    const c = card(canvasElement, kind)
    await expect(c.dataset.blockState).toBe('empty')
    // The card itself is the rest card: paper, shadow, no ring, live.
    await assertRestCard(c, theme)
    // The head keeps the kind's own note — never `loading…`.
    await expect(noteOf(c).textContent).toBe(HEAD[kind][1])
    // Rows, the gallery grid and the big number are all suppressed.
    await expect(c.querySelectorAll('[data-kind]')).toHaveLength(0)
    await expect(c.querySelector('[data-part="skeleton"]')).toBeNull()

    // emptyBox: flex · center · space-between · gap 12 · padding 14 · radius 14 · ink .035
    const box = c.querySelector<HTMLElement>('[data-part="empty"]')!
    await expect(box).toBeTruthy()
    const bs = getComputedStyle(box)
    await expect(bs.display).toBe('flex')
    await expect(bs.alignItems).toBe('center')
    await expect(bs.justifyContent).toBe('space-between')
    await expect(bs.columnGap).toBe('12px')
    await expect(bs.paddingTop).toBe('14px')
    await expect(bs.paddingRight).toBe('14px')
    await expect(bs.paddingBottom).toBe('14px')
    await expect(bs.paddingLeft).toBe('14px')
    await expect(bs.borderTopLeftRadius).toBe('14px')
    await expect(alphaOf(bs.backgroundColor)).toBeCloseTo(0.035, 3)
    await expect(bs.borderTopWidth).toBe('0px')
    // The box spans the content box of the card.
    await expect(parseFloat(bs.width)).toBeCloseTo(contentWidth(c), 0)

    // emptyText: 13.5 / ink .68 / sans inherited / lowercase as authored
    const { line, action } = blockEmptyCopy(kind)
    const [text, button] = Array.from(box.children) as HTMLElement[]
    await expect(text.textContent).toBe(line)
    await expect(text.textContent).toBe(line.toLowerCase())
    const ts = getComputedStyle(text)
    await expect(ts.fontSize).toBe('13.5px')
    await expect(ts.color).toBe(theme.ink68)
    await expect(ts.fontFamily).toContain('PP Neue Montreal')
    await expect(ts.fontFamily).not.toContain('Mono')
    await expect(ts.textTransform).toBe('none')

    // The action: the existing secondary pill at the board's auto × 32.
    await expect(button.tagName).toBe('BUTTON')
    await expect(button.textContent).toBe(action)
    await expect(button.hasAttribute('disabled')).toBe(false)
    await expect(button.getAttribute('aria-disabled')).toBeNull()
    const us = getComputedStyle(button)
    await expect(us.height).toBe('32px')
    await expect(us.paddingLeft).toBe('14px')
    await expect(us.paddingRight).toBe('14px')
    await expect(us.fontWeight).toBe('500')
    await expect(us.fontFamily).toContain('PP Neue Montreal')
    await expect(parseFloat(us.borderTopLeftRadius)).toBeGreaterThanOrEqual(16) // pill
    await expect(us.textTransform).toBe('none')
    // The SECONDARY recipe, not the primary or the ghost: PondControl's ink .07
    // ground (#221). A primary ink pill here would shout the one dated thing on
    // the screen from an empty box — the board gives the offer the quiet weight.
    await expect(alphaOf(us.backgroundColor)).toBeCloseTo(0.07, 2)

    await userEvent.click(button)
    await expect(onEmptyAction).toHaveBeenLastCalledWith(kind)
  }
  await expect(onEmptyAction).toHaveBeenCalledTimes(POND_BLOCK_KINDS.length)
}

/** empty — the board's EL copy per kind in its box, with the offered action wired. */
export const Empty: Story = {
  render: () => <AllKinds state="empty" onEmptyAction={onEmptyAction} />,
  play: async ({ canvasElement }) => assertEmpty(canvasElement, LIGHT),
}

export const EmptyInk: Story = {
  render: () => <AllKinds state="empty" onEmptyAction={onEmptyAction} />,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertEmpty(canvasElement, DARK),
}

/**
 * empty with NO action wired: the line renders alone. A choice is offered or it is
 * not drawn — never a dead or disabled button (PROJECT_RULES: offered, never faked).
 * The product does this for `number`, whose `pick a field` has no engine path yet.
 */
export const EmptyLineOnly: Story = {
  render: () => <AllKinds state="empty" />,
  play: async ({ canvasElement }) => {
    for (const kind of POND_BLOCK_KINDS) {
      const c = card(canvasElement, kind)
      const box = c.querySelector<HTMLElement>('[data-part="empty"]')!
      await expect(box.children).toHaveLength(1)
      await expect(box.textContent).toBe(blockEmptyCopy(kind).line)
      await expect(c.querySelector('button')).toBeNull()
      await expect(c.querySelectorAll('[data-kind]')).toHaveLength(0)
    }
  },
}

/**
 * The empty box's three OTHER callers, in one frame (#239) — the cases where the
 * kind's own line would be FALSE about the data, and the box rendered bare under a
 * surface that is not a block card (the chart card's degenerate case):
 *
 *   1  bare, kind only            — the kind's line, no action (none wired)
 *   2  `line` + kind              — the override reads, the KIND still names the action
 *   3  `line`, no kind, wired     — nothing names an action, so none is drawn
 *   4  the frame's `emptyLine`    — threaded through to the box, and the filtered
 *                                   line offers nothing: clearing a filter is not
 *                                   wired through the frame, and a dead button is
 *                                   never drawn
 */
export const EmptyOverriddenLine: Story = {
  render: () => (
    <div className="flex min-w-[460px] flex-col items-start gap-mn-4">
      <div data-testid="bare">
        <PondBlockEmpty kind="table" />
      </div>
      <div data-testid="override">
        <PondBlockEmpty kind="table" line={POND_BLOCK_FILTERED_EMPTY_LINE} onAction={fn()} />
      </div>
      <div data-testid="no-kind">
        <PondBlockEmpty line="no data yet" onAction={fn()} />
      </div>
      <PondBlock
        kind="table"
        heading="calories"
        headNote="rows only"
        state="empty"
        emptyLine={POND_BLOCK_FILTERED_EMPTY_LINE}
      >
        <p>the live module view</p>
      </PondBlock>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const boxIn = (id: string) =>
      canvas.getByTestId(id).querySelector<HTMLElement>('[data-part="empty"]')!

    // 1 — the kind's own line, alone.
    await expect(boxIn('bare').textContent).toBe('no rows yet')
    await expect(boxIn('bare').children).toHaveLength(1)

    // 2 — the override reads and the kind still names the action it offers.
    const override = Array.from(boxIn('override').children) as HTMLElement[]
    await expect(override[0].textContent).toBe('nothing matches this filter')
    await expect(override[0].textContent).not.toBe('no rows yet')
    await expect(override[1].textContent).toBe('add a row')
    // It is the same box, not a second empty component: the board's 14 / radius 14 /
    // ink .035 ground, whatever named the line.
    const bs = getComputedStyle(boxIn('override'))
    await expect(bs.paddingTop).toBe('14px')
    await expect(bs.borderTopLeftRadius).toBe('14px')
    await expect(alphaOf(bs.backgroundColor)).toBeCloseTo(0.035, 3)

    // 3 — a line with no kind names no action, so a wired callback draws nothing.
    await expect(boxIn('no-kind').textContent).toBe('no data yet')
    await expect(boxIn('no-kind').querySelector('button')).toBeNull()

    // 4 — the frame threads `emptyLine` into the box, and offers nothing with it.
    const c = card(canvasElement, 'table')
    const box = c.querySelector<HTMLElement>('[data-part="empty"]')!
    await expect(box.textContent).toBe('nothing matches this filter')
    await expect(c.textContent).not.toContain('no rows yet')
    await expect(c.querySelector('button')).toBeNull()
    // The head keeps its own note; the live view is suppressed, not stacked above.
    await expect(noteOf(c).textContent).toBe('rows only')
    await expect(c.textContent).not.toContain('the live module view')
  },
}

/**
 * The column can be narrower than the kind (mobile, a dragged-in editor width): the
 * card CLAMPS to it. Written as a story because the failure is silent on a desktop
 * canvas and invisible in jsdom, which has no layout — a 580 gallery in a 320 column
 * would simply overflow its page, which is what `max-w-full` is in the recipe for.
 */
export const NarrowColumn: Story = {
  render: () => (
    <div className="w-[320px] overflow-hidden">
      <PondBlock kind="gallery" heading="recipes" headNote="18 records">
        <Body kind="gallery" state="rest" />
      </PondBlock>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const c = card(canvasElement, 'gallery')
    // The kind wants 580 and the column gives 320 — it takes the column.
    await expect(POND_BLOCK_WIDTHS.gallery).toBe(580)
    await expect(getComputedStyle(c).width).toBe('320px')
    // And nothing inside pushes back out of it.
    await expect(c.scrollWidth).toBeLessThanOrEqual(c.clientWidth)
    // The padding is NOT what gives: the board's 18 survives the clamp.
    await expect(getComputedStyle(c).paddingLeft).toBe('18px')
  },
}

// ── deleted: the tombstone — not a card (#240) ──────────────────────────────────

const onRestore = fn()
const onRemoveBlock = fn()

async function assertDeleted(canvasElement: HTMLElement, theme: Theme) {
  onRestore.mockClear()
  onRemoveBlock.mockClear()
  // The width constant and its literal class agree, pinned once.
  await expect(POND_BLOCK_TOMB_WIDTH).toBe(460)
  await expect(POND_BLOCK_TOMB_NOTE).toBe('database deleted')
  for (const kind of POND_BLOCK_KINDS) {
    const c = card(canvasElement, kind)
    await expect(c.dataset.blockState).toBe('deleted')
    const cs = getComputedStyle(c)

    // W = 460 for every kind — the one state that overrides the kind's width.
    await expect(cs.width).toBe(`${POND_BLOCK_TOMB_WIDTH}px`)
    // The frame's own geometry survives.
    await expect(cs.paddingTop).toBe('16px')
    await expect(cs.paddingLeft).toBe('18px')
    await expect(cs.borderTopLeftRadius).toBe('20px')
    await expect(cs.rowGap).toBe('12px')

    // Not a card: transparent ground, and the box-shadow is exactly ONE layer — a
    // solid 1.4px INSET hairline at ink .2. No card shadow underneath, no border.
    await expect(cs.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    const layers = shadowLayers(cs.boxShadow)
    await expect(layers).toHaveLength(1)
    const ring = layers[0].match(/^(.+?) 0px 0px 0px 1\.4px inset$/)
    await expect(ring).not.toBeNull()
    await expect(alphaOf(ring![1])).toBeCloseTo(0.2, 2)
    for (const layer of theme.shadow) await expect(cs.boxShadow).not.toContain(layer)
    await expect(cs.borderTopWidth).toBe('0px')
    await expect(cs.borderTopStyle).not.toBe('dashed')
    await expect(cs.opacity).toBe('1')
    // No lift: the tombstone is flat, like every other state (the board moves nothing).
    await expect(cs.transform).toBe('none')
    await expect(c.hasAttribute('inert')).toBe(false)
    await expect(c.getAttribute('aria-busy')).toBeNull()

    // The head keeps the kind's heading; only the note is replaced.
    const head = c.firstElementChild as HTMLElement
    const [eyebrow, note] = Array.from(head.children) as HTMLElement[]
    await expect(eyebrow.textContent).toBe(HEAD[kind][0])
    await expect(note.textContent).toBe(POND_BLOCK_TOMB_NOTE)
    const ns = getComputedStyle(note)
    await expect(ns.fontFamily).toContain('PP Neue Montreal Mono')
    await expect(ns.fontSize).toBe('10.5px')
    await expect(ns.color).toBe(theme.ink68)

    // Everything else is suppressed: rows, gallery, big number, skeleton, notice, empty.
    await expect(c.querySelectorAll('[data-kind]')).toHaveLength(0)
    await expect(c.querySelector('[data-part="skeleton"]')).toBeNull()
    await expect(c.querySelector('[data-part="empty"]')).toBeNull()
    await expect(c.children).toHaveLength(2)

    // tomb: column, gap 12 — the second and last child of the card, holding exactly
    // the line and the actions.
    const tomb = c.querySelector<HTMLElement>('[data-part="tomb"]')!
    await expect(tomb).toBe(c.children[1])
    await expect(tomb.children).toHaveLength(2)
    const ts = getComputedStyle(tomb)
    await expect(ts.display).toBe('flex')
    await expect(ts.flexDirection).toBe('column')
    await expect(ts.rowGap).toBe('12px')

    // tombText: mono 11 / 1.55 / ink .8 — the META tier, a step darker than the note.
    const line = tomb.querySelector<HTMLElement>('[data-part="tomb-line"]')!
    await expect(line.textContent).toBe(blockTombLine(HEAD[kind][0]))
    await expect(line.textContent).toBe(
      `This view showed ${HEAD[kind][0]}, which was deleted on 22 sep. It can be restored for 30 days.`
    )
    const ls = getComputedStyle(line)
    await expect(ls.fontFamily).toContain('PP Neue Montreal Mono')
    await expect(ls.fontSize).toBe('11px')
    await expect(parseFloat(ls.lineHeight)).toBeCloseTo(11 * 1.55, 1)
    await expect(ls.color).toBe(theme.ink80)
    await expect(ls.textTransform).toBe('none')

    // tombActions: flex, gap 8; restore (secondary) then remove block (ghost), 32px.
    const actions = tomb.querySelector<HTMLElement>('[data-part="tomb-actions"]')!
    const as = getComputedStyle(actions)
    await expect(as.display).toBe('flex')
    await expect(as.columnGap).toBe('8px')
    const [restore, remove] = Array.from(actions.querySelectorAll('button'))
    await expect(restore.textContent).toBe('restore')
    await expect(remove.textContent).toBe('remove block')
    for (const b of [restore, remove]) {
      await expect(b.hasAttribute('disabled')).toBe(false)
      const bs = getComputedStyle(b)
      await expect(bs.height).toBe('32px')
      await expect(bs.fontWeight).toBe('500')
      await expect(bs.fontFamily).toContain('PP Neue Montreal')
      await expect(parseFloat(bs.borderTopLeftRadius)).toBeGreaterThanOrEqual(16) // pill
    }
    // PondControl's literals (#221): secondary is the ink .07 ground, ghost is
    // transparent with the 1px inset ink .2 hairline and NO ground. The two ways
    // out are not the same weight — restore is the offer, remove is the exit.
    await expect(alphaOf(getComputedStyle(restore).backgroundColor)).toBeCloseTo(0.07, 2)
    await expect(alphaOf(getComputedStyle(remove).backgroundColor)).toBe(0)
    const rs = shadowLayers(getComputedStyle(remove).boxShadow)
    await expect(rs).toHaveLength(1)
    const hair = rs[0].match(/^(.+?) 0px 0px 0px 1px inset$/)
    await expect(hair).not.toBeNull()
    await expect(alphaOf(hair![1])).toBeCloseTo(0.2, 2)

    // Each click reaches its OWN callback and nothing else.
    const removesBefore = onRemoveBlock.mock.calls.length
    await userEvent.click(restore)
    await expect(onRestore).toHaveBeenLastCalledWith(kind)
    await expect(onRemoveBlock.mock.calls.length).toBe(removesBefore)
    const restoresBefore = onRestore.mock.calls.length
    await userEvent.click(remove)
    await expect(onRemoveBlock).toHaveBeenLastCalledWith(kind)
    await expect(onRestore.mock.calls.length).toBe(restoresBefore)
  }
  await expect(onRestore).toHaveBeenCalledTimes(POND_BLOCK_KINDS.length)
  await expect(onRemoveBlock).toHaveBeenCalledTimes(POND_BLOCK_KINDS.length)
}

/** deleted — 460 for every kind, transparent, one solid inset hairline; both ways out wired. */
export const Deleted: Story = {
  render: () => <AllKinds state="deleted" onRestore={onRestore} onRemoveBlock={onRemoveBlock} />,
  play: async ({ canvasElement }) => assertDeleted(canvasElement, LIGHT),
}

export const DeletedInk: Story = {
  render: () => <AllKinds state="deleted" onRestore={onRestore} onRemoveBlock={onRemoveBlock} />,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertDeleted(canvasElement, DARK),
}

/**
 * The tombstone's facts come from the HOST (#199), not from the heading: 7a's stone
 * names the DATABASE the view showed — `kitchen costs` — while the eyebrow stays the
 * view's own name, and the date and window are the real ones once `deleted_at`
 * exists. Two inputs, as the board has them; the fixtures are only the defaults.
 *
 * Past the window there is nothing to restore, so `restore` is not wired — and an
 * action that is not wired is not drawn, never a dead button. (7a also shortens the
 * copy there and drops the "can be restored" promise; `blockTombLine` always emits
 * it, so that variant is unbuilt and is #199's — nothing can compute "past the
 * window" without `deleted_at`.)
 */
export const DeletedNamed: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-4">
      <div data-testid="named">
        <PondBlock
          kind="table"
          heading="table"
          headNote="rows only"
          state="deleted"
          deletedName="kitchen costs"
          deletedOn="24 sep"
          restoreWindow="29 days"
          onRestore={fn()}
          onRemoveBlock={fn()}
        >
          <p>the view</p>
        </PondBlock>
      </div>
      <div data-testid="past-window">
        <PondBlock
          kind="list"
          heading="notifications"
          headNote="3"
          state="deleted"
          onRemoveBlock={fn()}
        >
          <p>the view</p>
        </PondBlock>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const named = canvas.getByTestId('named').querySelector<HTMLElement>('[data-block-kind]')!
    const line = named.querySelector<HTMLElement>('[data-part="tomb-line"]')!
    await expect(line.textContent).toBe(
      'This view showed kitchen costs, which was deleted on 24 sep. It can be restored for 29 days.'
    )
    await expect(line.textContent).toBe(blockTombLine('kitchen costs', '24 sep', '29 days'))
    // The eyebrow is still the view's own heading — the stone names the database.
    await expect((named.firstElementChild as HTMLElement).children[0].textContent).toBe('table')
    await expect(line.textContent).not.toContain('22 sep')

    // Past the window: `remove block` is the only action, and it is the ghost.
    const past = canvas.getByTestId('past-window').querySelector<HTMLElement>('[data-block-kind]')!
    const buttons = Array.from(past.querySelectorAll('button'))
    await expect(buttons.map((b) => b.textContent)).toEqual(['remove block'])
    await expect(buttons[0].hasAttribute('disabled')).toBe(false)
    await expect(alphaOf(getComputedStyle(buttons[0]).backgroundColor)).toBe(0)
    // And the line still reads — the stone is not an empty frame with a button.
    await expect(past.querySelector('[data-part="tomb-line"]')!.textContent).toBe(
      blockTombLine('notifications')
    )
  },
}

/**
 * A real module view under the frame: the table's `title` is the eyebrow, and the
 * view's own caption (kept for bare hosts — diff cards, previews) hides under the
 * card so the name reads once. The cells stay the engine's.
 */
export const WithTableView: Story = {
  render: () => (
    <PondBlock kind="table" heading="Power Tools" headNote="2 rows">
      <TableView
        data={{
          id: 't',
          type: 'table',
          title: 'Power Tools',
          columns: ['Tool', 'Location'],
          rows: [
            { id: 'r1', cells: ['Table saw', 'Centre of shop'] },
            { id: 'r2', cells: ['Bandsaw', 'Left wall'] },
          ],
        }}
      />
    </PondBlock>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const titles = canvas.getAllByText('Power Tools')
    await expect(titles).toHaveLength(2)
    await expect(getComputedStyle(titles[0]).textTransform).toBe('uppercase')
    await expect(getComputedStyle(titles[1]).display).toBe('none')
    await expect(canvas.getByText('Bandsaw')).toBeVisible()
    const c = canvasElement.querySelector<HTMLElement>('[data-block-kind="table"]')!
    // ADR 0008: the card fills its container, not the board's old 500px.
    const p = c.parentElement!
    const pcs = getComputedStyle(p)
    const avail = p.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight)
    await expect(c.getBoundingClientRect().width).toBeCloseTo(avail, 0)
    // No `state` passed: the frame defaults to rest and stamps it on the card, so a
    // host that knows nothing about states still gets the board's resting card.
    await expect(c.dataset.blockState).toBe('rest')
  },
}
