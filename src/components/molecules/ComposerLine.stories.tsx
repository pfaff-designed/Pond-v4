import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { useRef, useState } from 'react'

import { ComposerLine } from './ComposerLine'
import { TerminalDrawer } from './TerminalDrawer'

/**
 * The PondComposer card at rest, typing and streaming, in paper and ink —
 * `PondComposer.dc.html` renderVals. Every assertion is a COMPUTED
 * value against the DC's literal, not the class that is supposed to produce it.
 */

type Theme = 'paper' | 'ink'

interface ComposerProps {
  theme: Theme
  initialValue?: string
  streaming?: boolean
  hasTurn?: boolean
  initialResearch?: boolean
}

const Composer = ({
  theme,
  initialValue = '',
  streaming = false,
  hasTurn = false,
  initialResearch = false,
}: ComposerProps) => {
  const [value, setValue] = useState(initialValue)
  const [research, setResearch] = useState(initialResearch)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  return (
    <div
      data-theme-probe={theme}
      className={`relative h-[22rem] bg-mn-surface ${theme === 'ink' ? 'dark' : ''}`}
    >
      <TerminalDrawer
        collapsed={false}
        onExpand={fn()}
        footer={
          <div className="flex flex-col gap-[14px]">
            <ComposerLine
              value={value}
              placeholder={hasTurn ? 'reply, or ask something else' : 'ask pond, or / for blocks'}
              disabled={false}
              streaming={streaming}
              canSend={value.trim().length > 0}
              attachDisabled={streaming}
              textareaRef={textareaRef}
              anchorRef={anchorRef}
              research={research}
              mentionTitles={[]}
              onToggleResearch={() => setResearch((on) => !on)}
              onChange={setValue}
              onKeyDown={fn()}
              onAttach={fn()}
              onSend={fn()}
              onStop={fn()}
            />
          </div>
        }
      >
        {null}
      </TerminalDrawer>
    </div>
  )
}

const meta = {
  title: 'Organisms/2f · the composer',
  component: ComposerLine,
  parameters: { layout: 'fullscreen' },
  // Desktop: the card is 560 wide from md up; below it is the 360 mobile card.
  globals: { viewport: { value: 'desktop', isRotated: false } },
  // The stories render whole cards through `Composer`; these satisfy the type only.
  args: {
    value: '',
    placeholder: 'ask pond, or / for blocks',
    disabled: false,
    streaming: false,
    canSend: false,
    attachDisabled: false,
    textareaRef: { current: null },
    anchorRef: { current: null },
    research: false,
    mentionTitles: [],
    onToggleResearch: fn(),
    onChange: fn(),
    onKeyDown: fn(),
    onAttach: fn(),
    onSend: fn(),
    onStop: fn(),
  },
} satisfies Meta<typeof ComposerLine>

export default meta
type Story = StoryObj<typeof meta>

const INK = {
  paper: {
    full: 'rgb(27, 29, 20)',
    meta: 'rgba(27, 29, 20, 0.8)',
    quiet: 'rgba(27, 29, 20, 0.68)',
  },
  ink: {
    full: 'rgb(250, 249, 239)',
    meta: 'rgba(250, 249, 239, 0.8)',
    quiet: 'rgba(250, 249, 239, 0.68)',
  },
} as const

const GLASS = {
  paper: {
    bg: 'linear-gradient(160deg, rgba(255, 255, 255, 0.86), rgba(255, 255, 255, 0.64))',
    border: 'rgba(255, 255, 255, 0.9)',
    shadow:
      'rgba(255, 255, 255, 0.7) 0px 1px 0px 0px inset, rgba(40, 34, 24, 0.14) 0px 20px 54px 0px',
  },
  ink: {
    bg: 'linear-gradient(160deg, rgba(48, 49, 42, 0.92), rgba(48, 49, 42, 0.78))',
    border: 'rgba(250, 249, 239, 0.09)',
    shadow:
      'rgba(250, 249, 239, 0.06) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.42) 0px 20px 54px 0px',
  },
} as const

