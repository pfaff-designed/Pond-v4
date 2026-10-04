import { useState } from 'react'
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import {
  PondControl,
  POND_CONTROL_KINDS,
  POND_CONTROL_STATES,
  POND_CONTROL_VARIANTS,
  type PondControlKind,
  type PondControlProps,
  type PondControlState,
  type PondControlVariant,
} from './PondControl'

/**
 * PondControl (#221) — the five control kinds × eight states, both themes, both
 * sizes. Every number asserted below is a literal from
 * `wayfinder/board-values.generated.json` (`.components.PondControl`), the board's
 * own `renderVals()` output, read back off REAL computed styles. Theme is ambient:
 * the `Ink` stories only add `.dark` around the canvas.
 */

const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

const meta = {
  title: 'Atoms/PondControl',
  component: PondControl,
  parameters: { layout: 'centered' },
  args: { kind: 'button' },
} satisfies Meta<typeof PondControl>

export default meta
type Story = StoryObj<typeof meta>

// ── The board's two palettes ───────────────────────────────────────────────────

const PAPER = {
  ink: 'rgb(27, 29, 20)',
  inverse: 'rgb(250, 249, 239)',
  card: 'rgb(250, 249, 239)',
  shadow: ['rgba(40, 34, 24, 0.04) 0px 1px 2px', 'rgba(40, 34, 24, 0.06) 0px 8px 24px'],
}
const INK = {
  ink: 'rgb(250, 249, 239)',
  inverse: 'rgb(27, 29, 20)',
  card: 'rgb(48, 49, 42)',
  shadow: ['rgba(0, 0, 0, 0.3) 0px 1px 2px', 'rgba(0, 0, 0, 0.34) 0px 8px 24px'],
}
type Palette = typeof PAPER
const MIST = 'rgb(165, 200, 209)'
const TRANSPARENT = 'rgba(0, 0, 0, 0)'

/** The alpha of a computed colour — `rgba(…, a)`, `color(srgb … / a)` or `oklab(… / a)`. */
function alphaOf(color: string): number {
  if (/^rgb\(/.test(color) && !color.includes('/')) return 1
  if (color === TRANSPARENT) return 0
  const m = color.match(/(?:\/|,)\s*([\d.]+%?)\s*\)\s*$/)
  if (!m) return NaN
  return m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1])
}

/** PAINTED `box-shadow` layers, outermost first. Tailwind composes ring + shadow through
 *  `0 0 #0000` placeholders, and `ring-0` leaves a zero-width coloured ring — neither
 *  paints a pixel, so both are dropped and only what the board draws remains. */
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
  return out
    .filter((l) => !/^rgba\(0, 0, 0, 0\) /.test(l) && !/ 0px 0px 0px 0px( inset)?$/.test(l))
    .map((l) => l.replace(/ 0px$/, ''))
}

const px = (v: string) => parseFloat(v)
const cell = (root: HTMLElement, kind: PondControlKind, state: PondControlState, variant = '') =>
  root.querySelector<HTMLElement>(
    `[data-cell="${kind}/${state}${variant ? `/${variant}` : ''}"] [data-kind="${kind}"]`
  )!

