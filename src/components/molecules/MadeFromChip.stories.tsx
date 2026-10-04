import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { MadeFromChip } from './MadeFromChip'
import type { MadeFromThread } from '@/lib/pages/made-from'

/**
 * The made-from row (#97, `Pond 06.01` 6a frame 5) — relocated from
 * `src/__tests__/made-from-chip.test.tsx`, which drove it through the whole
 * `DocumentPanel` with four mocked modules to assert a class name on an eyebrow.
 *
 * Measured off the frame, and read back here as COMPUTED values in both themes:
 *
 * - eyebrow `made from` — **sans** 500 / 10.5px / .1em / uppercase / ink .68.
 *   The medium decides the register, not the author (PROJECT_RULES § two
 *   registers, split by medium): this label lives on a PAGE, so it is PP Neue
 *   Montreal, while the composer's own eyebrows are the mono. Asserting
 *   `className === pageEyebrowClass` — what jest did — proves only that one
 *   constant equals itself; it cannot see the face that actually painted.
 * - chip — mono 11px, lowercase, .02em, FULL ink, on the ink .07 pill at
 *   `5px 11px`.
 *
 * **It can be hidden, not removed.** The only controls are hide and, once
 * hidden, show; the stamp stays on the page either way, which is why every story
 * also asserts that nothing here removes it.
 *
 * The WRITE behind the toggle — the optimistic flag, its persistence through
 * `setMadeFromHidden`, and the rollback when the row refuses — is data work and
 * stays in jest; this file owns the surface and the gesture.
 */
const STAMP: MadeFromThread = {
  threadId: 'conv-1',
  messageId: 'a1',
  question: 'what is actually blocking the renovation?',
  askedAt: '2026-09-22T07:12:00',
}

const meta = {
  title: 'Molecules/MadeFromChip',
  component: MadeFromChip,
  parameters: { layout: 'padded' },
  args: { stamp: STAMP, onOpen: fn(), onToggleHidden: fn() },
} satisfies Meta<typeof MadeFromChip>

export default meta
type Story = StoryObj<typeof meta>

const THEMES = ['light', 'dark'] as const
type Theme = (typeof THEMES)[number]

/** ink .68 (the meta tier) and the ink .07 chip fill, resolved per theme. */
const INK = {
  light: {
    meta: 'rgba(27, 29, 20, 0.68)',
    full: 'rgb(27, 29, 20)',
    fill: [27, 29, 20, 0.07] as const,
  },
  dark: {
    meta: 'rgba(250, 249, 239, 0.68)',
    full: 'rgb(250, 249, 239)',
    fill: [250, 249, 239, 0.07] as const,
  },
} as const

/**
 * Run `body` once per theme, flipping `.dark` on the ROOT element — not on a
 * wrapper div.
 *
 * It has to be the root. `--foreground` is declared once, on `:root`, as
 * `var(--mn-text)`, and a custom property's own value is substituted where it is
 * DECLARED: a nested `.dark` reassigns `--mn-text` but inherits an
 * already-resolved `--foreground`, so `text-foreground` (which the chip uses)
 * silently keeps the light ink. Theming through the root is what the app does
 * and the only thing that exercises the alias chain.
 */
async function inBothThemes(canvasElement: HTMLElement, body: (theme: Theme) => Promise<void>) {
  // The canvas's OWN document — the runner may mount the story in an iframe, in
  // which case `document` here is the test page and toggling it themes nothing.
  const root = canvasElement.ownerDocument.documentElement
  const had = root.classList.contains('dark')
  try {
    for (const theme of THEMES) {
      root.classList.toggle('dark', theme === 'dark')
      await body(theme)
    }
  } finally {
    root.classList.toggle('dark', had)
  }
}

/**
 * Tailwind v4 compiles an opacity modifier (`bg-mn-text/[0.07]`) to
 * `color-mix(in oklab, …)`, so Chromium serialises that one computed value as
 * `oklab(L a b / α)` while a token declared literally comes back as `rgba(…)`.
 * Decoded here so the chip's fill can still be asserted against the board's ink
 * .07 rather than against whichever notation the compiler happened to emit.
 */
function srgb(value: string): [number, number, number, number] {
  const ok = value.match(/^oklab\(([^)]+)\)$/)
  if (!ok) {
    const plain = value.match(/^rgba?\(([^)]+)\)$/)
    if (!plain) throw new Error(`MadeFromChip stories: unparsed colour "${value}"`)
    const n = plain[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number)
    return [n[0], n[1], n[2], n[3] ?? 1]
  }
  const [L, a, b, alpha] = ok[1]
    .split(/[\s/]+/)
    .filter(Boolean)
    .map(Number)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const k = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * k,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * k,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * k,
  ]
  const encode = (c: number) => {
    const x = Math.min(1, Math.max(0, c))
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
  }
  return [
    Math.round(encode(linear[0]) * 255),
    Math.round(encode(linear[1]) * 255),
    Math.round(encode(linear[2]) * 255),
    alpha ?? 1,
  ]
}

