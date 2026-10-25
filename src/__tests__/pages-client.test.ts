/**
 * Unit tests for the unified page-tree persistence layer (src/lib/pages/client.ts).
 *
 * Mirrors the mocked-chain approach used in documents-client.test.ts — no live
 * Supabase. Verifies the CRUD + tree surface the sidebar, page editor, context
 * assembly, and semantic search build on:
 *   - getPage         (by id)
 *   - getChildPages   (direct children; null parent = top-level)
 *   - createPage      (under a parent or top-level)
 *   - saveBlocks      (entire block array written on save)
 *   - updateTitle     (rename)
 *   - deletePage      (subtree cascade handled by the FK)
 *   - matchPages      (match_pages RPC)
 */

import {
  getPage,
  getChildPages,
  listPages,
  createPage,
  saveBlocks,
  updateTitle,
  deletePage,
  movePage,
  duplicatePage,
  matchPages,
  setProperty,
  defineSchema,
} from '@/lib/pages/client'
import { DuplicateTitleError } from '@/lib/pages/dedupe-title'
import { registerStagedFlush } from '@/lib/deletion/staged-ids'
import type { Block } from '@/lib/documents/types'
import { SCHEMA_KEY, type PropertySchema } from '@/lib/properties/schema'

// ── Chain mock helpers ──────────────────────────────────────────────────────

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    single: jest.fn().mockResolvedValue({ data: { id: 'page-1' }, error: null }),
    then: undefined as unknown,
    ...overrides,
  }
  return chain
}

function makeSupabase(chain = makeChain()) {
  return {
    from: jest.fn().mockReturnValue(chain),
    _chain: chain,
  }
}

const sampleBlocks: Block[] = [
  { id: 'b1', type: 'text', content: '# Notes' },
  { id: 'b2', type: 'todo', items: [{ id: 'i1', label: 'Do thing', checked: false }] },
  {
    id: 'b3',
    type: 'table',
    columns: ['Metric', 'Value'],
    rows: [{ id: 'r1', cells: ['MRR', '500'] }],
  },
]

function pageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'page-1',
    parent_id: null,
    type: 'page',
    title: 'Health',
    blocks: sampleBlocks,
    status: null,
    order: 0,
    ...overrides,
  }
}

// ── getPage ──────────────────────────────────────────────────────────────────

describe('getPage', () => {
  it('returns a single page by id', async () => {
    const chain = makeChain({
      maybeSingle: jest
        .fn()
        .mockResolvedValue({ data: pageRow({ parent_id: 'root-1' }), error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await getPage(sb as never, 'page-1')

    expect(sb.from).toHaveBeenCalledWith('pages')
    expect(chain.eq).toHaveBeenCalledWith('id', 'page-1')
    expect(result).not.toBeNull()
    expect(result!.parentId).toBe('root-1')
    expect(result!.type).toBe('page')
    expect(result!.blocks).toEqual(sampleBlocks)
  })

  it('returns null when no page is found', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    const sb = makeSupabase(chain)
    expect(await getPage(sb as never, 'missing')).toBeNull()
  })

  it('coerces a null/invalid blocks column to an empty array', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: pageRow({ blocks: null }), error: null }),
    })
    const sb = makeSupabase(chain)
    const result = await getPage(sb as never, 'page-1')
    expect(result!.blocks).toEqual([])
  })

  it('reads props and coerces a null/array props column to an empty object', async () => {
    const withProps = makeChain({
      maybeSingle: jest
        .fn()
        .mockResolvedValue({ data: pageRow({ props: { count: 3 } }), error: null }),
    })
    expect((await getPage(makeSupabase(withProps) as never, 'page-1'))!.props).toEqual({ count: 3 })

    const badProps = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: pageRow({ props: null }), error: null }),
    })
    expect((await getPage(makeSupabase(badProps) as never, 'page-1'))!.props).toEqual({})
  })

  it('returns null for a 22P02 error (a hand-typed id that is not a valid uuid)', async () => {
    const chain = makeChain({
      maybeSingle: jest
        .fn()
        .mockResolvedValue({ data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } }),
    })
    const sb = makeSupabase(chain)
    expect(await getPage(sb as never, 'not-a-uuid')).toBeNull()
  })

  it('throws on any other Supabase error', async () => {
    const chain = makeChain({
      maybeSingle: jest
        .fn()
        .mockResolvedValue({ data: null, error: { code: 'PGRST500', message: 'network error' } }),
    })
    const sb = makeSupabase(chain)
    await expect(getPage(sb as never, 'page-1')).rejects.toEqual(
      expect.objectContaining({ code: 'PGRST500' })
    )
  })
})

