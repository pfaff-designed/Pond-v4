import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { useState } from 'react'

import { pageEyebrowClass } from '@/components/atoms/kicker'
import { AnswerActions } from './AnswerActions'
import { AnswerError, EarlierTurns, ThreadHead, Turn, YouRow } from './ComposerThread'
import { Markdown } from './Markdown'
import { ModuleDiffCard } from './ModuleDiffCard'
import { ReadChips } from './ReadChips'
import { TerminalDrawer } from './TerminalDrawer'
import { foldedTurnCount } from '@/lib/conversation/turns'
import type { ChangePreview } from '@/lib/modules/preview'

/**
 * The composer thread in `PondComposer.dc.html`'s `answered`, `proposing`, `thread`
 * and `error` states,
 * in paper and ink. Every assertion is a COMPUTED value against the DC's literal,
 * at the desktop breakpoint (mobile values where the DC gives them).
 */

type Theme = 'paper' | 'ink'

const INK: Record<Theme, readonly [number, number, number]> = {
  paper: [27, 29, 20],
  ink: [250, 249, 239],
}

const DESKTOP = { viewport: { value: 'desktop', isRotated: false } }
const MOBILE = { viewport: { value: 'mobile2', isRotated: false } }

/** What a computed colour paints over a ground: rgb(), color-mix, oklab, all of it. */
function paintedOver(color: string, ground: readonly number[]): number[] {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = `rgb(${ground.join(',')})`
  ctx.fillRect(0, 0, 1, 1)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
}

/**
 * Is this the theme's ink at this strength (`a(x)` in the DC)? Compared as what it
 * paints over the opposite ground, within 2 levels — an 8-bit canvas cannot hold a
 * 9% ink exactly, and a straight read of its alpha would be rounding noise.
 */
async function expectInk(color: string, theme: Theme, alpha: number) {
  const ink = INK[theme]
  const ground = INK[theme === 'paper' ? 'ink' : 'paper']
  const want = ink.map((c, i) => c * alpha + ground[i] * (1 - alpha))
  const got = paintedOver(color, ground)
  for (const [i, channel] of got.entries()) {
    await expect(
      Math.abs(channel - want[i]),
      `${color} paints ${got} over ${ground}; wanted ink at ${alpha}`
    ).toBeLessThanOrEqual(2)
  }
}

const QUESTION = 'and if the quote comes in at 4k?'
const ANSWER =
  'At £4,000 the cabinets take the whole of the Q4 discretionary budget. Nothing else has to be cut, but nothing else can be added either.'

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

/** How the latest turn ends — the `PondComposer` states that carry a turn. */
type LatestTurn = 'thread' | 'answered' | 'proposing' | 'error'

interface ThreadProps {
  theme: Theme
  /** Turns in the thread, the latest last. */
  turns: number
  latest?: LatestTurn
}

const Answer = ({ text, actions }: { text: string; actions: boolean }) => (
  <div data-part="answer" className="flex flex-col gap-[7px]">
    <span className={pageEyebrowClass}>pond</span>
    <Markdown>{text}</Markdown>
    <ReadChips read={['budget']} />
    {actions && (
      <AnswerActions
        streaming={false}
        onMakePage={fn()}
        onAskAgain={fn()}
        onStop={fn()}
        onClose={fn()}
      />
    )}
  </div>
)

const LatestTurnBody = ({ latest }: { latest: LatestTurn }) => {
  if (latest === 'error') return <AnswerError onAskAgain={fn()} />
  if (latest === 'proposing')
    return (
      <ModuleDiffCard
        changes={[edit, create]}
        targetName="schedule"
        onAccept={fn()}
        onReject={fn()}
        onRequestChanges={fn()}
      />
    )
  return <Answer text={ANSWER} actions={latest === 'answered'} />
}

