/**
 * `ComposerWindowControls` draws minimize · maximize · close, right-aligned
 * in that order (user ruling, 2026-10-14, KAN-323).
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComposerWindowControls } from '@/components/molecules/ComposerWindowControls'

describe('ComposerWindowControls', () => {
  it('renders minimize, maximize, close in order with the right names', () => {
    render(
      <ComposerWindowControls
        maximized={false}
        onMinimize={jest.fn()}
        onMaximize={jest.fn()}
        onClose={jest.fn()}
      />
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'minimize',
      'maximize',
      'close',
    ])
  })

  it('swaps the maximize control to restore when maximized', () => {
    const { rerender } = render(
      <ComposerWindowControls
        maximized={false}
        onMinimize={jest.fn()}
        onMaximize={jest.fn()}
        onClose={jest.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'maximize' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'restore' })).not.toBeInTheDocument()

    rerender(
      <ComposerWindowControls
        maximized
        onMinimize={jest.fn()}
        onMaximize={jest.fn()}
        onClose={jest.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'restore' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'maximize' })).not.toBeInTheDocument()
  })

  it('gives every button a tooltip matching its aria-label', () => {
    render(
      <ComposerWindowControls
        maximized={false}
        onMinimize={jest.fn()}
        onMaximize={jest.fn()}
        onClose={jest.fn()}
      />
    )

    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('title')).toBe(button.getAttribute('aria-label'))
    }
  })

  it('calls each handler on click', async () => {
    const user = userEvent.setup()
    const onMinimize = jest.fn()
    const onMaximize = jest.fn()
    const onClose = jest.fn()
    render(
      <ComposerWindowControls
        maximized={false}
        onMinimize={onMinimize}
        onMaximize={onMaximize}
        onClose={onClose}
      />
    )

    await user.click(screen.getByRole('button', { name: 'minimize' }))
    await user.click(screen.getByRole('button', { name: 'maximize' }))
    await user.click(screen.getByRole('button', { name: 'close' }))

    expect(onMinimize).toHaveBeenCalledTimes(1)
    expect(onMaximize).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
