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
import { workspaceHref } from '@/lib/pages/nav'

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

    expect(pushStateSpy).toHaveBeenCalledWith(null, '', workspaceHref(ref))
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

    expect(push).toHaveBeenCalledWith(workspaceHref(ref))
    expect(pushStateSpy).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })
})
