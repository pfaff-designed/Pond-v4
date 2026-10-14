/**
 * @jest-environment node
 *
 * #97 — make page: the write behind the `new page — proposed` card, and the
 * made-from stamp the page is born with.
 *
 * Proves, against a Supabase double: the prose moves across WORD FOR WORD as
 * the first block; Pond adds only the "mentioned" list; the page carries its
 * kind and the made-from stamp (hideable, never removable); a parent deleted
 * between proposal and make page is refused BEFORE any write; a very long name
 * is clamped; and the proposal is born as a `proposed` change-log record keyed
 * by the proposal id.
 */

import { ParentGoneError, makePageFromAnswer, recordPageProposal } from '@/lib/pages/make-page'
import {
  MADE_FROM_THREAD_KEY,
  readMadeFrom,
  setMadeFromHidden,
  stampMadeFrom,
  withMadeFromHidden,
} from '@/lib/pages/made-from'
import { MENTIONED_KEY, readMentioned, stampMentioned } from '@/lib/pages/mentioned'
import { PAGE_NAME_MAX, type PageProposal } from '@/lib/conversation/page-proposals'

const PROSE =
  'One thing: the cabinet quote. The worktop template cannot be booked until the carcasses are measured.'

function proposal(over: Partial<PageProposal> = {}): PageProposal {
  return {
    id: 'pp-1',
    messageId: 'a1',
    question: 'what is actually blocking the renovation?',
    askedAt: '2026-09-22T07:12:00Z',
    prose: PROSE,
    read: ['kitchen renovation', 'budget'],
    name: 'renovation blockers',
    parentId: 'kr-1',
    kind: 'page',
    status: 'proposed',
    ...over,
  }
}

type Row = Record<string, unknown>

/** A supabase double: `pages` reads answer from `existing`; inserts and updates
 *  are captured per table. */
function makeSupabase(
  opts: { existing?: Record<string, Row>; user?: boolean; rpc?: (fn: string) => unknown } = {}
) {
  const existing = opts.existing ?? {}
  const inserts: { table: string; row: Row }[] = []
  const updates: { table: string; row: Row; id?: string }[] = []
  const rpcCalls: string[] = []
  const api = {
    auth: {
      getUser: async () => ({ data: { user: opts.user === false ? null : { id: 'user-1' } } }),
    },
    rpc: async (fn: string) => {
      rpcCalls.push(fn)
      return opts.rpc ? opts.rpc(fn) : { data: null, error: null }
    },
    from(table: string) {
      let wantedId: string | undefined
      let pendingUpdate: Row | undefined
      let pendingInsert: Row | undefined
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (_col: string, val: string) => {
          wantedId = val
          if (pendingUpdate) updates.push({ table, row: pendingUpdate, id: val })
          return chain
        },
        maybeSingle: async () => ({ data: wantedId ? (existing[wantedId] ?? null) : null }),
        insert: (row: Row) => {
          pendingInsert = row
          inserts.push({ table, row })
          return chain
        },
        update: (row: Row) => {
          pendingUpdate = row
          return chain
        },
        single: async () => ({ data: { ...pendingInsert, id: `${table}-new` }, error: null }),
      }
      return chain
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: api as any, inserts, updates, rpcCalls }
}

const mint = () => {
  let n = 0
  return () => `b${++n}`
}

const PARENT: Row = {
  id: 'kr-1',
  parent_id: 'cre-1',
  type: 'page',
  title: 'Kitchen renovation',
  blocks: [],
  props: {},
  order: 0,
}

