/**
 * @jest-environment node
 *
 * #97 — make-this-a-page proposals, the pure contract.
 *
 * The answer never lands on a page by itself: the person presses "make this a
 * page", a `new page — proposed` card opens, and only make page writes. These
 * tests pin the record that rides the transcript envelope (a `proposed` card
 * SURVIVES a reload — 6d closing), the name Pond proposes, the "mentioned"
 * list, the blocks a made page is born with (prose word for word), the read
 * chips (S8), and the chip labels.
 */

import {
  DEFAULT_PAGE_KIND,
  MENTIONED_HEADING,
  PAGE_NAME_MAX,
  clampPageName,
  derivePageName,
  formatThreadMoment,
  formatThreadTime,
  madeFromLabel,
  mentionedPages,
  openPageProposalIds,
  parsePageProposals,
  proposalBlocks,
  readChips,
  type PageProposal,
} from '@/lib/conversation/page-proposals'

const PROSE =
  'One thing: the cabinet quote. The worktop template cannot be booked until the carcasses are measured, and the electrician wants a date before he holds the week. Everything else on the board is downstream of that.'

function proposal(over: Partial<PageProposal> = {}): PageProposal {
  return {
    id: 'pp-1',
    messageId: 'a1',
    question: 'what is actually blocking the renovation?',
    askedAt: '2026-09-22T07:12:00Z',
    prose: PROSE,
    read: ['kitchen renovation', 'budget'],
    name: 'renovation blockers',
    parentId: 'kitchen-renovation',
    kind: 'page',
    status: 'proposed',
    ...over,
  }
}

describe('parsePageProposals — the envelope record', () => {
  it('round-trips a proposal, including a PENDING one (6d closing: nothing made, nothing discarded)', () => {
    const parsed = parsePageProposals({ 'pp-1': proposal() })
    expect(parsed['pp-1']).toEqual(proposal())
    expect(parsed['pp-1'].status).toBe('proposed')
  })

  it('keeps accepted and rejected ones, with the made page id when present', () => {
    const parsed = parsePageProposals({
      a: proposal({ id: 'a', status: 'accepted', pageId: 'page-9' }),
      b: proposal({ id: 'b', status: 'rejected' }),
    })
    expect(parsed.a.status).toBe('accepted')
    expect(parsed.a.pageId).toBe('page-9')
    expect(parsed.b.status).toBe('rejected')
    expect(parsed.b.pageId).toBeUndefined()
  })

  it('never throws and drops anything malformed', () => {
    expect(parsePageProposals(undefined)).toEqual({})
    expect(parsePageProposals(null)).toEqual({})
    expect(parsePageProposals('x')).toEqual({})
    expect(parsePageProposals([proposal()])).toEqual({})
    const parsed = parsePageProposals({
      ok: proposal({ id: 'ok' }),
      mismatch: proposal({ id: 'other' }),
      noStatus: { ...proposal({ id: 'noStatus' }), status: 'kept-as-note' },
      noProse: { ...proposal({ id: 'noProse' }), prose: 42 },
      junk: 7,
    })
    expect(Object.keys(parsed)).toEqual(['ok'])
  })

  it('fills gaps tolerantly: empty parent → top level, missing kind → the default kind', () => {
    const parsed = parsePageProposals({
      p: { ...proposal({ id: 'p' }), parentId: '', kind: undefined, read: 'nope' },
    })
    expect(parsed.p.parentId).toBeNull()
    expect(parsed.p.kind).toBe(DEFAULT_PAGE_KIND)
    expect(parsed.p.read).toEqual([])
  })
})

describe('derivePageName — Pond names the page', () => {
  it('uses the question without its trailing question mark', () => {
    expect(derivePageName('what is actually blocking the renovation?', PROSE)).toBe(
      'what is actually blocking the renovation'
    )
  })

  it('strips @ mention sigils', () => {
    expect(derivePageName('what is blocking @kitchen renovation?', PROSE)).toBe(
      'what is blocking kitchen renovation'
    )
  })

  it("falls back to the answer's first sentence, then to untitled", () => {
    expect(derivePageName('', PROSE)).toBe('One thing: the cabinet quote')
    expect(derivePageName('', '')).toBe('untitled')
  })

  it('cuts a very long question on a word boundary, never mid-word', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ') + '?'
    const name = derivePageName(long, '')
    expect(name.length).toBeLessThanOrEqual(60)
    expect(name.endsWith('word')).toBe(false)
    expect(long.replace('?', '').startsWith(name)).toBe(true)
  })
})

