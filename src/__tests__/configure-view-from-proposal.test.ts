/**
 * Tests for the AI configure_view accept path (src/lib/pages/configure-view.ts).
 *
 * #19 slice 5: an accepted configure_view proposal resolves the model's name-keyed
 * config (groupBy / sort / filter by property NAME, case-insensitive; a select/status
 * filter value label→option-id; unresolved clauses dropped leniently), upserts THE
 * view block on the collection page (reconfigure the top-most in place, or mint one),
 * and persists the blocks. Mirrors the mocked-chain approach in
 * add-row-from-proposal.test.ts — no live Supabase.
 */

import {
  resolveViewConfig,
  resolveCollectionByName,
  upsertViewBlock,
  configureViewFromProposal,
} from '@/lib/pages/configure-view'
import { SCHEMA_KEY, type PropertySchema } from '@/lib/properties/schema'
import type { Block } from '@/lib/documents/types'

const schema: PropertySchema = [
  { id: 'p-title', name: 'Title', type: 'text' },
  { id: 'p-due', name: 'Due', type: 'date' },
  {
    id: 'p-status',
    name: 'Status',
    type: 'status',
    options: [
      { id: 'o-todo', label: 'To do' },
      { id: 'o-doing', label: 'Doing' },
      { id: 'o-done', label: 'Done' },
    ],
  },
]

// ── resolveViewConfig — name→id resolution + lenient drop ────────────────────

