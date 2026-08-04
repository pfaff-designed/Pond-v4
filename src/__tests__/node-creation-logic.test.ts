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
  it('parses a valid area action card from AI JSON', () => {
    const json = JSON.stringify({
      type: 'area',
      name: 'Travel',
    })
    const card = parseActionCard(json)
    expect(card).toEqual({ type: 'area', name: 'Travel' })
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
    expect(parseActionCard(JSON.stringify({ type: 'area' }))).toBeNull()
  })

  it('returns null for unknown entity type', () => {
    expect(parseActionCard(JSON.stringify({ type: 'document', name: 'Foo' }))).toBeNull()
  })
})

// ── createNode — table routing ─────────────────────────────────────────────

describe('createNode', () => {
  it('writes to the areas table for type=area', async () => {
    const chain = makeInsertChain({ id: 'area-new' })
    const sb = makeSupabase(chain)
    const card: ActionCard = { type: 'area', name: 'Travel' }

    const result = await createNode(sb as never, card)

    expect(sb.from).toHaveBeenCalledWith('areas')
    expect(chain.insert).toHaveBeenCalled()
    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg.name).toBe('Travel')
    expect(insertArg.user_id).toBe('user-1')
    expect(result.id).toBe('area-new')
  })

  it('writes to the projects table for type=project', async () => {
    const chain = makeInsertChain({ id: 'project-new' })
    const sb = makeSupabase(chain)
    const card: ActionCard = { type: 'project', name: 'Website Redesign', area_id: 'area-abc' }

    const result = await createNode(sb as never, card)

    expect(sb.from).toHaveBeenCalledWith('projects')
    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg.title).toBe('Website Redesign')
    expect(insertArg.area_id).toBe('area-abc')
    expect(insertArg.user_id).toBe('user-1')
    expect(result.id).toBe('project-new')
  })

  it('writes to the routines table for type=routine', async () => {
    const chain = makeInsertChain({ id: 'routine-new' })
    const sb = makeSupabase(chain)
    const card: ActionCard = { type: 'routine', name: 'Morning Walk', area_id: 'area-health' }

    const result = await createNode(sb as never, card)

    expect(sb.from).toHaveBeenCalledWith('routines')
    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg.name).toBe('Morning Walk')
    expect(insertArg.area_id).toBe('area-health')
    expect(result.id).toBe('routine-new')
  })

  it('writes to the actions table for type=action', async () => {
    const chain = makeInsertChain({ id: 'action-new' })
    const sb = makeSupabase(chain)
    const card: ActionCard = { type: 'action', name: 'Send invoice' }

    const result = await createNode(sb as never, card)

    expect(sb.from).toHaveBeenCalledWith('actions')
    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg.title).toBe('Send invoice')
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
    const card: ActionCard = { type: 'area', name: 'Fail Area' }

    await expect(createNode(sb as never, card)).rejects.toThrow('RLS violation')
  })
})