describe('clampPageName — a very long proposed name', () => {
  it('collapses whitespace and caps at PAGE_NAME_MAX on a word boundary', () => {
    expect(clampPageName('  renovation   blockers  ')).toBe('renovation blockers')
    const long = Array.from({ length: 80 }, (_, i) => `name${i}`).join(' ')
    const clamped = clampPageName(long)
    expect(clamped.length).toBeLessThanOrEqual(PAGE_NAME_MAX)
    expect(long.startsWith(clamped)).toBe(true)
    expect(/\S$/.test(clamped)).toBe(true)
  })
})

describe('mentionedPages — what the answer mentioned', () => {
  const pages = [
    { id: 'p1', title: 'Kitchen renovation' },
    { id: 'p2', title: 'Budget' },
    { id: 'p3', title: 'Cabinet quote' },
    { id: 'p4', title: 'a' },
    { id: 'p5', title: 'Week' },
  ]

  it('lists pages whose title appears whole in the prose, in order of appearance', () => {
    const prose = 'The cabinet quote is the thing; the budget follows the kitchen renovation.'
    expect(mentionedPages(prose, pages).map((p) => p.id)).toEqual(['p3', 'p2', 'p1'])
  })

  it('ignores tiny titles and partial-word hits', () => {
    expect(mentionedPages('a weekly plan', pages)).toEqual([])
  })

  it('returns one entry per title even when several pages share it', () => {
    const dupes = [
      { id: 'x', title: 'Budget' },
      { id: 'y', title: 'budget' },
    ]
    expect(mentionedPages('the budget', dupes)).toHaveLength(1)
  })
})

describe('proposalBlocks — the page is born with the prose, word for word', () => {
  const mint = () => {
    let n = 0
    return () => `b${++n}`
  }

  it('moves the prose across verbatim as the first text block', () => {
    const blocks = proposalBlocks(PROSE, [], mint())
    expect(blocks).toEqual([{ id: 'b1', type: 'text', content: PROSE }])
  })

  it('adds a "mentioned" list only when there is something to list', () => {
    const blocks = proposalBlocks(PROSE, [{ id: 'p1', title: 'cabinet quote' }], mint())
    expect(blocks).toHaveLength(2)
    expect(blocks[1]).toEqual({
      id: 'b2',
      type: 'text',
      content: `###### ${MENTIONED_HEADING}\n\n- cabinet quote`,
    })
  })
})

describe('readChips — S8, every answer shows what it read', () => {
  const resolve = (id: string) => ({ 'kr-1': 'Kitchen renovation', 'b-1': 'Budget' })[id]

  it('leads with the page the question was asked from, then each read_page, deduped', () => {
    expect(
      readChips({
        contextLabel: 'Kitchen renovation',
        parts: [
          { type: 'text' },
          { type: 'tool-read_page', state: 'output-available', input: { pageId: 'kr-1' } },
          { type: 'tool-read_page', state: 'output-available', input: { pageId: 'b-1' } },
          { type: 'tool-read_page', state: 'input-streaming', input: { pageId: 'zzz' } },
        ],
        resolvePageName: resolve,
      })
    ).toEqual(['Kitchen renovation', 'Budget'])
  })

  it('still renders a chip when nothing was explicitly read — the context page itself', () => {
    expect(readChips({ contextLabel: 'Life', parts: [], resolvePageName: resolve })).toEqual([
      'Life',
    ])
  })

  it('falls back to the raw id for a page it cannot name', () => {
    expect(
      readChips({
        contextLabel: 'Life',
        parts: [{ type: 'tool-read_page', input: { pageId: 'gone' } }],
        resolvePageName: resolve,
      })
    ).toEqual(['Life', 'gone'])
  })
})

describe('labels', () => {
  it('formats the made-from chip as "weekday hh:mm — “question”"', () => {
    const label = madeFromLabel('2026-09-22T07:12:00', 'what is actually blocking the renovation?')
    expect(label).toBe('tuesday 07:12 — “what is actually blocking the renovation?”')
  })

  it('degrades when the moment or the question is unknown', () => {
    expect(madeFromLabel(null, 'q?')).toBe('“q?”')
    expect(madeFromLabel(null, '')).toBe('the thread')
    expect(madeFromLabel('garbage', '')).toBe('the thread')
    expect(formatThreadMoment(null)).toBe('')
    expect(formatThreadTime(undefined)).toBe('')
    expect(formatThreadTime('2026-09-22T07:12:00')).toBe('07:12')
  })
})

describe('openPageProposalIds — which cards pin the drawer', () => {
  it('returns pending ids, excluding the proposals re-seeded from a prior session', () => {
    const open = openPageProposalIds(
      {
        a: proposal({ id: 'a', messageId: 'old' }),
        // Opened THIS session on an OLD answer — it still pins the drawer.
        b: proposal({ id: 'b', messageId: 'old' }),
        c: proposal({ id: 'c', messageId: 'new', status: 'accepted' }),
      },
      new Set(['a'])
    )
    expect(open).toEqual(['b'])
  })
})
