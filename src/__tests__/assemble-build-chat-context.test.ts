/**
 * KAN-309: `buildChatContext`'s `nodeData` option. The route reads the open
 * node once (for `withOpenPageNow`) and hands that same data in here so
 * `buildChatContext` doesn't read it a second time. `undefined` (every
 * caller before this ticket) keeps the old behaviour — fetch it itself.
 */
import { buildChatContext } from '@/lib/context/assemble'
import type { NodeContextData } from '@/lib/context/assemble'
import { makeFakeSupabase } from './helpers/fake-supabase'
import type { Row } from './helpers/fake-supabase'

const dbRow: Row = {
  id: 'node-1',
  user_id: 'user-1',
  parent_id: null,
  type: 'page',
  title: 'node-1',
  blocks: [{ id: 'b1', type: 'text', content: 'DB-FETCHED-TEXT' }],
  props: {},
  order: 0,
}

const handedInData: NodeContextData = {
  type: 'page',
  title: 'node-1',
  documents: [
    { title: 'node-1', blocks: [{ id: 'b1', type: 'text', content: 'INJECTED-TEXT' }] },
  ],
  children: [],
}

describe('buildChatContext nodeData (KAN-309)', () => {
  it('builds [Current node] from the handed-in nodeData, without fetching the node from pages', async () => {
    const sb = makeFakeSupabase([dbRow])

    const context = await buildChatContext(sb as never, 'user-1', {
      nodeId: 'node-1',
      pondId: null,
      nodeData: handedInData,
    })

    expect(context).toContain('INJECTED-TEXT')
    // If this ignored nodeData and fetched the row instead, the DB row's
    // body would show up here instead.
    expect(context).not.toContain('DB-FETCHED-TEXT')
  })

  it('fetches the node from pages when nodeData is not handed in, as before', async () => {
    const sb = makeFakeSupabase([dbRow])

    const context = await buildChatContext(sb as never, 'user-1', {
      nodeId: 'node-1',
      pondId: null,
    })

    expect(context).toContain('DB-FETCHED-TEXT')
  })

  it('treats a handed-in null the same as "no current node" (unowned/missing page), no fetch', async () => {
    const sb = makeFakeSupabase([dbRow])

    const context = await buildChatContext(sb as never, 'user-1', {
      nodeId: 'node-1',
      pondId: null,
      nodeData: null,
    })

    expect(context).not.toContain('DB-FETCHED-TEXT')
    expect(context).not.toContain('INJECTED-TEXT')
  })
})
