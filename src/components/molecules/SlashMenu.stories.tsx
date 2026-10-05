import { useMemo, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { SlashMenu, type SlashMenuProps } from './SlashMenu'
import type { PickerAnchorBox } from './use-anchored-box'
import { slashRows } from '@/lib/modules/palette'
import { ICON } from './slash-entries'
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
  // `.mn-glass`, dark — the Shell's dark frames. The picker board's own ink delta
  // reads `.09`; ADR 0004 ruling 11 keeps the one shared recipe for the whole
  // floating-glass family (the composed context outranks the component card).
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
  Partial<Pick<SlashMenuProps, 'rows' | 'onSelect' | 'onClose'>> & {
    ink?: boolean
    /** Anchor the glass this far from the viewport's right edge instead of at the field. */
    anchorFromRight?: number
  }

/** A field to type into, and a themed box the glass portals into. */
function Frame({
  ink,
  anchorFromRight,
  rows = slashRows,
  onSelect = fn(),
  onClose = fn(),
  ...props
}: FrameProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const anchor = useRef<HTMLTextAreaElement>(null)
  const edgeAnchor = useMemo<PickerAnchorBox | null>(
    () =>
      anchorFromRight === undefined
        ? null
        : {
            getBoundingClientRect: () => ({
              top: 40,
              bottom: 60,
              left: window.innerWidth - anchorFromRight,
            }),
          },
    [anchorFromRight]
  )
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
          anchor={edgeAnchor ?? anchor}
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
  // `∕` (U+2215), not `/`: a slash in a title is Storybook's path separator.
  title: 'Organisms/pickers/2c · ∕ menu',
  component: Frame,
  parameters: { layout: 'centered' },
  args: { query: '' },
} satisfies Meta<typeof Frame>

export default meta
type Story = StoryObj<typeof meta>

// ── Assertions ─────────────────────────────────────────────────────────────────

const glassOf = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-part="glass"]')!

