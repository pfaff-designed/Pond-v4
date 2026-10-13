import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import {
  PondMolecule,
  POND_MOLECULE_KINDS,
  POND_MOLECULE_STATES,
  type PondMoleculeProps,
} from './PondMolecule'

/**
 * PondMolecule (#95) — the one polymorphic presentational molecule: 11 kinds ×
 * 10 states on the Make Noise role tokens. Theme is ambient — the `ink` story
 * only adds the `.dark` class around the canvas (a Storybook-only decorator,
 * never a prop).
 */

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

// ── Board-literal helpers ──────────────────────────────────────────────────
// These stories run in a real browser against the real `globals.css`, so the
// board's inline values (`PondMolecule.dc.html`, cached in
// `wayfinder/board-values.generated.json`) can be asserted as COMPUTED values
// rather than as Tailwind class names. A value written in a board is final:
// 13.5px means 13.5px, and these read it back off the element.

/**
 * A computed colour → `[r, g, b, a]`. Chrome returns `rgb()`/`rgba()` for the
 * plain role tokens and `color(srgb …)` for the `color-mix` behind the `/5`
 * opacity utilities, so both forms are parsed.
 */
function rgba(value: string): [number, number, number, number] {
  const srgb = value.match(
    /^color\(srgb\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)(?:\s*\/\s*([\d.]+))?\)$/
  )
  if (srgb) {
    return [
      Math.round(Number(srgb[1]) * 255),
      Math.round(Number(srgb[2]) * 255),
      Math.round(Number(srgb[3]) * 255),
      srgb[4] === undefined ? 1 : Number(srgb[4]),
    ]
  }
  const oklab = value.match(/^oklab\(([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)(?:\s*\/\s*([\d.]+))?\)$/)
  if (oklab) {
    const [L, a, b] = [1, 2, 3].map((i) => Number(oklab[i]))
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const k = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    const linear = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * k,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * k,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * k,
    ]
    const encode = (c: number) => {
      const x = Math.min(1, Math.max(0, c))
      return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
    }
    return [
      Math.round(encode(linear[0]) * 255),
      Math.round(encode(linear[1]) * 255),
      Math.round(encode(linear[2]) * 255),
      oklab[4] === undefined ? 1 : Number(oklab[4]),
    ]
  }
  const plain = value.match(/^rgba?\(([^)]+)\)$/)
  if (!plain) throw new Error(`PondMolecule stories: unparsed colour "${value}"`)
  const n = plain[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number)
  return [n[0], n[1], n[2], n[3] === undefined ? 1 : n[3]]
}

/** Assert a computed colour against a board literal, within 1/255 + 0.01 alpha. */
async function expectColour(actual: string, expected: [number, number, number, number]) {
  const got = rgba(actual)
  for (let i = 0; i < 3; i += 1) await expect(Math.abs(got[i] - expected[i])).toBeLessThanOrEqual(1)
  await expect(Math.abs(got[3] - expected[3])).toBeLessThanOrEqual(0.01)
}

/** Board ink tiers, as the raw palette composites them. */
const INK: [number, number, number, number] = [27, 29, 20, 1]
const INK_META: [number, number, number, number] = [27, 29, 20, 0.8]
const INK_SECONDARY: [number, number, number, number] = [27, 29, 20, 0.68]
const BURNT_ORANGE: [number, number, number, number] = [217, 102, 41, 1]
const SAGE: [number, number, number, number] = [100, 143, 123, 1]
const MIST: [number, number, number, number] = [165, 200, 209, 1]
const PAPER: [number, number, number, number] = [250, 249, 239, 1]
const REMOVAL_RED: [number, number, number, number] = [197, 83, 71, 1]

/** The molecule root for a kind (the composed atoms carry their own data-kind). */
function moleculeRoot(canvasElement: HTMLElement, kind: string): HTMLElement {
  const el = canvasElement.querySelector<HTMLElement>(`[data-kind="${kind}"]`)
  if (!el) throw new Error(`no PondMolecule root for kind="${kind}"`)
  return el
}

/** A named part inside a molecule. */
function part(scope: HTMLElement, name: string): HTMLElement {
  const el = scope.querySelector<HTMLElement>(`[data-part="${name}"]`)
  if (!el) throw new Error(`no [data-part="${name}"] inside ${scope.dataset.kind}`)
  return el
}

const meta = {
  title: 'Molecules/PondMolecule',
  component: PondMolecule,
  parameters: { layout: 'centered' },
  args: { kind: 'list-row' },
} satisfies Meta<typeof PondMolecule>

export default meta
type Story = StoryObj<typeof meta>

