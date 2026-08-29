/**
 * @jest-environment node
 *
 * Node environment (not jsdom) so the AI SDK's Web-stream globals are available
 * for the real convertToModelMessages integration checks.
 */

/**
 * Ticket-19 — proposal-card resolution persistence.
 *
 * `applyResolutions` stamps the user's Accept/Dismiss decision onto a resolved
 * proposal tool part as a synthetic tool result, so replay (toModelMessages)
 * preserves the call and the model sees what was actioned instead of
 * re-proposing it. Unresolved proposals must stay untouched — and therefore
 * still be dropped from replay exactly as before.
 */

import type { UIMessage } from 'ai'
import {
  applyResolutions,
  parseResolutions,
  emptyResolutions,
  resolveAcceptTarget,
  resolveStampTarget,
  type ConversationResolutions,
} from '@/lib/conversation/resolutions'
import { toModelMessages } from '@/lib/conversation/transcript'

function proposalTranscript(): UIMessage[] {
  return [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'make a gear page' }] },
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Here you go.' },
        {
          type: 'tool-create_page',
          toolCallId: 'cp1',
          state: 'input-available',
          input: { type: 'page', title: 'Camera Gear', blocks: [] },
        },
        {
          type: 'tool-propose_changes',
          toolCallId: 'pc1',
          state: 'input-available',
          input: {
            changes: [
              { op: 'create', data: { type: 'text', content: 'one' } },
              { op: 'create', data: { type: 'text', content: 'two' } },
            ],
          },
        },
      ],
    },
    { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'thanks' }] },
  ] as unknown as UIMessage[]
}

type ToolPart = { type: string; toolCallId: string; state: string; output?: unknown }

function findPart(messages: UIMessage[], toolCallId: string): ToolPart {
  const part = messages
    .flatMap((m) => m.parts as unknown as ToolPart[])
    .find((p) => p.toolCallId === toolCallId)
  expect(part).toBeDefined()
  return part!
}

describe('applyResolutions', () => {
  it('leaves everything untouched when nothing is resolved', () => {
    const messages = proposalTranscript()
    expect(applyResolutions(messages, emptyResolutions())).toBe(messages)
  })

  it('stamps an accepted create_page as a tool result', () => {
    const out = applyResolutions(proposalTranscript(), {
      ...emptyResolutions(),
      creates: { cp1: 'accepted' },
    })
    const part = findPart(out, 'cp1')
    expect(part.state).toBe('output-available')
    expect(part.output).toMatchObject({ decision: 'accepted' })
    // The sibling batch with no decisions stays unresolved.
    expect(findPart(out, 'pc1').state).toBe('input-available')
  })

  it('stamps per-index propose_changes decisions, keeping undecided ones pending', () => {
    const out = applyResolutions(proposalTranscript(), {
      ...emptyResolutions(),
      changes: { 'pc1:1': 'rejected' },
      skipped: { pc1: 1 },
    })
    const part = findPart(out, 'pc1')
    expect(part.state).toBe('output-available')
    expect(part.output).toMatchObject({
      decisions: ['pending', 'rejected'],
      skippedOnApply: 1,
    })
  })

  it('a skipped batch reads as NOT applied, not as success (BUG 2)', () => {
    const out = applyResolutions(proposalTranscript(), {
      ...emptyResolutions(),
      changes: { 'pc1:0': 'accepted', 'pc1:1': 'accepted' },
      skipped: { pc1: 2 },
    })
    const output = findPart(out, 'pc1').output as { note: string; skippedOnApply: number }
    expect(output.skippedOnApply).toBe(2)
    expect(output.note).toMatch(/NOT applied/)
    expect(output.note).toMatch(/do not (claim|tell)/i)
    expect(output.note).toMatch(/re-propose/i)
  })

  it('a fully-applied batch keeps the plain decision note', () => {
    const out = applyResolutions(proposalTranscript(), {
      ...emptyResolutions(),
      changes: { 'pc1:0': 'accepted' },
    })
    const output = findPart(out, 'pc1').output as { note: string }
    expect(output.note).not.toMatch(/NOT applied/)
  })

  it('does not mutate the input messages', () => {
    const messages = proposalTranscript()
    applyResolutions(messages, { ...emptyResolutions(), creates: { cp1: 'accepted' } })
    expect(findPart(messages, 'cp1').state).toBe('input-available')
  })

  it('ignores decisions for unknown toolCallIds', () => {
    const out = applyResolutions(proposalTranscript(), {
      ...emptyResolutions(),
      creates: { nope: 'accepted' },
    })
    expect(findPart(out, 'cp1').state).toBe('input-available')
  })
})

