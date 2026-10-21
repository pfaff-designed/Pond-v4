import { useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { ViewKindPicker, type ViewKindPickerProps, type ViewKindPickerRow } from './ViewKindPicker'
import { VIEW_KINDS } from '@/lib/modules/view/kinds'

/**
 * The ＋ view picker (KAN-243, Views 3/4): one row per `VIEW_KINDS` entry, in
 * table order, drawn in `PondPicker`'s mono row recipe (`SourcePicker`'s/
 * `SlashMenu`'s own `GLASS`/`SLASH_SIZES`/`Row` — the same three stories
 * already cover that chrome's board values; these three states cover what is
 * new here: the remedy hint and the disabled row).
 */

const ALL_SATISFIED: ViewKindPickerRow[] = (Object.keys(VIEW_KINDS) as (keyof typeof VIEW_KINDS)[]).map(
  (mode) => ({ mode })
)

const DATELESS: ViewKindPickerRow[] = ALL_SATISFIED.map((row) =>
  row.mode === 'calendar'
    ? { ...row, remedyLine: 'add a date field to use calendar' }
    : row.mode === 'gantt'
      ? { ...row, remedyLine: 'add a date field to use timeline' }
      : row
)

const ONE_DISABLED: ViewKindPickerRow[] = DATELESS.map((row) =>
  row.mode === 'gantt'
    ? { mode: row.mode, disabled: 'this database has no collection to add a date field to' }
    : row
)

type FrameProps = Omit<ViewKindPickerProps, 'anchor' | 'container' | 'onPick' | 'onClose'> &
  Partial<Pick<ViewKindPickerProps, 'onPick' | 'onClose'>> & { ink?: boolean }

function Frame({ ink, onPick = fn(), onClose = fn(), ...props }: FrameProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <div
      ref={setContainer}
      data-theme={ink ? 'ink' : 'paper'}
      className={`${ink ? 'dark bg-raw-ink' : 'bg-raw-paper'} h-[320px] w-[420px] rounded-mn-inner p-mn-6`}
    >
      <button ref={anchor} type="button" aria-label="add a view">
        ＋ view
      </button>
      {container && (
        <ViewKindPicker anchor={anchor} container={container} onPick={onPick} onClose={onClose} {...props} />
      )}
    </div>
  )
}

const meta = {
  title: 'Molecules/ViewKindPicker',
  component: Frame,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Frame>

export default meta
type Story = StoryObj<typeof meta>

export const AllSatisfied: Story = {
  args: { rows: ALL_SATISFIED },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const options = canvas.getAllByRole('option')
    await expect(options).toHaveLength(ALL_SATISFIED.length)
    await expect(options[0]).toHaveTextContent('table')
    for (const option of options) {
      await expect(option.querySelector('[data-part="hint"]')).toBeNull()
    }
  },
}

export const Dateless: Story = {
  args: { rows: DATELESS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const calendar = canvas.getByRole('option', { name: /calendar/ })
    await expect(calendar).toHaveTextContent('add a date field to use calendar')
    await expect(calendar.className).not.toContain('text-mn-text-meta')
    const timeline = canvas.getByRole('option', { name: /timeline/ })
    await expect(timeline).toHaveTextContent('add a date field to use timeline')
  },
}

export const OneDisabled: Story = {
  args: { rows: ONE_DISABLED },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const timeline = canvas.getByRole('option', { name: /timeline/ })
    await expect(timeline).toHaveTextContent('this database has no collection to add a date field to')
    await expect(timeline.className).toContain('text-mn-text-meta')

    await userEvent.click(timeline)
    // A disabled row never picks — the glass stays open, the row stays put.
    await expect(canvas.getByRole('option', { name: /timeline/ })).toBeInTheDocument()
  },
}
