/**
 * @jest-environment node
 *
 * FEATURE — the composer's two paths, end to end, at the level the person
 * experiences them (`Pond 06.01 Ask answer page`).
 *
 * One file per path, asserting the OUTCOME — what got written, where, and what
 * the person is left holding — never a function's return value and never
 * appearance (that is Storybook's job):
 *
 *   1. An answer lands in the THREAD carrying its read chips (S8), and nothing
 *      reaches a page. The chips persist with the transcript, so a reload reads
 *      them off the answer rather than recomputing them from wherever the person
 *      is standing by then.
 *   2. make-this-a-page is the ONLY road from an answer to a page: the card opens
 *      as a `proposed` record in the change log with nothing written; make page
 *      writes one page carrying the prose word for word; cancel and walking away
 *      write nothing. There is no keep-as-note (AUDIT W4).
 *
 * The real modules do the work (`page-proposals`, `proposal-store`, `make-page`,
 * `conversation/client`); the only double is the shared pages fake.
 *
 * NOT here, deliberately: whether the model grills before building or which tool
 * it picks (scripts/eval-{routing,editing}.impl.mts, against the real system
 * prompt), and the terminal's own gate on the card's buttons
 * (make-this-a-page-flow-ui.test.tsx, in the DOM).
 */

import type { UIMessage } from 'ai'
import {
  DEFAULT_PAGE_KIND,
  readChips,
  readStamp,
  withReadStamp,
  type PageProposal,
  type ReadPartLike,
} from '@/lib/conversation/page-proposals'
import {
  initialProposalState,
  projectResolutions,
  proposalReducer,
  type ProposalState,
} from '@/lib/conversation/proposal-store'
import { parseResolutions, emptyResolutions } from '@/lib/conversation/resolutions'
import { saveTranscript } from '@/lib/conversation/client'
import { makePageFromAnswer, recordPageProposal } from '@/lib/pages/make-page'
import { readMadeFrom } from '@/lib/pages/made-from'
import { readMentioned } from '@/lib/pages/mentioned'
import type { TextBlock } from '@/lib/modules/text/schema'
import { makeFakeSupabase, type Row } from './helpers/fake-supabase'

// ── The world ────────────────────────────────────────────────────────────────

const POND = 'pond-1'
const THREAD = 'conv-1'

/** The answer, verbatim — this is the string that must move across word for word. */
const PROSE =
  'One thing: the cabinet quote. The worktop template cannot be booked until the carcasses are measured, and Kitchen renovation still shows no date for it.'

const QUESTION = 'what is actually blocking the renovation?'

const page = (over: Partial<Row> & { id: string }): Row => ({
  user_id: 'user-1',
  pond_id: POND,
  parent_id: null,
  type: 'page',
  title: '',
  blocks: [],
  props: {},
  order: 0,
  ...over,
})

const RENOVATION = page({ id: 'kr-1', title: 'Kitchen renovation', blocks: [{ id: 'b1' }] })
const BUDGET = page({ id: 'b-1', title: 'Budget' })

const TITLES: Record<string, string> = { 'kr-1': 'Kitchen renovation', 'b-1': 'Budget' }

/** The answer as the route streams it: prose plus the two pages it read. */
function answerMessage(): UIMessage {
  return {
    id: 'a1',
    role: 'assistant',
    parts: [
      { type: 'text', text: PROSE },
      { type: 'tool-read_page', state: 'output-available', input: { pageId: 'kr-1' } },
      { type: 'tool-read_page', state: 'output-available', input: { pageId: 'b-1' } },
    ],
  } as unknown as UIMessage
}

function proposal(over: Partial<PageProposal> = {}): PageProposal {
  return {
    id: 'pp-1',
    messageId: 'a1',
    question: QUESTION,
    askedAt: '2026-09-22T07:12:00Z',
    prose: PROSE,
    read: ['Kitchen renovation', 'Budget'],
    name: 'renovation blockers',
    parentId: 'kr-1',
    kind: DEFAULT_PAGE_KIND,
    status: 'proposed',
    ...over,
  }
}

