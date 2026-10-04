/**
 * Tests for the AI create_page accept path (src/lib/pages/create-page.ts).
 *
 * M1: an accepted create_page proposal mints block ids (block-level AND nested),
 * resolves its parent (UUID or title, reusing the nodes/create resolver), and
 * writes via createPage with type + title + props.kind. Mirrors the mocked-chain
 * approach in pages-client.test.ts / node-creation-logic.test.ts — no live Supabase.
 */

import { hydrateProposalBlocks, createPageFromProposal } from '@/lib/pages/create-page'
import type { ModuleData } from '@/lib/modules/ai-composition'

// ── hydrateProposalBlocks — id-less AI data → persistable Blocks ────────────

describe('hydrateProposalBlocks', () => {
  let n: number
  const mint = () => `id-${++n}`
  beforeEach(() => {
    n = 0
  })

  it('stamps a block id on a text block', () => {
    const data: ModuleData[] = [{ type: 'text', content: '# Hi' }]
    const blocks = hydrateProposalBlocks(data, mint)
    expect(blocks).toEqual([{ id: 'id-1', type: 'text', content: '# Hi' }])
  })

  it('mints ids for the block AND each nested todo item', () => {
    const data: ModuleData[] = [
      {
        type: 'todo',
        items: [
          { label: 'Gather ingredients', checked: false },
          { label: 'Preheat oven', checked: false },
        ],
      },
    ]
    const blocks = hydrateProposalBlocks(data, mint)
    expect(blocks).toEqual([
      {
        id: 'id-1',
        type: 'todo',
        items: [
          { id: 'id-2', label: 'Gather ingredients', checked: false },
          { id: 'id-3', label: 'Preheat oven', checked: false },
        ],
      },
    ])
  })

  it('preserves order across a mixed block array and mints unique ids', () => {
    const data: ModuleData[] = [
      { type: 'text', content: 'intro' },
      // #111: a figure is a big-number VIEW of a database now, not a metric block.
      { type: 'view', mode: 'big-number', bigNumber: { property: 'p-cal', agg: 'avg' } },
    ]
    const blocks = hydrateProposalBlocks(data, mint)
    expect(blocks.map((b) => b.type)).toEqual(['text', 'view'])
    expect(blocks[0].id).toBe('id-1')
    expect(blocks[1].id).toBe('id-2')
  })

  it('skips a malformed block rather than emitting corrupt JSON', () => {
    // A table missing its required rows fails blockSchema.
    const data = [{ type: 'table', columns: ['A'] }] as unknown as ModuleData[]
    const blocks = hydrateProposalBlocks(data, mint)
    expect(blocks).toEqual([])
  })

  it('drops an id the model volunteered and re-mints it', () => {
    const data = [{ type: 'text', id: 'model-supplied', content: 'x' }] as unknown as ModuleData[]
    const blocks = hydrateProposalBlocks(data, mint)
    expect(blocks[0].id).toBe('id-1')
  })
})

// ── createPageFromProposal — resolve parent + write ─────────────────────────

function makeInsertOnlySupabase(resolvedId = 'page-new') {
  const chain = {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { id: resolvedId }, error: null }),
  }
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: jest.fn().mockReturnValue(chain),
    _chain: chain,
  }
}

describe('createPageFromProposal', () => {
  const mint = (() => {
    let n = 0
    return () => `id-${++n}`
  })()

  it('writes a top-level page with type, title, blocks and props.kind (no parent)', async () => {
    const sb = makeInsertOnlySupabase('recipe-1')
    const result = await createPageFromProposal(
      sb as never,
      {
        type: 'page',
        kind: 'recipe',
        title: 'Lasagna',
        parentRef: null,
        blocks: [{ type: 'text', content: 'A hearty classic.' }],
      },
      mint,
      'main',
      null
    )

    expect(sb.from).toHaveBeenCalledWith('pages')
    const insert = sb._chain.insert.mock.calls[0][0]
    expect(insert.type).toBe('page')
    expect(insert.title).toBe('Lasagna')
    expect(insert.parent_id ?? null).toBeNull()
    expect(insert.props).toEqual({ kind: 'recipe' })
    expect(insert.blocks).toHaveLength(1)
    expect(insert.blocks[0]).toMatchObject({ type: 'text', content: 'A hearty classic.' })
    expect(insert.blocks[0].id).toBeTruthy()
    expect(result.id).toBe('recipe-1')
  })

  it('omits props.kind for a structural page that has no kind', async () => {
    const sb = makeInsertOnlySupabase('proj-1')
    await createPageFromProposal(
      sb as never,
      { type: 'project', title: 'Website Redesign', parentRef: null, blocks: [] },
      mint,
      'main',
      null
    )
    const insert = sb._chain.insert.mock.calls[0][0]
    expect(insert.type).toBe('project')
    expect(insert.props ?? {}).toEqual({})
  })

  it('accepts a parent given as a UUID and passes it straight through', async () => {
    const uuid = '00000000-0000-0000-0000-000000000042'
    const sb = makeInsertOnlySupabase('child-1')
    await createPageFromProposal(
      sb as never,
      { type: 'page', title: 'Sub', parentRef: uuid, blocks: [] },
      mint,
      'main',
      null
    )
    const insert = sb._chain.insert.mock.calls[0][0]
    expect(insert.parent_id).toBe(uuid)
  })

  it('resolves a parent given by title to its page id (ilike lookup)', async () => {
    const resolvedUuid = '00000000-0000-0000-0000-000000000099'
    const chain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { id: resolvedUuid }, error: null }),
      single: jest.fn().mockResolvedValue({ data: { id: 'child-2' }, error: null }),
    }
    const sb = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: jest.fn().mockReturnValue(chain),
    }
    await createPageFromProposal(
      sb as never,
      { type: 'page', kind: 'note', title: 'Reading goals', parentRef: 'Personal', blocks: [] },
      mint,
      'main',
      null
    )
    expect(chain.ilike).toHaveBeenCalledWith('title', 'Personal')
    const insert = chain.insert.mock.calls[0][0]
    expect(insert.parent_id).toBe(resolvedUuid)
  })

  it('throws when unauthenticated', async () => {
    const sb = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
      from: jest.fn(),
    }
    await expect(
      createPageFromProposal(
        sb as never,
        { type: 'page', title: 'X', parentRef: null, blocks: [] },
        mint,
        'main',
        null
      )
    ).rejects.toThrow(/authenticated/i)
  })
})
