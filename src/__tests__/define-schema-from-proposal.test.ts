/**
 * Tests for the AI define_schema accept path (src/lib/pages/create-page.ts).
 *
 * #17 slice 5: an accepted define_schema proposal mints any missing property AND
 * option ids for the id-less schema the model proposes, confirms the target page
 * exists, and merges the schema into the page's `props` via the merge-safe
 * `defineSchema` (so existing row values are never clobbered). Mirrors the
 * mocked-chain approach in create-page-from-proposal.test.ts — no live Supabase.
 */

import { hydratePropertySchema, defineSchemaFromProposal } from '@/lib/pages/create-page'
import { SCHEMA_KEY } from '@/lib/properties/schema'
import type { AiPropertyDef } from '@/lib/properties/schema'

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
})
