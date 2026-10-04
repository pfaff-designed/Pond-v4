import { useState } from 'react'
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'

import { HighlightView } from './view'
import { HIGHLIGHT_EMPTY_LINE, type HighlightBlock } from './schema'

/**
 * The `highlight` block (#249) — wheat's one legal job. The play functions assert
 * the COMPUTED values against `PondTemplate.dc.html`'s `renderVals()`
 * (`k === 'highlight'`; its frames render under a transform, so the literals in
 * that script are the source, never DOM geometry read off the board):
 *
 *   filled  align-self flex-start · padding 4px 8px · #FFEFAE · #1B1D14 ·
 *           PP Editorial New 200 / 16 / 1.5
 *   empty   PP Editorial New 200 / 16 · ink .68 · NO wheat ground
 *
 * The dark stories are the point: wheat is the one colour in the product that does
 * not flip — `#1B1D14` text on `#FFEFAE` under `.dark` too — and the empty line
 * flips to paper .68 with still no ground.
 */

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

const meta = {
  title: 'Modules/Highlight',
  component: HighlightView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof HighlightView>

export default meta
type Story = StoryObj<typeof meta>

const kept: HighlightBlock = {
  id: 'h1',
  type: 'highlight',
  content: 'Three books at once is one too many.',
}
const empty: HighlightBlock = { id: 'h2', type: 'highlight', content: '' }

const WHEAT = 'rgb(255, 239, 174)' // #FFEFAE
const INK = 'rgb(27, 29, 20)' // #1B1D14 — on BOTH themes
const INK_68 = 'rgba(27, 29, 20, 0.68)'
const PAPER_68 = 'rgba(250, 249, 239, 0.68)'
const NO_GROUND = 'rgba(0, 0, 0, 0)'

function passageOf(canvasElement: HTMLElement) {
  return canvasElement.querySelector<HTMLElement>('[data-part="passage"]')!
}

/** The board's serif register, common to filled and empty. */
async function assertRegister(cs: CSSStyleDeclaration) {
  await expect(cs.fontFamily).toContain('PP Editorial New')
  await expect(cs.fontWeight).toBe('200')
  await expect(cs.fontSize).toBe('16px')
}

/** Filled: wheat, ink text, 4px 8px, 1.5, and the ground hugs the text. */
async function assertFilled(canvasElement: HTMLElement) {
  const passage = passageOf(canvasElement)
  const cs = getComputedStyle(passage)
  await assertRegister(cs)
  await expect(cs.lineHeight).toBe('24px') // 1.5 × 16
  await expect(cs.paddingTop).toBe('4px')
  await expect(cs.paddingBottom).toBe('4px')
  await expect(cs.paddingLeft).toBe('8px')
  await expect(cs.paddingRight).toBe('8px')
  await expect(cs.backgroundColor).toBe(WHEAT)
  await expect(cs.color).toBe(INK)
  await expect(cs.alignSelf).toBe('flex-start')
  // Shrink-wrapped: the ground spans the text, never the column.
  const column = passage.parentElement!.getBoundingClientRect()
  await expect(passage.getBoundingClientRect().width).toBeLessThan(column.width)
}

/** Empty: the serif at ink .68 (or paper .68 on ink) and NO wheat ground. */
async function assertEmpty(canvasElement: HTMLElement, ink68: string) {
  const passage = passageOf(canvasElement)
  await expect(passage.textContent).toBe(HIGHLIGHT_EMPTY_LINE)
  const cs = getComputedStyle(passage)
  await assertRegister(cs)
  await expect(cs.color).toBe(ink68)
  await expect(cs.backgroundColor).toBe(NO_GROUND)
  // Nothing on the canvas paints wheat.
  for (const el of canvasElement.querySelectorAll<HTMLElement>('*')) {
    await expect(getComputedStyle(el).backgroundColor).not.toBe(WHEAT)
  }
}

export const Filled: Story = {
  args: { data: kept },
  play: async ({ canvasElement }) => assertFilled(canvasElement),
}

/** Dark keeps `#1B1D14` on `#FFEFAE` — the ONE colour that does not flip. */
export const FilledDark: Story = {
  args: { data: kept },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => {
    await assertFilled(canvasElement)
    // Paranoia the measured assertion already implies: the text is not paper.
    await expect(getComputedStyle(passageOf(canvasElement)).color).not.toBe('rgb(250, 249, 239)')
  },
}

export const Empty: Story = {
  args: { data: empty },
  play: async ({ canvasElement }) => assertEmpty(canvasElement, INK_68),
}

export const EmptyDark: Story = {
  args: { data: empty },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertEmpty(canvasElement, PAPER_68),
}

/** Stateful host so the editable play test exercises a real onChange round-trip. */
function Stateful({ data }: { data: HighlightBlock }) {
  const [state, setState] = useState(data)
  return <HighlightView data={state} editable onChange={setState} />
}

/** Editable: rendered on wheat by default; click drops into the serif source; blur returns. */
export const ClickToEdit: Story = {
  args: { data: kept },
  render: (args) => <Stateful data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await assertFilled(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Edit highlight block' }))
    const textarea = await canvas.findByRole('textbox')
    await expect(textarea).toHaveValue(kept.content)
    await waitFor(() => expect(textarea).toHaveFocus())
    const ts = getComputedStyle(textarea)
    await assertRegister(ts)
    await expect(ts.backgroundColor).toBe(NO_GROUND) // no wheat while editing
    await userEvent.type(textarea, ' Two is plenty.')
    await userEvent.tab()
    await waitFor(() => expect(canvas.queryByRole('textbox')).not.toBeInTheDocument())
    await expect(passageOf(canvasElement).textContent).toBe(
      'Three books at once is one too many. Two is plenty.'
    )
    await assertFilled(canvasElement)
  },
}

/**
 * Whitespace-only content is empty: `filled` is `content.trim() !== ''`. Without the
 * trim a block of spaces paints a wheat slab with nothing in it — wheat's one legal
 * job, spent on nothing, and no error anywhere.
 */
export const WhitespaceIsEmpty: Story = {
  args: { data: { id: 'h3', type: 'highlight', content: '   \n ' } },
  play: async ({ canvasElement }) => assertEmpty(canvasElement, INK_68),
}

/**
 * An EMPTY editable block opens straight into the source — there is nothing to
 * click yet, so a rendered empty state here would be a dead end. Blurring leaves
 * the board's line, still with no wheat, and the trigger takes a click again.
 */
export const EmptyEditable: Story = {
  args: { data: empty },
  render: (args) => <Stateful data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const textarea = await canvas.findByRole('textbox')
    await expect(textarea).toHaveValue('')
    await expect(getComputedStyle(textarea).backgroundColor).toBe(NO_GROUND)
    await userEvent.tab()
    await waitFor(() => expect(canvas.queryByRole('textbox')).not.toBeInTheDocument())
    await assertEmpty(canvasElement, INK_68)
    await userEvent.click(canvas.getByRole('button', { name: 'Edit highlight block' }))
    await expect(await canvas.findByRole('textbox')).toBeInTheDocument()
  },
}

/**
 * The trigger is a div with `role="button"`, so Enter and Space are OURS to handle —
 * the browser gives them to it for free only on a real `<button>`. Escape leaves the
 * source. A keyboard-only person losing this cannot edit a highlight at all, and
 * nothing about the rendered page shows it.
 */
export const KeyboardEdit: Story = {
  args: { data: kept },
  render: (args) => <Stateful data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', { name: 'Edit highlight block' })
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    const textarea = await canvas.findByRole('textbox')
    await waitFor(() => expect(textarea).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('textbox')).not.toBeInTheDocument())
    await assertFilled(canvasElement)
    // Space re-enters it.
    canvas.getByRole('button', { name: 'Edit highlight block' }).focus()
    await userEvent.keyboard(' ')
    await expect(await canvas.findByRole('textbox')).toBeInTheDocument()
  },
}
