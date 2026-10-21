import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'
import { PondAtom, POND_ATOM_KINDS, POND_ATOM_STATES, type PondAtomProps } from './PondAtom'

/**
 * PondAtom (#93) — the one polymorphic inline atom: 24 kinds × 9 states on the
 * Make Noise role tokens. Theme is ambient — the `ink` stories only add the
 * `.dark` class around the canvas (a Storybook-only decorator, never a prop).
 */

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

/**
 * Every number and colour asserted below is a literal from the board —
 * `wayfinder/board-values.generated.json`, `.components.PondAtom`
 * (`kind=*|theme=paper` deltas, their `states`, and the `level=*` / `size=mobile`
 * / `color=*` secondaries) — read back off REAL computed styles. Not rounded to a
 * scale, not reconciled with a token: `13.5px` means 13.5px.
 */
const INK = 'rgb(27, 29, 20)'
const TIER80 = 'rgba(27, 29, 20, 0.8)' // --mn-text-meta
const TIER68 = 'rgba(27, 29, 20, 0.68)' // --mn-text-secondary
const SERIF = /Georgia/
const MONO = /PP Neue Montreal Mono/
const WHEAT = 'rgb(255, 239, 174)' // --raw-wheat, the highlight signal
const BURNT = 'rgb(217, 102, 41)' // --raw-burnt-orange, the ONE dated thing
const AREA = { sage: 'rgb(100, 143, 123)', mist: 'rgb(165, 200, 209)', navy: 'rgb(18, 53, 78)' }

const text = (root: ParentNode) => root.querySelector<HTMLElement>('[data-part="text"]')!
const texts = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-part="text"]')]
const atom = (root: ParentNode, kind: string) =>
  root.querySelector<HTMLElement>(`[data-kind="${kind}"]`)!

const meta = {
  title: 'Atoms/PondAtom',
  component: PondAtom,
  parameters: { layout: 'centered' },
  args: { kind: 'text' },
} satisfies Meta<typeof PondAtom>

export default meta
type Story = StoryObj<typeof meta>

/** The full 24-kind × 9-state matrix (unused states fall back to rest). */
function MatrixGrid({ size }: { size?: PondAtomProps['size'] }) {
  return (
    <div className="grid items-center gap-x-mn-4 gap-y-mn-1 overflow-x-auto p-mn-4 [grid-template-columns:auto_repeat(9,minmax(120px,auto))]">
      <span />
      {POND_ATOM_STATES.map((state) => (
        <span key={state} className="font-mono lowercase text-[10.5px] text-mn-text-secondary">
          {state}
        </span>
      ))}
      {POND_ATOM_KINDS.map((kind) => (
        <div key={kind} className="contents">
          <span className="font-mono lowercase text-[10.5px] text-mn-text-secondary">{kind}</span>
          {POND_ATOM_STATES.map((state) => (
            <PondAtom key={state} kind={kind} state={state} size={size} due on />
          ))}
        </div>
      ))}
    </div>
  )
}

export const Matrix: Story = {
  render: () => <MatrixGrid />,
  play: async ({ canvasElement }) => {
    // Every cell of the 216 matrix mounted.
    await expect(canvasElement.querySelectorAll('[data-kind]')).toHaveLength(
      POND_ATOM_KINDS.length * POND_ATOM_STATES.length
    )
  },
}

export const MatrixInk: Story = {
  render: () => <MatrixGrid />,
  decorators: [inkTheme],
}

export const MatrixMobile: Story = {
  render: () => <MatrixGrid size="mobile" />,
  play: async ({ canvasElement }) => {
    // The mobile touch target — board `size=mobile` wrap minHeight 44, and AUDIT X1.
    // Silent on a desktop-sized Storybook canvas, so it is asserted, not eyeballed.
    for (const kind of ['text', 'relation', 'checkbox', 'dot'] as const) {
      await expect(getComputedStyle(atom(canvasElement, kind)).minHeight).toBe('44px')
    }
    // and the marks that grow with it
    await expect(getComputedStyle(atom(canvasElement, 'checkbox').firstElementChild!).width).toBe(
      '18px'
    )
    const glyph = canvasElement.querySelector<HTMLElement>('[data-part="glyph"]')!
    await expect(getComputedStyle(glyph).width).toBe('20px')
    const avatar = canvasElement.querySelector<HTMLElement>('[data-part="avatar"]')!
    await expect(getComputedStyle(avatar).width).toBe('26px')
  },
}

