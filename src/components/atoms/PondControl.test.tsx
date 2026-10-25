import { render, screen } from '@testing-library/react'
import { PondControl } from './PondControl'

/**
 * The field's width, default vs `fullWidth` (KAN-492): a host narrower than the
 * board's 240px field (the pond switcher's menu) opts in with `fullWidth`
 * rather than a one-off className override.
 */
describe('PondControl kind="field" width', () => {
  it('defaults to the board’s fixed 240px desktop width', () => {
    render(<PondControl kind="field" label="name" />)
    const field = screen.getByPlaceholderText('name').closest('[data-part="field"]')
    expect(field).toHaveClass('w-[240px]')
    expect(field).not.toHaveClass('w-full')
  })

  it('fills its container when fullWidth is set, dropping the fixed width', () => {
    render(<PondControl kind="field" label="name" fullWidth />)
    const field = screen.getByPlaceholderText('name').closest('[data-part="field"]')
    expect(field).toHaveClass('w-full')
    expect(field).not.toHaveClass('w-[240px]')
  })
})
