/**
 * One-way made-from provenance + the kind label (issue #154).
 *
 * The law under test: a template is a shape you copy, never a tie. The stamp a
 * page carries is written ONCE on apply and is ADVISORY — nothing here (or
 * anywhere) may read it to change the page, and it lives beside `props._schema`,
 * never inside it. The reads (count / list / sibling ranking) are the data behind
 * 6f/6i's "templates used by sibling pages rank first".
 */

import {
  MADE_FROM_TEMPLATE_KEY,
  stampProvenance,
  readProvenance,
  countPagesMadeFrom,
  listPagesMadeFrom,
  siblingTemplateRanking,
} from '@/lib/templates/provenance'
import { applyKindLabel } from '@/lib/templates/kind-label'
import type { PondTemplate } from '@/lib/templates/types'
import { SCHEMA_KEY } from '@/lib/properties/schema'

const TEMPLATE: PondTemplate = {
  id: 'tpl-1',
  name: 'Weekly review',
  kind: 'meeting notes',
  blocks: [],
  origin: 'yours',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
}

// ── Chain mock helpers ──────────────────────────────────────────────────────

function makeChain(overrides: Record<string, unknown> = {}) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    ...overrides,
  }
}

function makeSupabase(chain = makeChain()) {
  return { from: jest.fn().mockReturnValue(chain), _chain: chain }
}

// ── stampProvenance / readProvenance ──────────────────────────────────────────

describe('stampProvenance', () => {
  it('writes { templateId, name, at } under the madeFromTemplate key, as a sibling of _schema', () => {
    const schema = [{ id: 'stage', name: 'Stage', type: 'status' }]
    const props = { [SCHEMA_KEY]: schema, stage: 'todo' }

    const out = stampProvenance(props, TEMPLATE, '2026-10-01T12:00:00.000Z')

    expect(MADE_FROM_TEMPLATE_KEY).toBe('madeFromTemplate')
    expect(out[MADE_FROM_TEMPLATE_KEY]).toEqual({
      templateId: 'tpl-1',
      name: 'Weekly review',
      at: '2026-10-01T12:00:00.000Z',
    })
    // Sibling key, never nested inside the reserved schema; siblings preserved.
    expect(out[SCHEMA_KEY]).toEqual(schema)
    expect(out.stage).toBe('todo')
    // Pure: the input object is not mutated.
    expect(props).not.toHaveProperty(MADE_FROM_TEMPLATE_KEY)
  })

  it('stamps an ISO timestamp when none is given', () => {
    const out = stampProvenance({}, TEMPLATE)
    const at = readProvenance(out)!.at
    expect(Number.isNaN(Date.parse(at))).toBe(false)
  })

  it('is written ONCE — a second apply never updates an existing stamp', () => {
    const first = stampProvenance({}, TEMPLATE, '2026-10-01T12:00:00.000Z')
    const other: PondTemplate = { ...TEMPLATE, id: 'tpl-2', name: 'Habit', kind: 'habit' }

    const second = stampProvenance(first, other, '2026-10-02T12:00:00.000Z')

    expect(second).toBe(first)
    expect(readProvenance(second)).toEqual({
      templateId: 'tpl-1',
      name: 'Weekly review',
      at: '2026-10-01T12:00:00.000Z',
    })
  })
})

describe('readProvenance', () => {
  it('returns null on props with no stamp', () => {
    expect(readProvenance({})).toBeNull()
    expect(readProvenance({ kind: 'notes' })).toBeNull()
  })

  it('returns null on a malformed stamp rather than throwing', () => {
    expect(readProvenance({ [MADE_FROM_TEMPLATE_KEY]: 'tpl-1' })).toBeNull()
    expect(readProvenance({ [MADE_FROM_TEMPLATE_KEY]: { name: 'x' } })).toBeNull()
    expect(readProvenance({ [MADE_FROM_TEMPLATE_KEY]: null })).toBeNull()
  })

  it('round-trips a stamp', () => {
    const props = stampProvenance({}, TEMPLATE, '2026-10-01T12:00:00.000Z')
    expect(readProvenance(props)).toEqual({
      templateId: 'tpl-1',
      name: 'Weekly review',
      at: '2026-10-01T12:00:00.000Z',
    })
  })
})

// ── applyKindLabel ────────────────────────────────────────────────────────────

describe('applyKindLabel', () => {
  it("writes the template's kind into the editable props.kind label and nothing else", () => {
    const props = { [SCHEMA_KEY]: [], stage: 'todo' }
    const out = applyKindLabel(props, TEMPLATE)
    expect(out).toEqual({ [SCHEMA_KEY]: [], stage: 'todo', kind: 'meeting notes' })
    // No back-reference: the kind label alone is not provenance.
    expect(out).not.toHaveProperty(MADE_FROM_TEMPLATE_KEY)
    expect(props).not.toHaveProperty('kind')
  })

  it('overwrites a previous kind label (it is a plain editable label)', () => {
    expect(applyKindLabel({ kind: 'recipe' }, TEMPLATE).kind).toBe('meeting notes')
  })
})

// ── countPagesMadeFrom ────────────────────────────────────────────────────────

