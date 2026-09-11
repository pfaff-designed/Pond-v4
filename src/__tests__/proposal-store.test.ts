/**
 * @jest-environment node
 *
 * Deep Proposal Store — the pure reducer that concentrates the terminal's ~20
 * flat proposal `useState` maps (`/improve-codebase-architecture` Candidate 1).
 *
 * The load-bearing contract: `projectResolutions` must reproduce the terminal's
 * old 13-dep projection memo (AITerminal.tsx 474–513) BYTE-for-byte, so the
 * on-disk `ConversationResolutions` envelope stays identical (legacy transcripts
 * + `parseResolutions` depend on it). These tests pin that, the pending/settled
 * filter, the reseed round-trip, and the hard-won invariants (write-once target
 * stamp; session-scoped aux never leaking into the envelope).
 */

import {
  proposalReducer,
  initialProposalState,
  projectResolutions,
  type ProposalState,
  type ProposalType,
  type ProposalStatus,
} from '@/lib/conversation/proposal-store'
import type { ConversationResolutions, ProposalDecision } from '@/lib/conversation/resolutions'
import type { QuestionResolutions } from '@/lib/conversation/parts'
import { isLifecycleActive, type LifecycleState } from '@/lib/conversation/lifecycle'

// ── The old projection memo, replicated verbatim from AITerminal.tsx 474–513 ──
// The byte-identity oracle: `projectResolutions` must equal this for the same
// inputs. If the terminal memo changes, this copy (and the store) must change
// together — that is the point of pinning it.
interface LegacyMaps {
  changeDecisions: Record<string, ProposalStatus>
  createDecisions: Record<string, ProposalStatus>
  schemaDecisions: Record<string, ProposalStatus>
  rowDecisions: Record<string, ProposalStatus>
  promotionDecisions: Record<string, ProposalStatus>
  viewDecisions: Record<string, ProposalStatus>
  linkDecisions: Record<string, ProposalStatus>
  changeSkipped: Record<string, number>
  changeTargets: ConversationResolutions['targets']
  questionAnswers: QuestionResolutions
  schemaInertRollups: Record<string, string[]>
  viewReplaced: Record<string, boolean>
  lifecycle: LifecycleState
}

function legacyProjection(m: LegacyMaps): ConversationResolutions {
  const settled = (map: Record<string, ProposalStatus>) =>
    Object.fromEntries(Object.entries(map).filter(([, v]) => v !== 'pending')) as Record<
      string,
      ProposalDecision
    >
  return {
    changes: settled(m.changeDecisions),
    creates: settled(m.createDecisions),
    schemas: settled(m.schemaDecisions),
    rows: settled(m.rowDecisions),
    promotions: settled(m.promotionDecisions),
    views: settled(m.viewDecisions),
    links: settled(m.linkDecisions),
    skipped: m.changeSkipped,
    targets: m.changeTargets,
    questions: m.questionAnswers,
    ...(Object.keys(m.schemaInertRollups).length > 0
      ? { schemaInertRollups: m.schemaInertRollups }
      : {}),
    ...(Object.keys(m.viewReplaced).length > 0 ? { viewReplaced: m.viewReplaced } : {}),
    ...(isLifecycleActive(m.lifecycle) ? { lifecycle: m.lifecycle } : {}),
  }
}

/** Build a ProposalState carrying the given legacy maps (session aux left empty). */
function stateFromMaps(m: LegacyMaps): ProposalState {
  return {
    ...initialProposalState(),
    changes: m.changeDecisions,
    creates: m.createDecisions,
    schemas: m.schemaDecisions,
    rows: m.rowDecisions,
    promotions: m.promotionDecisions,
    views: m.viewDecisions,
    links: m.linkDecisions,
    skipped: m.changeSkipped,
    targets: m.changeTargets,
    questions: m.questionAnswers,
    schemaInertRollups: m.schemaInertRollups,
    viewReplaced: m.viewReplaced,
    lifecycle: m.lifecycle,
  }
}

// A representative envelope, exactly as parseResolutions would produce it:
// settled decisions only, honesty maps present because non-empty, an active
// lifecycle. Key ORDER matches projectResolutions' output (byte-identity).
const richEnvelope: ConversationResolutions = {
  changes: { 'pc1:0': 'accepted', 'pc1:1': 'rejected' },
  creates: { cp1: 'accepted' },
  schemas: { ds1: 'accepted' },
  rows: { ar1: 'rejected' },
  promotions: { pt1: 'accepted' },
  views: { cv1: 'accepted' },
  links: { lr1: 'accepted' },
  skipped: { pc1: 1 },
  targets: { pc1: { nodeId: 'n1', nodeName: 'Camera Gear' } },
  questions: { q1: { answer: 'Glaze it', via: 'option' } },
  schemaInertRollups: { ds1: ['Total cost'] },
  viewReplaced: { cv1: true },
  lifecycle: { phase: 'build-out', projectName: 'Kiln Studio' },
}

