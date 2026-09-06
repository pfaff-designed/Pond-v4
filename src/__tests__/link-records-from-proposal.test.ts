/**
 * Tests for the AI link_records accept path (src/lib/pages/link-records.ts, #40).
 *
 * link_records is forward-only, ADD-ONLY linking between EXISTING rows: the model
 * names everything by TITLE (source row, source collection, relation property,
 * target rows) and the accept path resolves titles→ids against live data — a
 * dangling id must NEVER be written. Ambiguous or unresolvable titles THROW with a
 * clear message (surfaced on the card), unlike add_row's lenient drop. Links are
 * applied through the pure `addLink` (dedupes; `single:true` replaces) and persist
 * via the merge-safe setProperty. Mirrors the fake-store mock approach so
 * getPage/getChildPages/setProperty all read+write one in-memory pages table.
 */

import { resolveRowRef, linkRecordsFromProposal } from '@/lib/pages/link-records'
import { SCHEMA_KEY } from '@/lib/properties/schema'

// ── resolveRowRef — pure title→id resolution (incl. dup-title handling) ──────

describe('resolveRowRef', () => {
  const candidates = [
    { id: 'row-stove', title: 'Stove' },
    { id: 'row-rope', title: 'Rope' },
    { id: 'row-tent', title: 'Tent' },
    { id: 'row-tent-2', title: 'Tent' },
  ]

  it('resolves a unique title to its row id', () => {
    expect(resolveRowRef(candidates, 'Stove')).toEqual({ kind: 'resolved', id: 'row-stove' })
  })

  it('matches titles case-insensitively and trims whitespace', () => {
    expect(resolveRowRef(candidates, '  rope ')).toEqual({ kind: 'resolved', id: 'row-rope' })
  })

  it('keeps a ref that is already a candidate id (idempotent)', () => {
    expect(resolveRowRef(candidates, 'row-stove')).toEqual({ kind: 'resolved', id: 'row-stove' })
  })

  it('reports a duplicate title as ambiguous with the tied candidates', () => {
    const out = resolveRowRef(candidates, 'Tent')
    expect(out.kind).toBe('ambiguous')
    if (out.kind === 'ambiguous') {
      expect(out.candidates.map((c) => c.id)).toEqual(['row-tent', 'row-tent-2'])
    }
  })

  it('reports an unknown title as not-found', () => {
    expect(resolveRowRef(candidates, 'Lantern')).toEqual({ kind: 'not-found', title: 'Lantern' })
  })

  it('reports a blank ref as not-found', () => {
    expect(resolveRowRef(candidates, '   ')).toEqual({ kind: 'not-found', title: '' })
  })
})

// ── linkRecordsFromProposal — accept path over a fake pages store ────────────

interface StoredPage {
  id: string
  parent_id: string | null
  type: string
  title: string
  blocks: unknown[]
  props: Record<string, unknown>
  order: number
}

/** In-memory pages table implementing the query shapes the accept path uses:
 *  getPage (select…maybeSingle), getChildPages (select…order), and setProperty's
 *  update…eq. Updates write through to the store so a second read sees them. */
function makeSupabase(pages: StoredPage[]) {
  const updates: Array<{ id: string; props: Record<string, unknown> }> = []
  const find = (id: unknown) => pages.find((p) => p.id === id) ?? null
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
      maybeSingle: () => Promise.resolve({ data: find(filters.id), error: null }),
      update: (patch: { props?: Record<string, unknown> }) => ({
        eq: (_col: string, id: string) => {
          const page = find(id)
          if (page && patch.props) {
            page.props = patch.props
            updates.push({ id, props: patch.props })
          }
          return Promise.resolve({ error: null })
        },
      }),
    }
    return builder
  }
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: () => makeBuilder(),
    _updates: updates,
    _page: (id: string) => find(id),
  }
}

/** The Trip Packing shape: a self-referential collection ("Packs With" targets
 *  itself) with rows Stove / Rope / Tent — the live manual-verify fixture. */
