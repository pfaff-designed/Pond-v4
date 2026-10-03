import { useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { SlashMenu, type SlashMenuProps } from './SlashMenu'
import { slashRows } from '@/lib/modules/palette'
import { TEMPLATE_KINDS } from '@/lib/templates/types'

/**
 * The `/` menu — `PondPicker kind="slash"` (#278): its four states, both themes.
 * Every number asserted below is a literal from
 * `wayfinder/board-values.generated.json` (`.components.PondPicker`, the
 * `kind=slash|theme=paper` base and its `theme=ink` delta), read back off REAL
 * computed styles. The glass portals, so each frame hands the menu its own
 * themed `container` — the `.dark` class around that box is the whole theme.
 */

const PAPER = {
  ink: 'rgb(27, 29, 20)',
  tier80: 'rgba(27, 29, 20, 0.8)',
  tier68: 'rgba(27, 29, 20, 0.68)',
  // `.mn-glass`, light — byte-for-byte the board's `glass` recipe.
  glassBorder: 'rgba(255, 255, 255, 0.9)',
}
const INK = {
  ink: 'rgb(250, 249, 239)',
  tier80: 'rgba(250, 249, 239, 0.8)',
  tier68: 'rgba(250, 249, 239, 0.68)',
  // `.mn-glass`, dark — the Shell's dark frames (globals.css:462). The picker board's
  // own ink delta reads `.09`; ADR 0004's principle (the composed context outranks
  // the component card) keeps the one shared recipe. Recorded in #278's PR body.
  glassBorder: 'rgba(250, 249, 239, 0.2)',
}
type Palette = typeof PAPER

const MONO = /PP Neue Montreal Mono/
const px = (v: string) => parseFloat(v)

/** The alpha of a computed colour — `rgba(…, a)`, `color(srgb … / a)` or `oklab(… / a)`. */
function alphaOf(color: string): number {
  if (/^rgb\(/.test(color) && !color.includes('/')) return 1
  if (color === 'rgba(0, 0, 0, 0)') return 0
  const m = color.match(/(?:\/|,)\s*([\d.]+%?)\s*\)\s*$/)
  if (!m) return NaN
  return m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1])
}

// ── Frame ──────────────────────────────────────────────────────────────────────

type FrameProps = Omit<SlashMenuProps, 'anchor' | 'container' | 'rows' | 'onSelect' | 'onClose'> &
  Partial<Pick<SlashMenuProps, 'rows' | 'onSelect' | 'onClose'>> & { ink?: boolean }

/** A field to type into, and a themed box the glass portals into. */
function Frame({ ink, rows = slashRows, onSelect = fn(), onClose = fn(), ...props }: FrameProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const anchor = useRef<HTMLTextAreaElement>(null)
  return (
    <div
      ref={setContainer}
      data-theme={ink ? 'ink' : 'paper'}
      className={`${ink ? 'dark bg-raw-ink' : 'bg-raw-paper'} h-[560px] w-[420px] rounded-mn-inner p-mn-6`}
    >
      <textarea
        ref={anchor}
        aria-label="page"
        defaultValue={`/${props.query}`}
        className="w-full resize-none bg-transparent font-serif text-[16px] text-mn-text outline-none"
        rows={1}
      />
      {container && (
        <SlashMenu
          rows={rows}
          anchor={anchor}
          container={container}
          onSelect={onSelect}
          onClose={onClose}
          {...props}
        />
      )}
    </div>
  )
}

const meta = {
  title: 'Molecules/SlashMenu',
  component: Frame,
  parameters: { layout: 'centered' },
  args: { query: '' },
} satisfies Meta<typeof Frame>

export default meta
type Story = StoryObj<typeof meta>

// ── Assertions ─────────────────────────────────────────────────────────────────

const glassOf = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-part="glass"]')!

