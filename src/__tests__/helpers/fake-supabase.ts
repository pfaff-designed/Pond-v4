/**
 * An in-memory fake Supabase for the pages table — ONE harness for every test that
 * drives the client write path without a database (#101 `list-to-table.test.ts`,
 * #280 `create-database.test.ts`), so a second copy never drifts from the first.
 *
 * Covers the call shapes those paths use: the root lookup (select→eq→eq→is → a
 * thenable list), `createPage` (insert→select→single), `deletePage` (delete→eq,
 * cascading to children the way the self-referential FK does), and
 * `getPage` / `saveBlocks` for a composition check. Assert end-state via
 * `_pages`. `failInsertAt` makes the Nth insert (1-based) fail, which is how a
 * partial-failure rollback is exercised. `tables` seeds any other table — `ponds`,
 * say — for reads only. `_inserts` counts every insert `.single()` has settled,
 * for a caller asserting it never retried.
 */

export type Row = {
  id: string
  user_id: string
  pond_id?: string | null
  parent_id: string | null
  type: string
  title: string
  blocks: unknown
  props: Record<string, unknown>
  order: number
  deleted_at?: string | null
}

type AnyRow = Record<string, unknown>

export function makeFakeSupabase(
  seed: Row[],
  failInsertAt?: number,
  tables: Record<string, AnyRow[]> = {}
) {
  const pages = new Map<string, Row>(seed.map((r) => [r.id, { ...r }]))
  let seq = 0
  let inserts = 0
  /** Delete these rows and, recursively, their children — the FK cascade. */
  const cascade = (victims: Row[]) => {
    for (const victim of victims) {
      pages.delete(victim.id)
      cascade([...pages.values()].filter((r) => r.parent_id === victim.id))
    }
  }
  const from = (table = 'pages') => {
    let op: 'select' | 'insert' | 'update' | 'delete' | null = null
    let insertPayload: Record<string, unknown> | null = null
    let updatePayload: Record<string, unknown> | null = null
    const filters: Array<(r: AnyRow) => boolean> = []
    const source = (): AnyRow[] =>
      table === 'pages' ? ([...pages.values()] as unknown as AnyRow[]) : (tables[table] ?? [])
    const matching = () => source().filter((r) => filters.every((f) => f(r)))
    const builder = {
      select() {
        if (op === null) op = 'select'
        return builder
      },
      insert(payload: Record<string, unknown>) {
        op = 'insert'
        insertPayload = payload
        return builder
      },
      update(payload: Record<string, unknown>) {
        op = 'update'
        updatePayload = payload
        return builder
      },
      delete() {
        op = 'delete'
        return builder
      },
      eq(col: string, val: string) {
        filters.push((r) => r[col] === val)
        return builder
      },
      // A seed row that omits a column holds null there, as a database row does.
      is(col: string, val: null) {
        filters.push((r) => (r[col] ?? null) === val)
        return builder
      },
      /** Case-insensitive equality: every caller here passes a bare name, no `%`. */
      ilike(col: string, val: string) {
        filters.push((r) => String(r[col]).toLowerCase() === val.toLowerCase())
        return builder
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]))
        return builder
      },
      order() {
        return builder
      },
      limit() {
        return builder
      },
      maybeSingle() {
        return Promise.resolve({ data: matching()[0] ?? null, error: null })
      },
      single() {
        // A non-23505 code, so createPage surfaces it rather than retrying with a
        // de-duplicated title.
        if (op === 'insert' && ++inserts === failInsertAt) {
          return Promise.resolve({
            data: null,
            error: { code: '08006', message: 'connection failure' },
          })
        }
        const id = `new-${++seq}`
        const row: Row = {
          id,
          user_id: (insertPayload?.user_id as string) ?? 'user-1',
          pond_id: (insertPayload?.pond_id as string) ?? null,
          parent_id: (insertPayload?.parent_id as string) ?? null,
          type: (insertPayload?.type as string) ?? 'page',
          title: (insertPayload?.title as string) ?? '',
          blocks: insertPayload?.blocks ?? [],
          props: (insertPayload?.props as Record<string, unknown>) ?? {},
          order: 0,
        }
        pages.set(id, row)
        return Promise.resolve({ data: { id }, error: null })
      },
      // The root lookup, the delete and the update all await the filtered
      // builder directly (`saveBlocks`'s own call shape, among others).
      then(resolve: (v: { data: AnyRow[] | null; error: null }) => unknown) {
        if (op === 'delete') {
          cascade(matching() as unknown as Row[])
          return Promise.resolve({ data: null, error: null }).then(resolve)
        }
        if (op === 'update') {
          for (const row of matching()) Object.assign(row, updatePayload)
          return Promise.resolve({ data: null, error: null }).then(resolve)
        }
        return Promise.resolve({ data: matching(), error: null }).then(resolve)
      },
    }
    return builder
  }
  /**
   * `move_page` (migration 0030): reparent, densely reindex the destination
   * sibling group, and hand back the `move` change_log row the real RPC
   * inserts in the same statement — movePage (src/lib/pages/client.ts) maps
   * it straight through `mapChangeLogRow`.
   */
  const rpc = (fn: string, params: Record<string, unknown>) => {
    if (fn !== 'move_page') {
      throw new Error(`fake-supabase: unmodelled rpc '${fn}'`)
    }
    const pageId = params.p_page_id as string
    const newParentId = (params.p_new_parent_id as string | null) ?? null
    const siblingOrder = params.p_sibling_order as string[]
    const page = pages.get(pageId)
    if (!page) {
      return Promise.resolve({ data: null, error: { message: `page ${pageId} not found` } })
    }
    const oldParentId = page.parent_id
    page.parent_id = newParentId
    siblingOrder.forEach((id, index) => {
      const row = pages.get(id)
      if (row) row.order = index
    })
    const now = new Date().toISOString()
    const record = {
      id: `move-${++seq}`,
      user_id: page.user_id,
      pond_id: page.pond_id ?? null,
      status: 'accepted',
      action: 'move',
      actor: 'you',
      target_page_id: pageId,
      target_block_id: null,
      before: { parentId: oldParentId, parentTitle: '', siblingOrder: [] },
      after: { parentId: newParentId, parentTitle: '', siblingOrder },
      source_thread_id: null,
      tool_call_id: null,
      read: null,
      links: {},
      transitions: [],
      created_at: now,
      status_at: now,
    }
    return Promise.resolve({ data: record, error: null })
  }
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: jest.fn(from),
    rpc: jest.fn(rpc),
    _pages: pages,
    get _inserts() {
      return inserts
    },
  }
}

export const existingRoot: Row = {
  id: 'root-db',
  user_id: 'user-1',
  parent_id: null,
  type: 'page',
  title: 'databases',
  blocks: [],
  props: {},
  order: 9,
}
