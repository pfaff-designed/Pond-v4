/**
 * PondAtom (#93) — Pond's one polymorphic inline atom: 24 content kinds × 9
 * states, transcribed from the Make Noise handoff mockup (`PondAtom.dc.html`).
 * Pure presentational — no handlers, no hooks; interactive hosts (chips, cells,
 * pickers) wrap it and pass the state they are in.
 *
 * Every colour resolves through the Make Noise role tokens (`--color-mn-*` /
 * `--color-raw-*`): none of the retired Press vocabulary, no literal hex.
 * Theme is AMBIENT — the atom
 * reads the current role values, so it is correct under `.dark` and all eight
 * themes with no theme prop (the navy area mark flips to mist on dark because
 * `--mn-area-c` itself flips; see globals.css).
 *
 * Type registers per PROJECT_RULES: prose/highlight/quote = PP Editorial New
 * at weight 200 (never 400); code/tag/relation/file = PP Neue Montreal Mono,
 * lowercase; everything else = PP Neue Montreal. Numeric kinds read tabular.
 * Area colour tints MARKS only — the icon glyph and the dot — never text or
 * ground. The dot's own recipe lives here too (`KindDot`), so the bare mark the
 * rail, cards and kicker carry and the atom's `dot` kind can never drift apart.
 */

import { cn } from '@/lib/utils'

export const POND_ATOM_KINDS = [
  'heading',
  'eyebrow',
  'prose',
  'highlight',
  'quote',
  'code',
  'link',
  'text',
  'number',
  'money',
  'percent',
  'date',
  'time',
  'duration',
  'tag',
  'checkbox',
  'relation',
  'person',
  'file',
  'image',
  'video',
  'icon',
  'dot',
  'divider',
] as const

export const POND_ATOM_STATES = [
  'rest',
  'hover',
  'selected',
  'focus',
  'editing',
  'empty',
  'loading',
  'error',
  'disabled',
] as const

export type PondAtomKind = (typeof POND_ATOM_KINDS)[number]
export type PondAtomState = (typeof POND_ATOM_STATES)[number]

export interface PondAtomProps {
  kind: PondAtomKind
  /** @default 'rest' — kinds that ignore a state fall back to rest. */
  state?: PondAtomState
  /** Heading rank (kind="heading" only). @default 1 */
  level?: 1 | 2 | 3 | 4 | 5 | 6
  /** Touch target: desktop 26px min-height, mobile 44px. @default 'desktop' */
  size?: 'desktop' | 'mobile'
  /** The display value; each kind falls back to its mockup fixture. */
  value?: string
  /** kind="icon" — the glyph-mask name (area/page mark register). */
  glyph?: string
  /** Area colour — tints MARKS ONLY (icon glyph + dot), never text/ground. */
  color?: 'ink' | 'sage' | 'mist' | 'navy'
  /** kind="date" — the one dated thing: a burnt-orange dot. */
  due?: boolean
  /** kind="checkbox" — checked. */
  on?: boolean
  /** Show the error note (state="error"). @default true */
  note?: boolean
  className?: string
}

/* ── Mockup fixture + copy tables (PondAtom.dc.html) ─────────────────────── */

const DEFAULTS: Record<PondAtomKind, string> = {
  heading: 'kitchen renovation',
  eyebrow: 'ingredients',
  prose: 'Three quotes in. The worktop can wait.',
  highlight: 'the worktop can wait',
  quote: 'Needs more salt than you think.',
  code: 'recipe.kcal',
  link: 'open in sheets',
  text: 'chickpeas, soaked',
  number: '1,040',
  money: '£4,280',
  percent: '78%',
  date: '19 sep',
  time: '07:12',
  duration: '25m',
  tag: 'recipe',
  checkbox: '',
  relation: 'chickpeas, harissa',
  person: 'Charles Pfaff',
  file: 'quote-hartley.pdf',
  image: 'image',
  video: 'video',
  icon: '',
  dot: '',
  divider: '',
}

const EMPTY_PLACEHOLDER: Partial<Record<PondAtomKind, string>> = {
  relation: 'link a record',
  person: 'assign someone',
  heading: 'untitled',
  prose: 'write something',
  link: 'add a link',
  file: 'attach a file',
}

