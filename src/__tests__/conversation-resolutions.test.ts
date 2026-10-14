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
import {
  initialProposalState,
  proposalReducer,
  projectResolutions,
} from '@/lib/conversation/proposal-store'

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

  it('the plain decision note warns the page may have changed, conditioned on the open page actually being attached', () => {
    const out = applyResolutions(proposalTranscript(), {
      ...emptyResolutions(),
      changes: { 'pc1:0': 'accepted' },
    })
    const output = findPart(out, 'pc1').output as { note: string }
    expect(output.note).toMatch(/do not re-propose accepted or rejected/i)
    expect(output.note).toMatch(/page may have changed since/i)
    // Conditional ("if ... is attached"), not an unconditional claim — nothing is
    // attached with no open page / no user message / an unowned page.
    expect(output.note).toMatch(/if the open page's current text is attached to the latest message/i)
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

describe('applyResolutions — define_schema cards (#17 slice 5)', () => {
  function schemaTranscript(): UIMessage[] {
    return [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'make my reading list a database' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-define_schema',
            toolCallId: 'ds1',
            state: 'input-available',
            input: {
              pageId: 'page-reading',
              properties: [{ name: 'Status', type: 'status' }],
            },
          },
        ],
      },
    ] as unknown as UIMessage[]
  }

  it('stamps an accepted define_schema as a tool result so the model stops re-proposing', () => {
    const out = applyResolutions(schemaTranscript(), {
      ...emptyResolutions(),
      schemas: { ds1: 'accepted' },
    })
    const part = findPart(out, 'ds1')
    expect(part.state).toBe('output-available')
    expect(part.output).toMatchObject({ decision: 'accepted' })
    expect((part.output as { note: string }).note).toMatch(/do not propose it again/i)
  })

  it('stamps a rejected define_schema with a dismissal note', () => {
    const out = applyResolutions(schemaTranscript(), {
      ...emptyResolutions(),
      schemas: { ds1: 'rejected' },
    })
    const part = findPart(out, 'ds1')
    expect(part.state).toBe('output-available')
    expect(part.output).toMatchObject({ decision: 'rejected' })
    expect((part.output as { note: string }).note).toMatch(/dismissed/i)
  })

  it('leaves an undecided define_schema card untouched (still dropped from replay)', () => {
    const out = applyResolutions(schemaTranscript(), emptyResolutions())
    expect(findPart(out, 'ds1').state).toBe('input-available')
  })

  // #52 fix 1 — an accepted schema with an inert rollup must be stamped honestly, or
  // the model reads the acceptance as success and claims the rollup computes.
  it('stamps an honest inert-rollup note when accepted with unresolvable rollups', () => {
    const out = applyResolutions(schemaTranscript(), {
      ...emptyResolutions(),
      schemas: { ds1: 'accepted' },
      schemaInertRollups: { ds1: ['Book count'] },
    })
    const output = findPart(out, 'ds1').output as { note: string; inertRollups?: string[] }
    expect(output.note).toMatch(/could NOT be linked/i)
    expect(output.note).toContain('Book count')
    expect(output.note).toMatch(/do not claim it computes/i)
    expect(output.inertRollups).toEqual(['Book count'])
  })
})