describe('resolveViewConfig', () => {
  it('always keeps the mode (a closed enum)', () => {
    expect(resolveViewConfig(schema, { pageId: 'c', mode: 'gallery' })).toEqual({ mode: 'gallery' })
  })

  it('resolves groupBy / sort.key by property name to stable ids', () => {
    expect(
      resolveViewConfig(schema, {
        pageId: 'c',
        mode: 'board',
        groupBy: 'Status',
        sort: { key: 'Due', dir: 'asc' },
      })
    ).toEqual({ mode: 'board', groupBy: 'p-status', sort: { key: 'p-due', dir: 'asc' } })
  })

  it('matches property names case-insensitively', () => {
    expect(resolveViewConfig(schema, { pageId: 'c', mode: 'board', groupBy: 'status' })).toEqual({
      mode: 'board',
      groupBy: 'p-status',
    })
  })

  it('resolves a select/status filter value label→option-id', () => {
    expect(
      resolveViewConfig(schema, {
        pageId: 'c',
        mode: 'table',
        filter: { property: 'Status', op: 'eq', value: 'Doing' },
      })
    ).toEqual({ mode: 'table', filter: { property: 'p-status', op: 'eq', value: 'o-doing' } })
  })

  it('passes a non-choice filter value through unchanged', () => {
    expect(
      resolveViewConfig(schema, {
        pageId: 'c',
        mode: 'table',
        filter: { property: 'Due', op: 'gt', value: '2026-01-01' },
      })
    ).toEqual({ mode: 'table', filter: { property: 'p-due', op: 'gt', value: '2026-01-01' } })
  })

  it('drops a groupBy naming a property not in the schema (lenient)', () => {
    expect(resolveViewConfig(schema, { pageId: 'c', mode: 'board', groupBy: 'Nonsense' })).toEqual({
      mode: 'board',
    })
  })

  it('drops an unresolved sort / filter clause but keeps resolved ones', () => {
    expect(
      resolveViewConfig(schema, {
        pageId: 'c',
        mode: 'table',
        sort: { key: 'Ghost', dir: 'desc' },
        filter: { property: 'Due', op: 'lt', value: '2026-12-31' },
      })
    ).toEqual({ mode: 'table', filter: { property: 'p-due', op: 'lt', value: '2026-12-31' } })
  })

  it('resolves gantt startDate / endDate names to property ids', () => {
    const twoDates: PropertySchema = [...schema, { id: 'p-finish', name: 'Finish', type: 'date' }]
    expect(
      resolveViewConfig(twoDates, {
        pageId: 'c',
        mode: 'gantt',
        startDate: 'Due',
        endDate: 'Finish',
      })
    ).toEqual({ mode: 'gantt', startDate: 'p-due', endDate: 'p-finish' })
  })

  it('drops a gantt date name that is not in the schema (falls back to inference)', () => {
    expect(resolveViewConfig(schema, { pageId: 'c', mode: 'gantt', startDate: 'Nope' })).toEqual({
      mode: 'gantt',
    })
  })

  it('carries a linked-view collectionId through unchanged (#41)', () => {
    expect(
      resolveViewConfig(schema, { pageId: 'host', mode: 'table', collectionId: 'coll-src' })
    ).toEqual({ mode: 'table', collectionId: 'coll-src' })
  })

  // ── chart + big-number modes (#111) ────────────────────────────────────────
  // Same name→id contract as every other clause: the model speaks property NAMES,
  // the persisted block holds stable ids, and a name that isn't there degrades
  // leniently instead of writing a dangling reference.

  it('resolves a chart config: x property + series property NAMES → ids (#111)', () => {
    const withHours: PropertySchema = [...schema, { id: 'p-hours', name: 'Hours', type: 'number' }]
    expect(
      resolveViewConfig(withHours, {
        pageId: 'c',
        mode: 'chart',
        chart: {
          kind: 'line',
          xProperty: 'due',
          series: [{ property: 'Hours', agg: 'sum' }],
          stacked: true,
        },
      })
    ).toEqual({
      mode: 'chart',
      chart: {
        kind: 'line',
        xProperty: 'p-due',
        series: [{ property: 'p-hours', agg: 'sum' }],
        stacked: true,
      },
    })
  })

  it('carries a gauge / composed target through as a plain number (#94)', () => {
    const withHours: PropertySchema = [...schema, { id: 'p-hours', name: 'Hours', type: 'number' }]
    expect(
      resolveViewConfig(withHours, {
        pageId: 'c',
        mode: 'chart',
        chart: { kind: 'gauge', series: [{ property: 'Hours', agg: 'sum' }], target: 40 },
      })
    ).toEqual({
      mode: 'chart',
      chart: { kind: 'gauge', series: [{ property: 'p-hours', agg: 'sum' }], target: 40 },
    })
  })

  it('drops an unresolved chart x property (one point per record) but keeps the series', () => {
    const withHours: PropertySchema = [...schema, { id: 'p-hours', name: 'Hours', type: 'number' }]
    expect(
      resolveViewConfig(withHours, {
        pageId: 'c',
        mode: 'chart',
        chart: { kind: 'bar', xProperty: 'Nope', series: [{ property: 'Hours', agg: 'avg' }] },
      })
    ).toEqual({
      mode: 'chart',
      chart: { kind: 'bar', series: [{ property: 'p-hours', agg: 'avg' }] },
    })
  })

  it('drops the whole chart config when no series property resolves (renderer infers)', () => {
    expect(
      resolveViewConfig(schema, {
        pageId: 'c',
        mode: 'chart',
        chart: { kind: 'bar', series: [{ property: 'Nope', agg: 'sum' }] },
      })
    ).toEqual({ mode: 'chart' })
  })

  it('resolves a big-number config: property NAME → id, keeping verb + format (#111)', () => {
    const withHours: PropertySchema = [...schema, { id: 'p-hours', name: 'Hours', type: 'number' }]
    expect(
      resolveViewConfig(withHours, {
        pageId: 'c',
        mode: 'big-number',
        bigNumber: { property: 'hours', agg: 'avg', format: 'currency' },
      })
    ).toEqual({
      mode: 'big-number',
      bigNumber: { property: 'p-hours', agg: 'avg', format: 'currency' },
    })
  })

  it('resolves a figure TREND clause: property NAME → id, option LABEL → option id', () => {
    const withHours: PropertySchema = [...schema, { id: 'p-hours', name: 'Hours', type: 'number' }]
    expect(
      resolveViewConfig(withHours, {
        pageId: 'c',
        mode: 'big-number',
        bigNumber: {
          property: 'Hours',
          agg: 'sum',
          delta: { property: 'Status', value: 'Done' },
        },
      })
    ).toEqual({
      mode: 'big-number',
      bigNumber: {
        property: 'p-hours',
        agg: 'sum',
        delta: { property: 'p-status', value: 'o-done' },
      },
    })
  })

  it('drops an unresolved trend clause but keeps the figure', () => {
    const withHours: PropertySchema = [...schema, { id: 'p-hours', name: 'Hours', type: 'number' }]
    expect(
      resolveViewConfig(withHours, {
        pageId: 'c',
        mode: 'big-number',
        bigNumber: { property: 'Hours', agg: 'sum', delta: { property: 'Nope', value: 'x' } },
      })
    ).toEqual({ mode: 'big-number', bigNumber: { property: 'p-hours', agg: 'sum' } })
  })

  it('keeps a property-less COUNT figure (how many records)', () => {
    expect(
      resolveViewConfig(schema, { pageId: 'c', mode: 'big-number', bigNumber: { agg: 'count' } })
    ).toEqual({ mode: 'big-number', bigNumber: { agg: 'count' } })
  })

  it('drops the figure config when the named property is unknown (renderer infers)', () => {
    // Symmetric with the chart branch: a name that isn't in the schema never becomes
    // a dangling id. The figure then falls to render-side inference rather than being
    // pinned to a property the user never named.
    expect(
      resolveViewConfig(schema, {
        pageId: 'c',
        mode: 'big-number',
        bigNumber: { property: 'Nope', agg: 'sum' },
      })
    ).toEqual({ mode: 'big-number' })
  })
})

