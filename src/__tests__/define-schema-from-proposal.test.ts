/**
 * Tests for the AI define_schema accept path (src/lib/pages/create-page.ts).
 *
 * #17 slice 5: an accepted define_schema proposal mints any missing property AND
 * option ids for the id-less schema the model proposes, confirms the target page
 * exists, and merges the schema into the page's `props` via the merge-safe
 * `defineSchema` (so existing row values are never clobbered). Mirrors the
 * mocked-chain approach in create-page-from-proposal.test.ts — no live Supabase.
 */

import {
  hydratePropertySchema,
  defineSchemaFromProposal,
  collectionNameResolver,
  collectionPropertyResolver,
  collectionTitleResolver,
} from '@/lib/pages/create-page'
import { SCHEMA_KEY } from '@/lib/properties/schema'
import type { AiPropertyDef, PropertySchema } from '@/lib/properties/schema'

// ── hydratePropertySchema — id-less AI schema → persistable PropertySchema ───

describe('hydratePropertySchema', () => {
  let n: number
  const mint = () => `id-${++n}`
  beforeEach(() => {
    n = 0
  })

  it('mints an id for a property that lacks one', () => {
    const defs: AiPropertyDef[] = [{ name: 'Author', type: 'text' }]
    expect(hydratePropertySchema(defs, mint)).toEqual([
      { id: 'id-1', name: 'Author', type: 'text' },
    ])
  })

  it('mints ids for the property AND each of its options', () => {
    const defs: AiPropertyDef[] = [
      {
        name: 'Status',
        type: 'status',
        options: [{ label: 'To read' }, { label: 'Reading' }],
      },
    ]
    expect(hydratePropertySchema(defs, mint)).toEqual([
      {
        id: 'id-1',
        name: 'Status',
        type: 'status',
        options: [
          { id: 'id-2', label: 'To read' },
          { id: 'id-3', label: 'Reading' },
        ],
      },
    ])
  })

  it('honors a property/option id the model did supply', () => {
    const defs: AiPropertyDef[] = [{ id: 'keep-me', name: 'Rating', type: 'number' }]
    expect(hydratePropertySchema(defs, mint)[0].id).toBe('keep-me')
  })

  it('preserves order across a mixed schema and mints unique ids', () => {
    const defs: AiPropertyDef[] = [
      { name: 'Author', type: 'text' },
      { name: 'Rating', type: 'number' },
      { name: 'Finished on', type: 'date' },
    ]
    const out = hydratePropertySchema(defs, mint)
    expect(out.map((d) => d.name)).toEqual(['Author', 'Rating', 'Finished on'])
    expect(new Set(out.map((d) => d.id)).size).toBe(3)
  })

  it('skips a malformed property rather than writing a corrupt schema', () => {
    const defs = [
      { name: 'Good', type: 'text' },
      { name: 'Bad', type: 'not-a-real-type' },
    ] as unknown as AiPropertyDef[]
    const out = hydratePropertySchema(defs, mint)
    expect(out.map((d) => d.name)).toEqual(['Good'])
  })

  // #20 — a relation's `target` is proposed as a collection NAME and resolved to a
  // collection id on accept (like configure_view resolves a group-by name).
  const resolve = (name: string) => (name.toLowerCase() === 'books' ? 'col-books' : undefined)

  it('resolves a relation target NAME to its collection id', () => {
    const defs: AiPropertyDef[] = [{ name: 'Shelf', type: 'relation', target: 'Books' }]
    const out = hydratePropertySchema(defs, mint, resolve)
    expect(out[0]).toMatchObject({ name: 'Shelf', type: 'relation', target: 'col-books' })
  })

  it('drops an unresolvable target (lenient — the relation stays untargeted)', () => {
    const defs: AiPropertyDef[] = [{ name: 'Shelf', type: 'relation', target: 'Ghosts' }]
    const out = hydratePropertySchema(defs, mint, resolve)
    expect(out[0].target).toBeUndefined()
    expect(out[0]).toMatchObject({ name: 'Shelf', type: 'relation' })
  })

  it('leaves a targetless relation untargeted', () => {
    const defs: AiPropertyDef[] = [{ name: 'Shelf', type: 'relation' }]
    expect(hydratePropertySchema(defs, mint, resolve)[0].target).toBeUndefined()
  })

  it('never lets a target ride on a non-relation property (relation-only)', () => {
    const defs = [{ name: 'Author', type: 'text', target: 'Books' }] as unknown as AiPropertyDef[]
    expect(hydratePropertySchema(defs, mint, resolve)[0].target).toBeUndefined()
  })

  // #20 rollups — a rollup names (a) its relation sibling by NAME → resolved to that
  // relation's minted id (relationId) and (b) the rolled property on the relation's
  // TARGET collection by NAME → resolved to that property's id (rollupProperty).
  // Unresolvable links stay UNSET (renders "—") — the def is kept, never dropped (D7).
  const resolveProp = (collectionId: string, name: string) =>
    collectionId === 'col-books' && name.toLowerCase() === 'rating' ? 'prop-rating' : undefined

  it('resolves a rollup relation NAME → the sibling relation id (relationId)', () => {
    const defs: AiPropertyDef[] = [
      { id: 'rel-1', name: 'Shelf', type: 'relation', target: 'Books' },
      {
        name: 'Avg rating',
        type: 'rollup',
        relation: 'Shelf',
        rollupProperty: 'Rating',
        aggregate: 'average',
      },
    ]
    const out = hydratePropertySchema(defs, mint, resolve, resolveProp)
    expect(out[1]).toMatchObject({
      name: 'Avg rating',
      type: 'rollup',
      relationId: 'rel-1',
      rollupProperty: 'prop-rating',
      aggregate: 'average',
    })
  })

  it('resolves the relation even when it appears AFTER the rollup in the array', () => {
    const defs: AiPropertyDef[] = [
      {
        name: 'Avg rating',
        type: 'rollup',
        relation: 'Shelf',
        rollupProperty: 'Rating',
        aggregate: 'average',
      },
      { id: 'rel-1', name: 'Shelf', type: 'relation', target: 'Books' },
    ]
    const out = hydratePropertySchema(defs, mint, resolve, resolveProp)
    expect(out[0]).toMatchObject({ relationId: 'rel-1', rollupProperty: 'prop-rating' })
  })

  // #20 self-referential rollup — the rolled property is minted in THIS SAME batch
  // (the relation targets the very collection being defined), so it isn't yet in the
  // target collection's persisted schema the external resolver reads. Resolve it from
  // the same batch first; the external resolver is a fallback for cross-collection.
  // A self-referential relation: its target is the very collection being defined.
  const resolveSelf = (name: string) => (name.toLowerCase() === 'self' ? 'col-self' : undefined)

  it('resolves the rolled property against the SAME batch for a self-referential rollup', () => {
    const defs: AiPropertyDef[] = [
      { name: 'Score', type: 'number' },
      { id: 'rel-1', name: 'Links', type: 'relation', target: 'Self' },
      {
        name: 'Total score',
        type: 'rollup',
        relation: 'Links',
        rollupProperty: 'Score',
        aggregate: 'sum',
      },
    ]
    // External resolver reads the target collection's PERSISTED schema, which doesn't
    // yet contain the just-minted Score (returns undefined) — pre-fix this left
    // rollupProperty UNSET and the self-referential rollup rendered "—" forever.
    const noExternal = () => undefined
    const out = hydratePropertySchema(defs, mint, resolveSelf, noExternal)
    const scoreId = out.find((d) => d.name === 'Score')!.id
    expect(out.find((d) => d.type === 'rollup')).toMatchObject({
      relationId: 'rel-1',
      rollupProperty: scoreId,
      aggregate: 'sum',
    })
  })

  it('prefers the same-batch rolled property over a stale external id', () => {
    const defs: AiPropertyDef[] = [
      { name: 'Score', type: 'number' },
      { id: 'rel-1', name: 'Links', type: 'relation', target: 'Self' },
      {
        name: 'Total score',
        type: 'rollup',
        relation: 'Links',
        rollupProperty: 'Score',
        aggregate: 'sum',
      },
    ]
    // External resolver returns a STALE/legacy id for the same name (the Trip Packing
    // symptom) — the same-batch id must win so the rollup points at the live property.
    const staleExternal = () => 'legacy-score-id'
    const out = hydratePropertySchema(defs, mint, resolveSelf, staleExternal)
    const scoreId = out.find((d) => d.name === 'Score')!.id
    expect(out.find((d) => d.type === 'rollup')!.rollupProperty).toBe(scoreId)
  })

  it('strips the AI-only `relation` key from the persisted def', () => {
    const defs: AiPropertyDef[] = [
      { id: 'rel-1', name: 'Shelf', type: 'relation', target: 'Books' },
      { name: 'Count', type: 'rollup', relation: 'Shelf', aggregate: 'count' },
    ]
    const out = hydratePropertySchema(defs, mint, resolve, resolveProp)
    expect(out[1]).not.toHaveProperty('relation')
    expect(out[1]).toMatchObject({ relationId: 'rel-1', aggregate: 'count' })
  })

  it('a count rollup needs no rolled property (rollupProperty stays unset)', () => {
    const defs: AiPropertyDef[] = [
      { id: 'rel-1', name: 'Shelf', type: 'relation', target: 'Books' },
      { name: 'Total', type: 'rollup', relation: 'Shelf', aggregate: 'count' },
    ]
    const out = hydratePropertySchema(defs, mint, resolve, resolveProp)
    expect(out[1].relationId).toBe('rel-1')
    expect(out[1].rollupProperty).toBeUndefined()
  })

  it('keeps the rollup def but leaves relationId unset when the relation name is unknown (D7)', () => {
    const defs: AiPropertyDef[] = [
      { id: 'rel-1', name: 'Shelf', type: 'relation', target: 'Books' },
      {
        name: 'Broken',
        type: 'rollup',
        relation: 'Ghost',
        rollupProperty: 'Rating',
        aggregate: 'sum',
      },
    ]
    const out = hydratePropertySchema(defs, mint, resolve, resolveProp)
    expect(out.map((d) => d.name)).toEqual(['Shelf', 'Broken'])
    expect(out[1].relationId).toBeUndefined()
    expect(out[1].rollupProperty).toBeUndefined()
  })

  it('keeps the rollup def but leaves rollupProperty unset when the rolled prop is unknown (D7)', () => {
    const defs: AiPropertyDef[] = [
      { id: 'rel-1', name: 'Shelf', type: 'relation', target: 'Books' },
      {
        name: 'Sum pages',
        type: 'rollup',
        relation: 'Shelf',
        rollupProperty: 'Ghost',
        aggregate: 'sum',
      },
    ]
    const out = hydratePropertySchema(defs, mint, resolve, resolveProp)
    expect(out[1].relationId).toBe('rel-1')
    expect(out[1].rollupProperty).toBeUndefined()
  })

  it('leaves rollupProperty unset when the relation is untargeted (no target schema to resolve against)', () => {
    const defs: AiPropertyDef[] = [
      { id: 'rel-1', name: 'Shelf', type: 'relation' },
      {
        name: 'Sum',
        type: 'rollup',
        relation: 'Shelf',
        rollupProperty: 'Rating',
        aggregate: 'sum',
      },
    ]
    const out = hydratePropertySchema(defs, mint, resolve, resolveProp)
    expect(out[1].relationId).toBe('rel-1')
    expect(out[1].rollupProperty).toBeUndefined()
  })

  it('never lets relationId/rollupProperty ride on a non-rollup property', () => {
    const defs = [
      { name: 'Author', type: 'text', relation: 'Shelf', rollupProperty: 'Rating' },
    ] as unknown as AiPropertyDef[]
    const out = hydratePropertySchema(defs, mint, resolve, resolveProp)
    expect(out[0]).not.toHaveProperty('relation')
    expect(out[0].relationId).toBeUndefined()
    // `rollupProperty` is a schema key; it must not survive on a text prop.
    expect(out[0].rollupProperty).toBeUndefined()
  })

  // #36 — additive merge-by-name. A proposal ADDS-OR-UPDATES against the existing schema:
  // a matching name reuses that property's id (rows stay live) and adopts the proposed
  // type; a new name is appended; an unmentioned property is preserved. Passing no
  // `existing` (every test above) keeps the old "all fresh" behavior — backward compatible.
  describe('additive merge against an existing schema (#36)', () => {
    it('appends a new property while preserving the ones the proposal omits', () => {
      const existing: PropertySchema = [
        { id: 'e-author', name: 'Author', type: 'text' },
        { id: 'e-rating', name: 'Rating', type: 'number' },
      ]
      // The classic "add a status field" request — the model sends ONLY the new column.
      const out = hydratePropertySchema(
        [{ name: 'Status', type: 'text' }],
        mint,
        undefined,
        undefined,
        existing
      )
      expect(out.map((d) => d.name)).toEqual(['Author', 'Rating', 'Status'])
      // Untouched properties keep their exact ids (rows stay attached); new one is appended.
      expect(out[0].id).toBe('e-author')
      expect(out[1].id).toBe('e-rating')
      expect(out[2].name).toBe('Status')
    })

    it('reuses the existing id when a proposed name matches (no duplicate column)', () => {
      // The promote-to-collection symptom: a same-named property must reconcile to the
      // existing id, not mint a second id that strands the row values under the old one.
      const existing: PropertySchema = [{ id: 'e-score', name: 'Score', type: 'number' }]
      const out = hydratePropertySchema(
        [{ name: 'Score', type: 'number' }],
        mint,
        undefined,
        undefined,
        existing
      )
      expect(out).toHaveLength(1)
      expect(out[0].id).toBe('e-score')
    })

    it('matches by name case-insensitively and trimmed', () => {
      const existing: PropertySchema = [{ id: 'e-score', name: 'Score', type: 'number' }]
      const out = hydratePropertySchema(
        [{ name: '  score  ', type: 'number' }],
        mint,
        undefined,
        undefined,
        existing
      )
      expect(out).toHaveLength(1)
      expect(out[0].id).toBe('e-score')
    })

    it('reuses the id but adopts the proposed type/options on a name match', () => {
      const existing: PropertySchema = [{ id: 'e-prio', name: 'Priority', type: 'text' }]
      const out = hydratePropertySchema(
        [{ name: 'Priority', type: 'select', options: [{ label: 'Low' }, { label: 'High' }] }],
        mint,
        undefined,
        undefined,
        existing
      )
      expect(out).toHaveLength(1)
      expect(out[0].id).toBe('e-prio') // id preserved → row values stay live
      expect(out[0].type).toBe('select') // type evolves as asked
      expect(out[0].options?.map((o) => o.label)).toEqual(['Low', 'High'])
    })

    it('lets the first occurrence win when a proposal repeats a name', () => {
      const out = hydratePropertySchema(
        [
          { name: 'Score', type: 'number' },
          { name: 'Score', type: 'text' },
        ],
        mint
      )
      expect(out).toHaveLength(1)
      expect(out[0].type).toBe('number')
    })

    it('resolves a rollup against a relation that already exists (not re-proposed)', () => {
      // Existing self-referential collection: a Links relation + a Score number. The
      // proposal adds ONLY a rollup — its relation and rolled property both live in the
      // existing schema (existing tier), not in this call, and no external resolver hits.
      const existing: PropertySchema = [
        { id: 'e-links', name: 'Links', type: 'relation', target: 'col-self' },
        { id: 'e-score', name: 'Score', type: 'number' },
      ]
      const noExternal = () => undefined
      const out = hydratePropertySchema(
        [
          {
            name: 'Total',
            type: 'rollup',
            relation: 'Links',
            rollupProperty: 'Score',
            aggregate: 'sum',
          },
        ],
        mint,
        () => undefined,
        noExternal,
        existing
      )
      const rollup = out.find((d) => d.type === 'rollup')!
      expect(rollup.relationId).toBe('e-links') // relation resolved from existing schema
      expect(rollup.rollupProperty).toBe('e-score') // rolled property resolved from existing schema
    })
  })
})

