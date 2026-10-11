import { useState } from 'react'
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'

import { TextView } from './view'
import type { TextBlock } from './schema'
import { PondBlock } from '@/components/organisms/PondBlock'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { blockFrame } from '@/lib/modules/block-frame'
import { HEADING_PREFIX } from '@/lib/modules/palette'
import { onApplePlatform } from '@/lib/shell-commands'

/**
 * The `text` content block — its markdown typeset and edited in place, with no
 * source field. Read-only renders the same document, not editable, in the same type.
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

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

/** No board turns ligatures off, so the prose sets them as the font does by default. */
async function assertLigatures(element: HTMLElement) {
  const style = getComputedStyle(element)
  await expect(style.fontVariantLigatures).toBe('normal')
  await expect(style.fontFeatureSettings).toBe('normal')
}

/** `PondAtom.dc.html` prose: serif 200, 17.5px (17 under 48rem), line-height 1.6, full ink. */
async function assertProseType(canvasElement: HTMLElement, ink: string) {
  const paragraph = await within(canvasElement).findByText(/^Start with/, { selector: 'p' })
  const ps = getComputedStyle(paragraph)
  const size = window.matchMedia('(width < 48rem)').matches ? 17 : 17.5
  await expect(ps.fontFamily).toContain('PP Editorial New')
  await expect(ps.fontWeight).toBe('200')
  await expect(ps.fontSize).toBe(`${size}px`)
  await expect(parseFloat(ps.lineHeight)).toBeCloseTo(size * 1.6, 1)
  await expect(ps.color).toBe(ink)
  await assertLigatures(paragraph)
}

/** Read-only: markdown is typeset, no literal syntax survives, nothing is editable. */
export const ReadOnly: Story = {
  args: { data: sample },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByRole('heading', { level: 2, name: 'Warm-up' })
    ).toBeInTheDocument()
    await expect(canvas.getByText('light cardio').tagName).toBe('STRONG')
    await expect(canvasElement.textContent).not.toContain('## Warm-up')
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument()
    await assertProseType(canvasElement, 'rgb(27, 29, 20)') // #1B1D14 ink
  },
}

/** The same prose on ink: paper-coloured, same type. */
export const ReadOnlyInk: Story = {
  ...ReadOnly,
  decorators: [inkTheme],
  play: async ({ canvasElement }) => {
    await assertProseType(canvasElement, 'rgb(250, 249, 239)') // #FAF9EF paper
  },
}

/**
 * Stateful host so editable play tests exercise real onChange round-trips. The
 * `data-saved` hook is story-local: it exposes the markdown the page would commit.
 */
function StatefulText({ data }: { data: TextBlock }) {
  const [state, setState] = useState(data)
  return (
    <div data-saved={state.content}>
      <TextView data={state} editable onChange={setState} />
    </div>
  )
}

const savedOf = (canvasElement: HTMLElement) =>
  canvasElement.querySelector<HTMLElement>('[data-saved]')?.dataset.saved

/**
 * The editor is a lazy chunk with the static prose standing in until it loads; under
 * a full parallel run that load alone can outlast `findByRole`'s default 1s.
 */
const findEditor = (canvas: ReturnType<typeof within>): Promise<HTMLElement> =>
  canvas.findByRole('textbox', { name: 'text block' }, { timeout: 5000 })

/** Editable: the prose IS the field — typeset while writing, written back as markdown. */
export const EditInPlace: Story = {
  args: { data: sample },
  render: (args) => <StatefulText data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const field = await findEditor(canvas)
    await expect(field).toHaveAttribute('contenteditable', 'true')
    await assertLigatures(field)
    await assertLigatures(within(field).getByText(/^Start with/, { selector: 'p' }))
    await expect(canvas.queryByRole('button', { name: 'Edit text block' })).toBeNull()
    await expect(within(field).getByRole('heading', { level: 2, name: 'Warm-up' })).toBeVisible()
    await expect(field.textContent).not.toMatch(/##|\*\*|`/)
    // Typing at the end extends the prose; the markdown gains only what was typed.
    await userEvent.type(field, ' Go.')
    await waitFor(() => expect(savedOf(canvasElement)).toBe(`${sample.content} Go.`))
    await expect(field.textContent).not.toMatch(/##|\*\*|`/)
    await expect(within(field).getByText('foam roller').tagName).toBe('CODE')
  },
}

/**
 * The same platform read `isUndoChord`/`isRedoChord` use, so the chord this test
 * sends can never drift from the chord production listens for.
 */
const MOD_KEY = onApplePlatform() ? 'Meta' : 'Control'

const pressUndo = () => userEvent.keyboard(`{${MOD_KEY}>}z{/${MOD_KEY}}`)
const pressRedo = () => userEvent.keyboard(`{${MOD_KEY}>}{Shift>}z{/Shift}{/${MOD_KEY}}`)

/**
 * No typing happens in this story, and that absence is the point: ProseMirror's
 * own history is empty on a freshly mounted editor.
 */
export const UndoWithNothingTypedKeepsText: Story = {
  args: { data: sample },
  render: (args) => <StatefulText data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const field = await findEditor(canvas)
    await userEvent.click(within(field).getByText(/^Start with/, { selector: 'p' }))
    await expect(field).toHaveFocus()
    await pressUndo()
    await expect(field.textContent).toContain('Start with')
    await expect(savedOf(canvasElement)).toBe(sample.content)
  },
}

