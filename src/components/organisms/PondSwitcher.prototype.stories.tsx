import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'

import { Icon } from '@/components/atoms/Icon'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { RAIL_WIDTH_PX } from '@/lib/layout/rail-width'

/**
 * PROTOTYPE — #319, the switcher in the rail header (M3 / multi-pond, map #312).
 *
 * Throwaway. Nothing here is imported by the app, `Rail.tsx` is untouched, and no
 * decision is recorded by it. The point is a concrete thing to react to.
 *
 * Every literal is read inline from `wayfinder/design_handoff_pond/PondRail.dc.html`
 * `renderVals()` (state `switcher`) — the component `Pond 06.13` s6m1 `dc-import`s —
 * except the three places called out as INVENTED below, which the board does not draw.
 *
 *   switcher   flex · gap 7 · padding 4px 6px · margin -4px -6px · radius 8
 *              ground when open: ink .07
 *   pondMark   13 × 13 mask glyph over currentColor
 *   word       500 · 13.5 · truncate            ← conflicts with the SHIPPED head, see below
 *   swChev     9 × 9 · stroke 1.4 · ink .68 · closed rotate(90) · open rotate(-90)
 *   menu       absolute · top 44 · left/right 10 · z 5 · column · gap 1 · padding 6 ·
 *              radius 16 · glass
 *   menuHead   padding 6px 10px 4px · 10.5 · 500 · .1em · uppercase · ink .68
 *   pond row   flex · gap 9 · padding 7px 10px · radius 10 · 13 ·
 *              current: 500 + ink .07 ground + '✓' at full ink; others 400 + ⌘n at ink .68
 *   menuRule   1px ink .09 · margin 4px 8px
 *   menuRow    flex · gap 9 · padding 7px 10px · radius 10 · 13 · ink .8
 *   gap12      12px spacer where a row has no glyph
 *
 * THE CONFLICT THE USER MUST SETTLE (see `HeadTreatmentConflict`): the shipped rail
 * head is sans 500 / 11 / .14em / UPPERCASE with NO mark (`Rail.tsx:834`, from
 * `Pond 05 Shell`, which draws it that way in all 18 frames). `PondRail.dc.html` and
 * `AUDIT.md` C3 ("show the pond name **and glyph** with the switcher chevron") say
 * mark + lowercase 13.5. The chevron cannot be added without choosing one.
 */

// ── fixtures ────────────────────────────────────────────────────────────────

interface ProtoPond {
  id: string
  name: string
  /** A `public/icons/<name>.png` silhouette. */
  glyph: string
  /** The board's ⌘1–⌘3. */
  key: string
  archived?: boolean
}

/** The board's own three: `PONDS` in `PondRail.dc.html`. */
const THREE: ProtoPond[] = [
  { id: 'life', name: 'life', glyph: 'waves-02', key: '⌘1' },
  { id: 'noise', name: 'make noise', glyph: 'lightning-03', key: '⌘2' },
  { id: 'red', name: 'red door guys', glyph: 'house', key: '⌘3' },
]

/** What a person has on day one — the state the board never draws (AUDIT G6 p2). */
const ONE: ProtoPond[] = [THREE[0]]

/** A fourth pond, archived. AUDIT 6m: archive "leaves the switcher". */
const WITH_ARCHIVED: ProtoPond[] = [
  ...THREE,
  { id: 'old', name: 'old studio', glyph: 'star-01', key: '⌘4', archived: true },
]

// ── parts ───────────────────────────────────────────────────────────────────

/** The board's switcher chevron. `Rail.tsx:114`'s `Chevron` is module-local, so copied. */
function SwitcherChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 9 9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`flex-none text-mn-text-secondary transition-transform duration-[var(--motion-settle)] ease-[var(--ease-mn)] ${
        open ? '-rotate-90' : 'rotate-90'
      }`}
    >
      <path d="M3.5 2 L7 5 L3.5 8" />
    </svg>
  )
}

/** The board's `menuRow` plus glyph — 12 × 12, stroke 1.4, round caps. */
function Plus() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden
      className="flex-none"
    >
      <path d="M6 2.4v7.2M2.4 6h7.2" />
    </svg>
  )
}