// ── getChildPages ────────────────────────────────────────────────────────────

describe('getChildPages', () => {
  it('fetches children of a parent with eq(parent_id)', async () => {
    const rows = [pageRow({ id: 'c1', parent_id: 'p1', type: 'page', title: 'Sub' })]
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: rows, error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await getChildPages(sb as never, 'user-1', 'p1')

    expect(sb.from).toHaveBeenCalledWith('pages')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(chain.eq).toHaveBeenCalledWith('parent_id', 'p1')
    expect(chain.is).not.toHaveBeenCalled()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c1')
    expect(result[0].parentId).toBe('p1')
  })

  it('uses is(null) for top-level pages when parentId is null', async () => {
    const rows = [pageRow({ id: 'a1', parent_id: null })]
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: rows, error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await getChildPages(sb as never, 'user-1', null)

    expect(chain.is).toHaveBeenCalledWith('parent_id', null)
    expect(result[0].parentId).toBeNull()
  })

  it('returns an empty array when there are no children', async () => {
    const chain = makeChain({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })
    const sb = makeSupabase(chain)
    expect(await getChildPages(sb as never, 'user-1', 'p1')).toEqual([])
  })
})

// ── listPages ─────────────────────────────────────────────────────────────────

describe('listPages', () => {
  it("returns the user's pages as a flat list ordered by order", async () => {
    const rows = [
      pageRow({ id: 'a1', parent_id: null, type: 'page', title: 'Personal' }),
      pageRow({ id: 'c1', parent_id: 'a1', type: 'page', title: 'Reading goals' }),
    ]
    const chain = makeChain({ order: jest.fn().mockResolvedValue({ data: rows, error: null }) })
    const sb = makeSupabase(chain)

    const result = await listPages(sb as never, 'user-1', 'pond-life')

    expect(sb.from).toHaveBeenCalledWith('pages')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(chain.eq).toHaveBeenCalledWith('pond_id', 'pond-life')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'a1', title: 'Personal', parentId: null })
    expect(result[1]).toMatchObject({ id: 'c1', title: 'Reading goals', parentId: 'a1' })
  })

  it('returns [] when the user has no pages', async () => {
    const chain = makeChain({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })
    const sb = makeSupabase(chain)
    expect(await listPages(sb as never, 'user-1', 'pond-life')).toEqual([])
  })
})

// ── createPage ───────────────────────────────────────────────────────────────