// ── defineSchemaFromProposal — confirm target + merge-safe write ─────────────

function makeSupabase(page: { id: string; props?: Record<string, unknown> } | null) {
  const row = page
    ? {
        id: page.id,
        parent_id: null,
        type: 'page',
        title: 'Reading List',
        blocks: [],
        props: page.props ?? {},
        order: 0,
      }
    : null
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
    update: jest.fn().mockReturnThis(),
  }
  return {
    from: jest.fn().mockReturnValue(chain),
    _chain: chain,
  }
}

describe('defineSchemaFromProposal', () => {
  const mint = (() => {
    let n = 0
    return () => `id-${++n}`
  })()

  it('merges the hydrated schema into props at the reserved _schema key', async () => {
    const sb = makeSupabase({ id: 'page-1', props: {} })
    const schema = await defineSchemaFromProposal(
      sb as never,
      { pageId: 'page-1', schema: [{ name: 'Author', type: 'text' }] },
      mint
    )
    // The write goes through saveProps → update({ props, updated_at }).
    const payload = sb._chain.update.mock.calls[0][0]
    expect(payload.props[SCHEMA_KEY]).toEqual(schema)
    expect(schema[0]).toMatchObject({ name: 'Author', type: 'text' })
    expect(schema[0].id).toBeTruthy()
  })

  it('preserves existing row values alongside the new schema (no clobber)', async () => {
    const sb = makeSupabase({ id: 'page-1', props: { existingValue: 42 } })
    await defineSchemaFromProposal(
      sb as never,
      { pageId: 'page-1', schema: [{ name: 'Status', type: 'text' }] },
      mint
    )
    const payload = sb._chain.update.mock.calls[0][0]
    expect(payload.props.existingValue).toBe(42)
    expect(payload.props[SCHEMA_KEY]).toBeDefined()
  })

  it('throws when the target page does not exist (card can revert)', async () => {
    const sb = makeSupabase(null)
    await expect(
      defineSchemaFromProposal(
        sb as never,
        { pageId: 'ghost', schema: [{ name: 'X', type: 'text' }] },
        mint
      )
    ).rejects.toThrow(/not found/i)
    expect(sb._chain.update).not.toHaveBeenCalled()
  })

  it('additively merges the proposal into the target collection’s current schema (#36)', async () => {
    // The target is ALREADY a collection: a Score column holding a row value. The model
    // asks to add a Status field. The write must keep Score (id + value) and append Status.
    const sb = makeSupabase({
      id: 'page-1',
      props: {
        [SCHEMA_KEY]: [{ id: 'e-score', name: 'Score', type: 'number' }],
        'e-score': 7, // a row value keyed by the existing property id
      },
    })
    const merged = await defineSchemaFromProposal(
      sb as never,
      { pageId: 'page-1', schema: [{ name: 'Status', type: 'text' }] },
      mint
    )
    const payload = sb._chain.update.mock.calls[0][0]
    expect(payload.props[SCHEMA_KEY]).toEqual(merged)
    expect(merged.map((d) => d.name)).toEqual(['Score', 'Status'])
    expect(merged[0].id).toBe('e-score') // existing column reconciled, not replaced
    expect(payload.props['e-score']).toBe(7) // its row value survives untouched
  })
})