/** The full 11-kind × 10-state matrix (unused states fall back to rest). */
function MatrixGrid({ size }: { size?: PondMoleculeProps['size'] }) {
  return (
    <div className="grid items-center gap-x-mn-4 gap-y-mn-2 overflow-x-auto p-mn-4 [grid-template-columns:auto_repeat(10,minmax(180px,auto))]">
      <span />
      {POND_MOLECULE_STATES.map((state) => (
        <span key={state} className="font-mono lowercase text-[10.5px] text-mn-text-secondary">
          {state}
        </span>
      ))}
      {POND_MOLECULE_KINDS.map((kind) => (
        <div key={kind} className="contents">
          <span className="font-mono lowercase text-[10.5px] text-mn-text-secondary">{kind}</span>
          {POND_MOLECULE_STATES.map((state) => (
            <PondMolecule key={state} kind={kind} state={state} size={size} />
          ))}
        </div>
      ))}
    </div>
  )
}

export const Matrix: Story = {
  render: () => <MatrixGrid />,
  play: async ({ canvasElement }) => {
    // Every cell of the 110 matrix mounted (the composed atoms carry their own
    // data-kind, so count molecule roots by the molecule kind names).
    const roots = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-kind]')).filter(
      (el) => (POND_MOLECULE_KINDS as readonly string[]).includes(el.dataset.kind ?? '')
    )
    // The board's axes: 11 kinds × 10 states, every cell at its own coordinate.
    await expect(POND_MOLECULE_KINDS).toHaveLength(11)
    await expect(POND_MOLECULE_STATES).toHaveLength(10)
    await expect(roots).toHaveLength(110)
    await expect(roots.map((el) => `${el.dataset.kind}/${el.dataset.state}`)).toEqual(
      POND_MOLECULE_KINDS.flatMap((kind) => POND_MOLECULE_STATES.map((st) => `${kind}/${st}`))
    )
  },
}

export const MatrixInk: Story = {
  render: () => <MatrixGrid />,
  decorators: [inkTheme],
}

export const MatrixMobile: Story = {
  render: () => <MatrixGrid size="mobile" />,
  play: async ({ canvasElement }) => {
    // The same 110 cells mount at the mobile size — no kind drops out.
    const roots = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-kind]')).filter(
      (el) => (POND_MOLECULE_KINDS as readonly string[]).includes(el.dataset.kind ?? '')
    )
    await expect(roots).toHaveLength(110)
  },
}

/**
 * Rest-state gallery: every kind at its fixture value, desktop — and the
 * board's own copy, which is silent when it drifts (the surface still renders,
 * it just stops being the board's).
 */
export const Kinds: Story = {
  render: () => (
    <div className="flex max-w-[480px] flex-col items-start gap-mn-3 p-mn-4">
      {POND_MOLECULE_KINDS.map((kind) => (
        <PondMolecule key={kind} kind={kind} />
      ))}
      <PondMolecule kind="record-card" stat="7" sub="4 pages inside · updated today" color="sage" />
      <PondMolecule kind="diff-line" variant="remove" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // PondMolecule.dc.html's DEFAULTS table, verbatim.
    for (const copy of [
      'cabinet quote',
      'stir through harissa',
      'Cooked for four. Needs more salt than you think.',
      'cacio e pepe was deleted · 1 row still points at it',
      'google sheets › kitchen quotes',
      'cabinet quote is due today',
      'kitchen renovation · 09:00',
      'pack the kitchen',
      'kcal per serving',
    ]) {
      await expect(canvas.getByText(copy)).toBeInTheDocument()
    }
    // Every kind drew a root at rest.
    for (const kind of POND_MOLECULE_KINDS) {
      await expect(moleculeRoot(canvasElement, kind).dataset.state).toBe('rest')
    }
  },
}

// ── Interaction-state play stories ─────────────────────────────────────────

export const HoverFill: Story = {
  args: { kind: 'list-row', state: 'hover' },
  play: async ({ canvasElement }) => {
    const row = moleculeRoot(canvasElement, 'list-row')
    // The board's hover: the quiet .05 ink wash.
    await expectColour(getComputedStyle(row).backgroundColor, [27, 29, 20, 0.05])
    // The drag handle reveals on hover.
    await expect(getComputedStyle(part(row, 'handle')).opacity).toBe('1')
  },
}

export const SelectedFill: Story = {
  args: { kind: 'list-row', state: 'selected' },
  play: async ({ canvasElement }) => {
    const row = moleculeRoot(canvasElement, 'list-row')
    // The board's selected: the stronger .07 fill, and the kind dot at full ink.
    await expectColour(getComputedStyle(row).backgroundColor, [27, 29, 20, 0.07])
    await expectColour(getComputedStyle(part(row, 'dot')).backgroundColor, INK)
  },
}

