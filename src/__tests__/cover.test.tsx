/**
 * KAN-195: the cover's static frame (`Pond 05 Shell` 5a) — the wordmark, the
 * footer production line, the live clock, and the `ask pond` field's wiring:
 * an empty field opens the shell bare, typed text carries across unsent.
 */

import React from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

import { Cover } from '@/components/organisms/Cover'

describe('Cover', () => {
  beforeEach(() => {
    push.mockClear()
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2026, 8, 22, 7, 12))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders the wordmark and the footer production line', () => {
    render(<Cover />)

    expect(screen.getByRole('heading', { name: 'pond' })).toBeInTheDocument()
    expect(screen.getByText('a make noise production')).toBeInTheDocument()
  })

  it('renders the clock and advances it a minute later', () => {
    render(<Cover />)

    expect(screen.getByText('07:12')).toBeInTheDocument()

    act(() => {
      jest.setSystemTime(new Date(2026, 8, 22, 7, 13))
      jest.advanceTimersByTime(1000)
    })

    expect(screen.getByText('07:13')).toBeInTheDocument()
  })

  it('opens the shell bare when the field is empty and enter is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<Cover />)

    await user.click(screen.getByRole('button', { name: /enter/i }))

    expect(push).toHaveBeenCalledWith('/workspace')
  })

  it('opens the shell bare when ↵ is pressed in an empty field', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<Cover />)

    await user.click(screen.getByLabelText('ask pond'))
    await user.keyboard('{Enter}')

    expect(push).toHaveBeenCalledWith('/workspace')
  })

  it('carries typed text across unsent when ↵ is pressed', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<Cover />)

    await user.type(screen.getByLabelText('ask pond'), 'plan a garden')
    await user.keyboard('{Enter}')

    expect(push).toHaveBeenCalledWith('/workspace?ask=plan%20a%20garden')
  })

  it('carries typed text across unsent when send is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<Cover />)

    await user.type(screen.getByLabelText('ask pond'), 'plan a garden')
    await user.click(screen.getByRole('button', { name: 'send' }))

    expect(push).toHaveBeenCalledWith('/workspace?ask=plan%20a%20garden')
  })
})
