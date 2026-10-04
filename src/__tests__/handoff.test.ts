/**
 * Tests for the /handoff domain logic (performHandoff + extractEntities).
 *
 * /handoff spec (build-brief §9): Quick model extracts entities from the
 * transcript → writes them ALL (no picker) → dissolved_at = now() → a fresh
 * session begins. Unlike /save, there is no per-item confirmation.
 */

import { performHandoff, extractEntities } from '@/lib/conversation/handoff'
import type { UIMessage } from 'ai'
import type { SaveExtraction } from '@/app/api/save-extract/route'

function makeMessages(): UIMessage[] {
  return [
    { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'I need to plan a trip' }] },
  ] as UIMessage[]
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    extract: jest.fn<Promise<SaveExtraction[]>, [UIMessage[]]>().mockResolvedValue([]),
    createNode: jest.fn().mockResolvedValue({ id: 'node-1' }),
    dissolveConversation: jest.fn().mockResolvedValue(undefined),
    getOrCreateConversation: jest.fn().mockResolvedValue({ id: 'fresh-conv', messages: [] }),
    ...overrides,
  }
}

const supabase = {} as never

describe('performHandoff', () => {
  it('extracts entities from the given transcript', async () => {
    const deps = makeDeps()
    const messages = makeMessages()

    await performHandoff(supabase, 'conv-1', 'user-1', messages, deps as never)

    expect(deps.extract).toHaveBeenCalledWith(messages)
  })

  it('writes every extracted entity via createNode with the mapped card', async () => {
    const deps = makeDeps({
      extract: jest.fn().mockResolvedValue([
        { id: 'e1', type: 'project', name: 'Plan the trip' },
        { id: 'e2', type: 'action', name: 'Book flights' },
      ]),
    })

    const result = await performHandoff(supabase, 'conv-1', 'user-1', makeMessages(), deps as never)

    expect(deps.createNode).toHaveBeenCalledTimes(2)
    expect(deps.createNode).toHaveBeenCalledWith(
      supabase,
      { type: 'project', name: 'Plan the trip' },
      null
    )
    expect(deps.createNode).toHaveBeenCalledWith(
      supabase,
      { type: 'action', name: 'Book flights' },
      null
    )
    expect(result.written).toBe(2)
  })

  it('dissolves the current conversation after writing entities', async () => {
    const deps = makeDeps({
      extract: jest.fn().mockResolvedValue([{ id: 'e1', type: 'page', name: 'Travel' }]),
    })

    await performHandoff(supabase, 'conv-1', 'user-1', makeMessages(), deps as never)

    expect(deps.dissolveConversation).toHaveBeenCalledWith(supabase, 'conv-1')
    // write must happen before dissolve
    const writeOrder = (deps.createNode as jest.Mock).mock.invocationCallOrder[0]
    const dissolveOrder = (deps.dissolveConversation as jest.Mock).mock.invocationCallOrder[0]
    expect(writeOrder).toBeLessThan(dissolveOrder)
  })

  it('creates and returns a fresh conversation', async () => {
    const deps = makeDeps()

    const result = await performHandoff(supabase, 'conv-1', 'user-1', makeMessages(), deps as never)

    expect(deps.getOrCreateConversation).toHaveBeenCalledWith(supabase, 'user-1', null)
    expect(result.freshConversation).toEqual({ id: 'fresh-conv', messages: [] })
  })

  it('still dissolves and starts fresh when nothing is extracted', async () => {
    const deps = makeDeps({ extract: jest.fn().mockResolvedValue([]) })

    const result = await performHandoff(supabase, 'conv-1', 'user-1', makeMessages(), deps as never)

    expect(deps.createNode).not.toHaveBeenCalled()
    expect(deps.dissolveConversation).toHaveBeenCalledWith(supabase, 'conv-1')
    expect(result.written).toBe(0)
    expect(result.freshConversation.id).toBe('fresh-conv')
  })

  it('does NOT dissolve the conversation if a write fails (transcript preserved)', async () => {
    const deps = makeDeps({
      extract: jest.fn().mockResolvedValue([{ id: 'e1', type: 'page', name: 'Travel' }]),
      createNode: jest.fn().mockRejectedValue(new Error('db down')),
    })

    await expect(
      performHandoff(supabase, 'conv-1', 'user-1', makeMessages(), deps as never)
    ).rejects.toThrow('db down')

    expect(deps.dissolveConversation).not.toHaveBeenCalled()
    expect(deps.getOrCreateConversation).not.toHaveBeenCalled()
  })
})

describe('extractEntities (default extractor)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('POSTs the transcript to /api/save-extract and returns extractions', async () => {
    const extractions = [{ id: 'e1', type: 'action', name: 'Send invoice' }]
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ extractions }),
    }) as never

    const messages = makeMessages()
    const result = await extractEntities(messages)

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/save-extract',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ messages }),
      })
    )
    expect(result).toEqual(extractions)
  })

  it('returns an empty array when the request fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as never

    const result = await extractEntities(makeMessages())
    expect(result).toEqual([])
  })
})
