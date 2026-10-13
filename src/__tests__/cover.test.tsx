/**
 * KAN-195: the cover's static frame (`Pond 05 Shell` 5a) — the wordmark, the
 * footer production line, and that the live clock renders and advances.
 */

import React from 'react'
import { act, render, screen } from '@testing-library/react'

import { Cover } from '@/components/organisms/Cover'

describe('Cover', () => {
  beforeEach(() => {
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
})