/** Rest-state gallery: every kind at its fixture value, desktop. */
export const Kinds: Story = {
  render: () => (
    <div className="flex max-w-[420px] flex-col items-start gap-mn-2 p-mn-4">
      {POND_ATOM_KINDS.map((kind) => (
        <PondAtom key={kind} kind={kind} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const roots = [...canvasElement.querySelectorAll<HTMLElement>('[data-kind]')]
    await expect(roots.map((r) => r.dataset.kind)).toEqual([...POND_ATOM_KINDS])
    for (const root of roots) await expect(root.dataset.state).toBe('rest')

    // The three mark-only kinds draw a mark and no text.
    for (const kind of ['checkbox', 'icon', 'dot'] as const) {
      await expect(atom(canvasElement, kind).querySelector('[data-part="text"]')).toBeNull()
    }
    // Rest is not editing and not checked: no caret anywhere, no tick in the box.
    await expect(canvasElement.querySelector('[data-part="caret"]')).toBeNull()
    await expect(canvasElement.querySelector('[data-part="check"]')).toBeNull()

    // checkbox box at rest — board `box` 12 / radius 3 / inset 1.4px ink .68.
    const box = canvasElement.querySelector<HTMLElement>('[data-part="box"]')!
    const b = getComputedStyle(box)
    await expect([b.width, b.height, b.borderRadius]).toEqual(['12px', '12px', '3px'])
    // (Tailwind's ring stacks empty shadow layers around the one that paints.)
    await expect(b.boxShadow).toContain(`${TIER68} 0px 0px 0px 1.4px inset`)

    // the kind dot — board `kindDot` 7 / radius 2
    const dot = canvasElement.querySelector<HTMLElement>('[data-part="dot"]')!
    const dotStyle = getComputedStyle(dot)
    await expect([dotStyle.width, dotStyle.height, dotStyle.borderRadius]).toEqual([
      '7px',
      '7px',
      '2px',
    ])

    // divider — board `rule`: a 200px hairline at --mn-line, 12px above and below.
    // (The board writes `height: 0` + a 1px top border; under Tailwind's
    // border-box preflight the used height IS that 1px, which is the hairline.)
    const rule = getComputedStyle(atom(canvasElement, 'divider'))
    await expect([rule.width, rule.height]).toEqual(['200px', '1px'])
    await expect(rule.borderTopWidth).toBe('1px')
    await expect(rule.borderTopColor).toBe('rgba(27, 29, 20, 0.09)')
    await expect([rule.marginTop, rule.marginBottom]).toEqual(['12px', '12px'])

    // person — the avatar is initials of the value, at the board's 20px / 9px.
    const avatar = canvasElement.querySelector<HTMLElement>('[data-part="avatar"]')!
    await expect(avatar.textContent).toBe('CP')
    const a = getComputedStyle(avatar)
    await expect([a.width, a.height, a.fontSize]).toEqual(['20px', '20px', '9px'])
  },
}

/**
 * The three type registers, split by MEDIUM (PROJECT_RULES § Design language).
 * One story for all thirteen typed kinds: the jest suite spent three parametrised
 * blocks asserting class STRINGS, which cannot catch a class that `cn()` drops —
 * exactly the #252 failure. These read the resolved font off the browser.
 */
export const TypeRegisters: Story = {
  render: () => (
    <div className="flex max-w-[460px] flex-col items-start gap-mn-2 p-mn-4">
      {(['prose', 'highlight', 'quote'] as const).map((kind) => (
        <PondAtom key={kind} kind={kind} />
      ))}
      {(['code', 'tag', 'relation', 'file'] as const).map((kind) => (
        <PondAtom key={kind} kind={kind} />
      ))}
      {(['number', 'money', 'percent', 'duration', 'time', 'date'] as const).map((kind) => (
        <PondAtom key={kind} kind={kind} />
      ))}
      <PondAtom kind="eyebrow" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const styleOf = (kind: string) => getComputedStyle(text(atom(canvasElement, kind)))

    // Prose on a page — PP Editorial New at 200. NEVER 400: the board draws this
    // family at 200/800 only, and 400 is the one weight that would look plausible.
    for (const [kind, size] of [
      ['prose', '17.5px'],
      ['highlight', '17.5px'],
      ['quote', '19px'],
    ] as const) {
      const s = styleOf(kind)
      await expect(s.fontFamily).toMatch(SERIF)
      await expect(s.fontWeight).toBe('200')
      await expect(s.fontSize).toBe(size)
    }
    await expect(styleOf('quote').fontStyle).toBe('italic')

    // The machine surface — mono, lowercase, at the board's own sizes. The meta
    // tier (.8) is what holds these at 10.5px; full ink would shout.
    for (const [kind, size, color] of [
      ['code', '12px', INK],
      ['tag', '10.5px', TIER80],
      ['relation', '10.5px', TIER80],
      ['file', '11px', TIER80],
    ] as const) {
      const s = styleOf(kind)
      await expect(s.fontFamily).toMatch(MONO)
      await expect(s.textTransform).toBe('lowercase')
      await expect(s.fontSize).toBe(size)
      await expect(s.color).toBe(color)
    }

    // Numbers read as a column: tabular everywhere, and the board gives the five
    // measured kinds weight 500 — but NOT `date`, which stays 400.
    for (const kind of ['number', 'money', 'percent', 'duration', 'time'] as const) {
      const s = styleOf(kind)
      await expect(s.fontVariantNumeric).toBe('tabular-nums')
      await expect(s.fontWeight).toBe('500')
    }
    await expect(styleOf('date').fontVariantNumeric).toBe('tabular-nums')
    await expect(styleOf('date').fontWeight).toBe('400')

    // The eyebrow is a PAGE label, so it is the sans — 10.5 / 500 / .1em / .68.
    const eyebrow = styleOf('eyebrow')
    await expect(eyebrow.fontFamily).not.toMatch(MONO)
    await expect(eyebrow.fontFamily).not.toMatch(SERIF)
    await expect([eyebrow.fontSize, eyebrow.fontWeight, eyebrow.textTransform]).toEqual([
      '10.5px',
      '500',
      'uppercase',
    ])
    await expect(parseFloat(eyebrow.letterSpacing)).toBeCloseTo(1.05, 2) // .1em of 10.5
    await expect(eyebrow.color).toBe(TIER68)
  },
}

/** Wheat is highlighted passages only, and it ALWAYS carries ink — never a tier. */
export const Highlight: Story = {
  args: { kind: 'highlight' },
  play: async ({ canvasElement }) => {
    const s = getComputedStyle(text(canvasElement))
    await expect(s.backgroundColor).toBe(WHEAT)
    await expect(s.color).toBe(INK)
    await expect(s.padding).toBe('0px 3px') // board `highlight` padding "0 3px"
  },
}

/** The media tile (image / video) — the two kinds that are not inline. */
export const MediaTiles: Story = {
  render: () => (
    <div className="flex items-start gap-mn-3 p-mn-4">
      <PondAtom kind="image" />
      <PondAtom kind="video" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const image = atom(canvasElement, 'image')
    const video = atom(canvasElement, 'video')

    await expect(image.textContent).toBe('image · 4:3')
    await expect(video.textContent).toBe('video · 0:42')

    // Only the video carries the play affordance — board `play` 30px pill.
    await expect(image.querySelector('[data-part="play"]')).toBeNull()
    const play = getComputedStyle(video.querySelector<HTMLElement>('[data-part="play"]')!)
    await expect([play.width, play.height]).toEqual(['30px', '30px'])

    // board `media` 150 × 99, radius 14
    const tile = getComputedStyle(image)
    await expect([tile.width, tile.height, tile.borderRadius]).toEqual(['150px', '99px', '14px'])
    // the caption is machine copy: mono 10.5 at ink .68
    const cap = getComputedStyle(image.lastElementChild!)
    await expect(cap.fontFamily).toMatch(MONO)
    await expect([cap.fontSize, cap.color]).toEqual(['10.5px', TIER68])
  },
}

/**
 * Empty and loading — AUDIT G6. Every placeholder the board writes, in one frame,
 * so a missing state shows up as a missing word rather than a blank inline box.
 */
export const EmptyAndLoading: Story = {
  render: () => (
    <div className="flex max-w-[460px] flex-col items-start gap-mn-2 p-mn-4">
      {(['relation', 'person', 'heading', 'prose', 'link', 'file', 'text'] as const).map((kind) => (
        <PondAtom key={kind} kind={kind} state="empty" />
      ))}
      <div className="flex items-start gap-mn-3">
        <PondAtom kind="image" state="empty" />
        <PondAtom kind="video" state="empty" />
      </div>
      <PondAtom kind="text" state="loading" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const [kind, placeholder] of [
      ['relation', 'link a record'],
      ['person', 'assign someone'],
      ['heading', 'untitled'],
      ['link', 'add a link'],
      ['file', 'attach a file'],
      ['image', 'drop an image'],
      ['video', 'drop a video'],
    ] as const) {
      await expect(atom(canvasElement, kind).textContent).toBe(placeholder)
    }

    // `prose` and `text` have no placeholder of their own — nothing outside the
    // text-block editor renders an empty prose atom, so both fall to the board's
    // generic fallback word "empty" (the text-block editor's own empty-line
    // placeholder is drawn by `text/prose.ts`, not this atom).
    const [emptyProse, emptyText, loadingText] = [
      atom(canvasElement, 'prose'),
      ...canvasElement.querySelectorAll('[data-kind="text"]'),
    ]
    await expect(emptyProse.textContent).toBe('empty')
    await expect(emptyText.textContent).toBe('empty')
    await expect(loadingText.textContent).toBe('…')

    // Both states drop to the .68 tier, and the empty relation loses its › mark.
    for (const el of [emptyText, loadingText]) {
      await expect(getComputedStyle(text(el)).color).toBe(TIER68)
    }
    await expect(canvasElement.querySelector('[data-part="suffix"]')).toBeNull()

    // An empty person is a placeholder, NOT an avatar of the word "assign someone".
    await expect(canvasElement.querySelector('[data-part="avatar"]')).toBeNull()
  },
}

/**
 * The decorative kind marks the board appends to the value. They are `aria-hidden`
 * so a wrapping control's accessible name stays the value — a silent regression
 * otherwise: the chip would read "chickpeas, harissa ›" to a screen reader.
 */
export const Suffixes: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-2 p-mn-4">
      <PondAtom kind="relation" />
      <PondAtom kind="link" />
      <PondAtom kind="file" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const [kind, suffix] of [
      ['relation', ' ›'],
      ['link', ' ↗'],
      ['file', ' · 212 kb'],
    ] as const) {
      const mark = atom(canvasElement, kind).querySelector('[data-part="suffix"]')!
      await expect(mark.textContent).toBe(suffix)
      await expect(mark).toHaveAttribute('aria-hidden')
    }
  },
}

