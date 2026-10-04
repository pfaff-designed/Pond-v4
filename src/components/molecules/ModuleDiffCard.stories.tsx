import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { ModuleDiffCard } from './ModuleDiffCard'
import type { ChangePreview } from '@/lib/modules/preview'

/** Board 6c frame 2: "move the electrician to the week of the 6th." */
const edit: ChangePreview = {
  op: 'edit',
  before: { id: 'b1', type: 'text', content: 'electrician — provisional, w/c 29 sep' },
  after: { id: '__preview__', type: 'text', content: 'electrician — confirmed, w/c 6 oct' },
}
const create: ChangePreview = {
  op: 'create',
  before: null,
  after: { id: '__preview__', type: 'text', content: 'worktop template — w/c 13 oct' },
}
const morph: ChangePreview = {
  op: 'edit',
  before: { id: 'a', type: 'text', content: 'The old paragraph that needs work.' },
  after: {
    id: '__preview__',
    type: 'todo',
    items: [
      { id: 'i1', label: 'Draft the outline', checked: false },
      { id: 'i2', label: 'Book the room', checked: false },
    ],
  },
}
const remove: ChangePreview = {
  op: 'remove',
  before: {
    id: 'm',
    type: 'table',
    title: 'Weekly mileage',
    columns: ['Week', 'Miles'],
    rows: [{ id: 'r1', cells: ['1', '38'] }],
  },
  after: null,
}

const meta = {
  title: 'Molecules/ModuleDiffCard',
  component: ModuleDiffCard,
  parameters: { layout: 'centered' },
  args: {
    changes: [edit, create],
    targetName: 'schedule',
    onAccept: fn(),
    onReject: fn(),
    onRequestChanges: fn(),
    onRevise: fn(),
    onAskAgain: fn(),
  },
} satisfies Meta<typeof ModuleDiffCard>

export default meta
type Story = StoryObj<typeof meta>

/** The board's card: one removal row (red), two addition rows (ink), three buttons. */
export const Proposed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/proposed edit — schedule/)).toBeInTheDocument()
    await expect(canvas.getByText('2 changes')).toBeInTheDocument()
    await expect(canvas.getByText('electrician — provisional, w/c 29 sep')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'accept' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'reject' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'request changes' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /accept all/ })).not.toBeInTheDocument()
  },
}

/** Type-morph edit: a text block becomes a todo — old text struck → new todo rows. */
export const TypeMorph: Story = {
  args: { changes: [morph] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('The old paragraph that needs work.')).toBeInTheDocument()
    await expect(canvas.getByText('Draft the outline')).toBeInTheDocument()
  },
}

/** Remove: the block being removed as a red removal row. */
export const Remove: Story = {
  args: { changes: [remove] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Weekly mileage')).toBeInTheDocument()
    await expect(canvas.getByText('1 change')).toBeInTheDocument()
  },
}

/** Accept fires once for the whole diff. */
export const AcceptFires: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'accept' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

/** Board 6c frame 3: request changes opens a note to pond under the card. */
export const RequestChanges: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'request changes' }))
    await expect(canvas.getByText('to pond')).toBeInTheDocument()
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'note to pond' }),
      "keep the electrician, but the worktop can't be the 13th"
    )
    await userEvent.click(canvas.getByRole('button', { name: 'send' }))
    await expect(args.onRequestChanges).toHaveBeenCalledTimes(1)
  },
}

/** Settled: changes requested, the note kept under the inert card. */
export const ChangesRequested: Story = {
  args: { status: 'changes_requested', note: 'keep the electrician, drop the worktop' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('changes requested')).toBeInTheDocument()
    await expect(canvas.getByText('keep the electrician, drop the worktop')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
  },
}

/** Pond's revision of an earlier card. */
export const Revised: Story = {
  args: { revised: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/revised edit — schedule/)).toBeInTheDocument()
  },
}