describe('applyResolutions — question cards (ticket-39)', () => {
  function questionTranscript(): UIMessage[] {
    return [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'build it' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-ask_question',
            toolCallId: 'q1',
            state: 'input-available',
            input: { question: 'What kiln?', options: ['Gas', 'Wood-fired'], branch: 'kiln type' },
          },
        ],
      },
    ] as unknown as UIMessage[]
  }

  it('stamps an answered question card as a tool result so the model stops asking', () => {
    const out = applyResolutions(questionTranscript(), {
      ...emptyResolutions(),
      questions: { q1: { answer: 'Wood-fired', via: 'option' } },
    })
    const part = findPart(out, 'q1')
    expect(part.state).toBe('output-available')
    expect(part.output).toMatchObject({ answer: 'Wood-fired', via: 'option' })
    expect((part.output as { note: string }).note).toMatch(/do not ask it again/i)
  })

  it('leaves an unanswered question card untouched (its branch stays open)', () => {
    const out = applyResolutions(questionTranscript(), emptyResolutions())
    expect(findPart(out, 'q1').state).toBe('input-available')
  })

  it('an answered question survives real SDK replay; unanswered is dropped', async () => {
    const answered = applyResolutions(questionTranscript(), {
      ...emptyResolutions(),
      questions: { q1: { answer: 'Wood-fired', via: 'free' } },
    })
    const model = await toModelMessages(answered)
    expect(model.some((m) => m.role === 'tool')).toBe(true)
    const unanswered = await toModelMessages(applyResolutions(questionTranscript(), emptyResolutions()))
    expect(unanswered.some((m) => m.role === 'tool')).toBe(false)
  })
})

describe('applyResolutions → toModelMessages (real SDK replay)', () => {
  function toolCallIds(model: Awaited<ReturnType<typeof toModelMessages>>): string[] {
    return model.flatMap((m) =>
      Array.isArray(m.content)
        ? (m.content as Array<{ type?: string; toolCallId?: string }>)
            .filter((p) => typeof p === 'object' && p !== null && p.type === 'tool-call')
            .map((p) => p.toolCallId as string)
        : []
    )
  }

  it('a resolved proposal survives replay; an unresolved one is still dropped', async () => {
    const resolved = applyResolutions(proposalTranscript(), {
      ...emptyResolutions(),
      creates: { cp1: 'accepted' },
    })
    const model = await toModelMessages(resolved)
    const ids = toolCallIds(model)
    expect(ids).toContain('cp1')
    expect(ids).not.toContain('pc1')
    // The synthetic result rides along as a tool message.
    expect(model.some((m) => m.role === 'tool')).toBe(true)
  })
})

describe('parseResolutions', () => {
  it('round-trips a valid value', () => {
    const value: ConversationResolutions = {
      changes: { 'pc1:0': 'accepted' },
      creates: { cp1: 'rejected' },
      skipped: { pc1: 2 },
      targets: { pc1: { nodeId: 'n1', nodeName: 'Garage' } },
      questions: {}, // ticket-39: question-card answers ride the same envelope
    }
    expect(parseResolutions(value)).toEqual(value)
  })

  it('degrades garbage to empty', () => {
    expect(parseResolutions(null)).toEqual(emptyResolutions())
    expect(parseResolutions('nope')).toEqual(emptyResolutions())
    expect(parseResolutions([1, 2])).toEqual(emptyResolutions())
  })

  it('drops malformed entries but keeps valid ones', () => {
    const parsed = parseResolutions({
      changes: { a: 'accepted', b: 'maybe', c: 7 },
      creates: 'nope',
      skipped: { x: 1, y: 'lots', z: NaN },
      targets: {
        good: { nodeId: 'n1', nodeName: 'Garage' },
        noName: { nodeId: 'n2' },
        noId: { nodeName: 'Shed' },
        junk: 'nope',
      },
    })
    expect(parsed).toEqual({
      changes: { a: 'accepted' },
      creates: {},
      skipped: { x: 1 },
      targets: { good: { nodeId: 'n1', nodeName: 'Garage' } },
      questions: {}, // ticket-39: present-but-empty on a row with no question cards
    })
  })

  it('legacy value with no targets parses to an empty targets map', () => {
    const parsed = parseResolutions({ changes: {}, creates: {}, skipped: {} })
    expect(parsed.targets).toEqual({})
  })
})

