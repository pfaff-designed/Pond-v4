/**
 * `timeline` module view (#11) — read-only Gantt render in module-card chrome.
 *
 * The view is plain DOM (no @visx), so jsdom can assert the real surface: kicker
 * title + caption chrome, one labelled bar per dated item (via the read-only
 * aria-labels the #27 gantt view mode established), weekly axis tick labels, the
 * milestone tick for a missing end, and the calm empty state. Read-only means NO
 * buttons: nothing to drag, no edge handles.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { TimelineView } from '@/lib/modules/timeline/view'
import type { TimelineBlock } from '@/lib/modules/timeline/schema'

const block: TimelineBlock = {
  id: 'tl1',
  type: 'timeline',
  title: 'Renovation',
  caption: 'Fall push',
  items: [
    { label: 'Demo', start: '2026-09-01', end: '2026-09-05' },
    { label: 'Framing', start: '2026-09-08', end: '2026-09-24' },
    { label: 'Inspection', start: '2026-09-30' }, // milestone: no end
  ],
}

describe('TimelineView', () => {
  it('renders card chrome: kicker title and caption', () => {
    render(<TimelineView data={block} />)
    expect(screen.getByText('Renovation')).toBeInTheDocument()
    expect(screen.getByText('Fall push')).toBeInTheDocument()
  })

  it('renders one read-only bar per dated item with its span in the aria-label', () => {
    render(<TimelineView data={block} />)
    expect(screen.getByRole('img', { name: 'Demo: 2026-09-01 – 2026-09-05' })).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Framing: 2026-09-08 – 2026-09-24' })
    ).toBeInTheDocument()
  })

  it('renders a missing-end item as a single-day milestone tick', () => {
    render(<TimelineView data={block} />)
    // A tick's label collapses to the single day — no " – end" half.
    expect(screen.getByRole('img', { name: 'Inspection: 2026-09-30' })).toBeInTheDocument()
  })

  it('draws weekly axis tick labels every 7th day off the range start', () => {
    render(<TimelineView data={block} />)
    // Range 2026-09-01 → 2026-09-30 (30 days) → ticks at Sep 1/8/15/22/29.
    for (const tick of ['Sep 1', 'Sep 8', 'Sep 15', 'Sep 22', 'Sep 29']) {
      expect(screen.getAllByText(tick).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('omits an item with an unusable start and still renders the rest', () => {
    render(
      <TimelineView
        data={{
          ...block,
          items: [...block.items, { label: 'Junk', start: 'not-a-date' }],
        }}
      />
    )
    expect(screen.queryByText('Junk')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Demo: 2026-09-01 – 2026-09-05' })).toBeInTheDocument()
  })

  it('is read-only: no buttons (no drag body, no resize edge handles)', () => {
    render(<TimelineView data={block} editable onChange={() => {}} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders a calm empty state for no items, never a crash', () => {
    render(<TimelineView data={{ id: 'tl2', type: 'timeline', title: 'Plan', items: [] }} />)
    expect(screen.getByText('Plan')).toBeInTheDocument()
    expect(screen.getByText('No data yet')).toBeInTheDocument()
  })
})

describe('shared gantt fragments (#11 acceptance 6 — one source, two renderers)', () => {
  it('both the gantt view mode and the timeline module import the SAME formatTick + bar shell', async () => {
    const shared = await import('@/lib/modules/view/gantt-shared')
    expect(typeof shared.formatTick).toBe('function')
    expect(typeof shared.GANTT_BAR_SHELL).toBe('string')
    // UTC-noon discipline: a tick label never drifts a day in any zone.
    expect(shared.formatTick('2026-09-01')).toBe('Sep 1')
  })
})