const ThreadFrame = ({ theme, turns, latest = 'thread' }: ThreadProps) => {
  const [open, setOpen] = useState(false)
  const folded = open ? 0 : foldedTurnCount(turns)
  const shown = Array.from({ length: turns - folded }, (_, i) => folded + i + 1)
  return (
    <div
      data-theme-probe={theme}
      className={`relative h-[40rem] w-[1180px] bg-mn-surface ${theme === 'ink' ? 'dark' : ''}`}
    >
      <TerminalDrawer collapsed={false} onExpand={fn()} footer={<div>line</div>}>
        {turns > 1 && <ThreadHead area="life" turns={turns} onNewThread={fn()} onClose={fn()} />}
        <div className="flex flex-col gap-[14px]">
          {folded > 0 && <EarlierTurns count={folded} onExpand={() => setOpen(true)} />}
          {shown.map((n) => (
            <Turn key={n}>
              <YouRow text={n === turns ? QUESTION : `question ${n}`} time="07:20" />
              {n === turns ? (
                <LatestTurnBody latest={latest} />
              ) : (
                <Answer text={`answer ${n}`} actions={false} />
              )}
            </Turn>
          ))}
        </div>
      </TerminalDrawer>
    </div>
  )
}

const meta = {
  title: 'Organisms/2f · the composer',
  component: ThreadFrame,
  parameters: { layout: 'fullscreen' },
  globals: DESKTOP,
  args: { theme: 'paper', turns: 3 },
} satisfies Meta<typeof ThreadFrame>

export default meta
type Story = StoryObj<typeof meta>

const px = (value: string) => parseFloat(value)

async function assertThreadValues(root: HTMLElement, theme: Theme) {
  const rule = (el: HTMLElement) => getComputedStyle(el).borderBottomColor

  // threadHead: padding 0 6px 10px, gap 8, bottom rule 1px at ink .09, 11px at .8
  const head = root.querySelector<HTMLElement>('[data-part="thread-head"]')!
  const headStyle = getComputedStyle(head)
  await expect(headStyle.paddingTop).toBe('0px')
  await expect(headStyle.paddingLeft).toBe('6px')
  await expect(headStyle.paddingRight).toBe('6px')
  await expect(headStyle.paddingBottom).toBe('10px')
  await expect(headStyle.columnGap).toBe('8px')
  await expect(headStyle.fontSize).toBe('11px')
  await expect(headStyle.borderBottomWidth).toBe('1px')
  await expectInk(rule(head), theme, 0.09)
  await expectInk(headStyle.color, theme, 0.8)
  await expect(head.textContent).toContain('thread · life')
  await expect(head.textContent).toContain('3 turns')
  // `thread · life` in full ink, `3 turns` at .68
  await expectInk(
    getComputedStyle(head.querySelector('[data-part="thread-area"]')!).color,
    theme,
    1
  )
  await expectInk(getComputedStyle(within(head).getByText('3 turns')).color, theme, 0.68)
  const close = within(head).getByRole('button', { name: 'Close composer' })
  await expect(px(getComputedStyle(close).width)).toBe(18)
  await expect(px(getComputedStyle(close).height)).toBe(18)
  const cross = close.querySelector('svg')!
  await expect(cross.getAttribute('stroke-width')).toBe('1.4')
  await expect(cross.querySelector('path')!.getAttribute('d')).toBe('M3 3l6 6M9 3l-6 6')

  // turn: padding 6px 6px 14px, gap 12, bottom rule at ink .09
  const turn = root.querySelector<HTMLElement>('[data-part="turn"]')!
  const turnStyle = getComputedStyle(turn)
  await expect(turnStyle.paddingTop).toBe('6px')
  await expect(turnStyle.paddingLeft).toBe('6px')
  await expect(turnStyle.paddingBottom).toBe('14px')
  await expect(turnStyle.rowGap).toBe('12px')
  await expect(turnStyle.borderBottomWidth).toBe('1px')
  await expectInk(rule(turn), theme, 0.09)

  // the question is built like the answer: a column at gap 7, the `you` eyebrow
  // (the `pond` one), then the line in mono 13px / .02em at full ink
  const you = [...root.querySelectorAll<HTMLElement>('[data-part="you-row"]')].at(-1)!
  await expect(getComputedStyle(you).flexDirection).toBe('column')
  await expect(getComputedStyle(you).rowGap).toBe('7px')
  await assertEyebrow(within(you).getByText('you'), theme)
  const line = getComputedStyle(within(you).getByText(QUESTION))
  await expect(line.fontSize).toBe('13px')
  await expect(px(line.letterSpacing)).toBeCloseTo(0.26, 2)
  await expect(line.fontFamily).toMatch(/Mono|monospace/)
  await expectInk(line.color, theme, 1)
  const time = getComputedStyle(within(you).getByText('07:20'))
  await expect(time.fontSize).toBe('10.5px')
  await expectInk(time.color, theme, 0.8)
}

