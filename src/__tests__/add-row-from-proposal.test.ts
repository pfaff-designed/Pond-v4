/**
 * Tests for the AI add_row accept path (src/lib/pages/create-page.ts).
 *
 * #18: an accepted add_row proposal confirms the target is a collection, resolves
 * the model's name→value map against that collection's schema (by property name,
 * case-insensitive; coerced to type; unknown names dropped), and creates a
 * `type='row'` child page carrying ONLY those values (never a _schema). Mirrors the
 * mocked-chain approach in define-schema-from-proposal.test.ts — no live Supabase.
 */

import { resolveRowValues, addRowFromProposal } from '@/lib/pages/create-page'
import { SCHEMA_KEY, ROW_TYPE, type PropertySchema } from '@/lib/properties/schema'

const schema: PropertySchema = [
  { id: 'p-author', name: 'Author', type: 'text' },
  { id: 'p-rating', name: 'Rating', type: 'number' },
  { id: 'p-done', name: 'Done', type: 'checkbox' },
  {
    id: 'p-status',
    name: 'Status',
    type: 'status',
    options: [
      { id: 'o-r', label: 'Reading' },
      { id: 'o-f', label: 'Finished' },
    ],
  },
]

// ── resolveRowValues — name→id resolution + lenient coercion ─────────────────

describe('resolveRowValues', () => {
  it('resolves each property name to its stable id and keeps the value', () => {
    expect(resolveRowValues(schema, { Author: 'Frank Herbert', Rating: 5 })).toEqual({
      'p-author': 'Frank Herbert',
      'p-rating': 5,
    })
  })

  it('matches property names case-insensitively', () => {
    expect(resolveRowValues(schema, { author: 'Le Guin', RATING: 4 })).toEqual({
      'p-author': 'Le Guin',
      'p-rating': 4,
    })
  })

  it('drops a name that is not in the schema (lenient, #18 decision 9)', () => {
    expect(resolveRowValues(schema, { Author: 'Herbert', Nonsense: 'x' })).toEqual({
      'p-author': 'Herbert',
    })
  })

  it('coerces a wrong-typed value to empty rather than hard-failing', () => {
    // Rating is a number; a string collapses to the type's empty (null).
    expect(resolveRowValues(schema, { Rating: 'not a number' })).toEqual({ 'p-rating': null })
  })

  it('coerces a checkbox and resolves a status label to its option id', () => {
    // A select/status value is stored as the option *id*, not the label: the model
    // proposes "Reading" → resolved to its stable id (rename-safe, #19 prereq).
    expect(resolveRowValues(schema, { Done: true, Status: 'Reading' })).toEqual({
      'p-done': true,
      'p-status': 'o-r',
    })
  })

  it('matches a status label case-insensitively when resolving to an id', () => {
    expect(resolveRowValues(schema, { Status: 'finished' })).toEqual({ 'p-status': 'o-f' })
  })

  it('keeps a status value that is already an option id (idempotent)', () => {
    expect(resolveRowValues(schema, { Status: 'o-r' })).toEqual({ 'p-status': 'o-r' })
  })

  it('keeps an off-schema status value raw rather than dropping it (lenient)', () => {
    expect(resolveRowValues(schema, { Status: 'Abandoned' })).toEqual({ 'p-status': 'Abandoned' })
  })

  it('never emits the reserved _schema key', () => {
    const out = resolveRowValues(schema, { _schema: 'malicious', Author: 'ok' })
    expect(out[SCHEMA_KEY]).toBeUndefined()
    expect(out).toEqual({ 'p-author': 'ok' })
  })
})

// ── addRowFromProposal — guards + row creation ───────────────────────────────

function makeSupabase(collection: { id: string; props?: Record<string, unknown> } | null) {
  const row = collection
    ? {
        id: collection.id,
        parent_id: null,
        type: 'page',
        title: 'Reading List',
        blocks: [],
        props: collection.props ?? {},
        order: 0,
      }
    : null
  const insert = jest.fn().mockReturnThis()
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
    insert,
    single: jest.fn().mockResolvedValue({ data: { id: 'row-1' }, error: null }),
  }
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: jest.fn().mockReturnValue(chain),
    _chain: chain,
    _insert: insert,
  }
}

describe('addRowFromProposal', () => {
  it('creates a type=row child of the collection with resolved values', async () => {
    const sb = makeSupabase({ id: 'coll-1', props: { [SCHEMA_KEY]: schema } })
    const created = await addRowFromProposal(sb as never, {
      collectionId: 'coll-1',
      title: 'Dune',
      props: { Author: 'Frank Herbert', Rating: 5 },
    })
    expect(created).toEqual({ id: 'row-1' })
    const payload = sb._insert.mock.calls[0][0]
    expect(payload.type).toBe(ROW_TYPE)
    expect(payload.parent_id).toBe('coll-1')
    expect(payload.title).toBe('Dune')
    expect(payload.props).toEqual({ 'p-author': 'Frank Herbert', 'p-rating': 5 })
    // A row never carries a schema of its own.
    expect(payload.props[SCHEMA_KEY]).toBeUndefined()
  })

  it('defaults an omitted title to empty', async () => {
    const sb = makeSupabase({ id: 'coll-1', props: { [SCHEMA_KEY]: schema } })
    await addRowFromProposal(sb as never, { collectionId: 'coll-1', props: {} })
    expect(sb._insert.mock.calls[0][0].title).toBe('')
  })

  it('throws when the target page does not exist (card can revert)', async () => {
    const sb = makeSupabase(null)
    await expect(
      addRowFromProposal(sb as never, { collectionId: 'ghost', props: {} })
    ).rejects.toThrow(/not found/i)
    expect(sb._insert).not.toHaveBeenCalled()
  })

  it('throws when the target exists but is not a collection (no schema)', async () => {
    const sb = makeSupabase({ id: 'plain', props: {} })
    await expect(
      addRowFromProposal(sb as never, { collectionId: 'plain', props: { Author: 'x' } })
    ).rejects.toThrow(/not a collection/i)
    expect(sb._insert).not.toHaveBeenCalled()
  })
})