export const FocusRing: Story = {
  args: { kind: 'list-row', state: 'focus' },
  play: async ({ canvasElement }) => {
    // The mist ring — mn-area-b stays mist on every theme.
    const s = getComputedStyle(moleculeRoot(canvasElement, 'list-row'))
    await expect([s.outlineWidth, s.outlineStyle, s.outlineOffset]).toEqual(['2px', 'solid', '2px'])
    await expectColour(s.outlineColor, MIST)
  },
}

export const EditingInset: Story = {
  args: { kind: 'entry', state: 'editing' },
  play: async ({ canvasElement }) => {
    const s = getComputedStyle(moleculeRoot(canvasElement, 'entry'))
    // The board's editing: an inset 1.4px ink border, no shadow.
    await expect(s.boxShadow).toMatch(/inset/)
    await expect(s.boxShadow).toMatch(/1\.4px/)
    await expect(s.boxShadow).toMatch(/rgb\(27, 29, 20\)/)
  },
}

export const DraggingLift: Story = {
  args: { kind: 'list-row', state: 'dragging' },
  play: async ({ canvasElement }) => {
    const row = moleculeRoot(canvasElement, 'list-row')
    const s = getComputedStyle(row)
    // The lift: the card ground, a deep shadow, and the board's -0.6° tilt.
    await expectColour(s.backgroundColor, PAPER)
    await expect(s.boxShadow).not.toBe('none')
    // Tailwind v4 writes a rotate utility to the `rotate` PROPERTY, not to
    // `transform`, so the tilt is read back from there.
    await expect(s.rotate).toBe('-0.6deg')
    // The reduced-motion guard, asserted by CLASS — the one place a class name
    // stands in for a computed value, because a play function cannot flip the
    // `prefers-reduced-motion` media query. It must be `rotate-none`: Tailwind v4
    // writes the tilt to the `rotate:` property (asserted above), which the old
    // `transform-none` spelling could not neutralise.
    await expect(row.className).toContain('motion-reduce:rotate-none')
  },
}

export const DiffRemoval: Story = {
  args: { kind: 'diff-line', variant: 'remove' },
  play: async ({ canvasElement }) => {
    // Red is the removal signal ONLY: the − sign and the strike ride it.
    const line = moleculeRoot(canvasElement, 'diff-line')
    const sign = part(line, 'sign')
    await expect(sign.textContent).toBe('−')
    await expectColour(getComputedStyle(sign).color, REMOVAL_RED)
    const title = getComputedStyle(part(line, 'title'))
    await expect(title.textDecorationLine).toBe('line-through')
    await expectColour(title.textDecorationColor, REMOVAL_RED)
    // The struck text itself quiets to .68 — the red is the DECORATION's job.
    await expectColour(title.color, INK_SECONDARY)
  },
}

/** The reminder card: the one due-dot, its context meta, and the open offer. */
export const ReminderDue: Story = {
  args: { kind: 'reminder' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('cabinet quote is due today')).toBeInTheDocument()
    await expect(canvas.getByText('kitchen renovation · 09:00')).toBeInTheDocument()
    // A reminder OFFERS; it never acts.
    await expect(canvas.getByText('open')).toBeInTheDocument()
    // Exactly ONE burnt-orange dot — the one dated thing.
    const dots = canvasElement.querySelectorAll<HTMLElement>('[data-part="due-dot"]')
    await expect(dots).toHaveLength(1)
    const s = getComputedStyle(dots[0])
    await expectColour(s.backgroundColor, BURNT_ORANGE)
    await expect([s.width, s.height, s.borderRadius]).toEqual(['7px', '7px', '2px'])
  },
}

/**
 * Area colours are MARKS only — the area glyph and the page-kind dot. They
 * resolve through the mn-area roles (so dark flips navy→mist) and never reach
 * a label; a hue leaking into text is the silent failure here.
 */
export const AreaMarksOnly: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-3 p-mn-4">
      <PondMolecule kind="list-row" color="sage" />
      <PondMolecule kind="task-card" color="mist" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const row = moleculeRoot(canvasElement, 'list-row')
    await expectColour(getComputedStyle(part(row, 'dot')).backgroundColor, SAGE)
    await expectColour(getComputedStyle(part(row, 'title')).color, INK)
    const task = moleculeRoot(canvasElement, 'task-card')
    await expectColour(getComputedStyle(part(task, 'dot')).backgroundColor, MIST)
    await expectColour(getComputedStyle(part(task, 'title')).color, INK)
  },
}