/**
 * `note={false}` — the host's own copy wins. `RelationChip` and `PondMolecule`'s
 * check row both pass it, because the atom's fixture note ("deleted · kept 710")
 * is board copy for the component card, not for a real missing page.
 */
export const ErrorNoteSuppressed: Story = {
  args: { kind: 'relation', state: 'error', value: 'Missing page', note: false },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-part="note"]')).toBeNull()
    // The struck label survives — only the note is the host's business.
    await expect(getComputedStyle(text(canvasElement)).textDecorationLine).toBe('line-through')
  },
}

/**
 * The six heading ranks. Each is a board literal (`level=*` secondary), and the
 * register SWITCHES at 3: 1–2 are the uppercase display face, 3–5 drop to
 * sentence case at 500, and 6 goes back uppercase and letterspaced. Getting a rank
 * wrong is silent — it just reads as a slightly different heading.
 */
export const HeadingLevels: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-2 p-mn-4">
      {([1, 2, 3, 4, 5, 6] as const).map((level) => (
        <PondAtom key={level} kind="heading" level={level} value={`heading ${level}`} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const spans = texts(canvasElement)
    const BOARD = [
      { size: '38px', weight: '700', transform: 'uppercase', leading: 1, track: '-0.38px' },
      { size: '22px', weight: '700', transform: 'uppercase', leading: 1.1, track: '-0.22px' },
      { size: '18px', weight: '500', transform: 'none', leading: 1.3, track: 'normal' },
      { size: '16px', weight: '500', transform: 'none', leading: 1.3, track: 'normal' },
      { size: '13.5px', weight: '500', transform: 'none', leading: 1.4, track: 'normal' },
      { size: '11px', weight: '500', transform: 'uppercase', leading: 1.4, track: '1.1px' },
    ]
    for (const [i, want] of BOARD.entries()) {
      const s = getComputedStyle(spans[i])
      await expect([s.fontSize, s.fontWeight, s.textTransform, s.letterSpacing]).toEqual([
        want.size,
        want.weight,
        want.transform,
        want.track, // -.01em on 1-2, dropped on 3-5, .1em on 6
      ])
      await expect(parseFloat(s.lineHeight) / parseFloat(want.size)).toBeCloseTo(want.leading, 2)
    }
  },
}

/**
 * Leading reaches the DOM at all — the half of #252 that is easy to ship blind.
 * Every one of these `leading-*` classes was written in the source and then dropped
 * by `cn()`, so the text rendered at Tailwind's preflight 1.5 and no test noticed.
 * Asserted in a real browser against the board's own numbers.
 */
export const BoardLeading: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-2 p-mn-4">
      <PondAtom kind="heading" level={2} value="section" />
      <PondAtom kind="prose" value="a paragraph of running prose, set in the serif." />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [heading, prose] = canvasElement.querySelectorAll<HTMLElement>('[data-part="text"]')

    // heading level 2 — board lineHeight 1.1 at 22px
    const h = getComputedStyle(heading)
    await expect(h.fontSize).toBe('22px')
    await expect(parseFloat(h.lineHeight) / 22).toBeCloseTo(1.1, 2)

    // prose — board lineHeight 1.6 at 17.5px. NOT the house --leading-relaxed (1.7):
    // the board's value wins, and this call site had been carrying the wrong token
    // invisibly because the class never applied.
    const p = getComputedStyle(prose)
    await expect(p.fontSize).toBe('17.5px')
    await expect(parseFloat(p.lineHeight) / 17.5).toBeCloseTo(1.6, 2)
  },
}

