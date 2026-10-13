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

const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(' ')

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

  it('the field has no fixed width above the viewport', () => {
    render(<Cover />)

    const field = screen.getByLabelText('ask pond').closest('.mn-glass')
    expect(field).not.toBeNull()
    expect(classesOf(field as Element)).toContain('w-full')
    expect(classesOf(field as Element)).toContain('max-w-[420px]')
    expect(classesOf(field as Element)).not.toContain('w-[420px]')
  })

  it('send and enter get an expanded hit area under 44px at phone width', () => {
    render(<Cover />)

    const send = screen.getByRole('button', { name: 'send' })
    expect(classesOf(send)).toEqual(
      expect.arrayContaining(["max-md:before:-inset-2", "max-md:before:content-['']"])
    )

    const enter = screen.getByRole('button', { name: /enter/i })
    expect(classesOf(enter)).toEqual(
      expect.arrayContaining(["max-md:before:-inset-2", "max-md:before:content-['']"])
    )
  })
})