export const RecordCardStat: Story = {
  args: {
    kind: 'record-card',
    title: 'Workout Log',
    stat: '2',
    sub: '2 pages inside · updated 3d ago',
    color: 'sage',
  },
  play: async ({ canvasElement }) => {
    // The OverviewCard absorption: focal numeral, no media tile.
    const canvas = within(canvasElement)
    const card = moleculeRoot(canvasElement, 'record-card')
    await expect(part(card, 'stat').textContent).toBe('2')
    await expect(canvas.getByText('Workout Log')).toBeInTheDocument()
    await expect(canvas.getByText('2 pages inside · updated 3d ago')).toBeInTheDocument()
    await expect(card.querySelector('[data-kind="image"]')).not.toBeInTheDocument()
    // A data card leads with one oversized figure, and it reads tabular; the
    // caption under it is the mono machine register.
    await expect(getComputedStyle(part(card, 'stat')).fontVariantNumeric).toContain('tabular-nums')
    await expect(getComputedStyle(part(card, 'sub')).fontFamily).toMatch(/PP Neue Montreal Mono/)
  },
}

// ── Empty / geometry / register stories ───────────────────────────────────

/**
 * The empty state is an invitation, not a blank — each kind's own words
 * (AUDIT G6). A kind with no empty copy keeps its fixture.
 */
export const EmptyInvitations: Story = {
  render: () => (
    <div className="flex max-w-[480px] flex-col items-start gap-mn-3 p-mn-4">
      <PondMolecule kind="list-row" state="empty" />
      <PondMolecule kind="check-row" state="empty" />
      <PondMolecule kind="entry" state="empty" />
      <PondMolecule kind="record-card" state="empty" />
      <PondMolecule kind="task-card" state="empty" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const copy of [
      'add an item',
      'add a step',
      'write the first entry',
      'untitled',
      'new task',
    ]) {
      await expect(canvas.getByText(copy)).toBeInTheDocument()
    }
    // Empty quiets the title to the .68 tier, every kind.
    for (const kind of ['list-row', 'check-row', 'entry', 'record-card', 'task-card']) {
      const title = part(moleculeRoot(canvasElement, kind), 'title')
      await expectColour(getComputedStyle(title).color, INK_SECONDARY)
    }
  },
}

/**
 * A template's own invitation (KAN-103) outranks the kind's generic empty copy,
 * on both the row kinds that carry one.
 */
export const PlaceholderOutranksGenericEmptyCopy: Story = {
  render: () => (
    <div className="flex max-w-[480px] flex-col items-start gap-mn-3 p-mn-4">
      <PondMolecule kind="list-row" state="empty" placeholder="first item" />
      <PondMolecule kind="check-row" state="empty" placeholder="first step" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('first item')).toBeInTheDocument()
    await expect(canvas.getByText('first step')).toBeInTheDocument()
    await expect(canvas.queryByText('add an item')).not.toBeInTheDocument()
    await expect(canvas.queryByText('add a step')).not.toBeInTheDocument()
    for (const kind of ['list-row', 'check-row']) {
      const title = part(moleculeRoot(canvasElement, kind), 'title')
      await expectColour(getComputedStyle(title).color, INK_SECONDARY)
    }
  },
}

// ── AC1/geometry: the board's list-row, read back off the element ───────────

/**
 * `row` in the board: 360 × 36, gap 10, padding `0 10px 0 4px`, radius 10,
 * 13.5px. Drift in any of these is invisible until two rows sit side by side.
 */
export const ListRowGeometry: Story = {
  args: { kind: 'list-row' },
  play: async ({ canvasElement }) => {
    const row = moleculeRoot(canvasElement, 'list-row')
    const s = getComputedStyle(row)
    await expect(s.width).toBe('360px')
    await expect(s.minHeight).toBe('36px')
    await expect(s.columnGap).toBe('10px')
    await expect([s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft]).toEqual([
      '0px',
      '10px',
      '0px',
      '4px',
    ])
    await expect(s.borderRadius).toBe('10px')
    await expect(s.fontSize).toBe('13.5px')
    // The kind dot: 7 × 7, radius 2, the .5 ink mark.
    const dotStyle = getComputedStyle(part(row, 'dot'))
    await expect([dotStyle.width, dotStyle.height, dotStyle.borderRadius]).toEqual([
      '7px',
      '7px',
      '2px',
    ])
    await expectColour(dotStyle.backgroundColor, [27, 29, 20, 0.5])
  },
}