type Write = { table: string; op: 'insert' | 'update'; payload: Record<string, unknown> }

/**
 * The shared pages fake (helpers/fake-supabase) with the other two tables this
 * path touches routed to a recorder: `conversations` — the thread an answer is
 * saved into — and `change_log`, where the card's diff record is born. Only
 * `pages` has real end-state, which is the point: a test can ask "did anything
 * reach a page?" and get the truth.
 */
function harness(seed: Row[]) {
  const pages = makeFakeSupabase(seed)
  const writes: Write[] = []
  const recorder = (table: string) => {
    let payload: Record<string, unknown> = {}
    const settled = () => Promise.resolve({ data: null, error: null })
    const builder = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      order: () => builder,
      limit: () => builder,
      insert(row: Record<string, unknown>) {
        payload = row
        writes.push({ table, op: 'insert', payload: row })
        return builder
      },
      update(row: Record<string, unknown>) {
        payload = row
        writes.push({ table, op: 'update', payload: row })
        return builder
      },
      // change_log reads its own insert back; echo the payload with the columns
      // the DB fills in, so `mapChangeLogRow` sees a whole row.
      single: () =>
        Promise.resolve({
          data: { id: `${table}-1`, created_at: 'now', status_at: 'now', ...payload },
          error: null,
        }),
      maybeSingle: settled,
      then: (resolve: (v: { data: null; error: null }) => unknown) => settled().then(resolve),
    }
    return builder
  }
  return {
    auth: pages.auth,
    from: (table: string) => (table === 'pages' ? pages.from() : recorder(table)),
    _pages: pages._pages,
    _writes: writes,
    /** Rows written to `table`, as the insert/update payloads. */
    wrote: (table: string) => writes.filter((w) => w.table === table),
  }
}

// ── 1. The answer lands in the thread, never on the page ─────────────────────

describe('an answer lands in the thread', () => {
  it('saves the answer to the thread with its read chips, and writes nothing to a page', async () => {
    const sb = harness([RENOVATION, BUDGET])
    const answer = answerMessage()

    // S8: every answer names what it read — the page it was asked from first,
    // then each page the turn opened.
    const chips = readChips({
      contextLabel: 'Kitchen renovation',
      parts: answer.parts as ReadPartLike[],
      resolvePageName: (id) => TITLES[id],
    })
    expect(chips).toEqual(['Kitchen renovation', 'Budget'])

    await saveTranscript(
      sb as never,
      THREAD,
      [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: QUESTION }] } as UIMessage,
        withReadStamp(answer, chips),
      ],
      emptyResolutions()
    )

    // The answer is in the thread…
    const [saved] = sb.wrote('conversations')
    const envelope = JSON.parse(JSON.stringify(saved.payload.transcript)) as {
      messages: UIMessage[]
    }
    expect(envelope.messages).toHaveLength(2)
    // …and the chips came with it, as a fact about the answer rather than about
    // where the person is standing after a reload.
    expect(readStamp(envelope.messages[1].metadata)).toEqual(['Kitchen renovation', 'Budget'])

    // Nothing reached a page: no row was added, and the page the question was
    // asked from still holds exactly the blocks it had.
    expect([...sb._pages.keys()]).toEqual(['kr-1', 'b-1'])
    expect(sb._pages.get('kr-1')!.blocks).toEqual([{ id: 'b1' }])
    expect(JSON.stringify([...sb._pages.values()])).not.toContain('cabinet quote')
  })
})

// ── 2. make-this-a-page is the only road to a page ───────────────────────────