describe('applyResolutions — add_row cards (#18)', () => {
  function rowTranscript(): UIMessage[] {
    return [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'add Dune to my reading list' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-add_row',
            toolCallId: 'ar1',
            state: 'input-available',
            input: {
              collectionId: 'coll-reading',
              title: 'Dune',
              props: { Author: 'Frank Herbert' },
            },
          },
        ],
      },
    ] as unknown as UIMessage[]
  }

  it('stamps an accepted add_row as a tool result so the model stops re-proposing', () => {
    const out = applyResolutions(rowTranscript(), {
      ...emptyResolutions(),
      rows: { ar1: 'accepted' },
    })
    const part = findPart(out, 'ar1')
    expect(part.state).toBe('output-available')
    expect(part.output).toMatchObject({ decision: 'accepted' })
    expect((part.output as { note: string }).note).toMatch(/do not propose it again/i)
  })

  it('stamps a rejected add_row with a dismissal note', () => {
    const out = applyResolutions(rowTranscript(), {
      ...emptyResolutions(),
      rows: { ar1: 'rejected' },
    })
    const part = findPart(out, 'ar1')
    expect(part.state).toBe('output-available')
    expect(part.output).toMatchObject({ decision: 'rejected' })
    expect((part.output as { note: string }).note).toMatch(/dismissed/i)
  })

  it('leaves an undecided add_row card untouched (still dropped from replay)', () => {
    const out = applyResolutions(rowTranscript(), emptyResolutions())
    expect(findPart(out, 'ar1').state).toBe('input-available')
  })
})

describe('applyResolutions — promote_table cards (#29)', () => {
  function promoteTranscript(): UIMessage[] {
    return [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'turn this table into a database' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-promote_table',
            toolCallId: 'pt1',
            state: 'input-available',
            input: { pageId: 'page-1', blockId: 'b-table' },
          },
        ],
      },
    ] as unknown as UIMessage[]
  }

  it('stamps an accepted promote_table as a tool result so the model stops re-proposing', () => {
    const out = applyResolutions(promoteTranscript(), {
      ...emptyResolutions(),
      promotions: { pt1: 'accepted' },
    })
    const part = findPart(out, 'pt1')
    expect(part.state).toBe('output-available')
    expect(part.output).toMatchObject({ decision: 'accepted' })
    expect((part.output as { note: string }).note).toMatch(/do not propose it again/i)
  })

  it('stamps a rejected promote_table with a dismissal note', () => {
    const out = applyResolutions(promoteTranscript(), {
      ...emptyResolutions(),
      promotions: { pt1: 'rejected' },
    })
    const part = findPart(out, 'pt1')
    expect(part.state).toBe('output-available')
    expect(part.output).toMatchObject({ decision: 'rejected' })
    expect((part.output as { note: string }).note).toMatch(/dismissed/i)
  })

  it('leaves an undecided promote_table card untouched (still dropped from replay)', () => {
    const out = applyResolutions(promoteTranscript(), emptyResolutions())
    expect(findPart(out, 'pt1').state).toBe('input-available')
  })
})

describe('applyResolutions — configure_view cards (#19 slice 5)', () => {
  function viewTranscript(): UIMessage[] {
    return [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'show my tasks as a board grouped by status' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-configure_view',
            toolCallId: 'cv1',
            state: 'input-available',
            input: { pageId: 'coll-tasks', mode: 'board', groupBy: 'Status' },
          },
        ],
      },
    ] as unknown as UIMessage[]
  }

  it('stamps an accepted configure_view as a tool result so the model stops re-proposing', () => {
    const out = applyResolutions(viewTranscript(), {
      ...emptyResolutions(),
      views: { cv1: 'accepted' },
    })
    const part = findPart(out, 'cv1')
    expect(part.state).toBe('output-available')
    expect(part.output).toMatchObject({ decision: 'accepted' })
    expect((part.output as { note: string }).note).toMatch(/do not propose it again/i)
  })

  it('stamps a rejected configure_view with a dismissal note', () => {
    const out = applyResolutions(viewTranscript(), {
      ...emptyResolutions(),
      views: { cv1: 'rejected' },
    })
    const part = findPart(out, 'cv1')
    expect(part.state).toBe('output-available')
    expect(part.output).toMatchObject({ decision: 'rejected' })
    expect((part.output as { note: string }).note).toMatch(/dismissed/i)
  })

  it('leaves an undecided configure_view card untouched (still dropped from replay)', () => {
    const out = applyResolutions(viewTranscript(), emptyResolutions())
    expect(findPart(out, 'cv1').state).toBe('input-available')
  })

  // #52 fix 2 — a second configure_view SWITCHES the one active view; the stamp must say
  // so, or the model claims the new and old views coexist.
  it('stamps a "switched active view" note when the accept replaced an existing view', () => {
    const out = applyResolutions(viewTranscript(), {
      ...emptyResolutions(),
      views: { cv1: 'accepted' },
      viewReplaced: { cv1: true },
    })
    const output = findPart(out, 'cv1').output as { note: string; replacedActiveView?: boolean }
    expect(output.note).toMatch(/switched/i)
    expect(output.note).toMatch(/do not claim both views now coexist/i)
    expect(output.replacedActiveView).toBe(true)
  })
})