describe('createPage', () => {
  it('inserts a child page with user_id, parent_id and type', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'page-new' }, error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await createPage(sb as never, 'user-1', {
      parentId: 'parent-1',
      type: 'page',
      title: 'Sub-page',
      blocks: sampleBlocks,
      pondId: null,
    })

    expect(sb.from).toHaveBeenCalledWith('pages')
    const inserted = chain.insert.mock.calls[0][0]
    expect(inserted).toMatchObject({
      user_id: 'user-1',
      parent_id: 'parent-1',
      type: 'page',
      title: 'Sub-page',
      blocks: sampleBlocks,
    })
    expect(result.id).toBe('page-new')
    expect(result.parentId).toBe('parent-1')
    expect(result.blocks).toEqual(sampleBlocks)
  })

  it('creates a top-level page (null parent) with sensible defaults', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'page-top' }, error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await createPage(sb as never, 'user-1', { pondId: null })

    const inserted = chain.insert.mock.calls[0][0]
    expect(inserted.user_id).toBe('user-1')
    expect(inserted.parent_id ?? null).toBeNull()
    expect(inserted.type).toBe('page')
    expect(inserted.blocks).toEqual([])
    expect(inserted.props).toEqual({})
    expect(result.id).toBe('page-top')
    expect(result.parentId).toBeNull()
  })

  it('throws when the insert fails', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    })
    const sb = makeSupabase(chain)
    await expect(createPage(sb as never, 'user-1', { pondId: null })).rejects.toThrow(/boom/)
  })

  it('auto-suffixes and retries when the first insert hits a sibling-name collision (#84)', async () => {
    // First insert violates the unique index (23505); the retry reads siblings
    // (`data` on the chain) and inserts the suffixed title.
    const chain = makeChain({
      single: jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate' } })
        .mockResolvedValueOnce({ data: { id: 'page-new' }, error: null }),
      data: [{ id: 'x', title: 'Personal' }],
    })
    const sb = makeSupabase(chain)

    const result = await createPage(sb as never, 'user-1', { title: 'Personal', pondId: null })

    // Inserted twice: original attempt, then the suffixed retry. (The insert
    // payload is mutated in place, so assert the count + the final resolved title
    // rather than per-call snapshots.)
    expect(chain.insert).toHaveBeenCalledTimes(2)
    expect(result.title).toBe('Personal 2')
  })

  it('preferFreeTitle skips the sibling read for a blank title (#84 exemption)', async () => {
    // A blank title never collides (#84 exempts it from the unique index), so
    // the pre-read must not run — it would otherwise rename an untitled page's
    // database to "Untitled" for no reason.
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'page-blank' }, error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await createPage(sb as never, 'user-1', {
      parentId: 'parent-1',
      preferFreeTitle: true,
      pondId: null,
    })

    expect(chain.insert).toHaveBeenCalledTimes(1)
    expect(chain.insert.mock.calls[0][0].title).toBe('')
    expect(chain.select).not.toHaveBeenCalledWith('id, title')
    expect(result.title).toBe('')
  })

  it('awaits a registered staged-deletion flush before the insert (KAN-273)', async () => {
    const order: string[] = []
    const chain = makeChain({
      single: jest.fn().mockImplementation(async () => {
        order.push('insert')
        return { data: { id: 'page-new' }, error: null }
      }),
    })
    const sb = makeSupabase(chain)

    const unregister = registerStagedFlush(async () => {
      order.push('flush-start')
      await Promise.resolve()
      order.push('flush-end')
    })
    try {
      await createPage(sb as never, 'user-1', { pondId: null })
    } finally {
      unregister()
    }

    expect(order).toEqual(['flush-start', 'flush-end', 'insert'])
  })
})

// ── saveBlocks / updateTitle ─────────────────────────────────────────────────

describe('saveBlocks', () => {
  it('writes the entire block array to pages and bumps updated_at', async () => {
    const chain = makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) })
    const sb = makeSupabase(chain)

    await saveBlocks(sb as never, 'page-1', sampleBlocks)

    expect(sb.from).toHaveBeenCalledWith('pages')
    const updated = chain.update.mock.calls[0][0]
    expect(updated.blocks).toEqual(sampleBlocks)
    expect(typeof updated.updated_at).toBe('string')
    expect(chain.eq).toHaveBeenCalledWith('id', 'page-1')
  })

  it('throws when the update errors', async () => {
    const chain = makeChain({
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'nope' } }),
    })
    const sb = makeSupabase(chain)
    await expect(saveBlocks(sb as never, 'page-1', [])).rejects.toThrow(/nope/)
  })
})

describe('updateTitle', () => {
  it('updates the title for a page', async () => {
    // updateTitle pre-checks siblings (#84): the self-lookup returns null here
    // (maybeSingle default) so the pre-check is skipped; the thenable chain lets
    // the update's `await …eq('id', id)` resolve to a success.
    const chain = makeChain({
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    })
    const sb = makeSupabase(chain)

    await updateTitle(sb as never, 'page-1', 'Renamed')

    const updated = chain.update.mock.calls[0][0]
    expect(updated.title).toBe('Renamed')
    expect(chain.eq).toHaveBeenCalledWith('id', 'page-1')
  })

  it('rejects a colliding rename via the pre-check, before any write (#84)', async () => {
    // Self-lookup resolves to a real row; siblingRows (await on the thenable
    // chain) returns a case-insensitively clashing sibling. The pre-check must
    // throw WITHOUT ever calling .update() — proving it works even on a DB where
    // the unique index isn't present.
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { user_id: 'u1', workspace: 'main', parent_id: 'root-1' },
        error: null,
      }),
      then: (resolve: (v: unknown) => void) =>
        resolve({
          data: [
            { id: 'page-1', title: 'Health' }, // self — excluded
            { id: 'page-2', title: 'personal' }, // clashes with "Personal"
          ],
          error: null,
        }),
    })
    const sb = makeSupabase(chain)

    await expect(updateTitle(sb as never, 'page-1', 'Personal')).rejects.toBeInstanceOf(
      DuplicateTitleError
    )
    expect(chain.update).not.toHaveBeenCalled()
  })

  it('maps a sibling-name unique violation (23505) to DuplicateTitleError as a backstop (#84)', async () => {
    // No self row (pre-check skipped); the update itself hits the index race and
    // the 23505 mapping surfaces DuplicateTitleError.
    const chain = makeChain({
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: { code: '23505', message: 'dup' } }),
    })
    const sb = makeSupabase(chain)

    await expect(updateTitle(sb as never, 'page-1', 'Personal')).rejects.toBeInstanceOf(
      DuplicateTitleError
    )
  })
})

