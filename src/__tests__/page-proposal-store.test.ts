/**
 * @jest-environment node
 *
 * #97 — make-this-a-page proposals in the proposal store and the transcript
 * envelope.
 *
 * The invariants: one press opens one card (a second press on the same answer
 * is ignored); the three fields edit in place while pending; make page settles
 * the card ONCE (a second make page is a no-op — G9); cancel settles it as
 * rejected; a failed write reverts it to pending with the reason; a PENDING card
 * rides the envelope and comes back on reseed (6d closing); and an envelope
 * without any proposals stays byte-identical to before.
 */

import {
  initialProposalState,
  projectResolutions,
  proposalReducer,
} from '@/lib/conversation/proposal-store'
import { emptyResolutions, parseResolutions } from '@/lib/conversation/resolutions'
import type { PageProposal } from '@/lib/conversation/page-proposals'

function proposal(over: Partial<PageProposal> = {}): PageProposal {
  return {
    id: 'pp-1',
    messageId: 'a1',
    question: 'what is actually blocking the renovation?',
    askedAt: '2026-09-22T07:12:00Z',
    prose: 'One thing: the cabinet quote.',
    read: ['kitchen renovation'],
    name: 'renovation blockers',
    parentId: 'kr-1',
    kind: 'page',
    status: 'proposed',
    ...over,
  }
}

describe('proposal store — page proposals', () => {
  it('opens one card per answer: a second proposePage for the same message is ignored', () => {
    let s = proposalReducer(initialProposalState(), { kind: 'proposePage', proposal: proposal() })
    s = proposalReducer(s, { kind: 'proposePage', proposal: proposal({ id: 'pp-2' }) })
    expect(Object.keys(s.pageProposals)).toEqual(['pp-1'])
  })

  it('allows a fresh card for an answer whose earlier card was settled', () => {
    let s = proposalReducer(initialProposalState(), { kind: 'proposePage', proposal: proposal() })
    s = proposalReducer(s, { kind: 'settlePageProposal', id: 'pp-1', status: 'rejected' })
    s = proposalReducer(s, { kind: 'proposePage', proposal: proposal({ id: 'pp-2' }) })
    expect(Object.keys(s.pageProposals)).toEqual(['pp-1', 'pp-2'])
  })

  it('edits name / under / kind in place while pending, and not after', () => {
    let s = proposalReducer(initialProposalState(), { kind: 'proposePage', proposal: proposal() })
    s = proposalReducer(s, {
      kind: 'editPageProposal',
      id: 'pp-1',
      patch: { name: 'blockers', parentId: null, kind: 'project' },
    })
    expect(s.pageProposals['pp-1']).toMatchObject({
      name: 'blockers',
      parentId: null,
      kind: 'project',
    })
    s = proposalReducer(s, {
      kind: 'settlePageProposal',
      id: 'pp-1',
      status: 'accepted',
      pageId: 'p9',
    })
    const after = proposalReducer(s, { kind: 'editPageProposal', id: 'pp-1', patch: { name: 'x' } })
    expect(after).toBe(s)
  })

  it('make page settles the card once with the made page id; a second make page is a no-op (G9)', () => {
    let s = proposalReducer(initialProposalState(), { kind: 'proposePage', proposal: proposal() })
    s = proposalReducer(s, {
      kind: 'settlePageProposal',
      id: 'pp-1',
      status: 'accepted',
      pageId: 'p9',
    })
    expect(s.pageProposals['pp-1']).toMatchObject({ status: 'accepted', pageId: 'p9' })
    const again = proposalReducer(s, {
      kind: 'settlePageProposal',
      id: 'pp-1',
      status: 'accepted',
      pageId: 'p10',
    })
    expect(again).toBe(s)
  })

  it('notePageMade stamps the made page id on an accepted card only', () => {
    let s = proposalReducer(initialProposalState(), { kind: 'proposePage', proposal: proposal() })
    const pending = proposalReducer(s, { kind: 'notePageMade', id: 'pp-1', pageId: 'p9' })
    expect(pending).toBe(s)
    s = proposalReducer(s, { kind: 'settlePageProposal', id: 'pp-1', status: 'accepted' })
    s = proposalReducer(s, { kind: 'notePageMade', id: 'pp-1', pageId: 'p9' })
    expect(s.pageProposals['pp-1']).toMatchObject({ status: 'accepted', pageId: 'p9' })
  })

  it('cancel settles the card as rejected and makes nothing', () => {
    let s = proposalReducer(initialProposalState(), { kind: 'proposePage', proposal: proposal() })
    s = proposalReducer(s, { kind: 'settlePageProposal', id: 'pp-1', status: 'rejected' })
    expect(s.pageProposals['pp-1'].status).toBe('rejected')
    expect(s.pageProposals['pp-1'].pageId).toBeUndefined()
  })

  it('a failed write reverts the card to pending with the reason; settling clears it', () => {
    let s = proposalReducer(initialProposalState(), { kind: 'proposePage', proposal: proposal() })
    s = proposalReducer(s, { kind: 'settlePageProposal', id: 'pp-1', status: 'accepted' })
    s = proposalReducer(s, {
      kind: 'revertPageProposal',
      id: 'pp-1',
      error: 'that place was deleted — pick another',
    })
    expect(s.pageProposals['pp-1'].status).toBe('proposed')
    expect(s.pageProposalErrors['pp-1']).toMatch(/deleted/)
    s = proposalReducer(s, { kind: 'settlePageProposal', id: 'pp-1', status: 'rejected' })
    expect(s.pageProposalErrors['pp-1']).toBeUndefined()
  })

  it('reset clears every proposal', () => {
    const s = proposalReducer(initialProposalState(), { kind: 'proposePage', proposal: proposal() })
    expect(proposalReducer(s, { kind: 'reset' }).pageProposals).toEqual({})
  })
})

describe('the envelope — pending survives (6d closing)', () => {
  it('projects every proposal, pending included, and only when there are any', () => {
    const empty = projectResolutions(initialProposalState())
    expect('pageProposals' in empty).toBe(false)
    expect(empty).toEqual(emptyResolutions())

    const s = proposalReducer(initialProposalState(), { kind: 'proposePage', proposal: proposal() })
    const projected = projectResolutions(s)
    expect(projected.pageProposals).toEqual({ 'pp-1': proposal() })
    expect(projected.pageProposals?.['pp-1'].status).toBe('proposed')
  })

  it('round-trips through parseResolutions and reseeds into a fresh store', () => {
    const s = proposalReducer(initialProposalState(), { kind: 'proposePage', proposal: proposal() })
    const onDisk = JSON.parse(JSON.stringify(projectResolutions(s)))
    const parsed = parseResolutions(onDisk)
    expect(parsed.pageProposals).toEqual({ 'pp-1': proposal() })

    const fresh = proposalReducer(initialProposalState(), { kind: 'reseed', resolutions: parsed })
    expect(fresh.pageProposals['pp-1']).toEqual(proposal())
    // Session-scoped errors never persist.
    expect(fresh.pageProposalErrors).toEqual({})
  })

  it('a legacy envelope without proposals parses to none', () => {
    expect(parseResolutions({ changes: {}, creates: {} }).pageProposals).toBeUndefined()
  })
})
