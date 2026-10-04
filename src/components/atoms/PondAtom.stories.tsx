import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'
import { PondAtom, POND_ATOM_KINDS, POND_ATOM_STATES, type PondAtomProps } from './PondAtom'

/**
 * PondAtom (#93) — the one polymorphic inline atom: 24 kinds × 9 states on the
 * Make Noise role tokens. Theme is ambient — the `ink` stories only add the
 * `.dark` class around the canvas (a Storybook-only decorator, never a prop).
 */

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

const meta = {
  title: 'Atoms/PondAtom',
  component: PondAtom,
  parameters: { layout: 'centered' },
  args: { kind: 'text' },
} satisfies Meta<typeof PondAtom>

export default meta
type Story = StoryObj<typeof meta>

/** The full 24-kind × 9-state matrix (unused states fall back to rest). */
function MatrixGrid({ size }: { size?: PondAtomProps['size'] }) {
  return (
    <div className="grid items-center gap-x-mn-4 gap-y-mn-1 overflow-x-auto p-mn-4 [grid-template-columns:auto_repeat(9,minmax(120px,auto))]">
      <span />
      {POND_ATOM_STATES.map((state) => (
        <span key={state} className="font-mono lowercase text-[10.5px] text-mn-text-secondary">
          {state}
        </span>
      ))}
      {POND_ATOM_KINDS.map((kind) => (
        <div key={kind} className="contents">
          <span className="font-mono lowercase text-[10.5px] text-mn-text-secondary">{kind}</span>
          {POND_ATOM_STATES.map((state) => (
            <PondAtom key={state} kind={kind} state={state} size={size} due on />
          ))}
        </div>
      ))}
    </div>
  )
}

export const Matrix: Story = {
  render: () => <MatrixGrid />,
  play: async ({ canvasElement }) => {
    // Every cell of the 216 matrix mounted.
    await expect(canvasElement.querySelectorAll('[data-kind]')).toHaveLength(
      POND_ATOM_KINDS.length * POND_ATOM_STATES.length
    )
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
    <div className="flex max-w-[420px] flex-col items-start gap-mn-2 p-mn-4">
      {POND_ATOM_KINDS.map((kind) => (
        <PondAtom key={kind} kind={kind} />
      ))}
    </div>
  ),
}

export const HeadingLevels: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-2 p-mn-4">
      {([1, 2, 3, 4, 5, 6] as const).map((level) => (
        <PondAtom key={level} kind="heading" level={level} value={`heading ${level}`} />
      ))}
    </div>
  ),
}

/**
 * Leading reaches the DOM at all — the half of #252 that is easy to ship blind.
 * Every one of these `leading-*` classes was written in the source and then dropped
 * by `cn()`, so the text rendered at Tailwind's preflight 1.5 and no test noticed.
 * Asserted in a real browser against the board's own numbers.
 */
export const BoardLeading: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-2 p-mn-4">
      <PondAtom kind="heading" level={2} value="section" />
      <PondAtom kind="prose" value="a paragraph of running prose, set in the serif." />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [heading, prose] = canvasElement.querySelectorAll<HTMLElement>('[data-part="text"]')

    // heading level 2 — board lineHeight 1.1 at 22px
    const h = getComputedStyle(heading)
    await expect(h.fontSize).toBe('22px')
    await expect(parseFloat(h.lineHeight) / 22).toBeCloseTo(1.1, 2)

    // prose — board lineHeight 1.6 at 17.5px. NOT the house --leading-relaxed (1.7):
    // the board's value wins, and this call site had been carrying the wrong token
    // invisibly because the class never applied.
    const p = getComputedStyle(prose)
    await expect(p.fontSize).toBe('17.5px')
    await expect(parseFloat(p.lineHeight) / 17.5).toBeCloseTo(1.6, 2)
  },
}

/** Area colour tints marks ONLY — glyph + dot; ink text never changes. */
export const AreaMarks: Story = {
  render: () => (
    <div className="flex items-center gap-mn-3 p-mn-4">
      {(['ink', 'sage', 'mist', 'navy'] as const).map((color) => (
        <div key={color} className="flex items-center gap-mn-1">
          <PondAtom kind="icon" color={color} />
          <PondAtom kind="dot" color={color} />
          <PondAtom kind="text" color={color} value={color} />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Marks carry the area role; no text span ever does.
    await expect(canvasElement.querySelectorAll('[data-part="glyph"].text-mn-area-c')).toHaveLength(
      1
    )
    for (const text of canvasElement.querySelectorAll('[data-part="text"]')) {
      await expect(text.className).not.toContain('mn-area')
    }
  },
}

// ── Interaction-state play stories (the +6) ────────────────────────────────

export const HoverDelta: Story = {
  args: { kind: 'text', state: 'hover' },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('[data-kind="text"]')!
    await expect(root.className).toContain('bg-mn-text/5')
  },
}

export const FocusRing: Story = {
  args: { kind: 'text', state: 'focus' },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('[data-kind="text"]')!
    // The mist ring — mn-area-b stays mist on every theme.
    await expect(root.className).toContain('outline-mn-area-b')
  },
}

export const SelectedFill: Story = {
  args: { kind: 'text', state: 'selected' },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('[data-kind="text"]')!
    await expect(root.className).toContain('bg-mn-hover-fill')
  },
}

export const EditingCaret: Story = {
  args: { kind: 'text', state: 'editing' },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('[data-kind="text"]')!
    await expect(root.className).toContain('ring-mn-text')
    await expect(canvasElement.querySelector('[data-part="caret"]')).toBeInTheDocument()
  },
}

export const CheckboxOn: Story = {
  args: { kind: 'checkbox', on: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-part="check"]')).toBeInTheDocument()
    // A mark-only kind renders no text.
    await expect(canvasElement.querySelector('[data-part="text"]')).not.toBeInTheDocument()
  },
}

export const RelationError: Story = {
  args: { kind: 'relation', state: 'error' },
  play: async ({ canvasElement }) => {
    const text = canvasElement.querySelector('[data-part="text"]')!
    await expect(text.className).toContain('line-through')
    await expect(canvasElement.querySelector('[data-part="note"]')?.textContent).toBe(
      'deleted · kept 710'
    )
  },
}

export const DateDue: Story = {
  args: { kind: 'date', due: true },
  play: async ({ canvasElement }) => {
    // Exactly ONE burnt-orange dot — the one dated thing.
    await expect(canvasElement.querySelectorAll('.bg-mn-signal-dated')).toHaveLength(1)
  },
}

export const DisabledOpacity: Story = {
  args: { kind: 'text', state: 'disabled' },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('[data-kind="text"]')!
    await expect(root.className).toContain('opacity-40')
  },
}