// ── addRowFromProposal — relation-value TITLE resolution (#40 slice C) ───────
//
// The model proposes a relation value as target-row TITLES ("Packs With":
// ["Tent"]); before this fix the z.array(z.string()) coercion stored those titles
// verbatim as dangling fake ids. The accept path now resolves each entry against
// the relation's TARGET collection rows — a resolved title stores the row id; an
// unresolvable or duplicate-titled entry is DROPPED (lenient, #18 decision 9 —
// but NEVER written raw). Needs a richer mock than the shared chain above: the
// resolution reads the target's child rows (select…order).

interface StoredPage {
  id: string
  parent_id: string | null
  type: string
  title: string
  blocks: unknown[]
  props: Record<string, unknown>
  order: number
}

function makeStoreSupabase(pages: StoredPage[]) {
  const inserts: Array<Record<string, unknown>> = []
  const makeBuilder = () => {
    const filters: Record<string, unknown> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        filters[col] = val
        return builder
      },
      is: (col: string, val: unknown) => {
        filters[col] = val
        return builder
      },
      order: () => {
        const data = pages.filter((p) =>
          'parent_id' in filters ? p.parent_id === filters.parent_id : true
        )
        return Promise.resolve({ data, error: null })
      },
      maybeSingle: () =>
        Promise.resolve({ data: pages.find((p) => p.id === filters.id) ?? null, error: null }),
      insert: (payload: Record<string, unknown>) => {
        inserts.push(payload)
        return builder
      },
      single: () => Promise.resolve({ data: { id: 'row-new' }, error: null }),
    }
    return builder
  }
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: () => makeBuilder(),
    _inserts: inserts,
  }
}

function tripStore(): StoredPage[] {
  return [
    {
      id: 'coll-trip',
      parent_id: null,
      type: 'page',
      title: 'Trip Packing',
      blocks: [],
      props: {
        [SCHEMA_KEY]: [
          { id: 'p-packs', name: 'Packs With', type: 'relation', target: 'coll-trip' },
        ],
      },
      order: 0,
    },
    {
      id: 'row-tent',
      parent_id: 'coll-trip',
      type: 'row',
      title: 'Tent',
      blocks: [],
      props: {},
      order: 0,
    },
    {
      id: 'row-rope',
      parent_id: 'coll-trip',
      type: 'row',
      title: 'Rope',
      blocks: [],
      props: {},
      order: 1,
    },
  ]
}

describe('addRowFromProposal — relation-value titles resolve to row ids', () => {
  it('stores the resolved row id for a relation value given as a title, never the raw title', async () => {
    const sb = makeStoreSupabase(tripStore())
    await addRowFromProposal(sb as never, {
      collectionId: 'coll-trip',
      title: 'Stove',
      props: { 'Packs With': ['Tent'] },
    })
    expect(sb._inserts[0].props).toEqual({ 'p-packs': ['row-tent'] })
  })

  it('keeps an entry that is already a target row id (idempotent) and dedupes', async () => {
    const sb = makeStoreSupabase(tripStore())
    await addRowFromProposal(sb as never, {
      collectionId: 'coll-trip',
      title: 'Stove',
      props: { 'Packs With': ['row-tent', 'Tent', 'Rope'] },
    })
    expect(sb._inserts[0].props).toEqual({ 'p-packs': ['row-tent', 'row-rope'] })
  })

  it('drops an unresolvable title rather than writing a dangling id (lenient)', async () => {
    const sb = makeStoreSupabase(tripStore())
    await addRowFromProposal(sb as never, {
      collectionId: 'coll-trip',
      title: 'Stove',
      props: { 'Packs With': ['Tent', 'Lantern'] },
    })
    expect(sb._inserts[0].props).toEqual({ 'p-packs': ['row-tent'] })
  })

  it('drops a duplicate-titled (ambiguous) entry rather than guessing', async () => {
    const pages = tripStore()
    pages.push({
      id: 'row-tent-2',
      parent_id: 'coll-trip',
      type: 'row',
      title: 'Tent',
      blocks: [],
      props: {},
      order: 2,
    })
    const sb = makeStoreSupabase(pages)
    await addRowFromProposal(sb as never, {
      collectionId: 'coll-trip',
      title: 'Stove',
      props: { 'Packs With': ['Tent', 'Rope'] },
    })
    expect(sb._inserts[0].props).toEqual({ 'p-packs': ['row-rope'] })
  })
})
