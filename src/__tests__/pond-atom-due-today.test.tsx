import { render } from '@testing-library/react'
import { PondAtom } from '@/components/atoms/PondAtom'

describe('PondAtom kind="date" due="today"', () => {
  it('is the pill — burnt orange carrying ink — reading `today`', () => {
    const { container } = render(<PondAtom kind="date" due="today" />)
    const pill = container.querySelector('[data-part="due-today"]')!
    expect(pill).toHaveTextContent('today')
    expect(pill.className).toContain('bg-mn-signal-dated')
    expect(pill.className).toContain('text-raw-ink')
    expect(container.querySelector('[data-kind="date"]')).toBe(pill)
  })

  it('says a given word in place of `today`', () => {
    const { container } = render(<PondAtom kind="date" due="today" value="due" />)
    expect(container.querySelector('[data-part="due-today"]')).toHaveTextContent('due')
  })

  it('a plain `due` stays the dot, not the pill', () => {
    const { container } = render(<PondAtom kind="date" due value="21 oct" />)
    expect(container.querySelector('[data-part="due-today"]')).toBeNull()
  })
})