const parts = (root: HTMLElement, theme: Theme) => {
  const scope = within(root.querySelector<HTMLElement>(`[data-theme-probe="${theme}"]`)!)
  return {
    card: scope.getByRole('region', { name: 'composer' }),
    line: scope.getByRole<HTMLTextAreaElement>('textbox', { name: 'Message Pond' }),
    plus: scope.getByRole('button', { name: 'Attach a file' }),
    research: scope.getByRole('button', { name: 'research' }),
    send:
      scope.queryByRole('button', { name: 'Send' }) ?? scope.getByRole('button', { name: 'Stop' }),
    scope,
  }
}

/** The card: 560, padding 14, gap 14, radius 20, mono, on the glass of its theme. */
const expectCard = async (card: HTMLElement, theme: Theme) => {
  const css = getComputedStyle(card)
  await expect(Math.round(card.getBoundingClientRect().width)).toBe(560)
  await expect(css.padding).toBe('14px')
  await expect(css.rowGap).toBe('14px')
  await expect(css.borderTopLeftRadius).toBe('20px')
  await expect(css.display).toBe('flex')
  await expect(css.flexDirection).toBe('column')
  await expect(css.fontFamily).toContain('PP Neue Montreal Mono')
  await expect(css.backgroundImage).toBe(GLASS[theme].bg)
  await expect(css.borderTopWidth).toBe('1px')
  await expect(css.borderTopStyle).toBe('solid')
  await expect(css.borderTopColor).toBe(GLASS[theme].border)
  await expect(css.boxShadow).toBe(GLASS[theme].shadow)
  await expect(css.backdropFilter).toBe('blur(24px) saturate(1.3)')
}

const THEMES: Theme[] = ['paper', 'ink']

const BothThemes = (props: Omit<ComposerProps, 'theme'>) => (
  <div className="flex flex-col">
    {THEMES.map((theme) => (
      <Composer key={theme} theme={theme} {...props} />
    ))}
  </div>
)

/**
 * Rest: one 14px line at ink 68 (`ask pond, or / for blocks`), the 28px ＋, the
 * research pill (off), a spacer, and a disabled 32px send in its off fill.
 * Nothing else — no mic, no header strip.
 */
export const Rest: Story = {
  name: 'rest',
  render: () => <BothThemes />,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      const { card, line, plus, send, scope } = parts(canvasElement, theme)
      await expectCard(card, theme)

      const lineCss = getComputedStyle(line)
      await expect(line.placeholder).toBe('ask pond, or / for blocks')
      await expect(lineCss.borderTopWidth).toBe('0px')
      await expect(lineCss.padding).toBe('2px 6px')
      await expect(lineCss.fontSize).toBe('14px')
      await expect(lineCss.lineHeight).toBe('21px')
      await expect(lineCss.letterSpacing).toBe('0.28px')
      await expect(lineCss.textTransform).toBe('none')
      await expect(lineCss.color).toBe(INK[theme].quiet)
      await expect(Math.round(line.getBoundingClientRect().height)).toBe(25)

      const plusCss = getComputedStyle(plus)
      const cross = plus.querySelector('svg')!
      await expect(plus.textContent).toBe('')
      await expect(cross.getAttribute('width')).toBe('12')
      await expect(cross.getAttribute('stroke-width')).toBe('1.4')
      await expect(cross.getAttribute('stroke-linecap')).toBe('round')
      await expect(cross.querySelector('path')!.getAttribute('d')).toBe('M7 3v8M3 7h8')
      await expect(Math.round(plus.getBoundingClientRect().width)).toBe(28)
      await expect(Math.round(plus.getBoundingClientRect().height)).toBe(28)
      await expect(plusCss.borderTopLeftRadius).toBe('9999px')
      await expect(plusCss.color).toBe(INK[theme].meta)
      await expect(plusCss.backgroundColor).toBe(
        theme === 'paper' ? 'rgba(27, 29, 20, 0.07)' : 'rgba(250, 249, 239, 0.07)'
      )
      await expect(getComputedStyle(plus.parentElement!).columnGap).toBe('8px')

      const sendCss = getComputedStyle(send)
      await expect(send).toBeDisabled()
      await expect(Math.round(send.getBoundingClientRect().width)).toBe(32)
      await expect(Math.round(send.getBoundingClientRect().height)).toBe(32)
      await expect(sendCss.borderTopLeftRadius).toBe('9999px')
      await expect(sendCss.backgroundColor).toBe(
        theme === 'paper' ? 'rgba(27, 29, 20, 0.12)' : 'rgba(250, 249, 239, 0.12)'
      )
      await expect(sendCss.color).toBe(INK[theme].meta)
      await expect(sendCss.boxShadow).toBe('none')
      const arrow = send.querySelector('svg')!
      await expect(arrow.getAttribute('width')).toBe('12')
      await expect(arrow.getAttribute('stroke-width')).toBe('1.4')

      await expect(scope.queryByText('context:')).toBeNull()
      await expect(scope.queryByRole('separator')).toBeNull()
    }
  },
}