describe('makePageFromAnswer', () => {
  it('writes the page with the prose word for word, the mentioned list, its kind and the made-from stamp', async () => {
    const { supabase, inserts } = makeSupabase({ existing: { 'kr-1': PARENT } })

    const made = await makePageFromAnswer(
      supabase,
      {
        proposal: proposal({
          mentioned: [
            { title: 'Cabinet quote', ref: 'cq-1', note: 'the one everything waits on' },
            { title: 'Worktop template', ref: 'wt-1', note: 'after the carcasses are measured' },
          ],
        }),
        threadId: 'conv-1',
        pages: [
          { id: 'kr-1', title: 'Kitchen renovation' },
          { id: 'cq-1', title: 'Cabinet quote' },
          { id: 'wt-1', title: 'Worktop template' },
        ],
        pondId: 'pond-1',
        answerSentAt: '2026-09-22T07:12:00Z',
      },
      mint()
    )

    expect(made.id).toBe('pages-new')
    expect(inserts).toHaveLength(1)
    const row = inserts[0].row
    expect(inserts[0].table).toBe('pages')
    expect(row.parent_id).toBe('kr-1')
    expect(row.type).toBe('page')
    expect(row.title).toBe('renovation blockers')
    expect(row.pond_id).toBe('pond-1')
    // The prose, word for word, is the page's ONLY block (6a frame 5), stamped
    // with when the answer itself was sent.
    expect(row.blocks).toEqual([
      { id: 'b1', type: 'text', content: PROSE, pondStampAt: '2026-09-22T07:12:00Z' },
    ])
    // What the answer mentioned is a card, not prose, so it rides in props beside
    // the made-from stamp — carried from the proposal's own mentioned list
    // (KAN-172), not re-derived from the prose.
    expect(row.props).toEqual({
      kind: 'page',
      [MADE_FROM_THREAD_KEY]: {
        threadId: 'conv-1',
        messageId: 'a1',
        question: 'what is actually blocking the renovation?',
        askedAt: '2026-09-22T07:12:00Z',
        madeAt: expect.any(String),
      },
      [MENTIONED_KEY]: [
        { title: 'Cabinet quote', ref: 'cq-1', note: 'the one everything waits on' },
        { title: 'Worktop template', ref: 'wt-1', note: 'after the carcasses are measured' },
      ],
    })
  })

  it('strips the model-identified leadIn/signOff from the body, leaving the record’s prose untouched', async () => {
    const { supabase, inserts } = makeSupabase({ existing: {} })
    const prose = 'Sure — here’s the rundown: the cabinet quote is the blocker. Want me to chase it?'
    const leadIn = 'Sure — here’s the rundown: '
    const signOff = ' Want me to chase it?'
    const made = await makePageFromAnswer(
      supabase,
      {
        proposal: proposal({ parentId: null, prose, leadIn, signOff }),
        threadId: null,
        pages: [],
        pondId: null,
      },
      mint()
    )
    expect(made.id).toBe('pages-new')
    expect(inserts[0].row.blocks).toEqual([
      { id: 'b1', type: 'text', content: 'the cabinet quote is the blocker.' },
    ])
    // `proposal.prose` itself is never mutated — only the text handed to the block.
    expect(proposal({ parentId: null, prose, leadIn, signOff }).prose).toBe(prose)
  })

  it('falls back to the deterministic lead-in shape when the model named no leadIn/signOff', async () => {
    const { supabase, inserts } = makeSupabase({ existing: {} })
    const prose = 'Good question. The cabinet quote is the blocker.'
    await makePageFromAnswer(
      supabase,
      { proposal: proposal({ parentId: null, prose }), threadId: null, pages: [], pondId: null },
      mint()
    )
    expect(inserts[0].row.blocks).toEqual([
      { id: 'b1', type: 'text', content: 'The cabinet quote is the blocker.' },
    ])
  })

  it('leaves the prose untouched, byte for byte, when it carries no chat framing at all', async () => {
    const { supabase, inserts } = makeSupabase({ existing: { 'kr-1': PARENT } })
    await makePageFromAnswer(
      supabase,
      { proposal: proposal(), threadId: null, pages: [], pondId: 'pond-1' },
      mint()
    )
    expect(inserts[0].row.blocks).toEqual([{ id: 'b1', type: 'text', content: PROSE }])
    // No `answerSentAt` given — the block carries no `pondStampAt` key at all,
    // not one written as `null`.
    const block = (inserts[0].row.blocks as Record<string, unknown>[])[0]
    expect(block).not.toHaveProperty('pondStampAt')
  })

  it('adds no mentioned list when the proposal carries no mentioned field', async () => {
    const { supabase, inserts } = makeSupabase({ existing: { 'kr-1': PARENT } })
    await makePageFromAnswer(
      supabase,
      { proposal: proposal(), threadId: null, pages: [{ id: 'x', title: 'Sleep' }], pondId: null },
      mint()
    )
    expect(inserts[0].row.blocks).toEqual([{ id: 'b1', type: 'text', content: PROSE }])
    // No mentions, no key at all — an empty list is never written.
    expect(inserts[0].row.props).not.toHaveProperty(MENTIONED_KEY)
  })

  it('refuses when the parent was deleted between proposal and make page — nothing is written', async () => {
    const { supabase, inserts } = makeSupabase({ existing: {} })
    await expect(
      makePageFromAnswer(
        supabase,
        { proposal: proposal(), threadId: null, pages: [], pondId: null },
        mint()
      )
    ).rejects.toBeInstanceOf(ParentGoneError)
    expect(inserts).toHaveLength(0)
  })

  it('writes at top level when no parent is chosen, without looking a parent up', async () => {
    const { supabase, inserts } = makeSupabase({ existing: {} })
    await makePageFromAnswer(
      supabase,
      { proposal: proposal({ parentId: null }), threadId: null, pages: [], pondId: null },
      mint()
    )
    expect(inserts[0].row.parent_id).toBeNull()
  })

  it('clamps a very long name and falls back for an empty one; an edited kind is kept', async () => {
    const { supabase, inserts } = makeSupabase({ existing: {} })
    const long = Array.from({ length: 90 }, (_, i) => `word${i}`).join(' ')
    await makePageFromAnswer(
      supabase,
      {
        proposal: proposal({ parentId: null, name: long, kind: ' project ' }),
        threadId: null,
        pages: [],
        pondId: null,
      },
      mint()
    )
    const title = inserts[0].row.title as string
    expect(title.length).toBeLessThanOrEqual(PAGE_NAME_MAX)
    expect(long.startsWith(title)).toBe(true)
    expect((inserts[0].row.props as Row).kind).toBe('project')

    await makePageFromAnswer(
      supabase,
      {
        proposal: proposal({ parentId: null, name: '   ' }),
        threadId: null,
        pages: [],
        pondId: null,
      },
      mint()
    )
    expect(inserts[1].row.title).toBe('untitled')
  })

  it('needs a session', async () => {
    const { supabase } = makeSupabase({ user: false })
    await expect(
      makePageFromAnswer(
        supabase,
        { proposal: proposal({ parentId: null }), threadId: null, pages: [], pondId: null },
        mint()
      )
    ).rejects.toThrow(/not authenticated/i)
  })

  it('marks first run done once the page is made', async () => {
    const { supabase, rpcCalls } = makeSupabase({ existing: {} })
    await makePageFromAnswer(
      supabase,
      { proposal: proposal({ parentId: null }), threadId: null, pages: [], pondId: null },
      mint()
    )
    expect(rpcCalls).toEqual(['mark_first_run_done'])
  })

  it('still returns the made page when marking first run done fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { supabase } = makeSupabase({
      existing: {},
      rpc: () => ({ data: null, error: new Error('down') }),
    })
    const made = await makePageFromAnswer(
      supabase,
      { proposal: proposal({ parentId: null }), threadId: null, pages: [], pondId: null },
      mint()
    )
    expect(made.id).toBe('pages-new')
    spy.mockRestore()
  })
})