describe('resolveAcceptTarget', () => {
  const withTarget: ConversationResolutions = {
    ...emptyResolutions(),
    targets: { pc1: { nodeId: 'stamped-id', nodeName: 'Garage' } },
  }

  it('returns the stamped target id when one is recorded', () => {
    expect(resolveAcceptTarget(withTarget, 'pc1', 'open-id')).toBe('stamped-id')
  })

  it('stamped target wins even when a different node is open', () => {
    expect(resolveAcceptTarget(withTarget, 'pc1', 'somewhere-else')).toBe('stamped-id')
  })

  it('falls back to the open node when unstamped (legacy cards)', () => {
    expect(resolveAcceptTarget(emptyResolutions(), 'pc1', 'open-id')).toBe('open-id')
  })

  it('returns null when unstamped and no node is open', () => {
    expect(resolveAcceptTarget(emptyResolutions(), 'pc1', null)).toBeNull()
  })

  it('a missing-target stamp returns null even with a node open — never the open page (ticket-30)', () => {
    const missing: ConversationResolutions = {
      ...emptyResolutions(),
      targets: { pc1: { nodeId: 'gone-id', nodeName: '', missing: true } },
    }
    expect(resolveAcceptTarget(missing, 'pc1', 'open-id')).toBeNull()
  })
})

// ── resolveStampTarget (ticket-30 review must-fix 1) ─────────────────────────
// The stamp is write-once and persisted, so it must never mis-resolve: a
// cross-page target is stamped only from the LOADED pages list, deferred while
// that list is in-flight, and marked missing (not open-page-fallback) when the
// id is absent.

describe('resolveStampTarget', () => {
  const pages = [
    { id: 'ceramics-id', title: 'Ceramics Studio Plan' },
    { id: 'garage-id', title: 'Garage' },
  ]
  const base = { pages, pagesLoaded: true, openNodeId: 'open-id', openNodeName: 'Open Page' }

  it('resolves a cross-page target by id from the loaded pages list', () => {
    expect(resolveStampTarget({ ...base, targetPageId: 'ceramics-id' })).toEqual({
      nodeId: 'ceramics-id',
      nodeName: 'Ceramics Studio Plan',
    })
  })

  it('DEFERS while the pages list is in-flight — never stamps against a partial list', () => {
    expect(resolveStampTarget({ ...base, pagesLoaded: false, targetPageId: 'ceramics-id' })).toBe(
      'defer'
    )
  })

  it('an id absent from the loaded list stamps missing — never falls back to the open page', () => {
    expect(resolveStampTarget({ ...base, targetPageId: 'deleted-id' })).toEqual({
      nodeId: 'deleted-id',
      nodeName: '',
      missing: true,
    })
  })

  it('no targetPageId → the open page (id + name)', () => {
    expect(resolveStampTarget({ ...base })).toEqual({ nodeId: 'open-id', nodeName: 'Open Page' })
  })

  it('no targetPageId and no open page → null (unstamped; accept skips)', () => {
    expect(resolveStampTarget({ ...base, openNodeId: null, openNodeName: null })).toBeNull()
  })

  it('a missing stamp survives the resolutions parse round-trip', () => {
    const parsed = parseResolutions({
      changes: {},
      creates: {},
      skipped: {},
      targets: { pc1: { nodeId: 'gone-id', nodeName: '', missing: true } },
    })
    expect(parsed.targets.pc1?.missing).toBe(true)
    expect(resolveAcceptTarget(parsed, 'pc1', 'open-id')).toBeNull()
  })
})
