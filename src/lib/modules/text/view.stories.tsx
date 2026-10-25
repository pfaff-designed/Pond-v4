import { useState, type CSSProperties } from 'react'
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import type { TiptapEditorHTMLElement } from '@tiptap/core'
import { expect, fn, userEvent, within, waitFor } from 'storybook/test'

import { TextView } from './view'
import type { TextBlock } from './schema'
import { BlockRowProvider, type BlockRowValue } from '../block-row-context'
import { PondBlock } from '@/components/organisms/PondBlock'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { blockFrame } from '@/lib/modules/block-frame'
import { HEADING_PREFIX } from '@/lib/modules/text/markup'
import { onApplePlatform } from '@/lib/shell-commands'
import { ZEN_BODY_PX, ZEN_PROSE_CLASS } from '@/lib/layout/zen'

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
  await expect(ps.fontFamily).toContain('Georgia')
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
 * shows `type, or / for blocks` only while its own editor carries focus (KAN-345
 * rule 2) — the placeholder disappears on blur and returns once the line is
 * refocused, so an abandoned empty line draws nothing at rest.
 */
export const EmptyStartsEditing: Story = {
  args: { data: { id: 'txt-2', type: 'text', content: '' } as TextBlock },
  render: (args) => <StatefulText data={args.data} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const field = await findEditor(canvas)
    await waitFor(() => expect(field).toHaveFocus())
    const line = field.querySelector<HTMLElement>('p')!
    await expect(line).toHaveAttribute('data-placeholder', 'type, or / for blocks')
    await expect(getComputedStyle(line, '::before').content).toBe('"type, or / for blocks"')
    await userEvent.tab()
    await expect(field).not.toHaveFocus()
    await expect(line).toHaveClass('is-editor-empty')
    await expect(getComputedStyle(line, '::before').content).toBe('none')
    await expect(field.getBoundingClientRect().height).toBeGreaterThan(0)
    // Clicking the empty line puts the caret — and the placeholder — back in it. The
    // placeholder's `::before` is gated on `.ProseMirror-focused`, which ProseMirror
    // adds to the field asynchronously after the native focus event, so wait for that
    // class — not just DOM focus — before reading the pseudo-element.
    await userEvent.click(line)
    await waitFor(() => expect(field).toHaveClass('ProseMirror-focused'))
    await expect(getComputedStyle(line, '::before').content).toBe('"type, or / for blocks"')
  },
}

/**
 * Two empty lines on a real page: the hint draws on at most one — the focused
 * line — and the hint's `::before` shares the prose line's own line box
 * (KAN-535 rule 1 and the line-box fix, `prose.ts`'s `--prose-line`).
 */
export const TwoEmptyLinesOneHint: Story = {
  args: { data: { id: 'txt-4', type: 'text', content: '' } as TextBlock },
  render: () => (
    <>
      <StatefulText data={{ id: 'txt-4', type: 'text', content: '' } as TextBlock} />
      <StatefulText data={{ id: 'txt-5', type: 'text', content: '' } as TextBlock} />
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const fields = await canvas.findAllByRole('textbox', { name: 'text block' }, { timeout: 5000 })
    await waitFor(() => expect(fields).toHaveLength(2))
    const [firstField, secondField] = fields
    const firstP = firstField.querySelector<HTMLElement>('p')!
    const secondP = secondField.querySelector<HTMLElement>('p')!

    // Both blocks are empty, so both editors carry Tiptap's own autofocus, each
    // mounted via its own `setTimeout(0)` in `Editor.mount` (`useEditor`'s mount
    // effect runs after render, in render order — first field's editor commits
    // before second's). Equal-delay timers run FIFO, so the second field's
    // callback is always the one that fires last and wins the focus it steals:
    // not a coin flip, a fixed order. KAN-550 waited for "some field is focused",
    // which the FIRST field's own transient autofocus satisfies on its own,
    // before the second field's still-queued callback has run — so the test's
    // click could land in that window and the second field's callback could
    // still fire afterward and steal focus back mid-assertion, which is why that
    // patch still raced. Wait for the specific field guaranteed to fire last
    // instead of "any", so no autofocus callback is left pending once this test's
    // own clicks start.
    await waitFor(() => expect(secondField).toHaveClass('ProseMirror-focused'))

    // The hint's `::before` is gated on `.ProseMirror-focused`, which ProseMirror
    // adds to the field asynchronously after the native focus event — wait for that
    // class before reading the pseudo-element, not just for DOM focus.
    await userEvent.click(firstP)
    await waitFor(() => expect(firstField).toHaveClass('ProseMirror-focused'))
    await expect(getComputedStyle(firstP, '::before').content).toBe('"type, or / for blocks"')
    await expect(getComputedStyle(secondP, '::before').content).toBe('none')
    await expect(parseFloat(getComputedStyle(firstP, '::before').lineHeight)).toBe(
      parseFloat(getComputedStyle(firstP).lineHeight)
    )

    await userEvent.click(secondP)
    await waitFor(() => expect(secondField).toHaveClass('ProseMirror-focused'))
    await expect(getComputedStyle(secondP, '::before').content).toBe('"type, or / for blocks"')
    await expect(getComputedStyle(firstP, '::before').content).toBe('none')
    await expect(parseFloat(getComputedStyle(secondP, '::before').lineHeight)).toBe(
      parseFloat(getComputedStyle(secondP).lineHeight)
    )
  },
}

