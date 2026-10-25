/**
 * @jest-environment node
 *
 * KAN-474 fix: the trash row's `href` must be the exact same string on the
 * server (no `window` at all) and on the client — see `rail-row-href-pond-id.test.tsx`
 * for the full bug writeup. Proven here by rendering on the server with
 * `renderToString` and asserting the markup carries the explicit-pond href
 * (`workspaceUrl(node, pondId)`), which never reads `window.location` when a
 * `pondId` is passed, so it is the same string the client renders too.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: () => null }),
}))

import { RailView, type RailNode } from '@/components/organisms/Rail'
import { TRASH_NODE_ID } from '@/lib/change-log/trash-view'
import { workspaceUrl } from '@/lib/pages/nav'

const health: RailNode = { id: 'health', parentId: null, type: 'page', title: 'Health', order: 0, children: [] }

describe('rail row href on the server (KAN-474)', () => {
  it('there is no window here', () => {
    expect(typeof window).toBe('undefined')
  })

  it('renders the trash row with the explicit-pond href, matching the client', () => {
    const html = renderToString(
      <RailView
        tree={[health]}
        pondId="p2"
        pondName="life"
        selectedId={null}
        expanded={new Set()}
        lifeExpanded
        busyId={null}
        isLoading={false}
        isEmpty={false}
        onSelect={jest.fn()}
        onToggle={jest.fn()}
        onAddChild={jest.fn()}
        onDelete={jest.fn()}
        onRename={jest.fn()}
        onPickGlyph={jest.fn()}
        onLife={jest.fn()}
        onToggleLife={jest.fn()}
        onOpenDatabases={jest.fn()}
        canDrop={() => true}
        onMove={jest.fn()}
      />
    )

    // React escapes `&` in a rendered attribute value (`&amp;`) — match that
    // to compare against the raw markup string rather than parsing it.
    const expectedHref = workspaceUrl(
      { id: TRASH_NODE_ID, type: 'page', title: 'trash' },
      'p2'
    ).replace(/&/g, '&amp;')
    expect(html).toContain(`href="${expectedHref}"`)
  })
})