/** `glass` · `footStyle` · `groupStyle` · row · `iconWrap` · `hint` · `enter` — every state shares these. */
async function assertChrome(root: HTMLElement, p: Palette, mobile = false) {
  const glass = glassOf(root)
  const g = getComputedStyle(glass)
  await expect(px(g.width)).toBe(mobile ? 340 : 300)
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
  // Below its field (`side="bottom"`, the default) the glass grows from its TOP
  // edge — `.motion-menu`'s fallback origin. `side="top"` flips it (ComposerCommands).
  await expect(g.transformOrigin).toBe('0px 0px')

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
    await expect(s.padding).toBe(mobile ? '11px 10px' : '7px 10px')
    await expect(s.borderTopLeftRadius).toBe('10px')
    await expect(s.fontFamily).toMatch(MONO)
    await expect(px(s.fontSize)).toBe(mobile ? 14 : 12.5)
    await expect(px(s.letterSpacing)).toBeCloseTo(mobile ? 0.14 : 0.125, 3)
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

  // Every string the glass draws is lowercase, in EVERY state — Pond's own words,
  // never build vocabulary. (Which words they may be is the glossary's business and
  // stays a node test: it reads the handoff.)
  await expect(glass.textContent).not.toMatch(/[A-Z]/)

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

async function assertOpen(root: HTMLElement, p: Palette, mobile = false) {
  await assertChrome(root, p, mobile)
  const glass = glassOf(root)
  await expect(glass.querySelector('input')).toBeNull()
  await expect(glass.querySelector('[data-part="head"]')).toBeNull()
  await expect(
    [...glass.querySelectorAll('[data-part="group"]')].map((g) => g.textContent)
  ).toEqual(mobile ? ['text', 'blocks'] : ['text', 'blocks', 'templates', 'pages'])
  // Mobile: the first 12 entries, the group heads counted — so 10 rows, to `big number`.
  await expect(glass.querySelectorAll('[data-part="group"], [role="option"]')).toHaveLength(
    mobile ? 12 : slashRows.length + 4
  )
  await expect(labels(root)).toEqual(
    (mobile ? slashRows.slice(0, 10) : slashRows).map((r) => r.label)
  )
  await expect(glass.querySelector('[data-part="foot"]')!.textContent).toBe(
    '↑↓ move↵ insertesc keep as text'
  )
  // Every string on the surface is lowercase — Pond's words, no build vocabulary.
  await expect(glass.textContent).not.toMatch(/[A-Z]/)
}

/** The board's base: three groups, `text` selected, the foot legend. Light. */
export const Open: Story = {
  name: 'open',
  play: async ({ canvasElement }) => assertOpen(canvasElement, PAPER),
}

/** The same frame on the dark ground — ink flips, the glass follows the Shell's dark recipe. */
export const OpenInk: Story = {
  name: 'open · ink',
  args: { ink: true },
  play: async ({ canvasElement }) => assertOpen(canvasElement, INK),
}

export const OpenMobile: Story = {
  name: 'open · mobile',
  args: { size: 'mobile' },
  play: async ({ canvasElement }) => assertOpen(canvasElement, PAPER, true),
}

/**
 * A caret near the right edge of a narrow viewport (587px-wide: caret at 267, glass
 * 340 → right edge 607): the glass slides left and stays 12px inside the viewport.
 */
export const OpenMobileNearRightEdge: Story = {
  tags: ['!dev'],
  args: { size: 'mobile', anchorFromRight: 80 },
  play: async ({ canvasElement }) => {
    // The glass animates in, so its rect is mid-scale; its `left` is the placement.
    const left = px(getComputedStyle(glassOf(canvasElement)).left)
    await expect(left).toBe(window.innerWidth - 12 - 340)
  },
}

// ── filtered ───────────────────────────────────────────────────────────────────

async function assertFiltered(root: HTMLElement, p: Palette, mobile = false) {
  await assertChrome(root, p, mobile)
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
  // `/ta` is the table and, through its alias, the entry log — and nothing else.
  await expect(labels(root)).toEqual(['table', 'entry log'])
  const log = glass.querySelectorAll<HTMLElement>('[role="option"]')[1]
  await expect(log.querySelector('[data-part="hit"]')!.textContent).toBe('')
  await expect(log.querySelector('[data-part="hint"]')!.textContent).toBe('dated table')
  await expect(glass.querySelector('[data-part="foot"]')!.textContent).toBe('/ ta — 2 matches')
}

/** `/ta` typed on the page: the hit underlined, the groups gone, the count in the foot. */
export const Filtered: Story = {
  name: 'filtered',
  args: { query: 'ta' },
  play: async ({ canvasElement }) => assertFiltered(canvasElement, PAPER),
}

export const FilteredMobile: Story = {
  name: 'filtered · mobile',
  args: { query: 'ta', size: 'mobile' },
  play: async ({ canvasElement }) => assertFiltered(canvasElement, PAPER, true),
}

export const FilteredInk: Story = {
  name: 'filtered · ink',
  args: { query: 'ta', ink: true },
  play: async ({ canvasElement }) => assertFiltered(canvasElement, INK),
}

// ── empty ──────────────────────────────────────────────────────────────────────

async function assertEmpty(root: HTMLElement, p: Palette, mobile = false) {
  await assertChrome(root, p, mobile)
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
  await expect(px(s.fontSize)).toBe(mobile ? 13 : 12)
  await expect(px(s.lineHeight)).toBeCloseTo(mobile ? 20.15 : 18.6, 1)
  await expect(s.color).toBe(p.tier80)
}

/** `/zz`: the note, in the board's words, and no foot. */
export const Empty: Story = {
  name: 'empty',
  args: { query: 'zz' },
  play: async ({ canvasElement }) => assertEmpty(canvasElement, PAPER),
}

export const EmptyMobile: Story = {
  name: 'empty · mobile',
  args: { query: 'zz', size: 'mobile' },
  play: async ({ canvasElement }) => assertEmpty(canvasElement, PAPER, true),
}

export const EmptyInk: Story = {
  name: 'empty · ink',
  args: { query: 'zz', ink: true },
  play: async ({ canvasElement }) => assertEmpty(canvasElement, INK),
}

// ── templates ──────────────────────────────────────────────────────────────────

const YOURS = [{ id: 't1', name: 'weeknight recipe', hint: 'from chickpeas…' }]

async function assertTemplates(root: HTMLElement, p: Palette, mobile = false) {
  await assertChrome(root, p, mobile)
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
  await expect(px(h.fontSize)).toBe(mobile ? 13 : 12)
  await expect(getComputedStyle(head.querySelector('[data-part="head-text"]')!).color).toBe(p.ink)
  await expect(
    [...glass.querySelectorAll('[data-part="group"]')].map((g) => g.textContent)
  ).toEqual(['premade', 'yours'])
  // Mobile: 8 premade shapes, then `yours`.
  await expect(labels(root)).toEqual([
    ...TEMPLATE_KINDS.slice(0, mobile ? 8 : TEMPLATE_KINDS.length),
    'weeknight recipe',
  ])
  await expect(glass.querySelector('[data-part="foot"]')!.textContent).toBe(
    '↵ new nested page→ preview'
  )
}

/** The submenu: head, the twelve premade shapes (#261), `yours`, and its own foot. */
export const Templates: Story = {
  name: 'templates',
  args: { defaultPane: 'templates', yourTemplates: YOURS, onPreviewTemplate: fn() },
  play: async ({ canvasElement }) => assertTemplates(canvasElement, PAPER),
}

export const TemplatesMobile: Story = {
  name: 'templates · mobile',
  args: { defaultPane: 'templates', yourTemplates: YOURS, onPreviewTemplate: fn(), size: 'mobile' },
  play: async ({ canvasElement }) => assertTemplates(canvasElement, PAPER, true),
}

export const TemplatesInk: Story = {
  name: 'templates · ink',
  args: { defaultPane: 'templates', yourTemplates: YOURS, onPreviewTemplate: fn(), ink: true },
  play: async ({ canvasElement }) => assertTemplates(canvasElement, INK),
}

// ── the keys ───────────────────────────────────────────────────────────────────

/** From the field: ↓↓ then ↵ inserts the third row; esc only closes and keeps the text. */
export const Keys: Story = {
  tags: ['!dev'],
  args: { onSelect: fn(), onClose: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const field = canvas.getByLabelText('page')
    field.focus()
    // Two rows down from `text` — `heading` then `highlight`, the board's order
    // since #281 gave `heading` its factory.
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'highlight' }))
    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).toHaveBeenCalled()
    await expect((field as HTMLTextAreaElement).value).toBe('/')
  },
}