describe('make this a page', () => {
  /** The card, open and pending, exactly as the terminal's press leaves it. */
  const opened = (p = proposal()): ProposalState =>
    proposalReducer(initialProposalState(), { kind: 'proposePage', proposal: p })

  it('opens the card as a proposed record in the change log, with nothing written yet', async () => {
    const sb = harness([RENOVATION, BUDGET])
    const p = proposal()
    const state = opened(p)
    expect(state.pageProposals['pp-1'].status).toBe('proposed')

    await recordPageProposal(sb as never, {
      userId: 'user-1',
      pondId: POND,
      threadId: THREAD,
      proposal: p,
    })

    // The pending card is already in the proposed view (6d closing) — a diff,
    // born `proposed`, keyed by the card so make page / cancel can advance it.
    const [record] = sb.wrote('change_log')
    expect(record.payload).toMatchObject({
      status: 'proposed',
      action: 'create_page',
      actor: 'pond',
      pond_id: POND,
      source_thread_id: THREAD,
      tool_call_id: 'pp-1',
      read: ['Kitchen renovation', 'Budget'],
      after: {
        title: 'renovation blockers',
        parentId: 'kr-1',
        kind: 'page',
        prose: PROSE,
        madeFromMessageId: 'a1',
      },
    })
    // And nothing is made: the card is a question, not a write.
    expect([...sb._pages.keys()]).toEqual(['kr-1', 'b-1'])
  })

  it('make page writes one page carrying the prose word for word, where the card said', async () => {
    const sb = harness([RENOVATION, BUDGET])
    // The three fields edit in place before the press (name · under · kind).
    let state = opened()
    state = proposalReducer(state, {
      kind: 'editPageProposal',
      id: 'pp-1',
      patch: { name: 'what is blocking the renovation', parentId: 'b-1', kind: 'notes' },
    })
    state = proposalReducer(state, { kind: 'settlePageProposal', id: 'pp-1', status: 'accepted' })

    const made = await makePageFromAnswer(
      sb as never,
      {
        pondId: POND,
        proposal: state.pageProposals['pp-1'],
        threadId: THREAD,
        pages: [...sb._pages.values()].map((r) => ({ id: r.id, title: r.title })),
      },
      () => 'blk-1'
    )

    const row = sb._pages.get(made.id)!
    expect(row.title).toBe('what is blocking the renovation')
    expect(row.parent_id).toBe('b-1')
    expect(row.pond_id).toBe(POND)
    // Word for word, as the only block. The "mentioned" list is a card in props,
    // never a second block of prose.
    expect(row.blocks).toEqual<TextBlock[]>([{ id: 'blk-1', type: 'text', content: PROSE }])
    expect(row.props.kind).toBe('notes')
    expect(readMadeFrom(row.props)).toEqual({
      threadId: THREAD,
      messageId: 'a1',
      question: QUESTION,
      askedAt: '2026-09-22T07:12:00Z',
      madeAt: expect.any(String),
    })
    // Mentions ride the proposal record now (KAN-172) — this proposal carries none.
    expect(readMentioned(row.props)).toBeNull()
    // One page, and the pages it read are untouched.
    expect(sb._pages.size).toBe(3)
    expect(sb._pages.get('kr-1')!.blocks).toEqual([{ id: 'b1' }])
  })

  // The card's three exits. Only one of them makes a page — there is no
  // keep-as-note and no keep-in-thread (W4), so walking away leaves the answer
  // in the thread and a card still waiting there after a reload.
  test.each([
    ['make page', 'accepted', 1],
    ['cancel', 'rejected', 0],
    ['walk away and reload', 'proposed', 0],
  ] as const)('%s leaves the card %s and %i new page(s)', async (exit, status, newPages) => {
    const sb = harness([RENOVATION, BUDGET])
    let state = opened()

    if (exit === 'cancel') {
      state = proposalReducer(state, { kind: 'settlePageProposal', id: 'pp-1', status: 'rejected' })
    } else if (exit === 'walk away and reload') {
      // The pending card rides the transcript envelope and comes back.
      const envelope = parseResolutions(JSON.parse(JSON.stringify(projectResolutions(state))))
      state = proposalReducer(initialProposalState(), { kind: 'reseed', resolutions: envelope })
    } else {
      state = proposalReducer(state, { kind: 'settlePageProposal', id: 'pp-1', status: 'accepted' })
      await makePageFromAnswer(
        sb as never,
        { pondId: POND, proposal: state.pageProposals['pp-1'], threadId: THREAD, pages: [] },
        () => 'blk-1'
      )
    }

    expect(state.pageProposals['pp-1'].status).toBe(status)
    expect(sb._pages.size).toBe(2 + newPages)
  })
})