/** `glass` · `footStyle` · `groupStyle` · row · `iconWrap` · `hint` · `enter` — every state shares these. */
async function assertChrome(root: HTMLElement, p: Palette) {
  const glass = glassOf(root)
  const g = getComputedStyle(glass)
  await expect(px(g.width)).toBe(300)
  await expect(g.boxSizing).toBe('border-box')
  await expect(g.paddingTop).toBe('8px')
  await expect(g.paddingLeft).toBe('8px')
  await expect(g.borderTopLeftRadius).toBe('20px')
  await expect(g.display).toBe('flex')
  await expect(g.flexDirection).toBe('column')
  await expect(g.rowGap).toBe('1px')
  await expect(g.fontFamily).toMatch(MONO)
  await expect(g.color).toBe(p.ink)
  await expect(g.borderTopWidth).toBe('1px')
  await expect(g.borderTopColor).toBe(p.glassBorder)
  await expect(g.backgroundImage).toMatch(/linear-gradient\(160deg/)
  await expect(g.backdropFilter).toBe('blur(24px) saturate(1.3)')

  for (const group of glass.querySelectorAll<HTMLElement>('[data-part="group"]')) {
    const s = getComputedStyle(group)
    await expect(s.padding).toBe('8px 10px 5px')
    await expect(px(s.fontSize)).toBe(10.5)
    // `.04em` at 10.5px — ADR 0003's third amendment: never snapped, never uppercased.
    await expect(px(s.letterSpacing)).toBeCloseTo(0.42, 2)
    await expect(s.textTransform).toBe('none')
    await expect(s.color).toBe(p.tier68)
  }

  const rows = glass.querySelectorAll<HTMLElement>('[role="option"]')
  for (const row of rows) {
    const s = getComputedStyle(row)
    await expect(s.display).toBe('flex')
    await expect(s.alignItems).toBe('center')
    await expect(s.columnGap).toBe('10px')
    await expect(s.padding).toBe('7px 10px')
    await expect(s.borderTopLeftRadius).toBe('10px')
    await expect(s.fontFamily).toMatch(MONO)
    await expect(px(s.fontSize)).toBe(12.5)
    await expect(px(s.letterSpacing)).toBeCloseTo(0.125, 3)
    await expect(s.color).toBe(p.ink)
    const selected = row.getAttribute('aria-selected') === 'true'
    await expect(alphaOf(s.backgroundColor)).toBeCloseTo(selected ? 0.07 : 0, 2)
    const svg = row.querySelector('svg')!
    await expect(svg.getAttribute('width')).toBe('13')
    await expect(svg.getAttribute('height')).toBe('13')
    await expect(svg.getAttribute('stroke-width')).toBe('1.4')
    await expect(getComputedStyle(row.querySelector('[data-part="icon"]')!).color).toBe(p.tier80)
    const hint = row.querySelector<HTMLElement>('[data-part="hint"]')
    if (hint) {
      const h = getComputedStyle(hint)
      await expect(h.flex).toBe('0 1 auto')
      await expect(h.maxWidth).toBe('45%')
      await expect(px(h.fontSize)).toBe(10.5)
      await expect(h.color).toBe(p.tier68)
      await expect(h.whiteSpace).toBe('nowrap')
      await expect(h.textOverflow).toBe('ellipsis')
    }
  }
  const enter = glass.querySelector<HTMLElement>('[aria-selected="true"] [data-part="enter"]')
  if (enter) {
    const e = getComputedStyle(enter)
    await expect(px(e.fontSize)).toBe(10.5)
    await expect(e.color).toBe(p.tier80)
    await expect(e.fontFamily).toMatch(MONO)
  }

  const foot = glass.querySelector<HTMLElement>('[data-part="foot"]')
  if (foot) {
    const f = getComputedStyle(foot)
    await expect(f.display).toBe('flex')
    await expect(f.flexWrap).toBe('wrap')
    await expect(f.columnGap).toBe('14px')
    await expect(f.padding).toBe('9px 10px 4px')
    await expect(f.marginTop).toBe('4px')
    await expect(f.borderTopWidth).toBe('1px')
    await expect(alphaOf(f.borderTopColor)).toBeCloseTo(0.09, 2)
    await expect(px(f.fontSize)).toBe(10.5)
    await expect(f.color).toBe(p.tier68)
  }
}

const labels = (root: HTMLElement) =>
  [...glassOf(root).querySelectorAll('[role="option"] [data-part="label"]')].map(
    (l) => l.textContent
  )

// ── open ───────────────────────────────────────────────────────────────────────

async function assertOpen(root: HTMLElement, p: Palette) {
  await assertChrome(root, p)
  const glass = glassOf(root)
  await expect(glass.querySelector('input')).toBeNull()
  await expect(glass.querySelector('[data-part="head"]')).toBeNull()
  await expect(
    [...glass.querySelectorAll('[data-part="group"]')].map((g) => g.textContent)
  ).toEqual(['text', 'blocks', 'templates'])
  await expect(labels(root)).toEqual(slashRows.map((r) => r.label))
  await expect(glass.querySelector('[data-part="foot"]')!.textContent).toBe(
    '↑↓ move↵ insertesc keep as text'
  )
  // Every string on the surface is lowercase — Pond's words, no build vocabulary.
  await expect(glass.textContent).not.toMatch(/[A-Z]/)
}

/** The board's base: three groups, `text` selected, the foot legend. Light. */
export const Open: Story = {
  play: async ({ canvasElement }) => assertOpen(canvasElement, PAPER),
}

/** The same frame on the dark ground — ink flips, the glass follows the Shell's dark recipe. */
export const OpenInk: Story = {
  args: { ink: true },
  play: async ({ canvasElement }) => assertOpen(canvasElement, INK),
}

// ── filtered ───────────────────────────────────────────────────────────────────

async function assertFiltered(root: HTMLElement, p: Palette) {
  await assertChrome(root, p)
  const glass = glassOf(root)
  await expect(glass.querySelectorAll('[data-part="group"]')).toHaveLength(0)
  const table = glass.querySelector<HTMLElement>('[aria-selected="true"]')!
  await expect(table.querySelector('[data-part="label"]')!.textContent).toBe('table')
  await expect(table.querySelector('[data-part="pre"]')!.textContent).toBe('')
  await expect(table.querySelector('[data-part="hit"]')!.textContent).toBe('ta')
  await expect(table.querySelector('[data-part="post"]')!.textContent).toBe('ble')
  // `match`: underline · offset 3 · thickness 1 — a split, never a background wash.
  const hit = getComputedStyle(table.querySelector('[data-part="hit"]')!)
  await expect(hit.textDecorationLine).toBe('underline')
  await expect(hit.textUnderlineOffset).toBe('3px')
  await expect(hit.textDecorationThickness).toBe('1px')
  const n = glass.querySelectorAll('[role="option"]').length
  await expect(glass.querySelector('[data-part="foot"]')!.textContent).toBe(
    `/ ta — ${n} ${n === 1 ? 'match' : 'matches'}`
  )
}

/** `/ta` typed on the page: the hit underlined, the groups gone, the count in the foot. */
export const Filtered: Story = {
  args: { query: 'ta' },
  play: async ({ canvasElement }) => assertFiltered(canvasElement, PAPER),
}

export const FilteredInk: Story = {
  args: { query: 'ta', ink: true },
  play: async ({ canvasElement }) => assertFiltered(canvasElement, INK),
}

// ── empty ──────────────────────────────────────────────────────────────────────

async function assertEmpty(root: HTMLElement, p: Palette) {
  await assertChrome(root, p)
  const glass = glassOf(root)
  await expect(glass.querySelectorAll('[role="option"]')).toHaveLength(0)
  await expect(glass.querySelector('[data-part="foot"]')).toBeNull()
  const note = glass.querySelector<HTMLElement>('[data-part="note"]')!
  await expect(note.textContent).toBe(
    'nothing called “zz”. esc to keep it as text, or ask pond in the composer.'
  )
  const s = getComputedStyle(note)
  await expect(s.padding).toBe('10px')
  await expect(s.fontFamily).toMatch(MONO)
  await expect(px(s.fontSize)).toBe(12)
  await expect(px(s.lineHeight)).toBeCloseTo(18.6, 1)
  await expect(s.color).toBe(p.tier80)
}

/** `/zz`: the note, in the board's words, and no foot. */
export const Empty: Story = {
  args: { query: 'zz' },
  play: async ({ canvasElement }) => assertEmpty(canvasElement, PAPER),
}

export const EmptyInk: Story = {
  args: { query: 'zz', ink: true },
  play: async ({ canvasElement }) => assertEmpty(canvasElement, INK),
}

// ── templates ──────────────────────────────────────────────────────────────────

const YOURS = [{ id: 't1', name: 'weeknight recipe', hint: 'from chickpeas…' }]

async function assertTemplates(root: HTMLElement, p: Palette) {
  await assertChrome(root, p)
  const glass = glassOf(root)
  const head = glass.querySelector<HTMLElement>('[data-part="head"]')!
  await expect(head.textContent).toBe('page from template')
  const h = getComputedStyle(head)
  await expect(h.display).toBe('flex')
  await expect(h.alignItems).toBe('center')
  await expect(h.columnGap).toBe('10px')
  await expect(h.padding).toBe('8px 10px 10px')
  await expect(h.marginBottom).toBe('4px')
  await expect(h.borderBottomWidth).toBe('1px')
  await expect(alphaOf(h.borderBottomColor)).toBeCloseTo(0.09, 2)
  await expect(h.fontFamily).toMatch(MONO)
  await expect(px(h.fontSize)).toBe(12)
  await expect(getComputedStyle(head.querySelector('[data-part="head-text"]')!).color).toBe(p.ink)
  await expect(
    [...glass.querySelectorAll('[data-part="group"]')].map((g) => g.textContent)
  ).toEqual(['premade', 'yours'])
  await expect(labels(root)).toEqual([...TEMPLATE_KINDS, 'weeknight recipe'])
  await expect(glass.querySelector('[data-part="foot"]')!.textContent).toBe(
    '↵ new nested page→ preview'
  )
}

/** The submenu: head, the twelve premade shapes (#261), `yours`, and its own foot. */
export const Templates: Story = {
  args: { defaultPane: 'templates', yourTemplates: YOURS, onPreviewTemplate: fn() },
  play: async ({ canvasElement }) => assertTemplates(canvasElement, PAPER),
}

export const TemplatesInk: Story = {
  args: { defaultPane: 'templates', yourTemplates: YOURS, onPreviewTemplate: fn(), ink: true },
  play: async ({ canvasElement }) => assertTemplates(canvasElement, INK),
}

// ── the keys ───────────────────────────────────────────────────────────────────

/** From the field: ↓↓ then ↵ inserts the third row; esc only closes and keeps the text. */
export const Keys: Story = {
  args: { onSelect: fn(), onClose: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const field = canvas.getByLabelText('page')
    field.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'embed-file' }))
    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).toHaveBeenCalled()
    await expect((field as HTMLTextAreaElement).value).toBe('/')
  },
}