// ── the pointer ────────────────────────────────────────────────────────────────

/**
 * Hovering a row moves the selection to it, and the selection is what swaps the
 * board's key hint for `↵` (`PondPicker`'s rows carry `hasHint:true, hint:"[]"`
 * unselected and `hasHint:false` selected). The ink-.07 ground moves with it —
 * one selection, one wash — and a click on the hovered row inserts it.
 */
export const Hovered: Story = {
  tags: ['!dev'],
  args: { onSelect: fn() },
  play: async ({ canvasElement, args }) => {
    const glass = glassOf(canvasElement)
    const rows = [...glass.querySelectorAll<HTMLElement>('[role="option"]')]
    const text = rows[0]
    const checklist = rows.find(
      (r) => r.querySelector('[data-part="label"]')!.textContent === 'checklist'
    )!

    // At rest: `checklist` wears the board's key hint and no ↵.
    await expect(checklist.querySelector('[data-part="hint"]')!.textContent).toBe('[]')
    await expect(checklist.querySelector('[data-part="enter"]')).toBeNull()

    await userEvent.hover(checklist)
    await expect(checklist.getAttribute('aria-selected')).toBe('true')
    await expect(checklist.querySelector('[data-part="hint"]')).toBeNull()
    await expect(checklist.querySelector('[data-part="enter"]')!.textContent).toBe('↵')
    await expect(alphaOf(getComputedStyle(checklist).backgroundColor)).toBeCloseTo(0.07, 2)
    // …and `text`, which had it on open, gives both up.
    await expect(text.getAttribute('aria-selected')).toBe('false')
    await expect(alphaOf(getComputedStyle(text).backgroundColor)).toBeCloseTo(0, 2)
    await expect(text.querySelector('[data-part="enter"]')).toBeNull()

    await userEvent.click(checklist)
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'checklist' }))
  },
}

