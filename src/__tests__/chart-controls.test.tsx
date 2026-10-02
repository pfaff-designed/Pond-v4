/**
 * `ChartControls` — the chart picker beside a `chart` view (#259 review).
 *
 * It had **no** test or story coverage, and #259 added a user-facing `Show` select
 * to it, so the one piece of that slice nothing exercised was new product surface.
 * This covers the two properties that actually bite:
 *
 *  1. **`Show` appears only for a kind the board draws a compact mark for.** The
 *     table in `chart-compact.ts` gives `bar` and `heatmap` a mark and the other
 *     eleven kinds `null`, so offering the control anywhere else would be a choice
 *     that changes nothing — and `PROJECT_RULES.md` is explicit that choices are
 *     offered, never faked.
 *  2. **Every control change must carry every other field through.** `write()`
 *     rebuilds the whole `chart` object from an explicit list, so a field left off
 *     that list is ERASED by the next change. `stacked` was being dropped exactly
 *     this way before this test existed — toggling any control silently un-stacked
 *     a stacked bar view.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { ChartControls } from '@/lib/modules/view/figures'
import type { ViewBlock } from '@/lib/modules/view/schema'
import type { PropertySchema } from '@/lib/properties/schema'

const schema: PropertySchema = [
  { id: 'p-week', name: 'Week', type: 'text' },
  { id: 'p-km', name: 'Km', type: 'number' },
  { id: 'p-day', name: 'Day', type: 'date' },
] as unknown as PropertySchema

const view = (chart: NonNullable<ViewBlock['chart']>): ViewBlock =>
  ({ id: 'v1', type: 'view', mode: 'chart', chart }) as ViewBlock

const bar = {
  kind: 'bar' as const,
  xProperty: 'p-week',
  series: [{ property: 'p-km', agg: 'sum' as const }],
}

function renderControls(chart: NonNullable<ViewBlock['chart']>) {
  const onConfigChange = jest.fn()
  render(<ChartControls config={view(chart)} schema={schema} onConfigChange={onConfigChange} />)
  return onConfigChange
}

/** The `chart` object the component emitted on its one call. */
const emitted = (fn: jest.Mock) => fn.mock.calls[0][0].chart as NonNullable<ViewBlock['chart']>

describe('the Show select is offered only where it does something', () => {
  it.each(['bar', 'heatmap'] as const)('%s has a compact mark, so Show is offered', (kind) => {
    renderControls({ ...bar, kind })
    expect(screen.getByLabelText(/show/i)).toBeInTheDocument()
  })

  it.each(['line', 'area', 'ring', 'gauge', 'radar', 'scatter', 'funnel'] as const)(
    '%s has no compact mark, so Show is NOT offered',
    (kind) => {
      renderControls({ ...bar, kind })
      expect(screen.queryByLabelText(/show/i)).toBeNull()
    }
  )

  it('switches the presentation to compact', () => {
    const onConfigChange = renderControls(bar)
    fireEvent.change(screen.getByLabelText(/show/i), { target: { value: 'compact' } })
    expect(emitted(onConfigChange).presentation).toBe('compact')
  })
})

describe('a control change carries every other field through', () => {
  it('keeps `stacked` — it was being erased before this test (#259 review)', () => {
    const onConfigChange = renderControls({ ...bar, stacked: true })
    fireEvent.change(screen.getByLabelText(/^chart$/i), { target: { value: 'area' } })
    const next = emitted(onConfigChange)
    expect(next.kind).toBe('area')
    expect(next.stacked).toBe(true)
  })

  it('keeps `presentation` when the kind changes, so compact survives', () => {
    const onConfigChange = renderControls({ ...bar, presentation: 'compact' })
    fireEvent.change(screen.getByLabelText(/^chart$/i), { target: { value: 'heatmap' } })
    const next = emitted(onConfigChange)
    expect(next.kind).toBe('heatmap')
    expect(next.presentation).toBe('compact')
  })

  it('keeps the series and x property when the presentation changes', () => {
    const onConfigChange = renderControls(bar)
    fireEvent.change(screen.getByLabelText(/show/i), { target: { value: 'compact' } })
    const next = emitted(onConfigChange)
    expect(next.xProperty).toBe('p-week')
    expect(next.series).toEqual(bar.series)
  })
})
