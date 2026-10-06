import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent } from 'storybook/test'

import { ChartCard, CHART_SKELETON, CHART_TYPE_TAG, type ChartCardState } from './card'
import { CHART_KINDS, type ChartKind } from '@/lib/modules/view/aggregate'

/**
 * PondChart (#227) — the play functions assert the COMPUTED values against the
 * numbers in `wayfinder/board-values.generated.json` (`.components.PondChart`,
 * the board's own `renderVals()`), every state, both themes:
 *
 *   card     width 350 · padding 16px 16px 14px · radius 20 · gap 12 · card · --mn-shadow-card
 *   headRow  flex · baseline · space-between · gap 10
 *   title    15 / 500 / full ink · sans     typeTag  MONO 10.5 / ink .8 / nowrap
 *   sub      12.5 / ink .68 / margin-top -6
 *   plotBox  relative · padding 6px 0 2px · min-height 150 · overflow visible
 *   foot     column gap 4 · padding-top 10 · 1px ink .055 · 11px · label 38 / ink .68 ·
 *            value ink .8 · mono 10.5 / ink .8
 *
 *   hover    `0 2px 4px .06, 0 14px 32px .1` (ink: .34 / .4) + translateY(-1px) + the tip
 *            (absolute 2 / 34 · column gap 3 · padding 8 11 · radius 14 · glass · mono 11)
 *   selected `0 0 0 2px ink, cardShadow` — ring first, both painting
 *   empty    emptyBox column · flex-start · center · gap 12 · 150 · 0 14 · radius 14 ·
 *            ink .035 — 13.5 / ink .68 — `no rows in {source} yet` + `add a row` at 32
 *   loading  four bars 70%×10 · 100%×90 · 85%×10 · 60%×10 · radius 6 · ink .08 · gap 12 · top 10
 *   error    the plot at opacity .45; the notice with `can’t reach {source} · showing the last copy`
 *   disabled opacity .4 · inert · no other pixel changes
 *
 * The plots are fixtures (a flat SVG): this is the card's chrome, not Bklit.
 */

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

const meta = {
  title: 'Organisms/2d · charts',
  component: ChartCard,
  parameters: { layout: 'padded' },
  args: { kind: 'line', children: null },
} satisfies Meta<typeof ChartCard>

export default meta
type Story = StoryObj<typeof meta>

/** The board's fixture head, foot and tip per kind (the cache's per-kind deltas). */
interface Fixture {
  source: string
  title: string
  sub: string
  on: string
  reads: string
  tip: [string, string]
}
const FIXTURE: Record<ChartKind, Fixture> = {
  line: {
    source: 'weigh-ins',
    title: 'weight',
    sub: '12 weeks, weekly average',
    on: 'life › health › weight',
    reads: 'weigh-ins · date, kg',
    tip: ['12 sep', '80.4 kg'],
  },
  area: {
    source: 'entries',
    title: 'calories',
    sub: 'against a target band',
    on: 'life › health › calories',
    reads: 'entries · date, kcal',
    tip: ['19 sep', '2,560 kcal'],
  },
  bar: {
    source: 'services',
    title: 'subscriptions',
    sub: 'monthly cost, largest first',
    on: 'life › budget › subscriptions',
    reads: 'services · name, £/mo',
    tip: ['adobe', '£56.98 / mo'],
  },
  composed: {
    source: 'costs',
    title: 'kitchen spend',
    sub: 'spend, running total, budget',
    on: 'life › kitchen renovation',
    reads: 'costs · month, £',
    tip: ['aug', '£3,120 spent'],
  },
  net: {
    source: 'transactions',
    title: 'net',
    sub: 'in minus out, by month',
    on: 'life › budget',
    reads: 'transactions · date, £',
    tip: ['jul', '−£240'],
  },
  heatmap: {
    source: 'sessions',
    title: 'workouts',
    sub: '26 weeks, one cell a day',
    on: 'life › health › workouts',
    reads: 'sessions · date, minutes',
    tip: ['18 sep', '45 min'],
  },
  ring: {
    source: 'transactions',
    title: 'budget share',
    sub: 'where this month went',
    on: 'life › budget',
    reads: 'transactions · category, £',
    tip: ['food', '£420'],
  },
  gauge: {
    source: 'nested pages',
    title: 'reading goal',
    sub: 'one figure against a target',
    on: 'life › books',
    reads: 'nested pages · status',
    tip: ['read', '14 of 24'],
  },
  radar: {
    source: 'sessions',
    title: 'balance',
    sub: 'sets by group, last 4 weeks',
    on: 'life › health › workouts',
    reads: 'sessions · group, sets',
    tip: ['legs', '22 sets'],
  },
  scatter: {
    source: 'nights',
    title: 'sleep vs energy',
    sub: 'each dot a night',
    on: 'life › health › sleep',
    reads: 'nights · hours, energy',
    tip: ['16 sep', '5.9 h · energy 2'],
  },
  sankey: {
    source: 'transactions',
    title: 'money flow',
    sub: 'income to where it went',
    on: 'life › budget',
    reads: 'transactions · category, £',
    tip: ['rent', '£1,150'],
  },
  sunburst: {
    source: 'journal',
    title: 'time by page',
    sub: 'pages, then their nested pages',
    on: 'life',
    reads: 'journal · page ref, minutes',
    tip: ['work', '46%'],
  },
  funnel: {
    source: 'nested pages',
    title: 'recipes',
    sub: 'saved to on rotation',
    on: 'life › recipes',
    reads: 'nested pages · cooked log',
    tip: ['cooked twice', '9'],
  },
}

