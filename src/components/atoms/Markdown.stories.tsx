import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { Markdown } from './Markdown'

/**
 * The rendered-reading primitive (ticket-20). Verifies that markdown source is
 * typeset — no literal `##`, `**`, `---`, or pipe-table syntax survives — in both
 * the Press-serif `reading` variant and the compact `terminal` variant.
 */
const meta = {
  title: 'Atoms/Markdown',
  component: Markdown,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Markdown>

export default meta
type Story = StoryObj<typeof meta>

const SAMPLE = `## Equipment

You'll need **dumbbells** and a *bench*. Reach for a mat when the floor is hard.

- Warm up first
- Rest \`60s\` between sets

---

| Exercise | Sets | Reps |
| --- | --- | --- |
| Squat | 3 | 10 |
| Press | 3 | 8 |
`

/** Reading variant: headings/bold/lists/rule/table all typeset in Press serif. */
export const Reading: Story = {
  args: { children: SAMPLE, variant: 'reading' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Heading rendered as an <h2>, not literal "## Equipment".
    const heading = canvas.getByRole('heading', { level: 2, name: 'Equipment' })
    await expect(heading).toBeInTheDocument()
    await expect(canvasElement.textContent).not.toContain('## Equipment')
    // Bold + emphasis become real elements.
    await expect(canvas.getByText('dumbbells').tagName).toBe('STRONG')
    await expect(canvas.getByText('bench').tagName).toBe('EM')
    // Inline code.
    await expect(canvas.getByText('60s').tagName).toBe('CODE')
    // GFM table (remark-gfm) — cells are typeset, not pipe syntax.
    await expect(canvas.getByRole('table')).toBeInTheDocument()
    await expect(canvas.getByRole('cell', { name: 'Squat' })).toBeInTheDocument()
    await expect(canvasElement.textContent).not.toContain('| Exercise |')
    // List items.
    await expect(canvas.getByText('Warm up first')).toBeInTheDocument()
  },
}

/**
 * Reading preserves plain line breaks (remark-breaks): user-typed notes with single
 * newlines — the old whitespace-pre-wrap behavior — must not collapse into one
 * run-on paragraph.
 */
export const ReadingPlainLineBreaks: Story = {
  args: { children: 'Buy sandpaper\nSharpen chisels\nGlue the frame', variant: 'reading' },
  play: async ({ canvasElement }) => {
    // Single newlines become hard breaks — two <br>s between the three lines.
    await expect(canvasElement.querySelectorAll('br')).toHaveLength(2)
    await expect(canvasElement.textContent).toContain('Buy sandpaper')
    await expect(canvasElement.textContent).toContain('Glue the frame')
    // Each line renders at its own vertical offset (really separate lines).
    const paragraph = canvasElement.querySelector('p')
    await expect(paragraph).not.toBeNull()
    const lineHeight = parseFloat(getComputedStyle(paragraph!).lineHeight)
    await expect(paragraph!.getBoundingClientRect().height).toBeGreaterThan(lineHeight * 2)
  },
}

/** Terminal variant: same source, compact chat-bubble treatment. */
export const Terminal: Story = {
  args: { children: '**Biceps** and **triceps**:\n\n- curls\n- extensions', variant: 'terminal' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Biceps').tagName).toBe('STRONG')
    await expect(canvasElement.textContent).not.toContain('**Biceps**')
    await expect(canvas.getByText('curls')).toBeInTheDocument()
  },
}

/** HTML in the source is inert text, never markup (no rehype-raw wired). */
export const HtmlIsInert: Story = {
  args: { children: 'Safe: <img src=x onerror="alert(1)"> and <b>not bold</b>.' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The <b> tag renders as literal text, not a bold element.
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument()
    await expect(canvasElement.textContent).toContain('<b>not bold</b>')
  },
}
