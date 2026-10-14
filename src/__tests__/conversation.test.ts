import {
  getOrCreateConversation,
  saveTranscript,
  dissolveConversation,
} from '@/lib/conversation/client'
import { emptyResolutions } from '@/lib/conversation/resolutions'
import type { UIMessage } from 'ai'

function makeMessage(overrides: Partial<UIMessage> = {}): UIMessage {
  return {
    id: 'msg-1',
    role: 'user',
    parts: [{ type: 'text', text: 'hello' }],
    ...overrides,
  } as UIMessage
}

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { id: 'conv-1' }, error: null }),
    ...overrides,
  }
  return chain
}

function makeSupabase(chain = makeChain()) {
  return {
    from: jest.fn().mockReturnValue(chain),
    _chain: chain,
  }
}

describe('getOrCreateConversation', () => {
  it('returns existing active conversation with deserialized messages (legacy array row)', async () => {
    const stored = [{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]
    const chain = makeChain()
    chain.maybeSingle.mockResolvedValue({ data: { id: 'conv-1', transcript: stored }, error: null })
    const sb = makeSupabase(chain)

    const result = await getOrCreateConversation(sb as never, 'user-1', 'pond-1')

    expect(result.id).toBe('conv-1')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].role).toBe('user')
    expect(result.resolutions).toEqual(emptyResolutions())
  })

  it('restores messages AND resolutions from an envelope row (ticket-19)', async () => {
    const stored = {
      messages: [{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      resolutions: { changes: { 'pc1:0': 'accepted' }, creates: { cp1: 'rejected' }, skipped: {} },
    }
    const chain = makeChain()
    chain.maybeSingle.mockResolvedValue({ data: { id: 'conv-1', transcript: stored }, error: null })
    const sb = makeSupabase(chain)

    const result = await getOrCreateConversation(sb as never, 'user-1', 'pond-1')

    expect(result.messages).toHaveLength(1)
    expect(result.resolutions.changes).toEqual({ 'pc1:0': 'accepted' })
    expect(result.resolutions.creates).toEqual({ cp1: 'rejected' })
  })

  it('creates a new conversation when none exists', async () => {
    const chain = makeChain()
    chain.maybeSingle.mockResolvedValue({ data: null, error: null })
    const sb = makeSupabase(chain)

    const result = await getOrCreateConversation(sb as never, 'user-1', 'pond-1')

    expect(result.id).toBe('conv-1')
    expect(result.messages).toEqual([])
    expect(chain.insert).toHaveBeenCalledWith({ user_id: 'user-1', pond_id: 'pond-1' })
  })

  it('returns empty messages when transcript is not an array', async () => {
    const chain = makeChain()
    chain.maybeSingle.mockResolvedValue({ data: { id: 'conv-1', transcript: null }, error: null })
    const sb = makeSupabase(chain)

    const result = await getOrCreateConversation(sb as never, 'user-1', 'pond-1')
    expect(result.messages).toEqual([])
  })

  it('re-ids a later message that reuses an earlier message id (KAN-315)', async () => {
    const stored = [
      { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      { id: 'msg-2', role: 'assistant', parts: [{ type: 'text', text: 'first answer' }] },
      { id: 'msg-2', role: 'assistant', parts: [{ type: 'text', text: 'second answer' }] },
    ]
    const chain = makeChain()
    chain.maybeSingle.mockResolvedValue({ data: { id: 'conv-1', transcript: stored }, error: null })
    const sb = makeSupabase(chain)

    const result = await getOrCreateConversation(sb as never, 'user-1', 'pond-1')

    const ids = result.messages.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(result.messages[1].id).toBe('msg-2')
    expect(result.messages[2].id).not.toBe('msg-2')
  })

  it('re-ids repeats inside the { messages, resolutions } envelope too', async () => {
    const stored = {
      messages: [
        { id: 'msg-1', role: 'assistant', parts: [{ type: 'text', text: 'a' }] },
        { id: 'msg-1', role: 'assistant', parts: [{ type: 'text', text: 'b' }] },
        { id: 'msg-1', role: 'assistant', parts: [{ type: 'text', text: 'c' }] },
      ],
      resolutions: { changes: {}, creates: {}, skipped: {} },
    }
    const chain = makeChain()
    chain.maybeSingle.mockResolvedValue({ data: { id: 'conv-1', transcript: stored }, error: null })
    const sb = makeSupabase(chain)

    const result = await getOrCreateConversation(sb as never, 'user-1', 'pond-1')

    const ids = result.messages.map((m) => m.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids[0]).toBe('msg-1')
  })
})

describe('saveTranscript', () => {
  it('writes the { messages, resolutions } envelope', async () => {
    const chain = makeChain()
    const sb = makeSupabase(chain)
    const messages = [makeMessage()]
    const resolutions = { ...emptyResolutions(), creates: { cp1: 'accepted' as const } }

    await saveTranscript(sb as never, 'conv-1', messages, resolutions)

    expect(chain.update).toHaveBeenCalledWith({ transcript: { messages, resolutions } })
    expect(chain.eq).toHaveBeenCalledWith('id', 'conv-1')
  })

  it('defaults resolutions to empty when omitted', async () => {
    const chain = makeChain()
    const sb = makeSupabase(chain)
    const messages = [makeMessage()]

    await saveTranscript(sb as never, 'conv-1', messages)

    expect(chain.update).toHaveBeenCalledWith({
      transcript: { messages, resolutions: emptyResolutions() },
    })
  })
})

describe('dissolveConversation', () => {
  it('sets dissolved_at to current time', async () => {
    const chain = makeChain()
    const sb = makeSupabase(chain)
    const before = Date.now()

    await dissolveConversation(sb as never, 'conv-1')

    const updateCall = chain.update.mock.calls[0][0]
    const dissolvedAt = new Date(updateCall.dissolved_at).getTime()
    expect(dissolvedAt).toBeGreaterThanOrEqual(before)
    expect(dissolvedAt).toBeLessThanOrEqual(Date.now())
  })
})