/** The pill's geometry and type — the DC `researchBtn`, the same on and off. */
const expectResearchPill = async (pill: HTMLElement, plus: HTMLElement, send: HTMLElement) => {
  const css = getComputedStyle(pill)
  await expect(pill.textContent).toBe('research')
  await expect(css.display).toBe('flex')
  await expect(css.alignItems).toBe('center')
  await expect(css.columnGap).toBe('7px')
  await expect(css.padding).toBe('7px 12px')
  await expect(css.borderTopLeftRadius).toBe('9999px')
  await expect(css.fontSize).toBe('11px')
  await expect(css.letterSpacing).toBe('0.22px')
  await expect(css.fontFamily).toContain('PP Neue Montreal Mono')

  const icon = pill.querySelector('svg')!
  await expect(icon.getAttribute('width')).toBe('12')
  await expect(icon.getAttribute('height')).toBe('12')
  await expect(icon.getAttribute('stroke-width')).toBe('1.4')
  await expect(icon.getAttribute('stroke-linecap')).toBe('round')
  await expect(icon.querySelector('circle')!.getAttribute('r')).toBe('4')

  // Toolbar order: ＋, research, spacer, send.
  await expect(plus.nextElementSibling).toBe(pill)
  await expect(pill.getBoundingClientRect().left).toBeGreaterThan(
    plus.getBoundingClientRect().right
  )
  await expect(send.getBoundingClientRect().left).toBeGreaterThan(
    pill.getBoundingClientRect().right
  )
}

/** The pill eases between states; assert where it settles, not mid-transition. */
const expectPillPaint = (pill: HTMLElement, color: string, background: string) =>
  waitFor(() => {
    const css = getComputedStyle(pill)
    expect(css.color).toBe(color)
    expect(css.backgroundColor).toBe(background)
  })

/**
 * The research pill after ＋. Off: ink .8, no fill, `aria-pressed=false`. Click:
 * ink .07 fill and full ink, `aria-pressed=true`; click again and it is off.
 */
export const Research: Story = {
  tags: ['!dev'],
  render: () => <BothThemes />,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      const { research, plus, send } = parts(canvasElement, theme)
      const wash = theme === 'paper' ? 'rgba(27, 29, 20, 0.07)' : 'rgba(250, 249, 239, 0.07)'
      await expectResearchPill(research, plus, send)

      await expect(research).toHaveAttribute('aria-pressed', 'false')
      await expectPillPaint(research, INK[theme].meta, 'rgba(0, 0, 0, 0)')

      await userEvent.click(research)
      await expect(research).toHaveAttribute('aria-pressed', 'true')
      await expectPillPaint(research, INK[theme].full, wash)
      await expectResearchPill(research, plus, send)

      await userEvent.click(research)
      await expect(research).toHaveAttribute('aria-pressed', 'false')
      await expectPillPaint(research, INK[theme].meta, 'rgba(0, 0, 0, 0)')
    }
  },
}

