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

/** ⌘↵ takes the whole diff from anywhere on the card — except inside its own note. */
export const CommandEnterAccepts: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    canvas.getByRole('button', { name: 'reject' }).focus()
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    await expect(args.onAccept).toHaveBeenCalledTimes(1)

    await userEvent.click(canvas.getByRole('button', { name: 'request changes' }))
    await userEvent.type(canvas.getByRole('textbox', { name: 'note to pond' }), 'x')
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
    await expect(args.onRequestChanges).toHaveBeenCalledWith('x')
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

/** Nothing the board does not draw: no `open page`, no `show original`, no `inferred` pill, no per-change reason line. */
export const DrawsOnlyWhatTheBoardDraws: Story = {
  args: { changes: [{ ...create, inferred: true, reason: 'follows the electrician' }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('follows the electrician')).not.toBeInTheDocument()
    await expect(canvas.queryByText('inferred')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'show original' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /open page/i })).not.toBeInTheDocument()
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
const REMOVAL_LINE = '[data-kind="diff-line"][data-variant="remove"]'
const ADDITION_LINE = '[data-kind="diff-line"][data-variant="add"]'

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
  for (const el of red) await expect(el.closest(REMOVAL_LINE)).not.toBeNull()

  // The `−` sign is the role at full strength — the board's `diffSign: #C55347`.
  const removal = root.querySelector<HTMLElement>(REMOVAL_LINE)!
  const sign = removal.querySelector<HTMLElement>('[data-part="sign"]')!
  await expect(sign.textContent).toBe('−')
  const [r, g, b, a] = pixelOf(getComputedStyle(sign).color)
  await expect([r, g, b]).toEqual([...REMOVAL_RGB])
  await expect(a).toBe(1)

  // The removed words stay INK and are STRUCK in the role — the board does not
  // paint them red (`diffText.textDecorationColor: #C55347`, text at an ink tier).
  // `PondMolecule variant=remove` writes `diffText` at `a(.68)`.
  const struck = removal.querySelector<HTMLElement>('[data-part="title"]')!
  const t = getComputedStyle(struck)
  await expect(t.textDecorationLine).toBe('line-through')
  await expect(isRemovalRed(t.textDecorationColor)).toBe(true)
  await expect(isRemovalRed(t.color)).toBe(false)
  const [tr, tg, tb, ta] = pixelOf(t.color)
  // The hue flips with the theme — this is what makes the ink frame mean something.
  for (const [i, channel] of [tr, tg, tb].entries()) {
    await expect(Math.abs(channel - ink[i])).toBeLessThanOrEqual(2)
  }
  await expect(ta).toBeCloseTo(0.68, 1)

  // The addition alongside it carries none of it.
  const addition = root.querySelector<HTMLElement>(ADDITION_LINE)
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
    await expect(canvasElement.querySelector(REMOVAL_LINE)).toBeNull()
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

// ── `PondComposer` `proposing`: the card's own values, in paper and ink ────────
//
// Every assertion is the COMPUTED value against the DC's literal (`diffCard`,
// `diffHead`, `diffActions`, `keyHint`), at the desktop breakpoint.

const DESKTOP = { viewport: { value: 'desktop', isRotated: false } }

async function assertDiffCardValues(root: HTMLElement, theme: 'paper' | 'ink') {
  const card = root.querySelector<HTMLElement>('[data-part="diff-card"]')!
  const style = getComputedStyle(card)
  await expect(style.padding).toBe('12px')
  await expect(style.rowGap).toBe('10px')
  await expect(style.borderTopLeftRadius).toBe('14px')
  await expect(style.backgroundColor).toBe(
    theme === 'ink' ? 'rgb(48, 49, 42)' : 'rgb(250, 249, 239)'
  )
  // Paper `0 1px 2px rgba(40,34,24,.04),0 8px 24px rgba(40,34,24,.06)`; ink the black pair.
  await expect(style.boxShadow).toBe(
    theme === 'ink'
      ? 'rgba(0, 0, 0, 0.3) 0px 1px 2px 0px, rgba(0, 0, 0, 0.34) 0px 8px 24px 0px'
      : 'rgba(40, 34, 24, 0.04) 0px 1px 2px 0px, rgba(40, 34, 24, 0.06) 0px 8px 24px 0px'
  )

  // head: `proposed edit — schedule` 11px in ink, `2 changes` at .68
  const head = card.querySelector<HTMLElement>('[data-part="head"]')!
  await expect(head.textContent).toBe('proposed edit — schedule')
  await expect(getComputedStyle(head).fontSize).toBe('11px')
  await expect(getComputedStyle(head.parentElement!).columnGap).toBe('8px')
  await expect(within(card).getByText('2 changes')).toBeInTheDocument()

  // lines: three PondMolecule diff-lines, 3px apart
  const lines = card.querySelectorAll<HTMLElement>('[data-kind="diff-line"]')
  await expect(lines).toHaveLength(3)
  await expect(getComputedStyle(lines[0].parentElement!).rowGap).toBe('3px')
  await expect(getComputedStyle(lines[0].parentElement!.parentElement!).rowGap).toBe('3px')
  await expect(getComputedStyle(lines[0]).fontSize).toBe('11.5px')
  await expect(getComputedStyle(lines[0]).paddingLeft).toBe('10px')

  // actions: accept, ⌘↵, request changes, reject, spacer, the target's name
  const accept = within(card).getByRole('button', { name: 'accept' })
  const request = within(card).getByRole('button', { name: 'request changes' })
  const reject = within(card).getByRole('button', { name: 'reject' })
  for (const button of [accept, request, reject]) {
    await expect(getComputedStyle(button).height).toBe('32px')
    await expect(getComputedStyle(button).fontSize).toBe('12px')
  }
  const row = accept.parentElement!
  await expect(getComputedStyle(row).columnGap).toBe('8px')
  const items = [...row.children].map((el) => el.textContent)
  await expect(items).toEqual(['accept', '⌘↵', 'request changes', 'reject', '', 'schedule'])
  const hint = within(row as HTMLElement).getByText('⌘↵')
  await expect(getComputedStyle(hint).fontSize).toBe('10.5px')
  await expect(getComputedStyle(hint).marginLeft).toBe('-2px')
  await expect(getComputedStyle(hint).marginRight).toBe('4px')
  await expect(getComputedStyle(hint).fontFamily).toMatch(/Mono|monospace/)
}

export const ProposingPaper: Story = {
  args: { changes: [edit, create] },
  globals: DESKTOP,
  play: async ({ canvasElement }) => assertDiffCardValues(canvasElement, 'paper'),
}

export const ProposingInk: Story = {
  args: { changes: [edit, create] },
  globals: DESKTOP,
  decorators: [Ink],
  play: async ({ canvasElement }) => assertDiffCardValues(canvasElement, 'ink'),
}

/** Below md the buttons are the 44px mobile control, 14px type. */
export const ProposingMobile: Story = {
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  play: async ({ canvas }) => {
    for (const name of ['accept', 'request changes', 'reject']) {
      const style = getComputedStyle(canvas.getByRole('button', { name }))
      await expect(style.height).toBe('44px')
      await expect(style.fontSize).toBe('14px')
    }
  },
}
