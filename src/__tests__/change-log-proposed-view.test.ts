/**
 * The change log's `proposed` view model — src/lib/change-log/proposed-view.ts.
 *
 * What this item pins: the card head row's three fields (page name, outdated
 * pill, `from <actor> · HH:MM`, day-aware for an older record), the outdated
 * reason line (a transition's own time, or the generic fallback), and that
 * the pill only shows for `outdated`; and `buildDiffRows`, the before/after
 * `Block[]` → remove/add zip.
 */

import { buildDiffRows, buildProposedCards } from '@/lib/change-log/proposed-view'
import { clockTime, formatClockTime } from '@/lib/change-log/page-changes'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import type { Block } from '@/lib/documents/types'

const NOW = new Date('2026-09-26T12:00:00.000Z')

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'proposed',
    action: 'edit',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: 'block-1',
    before: null,
    after: null,
    sourceThreadId: null,
    toolCallId: 'tool-1',
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-09-26T09:24:00.000Z',
    statusAt: '2026-09-26T09:24:00.000Z',
    ...over,
  }
}

const pageTitleById = new Map([['page-1', 'kiwi']])

describe('buildProposedCards', () => {
  it("builds a proposed record's header: page name, no pill, from <actor> · HH:MM", () => {
    const [card] = buildProposedCards([record()], pageTitleById, NOW)

    expect(card.pageName).toBe('kiwi')
    expect(card.statusPill).toBeNull()
    expect(card.actorTime).toBe(`from pond · ${clockTime(record())}`)
    expect(card.reasonLine).toBeNull()
  })

  it('shows the outdated pill, with its own actor/time, and the generic reason line when the record carries no outdated transition', () => {
    const outdated = record({ id: 'rec-2', status: 'outdated', actor: 'you' })
    const [card] = buildProposedCards([outdated], pageTitleById, NOW)

    expect(card.pageName).toBe('kiwi')
    expect(card.statusPill).toBe('outdated')
    expect(card.actorTime).toBe(`from you · ${clockTime(outdated)}`)
    expect(card.reasonLine).toBe('this proposal is out of date — ask Pond to revise it')
  })

  it("names the actor/time's day for a record from an earlier day", () => {
    const yesterday = record({ id: 'rec-3', createdAt: '2026-09-25T17:05:00.000Z' })
    const [card] = buildProposedCards([yesterday], pageTitleById, NOW)

    expect(card.actorTime).toBe(`from pond · yesterday ${formatClockTime(yesterday.createdAt)}`)
  })

  it("the reason line says what changed and when off the record's own outdated transition", () => {
    const transitionAt = '2026-09-26T09:31:00.000Z'
    const outdated = record({
      id: 'rec-4',
      status: 'outdated',
      transitions: [{ status: 'outdated', at: transitionAt, actor: 'pond' }],
    })
    const [card] = buildProposedCards([outdated], pageTitleById, NOW)

    expect(card.reasonLine).toBe(
      `the page changed at ${formatClockTime(transitionAt)} — ask pond to revise it`
    )
  })

  it("says the transition's own day when it fell on an earlier one than `now`", () => {
    const transitionAt = '2026-09-25T17:05:00.000Z' // the day before NOW
    const outdated = record({
      id: 'rec-5',
      status: 'outdated',
      transitions: [{ status: 'outdated', at: transitionAt, actor: 'pond' }],
    })
    const [card] = buildProposedCards([outdated], pageTitleById, NOW)

    expect(card.reasonLine).toBe(
      `the page changed yesterday at ${formatClockTime(transitionAt)} — ask pond to revise it`
    )
  })
})

const text = (id: string, content: string): Block =>
  ({ id, type: 'text', content }) as unknown as Block

describe('buildDiffRows', () => {
  it('a changed block is one edit row — before then after', () => {
    const rows = buildDiffRows([text('b1', 'old')], [text('b1', 'new')])

    expect(rows).toEqual([{ op: 'edit', before: text('b1', 'old'), after: text('b1', 'new') }])
  })

  it('a block present only in after is an add row with no remove', () => {
    const rows = buildDiffRows([], [text('b1', 'new')])

    expect(rows).toEqual([{ op: 'create', before: null, after: text('b1', 'new') }])
  })

  it('a block dropped from after is a remove row alone', () => {
    const rows = buildDiffRows([text('b1', 'gone')], [])

    expect(rows).toEqual([{ op: 'remove', before: text('b1', 'gone'), after: null }])
  })

  it('an unchanged block produces no row', () => {
    const rows = buildDiffRows([text('b1', 'same')], [text('b1', 'same')])

    expect(rows).toEqual([])
  })
})