/** Area colour tints marks ONLY — glyph + dot; ink text never changes. */
export const AreaMarks: Story = {
  render: () => (
    <div className="flex items-center gap-mn-3 p-mn-4">
      {(['ink', 'sage', 'mist', 'navy'] as const).map((color) => (
        <div key={color} className="flex items-center gap-mn-1">
          <PondAtom kind="icon" color={color} />
          <PondAtom kind="dot" color={color} />
          <PondAtom kind="text" color={color} value={color} />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const glyphs = [...canvasElement.querySelectorAll<HTMLElement>('[data-part="glyph"]')]
    const dots = [...canvasElement.querySelectorAll<HTMLElement>('[data-part="dot"]')]

    // ink first, then the three area hues — the mark takes the colour, exactly.
    await expect(getComputedStyle(glyphs[0]).color).toBe(INK)
    for (const [i, color] of (['sage', 'mist', 'navy'] as const).entries()) {
      await expect(getComputedStyle(glyphs[i + 1]).color).toBe(AREA[color])
      await expect(getComputedStyle(dots[i + 1]).backgroundColor).toBe(AREA[color])
    }

    // …and the text never does. Area colour is MARKS ONLY: a tinted label is the
    // divergence that would read as "designed" and quietly break the three ink
    // tiers, so it is asserted on the resolved colour, not on a class name.
    for (const span of texts(canvasElement)) {
      await expect(getComputedStyle(span).color).toBe(INK)
    }
  },
}

/** Dark is the other paper: navy flips to mist because `--mn-area-c` itself flips. */
export const AreaMarksInk: Story = {
  render: () => (
    <div className="flex items-center gap-mn-3 p-mn-4">
      {(['sage', 'mist', 'navy'] as const).map((color) => (
        <PondAtom key={color} kind="dot" color={color} />
      ))}
    </div>
  ),
  decorators: [inkTheme],
  play: async ({ canvasElement }) => {
    const dots = [...canvasElement.querySelectorAll<HTMLElement>('[data-part="dot"]')]
    await expect(dots.map((d) => getComputedStyle(d).backgroundColor)).toEqual([
      AREA.sage,
      AREA.mist,
      AREA.mist, // navy → mist on dark
    ])
  },
}

// ── Interaction-state play stories (the +6) ────────────────────────────────

export const HoverDelta: Story = {
  args: { kind: 'text', state: 'hover' },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('[data-kind="text"]')!
    await expect(root.className).toContain('bg-mn-text/5')
  },
}

export const FocusRing: Story = {
  args: { kind: 'text', state: 'focus' },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('[data-kind="text"]')!
    // The mist ring — mn-area-b stays mist on every theme.
    await expect(root.className).toContain('outline-mn-area-b')
  },
}

export const SelectedFill: Story = {
  args: { kind: 'text', state: 'selected' },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('[data-kind="text"]')!
    await expect(root.className).toContain('bg-mn-hover-fill')
  },
}