// ── collectionNameResolver — relation target NAME→collection id (#20 slice 2b) ──
//
// The accept site feeds the workspace's pages (the `['pages', workspace, 'full']`
// cache, which carries `props`) so a relation def's proposed target NAME resolves
// to the id of the matching COLLECTION. Lenient: a name that matches only a
// non-collection page, or nothing, resolves to undefined → the relation is left
// untargeted (hydratePropertySchema drops the target).

describe('collectionNameResolver', () => {
  // A page carries a well-formed `_schema` iff it is a collection (isCollection).
  const collection = (id: string, title: string) => ({
    id,
    title,
    props: { [SCHEMA_KEY]: [{ id: `${id}-c`, name: 'Col', type: 'text' }] },
  })
  const plain = (id: string, title: string) => ({ id, title, props: {} })

  it('resolves a collection name to its id, case-insensitively', () => {
    const resolve = collectionNameResolver([collection('c1', 'Tasks')])
    expect(resolve('tasks')).toBe('c1')
    expect(resolve('TASKS')).toBe('c1')
    expect(resolve('  Tasks  ')).toBe('c1')
  })

  it('returns the first collection when titles collide', () => {
    const resolve = collectionNameResolver([collection('c1', 'Books'), collection('c2', 'Books')])
    expect(resolve('books')).toBe('c1')
  })

  it('ignores a non-collection page that shares the name (lenient → undefined)', () => {
    const resolve = collectionNameResolver([plain('p1', 'Tasks')])
    expect(resolve('Tasks')).toBeUndefined()
  })

  it('prefers a real collection over a same-named non-collection page', () => {
    const resolve = collectionNameResolver([plain('p1', 'Tasks'), collection('c1', 'Tasks')])
    expect(resolve('Tasks')).toBe('c1')
  })

  it('returns undefined for an unknown name and for a blank name', () => {
    const resolve = collectionNameResolver([collection('c1', 'Tasks')])
    expect(resolve('Nope')).toBeUndefined()
    expect(resolve('   ')).toBeUndefined()
  })
})

