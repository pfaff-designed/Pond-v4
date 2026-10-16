/**
 * KAN-333 — /sign-in maps `?error=` to a plain-words line so a bad or
 * expired magic link reads as a visible error, never a silent loop.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import SignInPage from '@/app/sign-in/page'

let mockSearchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOtp: jest.fn() } }),
}))

beforeEach(() => {
  mockSearchParams = new URLSearchParams()
})

describe('/sign-in — the `?error=` line', () => {
  it('shows the expired-link words for link_expired', async () => {
    mockSearchParams = new URLSearchParams('error=link_expired')
    render(<SignInPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'that sign-in link has expired or was already used. send yourself a new one.'
    )
  })

  it('shows the generic words for link_invalid', async () => {
    mockSearchParams = new URLSearchParams('error=link_invalid')
    render(<SignInPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "that sign-in link didn't work. send yourself a new one."
    )
  })

  it('shows the generic words for auth_failed', async () => {
    mockSearchParams = new URLSearchParams('error=auth_failed')
    render(<SignInPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "that sign-in link didn't work. send yourself a new one."
    )
  })

  it('shows the generic words for an unknown code', async () => {
    mockSearchParams = new URLSearchParams('error=something_else')
    render(<SignInPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "that sign-in link didn't work. send yourself a new one."
    )
  })

  it('shows no alert with no error param', () => {
    render(<SignInPage />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
