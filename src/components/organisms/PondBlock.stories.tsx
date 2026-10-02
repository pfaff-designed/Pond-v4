import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import {
  PondBlock,
  POND_BLOCK_KINDS,
  POND_BLOCK_WIDTHS,
  POND_BLOCK_HOVER_ROW,
  POND_BLOCK_SKELETON,
  POND_BLOCK_ROW_GAP,
  BLOCK_LOADING_NOTE,
  blockEmptyCopy,
  blockErrorLine,
  blockRowState,
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
 */

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

const meta = {
  title: 'Organisms/PondBlock',
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
}: {
  state?: PondBlockState
  onEmptyAction?: (kind: PondBlockKind) => void
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
  shadow: ['rgba(40, 34, 24, 0.04) 0px 1px 2px', 'rgba(40, 34, 24, 0.06) 0px 8px 24px'],
}
const DARK = {
  card: 'rgb(48, 49, 42)',
  ink: 'rgb(250, 249, 239)',
  ink68: 'rgba(250, 249, 239, 0.68)',
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

/** The rest card: paper + the two-layer card shadow and nothing more — and live. */
async function assertRestCard(c: HTMLElement, theme: Theme) {
  const cs = getComputedStyle(c)
  await expect(cs.backgroundColor).toBe(theme.card)
  for (const layer of theme.shadow) await expect(cs.boxShadow).toContain(layer)
  await expect(cs.boxShadow).not.toContain('0px 0px 0px 2px')
  await expect(cs.transform).toBe('none')
  await expect(cs.opacity).toBe('1')
  await expect(c.hasAttribute('inert')).toBe(false)
}

/** Every card on the canvas measures to the board, in the given theme. */
async function assertFrames(canvasElement: HTMLElement, theme: Theme) {
  for (const kind of POND_BLOCK_KINDS) {
    const c = card(canvasElement, kind)
    await expect(c).toBeTruthy()
    const cs = getComputedStyle(c)
    // Geometry — the inline `style` numbers off the board.
    await expect(cs.width).toBe(`${POND_BLOCK_WIDTHS[kind]}px`)
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

    // The head row: eyebrow + headNote on one baseline row, 12 apart.
    const head = c.firstElementChild as HTMLElement
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

/** All seven kinds on paper, measured against the board. */
export const Kinds: Story = {
  render: () => <AllKinds />,
  play: async ({ canvasElement }) => assertFrames(canvasElement, LIGHT),
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
    // (The button's 14px `text-sm` vs the board's 12 is #221's — not asserted here.)

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
    await expect(getComputedStyle(c).width).toBe('500px')
  },
}
