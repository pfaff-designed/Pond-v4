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
    expect(out).toEqual([{ id: 'v-new', type: 'view', mode: 'board', groupBy: 'p-status' }])
  })

  it('appends the view after existing non-view blocks', () => {
    const text: Block = { id: 't1', type: 'text', content: 'hi' }
    const out = upsertViewBlock([text], { mode: 'table' }, () => 'v-new')
    expect(out).toHaveLength(2)
    expect(out[0]).toBe(text)
    expect(viewOf(out)?.id).toBe('v-new')
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
    const v = viewOf(out)
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
    const v = viewOf(out)
    expect(v?.mode).toBe('table')
    expect(v?.groupBy).toBeUndefined()
    expect(v?.sort).toBeUndefined()
  })

  it('reconfigures the top-most view and leaves any others untouched', () => {
    const v1: Block = { id: 'v1', type: 'view', mode: 'table' } as Block
    const v2: Block = { id: 'v2', type: 'view', mode: 'gallery' } as Block
    const out = upsertViewBlock([v1, v2], { mode: 'board', groupBy: 'p-status' }, () => 'v-UNUSED')
    expect((out[0] as { id: string; mode: string }).mode).toBe('board')
    expect(out[0]).toMatchObject({ id: 'v1' })
    expect(out[1]).toBe(v2)
  })

  it('does not mutate the input blocks array', () => {
    const input: Block[] = [{ id: 'v1', type: 'view', mode: 'table' } as Block]
    const snapshot = JSON.parse(JSON.stringify(input))
    upsertViewBlock(input, { mode: 'board', groupBy: 'p-status' }, () => 'x')
    expect(input).toEqual(snapshot)
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

describe('configureViewFromProposal', () => {
  it('upserts a view block onto the collection and saves the blocks', async () => {
    const sb = makeSupabase({ id: 'coll-1', props: { [SCHEMA_KEY]: schema }, blocks: [] })
    const out = await configureViewFromProposal(
      sb as never,
      { pageId: 'coll-1', mode: 'board', groupBy: 'Status' },
      () => 'v-new'
    )
    expect(out).toEqual({ id: 'coll-1' })
    const payload = sb._update.mock.calls[0][0]
    expect(payload.blocks).toEqual([
      { id: 'v-new', type: 'view', mode: 'board', groupBy: 'p-status' },
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
})