type HeadTreatment = 'shipped' | 'board'

function Head({
  pond,
  treatment,
  chevron,
  open,
}: {
  pond: ProtoPond
  treatment: HeadTreatment
  chevron: boolean
  open: boolean
}) {
  return (
    <div data-part="rail-head" className="flex items-center justify-between gap-2 px-4 pb-3">
      <span
        data-part="pond-switcher"
        className={`-mx-[6px] -my-[4px] flex min-w-0 items-center gap-[7px] rounded-[8px] px-[6px] py-[4px] select-none ${
          open ? 'bg-mn-text/[0.07]' : 'bg-transparent'
        }`}
      >
        {treatment === 'board' && <Icon name={pond.glyph} size={13} />}
        <span
          className={
            treatment === 'board'
              ? 'min-w-0 truncate text-[13.5px] leading-[normal] font-medium'
              : 'text-mn-11 min-w-0 truncate leading-[normal] font-medium tracking-[0.14em] uppercase'
          }
        >
          {pond.name}
        </span>
        {chevron && <SwitcherChevron open={open} />}
      </span>
    </div>
  )
}

function PondRow({ pond, current }: { pond: ProtoPond; current: boolean }) {
  return (
    <div
      className={`flex items-center gap-[9px] rounded-[10px] px-[10px] py-[7px] text-[13px] ${
        current ? 'bg-mn-text/[0.07] font-medium' : 'bg-transparent font-normal'
      } leading-[normal]`}
    >
      <Icon name={pond.glyph} size={13} />
      <span className="min-w-0 flex-1 truncate">{pond.name}</span>
      <span
        className={`font-mono text-[10.5px] ${current ? 'text-mn-text' : 'text-mn-text-secondary'}`}
      >
        {current ? '✓' : pond.key}
      </span>
    </div>
  )
}

/**
 * The open list, at the board's own radius 16 / padding 6.
 *
 * Glass is written out per theme rather than taken from `.mn-glass`. ADR 0004
 * ruling 11 says light is not in conflict; it IS. `PondRail.dc.html`'s `menu`
 * gives light `rgba(255,255,255,.92 → .76)` with `inset 0 1px 0 rgba(255,255,255,.7)`
 * and a `.16` shadow, where the token is `.86 → .64` with `.14`. Dark matches the
 * token, so only light diverged. **Ruling 11 needs amending before this ships.**
 *
 * The board's menu also carries `shared ponds` and `shared with me` sections.
 * Both are out of scope on #312 (solo multi-pond), so they are omitted here.
 */
function SwitcherMenu({
  ponds,
  currentId,
  highlight,
  archivedNote,
}: {
  ponds: ProtoPond[]
  currentId: string
  /** INVENTED: no board frame draws a hovered switcher row. */
  highlight?: 'new-pond'
  /** INVENTED: the board gives the switcher no archived affordance at all. */
  archivedNote?: boolean
}) {
  const archived = ponds.filter((p) => p.archived).length
  return (
    <div
      role="menu"
      aria-label="Ponds"
      className="absolute top-[44px] right-[10px] left-[10px] z-[5] flex flex-col gap-[1px] rounded-[16px] border border-white/90 bg-[linear-gradient(160deg,rgba(255,255,255,.92),rgba(255,255,255,.76))] p-[6px] text-mn-text shadow-[inset_0_1px_0_rgba(255,255,255,.7),0_20px_54px_rgba(40,34,24,.16)] backdrop-blur-[24px] backdrop-saturate-[1.3] dark:border-[rgba(250,249,239,.09)] dark:bg-[linear-gradient(160deg,rgba(74,73,64,.96),rgba(74,73,64,.86))] dark:shadow-[0_20px_54px_rgba(0,0,0,.45)]"
    >
      <div className={`${pageEyebrowClass} px-[10px] pt-[6px] pb-[4px] leading-[normal]`}>
        ponds
      </div>
      {ponds
        .filter((p) => !p.archived)
        .map((p) => (
          <PondRow key={p.id} pond={p} current={p.id === currentId} />
        ))}
      <div className="mx-[8px] my-[4px] h-px bg-mn-text/[0.09]" />
      <div
        className={`flex items-center gap-[9px] rounded-[10px] px-[10px] py-[7px] text-[13px] text-mn-text-meta ${
          highlight === 'new-pond' ? 'bg-mn-text/[0.07]' : ''
        } leading-[normal]`}
      >
        <Plus />
        <span className="min-w-0 flex-1 truncate">new pond</span>
      </div>
      <div className="flex items-center gap-[9px] rounded-[10px] px-[10px] py-[7px] text-[13px] leading-[normal] text-mn-text-meta">
        <span className="w-[12px] flex-none" />
        <span className="min-w-0 flex-1 truncate">manage ponds</span>
      </div>
      {archivedNote && archived > 0 && (
        <div className="px-[10px] pt-[2px] pb-[4px] font-mono text-[10.5px] text-mn-text-secondary">
          archived · {archived}
        </div>
      )}
    </div>
  )
}