describe('countPagesMadeFrom', () => {
  it('counts pages in the pond whose props contain the stamp for this template', async () => {
    const chain = makeChain({
      contains: jest.fn().mockResolvedValue({ count: 3, error: null }),
    })
    const sb = makeSupabase(chain)

    const n = await countPagesMadeFrom(sb as never, 'user-1', 'main', 'tpl-1')

    expect(n).toBe(3)
    expect(sb.from).toHaveBeenCalledWith('pages')
    expect(chain.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(chain.eq).toHaveBeenCalledWith('workspace', 'main')
    expect(chain.contains).toHaveBeenCalledWith('props', {
      [MADE_FROM_TEMPLATE_KEY]: { templateId: 'tpl-1' },
    })
  })

  it('returns 0 when the count is null', async () => {
    const chain = makeChain({ contains: jest.fn().mockResolvedValue({ count: null, error: null }) })
    expect(await countPagesMadeFrom(makeSupabase(chain) as never, 'u', 'main', 'tpl-1')).toBe(0)
  })

  it('throws when the read errors', async () => {
    const chain = makeChain({
      contains: jest.fn().mockResolvedValue({ count: null, error: { message: 'count boom' } }),
    })
    await expect(
      countPagesMadeFrom(makeSupabase(chain) as never, 'u', 'main', 'tpl-1')
    ).rejects.toThrow(/count boom/)
  })
})

// ── listPagesMadeFrom ─────────────────────────────────────────────────────────

describe('listPagesMadeFrom', () => {
  it('lists stamped pages (lean shape) newest-first, capped at limit', async () => {
    const stamp = { templateId: 'tpl-1', name: 'Weekly review', at: '2026-10-01T12:00:00.000Z' }
    const rows = [
      {
        id: 'p1',
        title: 'Review 1',
        parent_id: 'area',
        props: { [MADE_FROM_TEMPLATE_KEY]: stamp },
      },
      { id: 'p2', title: 'Review 2', parent_id: null, props: { [MADE_FROM_TEMPLATE_KEY]: stamp } },
    ]
    const chain = makeChain({ limit: jest.fn().mockResolvedValue({ data: rows, error: null }) })
    const sb = makeSupabase(chain)

    const out = await listPagesMadeFrom(sb as never, 'user-1', 'main', 'tpl-1', 5)

    expect(sb.from).toHaveBeenCalledWith('pages')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(chain.eq).toHaveBeenCalledWith('workspace', 'main')
    expect(chain.contains).toHaveBeenCalledWith('props', {
      [MADE_FROM_TEMPLATE_KEY]: { templateId: 'tpl-1' },
    })
    expect(chain.order).toHaveBeenCalledWith('updated_at', { ascending: false })
    expect(chain.limit).toHaveBeenCalledWith(5)
    expect(out).toEqual([
      { id: 'p1', title: 'Review 1', parentId: 'area', madeFrom: stamp },
      { id: 'p2', title: 'Review 2', parentId: null, madeFrom: stamp },
    ])
  })

  it('returns [] when nothing was made from the template', async () => {
    const chain = makeChain({ limit: jest.fn().mockResolvedValue({ data: null, error: null }) })
    expect(await listPagesMadeFrom(makeSupabase(chain) as never, 'u', 'main', 'tpl-1')).toEqual([])
  })

  it('throws when the read errors', async () => {
    const chain = makeChain({
      limit: jest.fn().mockResolvedValue({ data: null, error: { message: 'list boom' } }),
    })
    await expect(
      listPagesMadeFrom(makeSupabase(chain) as never, 'u', 'main', 'tpl-1')
    ).rejects.toThrow(/list boom/)
  })
})

// ── siblingTemplateRanking ────────────────────────────────────────────────────

describe('siblingTemplateRanking', () => {
  const stamp = (templateId: string, at: string) => ({
    [MADE_FROM_TEMPLATE_KEY]: { templateId, name: 'n', at },
  })

  it('returns template ids used by the children of parentId, most-used first', async () => {
    const rows = [
      { props: stamp('tpl-b', '2026-10-01T00:00:00.000Z') },
      { props: stamp('tpl-a', '2026-10-02T00:00:00.000Z') },
      { props: stamp('tpl-b', '2026-10-03T00:00:00.000Z') },
      { props: { kind: 'notes' } }, // unstamped sibling — ignored
      { props: stamp('tpl-c', '2026-10-04T00:00:00.000Z') },
      { props: stamp('tpl-b', '2026-10-05T00:00:00.000Z') },
    ]
    const chain = makeChain({ not: jest.fn().mockResolvedValue({ data: rows, error: null }) })
    const sb = makeSupabase(chain)

    const out = await siblingTemplateRanking(sb as never, 'user-1', 'main', 'parent-1')

    expect(sb.from).toHaveBeenCalledWith('pages')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(chain.eq).toHaveBeenCalledWith('workspace', 'main')
    expect(chain.eq).toHaveBeenCalledWith('parent_id', 'parent-1')
    expect(chain.is).not.toHaveBeenCalled()
    // tpl-b ×3, then tpl-a and tpl-c ×1 each — tie broken by most recent stamp.
    expect(out).toEqual(['tpl-b', 'tpl-c', 'tpl-a'])
  })

  it('uses is(null) for top-level siblings when parentId is null', async () => {
    const chain = makeChain({ not: jest.fn().mockResolvedValue({ data: [], error: null }) })
    await siblingTemplateRanking(makeSupabase(chain) as never, 'user-1', 'main', null)
    expect(chain.is).toHaveBeenCalledWith('parent_id', null)
  })

  it('returns [] when no sibling carries a stamp', async () => {
    const chain = makeChain({ not: jest.fn().mockResolvedValue({ data: null, error: null }) })
    expect(
      await siblingTemplateRanking(makeSupabase(chain) as never, 'user-1', 'main', 'p')
    ).toEqual([])
  })

  it('throws when the read errors', async () => {
    const chain = makeChain({
      not: jest.fn().mockResolvedValue({ data: null, error: { message: 'rank boom' } }),
    })
    await expect(
      siblingTemplateRanking(makeSupabase(chain) as never, 'user-1', 'main', 'p')
    ).rejects.toThrow(/rank boom/)
  })
})