// ── the edges of the walk, and the swallow ─────────────────────────────────────

const selectedLabel = (root: HTMLElement) =>
  glassOf(root).querySelector('[aria-selected="true"] [data-part="label"]')!.textContent

/**
 * ↑ on the first row and ↓ on the last stay put rather than wrapping, and a ↵ that
 * will insert is swallowed in the capture phase — otherwise the field takes the
 * newline too and the block arrives with a blank line under it, which nothing on
 * screen would show.
 */
export const KeyEdges: Story = {
  tags: ['!dev'],
  args: { onSelect: fn() },
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByLabelText('page')
    field.focus()

    await userEvent.keyboard('{ArrowUp}')
    await expect(selectedLabel(canvasElement)).toBe('text')

    // The menu listens in the capture phase, so neither the walk nor the insert
    // reaches the field underneath.
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter']) {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      field.dispatchEvent(e)
      await expect(e.defaultPrevented).toBe(true)
    }

    await userEvent.keyboard('{ArrowDown>30/}')
    await expect(selectedLabel(canvasElement)).toBe('nested page')
  },
}

/**
 * The one ↵ the menu does NOT take: with nothing to insert the key is the field's,
 * so `/zz` followed by ↵ reaches the page and keeps the typed text as text.
 */
export const EmptyKeepsEnter: Story = {
  tags: ['!dev'],
  args: { query: 'zz', onSelect: fn() },
  play: async ({ canvasElement, args }) => {
    const field = within(canvasElement).getByLabelText('page')
    field.focus()
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    field.dispatchEvent(enter)
    await expect(enter.defaultPrevented).toBe(false)
    await expect(args.onSelect).not.toHaveBeenCalled()
  },
}

// ── walking into the templates pane and back ───────────────────────────────────

/**
 * `page from template` opens a pane rather than inserting: ↵ on it draws the head
 * and does NOT insert a block, ← steps back to the blocks, → opens it too, and ↵ on
 * a premade shape picks that kind.
 */
export const TemplatesNav: Story = {
  tags: ['!dev'],
  args: { onSelect: fn(), onPickTemplate: fn() },
  play: async ({ canvasElement, args }) => {
    const glass = glassOf(canvasElement)
    const tpl = () =>
      [...glass.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (r) => r.querySelector('[data-part="label"]')!.textContent === 'page from template'
      )!
    const head = () => glass.querySelector('[data-part="head"]')

    await userEvent.hover(tpl())
    await userEvent.keyboard('{Enter}')
    // The row opens the pane; nothing is inserted on the page.
    await expect(args.onSelect).not.toHaveBeenCalled()
    await expect(head()!.textContent).toBe('page from template')
    await expect(glass.querySelector('[role="listbox"]')!.getAttribute('aria-label')).toBe(
      'page from template'
    )
    await expect(labels(canvasElement)).toEqual([...TEMPLATE_KINDS])
    await expect(selectedLabel(canvasElement)).toBe(TEMPLATE_KINDS[0])
    // No `onPreviewTemplate` here, so the foot offers only the one key.
    await expect(glass.querySelector('[data-part="foot"]')!.textContent).toBe('↵ new nested page')

    // ← steps back to the blocks. The selection returns to the row it came from,
    // because nothing moved inside the pane.
    await userEvent.keyboard('{ArrowLeft}')
    await expect(head()).toBeNull()
    await expect(labels(canvasElement)).toEqual(slashRows.map((r) => r.label))
    await expect(selectedLabel(canvasElement)).toBe('page from template')

    // → opens it as well, and ↵ down the list picks that premade shape.
    await userEvent.hover(tpl())
    await userEvent.keyboard('{ArrowRight}')
    await expect(head()).not.toBeNull()
    await userEvent.keyboard('{ArrowDown>3/}{Enter}')
    await expect(args.onPickTemplate).toHaveBeenCalledWith({
      origin: 'premade',
      kind: TEMPLATE_KINDS[3],
    })
  },
}

// ── an empty page, and the person's own templates ──────────────────────────────

