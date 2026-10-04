import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { QuoteChip } from './QuoteChip'

/**
 * QuoteChip (#93) — the excerpt renders THROUGH `<PondAtom kind="quote">` (the
 * Make Noise quote register); this wrapper owns only the × and the 120-character
 * trim. The trim is QuoteChip's own logic, so it is the part worth a table.
 */

/** The chip's delegate atom — the excerpt must come out of this, not the wrapper. */
const quoteAtom = (root: ParentNode) => root.querySelector<HTMLElement>('[data-kind="quote"]')!

const meta = {
  title: 'Atoms/QuoteChip',
  component: QuoteChip,
  parameters: { layout: 'centered' },
  args: {
    text: 'Needs more salt.',
    onRemove: fn(),
  },
} satisfies Meta<typeof QuoteChip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The excerpt is a quote atom, not prose hand-rolled on the wrapper.
    await expect(quoteAtom(canvasElement)).toBeInTheDocument()
    await expect(canvas.getByText('Needs more salt.')).toBeInTheDocument()
  },
}

/**
 * One row per trim case, asserted in a loop — the parametrised form of the
 * old `pond-atom` excerpt test. Over 120 characters the excerpt is cut at 120
 * and gets an ellipsis; at or under 120 it passes through untouched.
 */
const TRIM_CASES: [name: string, input: string, shown: string][] = [
  ['short', 'Needs more salt.', 'Needs more salt.'],
  ['119 — under the limit', 'x'.repeat(119), 'x'.repeat(119)],
  ['120 — exactly the limit, no ellipsis', 'x'.repeat(120), 'x'.repeat(120)],
  ['121 — one over, trimmed', 'x'.repeat(121), `${'x'.repeat(120)}…`],
  ['200 — well over, trimmed', 'x'.repeat(200), `${'x'.repeat(120)}…`],
]

export const Trim: Story = {
  render: () => (
    <div className="flex w-[520px] flex-col gap-mn-2">
      {TRIM_CASES.map(([name, input]) => (
        <div key={name} data-case={name}>
          <QuoteChip text={input} onRemove={() => {}} />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const [name, , shown] of TRIM_CASES) {
      const row = canvasElement.querySelector<HTMLElement>(`[data-case="${name}"]`)!
      await expect(row).toBeInTheDocument()
      await expect(quoteAtom(row).textContent).toBe(shown)
    }
  },
}