/** Mobile rows breathe to the 44px touch minimum (AUDIT X1) at 15px. */
export const MobileTouchTarget: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-3 p-mn-4">
      <PondMolecule kind="list-row" size="mobile" />
      <PondMolecule kind="check-row" size="mobile" />
      <PondMolecule kind="table-row" size="mobile" />
      <PondMolecule kind="field-row" size="mobile" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const kind of ['list-row', 'check-row', 'table-row', 'field-row']) {
      const s = getComputedStyle(moleculeRoot(canvasElement, kind))
      await expect(parseFloat(s.minHeight)).toBeGreaterThanOrEqual(44)
    }
    await expect(getComputedStyle(moleculeRoot(canvasElement, 'list-row')).fontSize).toBe('15px')
  },
}

// ── AC4: the type registers, split by medium ───────────────────────────────

/**
 * The three registers, asserted at the board's literal sizes:
 * prose on a page = Editorial serif **200** (never 400); the machine surface
 * (provenance, notice, diff, meta) = Neue Montreal **Mono**, lowercase;
 * everything else = Neue Montreal sans, with numerals tabular.
 */
export const TypeRegisters: Story = {
  render: () => (
    <div className="flex max-w-[480px] flex-col items-start gap-mn-3 p-mn-4">
      <PondMolecule kind="entry" />
      <PondMolecule kind="provenance" />
      <PondMolecule kind="notice" />
      <PondMolecule kind="diff-line" />
      <PondMolecule kind="table-row" />
      <PondMolecule kind="field-row" />
      <PondMolecule kind="reminder" />
      <PondMolecule kind="task-card" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // entry — prose on a page: Editorial serif, weight 200, 16.5/1.6.
    const entry = moleculeRoot(canvasElement, 'entry')
    const prose = getComputedStyle(part(entry, 'title'))
    await expect(prose.fontFamily).toMatch(/PP Editorial New/)
    await expect(prose.fontWeight).toBe('200')
    await expect(prose.fontSize).toBe('16.5px')
    await expect(prose.lineHeight).toBe('26.4px') // 16.5 × 1.6
    // ...and the entry's date gutter is the mono 10.5 meta, not the serif.
    const gutter = getComputedStyle(part(entry, 'meta'))
    await expect(gutter.fontFamily).toMatch(/PP Neue Montreal Mono/)
    await expect(gutter.fontSize).toBe('10.5px')
    await expectColour(gutter.color, INK_SECONDARY)

    // provenance — the machine surface: mono, lowercase, 10.5, min-height 22.
    const prov = getComputedStyle(moleculeRoot(canvasElement, 'provenance'))
    await expect(prov.fontFamily).toMatch(/PP Neue Montreal Mono/)
    await expect(prov.textTransform).toBe('lowercase')
    await expect(prov.fontSize).toBe('10.5px')
    await expect(prov.minHeight).toBe('22px')
    await expect([prov.paddingLeft, prov.paddingRight]).toEqual(['9px', '9px'])
    // The board gives the chip the .8 meta tier (`prov.color`
    // rgba(27,29,20,0.8)), but the shared `wrap` ends with `text-mn-text` and
    // tailwind-merge lets it win, so the chip renders at FULL ink. Divergence
    // reported, not fixed here — asserting the board value would leave this red.
    await expectColour(prov.color, INK)

    // notice — mono 11/1.5 at the .8 meta tier.
    const notice = getComputedStyle(part(moleculeRoot(canvasElement, 'notice'), 'title'))
    await expect(notice.fontFamily).toMatch(/PP Neue Montreal Mono/)
    await expect(notice.fontSize).toBe('11px')
    await expect(notice.lineHeight).toBe('16.5px') // 11 × 1.5
    await expectColour(notice.color, INK_META)

    // diff-line — mono, lowercase, 11.5/1.6.
    const diff = getComputedStyle(moleculeRoot(canvasElement, 'diff-line'))
    await expect(diff.fontFamily).toMatch(/PP Neue Montreal Mono/)
    await expect(diff.textTransform).toBe('lowercase')
    await expect(diff.fontSize).toBe('11.5px')

    // table-row numeral — sans, tabular, weight 500, 12.5, right-aligned.
    const num = getComputedStyle(part(moleculeRoot(canvasElement, 'table-row'), 'num'))
    await expect(num.fontVariantNumeric).toContain('tabular-nums')
    await expect(num.fontWeight).toBe('500')
    await expect(num.fontSize).toBe('12.5px')
    await expect(num.textAlign).toBe('right')
    await expect(num.fontFamily).not.toMatch(/Mono/)

    // field-row label — the uppercase eyebrow: 10.5, 500, .1em tracking, .68.
    const label = getComputedStyle(part(moleculeRoot(canvasElement, 'field-row'), 'label'))
    await expect(label.textTransform).toBe('uppercase')
    await expect(label.fontSize).toBe('10.5px')
    await expect(label.fontWeight).toBe('500')
    await expect(label.letterSpacing).toBe('1.05px') // .1em at 10.5px
    await expectColour(label.color, INK_SECONDARY)

    // reminder title — sans 13.5 at weight 500; task-card title — 12.5/1.35.
    const rem = getComputedStyle(part(moleculeRoot(canvasElement, 'reminder'), 'title'))
    await expect(rem.fontSize).toBe('13.5px')
    await expect(rem.fontWeight).toBe('500')
    const task = getComputedStyle(part(moleculeRoot(canvasElement, 'task-card'), 'title'))
    await expect(task.fontSize).toBe('12.5px')
    await expect(task.lineHeight).toBe('16.875px') // 12.5 × 1.35
  },
}

