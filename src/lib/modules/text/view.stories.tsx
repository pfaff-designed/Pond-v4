import { useState } from 'react'
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'

import { TextView } from './view'
import type { TextBlock } from './schema'
import { PondBlock } from '@/components/organisms/PondBlock'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { blockFrame, POND_BLOCK_WIDTHS } from '@/lib/modules/block-frame'

/**
 * The `text` content block (ticket-20) — rendered reading by default, click-to-edit
 * source. Read-only always typesets markdown; editable starts in the rendered view
 * and drops into a source textarea on click (extends the ticket-10 edit loop).
 *
 * #258 — the bare/carded fork, from `PondTemplate.dc.html`'s `renderVals()`:
 *
 *   bare = k === 'text' && !label                       → { padding: '2px 4px' }
 *   else { background: card, borderRadius: 20, boxShadow: shadow, padding: '14px 16px' }
 *   hasEyebrow: !!label
 *
 * So an UNLABELLED text block is bare prose on the page, and a LABELLED one
 * (`project → goal`, `meeting → notes`) is an ordinary card with the label as its
 * eyebrow. The two stories below render both side by side exactly as `BlockCanvas`
 * does — `blockFrame()` → `PondBlock` or the bare `px-1 py-0.5` wrapper — in each
 * theme, and assert the computed card against the board (its frames render under a
 * transform, so the literals in that script are the source, never DOM geometry).
 */
const meta = {
  title: 'Modules/Text',
  component: TextView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TextView>

export default meta
type Story = StoryObj<typeof meta>

const sample: TextBlock = {
  id: 'txt-1',
  type: 'text',
  content: '## Warm-up\n\nStart with **light cardio**, then reach for the `foam roller`.',
}

/** Read-only: markdown is typeset, no literal syntax survives, no textarea. */
export const ReadOnly: Story = {
  args: { data: sample },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 2, name: 'Warm-up' })).toBeInTheDocument()
    await expect(canvas.getByText('light cardio').tagName).toBe('STRONG')
    await expect(canvasElement.textContent).not.toContain('## Warm-up')
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument()
  },
}

/** Stateful host so editable play tests exercise real onChange round-trips. */
function StatefulText({ data }: { data: TextBlock }) {
  const [state, setState] = useState(data)
  return <TextView data={state} editable onChange={setState} />
}

/** Editable: rendered by default; clicking opens the source textarea with content intact. */
export const ClickToEdit: Story = {
  args: { data: sample },
  render: (args) => <StatefulText data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Starts rendered — no textarea, markdown typeset.
    await expect(canvas.getByRole('heading', { level: 2, name: 'Warm-up' })).toBeInTheDocument()
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument()
    // Click drops into the source with full markdown intact and focused.
    await userEvent.click(canvas.getByRole('button', { name: 'Edit text block' }))
    const textarea = await canvas.findByRole('textbox')
    await expect(textarea).toHaveValue(sample.content)
    await waitFor(() => expect(textarea).toHaveFocus())
    // Typing extends the source, then blur returns to the rendered view.
    await userEvent.type(textarea, ' Go.')
    await expect(textarea).toHaveValue(sample.content + ' Go.')
    await userEvent.tab()
    await waitFor(() => expect(canvas.queryByRole('textbox')).not.toBeInTheDocument())
    await expect(canvas.getByText('foam roller').tagName).toBe('CODE')
  },
}

/** A link in an editable block navigates (new tab); everything else enters edit. */
export const LinkInEditableBlock: Story = {
  args: {
    data: {
      id: 'txt-3',
      type: 'text',
      content: 'See [the plans](https://example.com/plans) before cutting.',
    } as TextBlock,
  },
  render: (args) => <StatefulText data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Keep the test tab from actually opening example.com; capture-phase so the
    // wrapper's own bubble-phase link check still runs untouched.
    canvasElement.addEventListener(
      'click',
      (e) => {
        if (e.target instanceof Element && e.target.closest('a')) e.preventDefault()
      },
      true
    )
    // The link is a real anchor: href intact, new tab, opener severed.
    const link = canvas.getByRole('link', { name: 'the plans' })
    await expect(link).toHaveAttribute('href', 'https://example.com/plans')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    // Clicking the link does NOT enter edit mode.
    await userEvent.click(link)
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument()
    // Clicking the surrounding prose does.
    await userEvent.click(canvas.getByText(/before cutting/))
    await expect(await canvas.findByRole('textbox')).toBeInTheDocument()
  },
}

/**
 * An empty editable block starts in edit mode so a freshly-added block is typeable;
 * blurring out of it leaves a visible placeholder (not a zero-height dead zone)
 * that mouse users can click to re-enter.
 */