describe('recordPageProposal — born `proposed`, in the proposed view', () => {
  it('inserts one proposed create_page record keyed by the proposal id, carrying the read chips', async () => {
    const { supabase, inserts } = makeSupabase()
    const ok = await recordPageProposal(supabase, {
      userId: 'user-1',
      pondId: 'pond-2',
      threadId: 'conv-1',
      proposal: proposal(),
    })
    expect(ok).toBe(true)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].table).toBe('change_log')
    const row = inserts[0].row
    expect(row).toMatchObject({
      user_id: 'user-1',
      pond_id: 'pond-2',
      status: 'proposed',
      action: 'create_page',
      actor: 'pond',
      target_page_id: null,
      before: null,
      source_thread_id: 'conv-1',
      tool_call_id: 'pp-1',
      read: ['kitchen renovation', 'budget'],
    })
    expect(row.after).toMatchObject({
      title: 'renovation blockers',
      parentId: 'kr-1',
      kind: 'page',
      prose: PROSE,
    })
    expect(row.transitions).toEqual([
      expect.objectContaining({ status: 'proposed', actor: 'pond' }),
    ])
  })

  it('never throws when the log is unavailable', async () => {
    const supabase = {
      from: () => {
        throw new Error('down')
      },
    }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ok = await recordPageProposal(supabase as any, {
      pondId: 'pond-1',
      userId: 'user-1',
      threadId: null,
      proposal: proposal(),
    })
    expect(ok).toBe(false)
    spy.mockRestore()
  })
})