// ── resolveCollectionByName — linked-view target (name → collection id) ──────

describe('resolveCollectionByName', () => {
  const coll = (
    id: string,
    title: string
  ): Parameters<typeof resolveCollectionByName>[0][number] => ({
    id,
    title,
    props: { [SCHEMA_KEY]: schema },
  })
  const plain = (
    id: string,
    title: string
  ): Parameters<typeof resolveCollectionByName>[0][number] => ({
    id,
    title,
    props: {},
  })

  it('resolves a collection by its title', () => {
    expect(resolveCollectionByName([plain('p1', 'Notes'), coll('c1', 'Tasks')], 'Tasks')).toBe('c1')
  })

  it('matches case-insensitively', () => {
    expect(resolveCollectionByName([coll('c1', 'Tasks')], 'tasks')).toBe('c1')
  })

  it('ignores a non-collection page with the same title', () => {
    expect(resolveCollectionByName([plain('p1', 'Tasks'), coll('c1', 'Tasks')], 'Tasks')).toBe('c1')
  })

  it('returns null when no collection matches', () => {
    expect(resolveCollectionByName([coll('c1', 'Tasks')], 'Reading')).toBeNull()
  })

  it('returns the FIRST match on a duplicate title (the picker disambiguates)', () => {
    expect(resolveCollectionByName([coll('c1', 'Tasks'), coll('c2', 'Tasks')], 'Tasks')).toBe('c1')
  })
})

// ── upsertViewBlock — mint vs reconfigure ────────────────────────────────────

const viewOf = (blocks: Block[]) =>
  blocks.find((b) => b.type === 'view') as
    | (Block & {
        id: string
        mode: string
        groupBy?: string
        sort?: unknown
        collectionId?: string
      })
    | undefined