// ── deletePage ───────────────────────────────────────────────────────────────

describe('deletePage', () => {
  it('deletes a page by id (subtree cascade handled by the FK)', async () => {
    const chain = makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) })
    const sb = makeSupabase(chain)

    await deletePage(sb as never, 'page-1')

    expect(sb.from).toHaveBeenCalledWith('pages')
    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', 'page-1')
  })

  it('throws when the delete errors', async () => {
    const chain = makeChain({
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'del boom' } }),
    })
    const sb = makeSupabase(chain)
    await expect(deletePage(sb as never, 'page-1')).rejects.toThrow(/del boom/)
  })
})

// ── movePage ─────────────────────────────────────────────────────────────────

function moveChangeLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'record-1',
    user_id: 'user-1',
    pond_id: 'pond-1',
    status: 'accepted',
    action: 'move',
    actor: 'you',
    target_page_id: 'x',
    target_block_id: null,
    before: { parentId: 'old-parent', parentTitle: 'Old parent', siblingOrder: ['x'] },
    after: { parentId: 'health', parentTitle: 'Health', siblingOrder: ['a', 'x', 'b'] },
    source_thread_id: null,
    tool_call_id: null,
    read: null,
    links: {},
    transitions: [],
    created_at: '2026-10-20T00:00:00.000Z',
    status_at: '2026-10-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('movePage', () => {
  it('calls the move_page RPC with the reparent and the full sibling order', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: moveChangeLogRow(), error: null })
    const sb = { rpc }

    await movePage(sb as never, {
      id: 'x',
      newParentId: 'health',
      siblingOrder: ['a', 'x', 'b'],
    })

    expect(rpc).toHaveBeenCalledWith('move_page', {
      p_page_id: 'x',
      p_new_parent_id: 'health',
      p_sibling_order: ['a', 'x', 'b'],
    })
  })

  it('moves a page to top-level with a null parent id', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValue({ data: moveChangeLogRow({ target_page_id: 'x' }), error: null })
    const sb = { rpc }

    await movePage(sb as never, { id: 'x', newParentId: null, siblingOrder: ['x'] })

    expect(rpc).toHaveBeenCalledWith('move_page', {
      p_page_id: 'x',
      p_new_parent_id: null,
      p_sibling_order: ['x'],
    })
  })

  it('returns the RPC row mapped through mapChangeLogRow', async () => {
    const sb = { rpc: jest.fn().mockResolvedValue({ data: moveChangeLogRow(), error: null }) }

    const record = await movePage(sb as never, {
      id: 'x',
      newParentId: 'health',
      siblingOrder: ['a', 'x', 'b'],
    })

    expect(record).toEqual({
      id: 'record-1',
      userId: 'user-1',
      pondId: 'pond-1',
      status: 'accepted',
      action: 'move',
      actor: 'you',
      targetPageId: 'x',
      targetBlockId: null,
      before: { parentId: 'old-parent', parentTitle: 'Old parent', siblingOrder: ['x'] },
      after: { parentId: 'health', parentTitle: 'Health', siblingOrder: ['a', 'x', 'b'] },
      sourceThreadId: null,
      toolCallId: null,
      read: null,
      links: {},
      transitions: [],
      createdAt: '2026-10-20T00:00:00.000Z',
      statusAt: '2026-10-20T00:00:00.000Z',
    })
  })

  it('throws when the RPC errors', async () => {
    const sb = { rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'move boom' } }) }
    await expect(
      movePage(sb as never, { id: 'x', newParentId: null, siblingOrder: ['x'] })
    ).rejects.toThrow(/move boom/)
  })

  it('throws when the RPC returns no record', async () => {
    const sb = { rpc: jest.fn().mockResolvedValue({ data: null, error: null }) }
    await expect(
      movePage(sb as never, { id: 'x', newParentId: null, siblingOrder: ['x'] })
    ).rejects.toThrow(/no record/)
  })

  it('forwards newTitle as p_new_title when a rename is needed (KAN-470)', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: moveChangeLogRow(), error: null })
    const sb = { rpc }

    await movePage(sb as never, {
      id: 'x',
      newParentId: 'health',
      siblingOrder: ['a', 'x', 'b'],
      newTitle: 'Notes 2',
    })

    expect(rpc).toHaveBeenCalledWith('move_page', {
      p_page_id: 'x',
      p_new_parent_id: 'health',
      p_sibling_order: ['a', 'x', 'b'],
      p_new_title: 'Notes 2',
    })
  })

  it('omits p_new_title when newTitle is not passed', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: moveChangeLogRow(), error: null })
    const sb = { rpc }

    await movePage(sb as never, { id: 'x', newParentId: 'health', siblingOrder: ['a', 'x', 'b'] })

    expect(rpc).toHaveBeenCalledWith('move_page', {
      p_page_id: 'x',
      p_new_parent_id: 'health',
      p_sibling_order: ['a', 'x', 'b'],
    })
  })
})