// ── collectionPropertyResolver — (collectionId, prop NAME) → property id (#20) ──
//
// A rollup resolves its rolled property against the relation's TARGET collection
// schema. Given the workspace's pages, this maps (target collection id, property
// NAME) to that property's stable id. Lenient: unknown collection, non-collection,
// or unmatched name → undefined (the rollup stays unresolved, renders "—").

describe('collectionPropertyResolver', () => {
  const books = {
    id: 'col-books',
    title: 'Books',
    props: {
      [SCHEMA_KEY]: [
        { id: 'p-rating', name: 'Rating', type: 'number' },
        { id: 'p-pages', name: 'Pages', type: 'number' },
      ],
    },
  }
  const plain = { id: 'p1', title: 'Notes', props: {} }

  it('resolves a property name to its id within the target collection, case-insensitively', () => {
    const resolve = collectionPropertyResolver([books])
    expect(resolve('col-books', 'Rating')).toBe('p-rating')
    expect(resolve('col-books', 'rating')).toBe('p-rating')
    expect(resolve('col-books', '  Pages  ')).toBe('p-pages')
  })

  it('returns undefined for an unknown collection id, a non-collection, or an unmatched name', () => {
    const resolve = collectionPropertyResolver([books, plain])
    expect(resolve('ghost', 'Rating')).toBeUndefined()
    expect(resolve('p1', 'Rating')).toBeUndefined()
    expect(resolve('col-books', 'Nope')).toBeUndefined()
    expect(resolve('col-books', '   ')).toBeUndefined()
  })
})