describe('upsertViewBlock', () => {
  it('mints a new view block when the page has none', () => {
    const out = upsertViewBlock([], { mode: 'board', groupBy: 'p-status' }, () => 'v-new')
    expect(out.blocks).toEqual([{ id: 'v-new', type: 'view', mode: 'board', groupBy: 'p-status' }])
  })

  it('appends the view after existing non-view blocks', () => {
    const text: Block = { id: 't1', type: 'text', content: 'hi' }
    const out = upsertViewBlock([text], { mode: 'table' }, () => 'v-new')
    expect(out.blocks).toHaveLength(2)
    expect(out.blocks[0]).toBe(text)
    expect(viewOf(out.blocks)?.id).toBe('v-new')
  })

  it('reconfigures the existing view in place, preserving its id and collectionId', () => {
    const existing: Block = {
      id: 'v-keep',
      type: 'view',
      mode: 'table',
      collectionId: 'other-coll',
    } as Block
    const out = upsertViewBlock(
      [existing],
      { mode: 'board', groupBy: 'p-status' },
      () => 'v-UNUSED'
    )
    const v = viewOf(out.blocks)
    expect(v?.id).toBe('v-keep')
    expect(v?.mode).toBe('board')
    expect(v?.groupBy).toBe('p-status')
    expect(v?.collectionId).toBe('other-coll')
  })

  it('clears an omitted clause on reconfigure (wholesale replace, not merge)', () => {
    const existing: Block = {
      id: 'v-keep',
      type: 'view',
      mode: 'board',
      groupBy: 'p-status',
      sort: { key: 'p-due', dir: 'asc' },
    } as Block
    const out = upsertViewBlock([existing], { mode: 'table' }, () => 'v-UNUSED')
    const v = viewOf(out.blocks)
    expect(v?.mode).toBe('table')
    expect(v?.groupBy).toBeUndefined()
    expect(v?.sort).toBeUndefined()
  })

  it('sets collectionId from config when minting a linked view (#41)', () => {
    const out = upsertViewBlock([], { mode: 'table', collectionId: 'coll-src' }, () => 'v-new')
    expect(out.blocks).toEqual([
      { id: 'v-new', type: 'view', mode: 'table', collectionId: 'coll-src' },
    ])
  })

  it('config collectionId overrides an existing one on reconfigure (#41)', () => {
    const existing: Block = {
      id: 'v-keep',
      type: 'view',
      mode: 'table',
      collectionId: 'old-coll',
    } as Block
    const out = upsertViewBlock(
      [existing],
      { mode: 'board', groupBy: 'p-status', collectionId: 'new-coll' },
      () => 'x'
    )
    expect(viewOf(out.blocks)?.collectionId).toBe('new-coll')
  })

  it('reconfigures the top-most view and leaves any others untouched', () => {
    const v1: Block = { id: 'v1', type: 'view', mode: 'table' } as Block
    const v2: Block = { id: 'v2', type: 'view', mode: 'gallery' } as Block
    const out = upsertViewBlock([v1, v2], { mode: 'board', groupBy: 'p-status' }, () => 'v-UNUSED')
    expect((out.blocks[0] as { id: string; mode: string }).mode).toBe('board')
    expect(out.blocks[0]).toMatchObject({ id: 'v1' })
    expect(out.blocks[1]).toBe(v2)
  })

  it('does not mutate the input blocks array', () => {
    const input: Block[] = [{ id: 'v1', type: 'view', mode: 'table' } as Block]
    const snapshot = JSON.parse(JSON.stringify(input))
    upsertViewBlock(input, { mode: 'board', groupBy: 'p-status' }, () => 'x')
    expect(input).toEqual(snapshot)
  })

  // ── #52 fix 2 — the replaced signal (a collection shows one active view) ─────
  it('reports replaced=false when it MINTS a fresh view (no existing view)', () => {
    const out = upsertViewBlock([], { mode: 'table' }, () => 'v-new')
    expect(out.replaced).toBe(false)
  })

  it('reports replaced=true when a SECOND configure switches the active view', () => {
    const existing: Block = { id: 'v-keep', type: 'view', mode: 'table' } as Block
    const out = upsertViewBlock([existing], { mode: 'board', groupBy: 'p-status' }, () => 'x')
    expect(out.replaced).toBe(true)
  })
})

// ── configureViewFromProposal — guards + write ───────────────────────────────

function makeSupabase(
  page: { id: string; props?: Record<string, unknown>; blocks?: Block[] } | null
) {
  const row = page
    ? {
        id: page.id,
        parent_id: null,
        type: 'page',
        title: 'Tasks',
        blocks: page.blocks ?? [],
        props: page.props ?? {},
        order: 0,
      }
    : null
  const update = jest.fn().mockReturnThis()
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
    update,
  }
  return {
    from: jest.fn().mockReturnValue(chain),
    _chain: chain,
    _update: update,
  }
}

// A mock that can return DIFFERENT pages per id (host vs linked target), and
// records every saveBlocks write. getPage reads `.eq('id', X).maybeSingle()`;
// saveBlocks writes `.update(payload).eq('id', X)`. Each `.from('pages')` gets a
// fresh chain so the captured id never bleeds between queries.
function makeMultiSupabase(
  pagesById: Record<string, { id: string; props?: Record<string, unknown>; blocks?: Block[] }>
) {
  const writes: { id?: string; payload?: { blocks?: Block[] } }[] = []
  const from = jest.fn(() => {
    let capturedId: string | undefined
    let payload: { blocks?: Block[] } | undefined
    const chain: Record<string, jest.Mock> = {
      select: jest.fn().mockReturnThis(),
      update: jest.fn((p: { blocks?: Block[] }) => {
        payload = p
        return chain
      }),
      eq: jest.fn((col: string, val: string) => {
        if (col === 'id') {
          capturedId = val
          if (payload) writes.push({ id: val, payload })
        }
        return chain
      }),
      maybeSingle: jest.fn(() => {
        const p = capturedId ? pagesById[capturedId] : undefined
        const row = p
          ? {
              id: p.id,
              parent_id: null,
              type: 'page',
              title: p.id,
              blocks: p.blocks ?? [],
              props: p.props ?? {},
              order: 0,
            }
          : null
        return Promise.resolve({ data: row, error: null })
      }),
    }
    return chain
  })
  return { from, _writes: writes }
}

