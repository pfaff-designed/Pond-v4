/**
 * hydrateViewBlocks (assemble.ts) — the read-hydration seam that injects a view
 * block's rows before the sync `serialize` runs.
 *
 * #41: a view draws its HOST page's row children by default, or a LINKED collection's
 * rows when `collectionId` is set. This guards that each view block is hydrated from
 * the CORRECT source (host vs linked target), that non-`row` children are excluded,
 * and that a page with no view block does no fetch. Uses a mocked Supabase client
 * shaped like `getChildPages` (`.eq('parent_id', …).order(…)`), no live DB.
 */
import { hydrateViewBlocks } from '@/lib/context/assemble'
import type { Block } from '@/lib/documents/types'

type Row = {
  id: string
  parent_id: string | null
  type: string
  title: string
  blocks: unknown
  props: unknown
  order: number
}
const row = (id: string, parentId: string, type: string, title: string): Row => ({
  id,
  parent_id: parentId,
  type,
  title,
  blocks: [],
  props: {},
  order: 0,
})

/** A client whose `getChildPages` returns `childrenByParent[parentId]`. */
function makeChildSupabase(childrenByParent: Record<string, Row[]>) {
  const from = jest.fn(() => {
    let parentId: string | undefined
    const chain: Record<string, jest.Mock> = {
      select: jest.fn(() => chain),
      eq: jest.fn((col: string, val: string) => {
        if (col === 'parent_id') parentId = val
        return chain
      }),
      is: jest.fn(() => chain),
      order: jest.fn(() =>
        Promise.resolve({ data: (parentId && childrenByParent[parentId]) || [], error: null })
      ),
    }
    return chain
  })
  return { from } as never
}

const viewOf = (blocks: Block[], id: string) =>
  blocks.find((b) => b.id === id) as
    (Block & { rows?: { id: string; title: string }[] }) | undefined

describe('hydrateViewBlocks (#41)', () => {
  it('hydrates an inline view from the HOST page rows (excluding non-row children)', async () => {
    const sb = makeChildSupabase({
      host: [row('r1', 'host', 'row', 'Alpha'), row('sub', 'host', 'page', 'A sub-page')],
    })
    const blocks: Block[] = [{ id: 'v1', type: 'view', mode: 'table' } as Block]
    const out = await hydrateViewBlocks(sb, 'u1', 'host', blocks)
    expect(viewOf(out, 'v1')?.rows).toEqual([{ id: 'r1', title: 'Alpha' }])
  })

  it('hydrates a LINKED view from the target collection, not the host', async () => {
    const sb = makeChildSupabase({
      host: [row('r-host', 'host', 'row', 'HostRow')],
      coll: [row('r-coll', 'coll', 'row', 'CollRow')],
    })
    const blocks: Block[] = [
      { id: 'v-linked', type: 'view', mode: 'table', collectionId: 'coll' } as Block,
    ]
    const out = await hydrateViewBlocks(sb, 'u1', 'host', blocks)
    expect(viewOf(out, 'v-linked')?.rows).toEqual([{ id: 'r-coll', title: 'CollRow' }])
  })

  it('hydrates an inline and a linked view on the same page each from its own source', async () => {
    const sb = makeChildSupabase({
      host: [row('r-host', 'host', 'row', 'HostRow')],
      coll: [row('r-coll', 'coll', 'row', 'CollRow')],
    })
    const blocks: Block[] = [
      { id: 'v-inline', type: 'view', mode: 'table' } as Block,
      { id: 'v-linked', type: 'view', mode: 'board', collectionId: 'coll' } as Block,
    ]
    const out = await hydrateViewBlocks(sb, 'u1', 'host', blocks)
    expect(viewOf(out, 'v-inline')?.rows).toEqual([{ id: 'r-host', title: 'HostRow' }])
    expect(viewOf(out, 'v-linked')?.rows).toEqual([{ id: 'r-coll', title: 'CollRow' }])
  })

  it('returns the blocks untouched (no fetch) when there is no view block', async () => {
    const sb = makeChildSupabase({})
    const blocks: Block[] = [{ id: 't1', type: 'text', content: 'hi' } as Block]
    const out = await hydrateViewBlocks(sb, 'u1', 'host', blocks)
    expect(out).toBe(blocks)
    expect((sb as unknown as { from: jest.Mock }).from).not.toHaveBeenCalled()
  })
})