describe('made-from stamp — hideable, not removable', () => {
  const stamp = {
    threadId: 'conv-1',
    messageId: 'a1',
    question: 'q?',
    askedAt: null,
    madeAt: '2026-09-22T07:12:00Z',
  }

  it('stamps once and reads back', () => {
    const props = stampMadeFrom({ kind: 'page' }, stamp)
    expect(readMadeFrom(props)).toEqual(stamp)
    // A second stamp does not overwrite the first.
    const again = stampMadeFrom(props, { ...stamp, messageId: 'other' })
    expect(again).toBe(props)
  })

  it('reads null for a page without a stamp or with a malformed one', () => {
    expect(readMadeFrom({})).toBeNull()
    expect(readMadeFrom(null)).toBeNull()
    expect(readMadeFrom({ [MADE_FROM_THREAD_KEY]: { question: 'no message id' } })).toBeNull()
  })

  it('hide and show toggle only the flag; the stamp itself stays', () => {
    const props = stampMadeFrom({ kind: 'page', _schema: [] }, stamp)
    const hidden = withMadeFromHidden(props, true)
    expect(readMadeFrom(hidden)).toEqual({ ...stamp, hidden: true })
    expect(hidden._schema).toEqual([])
    expect(hidden.kind).toBe('page')
    const shown = withMadeFromHidden(hidden, false)
    expect(readMadeFrom(shown)).toEqual(stamp)
    // There is no way to remove it through this module.
    expect(Object.keys(shown)).toContain(MADE_FROM_THREAD_KEY)
  })

  it('leaves a page with no stamp untouched', () => {
    const props = { kind: 'page' }
    expect(withMadeFromHidden(props, true)).toBe(props)
  })

  it('persists the toggle by read-merge-write on props, keeping everything else', async () => {
    const { supabase, updates } = makeSupabase({
      existing: {
        'p-1': { props: { kind: 'page', _schema: [{ id: 'f' }], [MADE_FROM_THREAD_KEY]: stamp } },
      },
    })
    await setMadeFromHidden(supabase, 'p-1', true)
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe('p-1')
    const props = updates[0].row.props as Record<string, unknown>
    expect(props._schema).toEqual([{ id: 'f' }])
    expect(readMadeFrom(props)).toEqual({ ...stamp, hidden: true })
  })

  it('is a no-op for a page without a stamp', async () => {
    const { supabase, updates } = makeSupabase({ existing: { 'p-2': { props: {} } } })
    await setMadeFromHidden(supabase, 'p-2', true)
    expect(updates).toHaveLength(0)
  })
})

// ── props.mentioned — the card's data (6a frame 5) ───────────────────────────

describe('the mentioned list in props', () => {
  it('writes title, ref and note verbatim', () => {
    const props = stampMentioned({ kind: 'page' }, [
      { title: 'Cabinet quote', ref: 'cq-1', note: '' },
      { title: 'Worktop template', ref: 'wt-1', note: 'after the carcasses are measured' },
      { title: 'Electrician', ref: null, note: '   ' },
    ])
    expect(props[MENTIONED_KEY]).toEqual([
      { title: 'Cabinet quote', ref: 'cq-1', note: '' },
      { title: 'Worktop template', ref: 'wt-1', note: 'after the carcasses are measured' },
      { title: 'Electrician', ref: null, note: '   ' },
    ])
    // Everything else on props is left alone.
    expect(props.kind).toBe('page')
  })

  it('writes no key at all for an empty list', () => {
    expect(stampMentioned({ kind: 'page' }, [])).toEqual({ kind: 'page' })
  })

  it('reads back what was written, and null when there is nothing to show', () => {
    const items = [{ title: 'Cabinet quote', ref: 'cq-1', note: '' }]
    expect(readMentioned(stampMentioned({}, items))).toEqual(items)
    expect(readMentioned({})).toBeNull()
    expect(readMentioned(null)).toBeNull()
    expect(readMentioned({ [MENTIONED_KEY]: [] })).toBeNull()
  })

  it('drops a malformed entry rather than throwing — only a missing or blank title drops a row', () => {
    expect(
      readMentioned({
        [MENTIONED_KEY]: [
          { title: 'Budget', ref: 'ok-1', note: 'under review' },
          { ref: 'no-title' },
          { title: '   ', ref: 'blank' },
          { title: 'No note', ref: null },
          'not an object',
          null,
        ],
      })
    ).toEqual([
      { title: 'Budget', ref: 'ok-1', note: 'under review' },
      { title: 'No note', ref: null, note: '' },
    ])
    expect(readMentioned({ [MENTIONED_KEY]: 'not a list' })).toBeNull()
  })
})