/**
 * Enough rail to read the header in context — the board's rest rows and foot at
 * their own values. Not the real `RailView`: this is a frame, not a tree.
 */
function RailStub() {
  const rows: Array<[number, string, boolean]> = [
    [0, 'life', true],
    [1, 'personal', true],
    [1, 'health', true],
    [2, 'workouts', false],
    [2, 'sleep', false],
    [1, 'creativity', true],
  ]
  return (
    <>
      <div className="min-h-0 flex-1 overflow-hidden">
        {rows.map(([depth, label, area]) => (
          <div
            key={label}
            className={`mx-[8px] flex items-center gap-[7px] rounded-[10px] py-[5px] pr-[8px] pl-[4px] ${
              area ? 'text-[13.5px] font-medium text-mn-text' : 'text-[13px] text-mn-text-secondary'
            }`}
            style={{ paddingLeft: 4 + depth * 14 }}
          >
            <span className="h-[7px] w-[7px] flex-none rounded-[2px] bg-mn-text/50" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-[2px] border-t border-mn-text/[0.09] px-[8px] pt-[10px]">
        <div className="rounded-[10px] px-[8px] py-[6px] text-[13.5px] font-medium">databases</div>
        <div className="px-[8px] py-[6px] text-[12.5px] text-mn-text-secondary">＋ new page</div>
      </div>
    </>
  )
}

// ── the prototype ───────────────────────────────────────────────────────────

interface PondSwitcherProtoProps {
  ponds: ProtoPond[]
  currentId: string
  /** The list is open. The board's s6m1 is this state. */
  open?: boolean
  /** Whether the head carries a chevron at all. */
  chevron?: boolean
  treatment?: HeadTreatment
  highlight?: 'new-pond'
  archivedNote?: boolean
  caption?: string
}

function PondSwitcherProto({
  ponds,
  currentId,
  open = false,
  chevron = true,
  treatment = 'board',
  highlight,
  archivedNote,
  caption,
}: PondSwitcherProtoProps) {
  const current = ponds.find((p) => p.id === currentId) ?? ponds[0]
  return (
    <div className="flex flex-col gap-[10px]">
      <div
        className="rounded-mn-card bg-mn-card shadow-mn-card relative flex h-[380px] flex-col overflow-visible pt-[18px] pb-[14px] font-sans text-mn-text"
        style={{ width: RAIL_WIDTH_PX }}
      >
        <Head pond={current} treatment={treatment} chevron={chevron} open={open} />
        <RailStub />
        {open && (
          <SwitcherMenu
            ponds={ponds}
            currentId={currentId}
            highlight={highlight}
            archivedNote={archivedNote}
          />
        )}
      </div>
      {caption && (
        <p
          className="max-w-[206px] font-mono text-[10.5px] leading-[1.55] text-mn-text-secondary"
          style={{ width: RAIL_WIDTH_PX }}
        >
          {caption}
        </p>
      )}
    </div>
  )
}

// ── stories ─────────────────────────────────────────────────────────────────

const ink: Decorator = (Story) => (
  <div className="dark bg-raw-ink rounded-mn-card p-mn-6">
    <Story />
  </div>
)

const paper: Decorator = (Story) => (
  <div className="bg-mn-surface rounded-mn-card p-mn-6">
    <Story />
  </div>
)

const meta = {
  title: 'Prototypes/PondSwitcher (#319)',
  component: PondSwitcherProto,
  parameters: { layout: 'centered' },
  decorators: [paper],
  args: { ponds: THREE, currentId: 'life' },
} satisfies Meta<typeof PondSwitcherProto>

export default meta
type Story = StoryObj<typeof meta>

/** What ships today: `Rail.tsx`'s head — uppercase 11, no mark, no chevron. */
export const OnePondToday: Story = {
  args: {
    ponds: ONE,
    currentId: 'life',
    treatment: 'shipped',
    chevron: false,
    caption: 'today — Rail.tsx:834. sans 500 / 11 / .14em / uppercase, no mark, no chevron.',
  },
}

/** INVENTED: the board never draws a switcher with one pond (AUDIT G6 p2 flags it). */
export const OnePondWithSwitcher: Story = {
  args: {
    ponds: ONE,
    currentId: 'life',
    caption: 'INVENTED — one pond, chevron still shown. the board draws no one-pond switcher.',
  },
}

/** Three ponds, at rest, in the board's head treatment. */
export const ThreePondsAtRest: Story = {
  args: { caption: 'board treatment — 13 mask glyph + lowercase 13.5 + chevron (AUDIT C3).' },
}

/** s6m1 itself: the list open, the current pond marked. */
export const OpenList: Story = {
  args: {
    open: true,
    caption: 'the current pond takes the ink .07 ground, 500 weight, and a ✓ WHERE ITS ⌘1 WAS.',
  },
}

/** Where `new pond` sits: under a rule, above `manage ponds`. */
export const WhereNewPondSits: Story = {
  args: {
    open: true,
    highlight: 'new-pond',
    caption: 'ponds · rule · new pond · manage ponds. the hover ground is INVENTED.',
  },
}

export const OpenListDark: Story = {
  args: { open: true, caption: 'dark — ground #1B1D14, card #30312A, glass via .mn-glass.' },
  decorators: [ink],
}

export const ThreePondsAtRestDark: Story = {
  args: { caption: 'dark, at rest.' },
  decorators: [ink],
}

/** Both themes at once, so the pair can be read in one glance. */
export const BothThemes: Story = {
  args: { open: true },
  decorators: [],
  render: (args) => (
    <div className="flex items-start gap-6">
      <div className="bg-mn-surface rounded-mn-card p-mn-6">
        <PondSwitcherProto {...args} caption="light — one paper #FAF9EF, ground and card." />
      </div>
      <div className="dark bg-raw-ink rounded-mn-card p-mn-6">
        <PondSwitcherProto {...args} caption="dark — two papers, #1B1D14 and #30312A." />
      </div>
    </div>
  ),
}

/**
 * Archived: the board says an archived pond "leaves the switcher" and gives it no
 * affordance there. Two readings, both invented past that sentence.
 */
export const ArchivedPonds: Story = {
  args: { open: true },
  decorators: [paper],
  render: (args) => (
    <div className="flex items-start gap-6">
      <PondSwitcherProto
        {...args}
        ponds={WITH_ARCHIVED}
        caption="A — simply absent. four ponds exist, three are listed, nothing says so."
      />
      <PondSwitcherProto
        {...args}
        ponds={WITH_ARCHIVED}
        archivedNote
        caption="B — INVENTED: a mono count under the rows, echoing s6m7's 'archived · none'."
      />
    </div>
  ),
}

/**
 * The conflict. Left is what ships (`Pond 05 Shell`, 18 frames); right is what
 * `PondRail.dc.html` and AUDIT C3 say. The chevron needs one of them chosen.
 */
export const HeadTreatmentConflict: Story = {
  args: {},
  decorators: [paper],
  render: (args) => (
    <div className="flex items-start gap-6">
      <PondSwitcherProto
        {...args}
        treatment="shipped"
        caption="SHIPPED — Pond 05 Shell: 11 / .14em / uppercase, no mark. chevron bolted on."
      />
      <PondSwitcherProto
        {...args}
        treatment="board"
        caption="BOARD — PondRail + AUDIT C3: 13 glyph, lowercase 13.5, chevron."
      />
    </div>
  ),
}
