import { fireEvent, render, screen } from '@testing-library/react'
import { BlockGapLine } from './BlockGapLine'

describe('BlockGapLine', () => {
  it('draws no visible line at rest — the line sits at opacity 0 until hovered', () => {
    render(<BlockGapLine onClick={() => {}} />)
    const line = screen.getByTestId('block-gap-line').querySelector('span')!
    expect(line.className).toContain('opacity-0')
  })

  it('carries the hover-state class that fades the line in, the same fade token the ghost row uses', () => {
    render(<BlockGapLine onClick={() => {}} />)
    const line = screen.getByTestId('block-gap-line').querySelector('span')!
    expect(line.className).toContain('group-hover/block-gap-line:opacity-100')
    expect(line.className).toContain('duration-[var(--motion-quick)]')
    expect(line.className).toContain('ease-[var(--ease-mn)]')
    expect(line.className).toContain('motion-reduce:transition-none')
  })

  it('calls onClick and nothing else', () => {
    const onClick = jest.fn()
    render(<BlockGapLine onClick={onClick} />)
    fireEvent.click(screen.getByTestId('block-gap-line'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is aria-hidden — a pointer-only affordance', () => {
    render(<BlockGapLine onClick={() => {}} />)
    expect(screen.getByTestId('block-gap-line')).toHaveAttribute('aria-hidden', 'true')
  })
})
