// Tests for the node creation logic (createNode function)
// Covers: correct table writes, React Query cache invalidation, action card parsing

import { createNode, parseActionCard } from '@/lib/nodes/create'
import type { ActionCard } from '@/lib/nodes/create'

// ── Supabase mock helpers ──────────────────────────────────────────────────

function makeInsertChain(resolvedData: Record<string, unknown> = { id: 'new-id' }) {
  const chain = {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: resolvedData, error: null }),
  }
  return chain
}

function makeSupabase(chain = makeInsertChain()) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: jest.fn().mockReturnValue(chain),
    _chain: chain,
  }
}

// ── parseActionCard ────────────────────────────────────────────────────────

describe('parseActionCard', () => {
  // #108: the 'area' card is gone — a life domain lifted out of a transcript is a
  // plain top-level page, and becomes an area as pages land in it.
  it('parses a valid page action card from AI JSON', () => {
    const json = JSON.stringify({
      type: 'page',
      name: 'Travel',
    })
    const card = parseActionCard(json)
    expect(card).toEqual({ type: 'page', name: 'Travel' })
  })

  it('returns null for the retired "area" type', () => {
    expect(parseActionCard(JSON.stringify({ type: 'area', name: 'Travel' }))).toBeNull()
  })

  it('parses a project with area_id', () => {
    const json = JSON.stringify({
      type: 'project',
      name: 'Website Redesign',
      area_id: 'area-abc',
    })
    const card = parseActionCard(json)
    expect(card).toEqual({ type: 'project', name: 'Website Redesign', area_id: 'area-abc' })
  })

  it('parses a routine with area_id', () => {
    const json = JSON.stringify({
      type: 'routine',
      name: 'Morning Walk',
      area_id: 'area-health',
    })
    const card = parseActionCard(json)
    expect(card).toEqual({ type: 'routine', name: 'Morning Walk', area_id: 'area-health' })
  })

  it('parses an action', () => {
    const json = JSON.stringify({
      type: 'action',
      name: 'Send invoice',
    })
    const card = parseActionCard(json)
    expect(card).toEqual({ type: 'action', name: 'Send invoice' })
  })

  it('returns null for invalid JSON', () => {
    expect(parseActionCard('not json')).toBeNull()
  })

  it('returns null when type is missing', () => {
    expect(parseActionCard(JSON.stringify({ name: 'Foo' }))).toBeNull()
  })

  it('returns null when name is missing', () => {
    expect(parseActionCard(JSON.stringify({ type: 'page' }))).toBeNull()
  })

  it('returns null for unknown entity type', () => {
    expect(parseActionCard(JSON.stringify({ type: 'document', name: 'Foo' }))).toBeNull()
  })
})

// ── createNode — unified pages routing ─────────────────────────────────────
// Every node is now a page: the card type becomes the page's kind tag, and the
// card's parent ref (area_id / project_id) becomes parent_id. A bare page card
// carries no parent ref, so it lands top-level (#108).

describe('createNode', () => {
  it('creates a top-level page for type=page (the former area card)', async () => {
    const chain = makeInsertChain({ id: 'area-new' })
    const sb = makeSupabase(chain)
    const card: ActionCard = { type: 'page', name: 'Travel' }

    const result = await createNode(sb as never, card, null)

    expect(sb.from).toHaveBeenCalledWith('pages')
    expect(chain.insert).toHaveBeenCalled()
    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg.type).toBe('page')
    expect(insertArg.title).toBe('Travel')
    expect(insertArg.parent_id ?? null).toBeNull()
    expect(insertArg.user_id).toBe('user-1')
    expect(result.id).toBe('area-new')
  })

  it('creates a project page parented to its area (UUID ref)', async () => {
    const chain = makeInsertChain({ id: 'project-new' })
    const sb = makeSupabase(chain)
    const uuid = '00000000-0000-0000-0000-000000000001'
    const card: ActionCard = { type: 'project', name: 'Website Redesign', area_id: uuid }

    const result = await createNode(sb as never, card, null)

    expect(sb.from).toHaveBeenCalledWith('pages')
    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg.type).toBe('project')
    expect(insertArg.title).toBe('Website Redesign')
    expect(insertArg.parent_id).toBe(uuid)
    expect(insertArg.user_id).toBe('user-1')
    expect(result.id).toBe('project-new')
  })

  it('creates a routine page parented to its area (UUID ref)', async () => {
    const chain = makeInsertChain({ id: 'routine-new' })
    const sb = makeSupabase(chain)
    const uuid = '00000000-0000-0000-0000-000000000002'
    const card: ActionCard = { type: 'routine', name: 'Morning Walk', area_id: uuid }

    const result = await createNode(sb as never, card, null)

    expect(sb.from).toHaveBeenCalledWith('pages')
    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg.type).toBe('routine')
    expect(insertArg.title).toBe('Morning Walk')
    expect(insertArg.parent_id).toBe(uuid)
    expect(result.id).toBe('routine-new')
  })

  it('resolves a parent name to a page id when the ref is not a UUID', async () => {
    const resolvedUuid = '00000000-0000-0000-0000-000000000099'
    // Single chain serves both the resolve (maybeSingle) and insert (single) paths.
    const chain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { id: resolvedUuid }, error: null }),
      single: jest.fn().mockResolvedValue({ data: { id: 'project-new' }, error: null }),
    }
    const sb = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: jest.fn().mockReturnValue(chain),
    }
    const card: ActionCard = { type: 'project', name: 'Website Redesign', area_id: 'Professional' }

    const result = await createNode(sb as never, card, null)

    expect(sb.from).toHaveBeenCalledWith('pages')
    expect(chain.ilike).toHaveBeenCalledWith('title', 'Professional')
    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg.parent_id).toBe(resolvedUuid)
    expect(result.id).toBe('project-new')
  })

  it('creates a top-level action page for type=action', async () => {
    const chain = makeInsertChain({ id: 'action-new' })
    const sb = makeSupabase(chain)
    const card: ActionCard = { type: 'action', name: 'Send invoice' }

    const result = await createNode(sb as never, card, null)

    expect(sb.from).toHaveBeenCalledWith('pages')
    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg.type).toBe('action')
    expect(insertArg.title).toBe('Send invoice')
    expect(insertArg.parent_id ?? null).toBeNull()
    expect(insertArg.user_id).toBe('user-1')
    expect(result.id).toBe('action-new')
  })

  it('throws when Supabase returns an error', async () => {
    const chain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'RLS violation' } }),
    }
    const sb = makeSupabase(chain)
    const card: ActionCard = { type: 'page', name: 'Fail Area' }

    await expect(createNode(sb as never, card, null)).rejects.toThrow('RLS violation')
  })
})
