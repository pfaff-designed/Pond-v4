/**
 * KAN-95 — outside a registered Tiptap editor (a composer answer, a record
 * field) the five formatting items are drawn disabled; `ask pond` and `copy` act.
 */

import { render, screen } from '@testing-library/react'
import { SelectionBar } from '@/components/molecules/SelectionBar'
import { selectText } from './helpers/selection'

const FORMATTING = ['text', 'bold', 'italic', 'link', 'list']

describe('SelectionBar outside an editor', () => {
  beforeEach(() => {
    render(
      <>
        <SelectionBar onAsk={jest.fn()} />
        <p>plain answer</p>
      </>
    )
    selectText(screen.getByText('plain answer'))
  })

  it.each(FORMATTING)('draws %s disabled, in ink .68', (name) => {
    const button = screen.getByRole('button', { name })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveClass('text-mn-text-secondary')
  })

  it.each(['ask pond', 'copy'])('keeps %s enabled', (name) => {
    const button = screen.getByRole('button', { name })
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('aria-disabled')
  })

  it('puts the tab stop on the first enabled item', () => {
    const stops = screen.getAllByRole('button').filter((button) => button.tabIndex === 0)
    expect(stops.map((button) => button.textContent)).toEqual(['ask pond'])
  })
})
