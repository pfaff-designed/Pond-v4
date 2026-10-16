/**
 * @jest-environment node
 *
 * KAN-333: GET /auth/confirm validates `token_hash` + `type` before calling
 * anything — a missing or unknown `type` never reaches `verifyOtp`.
 */

const mockVerifyOtp = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args) },
  })),
}))

import { GET } from '@/app/auth/confirm/route'
import { NextRequest } from 'next/server'

function get(query: string) {
  return GET(new NextRequest(`http://localhost/auth/confirm${query}`))
}

beforeEach(() => {
  mockVerifyOtp.mockReset()
})

describe('GET /auth/confirm', () => {
  it('redirects to link_invalid without calling verifyOtp when token_hash is missing', async () => {
    const res = await get('?type=email')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/sign-in?error=link_invalid')
    expect(mockVerifyOtp).not.toHaveBeenCalled()
  })

  it('redirects to link_invalid without calling verifyOtp when type is missing', async () => {
    const res = await get('?token_hash=abc')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/sign-in?error=link_invalid')
    expect(mockVerifyOtp).not.toHaveBeenCalled()
  })

  it('redirects to link_invalid without calling verifyOtp when type is not a valid EmailOtpType', async () => {
    const res = await get('?token_hash=abc&type=bogus')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/sign-in?error=link_invalid')
    expect(mockVerifyOtp).not.toHaveBeenCalled()
  })

  it('calls verifyOtp with the server client and redirects to /workspace on success', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null })
    const res = await get('?token_hash=abc&type=email')
    expect(mockVerifyOtp).toHaveBeenCalledWith({ type: 'email', token_hash: 'abc' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/workspace')
  })

  it('redirects to link_expired when verifyOtp errors', async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    const res = await get('?token_hash=abc&type=magiclink')
    expect(mockVerifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'abc' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/sign-in?error=link_expired')
  })
})
