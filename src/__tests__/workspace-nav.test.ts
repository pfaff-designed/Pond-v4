/**
 * ticket-43 — workspace-scoped navigation.
 *
 * The route the workspace UI mounts under is derived from the scope: the real
 * workspace stays '/workspace' (byte-identical URLs), the sandbox mounts at
 * '/sandbox'. workspaceUrl/workspaceHref default basePath so all pre-existing
 * call sites keep producing '/workspace?...' unchanged.
 */

import { workspaceUrl, workspaceHref, workspaceBasePath } from '@/lib/pages/nav'

describe('workspaceBasePath', () => {
  it("maps 'main' to /workspace", () => {
    expect(workspaceBasePath('main')).toBe('/workspace')
  })
  it("maps 'sandbox' to /sandbox", () => {
    expect(workspaceBasePath('sandbox')).toBe('/sandbox')
  })
})

describe('workspaceUrl base-path scoping', () => {
  const node = { id: 'n1', type: 'page', title: 'Notes' }

  it('defaults to /workspace (real workspace URLs are unchanged)', () => {
    expect(workspaceUrl(node)).toBe('/workspace?nodeType=page&nodeId=n1&nodeName=Notes')
  })

  it('roots at /sandbox when the sandbox base path is passed', () => {
    expect(workspaceUrl(node, '/sandbox')).toBe('/sandbox?nodeType=page&nodeId=n1&nodeName=Notes')
  })

  it('null node → the root of the given base path', () => {
    expect(workspaceUrl(null)).toBe('/workspace')
    expect(workspaceUrl(null, '/sandbox')).toBe('/sandbox')
  })

  it('workspaceHref mirrors workspaceUrl with the same base-path default', () => {
    expect(workspaceHref(node)).toBe(workspaceUrl(node))
    expect(workspaceHref(node, '/sandbox')).toBe(workspaceUrl(node, '/sandbox'))
  })
})