// eyebrow: sans 500, 10.5px, .1em, uppercase, ink .68
async function assertEyebrow(eyebrow: HTMLElement, theme: Theme) {
  const e = getComputedStyle(eyebrow)
  await expect(e.fontFamily).toMatch(/Neue Montreal/)
  await expect(e.fontFamily).not.toMatch(/Mono|monospace/)
  await expect(e.fontWeight).toBe('500')
  await expect(e.fontSize).toBe('10.5px')
  await expect(px(e.letterSpacing)).toBeCloseTo(1.05, 2)
  await expect(e.textTransform).toBe('uppercase')
  await expectInk(e.color, theme, 0.68)
}

async function assertAnswerType(root: HTMLElement, theme: Theme, fontSize: string) {
  const answer = [...root.querySelectorAll<HTMLElement>('[data-part="answer"]')].at(-1)!
  // answerCol: gap 7
  await expect(getComputedStyle(answer).rowGap).toBe('7px')

  await assertEyebrow(within(answer).getByText('pond'), theme)

  // answer: sans 400, 15px (16 mobile), lh 1.6, full ink, text-wrap pretty — not mono, not serif
  const text = within(answer).getByText(/At £4,000/)
  const a = getComputedStyle(text)
  await expect(a.fontFamily).toMatch(/Neue Montreal/)
  await expect(a.fontFamily).not.toMatch(/Mono|monospace|Editorial/)
  await expect(a.fontWeight).toBe('400')
  await expect(a.fontSize).toBe(fontSize)
  await expect(px(a.lineHeight)).toBeCloseTo(px(fontSize) * 1.6, 1)
  await expect(a.textWrapStyle).toBe('pretty')
  await expectInk(a.color, theme, 1)
}

/** `thread`: the head, the turn, the answer — paper. */
export const ThreadPaper: Story = {
  name: 'thread',
  play: async ({ canvasElement }) => {
    await assertThreadValues(canvasElement, 'paper')
    await assertAnswerType(canvasElement, 'paper', '15px')
  },
}

export const ThreadInk: Story = {
  name: 'thread · ink',
  args: { theme: 'ink' },
  play: async ({ canvasElement }) => {
    await assertThreadValues(canvasElement, 'ink')
    await assertAnswerType(canvasElement, 'ink', '15px')
  },
}

/** Below md the answer is 16px and the ✕ is a 32px target. */
export const ThreadMobile: Story = {
  name: 'thread · mobile',
  globals: MOBILE,
  play: async ({ canvasElement }) => {
    await assertAnswerType(canvasElement, 'paper', '16px')
    const close = within(canvasElement).getByRole('button', { name: 'Close composer' })
    await expect(px(getComputedStyle(close).width)).toBe(32)
    await expect(px(getComputedStyle(close).height)).toBe(32)
  },
}

/** `thread`: three turns show only the latest, and the rest sit under `2 earlier turns`. */
export const FoldPaper: Story = {
  tags: ['!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvasElement.querySelectorAll('[data-part="turn"]')).toHaveLength(1)

    const fold = canvas.getByRole('button', { name: '2 earlier turns' })
    const f = getComputedStyle(fold)
    await expect(f.fontSize).toBe('11px')
    await expect(f.columnGap).toBe('6px')
    await expect(f.paddingLeft).toBe('6px')
    await expect(f.paddingRight).toBe('6px')
    await expect(f.paddingTop).toBe('0px')
    await expectInk(f.color, 'paper', 0.68)
    const caret = fold.querySelector('svg')!
    await expect(caret.getAttribute('width')).toBe('9')
    await expect(caret.getAttribute('height')).toBe('9')
    await expect(caret.getAttribute('viewBox')).toBe('0 0 14 14')
    await expect(caret.getAttribute('stroke-width')).toBe('1.4')
    await expect(caret.querySelector('path')!.getAttribute('d')).toBe('M3.5 2 7 5 3.5 8')
    await expect(getComputedStyle(caret).rotate).toBe('-90deg')

    await userEvent.click(fold)
    await expect(canvasElement.querySelectorAll('[data-part="turn"]')).toHaveLength(3)
    await expect(canvas.queryByText(/earlier turn/)).toBeNull()
  },
}