/**
 * The ticket's acceptance shape: typing first gives ProseMirror's own history a
 * step to revert, so ⌘Z undoes just that step and ⌘⇧Z brings it back — the
 * behaviour a person expects inside any text field.
 */
export const TypeUndoRedo: Story = {
  args: { data: sample },
  render: (args) => <StatefulText data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const field = await findEditor(canvas)
    await userEvent.click(within(field).getByText(/^Start with/, { selector: 'p' }))
    await userEvent.type(field, ' Go.')
    await waitFor(() => expect(savedOf(canvasElement)).toBe(`${sample.content} Go.`))
    await pressUndo()
    await waitFor(() => expect(savedOf(canvasElement)).toBe(sample.content))
    await expect(field.textContent).toContain('Start with')
    await pressRedo()
    await waitFor(() => expect(savedOf(canvasElement)).toBe(`${sample.content} Go.`))
  },
}

/** A link in an editable block opens in a new tab with the opener severed. */
export const LinkInEditableBlock: Story = {
  args: {
    data: {
      id: 'txt-3',
      type: 'text',
      content: 'See [the plans](https://example.com/plans) before cutting.',
    } as TextBlock,
  },
  render: (args) => <StatefulText data={args.data} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const field = await findEditor(canvas)
    const link = within(field).getByRole('link', { name: 'the plans' })
    await expect(link).toHaveAttribute('href', 'https://example.com/plans')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    // Keep the test tab from actually opening example.com.
    const opened: Parameters<typeof window.open>[] = []
    const open = window.open
    window.open = (...args: Parameters<typeof window.open>) => {
      opened.push(args)
      return null
    }
    try {
      await userEvent.click(link)
    } finally {
      window.open = open
    }
    await expect(opened).toEqual([['https://example.com/plans', '_blank', 'noopener,noreferrer']])
    // Clicking the prose around it is just a caret in the field.
    await userEvent.click(canvas.getByText(/before cutting/))
    await expect(field).toHaveFocus()
    await expect(savedOf(canvasElement)).toBe(args.data.content)
  },
}

/**
 * An empty editable block opens focused so a freshly-added block is typeable, and
 * shows the prose atom's placeholder — which stays when focus leaves, so the line
 * is never a zero-height dead zone.
 */
export const EmptyStartsEditing: Story = {
  args: { data: { id: 'txt-2', type: 'text', content: '' } as TextBlock },
  render: (args) => <StatefulText data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const field = await findEditor(canvas)
    await waitFor(() => expect(field).toHaveFocus())
    const line = field.querySelector<HTMLElement>('p')!
    await expect(line).toHaveAttribute('data-placeholder', 'write something')
    await expect(getComputedStyle(line, '::before').content).toBe('"write something"')
    await userEvent.tab()
    await expect(field).not.toHaveFocus()
    await expect(line).toHaveClass('is-editor-empty')
    await expect(field.getBoundingClientRect().height).toBeGreaterThan(0)
    // Clicking the empty line puts the caret back in it.
    await userEvent.click(line)
    await expect(field).toHaveFocus()
  },
}

/**
 * `/heading` mints `'## '` — scaffolding, not writing. It opens as an empty
 * heading reading `untitled` with the caret in it, so the first keystroke is the
 * heading's words.
 */
export const HeadingStartsEditing: Story = {
  args: { data: { id: 'txt-3', type: 'text', content: HEADING_PREFIX } as TextBlock },
  render: (args) => <StatefulText data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const field = await findEditor(canvas)
    await waitFor(() => expect(field).toHaveFocus())
    const heading = field.firstElementChild as HTMLElement
    await expect(heading.tagName).toBe('H2')
    await expect(field.textContent).toBe('')
    // An empty heading line is the heading atom's empty copy, not the prose atom's.
    await expect(heading).toHaveAttribute('data-placeholder', 'untitled')
    await expect(getComputedStyle(heading, '::before').content).toBe('"untitled"')
    await userEvent.keyboard('warm-up')
    await waitFor(() => expect(savedOf(canvasElement)).toBe(`${HEADING_PREFIX}warm-up`))
    await expect(within(field).getByRole('heading', { level: 2, name: 'warm-up' })).toBeVisible()
  },
}

// ── #258: labelled → card, unlabelled → bare ───────────────────────────────────

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
  // ADR 0008: the card fills its container, not the board's old 400px.
  const p = card.parentElement!
  const pcs = getComputedStyle(p)
  const avail = p.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight)
  await expect(card.getBoundingClientRect().width).toBeCloseTo(avail, 0)
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