/** A flat fixture plot at the board's 150 — the chrome is under test, not Bklit. */
function Plot() {
  return (
    <svg data-part="fixture-plot" width="100%" height="150" aria-hidden>
      <rect x="0" y="40" width="100%" height="110" rx="4" fill="currentColor" opacity="0.08" />
      <polyline
        points="0,120 60,90 120,100 180,60 240,70 300,30"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  )
}

/** The spy every empty story's action lands on. */
const onEmptyAction = fn()

function AllKinds({ state = 'rest' }: { state?: ChartCardState }) {
  return (
    <div className="flex flex-col items-start gap-mn-4">
      {CHART_KINDS.map((kind) => {
        const f = FIXTURE[kind]
        return (
          <ChartCard
            key={kind}
            kind={kind}
            state={state}
            title={f.title}
            sub={f.sub}
            on={f.on}
            reads={f.reads}
            source={f.source}
            tip={state === 'hover' ? { a: f.tip[0], b: f.tip[1] } : undefined}
            onEmptyAction={state === 'empty' ? () => onEmptyAction(kind) : undefined}
          >
            <Plot />
          </ChartCard>
        )
      })}
    </div>
  )
}

// ── Palettes — the cache's paper and ink literals ────────────────────────────────

const LIGHT = {
  card: 'rgb(250, 249, 239)',
  ink: 'rgb(27, 29, 20)',
  ink68: 'rgba(27, 29, 20, 0.68)',
  ink80: 'rgba(27, 29, 20, 0.8)',
  shadow: ['rgba(40, 34, 24, 0.04) 0px 1px 2px 0px', 'rgba(40, 34, 24, 0.06) 0px 8px 24px 0px'],
  hoverShadow: [
    'rgba(40, 34, 24, 0.06) 0px 2px 4px 0px',
    'rgba(40, 34, 24, 0.1) 0px 14px 32px 0px',
  ],
  tipBackground: 'linear-gradient(160deg, rgba(255, 255, 255, 0.86), rgba(255, 255, 255, 0.64))',
  tipBorder: 'rgba(255, 255, 255, 0.9)',
  tipShadow: 'rgba(40, 34, 24, 0.12) 0px 8px 24px 0px',
}
const DARK = {
  card: 'rgb(48, 49, 42)',
  ink: 'rgb(250, 249, 239)',
  ink68: 'rgba(250, 249, 239, 0.68)',
  ink80: 'rgba(250, 249, 239, 0.8)',
  shadow: ['rgba(0, 0, 0, 0.3) 0px 1px 2px 0px', 'rgba(0, 0, 0, 0.34) 0px 8px 24px 0px'],
  hoverShadow: ['rgba(0, 0, 0, 0.34) 0px 2px 4px 0px', 'rgba(0, 0, 0, 0.4) 0px 14px 32px 0px'],
  tipBackground: 'linear-gradient(160deg, rgba(74, 73, 64, 0.95), rgba(74, 73, 64, 0.82))',
  tipBorder: 'rgba(250, 249, 239, 0.09)',
  tipShadow: 'rgba(0, 0, 0, 0.4) 0px 8px 24px 0px',
}
type Theme = typeof LIGHT