/**
 * The hint's line box must track whatever line it's actually on, not the
 * plain-prose box `TwoEmptyLinesOneHint` already covers: a quote's taller
 * line (19×1.6) and zen's own scaled one (`--zen-prose`×1.7) — the line-box
 * fix's `--prose-line` (`prose.ts`, `zen.tsx`'s `ZEN_PROSE_CLASS`).
 */
export const EmptyQuoteAndZenLineHints: Story = {
  args: { data: { id: 'txt-6', type: 'text', content: '' } as TextBlock },
  render: () => (
    <>
      <StatefulText data={{ id: 'txt-6', type: 'text', content: '' } as TextBlock} />
      <div
        className={ZEN_PROSE_CLASS}
        style={{ '--zen-prose': `${ZEN_BODY_PX}px` } as CSSProperties}
      >
        <StatefulText data={{ id: 'txt-7', type: 'text', content: '' } as TextBlock} />
      </div>
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const fields = await canvas.findAllByRole('textbox', { name: 'text block' }, { timeout: 5000 })
    await waitFor(() => expect(fields).toHaveLength(2))
    const [quoteField, zenField] = fields

    // "> " turns the empty line into an empty quote — same input rule the
    // editor's own markdown shortcuts use (`view.test.tsx`). Tiptap's
    // Placeholder extension defaults to `includeChildren: false`
    // (`editor.tsx`'s `buildExtensions`), so a paragraph nested inside a
    // blockquote never gets `is-empty`/`data-placeholder` at all — no hint
    // ever draws there, focused or not. That gap is pre-existing and outside
    // this fix (it's `editor.tsx`'s extension config, not the line-box
    // plumbing), so this story checks the blockquote's `--prose-line` value
    // itself rather than a hint that can't appear.
    await userEvent.click(quoteField)
    await waitFor(() => expect(quoteField).toHaveFocus())
    await userEvent.type(quoteField, '> ')
    const quoteBlock = await waitFor(() => {
      const el = quoteField.querySelector<HTMLElement>('blockquote')
      if (!el) throw new Error('blockquote not yet in the document')
      return el
    })
    // A custom property's computed value is its specified text, unparsed —
    // the browser only resolves `calc()` where a `var()` reference actually
    // uses it, so this checks the same expression `prose.ts` sets, not a
    // px number the browser doesn't compute until something reads it.
    await expect(getComputedStyle(quoteBlock).getPropertyValue('--prose-line').trim()).toBe(
      'calc(19px * 1.6)'
    )

    const zenLine = zenField.querySelector<HTMLElement>('p')!
    await userEvent.click(zenLine)
    await waitFor(() => expect(zenField).toHaveFocus())
    await expect(getComputedStyle(zenLine, '::before').content).toBe('"type, or / for blocks"')
    await expect(parseFloat(getComputedStyle(zenLine, '::before').lineHeight)).toBe(
      parseFloat(getComputedStyle(zenLine).lineHeight)
    )
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

/**
 * KAN-506: a plain Enter steps out to make the next block, through the row's
 * `stepOut` — `BlockRowProvider` stands in for the canvas's own
 * `insertLineAfter` (proven in `block-return.test.tsx`); this story only proves
 * the editor calls it. Shift+Enter breaks the line inside this block instead
 * and never calls `stepOut`.
 */
function EnterStepsOut({ data, stepOut }: { data: TextBlock; stepOut: BlockRowValue['stepOut'] }) {
  return (
    <BlockRowProvider value={{ selected: false, stepOut }}>
      <TextView data={data} editable />
    </BlockRowProvider>
  )
}

const enterStepOut = fn()

export const EnterMakesTheNextBlock: Story = {
  args: { data: { id: 'txt-enter', type: 'text', content: 'alpha' } as TextBlock },
  render: (args) => <EnterStepsOut data={args.data} stepOut={enterStepOut} />,
  play: async ({ canvasElement, args }) => {
    enterStepOut.mockClear()
    const canvas = within(canvasElement)
    const field = await findEditor(canvas)
    const { editor } = field as TiptapEditorHTMLElement
    if (!editor) throw new Error('not a text block field')
    editor.commands.focus('end')
    await waitFor(() => expect(field).toHaveFocus())
    await userEvent.keyboard('{Enter}')
    await expect(enterStepOut).toHaveBeenCalledTimes(1)
    await expect(enterStepOut).toHaveBeenCalledWith(args.data, '', 'below')
    // Still unchanged: `stepOut` only reports the split, the host applies it.
    await expect(field.textContent).toBe('alpha')

    await userEvent.keyboard('{Shift>}{Enter}{/Shift}x')
    await expect(field.querySelector('br')).toBeInTheDocument()
    await expect(field.textContent).toBe('alphax')
    await expect(enterStepOut).toHaveBeenCalledTimes(1)
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