describe('applyResolutions — link_records cards (#40)', () => {
  function linkTranscript(): UIMessage[] {
    return [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'link the stove to the tent' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-link_records',
            toolCallId: 'lr1',
            state: 'input-available',
            input: {
              fromRow: 'Stove',
              fromCollection: 'Trip Packing',
              relation: 'Packs With',
              toRows: ['Tent'],
            },
          },
        ],
      },
    ] as unknown as UIMessage[]
  }

  it('stamps an accepted link_records as a tool result so the model stops re-proposing', () => {
    const out = applyResolutions(linkTranscript(), {
      ...emptyResolutions(),
      links: { lr1: 'accepted' },
    })
    const part = findPart(out, 'lr1')
    expect(part.state).toBe('output-available')
    expect(part.output).toMatchObject({ decision: 'accepted' })
    expect((part.output as { note: string }).note).toMatch(/do not propose it again/i)
  })

  it('stamps a rejected link_records with a dismissal note', () => {
    const out = applyResolutions(linkTranscript(), {
      ...emptyResolutions(),
      links: { lr1: 'rejected' },
    })
    const part = findPart(out, 'lr1')
    expect(part.state).toBe('output-available')
    expect(part.output).toMatchObject({ decision: 'rejected' })
    expect((part.output as { note: string }).note).toMatch(/dismissed/i)
  })

  it('leaves an undecided link_records card untouched (still dropped from replay)', () => {
    const out = applyResolutions(linkTranscript(), emptyResolutions())
    expect(findPart(out, 'lr1').state).toBe('input-available')
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
    const unanswered = await toModelMessages(
      applyResolutions(questionTranscript(), emptyResolutions())
    )
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
      schemas: { ds1: 'accepted' }, // #17 slice 5: define_schema decisions
      rows: { ar1: 'accepted' }, // #18: add_row decisions
      promotions: { pt1: 'accepted' }, // #29: promote_table decisions
      views: { cv1: 'accepted' }, // #19 slice 5: configure_view decisions
      links: { lr1: 'accepted' }, // #40: link_records decisions
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
      schemas: {}, // #17 slice 5: present-but-empty on a row with no schema cards
      rows: {}, // #18: present-but-empty on a row with no add_row cards
      promotions: {}, // #29: present-but-empty on a row with no promote_table cards
      views: {}, // #19 slice 5: present-but-empty on a row with no configure_view cards
      links: {}, // #40: present-but-empty on a row with no link_records cards
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

// ── #98: the eight statuses reach the model ──────────────────────────────────

describe('applyResolutions — the other five statuses (#98)', () => {
  function withChanges(
    changes: ConversationResolutions['changes'],
    extra: Partial<ConversationResolutions> = {}
  ): ConversationResolutions {
    return { ...emptyResolutions(), changes, ...extra }
  }

  it('changes requested: the model reads the note and is told to come back revised', () => {
    const out = applyResolutions(
      proposalTranscript(),
      withChanges(
        { 'pc1:0': 'changes_requested', 'pc1:1': 'changes_requested' },
        { changeNotes: { pc1: 'keep the electrician, drop the worktop' } }
      )
    )
    const part = findPart(out, 'pc1')
    expect(part.state).toBe('output-available')
    const output = part.output as { decisions: string[]; note: string; requestedChanges?: string }
    expect(output.decisions).toEqual(['changes_requested', 'changes_requested'])
    expect(output.requestedChanges).toBe('keep the electrician, drop the worktop')
    expect(output.note).toMatch(/requested changes/i)
    expect(output.note).toMatch(/revised/i)
    expect(output.note).not.toMatch(/do not re-propose accepted or rejected/i)
  })

  it('outdated: the model is told the page moved on and not to apply the diff as-is', () => {
    const out = applyResolutions(
      proposalTranscript(),
      withChanges({ 'pc1:0': 'outdated', 'pc1:1': 'outdated' })
    )
    const output = findPart(out, 'pc1').output as { note: string }
    expect(output.note).toMatch(/outdated/i)
    expect(output.note).toMatch(/edited|moved on|changed/i)
  })

  it('withdrawn, undone and reverted each carry their own honest note', () => {
    for (const status of ['withdrawn', 'undone', 'reverted'] as const) {
      const out = applyResolutions(
        proposalTranscript(),
        withChanges({ 'pc1:0': status, 'pc1:1': status })
      )
      const output = findPart(out, 'pc1').output as { note: string; decisions: string[] }
      expect(output.decisions).toEqual([status, status])
      expect(output.note.toLowerCase()).toContain(status)
    }
  })

  it('a resolved card survives real SDK replay whatever its status', async () => {
    const out = applyResolutions(
      proposalTranscript(),
      withChanges({ 'pc1:0': 'outdated', 'pc1:1': 'outdated' })
    )
    const model = await toModelMessages(out)
    const json = JSON.stringify(model)
    expect(json).toContain('pc1')
  })
})

// ── KAN-302 item 5: a redone change must not still read "was undone" ────────
// The card and `resolutions.changes` read the same `changeDecisions` map
// (AITerminal's card-reconcile effect dispatches into it via
// `reconcileCardStatus`), so driving that same reducer through accept → undo →
// redo and projecting it is the realistic path to `applyResolutions`, not a
// resolutions object hand-written with `'accepted'`.
describe('applyResolutions — a redone change (KAN-302 item 5)', () => {
  it('does not tell the model the change "was undone" once a redo has landed', () => {
    let state = initialProposalState()
    // accept
    state = proposalReducer(state, {
      kind: 'resolve',
      type: 'changes',
      id: 'pc1',
      index: 0,
      decision: 'accepted',
    })
    state = proposalReducer(state, {
      kind: 'resolve',
      type: 'changes',
      id: 'pc1',
      index: 1,
      decision: 'accepted',
    })
    // undo — the card-reconcile effect adopts the chain tip (`reconcileCardStatus`'s
    // accepted → undone edge)
    state = proposalReducer(state, {
      kind: 'resolve',
      type: 'changes',
      id: 'pc1',
      index: 0,
      decision: 'undone',
    })
    state = proposalReducer(state, {
      kind: 'resolve',
      type: 'changes',
      id: 'pc1',
      index: 1,
      decision: 'undone',
    })
    // redo — the same effect adopts the tip again (`reconcileCardStatus`'s
    // undone → accepted edge, added for KAN-302 item 4)
    state = proposalReducer(state, {
      kind: 'resolve',
      type: 'changes',
      id: 'pc1',
      index: 0,
      decision: 'accepted',
    })
    state = proposalReducer(state, {
      kind: 'resolve',
      type: 'changes',
      id: 'pc1',
      index: 1,
      decision: 'accepted',
    })

    const out = applyResolutions(proposalTranscript(), projectResolutions(state))
    const output = findPart(out, 'pc1').output as { note: string; decisions: string[] }
    expect(output.decisions).toEqual(['accepted', 'accepted'])
    expect(output.note.toLowerCase()).not.toContain('undone')
    expect(output.note).toMatch(/do not re-propose accepted or rejected/i)
  })
})
