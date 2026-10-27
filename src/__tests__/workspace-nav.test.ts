/**
 * `workspaceUrl` / `workspaceRenderHref` — the one way a node becomes an address.
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

import {
  workspaceUrl,
  workspaceRenderHref,
  openWorkspaceUrl,
  WORKSPACE_PATH,
} from '@/lib/pages/nav'

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

describe('workspaceRenderHref', () => {
  // KAN-474 follow-up: `workspaceRenderHref` is the one render-safe builder —
  // it must NEVER read `window`, even when the address already carries a
  // `?pond=`. `workspaceUrl` is the only one of the two allowed to fall back
  // to the live address, which is why it delegates to `workspaceRenderHref`
  // rather than the other way around. This is a dedicated name, not a reused
  // alias — a later pass repurposing the render-safe builder again can't
  // silently change what an unrelated caller gets back, the way renaming the
  // ticket-26 alias in place once did.
  it('ignores the address entirely — no pond id given means no &pond=, regardless of what the address carries', () => {
    expect(workspaceRenderHref(node)).toBe('/workspace?nodeType=page&nodeId=n1&nodeName=Notes')
    addressIs('?pond=p-second')
    expect(workspaceRenderHref(node)).toBe('/workspace?nodeType=page&nodeId=n1&nodeName=Notes')
    expect(workspaceRenderHref(null)).toBe('/workspace')
  })

  it('carries exactly the pond id handed to it, never the address', () => {
    addressIs('?pond=p-second')
    expect(workspaceRenderHref(node, 'p-third')).toBe(
      '/workspace?nodeType=page&nodeId=n1&nodeName=Notes&pond=p-third'
    )
    expect(workspaceRenderHref(null, 'p-third')).toBe('/workspace?pond=p-third')
  })

  it('workspaceUrl delegates to it, adding only the window fallback workspaceRenderHref deliberately lacks', () => {
    addressIs('?pond=p-second')
    expect(workspaceUrl(node)).toBe(workspaceRenderHref(node, 'p-second'))
    expect(workspaceRenderHref(node)).not.toBe(workspaceUrl(node)) // never reads the address
    expect(workspaceUrl(node, 'p-third')).toBe(workspaceRenderHref(node, 'p-third'))
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

  it('re-opening the page already open on /workspace is a no-op: no push, no pushState, history unchanged', () => {
    addressIs('?nodeId=b')
    const push = jest.fn()
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    const lengthBefore = window.history.length

    openWorkspaceUrl(`${WORKSPACE_PATH}?nodeId=b`, { push })

    expect(pushStateSpy).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(window.history.length).toBe(lengthBefore)
    pushStateSpy.mockRestore()
  })

  it('a different url on /workspace still pushes once', () => {
    addressIs('?nodeId=b')
    const push = jest.fn()
    const pushStateSpy = jest.spyOn(window.history, 'pushState')

    openWorkspaceUrl(`${WORKSPACE_PATH}?nodeId=c`, { push })

    expect(pushStateSpy).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })

  it('re-opening the same block hash on the same page still fires hashchange, so a cleared selection re-lands', async () => {
    // KAN-473: ⌘K ↵ lands and selects → Esc clears the selection while the
    // hash stays put → ⌘K ↵ the same row again. A plain same-hash assignment
    // is itself a no-op, so this must clear the hash first to force the drop.
    // jsdom (like real browsers) dispatches `hashchange` as a queued task,
    // not synchronously — so this awaits a tick before reading `seen`.
    addressIs('?nodeId=electrician#block-b1')
    const push = jest.fn()
    let fired = 0
    window.addEventListener('hashchange', () => fired++)

    openWorkspaceUrl(`${WORKSPACE_PATH}?nodeId=electrician#block-b1`, { push })
    await new Promise((r) => setTimeout(r, 0))

    expect(push).not.toHaveBeenCalled()
    expect(fired).toBe(2)
    expect(window.location.hash).toBe('#block-b1')
  })
})
