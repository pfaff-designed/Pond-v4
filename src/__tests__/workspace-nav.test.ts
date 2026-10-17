/**
 * `workspaceUrl` / `workspaceHref` — the one way a node becomes an address.
 *
 * There is a single route. The sandbox's `/sandbox` base path was retired with
 * the sandbox route itself (#315): a pond is scope carried in `?pond=`, not a
 * route of its own, so the only thing that varies in an address now is the pond.
 *
 * The `?pond=` assertions are the regression guard for #312: every rail row,
 * breadcrumb crumb and children-grid card went through here to a pond-less URL,
 * which resolved to the FIRST pond — so opening anything inside a second pond
 * dropped you back into `life`.
 */

import { workspaceUrl, workspaceHref, openWorkspaceUrl, WORKSPACE_PATH } from '@/lib/pages/nav'

const node = { id: 'n1', type: 'page', title: 'Notes' }

/** jsdom's address is the ambient pond `currentPondId()` reads. */
function addressIs(search: string) {
  window.history.replaceState({}, '', `${WORKSPACE_PATH}${search}`)
}

beforeEach(() => addressIs(''))

describe('workspaceUrl', () => {
  it('roots at /workspace, the only route there is', () => {
    expect(workspaceUrl(node)).toBe('/workspace?nodeType=page&nodeId=n1&nodeName=Notes')
    expect(workspaceUrl(null)).toBe('/workspace')
  })

  it('carries the pond in the address forward, so a click stays in the pond', () => {
    addressIs('?pond=p-second')
    expect(workspaceUrl(node)).toBe(
      '/workspace?nodeType=page&nodeId=n1&nodeName=Notes&pond=p-second'
    )
    expect(workspaceUrl(null)).toBe('/workspace?pond=p-second')
  })

  it('an explicit pond overrides the ambient one — the switcher moving you', () => {
    addressIs('?pond=p-second')
    expect(workspaceUrl(null, 'p-third')).toBe('/workspace?pond=p-third')
    expect(workspaceUrl(node, 'p-third')).toBe(
      '/workspace?nodeType=page&nodeId=n1&nodeName=Notes&pond=p-third'
    )
  })

  it('appends the pond LAST, so the page params keep their order', () => {
    addressIs('?pond=p-second')
    const params = new URL(workspaceUrl(node), 'http://x').searchParams
    expect([...params.keys()]).toEqual(['nodeType', 'nodeId', 'nodeName', 'pond'])
  })

  it('percent-encodes a pond id on the rootward URL', () => {
    expect(workspaceUrl(null, 'a b&c')).toBe('/workspace?pond=a%20b%26c')
  })
})

describe('workspaceHref', () => {
  it('mirrors workspaceUrl, pond and all', () => {
    expect(workspaceHref(node)).toBe(workspaceUrl(node))
    addressIs('?pond=p-second')
    expect(workspaceHref(node)).toBe(workspaceUrl(node))
    expect(workspaceHref(node, 'p-third')).toBe(workspaceUrl(node, 'p-third'))
  })
})

describe('openWorkspaceUrl', () => {
  it('on /workspace, pushes history shallowly and never calls router.push', () => {
    addressIs('')
    const push = jest.fn()
    const pushStateSpy = jest.spyOn(window.history, 'pushState')

    openWorkspaceUrl(workspaceUrl(node), { push })

    expect(pushStateSpy).toHaveBeenCalledWith(null, '', workspaceUrl(node))
    expect(push).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })

  it('off /workspace (e.g. Cover.tsx at /), falls back to router.push', () => {
    window.history.replaceState({}, '', '/')
    const push = jest.fn()
    const pushStateSpy = jest.spyOn(window.history, 'pushState')

    openWorkspaceUrl(workspaceUrl(node), { push })

    expect(push).toHaveBeenCalledWith(workspaceUrl(node))
    expect(pushStateSpy).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })
})
