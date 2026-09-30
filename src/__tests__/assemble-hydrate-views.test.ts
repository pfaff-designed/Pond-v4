/**
 * hydrateViewBlocks (assemble.ts) — the read-hydration seam that injects a view
 * block's rows before the sync `serialize` runs.
 *
 * #41: a view draws its HOST page's row children by default, or a LINKED collection's
 * rows when `collectionId` is set. This guards that each view block is hydrated from
 * the CORRECT source (host vs linked target), that non-`row` children are excluded,
 * and that a page with no view block does no fetch. Uses a mocked Supabase client
 * shaped like `getChildPages` (`.eq('parent_id', …).order(…)`), no live DB.
 *
 * #111: the seam also carries each row's property `values` and the source
 * collection's `schema`, because a chart / big-number view AGGREGATES the records at
 * serialize time. The last test is the end-to-end proof: the model's context line
 * carries the computed figure, not a promise that a chart exists.
 */
import { hydrateViewBlocks } from '@/lib/context/assemble'
import { viewDescriptor } from '@/lib/modules/view/schema'
import type { HydratedViewBlock } from '@/lib/modules/view/schema'
import type { Block } from '@/lib/documents/types'
import { SCHEMA_KEY, type PropertySchema } from '@/lib/properties/schema'

type Row = {
  id: string
  parent_id: string | null
  type: string
  title: string
  blocks: unknown
  props: unknown
  order: number
}
const row = (
  id: string,
  parentId: string,
  type: string,
  title: string,
  props: Record<string, unknown> = {}
): Row => ({
  id,
  parent_id: parentId,
  type,
  title,
  blocks: [],
  props,
  order: 0,
})

/**
 * A client whose `getChildPages` returns `childrenByParent[parentId]`, and whose
 * `.in('id', …)` lookup (the #111 source-schema query) returns `pagesById`.
 */
function makeChildSupabase(
  childrenByParent: Record<string, Row[]>,
  pagesById: Record<string, Row> = {}
) {
  const from = jest.fn(() => {
    let parentId: string | undefined
    const chain: Record<string, jest.Mock> = {
      select: jest.fn(() => chain),
      eq: jest.fn((col: string, val: string) => {
        if (col === 'parent_id') parentId = val
        return chain
      }),
      is: jest.fn(() => chain),
      in: jest.fn((_col: string, ids: string[]) =>
        Promise.resolve({
          data: ids.map((id) => pagesById[id]).filter(Boolean),
          error: null,
        })
      ),
      order: jest.fn(() =>
        Promise.resolve({ data: (parentId && childrenByParent[parentId]) || [], error: null })
      ),
    }
    return chain
  })
  return { from } as never
}

const viewOf = (blocks: Block[], id: string) =>
  blocks.find((b) => b.id === id) as HydratedViewBlock | undefined

const numberSchema: PropertySchema = [{ id: 'p-hours', name: 'Hours', type: 'number' }]

describe('hydrateViewBlocks (#41)', () => {
  it('hydrates an inline view from the HOST page rows (excluding non-row children)', async () => {
    const sb = makeChildSupabase({
      host: [row('r1', 'host', 'row', 'Alpha'), row('sub', 'host', 'page', 'A sub-page')],
    })
    const blocks: Block[] = [{ id: 'v1', type: 'view', mode: 'table' } as Block]
    const out = await hydrateViewBlocks(sb, 'u1', 'host', blocks)
    expect(viewOf(out, 'v1')?.rows).toEqual([{ id: 'r1', title: 'Alpha', values: {} }])
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
    expect(viewOf(out, 'v-linked')?.rows).toEqual([{ id: 'r-coll', title: 'CollRow', values: {} }])
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
    expect(viewOf(out, 'v-inline')?.rows).toEqual([{ id: 'r-host', title: 'HostRow', values: {} }])
    expect(viewOf(out, 'v-linked')?.rows).toEqual([{ id: 'r-coll', title: 'CollRow', values: {} }])
  })

  it('returns the blocks untouched (no fetch) when there is no view block', async () => {
    const sb = makeChildSupabase({})
    const blocks: Block[] = [{ id: 't1', type: 'text', content: 'hi' } as Block]
    const out = await hydrateViewBlocks(sb, 'u1', 'host', blocks)
    expect(out).toBe(blocks)
    expect((sb as unknown as { from: jest.Mock }).from).not.toHaveBeenCalled()
  })
})

describe('hydrateViewBlocks — records + schema for chart/big-number figures (#111)', () => {
  const sbWithFigures = () =>
    makeChildSupabase(
      {
        host: [
          row('r1', 'host', 'row', 'Mill', { 'p-hours': 3 }),
          row('r2', 'host', 'row', 'Glue', { 'p-hours': 5 }),
        ],
      },
      { host: row('host', 'root', 'page', 'Shop log', { [SCHEMA_KEY]: numberSchema }) }
    )

  it("carries each row's property values and the source collection's schema", async () => {
    const blocks: Block[] = [
      {
        id: 'v1',
        type: 'view',
        mode: 'big-number',
        bigNumber: { property: 'p-hours', agg: 'sum' },
      } as Block,
    ]
    const out = await hydrateViewBlocks(sbWithFigures(), 'u1', 'host', blocks)
    const view = viewOf(out, 'v1')
    expect(view?.schema).toEqual(numberSchema)
    expect(view?.rows?.map((r) => r.values)).toEqual([{ 'p-hours': 3 }, { 'p-hours': 5 }])
  })

  it('strips the reserved _schema key out of a row’s values', async () => {
    const sb = makeChildSupabase(
      { host: [row('r1', 'host', 'row', 'Mill', { 'p-hours': 3, [SCHEMA_KEY]: numberSchema })] },
      { host: row('host', 'root', 'page', 'Shop log', { [SCHEMA_KEY]: numberSchema }) }
    )
    const out = await hydrateViewBlocks(sb, 'u1', 'host', [
      { id: 'v1', type: 'view', mode: 'chart' } as Block,
    ])
    expect(viewOf(out, 'v1')?.rows?.[0].values).toEqual({ 'p-hours': 3 })
  })

  it('serializes the AGGREGATED figure end-to-end (AC 8)', async () => {
    const blocks: Block[] = [
      {
        id: 'v1',
        type: 'view',
        mode: 'big-number',
        bigNumber: { property: 'p-hours', agg: 'sum' },
      } as Block,
    ]
    const out = await hydrateViewBlocks(sbWithFigures(), 'u1', 'host', blocks)
    const line = viewDescriptor.serialize(viewOf(out, 'v1') as never)
    expect(line).toContain('Hours: 8')
    expect(line).toContain('over 2 records')
  })

  it('omits the schema for a source that is not a collection (figure degrades honestly)', async () => {
    const sb = makeChildSupabase(
      { host: [row('r1', 'host', 'row', 'Mill', { 'p-hours': 3 })] },
      { host: row('host', 'root', 'page', 'Just a page') }
    )
    const out = await hydrateViewBlocks(sb, 'u1', 'host', [
      { id: 'v1', type: 'view', mode: 'chart' } as Block,
    ])
    const view = viewOf(out, 'v1')
    expect(view?.schema).toBeUndefined()
    expect(viewDescriptor.serialize(view as never)).toContain('1 row')
  })
})