export const EmptyStartsEditing: Story = {
  args: { data: { id: 'txt-2', type: 'text', content: '' } as TextBlock },
  render: (args) => <StatefulText data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('textbox')).toBeInTheDocument()
    // Blur without typing → read mode shows the placeholder, still clickable.
    await userEvent.tab()
    await waitFor(() => expect(canvas.queryByRole('textbox')).not.toBeInTheDocument())
    const trigger = canvas.getByRole('button', { name: 'Edit text block' })
    await expect(canvas.getByText('Write something…')).toBeInTheDocument()
    await expect(trigger.getBoundingClientRect().height).toBeGreaterThan(0)
    // Click re-enters edit mode.
    await userEvent.click(trigger)
    await expect(await canvas.findByRole('textbox')).toBeInTheDocument()
  },
}

// ── #258: labelled → card, unlabelled → bare ───────────────────────────────────

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

/** The board's `project → goal` fixture: a LABELLED text block. */
const goal: TextBlock = {
  id: 'txt-goal',
  type: 'text',
  label: 'goal',
  content: 'Out of the flat by the 14th, with every box labelled by room.',
}

/** The board's `notes` fixture: an UNLABELLED text block — bare. */
const bareNote: TextBlock = {
  id: 'txt-bare',
  type: 'text',
  content: 'A shelf above the desk for the radio. Ask about the allotment waiting list.',
}

/**
 * `BlockCanvas`'s fork: a frame → `PondBlock`; none → the bare wrapper. The
 * `data-bare` hook is story-local — the canvas has no such attribute — so the
 * assertions can address the bare sibling.
 */
function Framed({ data }: { data: TextBlock }) {
  const frame = blockFrame(data)
  const view = <TextView data={data} />
  return frame ? (
    <PondBlock kind={frame.kind} heading={frame.heading} headNote={frame.headNote}>
      {view}
    </PondBlock>
  ) : (
    <div data-bare className="px-1 py-0.5">
      {view}
    </div>
  )
}

// Hex beside each value so a reader can check it against the board without
// converting, as `entries/view.stories.tsx` and `highlight/view.stories.tsx` do.
const LIGHT = {
  card: 'rgb(250, 249, 239)', // #FAF9EF — light is ONE paper, ground and cards
  ink68: 'rgba(27, 29, 20, 0.68)', // ink .68
}
const DARK = {
  card: 'rgb(48, 49, 42)', // #30312A — dark is TWO papers; this is the card
  ink68: 'rgba(250, 249, 239, 0.68)', // paper .68
}

async function assertFork(canvasElement: HTMLElement, theme: typeof LIGHT) {
  // The labelled block: ONE card, the `list` kind at 400, the label as its eyebrow.
  const cards = canvasElement.querySelectorAll<HTMLElement>('[data-block-kind]')
  await expect(cards).toHaveLength(1)
  const card = cards[0]
  await expect(card.dataset.blockKind).toBe('list')
  const cs = getComputedStyle(card)
  await expect(cs.width).toBe(`${POND_BLOCK_WIDTHS.list}px`)
  await expect(cs.backgroundColor).toBe(theme.card)
  await expect(cs.borderTopLeftRadius).toBe('20px')
  const eyebrow = within(card).getByText('goal')
  await expect(eyebrow.className).toBe(pageEyebrowClass)
  const es = getComputedStyle(eyebrow)
  await expect(es.textTransform).toBe('uppercase')
  await expect(es.color).toBe(theme.ink68)
  await expect(card.textContent).toContain('Out of the flat by the 14th')

  // The unlabelled block: no card at all — bare at the board's `2px 4px`.
  const bare = canvasElement.querySelector<HTMLElement>('[data-bare]')!
  await expect(bare.querySelector('[data-block-kind]')).toBeNull()
  const bs = getComputedStyle(bare)
  await expect(bs.paddingTop).toBe('2px')
  await expect(bs.paddingLeft).toBe('4px')
  await expect(bs.backgroundColor).toBe('rgba(0, 0, 0, 0)')
  await expect(bs.boxShadow).toBe('none')
  await expect(bare.textContent).toContain('A shelf above the desk')
}

/**
 * A labelled text block (card + eyebrow) beside an unlabelled one (bare), paper.
 * The label is the block's own persisted field; nothing but the label differs.
 */
export const LabelledBesideBare: Story = {
  args: { data: goal },
  render: (args) => (
    <div className="flex flex-col items-start gap-mn-4">
      <Framed data={args.data} />
      <Framed data={bareNote} />
    </div>
  ),
  play: async ({ canvasElement }) => assertFork(canvasElement, LIGHT),
}

/** The same pair on ink: the card is the dark card paper, the eyebrow ink .68. */
export const LabelledBesideBareInk: Story = {
  ...LabelledBesideBare,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertFork(canvasElement, DARK),
}