/** Research on at rest: the wash and full ink are the whole signal. */
export const ResearchOn: Story = {
  tags: ['!dev'],
  render: () => <BothThemes initialResearch />,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      const { research } = parts(canvasElement, theme)
      await expect(research).toHaveAttribute('aria-pressed', 'true')
      await expectPillPaint(
        research,
        INK[theme].full,
        theme === 'paper' ? 'rgba(27, 29, 20, 0.07)' : 'rgba(250, 249, 239, 0.07)'
      )
    }
  },
}

/** Once the thread has a turn, the hint reads `reply, or ask something else`. */
export const AfterATurn: Story = {
  tags: ['!dev'],
  render: () => <BothThemes hasTurn />,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      await expect(parts(canvasElement, theme).line.placeholder).toBe(
        'reply, or ask something else'
      )
    }
  },
}

/**
 * Typing: the text goes to full ink, send turns on (solid ink, paper glyph,
 * `0 4px 12px` shadow on paper only), and a second line grows the card upward —
 * its bottom edge stays put.
 */
export const Typing: Story = {
  name: 'asking',
  render: () => <BothThemes initialValue="what is actually blocking the renovation?" />,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      const { card, line, send } = parts(canvasElement, theme)
      await expectCard(card, theme)
      await expect(getComputedStyle(line).color).toBe(INK[theme].full)

      const sendCss = getComputedStyle(send)
      await expect(send).toBeEnabled()
      await expect(sendCss.backgroundColor).toBe(INK[theme].full)
      await expect(sendCss.color).toBe(theme === 'paper' ? 'rgb(250, 249, 239)' : 'rgb(27, 29, 20)')
      // The shadow rides on Tailwind's ring stack; only the paper theme has a drop shadow.
      if (theme === 'paper') {
        await expect(sendCss.boxShadow).toContain('rgba(27, 29, 20, 0.22) 0px 4px 12px 0px')
      } else {
        await expect(sendCss.boxShadow).not.toContain('12px')
      }

      const bottomBefore = card.getBoundingClientRect().bottom
      const heightBefore = card.getBoundingClientRect().height
      await userEvent.type(line, '{Shift>}{Enter}{/Shift}and then?')
      await expect(card.getBoundingClientRect().height).toBeGreaterThan(heightBefore)
      await expect(card.getBoundingClientRect().bottom).toBe(bottomBefore)
    }
  },
}

/** Streaming: send is on and shows the 10px stop square. */
export const Streaming: Story = {
  name: 'streaming',
  render: () => <BothThemes streaming hasTurn />,
  play: async ({ canvasElement }) => {
    for (const theme of THEMES) {
      const { send, plus } = parts(canvasElement, theme)
      await expect(send).toHaveAccessibleName('Stop')
      await expect(send).toBeEnabled()
      await expect(getComputedStyle(send).backgroundColor).toBe(
        theme === 'paper' ? 'rgb(27, 29, 20)' : 'rgb(250, 249, 239)'
      )
      const square = send.querySelector('svg')!
      await expect(square.getAttribute('width')).toBe('10')
      await expect(square.querySelector('rect')).toBeTruthy()
      await expect(plus).toBeDisabled()
    }
  },
}

/** Below md the card is 360 wide, the line 16px, ＋ and send both 44 (6z frame 7). */
export const Mobile: Story = {
  name: 'rest · mobile',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => <Composer theme="paper" />,
  play: async ({ canvasElement }) => {
    const { card, line, plus, send, research } = parts(canvasElement, 'paper')
    await expect(Math.round(card.getBoundingClientRect().width)).toBe(360)
    await expect(getComputedStyle(research).padding).toBe('11px 12px')
    await expect(getComputedStyle(line).fontSize).toBe('16px')
    await expect(getComputedStyle(line).lineHeight).toBe('24px')
    await expect(Math.round(plus.getBoundingClientRect().width)).toBe(44)
    await expect(Math.round(send.getBoundingClientRect().width)).toBe(44)
  },
}