const ERROR_NOTE: Partial<Record<PondAtomKind, string>> = {
  relation: 'deleted · kept 710',
  date: 'not a date',
  time: 'not a time',
  link: 'can’t reach this',
  file: 'upload failed',
  person: 'no longer in this space',
}

/** Media-tile caption per state (image/video). */
const MEDIA_CAPTION: Record<PondAtomState, (video: boolean) => string> = {
  rest: (v) => (v ? 'video · 0:42' : 'image · 4:3'),
  hover: () => 'replace',
  selected: (v) => (v ? 'video · 0:42' : 'image · 4:3'),
  focus: () => 'image · 4:3',
  editing: () => 'crop',
  empty: (v) => (v ? 'drop a video' : 'drop an image'),
  loading: () => 'uploading 62%',
  error: () => 'couldn’t load',
  disabled: () => 'image · 4:3',
}

const NUMERIC: readonly PondAtomKind[] = ['number', 'money', 'percent', 'duration', 'time']
const CHIP: readonly PondAtomKind[] = ['relation', 'tag']
const MARK_ONLY: readonly PondAtomKind[] = ['checkbox', 'icon', 'dot']

/** Area marks resolve through the mn-area roles so dark flips navy→mist. */
const AREA_TEXT = { sage: 'text-mn-area-a', mist: 'text-mn-area-b', navy: 'text-mn-area-c' }
const AREA_BG = { sage: 'bg-mn-area-a', mist: 'bg-mn-area-b', navy: 'bg-mn-area-c' }

/** The mist focus ring (mn-area-b stays mist on every theme). */
const FOCUS_RING = 'outline-2 outline-offset-2 outline-mn-area-b'

/** Ink-on-ground pairing for filled marks (checkbox tick, avatar, play). */
const INVERSE_INK = 'bg-mn-text text-raw-paper dark:text-raw-ink'

export interface KindDotProps {
  /** Raw area accent (hex or `var(--mn-area-*)`); paints the dot and drops the muted class. */
  accent?: string
  className?: string
}

/**
 * The page-kind MARK (#91) — a 7×7px, 2px-radius square in muted ink or an area
 * accent. Pond codes page kinds with a shape and a colour where another system
 * would reach for a symbol (handoff readme §3); area glyphs are the other register
 * (`Icon`), and the two never mix.
 *
 * ONE definition, two wearers. `PondAtom kind="dot"` renders it inside the inline
 * chrome `PondAtom.dc.html` gives every inline kind (26px min-height, 6px side
 * padding). The surfaces that carry the BARE mark — rail rows, list rows and cards
 * through `PondMolecule`, the breadcrumb's mark button, the overview kicker — render
 * it directly, because their own boards draw a 7px square flush in the row, not an
 * atom in its padding. Folding those onto the full atom would push every rail label
 * 12px right.
 *
 * Colour rule: an `accent` applies as an inline background and REPLACES the muted
 * class — marks only, never text or ground. Variant classes (a selected
 * `bg-mn-text`, an area role `bg-mn-area-a`, a smaller `size-1.5`) merge through
 * `className`; tailwind-merge collapses the conflicting default.
 */
export function KindDot({ accent, className }: KindDotProps) {
  return (
    <span
      data-part="dot"
      aria-hidden="true"
      className={cn(
        'inline-block size-[7px] flex-none rounded-mn-hair',
        !accent && 'bg-mn-text/50',
        className
      )}
      style={accent ? { background: accent } : undefined}
    />
  )
}

