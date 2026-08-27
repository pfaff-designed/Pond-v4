/**
 * Ticket-24 drawer ergonomics — the pure logic behind the AITerminal's
 * auto-grow (unresolved-proposal derivation, session scoping) and the
 * TerminalDrawer's height clamp.
 */

import {
  TERMINAL_MAX_HEIGHT,
  TERMINAL_MIN_HEIGHT,
  clampTerminalHeight,
} from '@/components/molecules/TerminalDrawer'
import {
  changeStatus,
  unresolvedProposalIds,
  type ProposalMessageLike,
} from '@/lib/conversation/proposals'

describe('clampTerminalHeight', () => {
  it('clamps below the minimum', () => {
    expect(clampTerminalHeight(10)).toBe(TERMINAL_MIN_HEIGHT)
  })

  it('clamps above the maximum', () => {
    expect(clampTerminalHeight(99999)).toBe(TERMINAL_MAX_HEIGHT)
  })

  it('passes through in-range heights', () => {
    expect(clampTerminalHeight(300)).toBe(300)
  })
})

describe('changeStatus', () => {
  it('reads a settled decision by toolCallId:index key', () => {
    expect(changeStatus({ 'tc1:0': 'accepted' }, 'tc1', 0)).toBe('accepted')
  })

  it('defaults to pending when undecided', () => {
    expect(changeStatus({}, 'tc1', 0)).toBe('pending')
  })
})

// ── unresolvedProposalIds ────────────────────────────────────────────────────

const changeMsg = (id: string, toolCallId: string, changeCount = 1): ProposalMessageLike => ({
  id,
  parts: [
    {
      type: 'tool-propose_changes',
      toolCallId,
      state: 'input-available',
      input: { changes: Array.from({ length: changeCount }, () => ({})) },
    },
  ],
})

const createMsg = (id: string, toolCallId: string): ProposalMessageLike => ({
  id,
  parts: [{ type: 'tool-create_page', toolCallId, state: 'input-available' }],
})

describe('unresolvedProposalIds', () => {
  it('reports an undecided propose_changes batch', () => {
    expect(unresolvedProposalIds([changeMsg('m1', 'tc1')], {}, {})).toEqual(['tc1'])
  })

  it('reports an undecided create_page card', () => {
    expect(unresolvedProposalIds([createMsg('m1', 'tc1')], {}, {})).toEqual(['tc1'])
  })

  it('is empty once every change in a batch is decided', () => {
    const decisions = { 'tc1:0': 'accepted', 'tc1:1': 'rejected' }
    expect(unresolvedProposalIds([changeMsg('m1', 'tc1', 2)], decisions, {})).toEqual([])
  })

  it('still reports a batch with any change left pending (partial accept)', () => {
    expect(unresolvedProposalIds([changeMsg('m1', 'tc1', 2)], { 'tc1:0': 'accepted' }, {})).toEqual(
      ['tc1']
    )
  })

  it('is empty once a create_page is decided', () => {
    expect(unresolvedProposalIds([createMsg('m1', 'tc1')], {}, { tc1: 'rejected' })).toEqual([])
  })

  it('ignores still-streaming parts (partially-parsed input)', () => {
    const streaming: ProposalMessageLike = {
      id: 'm1',
      parts: [{ type: 'tool-create_page', toolCallId: 'tc1', state: 'input-streaming' }],
    }
    expect(unresolvedProposalIds([streaming], {}, {})).toEqual([])
  })

  it('ignores non-proposal parts', () => {
    const msg: ProposalMessageLike = { id: 'm1', parts: [{ type: 'text' }] }
    expect(unresolvedProposalIds([msg], {}, {})).toEqual([])
  })

  // The fix-4 mount behavior: pending decisions are never persisted in the
  // transcript envelope (ticket-19), so cards re-seeded from a prior session
  // read as pending forever. They must NOT count as unresolved — only
  // proposals that arrive during this session may pin the drawer open.
  it('excludes proposals from messages present at mount (prior-session cards)', () => {
    const seeded = createMsg('old-1', 'tc-old') // re-seeded, undecided, from last session
    const fresh = createMsg('new-1', 'tc-new') // arrived this session
    const atMount = new Set(['old-1'])
    expect(unresolvedProposalIds([seeded, fresh], {}, {}, atMount)).toEqual(['tc-new'])
    // A mount with ONLY historical pending cards pins nothing.
    expect(unresolvedProposalIds([seeded], {}, {}, atMount)).toEqual([])
  })

  it('reports each unresolved proposal id once, across kinds', () => {
    const both: ProposalMessageLike = {
      id: 'm1',
      parts: [
        {
          type: 'tool-propose_changes',
          toolCallId: 'tc1',
          state: 'input-available',
          input: { changes: [{}, {}] },
        },
        { type: 'tool-create_page', toolCallId: 'tc2', state: 'input-available' },
      ],
    }
    expect(unresolvedProposalIds([both], {}, {})).toEqual(['tc1', 'tc2'])
  })
})