/**
 * On an empty page the menu opens on its templates (6f), `yours` after the
 * premade, with the person's own picked by id. Typing a block's name returns to
 * the blocks, so `/table` still finds the table.
 */
export const EmptyPage: Story = {
  tags: ['!dev'],
  args: {
    defaultPane: 'templates',
    yourTemplates: YOURS,
    onPickTemplate: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const glass = glassOf(canvasElement)
    await expect(glass.getAttribute('data-pane')).toBe('templates')
    await expect(
      [...glass.querySelectorAll('[data-part="group"]')].map((g) => g.textContent)
    ).toEqual(['premade', 'yours'])
    const mine = [...glass.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (r) => r.querySelector('[data-part="label"]')!.textContent === 'weeknight recipe'
    )!
    await userEvent.click(mine)
    await expect(args.onPickTemplate).toHaveBeenCalledWith({ origin: 'yours', id: 't1' })
  },
}

/** The `pages` group closes the open list: `page`, then `nested page`, each with the page mark. */
export const PagesGroup: Story = {
  tags: ['!dev'],
  play: async ({ canvasElement }) => {
    const glass = glassOf(canvasElement)
    const groups = [...glass.querySelectorAll('[data-part="group"]')]
    await expect(groups.at(-1)!.textContent).toBe('pages')
    await expect(labels(canvasElement).slice(-2)).toEqual(['page', 'nested page'])
    const page = [...glass.querySelectorAll<HTMLElement>('[role="option"]')].at(-2)!
    await expect(page.querySelector('svg path')!.getAttribute('d')).toBe(ICON.page.d)
    await expect(page.querySelector('[data-part="hint"]')).toBeNull()
  },
}

// ── the same menu in the composer ──────────────────────────────────────────────

/**
 * `AITerminal` draws this menu for the thread commands: the list takes the host's
 * own name (`commands`), and anchored ABOVE the field it grows from its bottom
 * edge instead of its top — the computed origin, not the class that sets it.
 *
 * The rows mirror `AITerminal`'s `CHAT_COMMANDS`; they are not imported because
 * that organism is not loadable from a story. Which ids those rows run is
 * `AITerminal`'s own wiring and stays a feature test.
 */
const COMPOSER_COMMANDS = [
  { id: 'clear', label: '/clear' },
  { id: 'handoff', label: '/handoff' },
  { id: 'save', label: '/save' },
]

export const ComposerCommands: Story = {
  tags: ['!dev'],
  args: { rows: COMPOSER_COMMANDS, side: 'top', label: 'commands', onSelect: fn() },
  play: async ({ canvasElement, args }) => {
    const glass = glassOf(canvasElement)
    await expect(glass.querySelector('[role="listbox"]')!.getAttribute('aria-label')).toBe(
      'commands'
    )
    await expect(labels(canvasElement)).toEqual(['/clear', '/handoff', '/save'])
    // No `key` on these rows, so no hint rides at rest.
    await expect(glass.querySelectorAll('[data-part="hint"]')).toHaveLength(0)

    // `[--motion-menu-origin:bottom_left]` — read off the box, not the class
    // string. `offsetHeight`, not the rect: the arrival keyframe scales the glass.
    await expect(getComputedStyle(glass).transformOrigin).toBe(`0px ${glass.offsetHeight}px`)

    const save = [...glass.querySelectorAll<HTMLElement>('[role="option"]')][2]
    await userEvent.click(save)
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'save' }))
  },
}

/**
 * A space typed when nothing matches closes the menu and is not swallowed — the
 * field keeps the space and everything before it as plain text, like esc.
 */
export const SpaceKeepsText: Story = {
  tags: ['!dev'],
  args: { query: 'zz', onClose: fn() },
  play: async ({ canvasElement, args }) => {
    const field = within(canvasElement).getByLabelText<HTMLTextAreaElement>('page')
    field.focus()
    field.setSelectionRange(field.value.length, field.value.length)
    await userEvent.keyboard(' ')
    await expect(args.onClose).toHaveBeenCalledTimes(1)
    await expect((field as HTMLTextAreaElement).value).toBe('/zz ')
  },
}