// ── duplicatePage ────────────────────────────────────────────────────────────

function duplicateChangeLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'record-1',
    user_id: 'user-1',
    pond_id: 'pond-1',
    status: 'accepted',
    action: 'duplicate_page',
    actor: 'you',
    target_page_id: 'copy-1',
    target_block_id: null,
    before: null,
    after: { pageId: 'copy-1' },
    source_thread_id: null,
    tool_call_id: null,
    read: null,
    links: {},
    transitions: [],
    created_at: '2026-10-24T00:00:00.000Z',
    status_at: '2026-10-24T00:00:00.000Z',
    ...overrides,
  }
}

describe('duplicatePage', () => {
  it('dedupes the root title against its siblings, then calls the RPC with the deduped title', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { title: 'Recipes', parent_id: 'root-1', pond_id: 'pond-1' },
        error: null,
      }),
      then: (resolve: (v: unknown) => void) =>
        resolve({
          data: [
            { id: 'page-1', title: 'Recipes' },
            { id: 'page-2', title: 'Shopping' },
          ],
          error: null,
        }),
    })
    const rpc = jest.fn().mockResolvedValue({ data: duplicateChangeLogRow(), error: null })
    const sb = { ...makeSupabase(chain), rpc }

    await duplicatePage(sb as never, 'user-1', 'page-1')

    expect(rpc).toHaveBeenCalledWith('duplicate_page', {
      p_page_id: 'page-1',
      p_title: 'Recipes 2',
    })
  })

  it('maps the returned row through mapChangeLogRow', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { title: 'Recipes', parent_id: null, pond_id: 'pond-1' },
        error: null,
      }),
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    })
    const rpc = jest.fn().mockResolvedValue({ data: duplicateChangeLogRow(), error: null })
    const sb = { ...makeSupabase(chain), rpc }

    const record = await duplicatePage(sb as never, 'user-1', 'page-1')

    expect(record).toMatchObject({
      id: 'record-1',
      action: 'duplicate_page',
      targetPageId: 'copy-1',
      after: { pageId: 'copy-1' },
    })
  })

  it('skips the sibling read for a page that no longer exists — the RPC rejects it instead', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'page not found' } })
    const sb = { ...makeSupabase(chain), rpc }

    await expect(duplicatePage(sb as never, 'user-1', 'missing')).rejects.toThrow(/not found/)
    expect(rpc).toHaveBeenCalledWith('duplicate_page', { p_page_id: 'missing', p_title: '' })
  })

  it('excludes trashed rows from the sibling dedupe, so a freed name is reused (KAN-468)', async () => {
    // A trashed "Recipes 2" (⌘Z'd copy) no longer blocks `pages_sibling_title_pond_uniq`
    // (0027's partial index is `where deleted_at is null`) — so the next duplicate must
    // dedupe back to "Recipes 2", not skip to "Recipes 3". The query must filter
    // `deleted_at is null` itself; a live DB would never hand back the trashed row.
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { title: 'Recipes', parent_id: 'root-1', pond_id: 'pond-1' },
        error: null,
      }),
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: [{ id: 'page-1', title: 'Recipes' }], error: null }),
    })
    const rpc = jest.fn().mockResolvedValue({ data: duplicateChangeLogRow(), error: null })
    const sb = { ...makeSupabase(chain), rpc }

    await duplicatePage(sb as never, 'user-1', 'page-1')

    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    expect(rpc).toHaveBeenCalledWith('duplicate_page', {
      p_page_id: 'page-1',
      p_title: 'Recipes 2',
    })
  })

  it('throws when the RPC errors', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { title: 'Recipes', parent_id: null, pond_id: 'pond-1' },
        error: null,
      }),
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    })
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'dup boom' } })
    const sb = { ...makeSupabase(chain), rpc }

    await expect(duplicatePage(sb as never, 'user-1', 'page-1')).rejects.toThrow(/dup boom/)
  })

  it('throws when the RPC returns no record', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { title: 'Recipes', parent_id: null, pond_id: 'pond-1' },
        error: null,
      }),
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    })
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null })
    const sb = { ...makeSupabase(chain), rpc }

    await expect(duplicatePage(sb as never, 'user-1', 'page-1')).rejects.toThrow(/no record/)
  })
})