function tripPacking(opts: { single?: boolean; stoveLinks?: string[] } = {}): StoredPage[] {
  const relationDef = {
    id: 'p-packs',
    name: 'Packs With',
    type: 'relation',
    target: 'coll-trip',
    ...(opts.single ? { single: true } : {}),
  }
  return [
    {
      id: 'coll-trip',
      parent_id: null,
      type: 'page',
      title: 'Trip Packing',
      blocks: [],
      props: { [SCHEMA_KEY]: [relationDef] },
      order: 0,
    },
    {
      id: 'row-stove',
      parent_id: 'coll-trip',
      type: 'row',
      title: 'Stove',
      blocks: [],
      props: opts.stoveLinks ? { 'p-packs': opts.stoveLinks } : {},
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
    {
      id: 'row-tent',
      parent_id: 'coll-trip',
      type: 'row',
      title: 'Tent',
      blocks: [],
      props: {},
      order: 2,
    },
  ]
}

describe('linkRecordsFromProposal', () => {
  it('links a target row into the source row’s relation value (titles → ids)', async () => {
    const sb = makeSupabase(tripPacking())
    const out = await linkRecordsFromProposal(sb as never, {
      collectionId: 'coll-trip',
      fromRow: 'Stove',
      relation: 'Packs With',
      toRows: ['Tent'],
    })
    expect(out).toMatchObject({
      sourceRowId: 'row-stove',
      propertyId: 'p-packs',
      targetCollectionId: 'coll-trip',
    })
    expect(sb._page('row-stove')?.props['p-packs']).toEqual(['row-tent'])
  })

  it('appends to an existing multi value and dedupes an already-linked id', async () => {
    const sb = makeSupabase(tripPacking({ stoveLinks: ['row-rope'] }))
    await linkRecordsFromProposal(sb as never, {
      collectionId: 'coll-trip',
      fromRow: 'Stove',
      relation: 'Packs With',
      toRows: ['Tent', 'Rope'],
    })
    // Rope was already linked → deduped; Tent appended. ADD-only: nothing removed.
    expect(sb._page('row-stove')?.props['p-packs']).toEqual(['row-rope', 'row-tent'])
  })

  it('a single relation REPLACES the value with the picked row (radio cap)', async () => {
    const sb = makeSupabase(tripPacking({ single: true, stoveLinks: ['row-rope'] }))
    await linkRecordsFromProposal(sb as never, {
      collectionId: 'coll-trip',
      fromRow: 'Stove',
      relation: 'Packs With',
      toRows: ['Tent'],
    })
    expect(sb._page('row-stove')?.props['p-packs']).toEqual(['row-tent'])
  })

  it('matches the relation property name case-insensitively', async () => {
    const sb = makeSupabase(tripPacking())
    await linkRecordsFromProposal(sb as never, {
      collectionId: 'coll-trip',
      fromRow: 'Stove',
      relation: 'packs with',
      toRows: ['Rope'],
    })
    expect(sb._page('row-stove')?.props['p-packs']).toEqual(['row-rope'])
  })

  it('throws on an unresolvable target title — never writes a dangling id', async () => {
    const sb = makeSupabase(tripPacking())
    await expect(
      linkRecordsFromProposal(sb as never, {
        collectionId: 'coll-trip',
        fromRow: 'Stove',
        relation: 'Packs With',
        toRows: ['Lantern'],
      })
    ).rejects.toThrow(/no row titled .*Lantern/i)
    expect(sb._updates).toHaveLength(0)
  })

  it('throws on an ambiguous target title (duplicate) — never guesses', async () => {
    const pages = tripPacking()
    pages.push({
      id: 'row-tent-2',
      parent_id: 'coll-trip',
      type: 'row',
      title: 'Tent',
      blocks: [],
      props: {},
      order: 3,
    })
    const sb = makeSupabase(pages)
    await expect(
      linkRecordsFromProposal(sb as never, {
        collectionId: 'coll-trip',
        fromRow: 'Stove',
        relation: 'Packs With',
        toRows: ['Tent'],
      })
    ).rejects.toThrow(/multiple rows titled .*Tent/i)
    expect(sb._updates).toHaveLength(0)
  })

  it('throws when the source row title matches nothing in the collection', async () => {
    const sb = makeSupabase(tripPacking())
    await expect(
      linkRecordsFromProposal(sb as never, {
        collectionId: 'coll-trip',
        fromRow: 'Lantern',
        relation: 'Packs With',
        toRows: ['Tent'],
      })
    ).rejects.toThrow(/no row titled .*Lantern/i)
    expect(sb._updates).toHaveLength(0)
  })

  it('throws when the named property is not a relation on the collection', async () => {
    const sb = makeSupabase(tripPacking())
    await expect(
      linkRecordsFromProposal(sb as never, {
        collectionId: 'coll-trip',
        fromRow: 'Stove',
        relation: 'Weight',
        toRows: ['Tent'],
      })
    ).rejects.toThrow(/no relation .*Weight/i)
    expect(sb._updates).toHaveLength(0)
  })

  it('throws when the collection does not exist or has no schema (card can revert)', async () => {
    const sb = makeSupabase(tripPacking())
    await expect(
      linkRecordsFromProposal(sb as never, {
        collectionId: 'ghost',
        fromRow: 'Stove',
        relation: 'Packs With',
        toRows: ['Tent'],
      })
    ).rejects.toThrow(/not found/i)

    const noSchema = makeSupabase([
      {
        id: 'plain',
        parent_id: null,
        type: 'page',
        title: 'Plain',
        blocks: [],
        props: {},
        order: 0,
      },
    ])
    await expect(
      linkRecordsFromProposal(noSchema as never, {
        collectionId: 'plain',
        fromRow: 'Stove',
        relation: 'Packs With',
        toRows: ['Tent'],
      })
    ).rejects.toThrow(/not a collection/i)
  })

  it('an UNTARGETED relation resolves target titles against non-row pages (link any page)', async () => {
    const pages: StoredPage[] = [
      {
        id: 'coll-notes',
        parent_id: null,
        type: 'page',
        title: 'Notes',
        blocks: [],
        props: { [SCHEMA_KEY]: [{ id: 'p-rel', name: 'Related', type: 'relation' }] },
        order: 0,
      },
      {
        id: 'row-idea',
        parent_id: 'coll-notes',
        type: 'row',
        title: 'Kiln idea',
        blocks: [],
        props: {},
        order: 0,
      },
      {
        id: 'page-studio',
        parent_id: null,
        type: 'page',
        title: 'Ceramics Studio Plan',
        blocks: [],
        props: {},
        order: 1,
      },
    ]
    const sb = makeSupabase(pages)
    const out = await linkRecordsFromProposal(sb as never, {
      collectionId: 'coll-notes',
      fromRow: 'Kiln idea',
      relation: 'Related',
      toRows: ['Ceramics Studio Plan'],
    })
    expect(out.targetCollectionId).toBeUndefined()
    expect(sb._page('row-idea')?.props['p-rel']).toEqual(['page-studio'])
  })

  it('resolves targets against the relation’s TARGET collection when it differs from the source', async () => {
    const pages: StoredPage[] = [
      {
        id: 'coll-tasks',
        parent_id: null,
        type: 'page',
        title: 'Tasks',
        blocks: [],
        props: {
          [SCHEMA_KEY]: [{ id: 'p-proj', name: 'Project', type: 'relation', target: 'coll-projects' }],
        },
        order: 0,
      },
      {
        id: 'row-tile',
        parent_id: 'coll-tasks',
        type: 'row',
        title: 'Pick tile',
        blocks: [],
        props: {},
        order: 0,
      },
      {
        id: 'coll-projects',
        parent_id: null,
        type: 'page',
        title: 'Projects',
        blocks: [],
        props: { [SCHEMA_KEY]: [{ id: 'p-status', name: 'Status', type: 'text' }] },
        order: 1,
      },
      {
        id: 'row-reno',
        parent_id: 'coll-projects',
        type: 'row',
        title: 'Kitchen Reno',
        blocks: [],
        props: {},
        order: 0,
      },
    ]
    const sb = makeSupabase(pages)
    const out = await linkRecordsFromProposal(sb as never, {
      collectionId: 'coll-tasks',
      fromRow: 'Pick tile',
      relation: 'Project',
      toRows: ['Kitchen Reno'],
    })
    expect(out.targetCollectionId).toBe('coll-projects')
    expect(sb._page('row-tile')?.props['p-proj']).toEqual(['row-reno'])
  })
})