export const FoldInk: Story = {
  tags: ['!dev'],
  args: { theme: 'ink' },
  play: async ({ canvasElement }) => {
    const fold = within(canvasElement).getByRole('button', { name: '2 earlier turns' })
    await expectInk(getComputedStyle(fold).color, 'ink', 0.68)
  },
}

/** Two turns fold one; a single turn has nothing to fold. */
export const TwoTurnsFoldOne: Story = {
  tags: ['!dev'],
  args: { turns: 2 },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: '1 earlier turn' })
    ).toBeInTheDocument()
    await expect(canvasElement.querySelectorAll('[data-part="turn"]')).toHaveLength(1)
  },
}

export const OneTurnDoesNotFold: Story = {
  tags: ['!dev'],
  args: { turns: 1 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText(/earlier turn/)).toBeNull()
    await expect(canvasElement.querySelectorAll('[data-part="turn"]')).toHaveLength(1)
  },
}

/** `answered`: one turn, no thread head, and the answer's `make this a page` / `ask again`. */
async function assertAnswered(root: HTMLElement) {
  await expect(root.querySelector('[data-part="thread-head"]')).toBeNull()
  const actions = within(root.querySelector<HTMLElement>('[data-part="answer-actions"]')!)
  await expect(actions.getByRole('button', { name: 'make this a page' })).toBeInTheDocument()
  await expect(actions.getByRole('button', { name: 'ask again' })).toBeInTheDocument()
}

export const Answered: Story = {
  name: 'answered',
  args: { turns: 1, latest: 'answered' },
  play: ({ canvasElement }) => assertAnswered(canvasElement),
}

export const AnsweredInk: Story = {
  name: 'answered · ink',
  args: { turns: 1, latest: 'answered', theme: 'ink' },
  play: ({ canvasElement }) => assertAnswered(canvasElement),
}

export const AnsweredMobile: Story = {
  name: 'answered · mobile',
  args: { turns: 1, latest: 'answered' },
  globals: MOBILE,
  play: ({ canvasElement }) => assertAnswered(canvasElement),
}

/** `proposing`: the diff card rides inside the turn, in the composer. */
export const ProposingPaper: Story = {
  name: 'proposing',
  args: { turns: 1, latest: 'proposing' },
  play: async ({ canvasElement }) => {
    const turn = canvasElement.querySelector<HTMLElement>('[data-part="turn"]')!
    await expect(within(turn).getByRole('group', { name: 'proposed edit' })).toBeInTheDocument()
    await expect(within(turn).getByRole('button', { name: 'accept' })).toBeInTheDocument()
  },
}

export const ProposingInk: Story = {
  name: 'proposing · ink',
  args: { turns: 1, latest: 'proposing', theme: 'ink' },
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-part="diff-card"]')!
    await expect(getComputedStyle(card).backgroundColor).toBe('rgb(48, 49, 42)')
  },
}

export const ProposingMobile: Story = {
  name: 'proposing · mobile',
  args: { turns: 1, latest: 'proposing' },
  globals: MOBILE,
}

/** `error` (`errRow`): no answer, the one line at 12px / ink .8 / gap 10, and `ask again`. */
async function assertErrored(root: HTMLElement, theme: Theme) {
  await expect(root.querySelector('[data-part="answer"]')).toBeNull()
  const row = within(root).getByRole('alert')
  const css = getComputedStyle(row)
  await expect(row).toHaveTextContent('pond couldn’t finish this answer. nothing was kept.')
  await expect(css.fontSize).toBe('12px')
  await expect(css.columnGap).toBe('10px')
  await expectInk(css.color, theme, 0.8)
  await expect(within(row).getByRole('button', { name: 'ask again' })).toBeInTheDocument()
}

export const Errored: Story = {
  name: 'error',
  args: { turns: 1, latest: 'error' },
  play: ({ canvasElement }) => assertErrored(canvasElement, 'paper'),
}

export const ErroredInk: Story = {
  name: 'error · ink',
  args: { turns: 1, latest: 'error', theme: 'ink' },
  play: ({ canvasElement }) => assertErrored(canvasElement, 'ink'),
}