describe('initialProposalState / reset', () => {
  it('starts every map empty with an idle lifecycle', () => {
    const s = initialProposalState()
    expect(projectResolutions(s)).toEqual({
      changes: {},
      creates: {},
      schemas: {},
      rows: {},
      promotions: {},
      views: {},
      links: {},
      skipped: {},
      targets: {},
      questions: {},
    })
    expect(s.lifecycle).toEqual({ phase: 'idle' })
  })

  it('reset returns a fresh initial state from any populated state', () => {
    const seeded = proposalReducer(initialProposalState(), {
      kind: 'reseed',
      resolutions: richEnvelope,
    })
    expect(proposalReducer(seeded, { kind: 'reset' })).toEqual(initialProposalState())
  })
})

describe('resolve — settles a decision per proposal type', () => {
  const singleKeyTypes: { type: Exclude<ProposalType, 'changes'>; group: keyof ConversationResolutions }[] =
    [
      { type: 'creates', group: 'creates' },
      { type: 'schemas', group: 'schemas' },
      { type: 'rows', group: 'rows' },
      { type: 'promotions', group: 'promotions' },
      { type: 'views', group: 'views' },
      { type: 'links', group: 'links' },
    ]

  it.each(singleKeyTypes)('resolves $type by toolCallId (accepted + rejected)', ({ type, group }) => {
    let s = proposalReducer(initialProposalState(), {
      kind: 'resolve',
      type,
      id: 'a',
      decision: 'accepted',
    })
    s = proposalReducer(s, { kind: 'resolve', type, id: 'b', decision: 'rejected' })
    const projected = projectResolutions(s)[group] as Record<string, ProposalDecision>
    expect(projected).toEqual({ a: 'accepted', b: 'rejected' })
  })

  it('resolves propose_changes per-change via index (`${id}:${index}`)', () => {
    let s = proposalReducer(initialProposalState(), {
      kind: 'resolve',
      type: 'changes',
      id: 'pc1',
      index: 0,
      decision: 'accepted',
    })
    s = proposalReducer(s, {
      kind: 'resolve',
      type: 'changes',
      id: 'pc1',
      index: 1,
      decision: 'rejected',
    })
    expect(projectResolutions(s).changes).toEqual({ 'pc1:0': 'accepted', 'pc1:1': 'rejected' })
  })

  it('does not mutate the input state', () => {
    const before = initialProposalState()
    const frozen = JSON.stringify(before)
    proposalReducer(before, { kind: 'resolve', type: 'creates', id: 'cp1', decision: 'accepted' })
    expect(JSON.stringify(before)).toBe(frozen)
  })
})

describe('resolve — per-type aux placement', () => {
  it('changes: accumulates skipped, appends skipReasons', () => {
    let s = proposalReducer(initialProposalState(), {
      kind: 'resolve',
      type: 'changes',
      id: 'pc1',
      index: 0,
      decision: 'accepted',
      aux: { skipped: 1, skipReasons: ['no page open'] },
    })
    // A second partial-accept click on the same batch adds to the count/reasons.
    s = proposalReducer(s, {
      kind: 'resolve',
      type: 'changes',
      id: 'pc1',
      decision: 'accepted',
      aux: { skipped: 2, skipReasons: ['blocked by schema'] },
    })
    expect(projectResolutions(s).skipped).toEqual({ pc1: 3 })
    expect(s.skipReasons).toEqual({ pc1: ['no page open', 'blocked by schema'] })
  })

  it('schemas: inertRollups projects only when non-empty', () => {
    const withInert = proposalReducer(initialProposalState(), {
      kind: 'resolve',
      type: 'schemas',
      id: 'ds1',
      decision: 'accepted',
      aux: { inertRollups: ['Total cost'] },
    })
    expect(projectResolutions(withInert).schemaInertRollups).toEqual({ ds1: ['Total cost'] })

    const emptyInert = proposalReducer(initialProposalState(), {
      kind: 'resolve',
      type: 'schemas',
      id: 'ds1',
      decision: 'accepted',
      aux: { inertRollups: [] },
    })
    expect('schemaInertRollups' in projectResolutions(emptyInert)).toBe(false)
  })

  it('views: replaced projects into viewReplaced', () => {
    const s = proposalReducer(initialProposalState(), {
      kind: 'resolve',
      type: 'views',
      id: 'cv1',
      decision: 'accepted',
      aux: { replaced: true },
    })
    expect(projectResolutions(s).viewReplaced).toEqual({ cv1: true })
  })

  it('promotions snapshot is session-scoped (never projected)', () => {
    const s = proposalReducer(initialProposalState(), {
      kind: 'resolve',
      type: 'promotions',
      id: 'pt1',
      decision: 'accepted',
      aux: { snapshot: { columns: ['A', 'B'], rowCount: 3, tableTitle: 'Gear' } },
    })
    expect(s.promotionSnapshot.pt1).toEqual({ columns: ['A', 'B'], rowCount: 3, tableTitle: 'Gear' })
    expect(projectResolutions(s)).not.toHaveProperty('promotionSnapshot')
  })

  it('changes with aux but no index applies batch aux without writing a decision', () => {
    const s = proposalReducer(initialProposalState(), {
      kind: 'resolve',
      type: 'changes',
      id: 'pc1',
      decision: 'accepted',
      aux: { skipped: 2 },
    })
    expect(projectResolutions(s).changes).toEqual({})
    expect(projectResolutions(s).skipped).toEqual({ pc1: 2 })
  })
})