/** The alpha of a computed colour — `rgba(…, a)`, `color(srgb … / a)` or `oklab(… / a)`. */
function alphaOf(color: string): number {
  if (/^rgb\(/.test(color) && !color.includes('/')) return 1
  if (color === 'rgba(0, 0, 0, 0)') return 0
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

const card = (root: HTMLElement, kind: ChartKind) =>
  root.querySelector<HTMLElement>(`[data-chart-kind="${kind}"]`)!
const part = (c: HTMLElement, name: string) =>
  c.querySelector<HTMLElement>(`[data-part="${name}"]`)!

/** The rest card: paper + the two-layer card shadow, no ring, no lift — and live. */
async function assertRestCard(c: HTMLElement, theme: Theme) {
  const cs = getComputedStyle(c)
  await expect(cs.backgroundColor).toBe(theme.card)
  await expect(shadowLayers(cs.boxShadow)).toEqual(theme.shadow)
  await expect(cs.transform).toBe('none')
  await expect(cs.opacity).toBe('1')
  await expect(c.hasAttribute('inert')).toBe(false)
}

/** Every card measures to the board's chrome: geometry, head, sub, plot box, foot. */
async function assertChrome(canvasElement: HTMLElement, theme: Theme) {
  for (const kind of CHART_KINDS) {
    const c = card(canvasElement, kind)
    await expect(c).toBeTruthy()
    const f = FIXTURE[kind]
    const cs = getComputedStyle(c)
    await expect(cs.width).toBe('350px')
    await expect(cs.boxSizing).toBe('border-box')
    await expect(cs.paddingTop).toBe('16px')
    await expect(cs.paddingRight).toBe('16px')
    await expect(cs.paddingBottom).toBe('14px')
    await expect(cs.paddingLeft).toBe('16px')
    await expect(cs.borderTopLeftRadius).toBe('20px')
    await expect(cs.display).toBe('flex')
    await expect(cs.flexDirection).toBe('column')
    await expect(cs.rowGap).toBe('12px')
    await expect(cs.position).toBe('relative')
    await expect(cs.color).toBe(theme.ink)
    await expect(cs.fontFamily).toContain('PP Neue Montreal')
    await expect(cs.fontFamily).not.toContain('Mono')
    await expect(cs.borderTopWidth).toBe('0px')

    const head = part(c, 'head')
    const hs = getComputedStyle(head)
    await expect(hs.display).toBe('flex')
    await expect(hs.alignItems).toBe('baseline')
    await expect(hs.justifyContent).toBe('space-between')
    await expect(hs.columnGap).toBe('10px')

    const title = part(c, 'title')
    const ts = getComputedStyle(title)
    await expect(title.textContent).toBe(f.title)
    await expect(ts.fontSize).toBe('15px')
    await expect(ts.fontWeight).toBe('500')
    await expect(ts.color).toBe(theme.ink)
    await expect(ts.textTransform).toBe('none')
    await expect(ts.fontFamily).not.toContain('Mono')

    const tag = part(c, 'type')
    const gs = getComputedStyle(tag)
    await expect(tag.textContent).toBe(CHART_TYPE_TAG[kind])
    await expect(gs.fontFamily).toContain('PP Neue Montreal Mono')
    await expect(gs.fontSize).toBe('10.5px')
    await expect(gs.color).toBe(theme.ink80)
    await expect(gs.whiteSpace).toBe('nowrap')

    const sub = part(c, 'sub')
    const ss = getComputedStyle(sub)
    await expect(sub.textContent).toBe(f.sub)
    await expect(ss.fontSize).toBe('12.5px')
    await expect(ss.color).toBe(theme.ink68)
    await expect(ss.marginTop).toBe('-6px')

    const plot = part(c, 'plot')
    const ps = getComputedStyle(plot)
    await expect(ps.position).toBe('relative')
    await expect(ps.paddingTop).toBe('6px')
    await expect(ps.paddingBottom).toBe('2px')
    await expect(ps.paddingLeft).toBe('0px')
    await expect(ps.minHeight).toBe('150px')
    await expect(ps.overflow).toBe('visible')

    const foot = part(c, 'foot')
    const fs = getComputedStyle(foot)
    await expect(fs.display).toBe('flex')
    await expect(fs.flexDirection).toBe('column')
    await expect(fs.rowGap).toBe('4px')
    await expect(fs.paddingTop).toBe('10px')
    await expect(fs.fontSize).toBe('11px')
    await expect(fs.borderTopWidth).toBe('1px')
    await expect(fs.borderTopStyle).toBe('solid')
    await expect(alphaOf(fs.borderTopColor)).toBeCloseTo(0.055, 3)

    for (const [name, value, mono] of [
      ['on', f.on, false],
      ['reads', f.reads, true],
    ] as const) {
      const row = part(c, name)
      const rs = getComputedStyle(row)
      await expect(rs.display).toBe('flex')
      await expect(rs.columnGap).toBe('10px')
      const [label, val] = Array.from(row.children) as HTMLElement[]
      const ls = getComputedStyle(label)
      await expect(label.textContent).toBe(name)
      await expect(ls.width).toBe('38px')
      await expect(ls.color).toBe(theme.ink68)
      const vs = getComputedStyle(val)
      await expect(val.textContent).toBe(value)
      await expect(vs.color).toBe(theme.ink80)
      if (mono) {
        await expect(vs.fontFamily).toContain('PP Neue Montreal Mono')
        await expect(vs.fontSize).toBe('10.5px')
      } else {
        await expect(vs.fontFamily).not.toContain('Mono')
        await expect(vs.fontSize).toBe('11px')
      }
    }
  }
}

async function assertRest(canvasElement: HTMLElement, theme: Theme) {
  await assertChrome(canvasElement, theme)
  for (const kind of CHART_KINDS) {
    const c = card(canvasElement, kind)
    await expect(c.dataset.chartState).toBe('rest')
    await assertRestCard(c, theme)
    await expect(c.querySelector('[data-part="fixture-plot"]')).not.toBeNull()
    await expect(c.querySelector('[data-part="tip"]')).toBeNull()
    await expect(c.querySelector('[data-part="skeleton"]')).toBeNull()
    await expect(c.querySelector('[data-part="empty"]')).toBeNull()
    await expect(c.querySelector('[data-kind="notice"]')).toBeNull()
  }
}

/** All thirteen kinds on paper, measured against the board. */
export const Kinds: Story = {
  render: () => <AllKinds />,
  play: async ({ canvasElement }) => assertRest(canvasElement, LIGHT),
}

/** The same thirteen on ink: card #30312A, the heavier dark shadow, the tiers flip to paper. */
export const KindsInk: Story = {
  render: () => <AllKinds />,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertRest(canvasElement, DARK),
}

// ── hover: the lift, the shadow swap, the tip ────────────────────────────────────

async function assertHover(canvasElement: HTMLElement, theme: Theme) {
  await assertChrome(canvasElement, theme)
  for (const kind of CHART_KINDS) {
    const c = card(canvasElement, kind)
    const cs = getComputedStyle(c)
    await expect(c.dataset.chartState).toBe('hover')
    await expect(shadowLayers(cs.boxShadow)).toEqual(theme.hoverShadow)
    await expect(cs.transform).toBe('matrix(1, 0, 0, 1, 0, -1)')
    await expect(cs.backgroundColor).toBe(theme.card)
    await expect(cs.opacity).toBe('1')

    const tip = part(c, 'tip')
    const ts = getComputedStyle(tip)
    await expect(tip.parentElement).toBe(part(c, 'plot'))
    await expect(ts.position).toBe('absolute')
    await expect(ts.top).toBe('2px')
    await expect(ts.right).toBe('34px')
    await expect(ts.display).toBe('flex')
    await expect(ts.flexDirection).toBe('column')
    await expect(ts.rowGap).toBe('3px')
    await expect(ts.paddingTop).toBe('8px')
    await expect(ts.paddingLeft).toBe('11px')
    await expect(ts.borderTopLeftRadius).toBe('14px')
    await expect(ts.backgroundImage).toBe(theme.tipBackground)
    await expect(ts.borderTopWidth).toBe('1px')
    await expect(ts.borderTopColor).toBe(theme.tipBorder)
    await expect(shadowLayers(ts.boxShadow)).toEqual([theme.tipShadow])
    await expect(ts.fontFamily).toContain('PP Neue Montreal Mono')
    await expect(ts.fontSize).toBe('11px')
    await expect(ts.color).toBe(theme.ink)
    await expect(ts.pointerEvents).toBe('none')
    const [a, b] = Array.from(tip.children) as HTMLElement[]
    await expect(a.textContent).toBe(FIXTURE[kind].tip[0])
    await expect(getComputedStyle(a).color).toBe(theme.ink68)
    await expect(b.textContent).toBe(FIXTURE[kind].tip[1])
    await expect(getComputedStyle(b).color).toBe(theme.ink)
  }
}

/** hover — THIS card's own lift and shadow swap, and the glass tip at 2 / 34. */
export const Hover: Story = {
  render: () => <AllKinds state="hover" />,
  play: async ({ canvasElement }) => assertHover(canvasElement, LIGHT),
}

export const HoverInk: Story = {
  render: () => <AllKinds state="hover" />,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertHover(canvasElement, DARK),
}

// ── selected: 0 0 0 2px ink, cardShadow — consumed from PondBlock ───────────────

async function assertSelected(canvasElement: HTMLElement, theme: Theme) {
  await assertChrome(canvasElement, theme)
  for (const kind of CHART_KINDS) {
    const c = card(canvasElement, kind)
    const cs = getComputedStyle(c)
    const layers = shadowLayers(cs.boxShadow)
    await expect(layers).toHaveLength(3)
    await expect(layers[0]).toBe(`${theme.ink} 0px 0px 0px 2px`)
    await expect(layers[1]).toBe(theme.shadow[0])
    await expect(layers[2]).toBe(theme.shadow[1])
    await expect(cs.transform).toBe('none')
    await expect(cs.opacity).toBe('1')
  }
}

export const Selected: Story = {
  render: () => <AllKinds state="selected" />,
  play: async ({ canvasElement }) => assertSelected(canvasElement, LIGHT),
}

export const SelectedInk: Story = {
  render: () => <AllKinds state="selected" />,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertSelected(canvasElement, DARK),
}

// ── empty: the box, the line, the one action ────────────────────────────────────

async function assertEmpty(canvasElement: HTMLElement, theme: Theme) {
  onEmptyAction.mockClear()
  await assertChrome(canvasElement, theme)
  for (const kind of CHART_KINDS) {
    const c = card(canvasElement, kind)
    await assertRestCard(c, theme)
    await expect(c.querySelector('[data-part="fixture-plot"]')).toBeNull()
    const box = part(c, 'empty')
    await expect(box.parentElement).toBe(part(c, 'plot'))
    const bs = getComputedStyle(box)
    await expect(bs.display).toBe('flex')
    await expect(bs.flexDirection).toBe('column')
    await expect(bs.alignItems).toBe('flex-start')
    await expect(bs.justifyContent).toBe('center')
    await expect(bs.rowGap).toBe('12px')
    await expect(bs.height).toBe('150px')
    await expect(bs.boxSizing).toBe('border-box')
    await expect(bs.paddingTop).toBe('0px')
    await expect(bs.paddingLeft).toBe('14px')
    await expect(bs.paddingRight).toBe('14px')
    await expect(bs.borderTopLeftRadius).toBe('14px')
    await expect(alphaOf(bs.backgroundColor)).toBeCloseTo(0.035, 3)

    const [text, button] = Array.from(box.children) as HTMLElement[]
    const ts = getComputedStyle(text)
    await expect(text.textContent).toBe(`no rows in ${FIXTURE[kind].source} yet`)
    await expect(ts.fontSize).toBe('13.5px')
    await expect(ts.color).toBe(theme.ink68)
    await expect(ts.fontFamily).not.toContain('Mono')

    await expect(button.tagName).toBe('BUTTON')
    await expect(button.textContent).toBe('add a row')
    await expect(getComputedStyle(button).height).toBe('32px')
    await userEvent.click(button)
    await expect(onEmptyAction).toHaveBeenLastCalledWith(kind)
  }
  await expect(onEmptyAction).toHaveBeenCalledTimes(CHART_KINDS.length)
}

export const Empty: Story = {
  render: () => <AllKinds state="empty" />,
  play: async ({ canvasElement }) => assertEmpty(canvasElement, LIGHT),
}

export const EmptyInk: Story = {
  render: () => <AllKinds state="empty" />,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertEmpty(canvasElement, DARK),
}

// ── loading: the four-bar skeleton ──────────────────────────────────────────────

const BAR_PCT: Record<string, number> = {
  'w-[70%]': 70,
  'w-full': 100,
  'w-[85%]': 85,
  'w-[60%]': 60,
}
const BAR_PX: Record<string, number> = { 'h-[10px]': 10, 'h-[90px]': 90 }

async function assertLoading(canvasElement: HTMLElement, theme: Theme) {
  await assertChrome(canvasElement, theme)
  for (const kind of CHART_KINDS) {
    const c = card(canvasElement, kind)
    await assertRestCard(c, theme)
    await expect(c.getAttribute('aria-busy')).toBe('true')
    await expect(c.querySelector('[data-part="fixture-plot"]')).toBeNull()

    const stack = part(c, 'skeleton')
    await expect(stack.parentElement).toBe(part(c, 'plot'))
    const ss = getComputedStyle(stack)
    await expect(ss.display).toBe('flex')
    await expect(ss.flexDirection).toBe('column')
    await expect(ss.rowGap).toBe('12px')
    await expect(ss.paddingTop).toBe('10px')

    const bars = Array.from(stack.children) as HTMLElement[]
    await expect(bars).toHaveLength(CHART_SKELETON.length)
    const inner = stack.clientWidth
    for (let i = 0; i < bars.length; i++) {
      const bs = getComputedStyle(bars[i])
      const [w, h] = CHART_SKELETON[i]
      await expect(bs.display).toBe('block')
      await expect(bs.height).toBe(`${BAR_PX[h]}px`)
      await expect(parseFloat(bs.width)).toBeCloseTo((inner * BAR_PCT[w]) / 100, 0)
      await expect(bs.borderTopLeftRadius).toBe('6px')
      await expect(alphaOf(bs.backgroundColor)).toBeCloseTo(0.08, 2)
      // Static: no sweep, pulse or shimmer.
      await expect(bs.animationName).toBe('none')
      await expect(bs.backgroundImage).toBe('none')
    }
  }
}

export const Loading: Story = {
  render: () => <AllKinds state="loading" />,
  play: async ({ canvasElement }) => assertLoading(canvasElement, LIGHT),
}

export const LoadingInk: Story = {
  render: () => <AllKinds state="loading" />,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertLoading(canvasElement, DARK),
}

// ── error: the last copy, faded, under the notice ───────────────────────────────

async function assertError(canvasElement: HTMLElement, theme: Theme) {
  await assertChrome(canvasElement, theme)
  for (const kind of CHART_KINDS) {
    const c = card(canvasElement, kind)
    await assertRestCard(c, theme)
    const plot = c.querySelector<HTMLElement>('[data-part="fixture-plot"]')!
    await expect(plot).not.toBeNull()
    await expect(getComputedStyle(plot.parentElement!).opacity).toBe('0.45')

    const notices = c.querySelectorAll<HTMLElement>('[data-kind="notice"]')
    await expect(notices).toHaveLength(1)
    const notice = notices[0]
    // Between the plot box and the foot, as the board places it.
    await expect(notice.previousElementSibling).toBe(part(c, 'plot'))
    await expect(notice.nextElementSibling).toBe(part(c, 'foot'))
    const title = notice.querySelector<HTMLElement>('[data-part="title"]')!
    await expect(title.textContent).toBe(
      `can’t reach ${FIXTURE[kind].source} · showing the last copy`
    )
    await expect(notice.querySelector('[data-part="action"]')!.textContent).toBe('reconnect')
    const ts = getComputedStyle(title)
    await expect(ts.fontFamily).toContain('PP Neue Montreal Mono')
    await expect(ts.fontSize).toBe('11px')
    // The board's notice is 440 wide; it never overflows the 318 content box.
    await expect(parseFloat(getComputedStyle(notice).width)).toBeCloseTo(318, 0)
  }
}

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
  await assertChrome(canvasElement, theme)
  for (const kind of CHART_KINDS) {
    const c = card(canvasElement, kind)
    const cs = getComputedStyle(c)
    await expect(cs.opacity).toBe('0.4')
    // No pixel but the opacity changes: same paper, same shadow, no ring, no lift.
    await expect(cs.backgroundColor).toBe(theme.card)
    await expect(shadowLayers(cs.boxShadow)).toEqual(theme.shadow)
    await expect(cs.transform).toBe('none')
    await expect(c.hasAttribute('inert')).toBe(true)
    await expect(c.getAttribute('aria-disabled')).toBeNull()
  }
}

export const Disabled: Story = {
  render: () => <AllKinds state="disabled" />,
  play: async ({ canvasElement }) => assertDisabled(canvasElement, LIGHT),
}

export const DisabledInk: Story = {
  render: () => <AllKinds state="disabled" />,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertDisabled(canvasElement, DARK),
}

// ── What the card OMITS: no slot is ever filled with an invention ───────────────

/**
 * Every head and foot slot is optional, and an absent source leaves the slot EMPTY
 * rather than inventing a string (`CollectionChart` has no true `sub` today, and a
 * chart off a page host has no `on`). Four probes, one story: the matrix cell that
 * matters is "absent", not which kind it is absent on.
 */
export const OmittedSlots: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-4">
      <span data-probe="tag-only">
        <ChartCard kind="ring">
          <Plot />
        </ChartCard>
      </span>
      <span data-probe="reads-only">
        <ChartCard kind="line" title="weight" reads="weigh-ins">
          <Plot />
        </ChartCard>
      </span>
      <span data-probe="on-only">
        <ChartCard kind="line" title="weight" on="life › health › weight">
          <Plot />
        </ChartCard>
      </span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const probe = (name: string) =>
      canvasElement.querySelector<HTMLElement>(`[data-probe="${name}"] [data-chart-kind]`)!
    const slot = (name: string, slotName: string) =>
      probe(name).querySelector<HTMLElement>(`[data-part="${slotName}"]`)

    // No title and no sub: the head keeps the tag alone, and no foot is drawn.
    const tagOnly = probe('tag-only')
    await expect(slot('tag-only', 'title')).toBeNull()
    await expect(slot('tag-only', 'sub')).toBeNull()
    await expect(slot('tag-only', 'type')!.textContent).toBe(CHART_TYPE_TAG.ring)
    await expect(slot('tag-only', 'foot')).toBeNull()
    // The tag does not slide into the title's place: the head still ends flush right.
    const head = slot('tag-only', 'head')!
    await expect(
      head.getBoundingClientRect().right - slot('tag-only', 'type')!.getBoundingClientRect().right
    ).toBeCloseTo(0, 0)
    await expect(tagOnly.querySelector('[data-part="fixture-plot"]')).not.toBeNull()

    // One foot row only: the other is absent, not blank.
    await expect(slot('reads-only', 'foot')).not.toBeNull()
    await expect(slot('reads-only', 'on')).toBeNull()
    await expect(slot('reads-only', 'reads')!.textContent).toBe('readsweigh-ins')
    await expect(slot('on-only', 'reads')).toBeNull()
    await expect(slot('on-only', 'on')!.textContent).toBe('onlife › health › weight')
  },
}
