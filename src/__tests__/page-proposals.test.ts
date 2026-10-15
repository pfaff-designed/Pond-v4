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
  PAGE_NAME_MAX,
  clampPageName,
  derivePageName,
  formatThreadMoment,
  formatThreadTime,
  madeFromLabel,
  earlierAnswers,
  openPageProposalIds,
  parsePageProposals,
  parsePlacementResponse,
  precedingUserMessage,
  proposalBlocks,
  readChips,
  stripChatFraming,
  turnReadContext,
  withEarlierAnswer,
  type EarlierAnswer,
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
    mentioned: [],
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

  it('round-trips valid mentioned entries, ref included', () => {
    const mentioned = [
      { title: 'Kitchen renovation', ref: 'kr-1', note: 'the one everything waits on' },
      { title: 'Cabinet quote', ref: null, note: 'not booked yet' },
    ]
    const parsed = parsePageProposals({ m: proposal({ id: 'm', mentioned }) })
    expect(parsed.m.mentioned).toEqual(mentioned)
  })

  it('drops a malformed mentioned entry while keeping the rest', () => {
    const parsed = parsePageProposals({
      m: proposal({
        id: 'm',
        mentioned: [
          { title: 'Kitchen renovation', ref: 'kr-1', note: 'the one everything waits on' },
          { title: 'Cabinet quote' }, // missing note
          { ref: 'budget', note: 'untitled' }, // missing title
        ] as PageProposal['mentioned'],
      }),
    })
    expect(parsed.m.mentioned).toEqual([
      { title: 'Kitchen renovation', ref: 'kr-1', note: 'the one everything waits on' },
    ])
  })

  it('defaults to [] on a legacy record with no mentioned key at all', () => {
    const legacy: Record<string, unknown> = { ...proposal({ id: 'legacy' }) }
    delete legacy.mentioned
    const parsed = parsePageProposals({ legacy })
    expect(parsed.legacy.mentioned).toEqual([])
  })

  it('a persisted proposal missing leadIn/signOff parses fine, carrying neither key', () => {
    const parsed = parsePageProposals({ 'pp-1': proposal() })
    expect(parsed['pp-1'].leadIn).toBeUndefined()
    expect(parsed['pp-1'].signOff).toBeUndefined()
    expect('leadIn' in parsed['pp-1']).toBe(false)
    expect('signOff' in parsed['pp-1']).toBe(false)
  })

  it('round-trips leadIn/signOff when present', () => {
    const parsed = parsePageProposals({
      p: proposal({ id: 'p', leadIn: "Sure, here's the plan:", signOff: 'Want me to add more?' }),
    })
    expect(parsed.p.leadIn).toBe("Sure, here's the plan:")
    expect(parsed.p.signOff).toBe('Want me to add more?')
  })

  it('round-trips an empty leadIn/signOff as "", not as absent — the model said there is none', () => {
    const parsed = parsePageProposals({ p: proposal({ id: 'p', leadIn: '', signOff: '' }) })
    expect(parsed.p.leadIn).toBe('')
    expect(parsed.p.signOff).toBe('')
    expect('leadIn' in parsed.p).toBe(true)
    expect('signOff' in parsed.p).toBe(true)
  })

  it('drops a malformed leadIn/signOff without dropping the rest of the proposal', () => {
    const parsed = parsePageProposals({
      p: { ...proposal({ id: 'p' }), leadIn: 42, signOff: ['nope'] },
    })
    expect(parsed.p).toBeDefined()
    expect(parsed.p.leadIn).toBeUndefined()
    expect(parsed.p.signOff).toBeUndefined()
    expect(parsed.p.prose).toBe(PROSE)
  })
})

