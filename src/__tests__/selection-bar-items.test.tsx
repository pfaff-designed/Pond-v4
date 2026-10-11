/**
 * KAN-95 — the selection bar's ten items, board order (`Pond 02 Component
 * library.dc.html` frame `2t`, the `selection bar` card, AUDIT C6).
 */

import fs from 'fs'
import path from 'path'
import { render, screen } from '@testing-library/react'
import { SelectionBar, SELECTION_BAR_ITEMS } from '@/components/molecules/SelectionBar'
import { clearSelection, selectText } from './helpers/selection'

/** The bar only portals once a real selection is up — give it one before each render assertion. */
const renderWithSelection = () => {
  const result = render(
    <>
      <SelectionBar onAsk={jest.fn()} />
      <p>select me</p>
    </>
  )
  selectText(screen.getByText('select me'))
  return result
}

const board = fs.readFileSync(
  path.join(process.cwd(), 'wayfinder/design_handoff_pond/Pond 02 Component library.dc.html'),
  'utf8'
)
// The `2t` card's own box: from its screen label to the next card ("the pill").
const cardStart = board.indexOf('data-screen-label="2t writing and together"')
const card = board.slice(cardStart, board.indexOf('>the pill<', cardStart))

// One distinctive, byte-identical fragment per item, in the board's own order.
const BOARD_FRAGMENTS = [
  'font-size:12.5px">text</span>',
  'font-size:14px;font-weight:700">B</span>',
  'font-style:italic;font-size:17px">I</span>',
  'M6 8a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.6.6M8 6a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 6 11.5l.6-.6',
  'M5.5 3.5h6M5.5 7h6M5.5 10.5h6',
  'M8.5 2.5l3 3-5 5H3.5v-3z',
  'M2.5 3h7v4.6h-3.6L3.8 9.4V7.6H2.5z',
  'font-size:11.5px">ask pond</span>',
  'font-size:11.5px">new page from this</span>',
  'rect x="4.5" y="4.5" width="7" height="7" rx="1.2"',
]

describe('the board draws the ten items in this order (2t)', () => {
  it('each item’s own fragment is on the card, in this order', () => {
    const positions = BOARD_FRAGMENTS.map((fragment) => card.indexOf(fragment))
    expect(positions.every((position) => position !== -1)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('SELECTION_BAR_ITEMS carries the same ten ids in the same order', () => {
    expect(SELECTION_BAR_ITEMS.map((item) => item.id)).toEqual([
      'text-style',
      'bold',
      'italic',
      'link',
      'list',
      'highlight',
      'comment',
      'ask-pond',
      'new-page-from-this',
      'copy',
    ])
  })

  it('two dividers short of three groups would be wrong — the board draws exactly three', () => {
    const dividerCount = SELECTION_BAR_ITEMS.filter((item) => item.dividerAfter).length
    expect(dividerCount).toBe(3)
  })
})

describe('SelectionBar renders the ten items in order', () => {
  afterEach(() => clearSelection())

  it('buttons appear in board order, by accessible name', () => {
    renderWithSelection()
    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent)
    expect(names).toEqual([
      'text',
      'bold',
      'italic',
      'link',
      'list',
      'highlight',
      'comment',
      'ask pond',
      'new page from this',
      'copy',
    ])
  })

  it('the two type registers stay apart: text/highlight/comment sans 12.5px, ask pond/new page from this mono 11.5px', () => {
    renderWithSelection()
    const sans = ['text', 'highlight', 'comment']
    const mono = ['ask pond', 'new page from this']

    for (const label of sans) {
      const span = screen.getByText(label)
      expect(span.className).toContain('text-[12.5px]')
      expect(span.className).not.toContain('font-mono')
    }
    for (const label of mono) {
      const span = screen.getByText(label)
      expect(span.className).toContain('font-mono')
      expect(span.className).toContain('text-[11.5px]')
    }
  })
})