describe('revert — undo an optimistic decision after a failed write', () => {
  it('deletes a single-key decision (create/schema/row/promotion/view/link)', () => {
    let s = proposalReducer(initialProposalState(), {
      kind: 'resolve',
      type: 'creates',
      id: 'cp1',
      decision: 'accepted',
    })
    expect(projectResolutions(s).creates).toEqual({ cp1: 'accepted' })
    s = proposalReducer(s, { kind: 'revert', type: 'creates', id: 'cp1' })
    expect(projectResolutions(s).creates).toEqual({})
  })

  it('deletes one propose_changes key by index, leaving siblings settled', () => {
    let s = proposalReducer(initialProposalState(), {
      kind: 'resolve',
      type: 'changes',
      id: 'pc1',
      index: 0,
      decision: 'accepted',
    })
    s = proposalReducer(s, {
      kind: 'resolve',
      type: 'changes',
      id: 'pc1',
      index: 1,
      decision: 'accepted',
    })
    s = proposalReducer(s, { kind: 'revert', type: 'changes', id: 'pc1', index: 0 })
    expect(projectResolutions(s).changes).toEqual({ 'pc1:1': 'accepted' })
  })

  it('is a no-op for an absent key', () => {
    const s = initialProposalState()
    expect(proposalReducer(s, { kind: 'revert', type: 'schemas', id: 'nope' })).toBe(s)
  })
})

describe('noteLinkError — session-scoped link_records failure reason', () => {
  it('sets an error and clears it when error is omitted (never projected)', () => {
    let s = proposalReducer(initialProposalState(), {
      kind: 'noteLinkError',
      id: 'lr1',
      error: 'no such row',
    })
    expect(s.linkErrors).toEqual({ lr1: 'no such row' })
    expect(projectResolutions(s)).not.toHaveProperty('linkErrors')
    s = proposalReducer(s, { kind: 'noteLinkError', id: 'lr1' })
    expect(s.linkErrors).toEqual({})
  })
})

describe('answerQuestion / pickDestination / advanceLifecycle / stampTarget', () => {
  it('answerQuestion records the answer + via', () => {
    const s = proposalReducer(initialProposalState(), {
      kind: 'answerQuestion',
      id: 'q1',
      answer: 'Glaze it',
      via: 'free',
    })
    expect(projectResolutions(s).questions).toEqual({ q1: { answer: 'Glaze it', via: 'free' } })
  })

  it('pickDestination writes the right session-scoped picker per type (never projected)', () => {
    const cases: { type: Exclude<ProposalType, 'changes'>; field: keyof ProposalState }[] = [
      { type: 'creates', field: 'createParent' },
      { type: 'schemas', field: 'schemaTarget' },
      { type: 'rows', field: 'rowTarget' },
      { type: 'views', field: 'viewTarget' },
      { type: 'links', field: 'linkTarget' },
      { type: 'promotions', field: 'promotionTarget' },
    ]
    for (const { type, field } of cases) {
      const s = proposalReducer(initialProposalState(), {
        kind: 'pickDestination',
        type,
        id: 'x',
        destinationId: 'dest-1',
      })
      expect(s[field]).toEqual({ x: 'dest-1' })
      // Pickers are session-scoped: projecting must not surface them.
      expect(JSON.stringify(projectResolutions(s))).not.toContain('dest-1')
    }
  })

  it('advanceLifecycle replaces the phase and projects it when active', () => {
    const s = proposalReducer(initialProposalState(), {
      kind: 'advanceLifecycle',
      lifecycle: { phase: 'grill', projectName: 'Kiln Studio' },
    })
    expect(projectResolutions(s).lifecycle).toEqual({ phase: 'grill', projectName: 'Kiln Studio' })
  })

  it('stampTarget is write-once — a later stamp (incl. missing) never overwrites', () => {
    let s = proposalReducer(initialProposalState(), {
      kind: 'stampTarget',
      id: 'pc1',
      target: { nodeId: 'n1', nodeName: 'Camera Gear' },
    })
    // A second stamp — even a `missing` one — must be ignored (ticket-30 must-fix 1).
    s = proposalReducer(s, {
      kind: 'stampTarget',
      id: 'pc1',
      target: { nodeId: 'other', nodeName: '', missing: true },
    })
    expect(projectResolutions(s).targets).toEqual({ pc1: { nodeId: 'n1', nodeName: 'Camera Gear' } })
  })
})