/** G2: the target was edited after the proposal — greyed, no accept, revise offered. */
export const Outdated: Story = {
  args: { status: 'outdated' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('outdated')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'revise' }))
    await expect(args.onRevise).toHaveBeenCalledTimes(1)
  },
}

/** Resolved (accepted): the card settles to inert with its status line. */
export const Accepted: Story = {
  args: { status: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('accepted')).toBeInTheDocument()
    const card = canvas.getByRole('group', { name: /proposed edit/ })
    await expect(card).toHaveClass('motion-resolve')
    await expect(card).toHaveClass('opacity-70')
  },
}

/** Board 6c frame 5: reject leaves one line, with ask again / show proposal. */
export const Rejected: Story = {
  args: { status: 'rejected' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('rejected — nothing changed')).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'show proposal' }))
    await expect(canvas.getByText('electrician — confirmed, w/c 6 oct')).toBeInTheDocument()
  },
}

/** The three statuses the log can hand a card without a click in this session. */
export const Withdrawn: Story = { args: { status: 'withdrawn' } }
export const Undone: Story = { args: { status: 'undone' } }
export const Reverted: Story = { args: { status: 'reverted' } }

/** "show original": the target as it stands, no diff marks, no red. */
export const ShowOriginal: Story = {
  args: { changes: [edit, remove, create] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'show original' }))
    await expect(canvas.getByText(/new block/)).toBeInTheDocument()
    await expect(canvas.queryByText('electrician — confirmed, w/c 6 oct')).not.toBeInTheDocument()
  },
}

// ── red is removals, and nothing else ─────────────────────────────────────────
//
// `#C55347` is the removal role and the board spends it on nothing else
// (`PROJECT_RULES` colour roles; `PondMolecule` `variant=remove`: `diffSign
// #C55347`, `diffText` struck with it). A class-name check cannot see this — #252
// shipped a wrong ink tier with the right class present — so these frames resolve
// every element's REAL painted colour and ask where the red is.

/** The removal role, as the board writes it: `#C55347`. */
const REMOVAL_RGB = [197, 83, 71] as const

/** The actual pixel a computed colour paints — rgb(), rgba(), color-mix, oklab, all of it. */
function pixelOf(color: string): [number, number, number, number] {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return [r, g, b, a / 255]
}

/** Is this painted colour the removal role at any strength? (Transparent is not.) */
function isRemovalRed(color: string): boolean {
  const [r, g, b, a] = pixelOf(color)
  if (a < 0.01) return false
  return REMOVAL_RGB.every((want, i) => Math.abs([r, g, b][i] - want) <= 8)
}

/** Every element painting the removal role, by pixel — colour, ground or strike. */
function redElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('*')].filter((el) => {
    const s = getComputedStyle(el)
    return (
      isRemovalRed(s.color) ||
      isRemovalRed(s.backgroundColor) ||
      isRemovalRed(s.textDecorationColor) ||
      isRemovalRed(s.borderTopColor)
    )
  })
}

const Ink = (Story: () => React.ReactElement) => (
  <div className="dark bg-raw-ink p-6">
    <Story />
  </div>
)

/** The theme's ink, raw: light `#1B1D14`, dark `#FAF9EF`. */
const PAPER_INK = [27, 29, 20] as const
const INK_INK = [250, 249, 239] as const