/** Per-kind text-register classes; sizes come straight off the mockup. */
function kindRegister(kind: PondAtomKind, level: number, mobile: boolean, hover: boolean): string {
  switch (kind) {
    case 'heading':
      return [
        'font-bold uppercase tracking-[-0.01em] leading-none',
        mobile ? 'text-[30px]' : 'text-[38px]',
        level === 2 && cn('leading-tight', mobile ? 'text-[20px]' : 'text-mn-22'),
        level === 3 && cn('normal-case font-medium tracking-normal leading-snug', mobile ? 'text-[15px]' : 'text-mn-18'),
        level === 4 && cn('normal-case font-medium tracking-normal leading-snug', mobile ? 'text-[15px]' : 'text-mn-16'),
        level === 5 && 'normal-case font-medium tracking-normal leading-[1.4] text-[13.5px]',
        level === 6 && 'font-medium tracking-wider leading-[1.4] text-mn-11',
      ]
        .filter(Boolean)
        .join(' ')
    case 'eyebrow':
      return 'text-[10.5px] font-medium uppercase tracking-wider text-mn-text-secondary'
    case 'prose':
      return cn('font-serif font-extralight leading-relaxed', mobile ? 'text-[17px]' : 'text-[17.5px]')
    case 'highlight':
      return cn(
        'font-serif font-extralight px-[3px] bg-mn-signal-highlight text-mn-signal-highlight-ink',
        mobile ? 'text-[17px]' : 'text-[17.5px]'
      )
    case 'quote':
      return cn(
        'font-serif font-extralight italic tracking-[-0.01em]',
        mobile ? 'text-mn-18' : 'text-[19px]'
      )
    case 'code':
      return cn(
        'font-mono lowercase rounded-mn-chrome bg-mn-text/5 px-1.5 py-0.5 text-mn-text',
        mobile ? 'text-mn-13' : 'text-[12px]'
      )
    case 'link':
      return cn(
        'underline decoration-mn-text/30 underline-offset-[3px]',
        hover && 'opacity-75'
      )
    case 'file':
      return cn(
        'font-mono lowercase text-mn-text-meta',
        mobile ? 'text-[12px]' : 'text-mn-11'
      )
    default:
      return ''
  }
}

