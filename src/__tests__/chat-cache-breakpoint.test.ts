/**
 * @jest-environment node
 *
 * KAN-309 — the prompt-cache breakpoint must land on a content part the client
 * resends next turn, not on the server-injected `[Open page now]` part (which
 * is rebuilt fresh from a DB read every request and never comes back). Tagging
 * the injected part means no cached prefix ever matches once a page is open,
 * so system + tools + history get re-billed on every later turn. Same mocking
 * pattern as chat-page-now-route.test.ts: real `convertToModelMessages` so the
 * final `modelMessages` shape matches production exactly.
 */

jest.mock('@ai-sdk/anthropic', () => {
  const anthropic = () => ({})
  anthropic.tools = { webSearch_20260209: () => ({}) }
  return { anthropic }
})
jest.mock('ai', () => {
  const actual = jest.requireActual('ai')
  return {
    ...actual,
    streamText: jest.fn(() => ({ toUIMessageStreamResponse: () => new Response('ok') })),
    tool: (t: unknown) => t,
    stepCountIs: () => 10,
  }
})
const mockGetUser = jest.fn(async () => ({ data: { user: { id: 'user-1' } } }))
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
const mockFetchNodeContext = jest.fn(async (_sb: unknown, _userId: string, pageId: string) =>
  pageId === 'page-1'
    ? {
        type: 'page',
        title: 'kan309 probe',
        documents: [{ title: 'kan309 probe', blocks: [{ id: 'b1', type: 'text', content: 'Hello kiwi' }] }],
        children: [],
      }
    : null
)
jest.mock('@/lib/context/assemble', () => {
  const actual = jest.requireActual('@/lib/context/assemble')
  return {
    ...actual,
    buildChatContext: async () => null,
    fetchNodeContext: (...args: [unknown, string, string]) => mockFetchNodeContext(...args),
  }
})
jest.mock('@/lib/context/paste-link', () => ({ fetchLinkContext: async () => null }))
jest.mock('@/lib/embeddings/retrieve', () => ({
  retrievePages: async () => [],
  formatRetrievedPages: () => '',
}))
jest.mock('@/lib/ai/repair', () => ({ makeRepairToolCall: () => undefined }))
jest.mock('@/lib/change-log/propose', () => ({ recordProposedToolCalls: jest.fn() }))
jest.mock('@/lib/change-log/resolve', () => ({ resolveChangeLogRecord: jest.fn() }))

import type { ModelMessage } from 'ai'
import { streamText } from 'ai'
import { POST } from '@/app/api/chat/route'

const mockedStreamText = streamText as jest.MockedFunction<typeof streamText>

beforeEach(() => {
  jest.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
})

function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

function lastStreamTextArgs() {
  const call = mockedStreamText.mock.calls.at(-1)
  expect(call).toBeDefined()
  return call![0] as unknown as { messages: ModelMessage[] }
}

type Part = { type: string; text?: string; providerOptions?: { anthropic?: { cacheControl?: unknown } } }

describe('POST /api/chat tags the cache breakpoint on a resendable part, not the injected open-page part', () => {
  it("leaves the injected '[Open page now]' part uncached, and caches the user's own part before it", async () => {
    await post({
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'change kiwi to fig' }] }],
      nodeId: 'page-1',
      nodeType: 'page',
      resolutions: { changes: {}, creates: {}, skipped: {} },
    })

    const { messages } = lastStreamTextArgs()
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    expect(lastUser).toBeDefined()
    expect(Array.isArray(lastUser!.content)).toBe(true)
    const parts = lastUser!.content as Part[]

    const injectedIndex = parts.findIndex((p) => p.text?.includes('[Open page now]'))
    expect(injectedIndex).toBeGreaterThan(0)
    expect(parts[injectedIndex].providerOptions?.anthropic?.cacheControl).toBeUndefined()

    const beforeInjected = parts[injectedIndex - 1]
    expect(beforeInjected.providerOptions?.anthropic?.cacheControl).toEqual({ type: 'ephemeral' })
  })
})
