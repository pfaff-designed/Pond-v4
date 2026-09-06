/**
 * useLazySupabase (#38) — the shared lazy browser-client seam.
 *
 * `@supabase/ssr` throws at CONSTRUCTION when NEXT_PUBLIC_SUPABASE_* are absent,
 * so an eager `useMemo(() => createClient(), [])` crashes envless mounts
 * (Storybook, CI) even when every query is seeded or disabled. The hook returns
 * a stable getter instead: nothing is constructed at render; the client is built
 * on FIRST use (inside a queryFn / event handler) and cached for the component's
 * lifetime — prod behavior unchanged, just a construction site one tick later.
 */
import { renderHook } from '@testing-library/react'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'

const mockCreateClient = jest.fn(() => ({ tag: 'client' }))
jest.mock('@/lib/supabase/client', () => ({
  createClient: (...a: unknown[]) => mockCreateClient(...(a as [])),
}))

beforeEach(() => mockCreateClient.mockClear())

describe('useLazySupabase', () => {
  it('does NOT construct the client at render', () => {
    renderHook(() => useLazySupabase())
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('constructs on first getter call and memoizes the instance', () => {
    const { result } = renderHook(() => useLazySupabase())
    const first = result.current()
    const second = result.current()
    expect(first).toBe(second)
    expect(mockCreateClient).toHaveBeenCalledTimes(1)
  })

  it('returns a render-stable getter (safe in deps arrays)', () => {
    const { result, rerender } = renderHook(() => useLazySupabase())
    const getter = result.current
    rerender()
    expect(result.current).toBe(getter)
  })
})
