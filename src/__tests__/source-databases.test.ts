/**
 * What the host hands the source picker (#280) — the databases root's children
 * with their record counts, derived from the `['pages']` rows and one count
 * query, through the owners that already decide what a database is.
 */

import { databasesOf, fetchRecordCounts, sourceDatabases } from '@/lib/pages/source-databases'
import { DATABASES_ROOT_TITLE } from '@/lib/pages/databases-root'
import { ROW_TYPE } from '@/lib/properties/schema'
import type { PageRow } from '@/lib/pages/tree'

const row = (p: Partial<PageRow> & Pick<PageRow, 'id' | 'title'>): PageRow => ({
  parent_id: null,
  type: 'page',
  order: 0,
  updated_at: '2026-10-03T00:00:00Z',
  ...p,
})

const ROWS: PageRow[] = [
  row({ id: 'life', title: 'life' }),
  row({ id: 'root', title: DATABASES_ROOT_TITLE, order: 9 }),
  row({ id: 'recipes', title: 'recipes', parent_id: 'root', order: 1 }),
  row({ id: 'calories', title: 'calories', parent_id: 'root', order: 0 }),
  row({ id: 'kitchen', title: 'kitchen renovation', parent_id: 'life' }),
  row({ id: 'untitled', title: '', parent_id: 'root', order: 2 }),
]

describe('databasesOf', () => {
  it('is the databases root’s children, in rail order — a page under life is not one', () => {
    expect(databasesOf(ROWS).map((r) => r.id)).toEqual(['calories', 'recipes', 'untitled'])
  })

  it('matches the root by the one predicate, so a re-cased root still counts', () => {
    const recased = ROWS.map((r) => (r.id === 'root' ? { ...r, title: 'Databases' } : r))
    expect(databasesOf(recased).map((r) => r.id)).toEqual(['calories', 'recipes', 'untitled'])
  })

  it('a pond with no root has no databases', () => {
    expect(databasesOf(ROWS.filter((r) => r.id !== 'root'))).toEqual([])
  })
})

describe('sourceDatabases', () => {
  it('pairs each database with its count; an uncounted one holds 0 and an untitled one reads lowercase', () => {
    const counts = new Map([
      ['recipes', 18],
      ['calories', 412],
    ])
    expect(sourceDatabases(ROWS, counts)).toEqual([
      { id: 'calories', title: 'calories', records: 412, recordsAre: 'pages' },
      { id: 'recipes', title: 'recipes', records: 18, recordsAre: 'pages' },
      // Lowercase — the picker is the machine surface (`PROJECT_RULES.md`).
      { id: 'untitled', title: 'untitled', records: 0, recordsAre: 'pages' },
    ])
  })
})

describe('fetchRecordCounts', () => {
  it('reads only the pond’s `row` pages’ parent ids, once, and counts them by parent', async () => {
    const calls: Array<[string, unknown]> = []
    const builder = {
      select: (c: string) => (calls.push(['select', c]), builder),
      eq: (c: string, v: unknown) => (calls.push(['eq', `${c}=${String(v)}`]), builder),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: [
            { parent_id: 'recipes' },
            { parent_id: 'recipes' },
            { parent_id: 'calories' },
            { parent_id: null },
          ],
          error: null,
        }).then(resolve),
    }
    const from = jest.fn(() => builder)
    const counts = await fetchRecordCounts({ from } as never, 'user-1', 'pond-life')
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('pages')
    expect(calls).toEqual([
      ['select', 'parent_id'],
      ['eq', 'user_id=user-1'],
      ['eq', `type=${ROW_TYPE}`],
      ['eq', 'pond_id=pond-life'],
    ])
    expect([...counts.entries()]).toEqual([
      ['recipes', 2],
      ['calories', 1],
    ])
  })

  it('surfaces a query error', async () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: { message: 'nope' } }).then(resolve),
    }
    await expect(
      fetchRecordCounts({ from: () => builder } as never, 'u', 'pond-life')
    ).rejects.toThrow('nope')
  })
})
