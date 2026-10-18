/**
 * `BlockEdgeHandle` (KAN-441): a 2×40px pill, nothing drawn at true rest,
 * ink .2 on hover, ink 100 + the readout chip while dragging, and `hidden`
 * renders nothing at all. No drag wiring in this component yet — these
 * assert rendered state only.
 */

import { render, screen } from '@testing-library/react'
import { BlockEdgeHandle } from '@/components/molecules/BlockEdgeHandle'

describe('BlockEdgeHandle', () => {
  it('renders nothing when hidden', () => {
    render(<BlockEdgeHandle side="right" hidden />)
    expect(screen.queryByTestId('block-edge-handle')).not.toBeInTheDocument()
  })

  it('at rest: the pill is a 2×40px bar, present but fully transparent, no readout', () => {
    render(<BlockEdgeHandle side="right" />)
    const handle = screen.getByTestId('block-edge-handle')
    expect(handle).toHaveAttribute('data-side', 'right')
    expect(handle).not.toHaveAttribute('data-dragging')
    const pill = screen.getByTestId('block-edge-handle-pill')
    expect(pill).toHaveClass('h-10', 'w-0.5', 'rounded-full')
    expect(pill.getAttribute('class')).toContain('opacity-0')
    expect(pill.getAttribute('class')).not.toContain('opacity-100')
    expect(screen.queryByTestId('block-edge-handle-readout')).not.toBeInTheDocument()
  })

  it('hover-ready: the pill fades to ink .2 on hover, still no readout', () => {
    render(<BlockEdgeHandle side="left" />)
    const handle = screen.getByTestId('block-edge-handle')
    expect(handle).toHaveAttribute('data-side', 'left')
    const pill = screen.getByTestId('block-edge-handle-pill')
    // Hover itself is CSS (`group-hover:`), so assert the class is wired rather
    // than simulating a real `:hover` match (jsdom has no layout/paint to drive it).
    expect(pill.getAttribute('class')).toContain('group-hover:opacity-20')
    expect(screen.queryByTestId('block-edge-handle-readout')).not.toBeInTheDocument()
  })

  it('dragging: the pill holds ink 100 and the readout chip shows the live value', () => {
    render(<BlockEdgeHandle side="right" dragging readout="½" />)
    const handle = screen.getByTestId('block-edge-handle')
    expect(handle).toHaveAttribute('data-dragging', 'true')
    const pill = screen.getByTestId('block-edge-handle-pill')
    expect(pill.getAttribute('class')).toContain('opacity-100')
    expect(pill.getAttribute('class')).not.toContain('opacity-0')
    expect(screen.getByTestId('block-edge-handle-readout')).toHaveTextContent('½')
  })

  it('dragging with a free percent shows that percent in the readout', () => {
    render(<BlockEdgeHandle side="right" dragging readout="47%" />)
    expect(screen.getByTestId('block-edge-handle-readout')).toHaveTextContent('47%')
  })

  it('dragging with no readout value yet shows no chip', () => {
    render(<BlockEdgeHandle side="right" dragging />)
    expect(screen.queryByTestId('block-edge-handle-readout')).not.toBeInTheDocument()
  })

  it('is a vertical separator carrying the live percent', () => {
    render(<BlockEdgeHandle side="right" valueNow={46} />)
    const handle = screen.getByRole('separator')
    expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    expect(handle).toHaveAttribute('aria-valuenow', '46')
  })
})