// ── collectionTitleResolver — relation target NAME → collection TITLE (#37) ─────
//
// The define_schema proposal card previews a relation's RESOLVED target collection
// (spec decision 8) so the user can correct it before accept. Same resolution rules
// as collectionNameResolver (that's what it delegates to), but it hands back the
// matched collection's canonical title for display — undefined means "no collection
// will be linked" and the card flags the name instead.

describe('collectionTitleResolver', () => {
  const collection = (id: string, title: string) => ({
    id,
    title,
    props: { [SCHEMA_KEY]: [{ id: `${id}-c`, name: 'Col', type: 'text' }] },
  })
  const plain = (id: string, title: string) => ({ id, title, props: {} })

  it('resolves a collection name to its canonical title, case-insensitively', () => {
    const resolve = collectionTitleResolver([collection('c1', 'Trips')])
    expect(resolve('trips')).toBe('Trips')
    expect(resolve('TRIPS')).toBe('Trips')
    expect(resolve('  Trips  ')).toBe('Trips')
  })

  it('ignores a non-collection page that shares the name (lenient → undefined)', () => {
    const resolve = collectionTitleResolver([plain('p1', 'Trips')])
    expect(resolve('Trips')).toBeUndefined()
  })

  it('returns undefined for an unknown name and for a blank name', () => {
    const resolve = collectionTitleResolver([collection('c1', 'Trips')])
    expect(resolve('Ghosts')).toBeUndefined()
    expect(resolve('   ')).toBeUndefined()
  })
})