async function assertFocusRing(el: HTMLElement) {
  const cs = getComputedStyle(el)
  await expect(cs.outlineStyle).toBe('solid')
  await expect(cs.outlineWidth).toBe('2px')
  await expect(cs.outlineColor).toBe(MIST)
  await expect(cs.outlineOffset).toBe('2px')
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

/** Every state of one kind, each cell addressable by `data-cell`. */
function States({
  kind,
  variant,
  size,
}: {
  kind: PondControlKind
  variant?: PondControlVariant
  size?: PondControlProps['size']
}) {
  return (
    <div role={kind === 'menu' ? 'menu' : undefined} className="flex flex-col items-start gap-mn-2">
      {POND_CONTROL_STATES.map((state) => (
        <div key={state} data-cell={`${kind}/${state}${variant ? `/${variant}` : ''}`}>
          <PondControl
            kind={kind}
            variant={variant}
            state={state}
            size={size}
            hint={kind === 'menu' ? 'page' : undefined}
          />
        </div>
      ))}
    </div>
  )
}

function MatrixGrid({ size }: { size?: PondControlProps['size'] }) {
  return (
    <div className="flex flex-col gap-mn-6 p-mn-4">
      <div className="flex gap-mn-6">
        {POND_CONTROL_VARIANTS.map((variant) => (
          <div key={variant} className="flex flex-col gap-mn-2">
            <span className="font-mono lowercase text-[10.5px] text-mn-text-secondary">
              button · {variant}
            </span>
            <States kind="button" variant={variant} size={size} />
          </div>
        ))}
      </div>
      <div className="flex gap-mn-6">
        {POND_CONTROL_KINDS.filter((k) => k !== 'button').map((kind) => (
          <div key={kind} className="flex flex-col gap-mn-2">
            <span className="font-mono lowercase text-[10.5px] text-mn-text-secondary">{kind}</span>
            <States kind={kind} size={size} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── The matrix ─────────────────────────────────────────────────────────────────

export const Matrix: Story = {
  render: () => <MatrixGrid />,
  play: async ({ canvasElement }) => {
    // Every button variant, plus every non-button kind, × every state — all three
    // counts derived, so a sixth kind or a fifth variant joins the matrix and its
    // assertion together rather than going silently unproven.
    const nonButtonKinds = POND_CONTROL_KINDS.filter((k) => k !== 'button').length
    await expect(canvasElement.querySelectorAll('[data-kind]')).toHaveLength(
      (POND_CONTROL_VARIANTS.length + nonButtonKinds) * POND_CONTROL_STATES.length
    )
    // The board's three axes, read back off what actually rendered: five kinds,
    // four variants, eight states — in the board's own order, and nothing else.
    const drawn = [...canvasElement.querySelectorAll<HTMLElement>('[data-kind]')]
    await expect([...new Set(drawn.map((el) => el.dataset.kind))]).toEqual([
      'button',
      'field',
      'toggle',
      'checkbox',
      'menu',
    ])
    await expect([...new Set(drawn.map((el) => el.dataset.state))]).toEqual([
      'rest',
      'hover',
      'focus',
      'selected',
      'editing',
      'disabled',
      'loading',
      'error',
    ])
    const variants = [...canvasElement.querySelectorAll<HTMLElement>('[data-cell]')]
      .map((el) => el.dataset.cell!.split('/')[2])
      .filter(Boolean)
    await expect([...new Set(variants)]).toEqual(['primary', 'secondary', 'ghost', 'quiet'])
    // No spinner anywhere: `loading` is a copy swap.
    for (const el of canvasElement.querySelectorAll<HTMLElement>('[data-state="loading"] *')) {
      await expect(getComputedStyle(el).animationName).toBe('none')
    }
  },
}

export const MatrixInk: Story = {
  render: () => <MatrixGrid />,
  decorators: [inkTheme],
}

export const MatrixMobile: Story = {
  render: () => <MatrixGrid size="mobile" />,
}

// ── button ─────────────────────────────────────────────────────────────────────

async function assertButton(root: HTMLElement, p: Palette) {
  // Geometry shared by every variant and state: h32 · px14 · 12 / 500 · pill · gap 6.
  for (const variant of POND_CONTROL_VARIANTS) {
    for (const state of POND_CONTROL_STATES) {
      const cs = getComputedStyle(cell(root, 'button', state, variant))
      await expect(cs.display).toBe('inline-flex')
      await expect(px(cs.height)).toBe(32)
      await expect(cs.paddingLeft).toBe('14px')
      await expect(cs.paddingRight).toBe('14px')
      await expect(cs.borderRadius).toBe('9999px')
      await expect(cs.fontSize).toBe('12px')
      await expect(cs.fontWeight).toBe('500')
      await expect(cs.columnGap).toBe('6px')
      await expect(cs.whiteSpace).toBe('nowrap')
      await expect(cs.fontFamily).toContain('PP Neue Montreal')
      await expect(cs.fontFamily).not.toContain('Mono')
    }
  }
  // primary — ink on paper; hover is opacity .9.
  let cs = getComputedStyle(cell(root, 'button', 'rest', 'primary'))
  await expect(cs.backgroundColor).toBe(p.ink)
  await expect(cs.color).toBe(p.inverse)
  await expect(cs.opacity).toBe('1')
  await expect(getComputedStyle(cell(root, 'button', 'hover', 'primary')).opacity).toBe('0.9')
  await expect(getComputedStyle(cell(root, 'button', 'hover', 'primary')).backgroundColor).toBe(
    p.ink
  )
  // secondary — ink .07 / label .8; hover + selected .12.
  cs = getComputedStyle(cell(root, 'button', 'rest', 'secondary'))
  await expect(alphaOf(cs.backgroundColor)).toBeCloseTo(0.07, 2)
  await expect(alphaOf(cs.color)).toBeCloseTo(0.8, 2)
  await expect(cs.opacity).toBe('1')
  for (const state of ['hover', 'selected'] as const) {
    await expect(
      alphaOf(getComputedStyle(cell(root, 'button', state, 'secondary')).backgroundColor)
    ).toBeCloseTo(0.12, 2)
    await expect(getComputedStyle(cell(root, 'button', state, 'secondary')).opacity).toBe('1')
  }
  // ghost — transparent + inset 1px ink .2; hover + selected ground .07.
  cs = getComputedStyle(cell(root, 'button', 'rest', 'ghost'))
  await expect(cs.backgroundColor).toBe(TRANSPARENT)
  await expect(cs.color).toBe(p.ink)
  let ring = shadowLayers(cs.boxShadow)
  await expect(ring).toHaveLength(1)
  await expect(ring[0]).toContain('0px 0px 0px 1px inset')
  await expect(alphaOf(ring[0].split(') ')[0] + ')')).toBeCloseTo(0.2, 2)
  for (const state of ['hover', 'selected'] as const) {
    await expect(
      alphaOf(getComputedStyle(cell(root, 'button', state, 'ghost')).backgroundColor)
    ).toBeCloseTo(0.07, 2)
  }
  // quiet — inset 1px ink .4; hover .07; selected stays transparent (the board sets none).
  cs = getComputedStyle(cell(root, 'button', 'rest', 'quiet'))
  ring = shadowLayers(cs.boxShadow)
  await expect(ring[0]).toContain('0px 0px 0px 1px inset')
  await expect(alphaOf(ring[0].split(') ')[0] + ')')).toBeCloseTo(0.4, 2)
  await expect(
    alphaOf(getComputedStyle(cell(root, 'button', 'hover', 'quiet')).backgroundColor)
  ).toBeCloseTo(0.07, 2)
  await expect(getComputedStyle(cell(root, 'button', 'selected', 'quiet')).backgroundColor).toBe(
    TRANSPARENT
  )
  // The shared states.
  for (const variant of POND_CONTROL_VARIANTS) {
    await assertFocusRing(cell(root, 'button', 'focus', variant))
    const dis = getComputedStyle(cell(root, 'button', 'disabled', variant))
    await expect(dis.opacity).toBe('0.4')
    await expect(dis.pointerEvents).toBe('none')
    await expect(cell(root, 'button', 'loading', variant).textContent).toBe('saving…')
    await expect(cell(root, 'button', 'rest', variant).textContent).toBe('keep page')
  }
}

export const Button: Story = {
  render: () => (
    <div className="flex gap-mn-6 p-mn-4">
      {POND_CONTROL_VARIANTS.map((v) => (
        <States key={v} kind="button" variant={v} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => assertButton(canvasElement, PAPER),
}

export const ButtonInk: Story = {
  ...Button,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertButton(canvasElement, INK),
}

// ── field ──────────────────────────────────────────────────────────────────────

async function assertField(root: HTMLElement, p: Palette) {
  const box = (state: PondControlState) =>
    cell(root, 'field', state).querySelector<HTMLElement>('[data-part="field"]')!
  const input = (state: PondControlState) =>
    cell(root, 'field', state).querySelector<HTMLInputElement>('input')!
  for (const state of POND_CONTROL_STATES) {
    const cs = getComputedStyle(box(state))
    await expect(cs.display).toBe('flex')
    await expect(px(cs.width)).toBe(240)
    await expect(px(cs.height)).toBe(38)
    await expect(cs.paddingLeft).toBe('14px')
    await expect(cs.borderRadius).toBe('14px')
    await expect(cs.columnGap).toBe('2px')
    await expect(cs.backgroundColor).toBe(p.card)
    await expect(cs.fontSize).toBe('13.5px')
    await expect(cs.color).toBe(p.ink)
    await expect(getComputedStyle(input(state)).fontSize).toBe('13.5px')
    await expect(getComputedStyle(cell(root, 'field', state)).rowGap).toBe('6px')
  }
  // rest — the card shadow and the .68 placeholder, no caret, no hint.
  await expect(shadowLayers(getComputedStyle(box('rest')).boxShadow)).toEqual(p.shadow)
  await expect(input('rest').placeholder).toBe('email')
  await expect(alphaOf(getComputedStyle(input('rest'), '::placeholder').color)).toBeCloseTo(0.68, 2)
  await expect(cell(root, 'field', 'rest').querySelector('[data-part="caret"]')).toBeNull()
  await expect(cell(root, 'field', 'rest').querySelector('[data-part="hint"]')).toBeNull()
  // editing — full-ink value + the 1.5 × 15 ink caret.
  await expect(input('editing').value).toBe('hi@make-noise')
  await expect(getComputedStyle(input('editing')).color).toBe(p.ink)
  const caret = cell(root, 'field', 'editing').querySelector<HTMLElement>('[data-part="caret"]')!
  const cc = getComputedStyle(caret)
  await expect(cc.width).toBe('1.5px')
  await expect(cc.height).toBe('15px')
  await expect(cc.backgroundColor).toBe(p.ink)
  // focus — the mist ring on the card, and the caret.
  await assertFocusRing(box('focus'))
  await expect(cell(root, 'field', 'focus').querySelector('[data-part="caret"]')).not.toBeNull()
  // loading / disabled.
  await expect(input('loading').placeholder).toBe('checking…')
  await expect(getComputedStyle(box('disabled')).opacity).toBe('0.4')
  await expect(getComputedStyle(box('disabled')).pointerEvents).toBe('none')
  await expect(input('disabled').disabled).toBe(true)
  // error — inset 1.4px ink composed BEFORE the card shadow; mono 10.5 hint at ink .8.
  const err = shadowLayers(getComputedStyle(box('error')).boxShadow)
  await expect(err).toHaveLength(3)
  await expect(err[0]).toBe(`${p.ink} 0px 0px 0px 1.4px inset`)
  await expect(err.slice(1)).toEqual(p.shadow)
  const hint = cell(root, 'field', 'error').querySelector<HTMLElement>('[data-part="hint"]')!
  const hs = getComputedStyle(hint)
  await expect(hint.textContent).toBe('that isn’t an email address')
  await expect(hs.fontFamily).toContain('PP Neue Montreal Mono')
  await expect(hs.fontSize).toBe('10.5px')
  await expect(alphaOf(hs.color)).toBeCloseTo(0.8, 2)
  await expect(hs.paddingLeft).toBe('4px')
}

export const Field: Story = {
  render: () => (
    <div className="p-mn-4">
      <States kind="field" />
    </div>
  ),
  play: async ({ canvasElement }) => assertField(canvasElement, PAPER),
}

export const FieldInk: Story = {
  ...Field,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertField(canvasElement, INK),
}

// ── toggle ─────────────────────────────────────────────────────────────────────

async function assertToggle(root: HTMLElement, p: Palette) {
  const track = (state: PondControlState) =>
    cell(root, 'toggle', state).querySelector<HTMLElement>('[role="switch"]')!
  const knob = (state: PondControlState) =>
    cell(root, 'toggle', state).querySelector<HTMLElement>('[data-part="knob"]')!
  for (const state of POND_CONTROL_STATES) {
    const row = getComputedStyle(cell(root, 'toggle', state))
    await expect(row.display).toBe('inline-flex')
    await expect(row.columnGap).toBe('10px')
    await expect(row.fontSize).toBe('13.5px')
    await expect(row.color).toBe(p.ink)
    await expect(px(row.minHeight)).toBe(24)
    const t = getComputedStyle(track(state))
    await expect(px(t.width)).toBe(30)
    await expect(px(t.height)).toBe(18)
    await expect(t.borderRadius).toBe('9999px')
    await expect(t.position).toBe('relative')
    const k = getComputedStyle(knob(state))
    await expect(k.position).toBe('absolute')
    await expect(k.top).toBe('2px')
    await expect(px(k.width)).toBe(14)
    await expect(px(k.height)).toBe(14)
    await expect(k.borderRadius).toBe('9999px')
    await expect(shadowLayers(k.boxShadow)).toEqual(['rgba(0, 0, 0, 0.18) 0px 1px 2px'])
  }
  // rest / hover — ink .2 / .28 track, card knob at left 2.
  await expect(alphaOf(getComputedStyle(track('rest')).backgroundColor)).toBeCloseTo(0.2, 2)
  await expect(alphaOf(getComputedStyle(track('hover')).backgroundColor)).toBeCloseTo(0.28, 2)
  await expect(getComputedStyle(knob('rest')).left).toBe('2px')
  await expect(getComputedStyle(knob('rest')).backgroundColor).toBe(p.card)
  // selected — full-ink track, knob slides to 14 and takes the inverse.
  await expect(track('selected').getAttribute('aria-checked')).toBe('true')
  await expect(getComputedStyle(track('selected')).backgroundColor).toBe(p.ink)
  await expect(getComputedStyle(knob('selected')).left).toBe('14px')
  await expect(getComputedStyle(knob('selected')).backgroundColor).toBe(p.inverse)
  await assertFocusRing(track('focus'))
  await expect(getComputedStyle(cell(root, 'toggle', 'disabled')).opacity).toBe('0.4')
  await expect(getComputedStyle(cell(root, 'toggle', 'disabled')).pointerEvents).toBe('none')
}

export const Toggle: Story = {
  render: () => (
    <div className="p-mn-4">
      <States kind="toggle" />
    </div>
  ),
  play: async ({ canvasElement }) => assertToggle(canvasElement, PAPER),
}

export const ToggleInk: Story = {
  ...Toggle,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertToggle(canvasElement, INK),
}

// ── checkbox ───────────────────────────────────────────────────────────────────

async function assertCheckbox(root: HTMLElement, p: Palette) {
  const box = (state: PondControlState) =>
    cell(root, 'checkbox', state).querySelector<HTMLElement>('[role="checkbox"]')!
  for (const state of POND_CONTROL_STATES) {
    const row = getComputedStyle(cell(root, 'checkbox', state))
    await expect(row.columnGap).toBe('10px')
    await expect(row.fontSize).toBe('13.5px')
    await expect(px(row.minHeight)).toBe(24)
    const b = getComputedStyle(box(state))
    await expect(b.display).toBe('flex')
    await expect(px(b.width)).toBe(14)
    await expect(px(b.height)).toBe(14)
    await expect(b.borderRadius).toBe('4px')
    await expect(b.color).toBe(p.inverse)
  }
  // rest — transparent with the 1.4px inset at ink .68, no tick.
  const rest = getComputedStyle(box('rest'))
  await expect(rest.backgroundColor).toBe(TRANSPARENT)
  const ring = shadowLayers(rest.boxShadow)
  await expect(ring).toHaveLength(1)
  await expect(ring[0]).toContain('0px 0px 0px 1.4px inset')
  await expect(alphaOf(ring[0].split(') ')[0] + ')')).toBeCloseTo(0.68, 2)
  await expect(box('rest').querySelector('svg')).toBeNull()
  await expect(alphaOf(getComputedStyle(box('hover')).backgroundColor)).toBeCloseTo(0.07, 2)
  // selected — full ink, no inset, the 9×9 tick in the inverse.
  await expect(box('selected').getAttribute('aria-checked')).toBe('true')
  const sel = getComputedStyle(box('selected'))
  await expect(sel.backgroundColor).toBe(p.ink)
  await expect(shadowLayers(sel.boxShadow)).toEqual([])
  const tick = box('selected').querySelector('svg')!
  await expect(tick.getAttribute('width')).toBe('9')
  await expect(getComputedStyle(tick).stroke).toBe(p.inverse)
  await assertFocusRing(box('focus'))
  await expect(getComputedStyle(cell(root, 'checkbox', 'disabled')).opacity).toBe('0.4')
}

export const Checkbox: Story = {
  render: () => (
    <div className="p-mn-4">
      <States kind="checkbox" />
    </div>
  ),
  play: async ({ canvasElement }) => assertCheckbox(canvasElement, PAPER),
}

export const CheckboxInk: Story = {
  ...Checkbox,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertCheckbox(canvasElement, INK),
}

// ── menu ───────────────────────────────────────────────────────────────────────

async function assertMenu(root: HTMLElement, p: Palette) {
  const row = (state: PondControlState) => cell(root, 'menu', state)
  /** The two cells off the state axis: the bare row, and the keyboard-highlighted one. */
  const extra = (name: 'bare' | 'highlighted') =>
    root.querySelector<HTMLElement>(`[data-cell="menu/${name}"] [data-kind="menu"]`)!
  for (const state of POND_CONTROL_STATES) {
    const cs = getComputedStyle(row(state))
    await expect(cs.display).toBe('flex')
    await expect(px(cs.width)).toBe(320)
    await expect(px(cs.minHeight)).toBe(30)
    await expect(cs.paddingLeft).toBe('10px')
    await expect(cs.paddingRight).toBe('10px')
    await expect(cs.borderRadius).toBe('10px')
    await expect(cs.columnGap).toBe('10px')
    await expect(cs.fontFamily).toContain('PP Neue Montreal Mono')
    await expect(cs.fontSize).toBe('12px')
    await expect(cs.color).toBe(p.ink)
    const hint = row(state).querySelector<HTMLElement>('[data-part="hint"]')!
    await expect(getComputedStyle(hint).fontSize).toBe('10.5px')
    await expect(alphaOf(getComputedStyle(hint).color)).toBeCloseTo(0.68, 2)
    await expect(getComputedStyle(hint).whiteSpace).toBe('nowrap')
  }
  await expect(getComputedStyle(row('rest')).backgroundColor).toBe(TRANSPARENT)
  await expect(row('rest').querySelector('[data-part="enter"]')).toBeNull()
  await expect(alphaOf(getComputedStyle(row('hover')).backgroundColor)).toBeCloseTo(0.05, 2)
  await expect(alphaOf(getComputedStyle(row('selected')).backgroundColor)).toBeCloseTo(0.07, 2)
  const enter = row('selected').querySelector<HTMLElement>('[data-part="enter"]')!
  await expect(enter.textContent).toBe('↵')
  await expect(getComputedStyle(enter).fontSize).toBe('10px')
  await expect(alphaOf(getComputedStyle(enter).color)).toBeCloseTo(0.8, 2)
  await assertFocusRing(row('focus'))
  await expect(getComputedStyle(row('disabled')).opacity).toBe('0.4')
  await expect(getComputedStyle(row('disabled')).pointerEvents).toBe('none')
  // The board draws a hint and the ↵ only when it is given one (`hasHint` / `on`):
  // a bare row is label and nothing else.
  await expect(extra('bare').querySelector('[data-part="hint"]')).toBeNull()
  await expect(extra('bare').querySelector('[data-part="enter"]')).toBeNull()
  await expect(extra('bare').querySelector('[data-part="label"]')!.textContent).toBe('keep page')
  // `data-highlighted` is how a base-ui Menu.Item marks the row the keyboard is on;
  // it must land on the board's hover ground, or arrowing through a menu shows nothing.
  await expect(alphaOf(getComputedStyle(extra('highlighted')).backgroundColor)).toBeCloseTo(0.05, 2)
}

export const Menu: Story = {
  render: () => (
    <div className="flex items-start gap-mn-6 p-mn-4">
      <States kind="menu" />
      <div role="menu" className="flex flex-col items-start gap-mn-2">
        <div data-cell="menu/bare">
          <PondControl kind="menu" />
        </div>
        <div data-cell="menu/highlighted">
          <PondControl kind="menu" hint="page" data-highlighted="" />
        </div>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => assertMenu(canvasElement, PAPER),
}

export const MenuInk: Story = {
  ...Menu,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertMenu(canvasElement, INK),
}

// ── mobile — the board's `mob` axis ────────────────────────────────────────────

export const Mobile: Story = {
  render: () => <MatrixGrid size="mobile" />,
  play: async ({ canvasElement }) => {
    const root = canvasElement
    // button h44 · px20 · 14
    const b = getComputedStyle(cell(root, 'button', 'rest', 'primary'))
    await expect(px(b.height)).toBe(44)
    await expect(b.paddingLeft).toBe('20px')
    await expect(b.fontSize).toBe('14px')
    // field 280 × 48 · 15, caret 17
    const f = getComputedStyle(cell(root, 'field', 'rest').querySelector('[data-part="field"]')!)
    await expect(px(f.width)).toBe(280)
    await expect(px(f.height)).toBe(48)
    await expect(f.fontSize).toBe('15px')
    await expect(
      getComputedStyle(cell(root, 'field', 'editing').querySelector('[data-part="caret"]')!).height
    ).toBe('17px')
    // toggle 38 × 22, knob 18 → left 18 when on; row min-h 44 at 15
    const t = getComputedStyle(cell(root, 'toggle', 'rest').querySelector('[role="switch"]')!)
    await expect(px(t.width)).toBe(38)
    await expect(px(t.height)).toBe(22)
    await expect(
      px(getComputedStyle(cell(root, 'toggle', 'rest').querySelector('[data-part="knob"]')!).width)
    ).toBe(18)
    await expect(
      getComputedStyle(cell(root, 'toggle', 'selected').querySelector('[data-part="knob"]')!).left
    ).toBe('18px')
    const row = getComputedStyle(cell(root, 'toggle', 'rest'))
    await expect(px(row.minHeight)).toBe(44)
    await expect(row.fontSize).toBe('15px')
    // checkbox 20
    await expect(
      px(getComputedStyle(cell(root, 'checkbox', 'rest').querySelector('[role="checkbox"]')!).width)
    ).toBe(20)
    // menu min-h 44 at 14
    const m = getComputedStyle(cell(root, 'menu', 'rest'))
    await expect(px(m.minHeight)).toBe(44)
    await expect(m.fontSize).toBe('14px')
  },
}

// ── Live — the primitives under the skin really work ───────────────────────────

export const Live: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-3 p-mn-4">
      <PondControl kind="toggle" label="zen" />
      <PondControl kind="checkbox" label="done" />
      <PondControl kind="field" />
      <PondControl kind="button" variant="secondary" label="move it" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sw = canvas.getByRole('switch')
    await userEvent.click(sw)
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await expect(getComputedStyle(sw).backgroundColor).toBe(PAPER.ink)
    await userEvent.click(canvas.getByText('zen'))
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    const cb = canvas.getByRole('checkbox')
    await userEvent.click(cb)
    await expect(cb).toHaveAttribute('aria-checked', 'true')
    await expect(cb.querySelector('svg')).not.toBeNull()
    const input = canvas.getByRole('textbox')
    await userEvent.type(input, 'hi@make-noise')
    await expect(input).toHaveValue('hi@make-noise')
    await expect(getComputedStyle(input).color).toBe(PAPER.ink)
    // Keyboard focus wears the mist ring on the field card.
    await assertFocusRing(input.parentElement!)
  },
}

// ── Controlled — the host owns the value ───────────────────────────────────────

/** The two kinds a product call site drives from its own state: `value` +
 *  `onValueChange` on the field (with a plain, non-error hint), and `on` +
 *  `onCheckedChange` on the toggle. */
function Controlled_() {
  const [email, setEmail] = useState('hi')
  const [zen, setZen] = useState(false)
  return (
    <div className="flex flex-col items-start gap-mn-3 p-mn-4">
      <div data-cell="field/controlled">
        <PondControl kind="field" value={email} onValueChange={setEmail} hint="we’ll send a code" />
      </div>
      <div data-cell="toggle/controlled">
        <PondControl kind="toggle" label="zen" on={zen} onCheckedChange={setZen} />
      </div>
    </div>
  )
}

export const Controlled: Story = {
  render: () => <Controlled_ />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The field shows what the host holds, and every keystroke is handed back.
    const input = canvas.getByRole('textbox')
    await expect(input).toHaveValue('hi')
    await userEvent.type(input, '@make-noise')
    await expect(input).toHaveValue('hi@make-noise')
    // A hint given outside `error` is the board's description, not its error: same
    // mono 10.5 at ink .8, and the control stays valid.
    await expect(input).not.toHaveAttribute('aria-invalid')
    const hint = canvasElement.querySelector<HTMLElement>('[data-part="hint"]')!
    const hs = getComputedStyle(hint)
    await expect(hint.textContent).toBe('we’ll send a code')
    await expect(hs.fontFamily).toContain('PP Neue Montreal Mono')
    await expect(hs.fontSize).toBe('10.5px')
    await expect(alphaOf(hs.color)).toBeCloseTo(0.8, 2)
    // `on` is whatever the host says; a click asks for the next value and the
    // board's selected track + knob at 14 follow from the host's answer.
    const sw = canvas.getByRole('switch')
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(sw)
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await expect(getComputedStyle(sw).backgroundColor).toBe(PAPER.ink)
    await expect(getComputedStyle(sw.querySelector<HTMLElement>('[data-part="knob"]')!).left).toBe(
      '14px'
    )
  },
}