describe('configureViewFromProposal — linked view (#41)', () => {
  it('resolves config against the TARGET schema and upserts on the HOST with collectionId', async () => {
    const sb = makeMultiSupabase({
      host: { id: 'host', props: {}, blocks: [] }, // NOT a collection — just holds the block
      'coll-src': { id: 'coll-src', props: { [SCHEMA_KEY]: schema }, blocks: [] },
    })
    const out = await configureViewFromProposal(
      sb as never,
      { pageId: 'host', collectionId: 'coll-src', mode: 'board', groupBy: 'Status' },
      () => 'v-linked'
    )
    expect(out).toMatchObject({ id: 'host', replaced: false })
    const write = sb._writes.find((w) => w.id === 'host')
    expect(write?.payload?.blocks).toEqual([
      {
        id: 'v-linked',
        type: 'view',
        mode: 'board',
        groupBy: 'p-status',
        collectionId: 'coll-src',
      },
    ])
  })

  it('throws when the linked target collection is missing (dangling — card reverts, no write)', async () => {
    const sb = makeMultiSupabase({ host: { id: 'host', props: {}, blocks: [] } })
    await expect(
      configureViewFromProposal(
        sb as never,
        { pageId: 'host', collectionId: 'gone', mode: 'table' },
        () => 'x'
      )
    ).rejects.toThrow(/not found/i)
    expect(sb._writes).toHaveLength(0)
  })

  it('throws when the linked target exists but is not a collection', async () => {
    const sb = makeMultiSupabase({
      host: { id: 'host', props: {}, blocks: [] },
      plain: { id: 'plain', props: {}, blocks: [] },
    })
    await expect(
      configureViewFromProposal(
        sb as never,
        { pageId: 'host', collectionId: 'plain', mode: 'table' },
        () => 'x'
      )
    ).rejects.toThrow(/not a collection/i)
    expect(sb._writes).toHaveLength(0)
  })
})