// ── setProperty / defineSchema (#17, merge-safe props writes) ─────────────────

const SCHEMA: PropertySchema = [
  { id: 'stage', name: 'Stage', type: 'status' },
  { id: 'title', name: 'Title', type: 'text' },
]

describe('setProperty', () => {
  it('merges one value into props, preserving _schema and sibling values', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({
        data: pageRow({ props: { [SCHEMA_KEY]: SCHEMA, stage: 'todo' } }),
        error: null,
      }),
    })
    const sb = makeSupabase(chain)

    await setProperty(sb as never, 'page-1', 'stage', 'done')

    const updated = chain.update.mock.calls[0][0]
    expect(updated.props[SCHEMA_KEY]).toEqual(SCHEMA)
    expect(updated.props.stage).toBe('done')
    expect(typeof updated.updated_at).toBe('string')
    expect(chain.eq).toHaveBeenCalledWith('id', 'page-1')
  })

  it('is a no-op on a missing page (never writes)', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    const sb = makeSupabase(chain)

    await setProperty(sb as never, 'missing', 'stage', 'done')

    expect(chain.update).not.toHaveBeenCalled()
  })
})

describe('defineSchema', () => {
  it('writes _schema while preserving existing row values (never clobbers them)', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({
        data: pageRow({ props: { title: 'keep me' } }),
        error: null,
      }),
    })
    const sb = makeSupabase(chain)

    await defineSchema(sb as never, 'page-1', SCHEMA)

    const updated = chain.update.mock.calls[0][0]
    expect(updated.props[SCHEMA_KEY]).toEqual(SCHEMA)
    expect(updated.props.title).toBe('keep me')
  })
})

// ── matchPages ───────────────────────────────────────────────────────────────

describe('matchPages', () => {
  it('calls the match_pages RPC and maps rows to MatchedPage', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'd1',
          parent_id: 'n1',
          type: 'page',
          title: 'Oak table',
          blocks: sampleBlocks,
          status: null,
          similarity: 0.73,
        },
      ],
      error: null,
    })
    const sb = { rpc }
    const vec = [0.1, 0.2, 0.3]

    const out = await matchPages(sb as never, 'user-1', vec, 3)

    expect(rpc).toHaveBeenCalledWith('match_pages', {
      query_embedding: vec,
      match_user_id: 'user-1',
      match_count: 3,
    })
    expect(out).toEqual([
      {
        id: 'd1',
        parentId: 'n1',
        type: 'page',
        title: 'Oak table',
        blocks: sampleBlocks,
        props: {},
        order: 0,
        similarity: 0.73,
      },
    ])
  })

  it('returns [] when the RPC yields no rows', async () => {
    const sb = { rpc: jest.fn().mockResolvedValue({ data: null, error: null }) }
    expect(await matchPages(sb as never, 'user-1', [0.1])).toEqual([])
  })

  it('throws when the RPC errors', async () => {
    const sb = { rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'rpc boom' } }) }
    await expect(matchPages(sb as never, 'user-1', [0.1])).rejects.toThrow(/rpc boom/)
  })
})
