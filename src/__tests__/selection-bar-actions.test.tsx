/**
 * KAN-95 — `ask pond` and `copy` act; `highlight`, `comment` and
 * `new page from this` are drawn in the board's order and stay inert.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { SelectionBar } from '@/components/molecules/SelectionBar'
import { selectText } from './helpers/selection'

const renderWithSelection = (onAsk = jest.fn()) => {
  render(
    <>
      <SelectionBar onAsk={onAsk} />
      <p>select me</p>
    </>
  )
  selectText(screen.getByText('select me'))
  return onAsk
}

const DEFERRED = ['highlight', 'comment', 'new page from this']

describe('SelectionBar ask pond', () => {
  it('calls onAsk with the selected text', () => {
    const onAsk = renderWithSelection()
    fireEvent.click(screen.getByRole('button', { name: 'ask pond' }))
    expect(onAsk).toHaveBeenCalledTimes(1)
    expect(onAsk).toHaveBeenCalledWith({ text: 'select me', blockId: undefined })
  })
})

describe('SelectionBar copy', () => {
  const writeText = jest.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    writeText.mockClear()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  })

  it('writes the selection’s text to the clipboard', () => {
    renderWithSelection()
    fireEvent.click(screen.getByRole('button', { name: 'copy' }))
    expect(writeText).toHaveBeenCalledWith('select me')
  })

  it('does not call onAsk', () => {
    const onAsk = renderWithSelection()
    fireEvent.click(screen.getByRole('button', { name: 'copy' }))
    expect(onAsk).not.toHaveBeenCalled()
  })
})

describe('SelectionBar deferred items', () => {
  it('draws highlight, comment and new page from this in the board’s order', () => {
    renderWithSelection()
    const names = screen.getAllByRole('button').map((button) => button.textContent)
    const positions = DEFERRED.map((name) => names.indexOf(name))
    expect(positions.every((position) => position !== -1)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(names.indexOf('ask pond')).toBeGreaterThan(names.indexOf('comment'))
    expect(names.indexOf('ask pond')).toBeLessThan(names.indexOf('new page from this'))
  })

  it.each(DEFERRED)('%s is disabled, aria-disabled, ink .68 and inert', (name) => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const onAsk = renderWithSelection()
    const button = screen.getByRole('button', { name })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveClass('text-mn-text-secondary')
    fireEvent.click(button)
    expect(onAsk).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
  })
})
