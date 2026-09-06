/**
 * `timeline` module data (#11) — the standalone AI-composable Gantt.
 *
 * Guards the item→bar mapping (delegating to the shared pure `layoutBars` core)
 * and the honest `serialize` summary. Semantics are inherited from the #27 gantt
 * view mode: missing/backwards `end` → single-day milestone tick; an item with no
 * usable `start` is omitted; empty items → a calm "(no data)", never a crash.
 */
import { layoutTimeline, summarizeTimeline } from '@/lib/modules/timeline/data'
import { moduleDescriptors } from '@/lib/modules/registry'
import type { TimelineItemData } from '@/lib/modules/timeline/schema'

const items: TimelineItemData[] = [
  { label: 'Framing', start: '2026-09-10', end: '2026-09-24' },
  { label: 'Demo', start: '2026-09-01', end: '2026-09-05' },
  { label: 'Inspection', start: '2026-09-30' }, // no end → milestone tick
  { label: 'Backwards', start: '2026-09-08', end: '2026-09-06' }, // end < start → tick
]

describe('layoutTimeline', () => {
  it('lays items out sorted by start, keyed by their item index', () => {
    const { bars } = layoutTimeline(items)
    expect(bars.map((b) => b.label)).toEqual(['Demo', 'Backwards', 'Framing', 'Inspection'])
    expect(bars.map((b) => b.id)).toEqual(['1', '3', '0', '2'])
  })

  it('turns a missing end into a single-day milestone tick', () => {
    const { bars } = layoutTimeline(items)
    const tick = bars.find((b) => b.label === 'Inspection')!
    expect(tick.startIso).toBe('2026-09-30')
    expect(tick.endIso).toBe('2026-09-30')
  })

  it('clamps a backwards end (end < start) to a single-day tick', () => {
    const { bars } = layoutTimeline(items)
    const back = bars.find((b) => b.label === 'Backwards')!
    expect(back.endIso).toBe('2026-09-08')
  })

  it('omits an item whose start is not an ISO day (stale-data tolerance)', () => {
    const { bars } = layoutTimeline([
      { label: 'Good', start: '2026-09-01' },
      { label: 'Junk', start: 'next tuesday' },
    ])
    expect(bars.map((b) => b.label)).toEqual(['Good'])
  })

  it('computes the inclusive range from min start to max end', () => {
    const { rangeStart, rangeEnd } = layoutTimeline(items)
    expect(rangeStart).toBe('2026-09-01')
    expect(rangeEnd).toBe('2026-09-30')
  })

  it('returns an empty layout with null bounds for no items', () => {
    expect(layoutTimeline([])).toEqual({ bars: [], rangeStart: null, rangeEnd: null })
  })
})

describe('summarizeTimeline (serialize)', () => {
  it('summarizes as "Timeline: N items, <min>–<max>"', () => {
    expect(summarizeTimeline({ items })).toBe('Timeline: 4 items, 2026-09-01–2026-09-30')
  })

  it('includes the title and caption when present', () => {
    expect(summarizeTimeline({ title: 'Renovation', caption: 'Fall push', items })).toBe(
      'Timeline "Renovation": 4 items, 2026-09-01–2026-09-30 — Fall push'
    )
  })

  it('counts only DRAWN bars — an unstartable item is not an item the user sees', () => {
    expect(
      summarizeTimeline({
        items: [
          { label: 'Good', start: '2026-09-01' },
          { label: 'Junk', start: 'nope' },
        ],
      })
    ).toBe('Timeline: 1 item, 2026-09-01–2026-09-01')
  })

  it('empty items serialize to a calm "(no data)", not a crash', () => {
    expect(summarizeTimeline({ items: [] })).toBe('Timeline: (no data)')
    expect(summarizeTimeline({ title: 'Plan', items: [] })).toBe('Timeline "Plan": (no data)')
  })

  it('is wired as the registry descriptor serialize facet', () => {
    expect(
      moduleDescriptors.timeline.serialize({
        id: 'b1',
        type: 'timeline',
        title: 'Launch',
        items: [{ label: 'Ship', start: '2026-10-01', end: '2026-10-03' }],
      })
    ).toBe('Timeline "Launch": 1 item, 2026-10-01–2026-10-03')
  })
})