/** Assert a computed colour against a board literal, within 1/255 + .01 alpha. */
async function expectColour(actual: string, expected: readonly [number, number, number, number]) {
  const got = srgb(actual)
  for (let i = 0; i < 3; i += 1) await expect(Math.abs(got[i] - expected[i])).toBeLessThanOrEqual(1)
  await expect(Math.abs(got[3] - expected[3])).toBeLessThanOrEqual(0.01)
}

/**
 * The row as the frame draws it: the eyebrow, the chip naming the moment, and
 * `hide`. Clicking the chip goes back to the thread at that message.
 */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await inBothThemes(canvasElement, async (theme) => {
      // The chip names the moment, not the page: weekday, 24h time, the question
      // in curly quotes.
      const chip = canvas.getByRole('button', {
        name: 'tuesday 07:12 — “what is actually blocking the renovation?”',
      })

      // ── the eyebrow: SANS, because it lives on a page ──
      const eyebrow = canvas.getByText('made from')
      const eye = getComputedStyle(eyebrow)
      await expect(eye.fontFamily).toContain('PP Neue Montreal')
      await expect(eye.fontFamily).not.toContain('Mono')
      await expect(eye.fontSize).toBe('10.5px')
      await expect(eye.fontWeight).toBe('500')
      await expect(eye.letterSpacing).toBe('1.05px') // 10.5 × .1em
      await expect(eye.textTransform).toBe('uppercase')
      await waitFor(() => expect(eye.color).toBe(INK[theme].meta))

      // ── the chip: the machine register, on the quiet pill ──
      const css = getComputedStyle(chip)
      await expect(css.fontFamily).toContain('Mono')
      await expect(css.fontSize).toBe('11px')
      await expect(css.letterSpacing).toBe('0.22px') // 11 × .02em
      await expect(css.textTransform).toBe('lowercase')
      // The chip and the hide/show control carry `transition-colors`, so a read
      // taken the instant the theme flips catches the 150ms interpolation
      // mid-flight — settle before pinning the ink.
      await waitFor(async () => {
        await expect(css.color).toBe(INK[theme].full)
        await expectColour(css.backgroundColor, INK[theme].fill)
      })
      await expect(css.padding).toBe('5px 11px')
      await expect(css.borderTopLeftRadius).toBe('9999px')

      // Hidden, never removed: the only other control is `hide`.
      await expect(canvas.getByRole('button', { name: 'hide' })).toBeInTheDocument()
      await expect(canvas.queryByRole('button', { name: /remove|delete/i })).toBeNull()
      await expect(canvas.getAllByRole('button')).toHaveLength(2)
    })

    // The chip returns to the moment in the thread.
    await userEvent.click(canvas.getByRole('button', { name: /tuesday 07:12/ }))
    await expect(args.onOpen).toHaveBeenCalledTimes(1)

    // …and `hide` asks for the flag, with the value it is moving TO.
    await userEvent.click(canvas.getByRole('button', { name: 'hide' }))
    await expect(args.onToggleHidden).toHaveBeenCalledWith(true)
  },
}

/**
 * Hidden: one quiet mono control reading `made from · show`, and the eyebrow and
 * chip are gone. Still nothing that removes — show hands the stamp straight back.
 */
export const Hidden: Story = {
  args: { stamp: { ...STAMP, hidden: true } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await inBothThemes(canvasElement, async (theme) => {
      const show = canvas.getByRole('button', { name: 'made from · show' })
      const css = getComputedStyle(show)
      await expect(css.fontFamily).toContain('Mono')
      await expect(css.fontSize).toBe('10.5px')
      await expect(css.textTransform).toBe('lowercase')
      await waitFor(() => expect(css.color).toBe(INK[theme].meta))

      // The eyebrow and the chip are not merely hidden from view — not drawn.
      await expect(canvas.queryByText('made from')).toBeNull()
      await expect(canvas.queryByRole('button', { name: /tuesday 07:12/ })).toBeNull()
      await expect(canvas.getAllByRole('button')).toHaveLength(1)
    })

    await userEvent.click(canvas.getByRole('button', { name: 'made from · show' }))
    await expect(args.onToggleHidden).toHaveBeenCalledWith(false)
  },
}

/**
 * A stamp Pond could not date, or could not quote: the label degrades rather
 * than rendering an empty chip or a dangling em dash. The silent failure is a
 * chip that reads `—  “”` and links nowhere a person can recognise.
 */
export const PartialStamp: Story = {
  render: (args) => (
    <div className="flex flex-col items-start gap-3 bg-mn-surface p-4">
      <span data-probe="no-date">
        <MadeFromChip {...args} stamp={{ ...STAMP, askedAt: null }} />
      </span>
      <span data-probe="no-question">
        <MadeFromChip {...args} stamp={{ ...STAMP, question: '  ' }} />
      </span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const at = (probeName: string) =>
      within(canvasElement.querySelector<HTMLElement>(`[data-probe="${probeName}"]`)!)
    await expect(
      at('no-date').getByRole('button', {
        name: '“what is actually blocking the renovation?”',
      })
    ).toBeInTheDocument()
    await expect(
      at('no-question').getByRole('button', { name: 'tuesday 07:12' })
    ).toBeInTheDocument()
  },
}
