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

  it('coerces a checkbox and passes a status value through as a string', () => {
    expect(resolveRowValues(schema, { Done: true, Status: 'Reading' })).toEqual({
      'p-done': true,
      'p-status': 'Reading',
    })
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