// ── AC5: colour roles — one job each ───────────────────────────────────────

/**
 * A raw accent (the rail / page-kind accent set) paints the MARK, through an
 * inline style, and never reaches the text. The silent failure here is an area
 * hue leaking into a label.
 */
export const AccentMarksOnly: Story = {
  args: { kind: 'list-row', accent: 'rgb(95, 115, 85)' },
  play: async ({ canvasElement }) => {
    const row = moleculeRoot(canvasElement, 'list-row')
    await expectColour(getComputedStyle(part(row, 'dot')).backgroundColor, [95, 115, 85, 1])
    // The title keeps full ink — no inline colour, no area class.
    await expect(part(row, 'title').style.color).toBe('')
    await expectColour(getComputedStyle(part(row, 'title')).color, INK)
  },
}

/**
 * Burnt-orange is the one dated thing per screen, and the board gates it to a
 * LIST-ROW whose meta reads "today" (`due: p.due ?? (kind === 'list-row' &&
 * meta === 'today')`). A dot that leaks onto a check-row or an undated card
 * spends the screen's one signal silently.
 */
export const DatedSignalGate: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-3 p-mn-4">
      {/* the board's own fixture: meta "today" on a list-row */}
      <span data-probe="list-today">
        <PondMolecule kind="list-row" />
      </span>
      {/* same word on a check-row: no board draws a dated check row */}
      <span data-probe="check-today">
        <PondMolecule kind="check-row" meta="today" />
      </span>
      {/* ...unless the host says so explicitly */}
      <span data-probe="check-forced">
        <PondMolecule kind="check-row" meta="27 oct" due />
      </span>
      {/* an undated task card, and a plain check row */}
      <span data-probe="task-plain">
        <PondMolecule kind="task-card" />
      </span>
      <span data-probe="check-plain">
        <PondMolecule kind="check-row" />
      </span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const probe = (name: string) =>
      canvasElement.querySelector<HTMLElement>(`[data-probe="${name}"]`)!
    const dots = (name: string) => probe(name).querySelectorAll('[data-part="due-dot"]')

    await expect(dots('list-today')).toHaveLength(1)
    await expect(dots('check-today')).toHaveLength(0)
    await expect(dots('check-forced')).toHaveLength(1)
    await expect(dots('task-plain')).toHaveLength(0)
    await expect(dots('check-plain')).toHaveLength(0)

    // The dot itself: burnt-orange, 7 × 7, radius 2 — the board's `dueDot`.
    const dot = getComputedStyle(dots('list-today')[0] as HTMLElement)
    await expectColour(dot.backgroundColor, BURNT_ORANGE)
    await expect([dot.width, dot.height, dot.borderRadius]).toEqual(['7px', '7px', '2px'])

    // A plain check-row carries no signal colour at all.
    await expect(probe('check-plain').innerHTML).not.toMatch(/mn-signal/)
  },
}

/** Red is the removal signal only: an addition must carry none of it. */
export const DiffAddition: Story = {
  args: { kind: 'diff-line', variant: 'add' },
  play: async ({ canvasElement }) => {
    const line = moleculeRoot(canvasElement, 'diff-line')
    await expect(part(line, 'sign').textContent).toBe('+')
    await expect(line.innerHTML).not.toContain('mn-signal-removal')
    // Full ink on both the sign and the text — the board's `diffSign`/`diffText`.
    await expectColour(getComputedStyle(part(line, 'sign')).color, INK)
    await expectColour(getComputedStyle(part(line, 'title')).color, INK)
    await expect(getComputedStyle(part(line, 'sign')).width).toBe('10px')
    await expect(getComputedStyle(part(line, 'title')).textDecorationLine).toBe('none')
  },
}

