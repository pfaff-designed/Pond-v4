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
 * partial-failure rollback is exercised.
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
}

export function makeFakeSupabase(seed: Row[], failInsertAt?: number) {
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
  const from = () => {
    let op: 'select' | 'insert' | 'update' | 'delete' | null = null
    let insertPayload: Record<string, unknown> | null = null
    const filters: Array<(r: Row) => boolean> = []
    const matching = () => [...pages.values()].filter((r) => filters.every((f) => f(r)))
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
      delete() {
        op = 'delete'
        return builder
      },
      eq(col: string, val: string) {
        filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val)
        return builder
      },
      is(col: string, val: null) {
        // A seed row that omits a column holds null there, as a database row does.
        filters.push((r) => ((r as unknown as Record<string, unknown>)[col] ?? null) === val)
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
      // The root lookup and the delete both await the filtered builder directly.
      then(resolve: (v: { data: Row[] | null; error: null }) => unknown) {
        if (op === 'delete') {
          cascade(matching())
          return Promise.resolve({ data: null, error: null }).then(resolve)
        }
        return Promise.resolve({ data: matching(), error: null }).then(resolve)
      },
    }
    return builder
  }
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: jest.fn(from),
    _pages: pages,
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