async function assertRemovalRole(root: HTMLElement, ink: readonly number[]) {
  const red = redElements(root)
  await expect(red.length).toBeGreaterThan(0)
  // Not one red pixel outside a removal row.
  for (const el of red) await expect(el.closest('[data-part="removal"]')).not.toBeNull()

  // The `−` sign is the role at full strength — the board's `diffSign: #C55347`.
  const removal = root.querySelector<HTMLElement>('[data-part="removal"]')!
  const sign = removal.querySelector<HTMLElement>('span[aria-hidden]')!
  await expect(sign.textContent).toBe('−')
  const [r, g, b, a] = pixelOf(getComputedStyle(sign).color)
  await expect([r, g, b]).toEqual([...REMOVAL_RGB])
  await expect(a).toBe(1)

  // The removed words stay INK and are STRUCK in the role — the board does not
  // paint them red (`diffText.textDecorationColor: #C55347`, text at an ink tier).
  // The tier is asserted as "a meta tier of THIS theme's ink", not as a literal:
  // `PondMolecule variant=remove` measures .68 and the code paints .8 — a real
  // divergence, reported with this slice rather than blessed here.
  const struck = removal.querySelector<HTMLElement>('div.line-through')!
  const t = getComputedStyle(struck)
  await expect(t.textDecorationLine).toBe('line-through')
  await expect(isRemovalRed(t.textDecorationColor)).toBe(true)
  await expect(isRemovalRed(t.color)).toBe(false)
  const [tr, tg, tb, ta] = pixelOf(t.color)
  // The hue flips with the theme — this is what makes the ink frame mean something.
  await expect([tr, tg, tb]).toEqual([...ink])
  await expect(ta).toBeGreaterThan(0.6)
  await expect(ta).toBeLessThan(0.86)

  // The addition alongside it carries none of it.
  const addition = root.querySelector<HTMLElement>('[data-part="addition"]')
  if (addition) await expect(redElements(addition)).toHaveLength(0)
}

/** An edit + a removal: the only red on the surface, in real pixels. Light. */
export const RedIsRemovalsOnly: Story = {
  args: { changes: [edit, remove, create] },
  play: async ({ canvasElement }) => assertRemovalRole(canvasElement, PAPER_INK),
}

/** The same on the dark ground — the removal role does not reassign by theme. */
export const RedIsRemovalsOnlyInk: Story = {
  args: { changes: [edit, remove, create] },
  decorators: [Ink],
  play: async ({ canvasElement }) => assertRemovalRole(canvasElement, INK_INK),
}

/** A create-only card has no removal row, so there is no red at all. */
export const CreateHasNoRed: Story = {
  args: { changes: [create] },
  play: async ({ canvasElement }) => {
    await expect(redElements(canvasElement)).toHaveLength(0)
    await expect(canvasElement.querySelector('[data-part="removal"]')).toBeNull()
  },
}

// ── the eight statuses (W6) ───────────────────────────────────────────────────

/**
 * All eight in one frame, parametrised rather than one story per cell: each
 * carries its own `data-status`, each settled label is DIFFERENT from the other
 * six, and only `pending` keeps live decision buttons. Two statuses sharing a
 * label would be silent — the thread would read as if nothing had happened.
 */
export const EveryStatus: Story = {
  render: (args) => (
    <div className="flex flex-col gap-6">
      {(
        [
          'pending',
          'accepted',
          'rejected',
          'changes_requested',
          'outdated',
          'withdrawn',
          'undone',
          'reverted',
        ] as const
      ).map((status) => (
        <div key={status} data-frame={status}>
          <ModuleDiffCard {...args} status={status} />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const frames = [...canvasElement.querySelectorAll<HTMLElement>('[data-frame]')]
    await expect(frames).toHaveLength(8)

    const labels: string[] = []
    for (const frame of frames) {
      const status = frame.dataset.frame!
      const card = frame.querySelector<HTMLElement>('[data-status]')!
      await expect(card.dataset.status).toBe(status)
      // One decision, one status line — never two (an unfolded rejected card
      // used to draw its status in the header AND again in the footer).
      const lines = frame.querySelectorAll('[data-part="status"]')
      if (status === 'pending') {
        await expect(lines).toHaveLength(0)
        await expect(within(frame).getByRole('button', { name: 'accept' })).toBeInTheDocument()
        await expect(within(frame).getByRole('button', { name: 'reject' })).toBeInTheDocument()
        await expect(
          within(frame).getByRole('button', { name: 'request changes' })
        ).toBeInTheDocument()
      } else {
        await expect(lines).toHaveLength(1)
        labels.push(lines[0].textContent!.trim())
        // A settled card offers no decision — the log only grows.
        await expect(
          within(frame).queryByRole('button', { name: 'accept' })
        ).not.toBeInTheDocument()
        await expect(
          within(frame).queryByRole('button', { name: 'reject' })
        ).not.toBeInTheDocument()
        await expect(
          within(frame).queryByRole('button', { name: 'request changes' })
        ).not.toBeInTheDocument()
        await expect(card).toHaveClass('opacity-70')
      }
    }
    await expect(labels).toHaveLength(7)
    await expect(new Set(labels).size).toBe(7)
    await expect(labels).toContain('changes requested')
  },
}

// ── the live card's own rules ─────────────────────────────────────────────────

/** One card, one decision: exactly ONE accept, no per-change verb, no accept all. */
export const OneDecisionForTheWholeDiff: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('button', { name: 'accept' })).toHaveLength(1)
    await expect(canvas.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /accept all/i })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'reject' }))
    await expect(args.onReject).toHaveBeenCalledTimes(1)
    await expect(args.onAccept).not.toHaveBeenCalled()
  },
}

