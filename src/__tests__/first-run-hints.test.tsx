/**
 * FirstRunHints (`Pond 06.04` 6d frame 2) — heading, line and the three
 * suggestion cards. Choosing a card pre-fills the composer via the shared
 * terminal-focus signal and creates nothing.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FirstRunHints, FIRST_RUN_HEADING, FIRST_RUN_LINE } from '@/components/organisms/FirstRunHints'
import { requestTerminalFocus } from '@/lib/terminal-focus'

jest.mock('@/lib/terminal-focus', () => ({
  ...jest.requireActual('@/lib/terminal-focus'),
  requestTerminalFocus: jest.fn(),
}))

beforeEach(() => {
  jest.clearAllMocks()
})

describe('FirstRunHints', () => {
  it('renders the heading and the line', () => {
    render(<FirstRunHints />)
    expect(screen.getByText(FIRST_RUN_HEADING)).toBeInTheDocument()
    expect(screen.getByText(FIRST_RUN_LINE)).toBeInTheDocument()
  })

  it('renders the three cards with their titles and lines', () => {
    render(<FirstRunHints />)
    expect(screen.getByRole('button', { name: /a project/ })).toBeInTheDocument()
    expect(screen.getByText('something with a finish line')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /a collection/ })).toBeInTheDocument()
    expect(screen.getByText('a list that keeps growing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /a journal/ })).toBeInTheDocument()
    expect(screen.getByText('one entry at a time')).toBeInTheDocument()
  })

  it('choosing a card pre-fills the composer and creates nothing', async () => {
    render(<FirstRunHints />)
    await userEvent.click(screen.getByRole('button', { name: /a project/ }))

    expect(requestTerminalFocus).toHaveBeenCalledTimes(1)
    expect(requestTerminalFocus).toHaveBeenCalledWith('a project, something with a finish line')
  })

  it('a different card carries its own copy', async () => {
    render(<FirstRunHints />)
    await userEvent.click(screen.getByRole('button', { name: /a journal/ }))

    expect(requestTerminalFocus).toHaveBeenCalledWith('a journal, one entry at a time')
  })

  it('the card row wraps instead of overflowing at phone width', () => {
    render(<FirstRunHints />)
    const row = screen.getByRole('button', { name: /a project/ }).parentElement
    expect(row).not.toBeNull()
    expect((row?.getAttribute('class') ?? '').split(' ')).toContain('flex-wrap')
  })

  it('isolates its own stacking context so the ASCII layer cannot paint beneath the shell ground', () => {
    const { container } = render(<FirstRunHints />)
    const outer = container.querySelector('[data-part="first-run-hints"]')
    expect(outer).not.toBeNull()
    expect((outer?.getAttribute('class') ?? '').split(' ')).toContain('isolate')
  })
})