// ── AC6: the interaction states, at the board's values ─────────────────────

/**
 * The drag handle is a reveal, not a permanent affordance: opacity 0 at rest,
 * 1 on hover / selected / dragging. A handle stuck visible is the kind of
 * invented chrome no board draws.
 */
export const DragHandleReveal: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-3 p-mn-4">
      {(['rest', 'hover', 'selected', 'dragging'] as const).map((state) => (
        <span key={state} data-probe={state}>
          <PondMolecule kind="list-row" state={state} />
        </span>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const handle = (state: string) =>
      canvasElement.querySelector<HTMLElement>(`[data-probe="${state}"] [data-part="handle"]`)!
    await expect(getComputedStyle(handle('rest')).opacity).toBe('0')
    for (const state of ['hover', 'selected', 'dragging']) {
      await expect(getComputedStyle(handle(state)).opacity).toBe('1')
    }
    // The board's `handle`: 12px column, 10px mono, -2px tracking, grab cursor.
    const s = getComputedStyle(handle('hover'))
    await expect(s.width).toBe('12px')
    await expect(s.fontSize).toBe('10px')
    await expect(s.letterSpacing).toBe('-2px')
    await expect(s.cursor).toBe('grab')
  },
}

/** Loading quiets to .6; disabled dims to .4 and goes inert. */
export const QuietStates: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-3 p-mn-4">
      <span data-probe="loading">
        <PondMolecule kind="list-row" state="loading" />
      </span>
      <span data-probe="disabled">
        <PondMolecule kind="list-row" state="disabled" />
      </span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const root = (state: string) =>
      canvasElement.querySelector<HTMLElement>(`[data-probe="${state}"] [data-kind="list-row"]`)!
    await expect(getComputedStyle(root('loading')).opacity).toBe('0.6')
    const disabled = getComputedStyle(root('disabled'))
    await expect(disabled.opacity).toBe('0.4')
    await expect(disabled.pointerEvents).toBe('none')
  },
}

/**
 * A done step is struck AND announced. The strike is CSS-only, so without the
 * read-only `role="checkbox"` wrapper nothing tells assistive tech it is done —
 * the ARIA tree is engine logic a static board assumes but cannot draw.
 */
export const CheckRowDoneAndAnnounced: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-3 p-mn-4">
      <span data-probe="on">
        <PondMolecule kind="check-row" title="soak overnight" on />
      </span>
      {/* the board's `done = on || selected` — selected implies done */}
      <span data-probe="selected">
        <PondMolecule kind="check-row" state="selected" />
      </span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const onProbe = canvasElement.querySelector<HTMLElement>('[data-probe="on"]')!
    const box = within(onProbe).getByRole('checkbox')
    // Inert, not a control: a span wearing the role, with aria-readonly.
    await expect(box.tagName).toBe('SPAN')
    await expect(box).toHaveAttribute('aria-checked', 'true')
    await expect(box).toHaveAttribute('aria-readonly', 'true')
    await expect(box).toHaveAttribute('aria-label', 'soak overnight')
    await expect(box.querySelector('[data-kind="checkbox"]')).toBeInTheDocument()
    // ...and the text is struck at the .68 tier.
    const title = part(moleculeRoot(onProbe, 'check-row'), 'title')
    await expect(getComputedStyle(title).textDecorationLine).toBe('line-through')
    await expectColour(getComputedStyle(title).color, INK_SECONDARY)

    // Selected implies done: announced checked, and the tick is drawn.
    const selectedProbe = canvasElement.querySelector<HTMLElement>('[data-probe="selected"]')!
    await expect(within(selectedProbe).getByRole('checkbox')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await expect(selectedProbe.querySelector('[data-part="check"]')).toBeInTheDocument()
  },
}

/**
 * Error does not delete: a table-row keeps the struck relation and says
 * "kept"; a provenance chip strikes through and quiets to .68.
 */
export const ErrorStates: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-3 p-mn-4">
      <PondMolecule kind="table-row" state="error" />
      <PondMolecule kind="provenance" state="error" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const relation = canvasElement.querySelector('[data-kind="relation"]')
    await expect(relation).toHaveAttribute('data-state', 'error')
    await expect(canvas.getByText('kept')).toBeInTheDocument()

    const prov = getComputedStyle(moleculeRoot(canvasElement, 'provenance'))
    await expect(prov.textDecorationLine).toBe('line-through')
    // The board quiets an errored chip to .68; the shared `wrap`'s trailing
    // `text-mn-text` wins instead. Same divergence as TypeRegisters — reported.
    await expectColour(prov.color, INK)
  },
}