/** The note to pond cannot be sent empty, and cancel sends nothing at all. */
export const NoteGuards: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('textbox', { name: 'note to pond' })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'request changes' }))
    // Nothing typed yet — nothing to send.
    await expect(canvas.getByRole('button', { name: 'send' })).toBeDisabled()
    await userEvent.type(canvas.getByRole('textbox', { name: 'note to pond' }), 'x')
    await expect(canvas.getByRole('button', { name: 'send' })).not.toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: 'cancel' }))
    await expect(canvas.queryByRole('textbox', { name: 'note to pond' })).not.toBeInTheDocument()
    await expect(args.onRequestChanges).not.toHaveBeenCalled()
  },
}

/** G2 — the page changed under the proposal: greyed, accept withdrawn, revise offered. */
export const OutdatedWithdrawsAccept: Story = {
  args: { status: 'outdated' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const card = canvas.getByRole('group', { name: /proposed edit/ })
    await expect(card).toHaveAttribute('data-status', 'outdated')
    await expect(card).toHaveClass('opacity-70')
    await expect(canvas.getByText('the page changed after this was proposed')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'request changes' })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'revise' }))
    await expect(args.onRevise).toHaveBeenCalledTimes(1)
  },
}

/** 6c frame 5: reject leaves ONE line. The diff is folded away until asked for,
 *  the status is said once either way, and ask again sends the question back. */
export const RejectedFoldsToOneLine: Story = {
  args: { status: 'rejected' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('rejected — nothing changed')).toBeInTheDocument()
    await expect(canvasElement.querySelectorAll('[data-part="status"]')).toHaveLength(1)
    await expect(canvas.queryByText('electrician — confirmed, w/c 6 oct')).not.toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'show proposal' }))
    await expect(canvas.getByText('electrician — confirmed, w/c 6 oct')).toBeInTheDocument()
    await expect(canvasElement.querySelectorAll('[data-part="status"]')).toHaveLength(1)

    await userEvent.click(canvas.getByRole('button', { name: 'ask again' }))
    await expect(args.onAskAgain).toHaveBeenCalledTimes(1)
  },
}

/** "show original": the target as it stands — every `before`, a note where there
 *  is none, no proposed text, and not one red pixel. Then back to the diff. */
export const ShowOriginalHasNoRed: Story = {
  args: { changes: [edit, remove, create] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'show original' }))
    const original = canvasElement.querySelector<HTMLElement>('[data-part="original"]')!
    await expect(
      within(original).getByText('electrician — provisional, w/c 29 sep')
    ).toBeInTheDocument()
    await expect(within(original).getByText('Weekly mileage')).toBeInTheDocument()
    await expect(within(original).getByText(/new block/)).toBeInTheDocument()
    await expect(redElements(canvasElement)).toHaveLength(0)
    await expect(canvas.queryByText('electrician — confirmed, w/c 6 oct')).not.toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'show diff' }))
    await expect(canvas.getByText('electrician — confirmed, w/c 6 oct')).toBeInTheDocument()
  },
}