describe('projectResolutions — byte-identical to the old memo', () => {
  const empty: LegacyMaps = {
    changeDecisions: {},
    createDecisions: {},
    schemaDecisions: {},
    rowDecisions: {},
    promotionDecisions: {},
    viewDecisions: {},
    linkDecisions: {},
    changeSkipped: {},
    changeTargets: {},
    questionAnswers: {},
    schemaInertRollups: {},
    viewReplaced: {},
    lifecycle: { phase: 'idle' },
  }

  const scenarios: { name: string; maps: LegacyMaps }[] = [
    { name: 'all empty / idle', maps: empty },
    {
      name: 'settled + pending mix (pending filtered), empty honesty maps, idle',
      maps: {
        ...empty,
        changeDecisions: { 'pc1:0': 'accepted', 'pc1:1': 'pending', 'pc1:2': 'rejected' },
        createDecisions: { cp1: 'pending' },
        schemaDecisions: { ds1: 'accepted' },
        changeSkipped: { pc1: 2 },
        changeTargets: { pc1: { nodeId: 'n1', nodeName: 'Gear', missing: true } },
        questionAnswers: { q1: { answer: 'yes', via: 'option' } },
      },
    },
    {
      name: 'non-empty honesty maps + active lifecycle',
      maps: {
        ...empty,
        schemaDecisions: { ds1: 'accepted' },
        viewDecisions: { cv1: 'accepted' },
        schemaInertRollups: { ds1: ['Total', 'Count'] },
        viewReplaced: { cv1: true },
        lifecycle: { phase: 'wayfinding', projectName: 'Kiln', stakes: 'big', grillTurns: 2 },
      },
    },
  ]

  it.each(scenarios)('$name', ({ maps }) => {
    const mine = projectResolutions(stateFromMaps(maps))
    const legacy = legacyProjection(maps)
    expect(mine).toEqual(legacy)
    // Byte identity: same keys, same insertion order, same values.
    expect(JSON.stringify(mine)).toBe(JSON.stringify(legacy))
  })
})

describe('reseed', () => {
  it('round-trips a representative envelope: project(reduce(reseed R)) byte-equals R', () => {
    const s = proposalReducer(initialProposalState(), {
      kind: 'reseed',
      resolutions: richEnvelope,
    })
    const projected = projectResolutions(s)
    expect(projected).toEqual(richEnvelope)
    expect(JSON.stringify(projected)).toBe(JSON.stringify(richEnvelope))
  })

  it('reseeded-but-pending ids stay excluded from the projection', () => {
    // A malformed/hand-edited envelope value carrying a 'pending' must not project
    // (ticket-24/-19: only settled decisions ever persist).
    const withPending = {
      ...richEnvelope,
      creates: { cp1: 'pending' } as unknown as Record<string, ProposalDecision>,
    }
    const s = proposalReducer(initialProposalState(), { kind: 'reseed', resolutions: withPending })
    expect(projectResolutions(s).creates).toEqual({})
  })

  it('leaves the current lifecycle when the envelope carries none', () => {
    const active = proposalReducer(initialProposalState(), {
      kind: 'advanceLifecycle',
      lifecycle: { phase: 'build-out' },
    })
    const noLifecycle: ConversationResolutions = { ...richEnvelope }
    delete noLifecycle.lifecycle
    const s = proposalReducer(active, { kind: 'reseed', resolutions: noLifecycle })
    expect(s.lifecycle).toEqual({ phase: 'build-out' })
  })

  it('does not restore session-scoped aux (it never persisted)', () => {
    const s = proposalReducer(initialProposalState(), {
      kind: 'reseed',
      resolutions: richEnvelope,
    })
    expect(s.skipReasons).toEqual({})
    expect(s.linkErrors).toEqual({})
    expect(s.promotionSnapshot).toEqual({})
    expect(s.createParent).toEqual({})
  })
})