export function PondAtom({
  kind,
  state = 'rest',
  level = 1,
  size = 'desktop',
  value,
  glyph = 'heart',
  color = 'ink',
  due = false,
  on = false,
  note = true,
  className,
}: PondAtomProps) {
  const mobile = size === 'mobile'
  const hover = state === 'hover'
  const selected = state === 'selected'
  const focus = state === 'focus'
  const editing = state === 'editing'
  const empty = state === 'empty'
  const loading = state === 'loading'
  const error = state === 'error'
  const disabled = state === 'disabled'

  /* ── divider: a hairline rule ── */
  if (kind === 'divider') {
    return (
      <span
        data-kind="divider"
        data-state={state}
        role="separator"
        className={cn(
          'my-3 block h-0 border-t border-mn-line',
          mobile ? 'w-[280px]' : 'w-[200px]',
          className
        )}
      />
    )
  }

  /* ── image / video: the media tile ── */
  if (kind === 'image' || kind === 'video') {
    const video = kind === 'video'
    return (
      <span
        data-kind={kind}
        data-state={state}
        className={cn(
          'relative box-border flex flex-col items-center justify-center gap-1.5 rounded-mn-inner',
          mobile ? 'h-[106px] w-40' : 'h-[99px] w-[150px]',
          empty ? 'ring-[1.4px] ring-inset ring-mn-text/20' : 'bg-mn-hover-fill',
          (selected || editing) && 'ring-2 ring-mn-text',
          focus && FOCUS_RING,
          disabled && 'opacity-40',
          className
        )}
      >
        {video && !empty && (
          <span
            data-part="play"
            aria-hidden
            className={cn(
              'box-border flex size-[30px] items-center justify-center rounded-mn-pill pl-0.5',
              INVERSE_INK
            )}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" stroke="none">
              <path d="M3.5 2.2v7.6L9.8 6z" />
            </svg>
          </span>
        )}
        <span className="whitespace-nowrap font-mono lowercase text-[10.5px] text-mn-text-secondary">
          {MEDIA_CAPTION[state](video)}
        </span>
      </span>
    )
  }

  /* ── inline kinds ── */
  const chip = CHIP.includes(kind)
  const numeric = NUMERIC.includes(kind)
  const showText = !MARK_ONLY.includes(kind)
  const raw = value ?? DEFAULTS[kind]
  const display = empty ? (EMPTY_PLACEHOLDER[kind] ?? 'empty') : loading ? '…' : raw

  // Decorative kind marks appended after the value — aria-hidden so the
  // accessible name of a wrapping control stays the value itself.
  const suffix =
    !empty && !loading
      ? kind === 'relation' && !error
        ? ' ›'
        : kind === 'link'
          ? ' ↗'
          : kind === 'file'
            ? ' · 212 kb'
            : null
      : null

  const noteText = error && note ? (ERROR_NOTE[kind] ?? (numeric ? 'not a number' : 'too long')) : null

  const areaText = color !== 'ink' ? AREA_TEXT[color] : null
  const areaBg = color !== 'ink' ? AREA_BG[color] : null

  const checked = kind === 'checkbox' && (on || selected)
  const initials = raw
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <span
      data-kind={kind}
      data-state={state}
      className={cn(
        'box-border inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-mn-chrome text-mn-text',
        mobile ? 'min-h-11' : 'min-h-[26px]',
        chip ? 'px-[2px]' : 'px-1.5',
        selected && 'bg-mn-hover-fill',
        hover && kind !== 'link' && 'bg-mn-text/5',
        editing && 'ring-[1.4px] ring-inset ring-mn-text',
        focus && FOCUS_RING,
        disabled && 'opacity-40',
        className
      )}
    >
      {kind === 'date' && due && (
        <span
          data-part="due-dot"
          aria-hidden
          className="size-[7px] flex-none rounded-mn-hair bg-mn-signal-dated"
        />
      )}

      {kind === 'person' && !empty && (
        <span
          data-part="avatar"
          aria-hidden
          className={cn(
            'flex flex-none items-center justify-center rounded-mn-pill font-medium',
            mobile ? 'size-[26px] text-mn-11' : 'size-5 text-[9px]',
            INVERSE_INK
          )}
        >
          {initials}
        </span>
      )}

      {kind === 'file' && (
        <svg
          aria-hidden
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-none"
        >
          <path d="M3 1.5h4l2.5 2.5v6.5H3z" />
          <path d="M7 1.5V4h2.5" />
        </svg>
      )}

      {kind === 'checkbox' && (
        <span
          data-part="box"
          className={cn(
            'flex flex-none items-center justify-center rounded-[3px]',
            mobile ? 'size-[18px]' : 'size-3',
            checked ? INVERSE_INK : 'ring-[1.4px] ring-inset ring-mn-text-secondary'
          )}
        >
          {checked && (
            <svg
              data-part="check"
              width="8"
              height="8"
              viewBox="0 0 9 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1.8 4.8 3.7 6.6 7.2 2.4" />
            </svg>
          )}
        </span>
      )}

      {kind === 'icon' && (
        <span
          data-part="glyph"
          data-icon={glyph}
          aria-hidden
          className={cn(
            'flex-none bg-current',
            mobile ? 'size-5' : 'size-4',
            areaText ?? (empty ? 'text-mn-text/30' : 'text-mn-text')
          )}
        />
      )}

      {kind === 'dot' && <KindDot className={areaBg ?? (selected ? 'bg-mn-text' : undefined)} />}

      {showText && (
        <span
          data-part="text"
          className={cn(
            'block min-w-0 max-w-full truncate tabular-nums',
            mobile ? 'text-[15px]' : 'text-[13.5px]',
            numeric && 'font-medium',
            chip &&
              cn(
                'font-mono lowercase rounded-mn-pill text-mn-text-meta',
                mobile ? 'px-[11px] py-[5px] text-[12px]' : 'px-[9px] py-[3px] text-[10.5px]',
                empty || error
                  ? 'ring-[1px] ring-inset ring-mn-text/20'
                  : 'bg-mn-hover-fill'
              ),
            kindRegister(kind, level, mobile, hover),
            (empty || loading) &&
              cn('text-mn-text-secondary', kind === 'highlight' && 'bg-transparent'),
            error && kind === 'relation' && 'text-mn-text-secondary line-through'
          )}
        >
          {display}
          {suffix && (
            <span data-part="suffix" aria-hidden>
              {suffix}
            </span>
          )}
        </span>
      )}

      {editing && (
        <span
          data-part="caret"
          aria-hidden
          className="-ml-1 inline-block h-[1em] w-[1.5px] flex-none bg-mn-text"
        />
      )}

      {noteText && (
        <span
          data-part="note"
          className="whitespace-nowrap font-mono lowercase text-[10.5px] text-mn-text-secondary"
        >
          {noteText}
        </span>
      )}
    </span>
  )
}
