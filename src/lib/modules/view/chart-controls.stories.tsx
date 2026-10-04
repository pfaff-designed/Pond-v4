import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { ChartControls } from './figures'
import { COMPACT_CHART_MARK } from './chart-compact'
import { CHART_KINDS, type ChartKind } from './aggregate'
import type { ViewBlock } from './schema'
import type { PropertySchema } from '@/lib/properties/schema'

/**
 * `ChartControls` — the picker beside a `chart` view. Two properties of it bite, and
 * both fail SILENTLY, so each has a story here rather than one per matrix cell:
 *
 *  1. **`Show` is offered only where it does something.** `COMPACT_CHART_MARK` gives
 *     `bar` and `heatmap` a compact mark and the other eleven kinds `null`; offering
 *     the control anywhere else would be a choice that changes nothing, and
 *     `PROJECT_RULES.md` is explicit that choices are offered, never faked. The story
 *     sweeps all thirteen kinds against that table, so neither can drift alone.
 *  2. **Every control change carries every other field through.** `write()` spreads
 *     the existing `chart` object, so a field it dropped would be ERASED by the next
 *     change — `stacked` was, which silently un-stacked a stacked bar view (#259
 *     review), and `presentation` would have been next.
 *
 * Pure geometry is not the subject: these are the terse `ControlSelect` shells, whose
 * own values live with the control layer.
 */
const schema: PropertySchema = [
  { id: 'p-week', name: 'Week', type: 'text' },
  { id: 'p-km', name: 'Km', type: 'number' },
  { id: 'p-day', name: 'Day', type: 'date' },
]

const bar = {
  kind: 'bar' as const,
  xProperty: 'p-week',
  series: [{ property: 'p-km', agg: 'sum' as const }],
}

const view = (chart: NonNullable<ViewBlock['chart']>): ViewBlock => ({
  id: 'v1',
  type: 'view',
  mode: 'chart',
  chart,
})

/** The spy every story's emitted config lands on. */
const onConfigChange = fn()

const meta = {
  title: 'Modules/View/Chart controls',
  component: ChartControls,
  parameters: { layout: 'padded' },
  args: { schema, config: view(bar), onConfigChange },
  decorators: [
    (Story) => (
      <div className="flex flex-wrap items-center gap-mn-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChartControls>

export default meta
type Story = StoryObj<typeof meta>

/** The `chart` object the component emitted on its most recent call. */
function emitted() {
  const calls = onConfigChange.mock.calls
  return (calls[calls.length - 1][0] as Partial<ViewBlock>).chart as NonNullable<ViewBlock['chart']>
}

/**
 * All thirteen kinds, each in its own probe: `Show` appears exactly where
 * `COMPACT_CHART_MARK` names a mark — two kinds — and nowhere else.
 */
export const ShowOfferedOnlyWhereItActs: Story = {
  render: (args) => (
    <div className="flex flex-col items-start gap-mn-3">
      {CHART_KINDS.map((kind) => (
        <div key={kind} data-probe={kind} className="flex flex-wrap items-center gap-mn-3">
          <ChartControls {...args} config={view({ ...bar, kind })} />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const show = (kind: ChartKind) =>
      canvasElement.querySelector(`[data-probe="${kind}"] select[aria-label="Show"]`)
    const offered = CHART_KINDS.filter((kind) => show(kind) !== null)
    await expect(offered).toEqual(CHART_KINDS.filter((kind) => COMPACT_CHART_MARK[kind] !== null))
    await expect(offered).toEqual(['bar', 'heatmap'])
    // Every kind still draws its own `Chart` select — only `Show` is conditional.
    for (const kind of CHART_KINDS) {
      await expect(
        canvasElement.querySelector(`[data-probe="${kind}"] select[aria-label="Chart"]`)
      ).not.toBeNull()
    }
  },
}

/** Choosing `compact` switches the presentation — the control is live, not decorative. */
export const ShowSwitchesToCompact: Story = {
  play: async ({ canvasElement }) => {
    onConfigChange.mockClear()
    const canvas = within(canvasElement)
    await userEvent.selectOptions(canvas.getByLabelText('Show'), 'compact')
    const next = emitted()
    await expect(next.presentation).toBe('compact')
    // The rest of the config rides through untouched.
    await expect(next.kind).toBe('bar')
    await expect(next.xProperty).toBe('p-week')
    await expect(next.series).toEqual(bar.series)
  },
}

/**
 * The silent-erasure edge case: changing the KIND keeps `stacked` and `presentation`,
 * which a field list (rather than a spread) would drop without any visible error.
 */
export const EveryOtherFieldRidesThrough: Story = {
  args: { config: view({ ...bar, stacked: true, presentation: 'compact' }) },
  play: async ({ canvasElement }) => {
    onConfigChange.mockClear()
    const canvas = within(canvasElement)
    await userEvent.selectOptions(canvas.getByLabelText('Chart'), 'heatmap')
    const next = emitted()
    await expect(next.kind).toBe('heatmap')
    await expect(next.stacked).toBe(true)
    await expect(next.presentation).toBe('compact')
    await expect(next.xProperty).toBe('p-week')
    await expect(next.series).toEqual(bar.series)
  },
}
