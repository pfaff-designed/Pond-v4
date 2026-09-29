import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'
import {
  PondMolecule,
  POND_MOLECULE_KINDS,
  POND_MOLECULE_STATES,
  type PondMoleculeProps,
} from './PondMolecule'

/**
 * PondMolecule (#95) — the one polymorphic presentational molecule: 11 kinds ×
 * 10 states on the Make Noise role tokens. Theme is ambient — the `ink` story
 * only adds the `.dark` class around the canvas (a Storybook-only decorator,
 * never a prop).
 */

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

const meta = {
  title: 'Molecules/PondMolecule',
  component: PondMolecule,
  parameters: { layout: 'centered' },
  args: { kind: 'list-row' },
} satisfies Meta<typeof PondMolecule>

export default meta
type Story = StoryObj<typeof meta>

/** The full 11-kind × 10-state matrix (unused states fall back to rest). */
function MatrixGrid({ size }: { size?: PondMoleculeProps['size'] }) {
  return (
    <div className="grid items-center gap-x-mn-4 gap-y-mn-2 overflow-x-auto p-mn-4 [grid-template-columns:auto_repeat(10,minmax(180px,auto))]">
      <span />
      {POND_MOLECULE_STATES.map((state) => (
        <span
          key={state}
          className="font-mono lowercase tracking-wider text-[10.5px] text-mn-text-secondary"
        >
          {state}
        </span>
      ))}
      {POND_MOLECULE_KINDS.map((kind) => (
        <div key={kind} className="contents">
          <span className="font-mono lowercase tracking-wider text-[10.5px] text-mn-text-secondary">
            {kind}
          </span>
          {POND_MOLECULE_STATES.map((state) => (
            <PondMolecule key={state} kind={kind} state={state} size={size} />
          ))}
        </div>
      ))}
    </div>
  )
}

export const Matrix: Story = {
  render: () => <MatrixGrid />,
  play: async ({ canvasElement }) => {
    // Every cell of the 110 matrix mounted (the composed atoms carry their own
    // data-kind, so count molecule roots by the molecule kind names).
    const roots = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-kind]')).filter(
      (el) => (POND_MOLECULE_KINDS as readonly string[]).includes(el.dataset.kind ?? '')
    )
    await expect(roots).toHaveLength(POND_MOLECULE_KINDS.length * POND_MOLECULE_STATES.length)
  },
}

export const MatrixInk: Story = {
  render: () => <MatrixGrid />,
  decorators: [inkTheme],
}

export const MatrixMobile: Story = {
  render: () => <MatrixGrid size="mobile" />,
}

/** Rest-state gallery: every kind at its fixture value, desktop. */
export const Kinds: Story = {
  render: () => (
    <div className="flex max-w-[480px] flex-col items-start gap-mn-3 p-mn-4">
      {POND_MOLECULE_KINDS.map((kind) => (
        <PondMolecule key={kind} kind={kind} />
      ))}
      <PondMolecule kind="record-card" stat="7" sub="4 pages inside · updated today" color="sage" />
      <PondMolecule kind="diff-line" variant="remove" />
    </div>
  ),
}

// ── Interaction-state play stories ─────────────────────────────────────────

export const HoverFill: Story = {
  args: { kind: 'list-row', state: 'hover' },
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector('[data-kind="list-row"]')!
    await expect(row.className).toContain('bg-mn-text/5')
    // The drag handle reveals on hover.
    await expect(canvasElement.querySelector('[data-part="handle"]')?.className).toContain(
      'opacity-100'
    )
  },
}

export const SelectedFill: Story = {
  args: { kind: 'list-row', state: 'selected' },
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector('[data-kind="list-row"]')!
    await expect(row.className).toContain('bg-mn-hover-fill')
  },
}

export const FocusRing: Story = {
  args: { kind: 'list-row', state: 'focus' },
  play: async ({ canvasElement }) => {
    // The mist ring — mn-area-b stays mist on every theme.
    const row = canvasElement.querySelector('[data-kind="list-row"]')!
    await expect(row.className).toContain('outline-mn-area-b')
  },
}

export const EditingInset: Story = {
  args: { kind: 'entry', state: 'editing' },
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector('[data-kind="entry"]')!
    await expect(row.className).toContain('ring-mn-text')
  },
}

export const DraggingLift: Story = {
  args: { kind: 'list-row', state: 'dragging' },
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector('[data-kind="list-row"]')!
    // The lift: deep shadow + the -0.6° tilt, which collapses under
    // prefers-reduced-motion.
    await expect(row.className).toContain('shadow-mn-lg')
    await expect(row.className).toContain('motion-reduce:transform-none')
  },
}

export const DiffRemoval: Story = {
  args: { kind: 'diff-line', variant: 'remove' },
  play: async ({ canvasElement }) => {
    // Red is the removal signal ONLY: the − sign and the strike ride it.
    const sign = canvasElement.querySelector('[data-part="sign"]')!
    await expect(sign.textContent).toBe('−')
    await expect(sign.className).toContain('text-mn-signal-removal')
  },
}

export const ReminderDue: Story = {
  args: { kind: 'reminder' },
  play: async ({ canvasElement }) => {
    // Exactly ONE burnt-orange dot — the one dated thing.
    await expect(canvasElement.querySelectorAll('.bg-mn-signal-dated')).toHaveLength(1)
  },
}

export const AreaMarksOnly: Story = {
  args: { kind: 'list-row', color: 'sage' },
  play: async ({ canvasElement }) => {
    // Area colour tints the dot mark only — never text.
    await expect(canvasElement.querySelector('[data-part="dot"]')?.className).toContain(
      'bg-mn-area-a'
    )
    await expect(canvasElement.querySelector('[data-part="title"]')?.className).not.toContain(
      'mn-area'
    )
  },
}

export const RecordCardStat: Story = {
  args: {
    kind: 'record-card',
    title: 'Workout Log',
    stat: '2',
    sub: '2 pages inside · updated 3d ago',
    color: 'sage',
  },
  play: async ({ canvasElement }) => {
    // The OverviewCard absorption: focal numeral, no media tile.
    await expect(canvasElement.querySelector('[data-part="stat"]')?.textContent).toBe('2')
    await expect(canvasElement.querySelector('[data-kind="image"]')).not.toBeInTheDocument()
  },
}