describe('parsePlacementResponse — the propose-page route response, tolerantly parsed', () => {
  it('round-trips leadIn/signOff when the route names them', () => {
    const parsed = parsePlacementResponse({
      name: 'renovation blockers',
      parentId: null,
      mentioned: [],
      leadIn: "Sure, here's the plan:",
      signOff: 'Want me to add more?',
    })
    expect(parsed?.leadIn).toBe("Sure, here's the plan:")
    expect(parsed?.signOff).toBe('Want me to add more?')
  })

  it('carries neither key when the route sends none', () => {
    const parsed = parsePlacementResponse({ name: null, parentId: null, mentioned: [] })
    expect(parsed).not.toBeNull()
    expect('leadIn' in (parsed as object)).toBe(false)
    expect('signOff' in (parsed as object)).toBe(false)
  })

  it('round-trips an empty leadIn/signOff as "" — the model looked and found none', () => {
    const parsed = parsePlacementResponse({
      name: 'renovation blockers',
      parentId: null,
      mentioned: [],
      leadIn: '',
      signOff: '',
    })
    expect(parsed?.leadIn).toBe('')
    expect(parsed?.signOff).toBe('')
  })

  it('drops a malformed leadIn/signOff but keeps the rest of the response', () => {
    const parsed = parsePlacementResponse({
      name: 'renovation blockers',
      parentId: null,
      mentioned: [],
      leadIn: 42,
      signOff: ['nope'],
    })
    expect(parsed).not.toBeNull()
    expect(parsed?.name).toBe('renovation blockers')
    expect(parsed?.leadIn).toBeUndefined()
    expect(parsed?.signOff).toBeUndefined()
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

describe('proposalBlocks — the page is born with the prose, word for word', () => {
  const mint = () => {
    let n = 0
    return () => `b${++n}`
  }

  it('moves the prose across verbatim as the one and only block', () => {
    const blocks = proposalBlocks(PROSE, mint())
    expect(blocks).toEqual([{ id: 'b1', type: 'text', content: PROSE }])
  })

  it('never writes the "mentioned" list as prose — it is a card in props, not a block', () => {
    // It used to ride as a second text block, which set its eyebrow as serif body
    // copy and flattened the rows to bullets. See lib/pages/mentioned.ts.
    const blocks = proposalBlocks(PROSE, mint())
    expect(blocks).toHaveLength(1)
    expect(JSON.stringify(blocks)).not.toContain('mentioned')
  })
})

describe('stripChatFraming — the made page drops the chat address, not the content', () => {
  it('drops an exact leadIn prefix and signOff suffix, trimming the remainder', () => {
    const prose =
      "Sure, here's three tips for a morning routine:\n\n1. Sleep well.\n2. Walk outside.\n3. Drink water.\n\nWant me to add more?"
    const leadIn = "Sure, here's three tips for a morning routine:\n\n"
    const signOff = '\n\nWant me to add more?'
    expect(stripChatFraming(prose, leadIn, signOff)).toBe(
      '1. Sleep well.\n2. Walk outside.\n3. Drink water.'
    )
  })

  it('leaves the prose whole when the given leadIn/signOff do not match exactly', () => {
    const prose = 'One thing: the cabinet quote is still unbooked.'
    expect(stripChatFraming(prose, 'Sure, here you go:', 'let me know!')).toBe(prose)
  })

  it('falls back to a deterministic regex for the common lead-in shapes when leadIn is absent', () => {
    expect(stripChatFraming("Sure — here's three tips:\n\n1. Sleep well.")).toBe('1. Sleep well.')
    expect(stripChatFraming("Sure, here's the list:\n\n1. Sleep well.")).toBe('1. Sleep well.')
    expect(stripChatFraming('Good question. The budget is the blocker.')).toBe(
      'The budget is the blocker.'
    )
    expect(stripChatFraming("Here's the plan:\n\n1. Sleep well.")).toBe('1. Sleep well.')
  })

  it('treats an explicit empty leadIn as "the model found none" — it never runs the fallback', () => {
    const prose = 'Good question. The budget is the blocker.'
    expect(stripChatFraming(prose, '', '')).toBe(prose)
  })

  it('only runs the fallback when leadIn is absent, never when it is ""', () => {
    const prose = "Sure — here's three tips:\n\n1. Sleep well."
    expect(stripChatFraming(prose)).toBe('1. Sleep well.')
    expect(stripChatFraming(prose, '')).toBe(prose)
  })

  it('leaves a colon mid-sentence alone — only a colon that ends its own line reads as framing', () => {
    expect(stripChatFraming("Here's the catch: the permit lapsed.")).toBe(
      "Here's the catch: the permit lapsed."
    )
  })

  it('requires the exact leadIn match to end at a word boundary, never mid-word', () => {
    expect(stripChatFraming('Surely you can see the budget is the blocker.', 'Sure')).toBe(
      'Surely you can see the budget is the blocker.'
    )
    expect(stripChatFraming('Sure, the budget is the blocker.', 'Sure')).toBe(
      ', the budget is the blocker.'
    )
  })

  it('never touches the middle of the prose, and never strips when nothing matches', () => {
    expect(stripChatFraming(PROSE)).toBe(PROSE)
    expect(stripChatFraming('The electrician wants a date before he holds the week.')).toBe(
      'The electrician wants a date before he holds the week.'
    )
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

  it('lists a whole-page @-reference the turn fenced for the model', () => {
    expect(
      readChips({
        contextLabel: 'Life',
        parts: [],
        resolvePageName: resolve,
        wholePageRefIds: ['kr-1'],
      })
    ).toEqual(['Life', 'Kitchen renovation'])
  })

  it('withholds the open page when that turn withheld it (openPageContext: false)', () => {
    expect(
      readChips({
        contextLabel: 'Life',
        parts: [],
        resolvePageName: resolve,
        openPageContext: false,
        wholePageRefIds: ['kr-1'],
      })
    ).toEqual(['Kitchen renovation'])
  })
})

describe('precedingUserMessage / turnReadContext — this turn’s own sources (KAN-99)', () => {
  const thread = [
    { id: 'u1', role: 'user', metadata: { openPageContext: false, wholePageRefPageIds: ['p-x'] } },
    { id: 'a1', role: 'assistant', metadata: {} },
    { id: 'u2', role: 'user', metadata: {} },
    { id: 'a2', role: 'assistant', metadata: {} },
  ]

  it('finds the nearest user message above an index', () => {
    expect(precedingUserMessage(thread, 1)?.id).toBe('u1')
    expect(precedingUserMessage(thread, 3)?.id).toBe('u2')
    expect(precedingUserMessage(thread, 0)).toBeUndefined()
  })

  it('reads openPageContext and wholePageRefPageIds off the question it belongs to', () => {
    expect(turnReadContext(thread[0])).toEqual({
      openPageContext: false,
      wholePageRefIds: ['p-x'],
    })
  })

  it('defaults to the pre-KAN-99 shape for a question stamped before this fix', () => {
    expect(turnReadContext(thread[2])).toEqual({ openPageContext: true, wholePageRefIds: [] })
    expect(turnReadContext(undefined)).toEqual({ openPageContext: true, wholePageRefIds: [] })
  })
})

describe('earlierAnswers / withEarlierAnswer — the ask-again stash', () => {
  const entry = (sentAt: string): EarlierAnswer => ({
    parts: [{ type: 'text', text: `answer at ${sentAt}` }],
    sentAt,
    read: ['Kitchen renovation'],
  })

  it('is empty when the metadata carries no stash', () => {
    expect(earlierAnswers(undefined)).toEqual([])
    expect(earlierAnswers(null)).toEqual([])
    expect(earlierAnswers({ sentAt: '2026-09-22T07:12:00Z' })).toEqual([])
  })

  it('appends a single earlier answer onto a message with no stash yet', () => {
    const message = { metadata: { sentAt: '2026-09-22T07:12:00Z' } }
    const withFirst = withEarlierAnswer(message, entry('07:00'))
    expect(earlierAnswers(withFirst.metadata)).toEqual([entry('07:00')])
    // every other metadata field is left alone
    expect(withFirst.metadata).toMatchObject({ sentAt: '2026-09-22T07:12:00Z' })
  })

  it('a second append preserves the first, in order', () => {
    const message = { metadata: { sentAt: '2026-09-22T07:12:00Z' } }
    const withFirst = withEarlierAnswer(message, entry('07:00'))
    const withSecond = withEarlierAnswer(withFirst, entry('07:08'))
    expect(earlierAnswers(withSecond.metadata)).toEqual([entry('07:00'), entry('07:08')])
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
