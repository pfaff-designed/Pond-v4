import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { PondBlock, POND_BLOCK_KINDS, POND_BLOCK_WIDTHS, type PondBlockKind } from './PondBlock'
import { TableView } from '@/lib/modules/table/view'

/**
 * PondBlock (#237, 1/4) — the card frame, per-kind widths and the head row. The
 * play functions assert the COMPUTED values against the numbers read off
 * `PondBlock.dc.html` (its frames render under a transform, so the inline `style`
 * is the geometry source and computed styles the type/colour source):
 *
 *   block    padding 16px 18px · radius 20 · gap 12 · card · --mn-shadow-card
 *   W        list 400 · checklist 400 · table 500 · gallery 580 · number 400 · log 460 · properties 400
 *   eyebrow  10.5 / 500 / .1em / uppercase / ink .68 / PP Neue Montreal
 *   headMeta PP Neue Montreal Mono 10.5 / ink .68
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

/** Three quiet rows — enough body for the frame to wrap; the rows themselves are #238+. */
function Rows() {
  return (
    <div className="flex flex-col gap-0.5 text-[13.5px]">
      {['cabinet quote', 'renew insurance', 'standup'].map((t) => (
        <div key={t} className="flex items-center justify-between py-1">
          <span>{t}</span>
          <span className="font-mono text-[10.5px] text-mn-text-secondary">today</span>
        </div>
      ))}
    </div>
  )
}

function AllKinds() {
  return (
    <div className="flex min-w-[640px] flex-col items-start gap-mn-4">
      {POND_BLOCK_KINDS.map((kind) => (
        <PondBlock key={kind} kind={kind} heading={HEAD[kind][0]} headNote={HEAD[kind][1]}>
          <Rows />
        </PondBlock>
      ))}
    </div>
  )
}

const LIGHT = {
  card: 'rgb(250, 249, 239)',
  ink68: 'rgba(27, 29, 20, 0.68)',
  shadow: ['rgba(40, 34, 24, 0.04) 0px 1px 2px', 'rgba(40, 34, 24, 0.06) 0px 8px 24px'],
}
const DARK = {
  card: 'rgb(48, 49, 42)',
  ink68: 'rgba(250, 249, 239, 0.68)',
  shadow: ['rgba(0, 0, 0, 0.3) 0px 1px 2px', 'rgba(0, 0, 0, 0.34) 0px 8px 24px'],
}

/** Every card on the canvas measures to the board, in the given theme. */
async function assertFrames(canvasElement: HTMLElement, theme: typeof LIGHT) {
  for (const kind of POND_BLOCK_KINDS) {
    const card = canvasElement.querySelector<HTMLElement>(`[data-block-kind="${kind}"]`)!
    await expect(card).toBeTruthy()
    const cs = getComputedStyle(card)
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
    await expect(cs.backgroundColor).toBe(theme.card)
    for (const layer of theme.shadow) await expect(cs.boxShadow).toContain(layer)
    await expect(cs.borderTopWidth).toBe('0px')

    // The head row: eyebrow + headNote on one baseline row, 12 apart.
    const head = card.firstElementChild as HTMLElement
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
    const card = canvasElement.querySelector<HTMLElement>('[data-block-kind="table"]')!
    await expect(getComputedStyle(card).width).toBe('500px')
  },
}
