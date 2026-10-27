import { render, screen } from '@testing-library/react'

import type { PaletteRowEntry } from './palette-row'
import { PaletteRow } from './palette-row'

const ITEM: PaletteRowEntry['item'] = {
  id: 'p1',
  label: 'electrician',
  kind: 'page',
}

const ENTRY: PaletteRowEntry = {
  kind: 'row',
  item: ITEM,
  runs: [{ text: 'electrician', hit: false }],
  sub: 'second fix soon',
}

describe('PaletteRow — sub slot', () => {
  it('renders a plain sub string when no subRuns are given', () => {
    render(<PaletteRow id="r1" entry={ENTRY} selected={false} onHover={jest.fn()} onPick={jest.fn()} />)

    const sub = screen.getByText('second fix soon')
    expect(sub.closest('[data-part="sub"]')).not.toBeNull()
    expect(sub.querySelector('.underline')).toBeNull()
  })

  it('underlines every subRuns hit, leaving the rest plain', () => {
    render(
      <PaletteRow
        id="r1"
        entry={{
          ...ENTRY,
          subRuns: [
            { text: 'the ', hit: false },
            { text: 'second fix', hit: true },
            { text: ' soon', hit: false },
          ],
        }}
        selected={false}
        onHover={jest.fn()}
        onPick={jest.fn()}
      />
    )

    const subSlot = document.querySelector('[data-part="sub"]')
    expect(subSlot?.textContent).toBe('the second fix soon')
    const hit = screen.getByText('second fix')
    expect(hit.className).toContain('underline')
  })
})
