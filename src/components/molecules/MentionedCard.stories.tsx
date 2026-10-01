import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { MentionedCard } from './MentionedCard'

/**
 * The "mentioned" card (#97, `Pond 06.01` 6a frame 5) — the one thing Pond adds to
 * a page made from a streamed answer. A CARD, not prose and not a bullet list: it
 * was briefly written as a markdown text block, which set its eyebrow as 17.5px
 * PP Editorial New body copy and flattened the rows to bullets. These stories pin
 * the frame's measured values so it cannot drift back into prose.
 */
const meta = {
  title: 'Molecules/MentionedCard',
  component: MentionedCard,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MentionedCard>

export default meta
type Story = StoryObj<typeof meta>

const WITH_NOTES = [
  { pageId: 'cq-1', title: 'cabinet quote', note: 'the one everything waits on' },
  { pageId: 'wt-1', title: 'worktop template', note: 'after the carcasses are measured' },
  { pageId: 'el-1', title: 'electrician, second fix', note: 'wants a date' },
]

/** The card's own chrome, measured off the frame — the same on every story. */
async function expectCardChrome(canvasElement: HTMLElement) {
  const card = canvasElement.querySelector<HTMLElement>('[data-part="mentioned"]')!
  const css = getComputedStyle(card)
  // Paper separated by shadow, never by a border (PROJECT_RULES § Design language).
  await expect(css.borderRadius).toBe('20px')
  await expect(css.padding).toBe('16px 18px')
  await expect(css.borderTopWidth).toBe('0px')
  await expect(css.borderBottomWidth).toBe('0px')
  await expect(css.boxShadow).toContain('rgba(40, 34, 24, 0.04)')
  await expect(css.boxShadow).toContain('rgba(40, 34, 24, 0.06)')
  await expect(css.rowGap).toBe('11px')

  // The eyebrow is the PAGE eyebrow: sans, because the card lives on a page.
  const eyebrow = within(card).getByText('mentioned')
  const eye = getComputedStyle(eyebrow)
  await expect(eye.fontFamily).toContain('PP Neue Montreal')
  await expect(eye.fontFamily).not.toContain('Mono')
  await expect(eye.fontSize).toBe('10.5px')
  await expect(eye.fontWeight).toBe('500')
  await expect(eye.letterSpacing).toBe('1.05px')
  await expect(eye.textTransform).toBe('uppercase')
}

/** A row's three parts, measured: the kind dot, the title, the optional note. */
async function expectRow(row: HTMLElement, { note }: { note: boolean }) {
  // The dot is the existing KindDot — 7px, 2px radius — not a fourth square.
  const dot = row.querySelector<HTMLElement>('[data-part="dot"]')!
  const box = dot.getBoundingClientRect()
  await expect(box.width).toBe(7)
  await expect(box.height).toBe(7)
  await expect(getComputedStyle(dot).borderRadius).toBe('2px')

  const title = row.querySelector<HTMLElement>('[data-part="mentioned-title"]')!
  await expect(getComputedStyle(title).fontSize).toBe('14px')
  await expect(getComputedStyle(title).color).toBe('rgb(27, 29, 20)')

  const noteEl = row.querySelector<HTMLElement>('[data-part="mentioned-note"]')
  if (!note) {
    await expect(noteEl).toBeNull()
    return
  }
  const noteCss = getComputedStyle(noteEl!)
  await expect(noteCss.fontSize).toBe('12.5px')
  await expect(noteCss.color).toBe('rgba(27, 29, 20, 0.68)')
  // Dot · title · note sit on one baseline, in one row.
  await expect(noteEl!.getBoundingClientRect().top).toBeGreaterThan(
    title.getBoundingClientRect().top - 6
  )
}

/**
 * The frame as drawn: three rows, each with Pond's note on why that page is
 * mentioned. Generating a note is model work tracked separately — a page made
 * today carries titles only (see `WithoutNotes`).
 */
export const WithNotes: Story = {
  args: { mentioned: WITH_NOTES },
  play: async ({ canvasElement }) => {
    await expectCardChrome(canvasElement)
    const rows = canvasElement.querySelectorAll<HTMLElement>('[data-part="mentioned-row"]')
    await expect(rows).toHaveLength(3)
    for (const row of rows) await expectRow(row, { note: true })
    const canvas = within(canvasElement)
    await expect(canvas.getByText('the one everything waits on')).toBeInTheDocument()
    // Rows read as rows, never as a bullet list.
    await expect(canvasElement.querySelector('li')).toBeNull()
    await expect(canvasElement.textContent).not.toContain('- cabinet quote')
  },
}

/** What a page made today actually carries: titles, no notes — and the row still
 *  lays out, title taking the full measure rather than leaving a hole. */
export const WithoutNotes: Story = {
  args: { mentioned: WITH_NOTES.map(({ pageId, title }) => ({ pageId, title })) },
  play: async ({ canvasElement }) => {
    await expectCardChrome(canvasElement)
    const rows = canvasElement.querySelectorAll<HTMLElement>('[data-part="mentioned-row"]')
    await expect(rows).toHaveLength(3)
    for (const row of rows) await expectRow(row, { note: false })
    // The title still fills the row — no empty note slot holding space open.
    const row = rows[0]
    const title = row.querySelector<HTMLElement>('[data-part="mentioned-title"]')!
    await expect(title.getBoundingClientRect().width).toBeGreaterThan(
      row.getBoundingClientRect().width - 40
    )
  },
}

/** One mention, with its note — the card is the same card at any length. */
export const OneRow: Story = {
  args: { mentioned: [WITH_NOTES[0]] },
  play: async ({ canvasElement }) => {
    await expectCardChrome(canvasElement)
    const rows = canvasElement.querySelectorAll<HTMLElement>('[data-part="mentioned-row"]')
    await expect(rows).toHaveLength(1)
    await expectRow(rows[0], { note: true })
  },
}

/** Nothing mentioned, nothing drawn — never an empty card on the page. */
export const Empty: Story = {
  args: { mentioned: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-part="mentioned"]')).toBeNull()
  },
}
