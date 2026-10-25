/**
 * KAN-449 — `navigateToPage` opens through the shared shallow-nav seam
 * (`openWorkspaceUrl`), not `router.push` directly: on `/workspace` a page-link
 * click must behave like every other page open, a `pushState` with no RSC
 * round trip.
 */
import React from 'react'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

import { usePageLinkCapabilities } from './use-capabilities'
import { workspaceUrl } from '@/lib/pages/nav'

const ref = { id: 'p-1', title: 'Notes', type: 'page', isNew: false }

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

beforeEach(() => push.mockClear())

describe('usePageLinkCapabilities().navigateToPage', () => {
  it('on /workspace, pushes history shallowly and never calls router.push', () => {
    window.history.replaceState({}, '', '/workspace')
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    const { result } = renderHook(() => usePageLinkCapabilities('page-1'), {
      wrapper: wrapper(),
    })

    result.current.navigateToPage(ref)

    expect(pushStateSpy).toHaveBeenCalledWith(null, '', workspaceUrl(ref))
    expect(push).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })

  it('off /workspace, falls back to router.push', () => {
    window.history.replaceState({}, '', '/')
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    const { result } = renderHook(() => usePageLinkCapabilities('page-1'), {
      wrapper: wrapper(),
    })

    result.current.navigateToPage(ref)

    expect(push).toHaveBeenCalledWith(workspaceUrl(ref))
    expect(pushStateSpy).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })

  // KAN-474 follow-up: `navigateToPage` used to build its URL with the alias
  // KAN-474 repurposed into a window-less, render-safe builder — so a click in
  // a second pond silently dropped its `?pond=` and opened the page in the
  // first pond instead. Fails before the fix (pushState called with a
  // pond-less href while the address carries `?pond=p2`).
  it('carries the address bar pond forward, so a click in a second pond stays there', () => {
    window.history.replaceState({}, '', '/workspace?pond=p2')
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    const { result } = renderHook(() => usePageLinkCapabilities('page-1'), {
      wrapper: wrapper(),
    })

    result.current.navigateToPage(ref)

    expect(pushStateSpy).toHaveBeenCalledWith(null, '', workspaceUrl(ref))
    expect(pushStateSpy.mock.calls[0][2]).toContain('pond=p2')
    pushStateSpy.mockRestore()
  })
})