export const EditingCaret: Story = {
  args: { kind: 'text', state: 'editing' },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('[data-kind="text"]')!
    await expect(root.className).toContain('ring-mn-text')
    await expect(canvasElement.querySelector('[data-part="caret"]')).toBeInTheDocument()
  },
}

export const CheckboxOn: Story = {
  args: { kind: 'checkbox', on: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-part="check"]')).toBeInTheDocument()
    // A mark-only kind renders no text.
    await expect(canvasElement.querySelector('[data-part="text"]')).not.toBeInTheDocument()
  },
}

export const RelationError: Story = {
  args: { kind: 'relation', state: 'error' },
  play: async ({ canvasElement }) => {
    const text = canvasElement.querySelector('[data-part="text"]')!
    await expect(text.className).toContain('line-through')
    await expect(canvasElement.querySelector('[data-part="note"]')?.textContent).toBe(
      'deleted · kept 710'
    )
  },
}

/**
 * Signal discipline — burnt orange is THE one dated thing per screen, so the atom
 * draws it on `kind="date"` with `due`, and nowhere else. The three negatives are
 * the point: a stray signal is silent (it looks deliberate) and it spends the one
 * loud colour the whole screen has.
 */
export const DateDue: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-mn-2 p-mn-4">
      <PondAtom kind="date" due />
      <PondAtom kind="date" />
      <PondAtom kind="time" due />
      <PondAtom kind="text" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const dots = [...canvasElement.querySelectorAll<HTMLElement>('[data-part="due-dot"]')]
    await expect(dots).toHaveLength(1)

    // board `dueDot`: 7 × 7, radius 2, #D96629 — and it sits on the dated date.
    const s = getComputedStyle(dots[0])
    await expect([s.width, s.height, s.borderRadius]).toEqual(['7px', '7px', '2px'])
    await expect(s.backgroundColor).toBe(BURNT)
    await expect(dots[0].closest('[data-kind]')).toBe(atom(canvasElement, 'date'))

    // No other kind borrows a signal colour — not wheat, not the diff red.
    for (const el of canvasElement.querySelectorAll<HTMLElement>(
      '[data-kind]:not([data-kind="date"]) *, [data-kind="time"], [data-kind="text"]'
    )) {
      const c = getComputedStyle(el)
      await expect([c.backgroundColor, c.color]).not.toContain(BURNT)
      await expect([c.backgroundColor, c.color]).not.toContain(WHEAT)
    }
  },
}

export const DisabledOpacity: Story = {
  args: { kind: 'text', state: 'disabled' },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('[data-kind="text"]')!
    await expect(root.className).toContain('opacity-40')
  },
}