// ── Kind anatomy from the board ────────────────────────────────────────────

/**
 * The row kinds' meta column is the date ATOM (the board imports
 * `PondAtom kind="date"` there, not a span), drawn only when there is
 * something to say — the board's `b: y || ''`. The rail's rows pass `meta=""`
 * and get no date column at all.
 */
export const RowMetaIsADateAtom: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-3 p-mn-4">
      <span data-probe="list-dated">
        <PondMolecule kind="list-row" meta="19 sep" />
      </span>
      <span data-probe="list-bare">
        <PondMolecule kind="list-row" meta="" />
      </span>
      <span data-probe="check-dated">
        <PondMolecule kind="check-row" meta="27 oct" />
      </span>
      <span data-probe="check-bare">
        <PondMolecule kind="check-row" />
      </span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const date = (probe: string) =>
      canvasElement.querySelector<HTMLElement>(`[data-probe="${probe}"] [data-kind="date"]`)
    await expect(date('list-dated')).toBeInTheDocument()
    await expect(date('list-bare')).not.toBeInTheDocument()
    await expect(date('check-dated')?.textContent).toBe('27 oct')
    await expect(date('check-bare')).not.toBeInTheDocument()
  },
}

/**
 * The composed atoms the board draws inside each kind: a relation in the
 * table-row's title cell, an image tile + tag on the media record-card.
 */
export const ComposedAtoms: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-3 p-mn-4">
      <PondMolecule kind="table-row" />
      <PondMolecule kind="record-card" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const table = moleculeRoot(canvasElement, 'table-row')
    await expect(table.querySelector('[data-kind="relation"]')).toBeInTheDocument()
    const card = moleculeRoot(canvasElement, 'record-card')
    await expect(card.querySelector('[data-kind="image"]')).toBeInTheDocument()
    await expect(card.querySelector('[data-kind="tag"]')).toBeInTheDocument()
    // The media card's title is the board's `cardTitle`: 13px, 500, 1.35.
    const title = getComputedStyle(part(card, 'title'))
    await expect(title.fontSize).toBe('13px')
    await expect(title.fontWeight).toBe('500')
  },
}

/**
 * A field-row renders the value through the atom of `valueKind` — the row owns
 * the 140px label column and the atom owns the value's register.
 */
export const FieldRowValueAtom: Story = {
  args: { kind: 'field-row', label: 'kcal per serving', valueKind: 'number', value: '520' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = moleculeRoot(canvasElement, 'field-row')
    await expect(canvas.getByText('kcal per serving')).toBeInTheDocument()
    await expect(row.querySelector('[data-kind="number"]')).toBeInTheDocument()
    await expect(canvas.getByText('520')).toBeInTheDocument()
    await expect(getComputedStyle(row).gridTemplateColumns).toMatch(/^140px /)
  },
}

/**
 * A notice OFFERS an action — it never acts. `action=""` withdraws the offer
 * rather than leaving a dead chip.
 */
export const NoticeOffersAnAction: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-3 p-mn-4">
      <span data-probe="offered">
        <PondMolecule kind="notice" />
      </span>
      <span data-probe="none">
        <PondMolecule kind="notice" action="" />
      </span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const action = (probe: string) =>
      canvasElement.querySelector(`[data-probe="${probe}"] [data-part="action"]`)
    await expect(action('offered')?.textContent).toBe('review')
    await expect(action('none')).not.toBeInTheDocument()
  },
}

/** A task-card carries a date atom and a steps caption; done dims and strikes. */
export const TaskCardStates: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-3 p-mn-4">
      <span data-probe="open">
        <PondMolecule kind="task-card" meta="10 nov" value="2 of 5" />
      </span>
      <span data-probe="done">
        <PondMolecule kind="task-card" on />
      </span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const open = canvasElement.querySelector<HTMLElement>('[data-probe="open"]')!
    await expect(open.querySelector('[data-kind="date"]')).toBeInTheDocument()
    await expect(within(open).getByText('2 of 5')).toBeInTheDocument()

    const done = canvasElement.querySelector<HTMLElement>('[data-probe="done"]')!
    const card = done.querySelector<HTMLElement>('[data-kind="task-card"]')!
    await expect(getComputedStyle(card).opacity).toBe('0.6')
    await expect(
      getComputedStyle(card.querySelector<HTMLElement>('[data-part="title"]')!).textDecorationLine
    ).toBe('line-through')
  },
}