describe('configureViewFromProposal', () => {
  it('upserts a view block onto the collection and saves the blocks', async () => {
    const sb = makeSupabase({ id: 'coll-1', props: { [SCHEMA_KEY]: schema }, blocks: [] })
    const out = await configureViewFromProposal(
      sb as never,
      { pageId: 'coll-1', mode: 'board', groupBy: 'Status' },
      () => 'v-new'
    )
    expect(out).toMatchObject({ id: 'coll-1', replaced: false })
    const payload = sb._update.mock.calls[0][0]
    expect(payload.blocks).toEqual([
      { id: 'v-new', type: 'view', mode: 'board', groupBy: 'p-status' },
    ])
  })

  // #52 fix 2 — a SECOND configure_view over a collection that already has a view
  // SWITCHES the active view: the write reports replaced=true and the previous mode,
  // so the accept path can be honest instead of implying the two views coexist.
  it('reports replaced + the previous mode when it switches an existing active view', async () => {
    const sb = makeSupabase({
      id: 'coll-4',
      props: { [SCHEMA_KEY]: schema },
      blocks: [{ id: 'v-old', type: 'view', mode: 'table' }],
    })
    const out = await configureViewFromProposal(
      sb as never,
      { pageId: 'coll-4', mode: 'board', groupBy: 'Status' },
      () => 'v-UNUSED'
    )
    expect(out).toEqual({ id: 'coll-4', replaced: true })
    // The one view block is reconfigured in place (its id preserved), not duplicated.
    const payload = sb._update.mock.calls[0][0]
    expect(payload.blocks).toEqual([
      { id: 'v-old', type: 'view', mode: 'board', groupBy: 'p-status' },
    ])
  })

  it('throws when the target page does not exist (card can revert)', async () => {
    const sb = makeSupabase(null)
    await expect(
      configureViewFromProposal(sb as never, { pageId: 'ghost', mode: 'table' }, () => 'x')
    ).rejects.toThrow(/not found/i)
    expect(sb._update).not.toHaveBeenCalled()
  })

  it('throws when the target exists but is not a collection (no schema)', async () => {
    const sb = makeSupabase({ id: 'plain', props: {}, blocks: [] })
    await expect(
      configureViewFromProposal(sb as never, { pageId: 'plain', mode: 'table' }, () => 'x')
    ).rejects.toThrow(/not a collection/i)
    expect(sb._update).not.toHaveBeenCalled()
  })

  it('rejects a gantt over a collection with no date property (no write)', async () => {
    const noDates: PropertySchema = [
      { id: 'p-title', name: 'Title', type: 'text' },
      {
        id: 'p-status',
        name: 'Status',
        type: 'status',
        options: [{ id: 'o-todo', label: 'To do' }],
      },
    ]
    const sb = makeSupabase({ id: 'coll-2', props: { [SCHEMA_KEY]: noDates }, blocks: [] })
    await expect(
      configureViewFromProposal(sb as never, { pageId: 'coll-2', mode: 'gantt' }, () => 'x')
    ).rejects.toThrow(/no date property/i)
    expect(sb._update).not.toHaveBeenCalled()
  })

  it('writes a gantt with resolved start/end date ids onto a dated collection', async () => {
    const sb = makeSupabase({ id: 'coll-3', props: { [SCHEMA_KEY]: schema }, blocks: [] })
    await configureViewFromProposal(
      sb as never,
      { pageId: 'coll-3', mode: 'gantt', startDate: 'Due' },
      () => 'v-g'
    )
    const payload = sb._update.mock.calls[0][0]
    expect(payload.blocks).toEqual([{ id: 'v-g', type: 'view', mode: 'gantt', startDate: 'p-due' }])
  })

  // #111: end-to-end for the two new modes — names in, ids out, and NO data in the
  // written block (the figures are read from the records every time).
  it('writes a chart view with resolved property ids and no data (#111)', async () => {
    const withHours: PropertySchema = [...schema, { id: 'p-hours', name: 'Hours', type: 'number' }]
    const sb = makeSupabase({ id: 'coll-4', props: { [SCHEMA_KEY]: withHours }, blocks: [] })
    await configureViewFromProposal(
      sb as never,
      {
        pageId: 'coll-4',
        mode: 'chart',
        chart: { kind: 'line', xProperty: 'Due', series: [{ property: 'Hours', agg: 'sum' }] },
      },
      () => 'v-c'
    )
    const payload = sb._update.mock.calls[0][0]
    expect(payload.blocks).toEqual([
      {
        id: 'v-c',
        type: 'view',
        mode: 'chart',
        chart: { kind: 'line', xProperty: 'p-due', series: [{ property: 'p-hours', agg: 'sum' }] },
      },
    ])
  })

  it('writes a big-number view with the resolved figure property (#111)', async () => {
    const withHours: PropertySchema = [...schema, { id: 'p-hours', name: 'Hours', type: 'number' }]
    const sb = makeSupabase({ id: 'coll-5', props: { [SCHEMA_KEY]: withHours }, blocks: [] })
    await configureViewFromProposal(
      sb as never,
      {
        pageId: 'coll-5',
        mode: 'big-number',
        bigNumber: { property: 'Hours', agg: 'sum', format: 'number' },
      },
      () => 'v-b'
    )
    const payload = sb._update.mock.calls[0][0]
    expect(payload.blocks).toEqual([
      {
        id: 'v-b',
        type: 'view',
        mode: 'big-number',
        bigNumber: { property: 'p-hours', agg: 'sum', format: 'number' },
      },
    ])
  })

  it('SWITCHES an existing table view to a chart, keeping the same block id', async () => {
    const withHours: PropertySchema = [...schema, { id: 'p-hours', name: 'Hours', type: 'number' }]
    const sb = makeSupabase({
      id: 'coll-6',
      props: { [SCHEMA_KEY]: withHours },
      blocks: [{ id: 'v-keep', type: 'view', mode: 'table' } as Block],
    })
    const out = await configureViewFromProposal(
      sb as never,
      {
        pageId: 'coll-6',
        mode: 'chart',
        chart: { kind: 'bar', series: [{ property: 'Hours', agg: 'max' }] },
      },
      () => 'never-minted'
    )
    expect(out.replaced).toBe(true)
    const payload = sb._update.mock.calls[0][0]
    expect(payload.blocks).toEqual([
      {
        id: 'v-keep',
        type: 'view',
        mode: 'chart',
        chart: { kind: 'bar', series: [{ property: 'p-hours', agg: 'max' }] },
      },
    ])
  })
})
