/**
 * PondMolecule (#95) — Pond's one polymorphic presentational molecule: 11
 * content kinds × 10 states, transcribed from the Make Noise handoff mockup
 * (`PondMolecule.dc.html`). The molecule-layer sequel to PondAtom (#93): where
 * the atom is a single inline value, a molecule is one *composed line or card*
 * — a list row, a table row, a record card, a journal entry, a field row, a
 * notice, a provenance chip, a diff line, a reminder, a task card.
 *
 * Pure presentational — no handlers, no hooks. Interactive hosts (the rail's
 * treeitem, an overview card's button, a kanban cell) wrap it and pass the
 * state they are in; the `leading` / `trailing` slots let a host dock its own
 * affordances (a caret, hover-CRUD, an open button) without the molecule ever
 * owning behaviour.
 *
 * Every colour resolves through the Make Noise role tokens (`--color-mn-*` /
 * `--color-raw-*` / the `card` surface role): none of the retired Press
 * vocabulary, no literal hex. Theme is AMBIENT — correct under `.dark` and all
 * eight themes with no theme prop.
 *
 * Colour roles hold their one job each: area colour tints MARKS only (the
 * list-row/task-card dot), the reminder due-dot is the burnt-orange dated
 * signal, red appears only on diff-line removals. Type registers per
 * PROJECT_RULES: the entry body is PP Editorial New at 200 (never 400);
 * provenance / notice / diff-line are the mono machine surface, lowercase;
 * numerals read tabular. Dragging honours `prefers-reduced-motion` (the lift's
 * tilt collapses under `motion-reduce`).
 *
 * Absorptions (#95): TreeRow → `list-row` (the rail's treeitem host lives in
 * Rail.tsx and docks its caret/CRUD through the slots), OverviewCard →
 * `record-card` in stat mode (`stat`/`sub` swap the media tile for the focal
 * numeral), RelationValue stays a thin functional delegator (see its header).
 */

import type { ReactNode } from 'react'
import { PondAtom, type PondAtomKind, type PondAtomState } from '@/components/atoms/PondAtom'
import { KindDot } from '@/components/atoms/KindDot'
import { cn } from '@/lib/utils'

export const POND_MOLECULE_KINDS = [
  'list-row',
  'check-row',
  'table-row',
  'record-card',
  'entry',
  'field-row',
  'notice',
  'provenance',
  'diff-line',
  'reminder',
  'task-card',
] as const

export const POND_MOLECULE_STATES = [
  'rest',
  'hover',
  'selected',
  'focus',
  'editing',
  'dragging',
  'empty',
  'loading',
  'error',
  'disabled',
] as const

export type PondMoleculeKind = (typeof POND_MOLECULE_KINDS)[number]
export type PondMoleculeState = (typeof POND_MOLECULE_STATES)[number]

export interface PondMoleculeProps {
  kind: PondMoleculeKind
  /** @default 'rest' — kinds that ignore a state fall back to rest. */
  state?: PondMoleculeState
  /** Touch target: mobile rows breathe to ≥48px. @default 'desktop' */
  size?: 'desktop' | 'mobile'
  /** The main line; each kind falls back to its mockup fixture. */
  title?: string
  /** The quiet mono meta (a date, a context line). `''` suppresses it. */
  meta?: string
  /** table-row numeral / field-row value / task-card steps caption. */
  value?: string
  /** field-row — the uppercase label. */
  label?: string
  /** field-row — the atom kind rendering the value. @default 'number' */
  valueKind?: PondAtomKind
  /** table-row — the middle quantity cell. */
  qty?: string
  /** record-card (mockup mode) — the tag chip. */
  tag?: string
  /** notice — the offered action's label; `''` renders none. */
  action?: string
  /** diff-line — an addition or the red-struck removal. @default 'add' */
  variant?: 'add' | 'remove'
  /** Area colour — tints MARKS ONLY (the dot), never text/ground. */
  color?: 'ink' | 'sage' | 'mist' | 'navy'
  /** A raw accent for the dot mark (the rail/overview page-accent set) —
   *  applied as an inline style so it, too, touches marks only. */
  accent?: string
  /** list-row / task-card — the burnt-orange dated signal on the date atom.
   *  Defaults on for a list-row whose meta is "today" (the mockup rule). */
  due?: boolean
  /** check-row / task-card — done. */
  on?: boolean
  /** record-card — focal-numeral mode (the OverviewCard absorption): the big
   *  stat replaces the media tile and `sub` is its quiet mono caption. */
  stat?: string
  sub?: string
  /** list-row/check-row — show the ⋮⋮ drag handle. @default true */
  handle?: boolean
  /** list-row — show the kind dot. @default true */
  dot?: boolean
  /** list-row — the raised label voice (an area/root row). */
  emphasis?: boolean
  /** Host affordance slots — a caret before, hover-CRUD/open after. */
  leading?: ReactNode
  trailing?: ReactNode
  className?: string
}

/* ── Mockup fixture + copy tables (PondMolecule.dc.html) ─────────────────── */

const DEFAULTS: Record<PondMoleculeKind, [title: string, meta: string]> = {
  'list-row': ['cabinet quote', 'today'],
  'check-row': ['stir through harissa', ''],
  'table-row': ['chickpeas, harissa', '19 sep'],
  'record-card': ['chickpeas, harissa, yoghurt', '25m'],
  entry: ['Cooked for four. Needs more salt than you think.', '19 sep'],
  'field-row': ['', ''],
  notice: ['cacio e pepe was deleted · 1 row still points at it', ''],
  provenance: ['google sheets › kitchen quotes', ''],
  'diff-line': ['what to drink with it', ''],
  reminder: ['cabinet quote is due today', 'kitchen renovation · 09:00'],
  'task-card': ['pack the kitchen', '10 nov'],
}

const EMPTY_TITLE: Partial<Record<PondMoleculeKind, string>> = {
  'list-row': 'add an item',
  'check-row': 'add a step',
  entry: 'write the first entry',
  'record-card': 'untitled',
  'task-card': 'new task',
}

/** Area marks resolve through the mn-area roles so dark flips navy→mist. */
const AREA_BG = { sage: 'bg-mn-area-a', mist: 'bg-mn-area-b', navy: 'bg-mn-area-c' }

/** The mist focus ring (mn-area-b stays mist on every theme). */
const FOCUS_RING = 'outline-2 outline-offset-2 outline-mn-area-b'

/** The dragging lift: card ground, deep shadow, the -0.6° tilt — which
 *  collapses under prefers-reduced-motion. */
const LIFT = 'bg-card shadow-mn-lg -rotate-[0.6deg] motion-reduce:transform-none'

export function PondMolecule({
  kind,
  state = 'rest',
  size = 'desktop',
  title,
  meta,
  value,
  label,
  valueKind = 'number',
  qty,
  tag,
  action,
  variant = 'add',
  color = 'ink',
  accent,
  due,
  on = false,
  stat,
  sub,
  handle = true,
  dot = true,
  emphasis = false,
  leading,
  trailing,
  className,
}: PondMoleculeProps) {
  const mobile = size === 'mobile'
  const hover = state === 'hover'
  const selected = state === 'selected'
  const focus = state === 'focus'
  const editing = state === 'editing'
  const dragging = state === 'dragging'
  const empty = state === 'empty'
  const loading = state === 'loading'
  const error = state === 'error'
  const disabled = state === 'disabled'

  const [fixtureTitle, fixtureMeta] = DEFAULTS[kind]
  const displayTitle = empty
    ? (EMPTY_TITLE[kind] ?? title ?? fixtureTitle)
    : (title ?? fixtureTitle)
  const displayMeta = meta ?? fixtureMeta

  /** The atom state the composed value atoms inherit (mockup `atomState`). */
  const atomState: PondAtomState = editing ? 'editing' : error ? 'error' : empty ? 'empty' : 'rest'

  const fs = mobile ? 'text-[15px]' : 'text-[13.5px]'
  const cellMeta = cn(
    'whitespace-nowrap font-mono lowercase text-mn-text-secondary',
    mobile ? 'text-[11.5px]' : 'text-[10.5px]'
  )

  /** Shared root ink + the whole-molecule state washes. The family is set
   *  per kind (sans rows/cards vs the mono machine surface) — kept out of
   *  here so tailwind-merge can't collapse the register. */
  const wrap = cn(
    'box-border text-mn-text',
    disabled && 'opacity-40 pointer-events-none',
    loading && 'opacity-60',
    focus && FOCUS_RING,
    dragging && LIFT,
    className
  )

  const rowBg = selected ? 'bg-mn-hover-fill' : hover ? 'bg-mn-text/5' : undefined
  const editRing = editing && 'ring-[1.4px] ring-inset ring-mn-text'

  /** The kind dot (the `KindDot` atom, #91) — area role class, or a raw accent
   *  via style (marks only). `fallback` / `sizeCls` merge over the atom's muted
   *  7px default. */
  const kindDot = (fallback: string, sizeCls?: string) => (
    <KindDot
      accent={accent}
      className={cn(sizeCls, !accent && (color !== 'ink' ? AREA_BG[color] : fallback))}
    />
  )

  const dragHandle = handle && (
    <span
      data-part="handle"
      aria-hidden
      className={cn(
        'w-3 flex-none cursor-grab font-mono text-[10px] tracking-[-2px] text-mn-text-secondary',
        hover || selected || dragging ? 'opacity-100' : 'opacity-0'
      )}
    >
      ⋮⋮
    </span>
  )

  /* ── list-row: handle · dot · title · date atom ── */
  if (kind === 'list-row') {
    const dueResolved = due ?? displayMeta === 'today'
    return (
      <div
        data-kind={kind}
        data-state={state}
        className={cn(
          'flex items-center gap-2.5 rounded-mn-row pl-1 pr-2.5 font-sans',
          mobile ? 'min-h-12 w-[330px]' : 'min-h-9 w-[360px]',
          fs,
          rowBg,
          editRing,
          wrap
        )}
      >
        {dragHandle}
        {leading}
        {dot && kindDot(selected ? 'bg-mn-text' : 'bg-mn-text/50')}
        <span
          data-part="title"
          className={cn(
            'min-w-0 flex-1 truncate',
            emphasis && 'font-medium',
            empty && 'text-mn-text-secondary'
          )}
        >
          {displayTitle}
        </span>
        {displayMeta !== '' && (
          <PondAtom
            kind="date"
            value={displayMeta}
            due={dueResolved}
            state={atomState}
            size={size}
          />
        )}
        {trailing}
      </div>
    )
  }

  /* ── check-row: handle · checkbox atom · text ── */
  if (kind === 'check-row') {
    const done = on || selected
    return (
      <div
        data-kind={kind}
        data-state={state}
        className={cn(
          'flex items-center gap-2.5 rounded-mn-row pl-1 pr-2.5 font-sans',
          mobile ? 'min-h-12 w-[330px]' : 'min-h-9 w-[360px]',
          fs,
          rowBg,
          editRing,
          wrap
        )}
      >
        {dragHandle}
        {leading}
        <PondAtom kind="checkbox" on={done} size={size} />
        <span
          data-part="title"
          className={cn(
            'min-w-0 flex-1',
            (done || empty) && 'text-mn-text-secondary',
            done && 'line-through decoration-mn-text/40'
          )}
        >
          {displayTitle}
        </span>
        {trailing}
      </div>
    )
  }

  /* ── table-row: meta · relation atom · qty · right-aligned numeral ── */
  if (kind === 'table-row') {
    return (
      <div
        data-kind={kind}
        data-state={state}
        className={cn(
          'grid items-center gap-x-3.5 border-b border-mn-hair px-2 font-sans',
          mobile
            ? 'min-h-12 w-[340px] [grid-template-columns:54px_minmax(0,1fr)_44px_58px]'
            : 'min-h-[38px] w-[460px] [grid-template-columns:62px_minmax(0,1fr)_64px_80px]',
          fs,
          (selected || hover || editing) && 'rounded-lg',
          rowBg,
          editRing,
          wrap
        )}
      >
        <span data-part="meta" className={cellMeta}>
          {displayMeta}
        </span>
        <span className="grid min-w-0 overflow-hidden [grid-template-columns:minmax(0,1fr)]">
          <PondAtom
            kind="relation"
            value={displayTitle}
            state={error ? 'error' : empty ? 'empty' : 'rest'}
            note={false}
            size={size}
            className="max-w-full min-w-0"
          />
        </span>
        <span data-part="qty">{qty ?? '2'}</span>
        <span className="flex flex-col items-end gap-px">
          <span
            data-part="num"
            className={cn(
              'text-right font-medium tabular-nums text-mn-text',
              mobile ? 'text-[13.5px]' : 'text-[12.5px]'
            )}
          >
            {value ?? '1,040'}
          </span>
          {error && <span className={cellMeta}>kept</span>}
        </span>
      </div>
    )
  }

  /* ── record-card: media card (mockup) or focal-numeral card (OverviewCard) ── */
  if (kind === 'record-card') {
    const shell = cn(
      'flex flex-col rounded-mn-card bg-card font-sans',
      selected
        ? 'shadow-mn-card ring-2 ring-mn-text'
        : hover
          ? '-translate-y-px shadow-mn-md'
          : 'shadow-mn-card',
      'motion-reduce:transform-none',
      editRing,
      wrap
    )
    if (stat !== undefined) {
      // The OverviewCard absorption — the card leads with one oversized figure.
      return (
        <div
          data-kind={kind}
          data-state={state}
          className={cn('w-full gap-2.5 px-[18px] py-4', shell)}
        >
          <span className="flex items-center gap-2">
            {kindDot(selected ? 'bg-mn-text' : 'bg-mn-text/50')}
            <span
              data-part="title"
              className={cn(
                'min-w-0 truncate text-[13.5px] font-medium',
                empty && 'text-mn-text-secondary'
              )}
            >
              {displayTitle}
            </span>
            <span aria-hidden className="ml-auto text-[15px] text-mn-text/30">
              ›
            </span>
          </span>
          <span
            data-part="stat"
            className="text-[30px] leading-none font-medium tracking-[-0.01em] tabular-nums"
          >
            {stat}
          </span>
          <span
            data-part="sub"
            className="font-mono lowercase text-[11.5px] tracking-wider text-mn-text-secondary"
          >
            {sub}
          </span>
        </div>
      )
    }
    return (
      <div
        data-kind={kind}
        data-state={state}
        className={cn('gap-2.5 p-2.5', mobile ? 'w-44' : 'w-[170px]', shell)}
      >
        <PondAtom
          kind="image"
          state={empty ? 'empty' : loading ? 'loading' : error ? 'error' : 'rest'}
          size={size}
        />
        <span className="flex flex-col gap-1.5 px-0.5 pb-0.5">
          <span
            data-part="title"
            className={cn(
              'leading-[1.35] font-medium',
              mobile ? 'text-[14px]' : 'text-mn-13',
              empty && 'text-mn-text-secondary'
            )}
          >
            {displayTitle}
          </span>
          <span className="flex items-center justify-between gap-1.5">
            <PondAtom kind="tag" value={tag ?? 'recipe'} size={size} />
            <span data-part="meta" className={cellMeta}>
              {displayMeta}
            </span>
          </span>
        </span>
      </div>
    )
  }

  /* ── entry: date gutter · serif body (Editorial 200, never 400) ── */
  if (kind === 'entry') {
    return (
      <div
        data-kind={kind}
        data-state={state}
        className={cn(
          'grid items-baseline gap-3.5 rounded-mn-row px-2 py-2.5 font-sans [grid-template-columns:56px_minmax(0,1fr)]',
          mobile ? 'w-[330px]' : 'w-[420px]',
          rowBg,
          editRing,
          wrap
        )}
      >
        <span data-part="meta" className={cellMeta}>
          {displayMeta}
        </span>
        <span
          data-part="title"
          className={cn(
            'font-serif font-extralight leading-[1.6] [text-wrap:pretty]',
            mobile ? 'text-[17px]' : 'text-[16.5px]',
            empty && 'text-mn-text-secondary'
          )}
        >
          {displayTitle}
        </span>
      </div>
    )
  }

  /* ── field-row: uppercase label · value atom ── */
  if (kind === 'field-row') {
    return (
      <div
        data-kind={kind}
        data-state={state}
        className={cn(
          'grid items-center gap-3 rounded-lg px-2 font-sans',
          mobile
            ? 'min-h-12 w-[330px] [grid-template-columns:120px_minmax(0,1fr)]'
            : 'min-h-[34px] w-[360px] [grid-template-columns:140px_minmax(0,1fr)]',
          hover && 'bg-mn-text/5',
          wrap
        )}
      >
        <span
          data-part="label"
          className="text-[10.5px] font-medium tracking-wider uppercase text-mn-text-secondary"
        >
          {label ?? 'kcal per serving'}
        </span>
        <PondAtom
          kind={valueKind}
          value={value ?? '520'}
          state={atomState}
          size={size}
          className="justify-self-start"
        />
      </div>
    )
  }

  /* ── notice: quiet mono wash · offered action ── */
  if (kind === 'notice') {
    const actionLabel = action ?? 'review'
    return (
      <div
        data-kind={kind}
        data-state={state}
        className={cn(
          'flex items-center gap-3 rounded-mn-inner bg-mn-text/[0.04] py-[9px] pr-2.5 pl-3.5 font-sans',
          mobile ? 'w-[330px]' : 'w-[440px]',
          wrap
        )}
      >
        <span
          data-part="title"
          className={cn(
            'min-w-0 flex-1 font-mono lowercase leading-normal text-mn-text-meta',
            mobile ? 'text-[12px]' : 'text-mn-11'
          )}
        >
          {displayTitle}
        </span>
        {trailing ??
          (actionLabel !== '' && (
            <span
              data-part="action"
              className="flex-none rounded-mn-pill bg-mn-text/[0.07] px-3 py-1.5 text-[12px] text-mn-text-meta"
            >
              {actionLabel}
            </span>
          ))}
      </div>
    )
  }

  /* ── provenance: the mono source chip with its link mark ── */
  if (kind === 'provenance') {
    return (
      <span
        data-kind={kind}
        data-state={state}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-mn-pill font-mono lowercase whitespace-nowrap ring-1 ring-inset',
          mobile ? 'min-h-8 px-[11px] text-[12px]' : 'min-h-[22px] px-[9px] text-[10.5px]',
          selected || hover ? 'ring-mn-text/30' : 'ring-mn-text/20',
          selected && 'bg-mn-hover-fill',
          error ? 'text-mn-text-secondary line-through' : 'text-mn-text-meta',
          wrap
        )}
      >
        <svg
          aria-hidden
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-none"
        >
          <path d="M4.5 7.5 7.5 4.5" />
          <path d="M5.5 3 6.6 1.9a2.2 2.2 0 0 1 3.1 3.1L8.6 6.1" />
          <path d="M6.5 9 5.4 10.1a2.2 2.2 0 0 1-3.1-3.1L3.4 5.9" />
        </svg>
        {displayTitle}
      </span>
    )
  }

  /* ── diff-line: the mono ± line; removals carry the red signal ── */
  if (kind === 'diff-line') {
    const removal = variant === 'remove'
    return (
      <div
        data-kind={kind}
        data-state={state}
        className={cn(
          'flex items-baseline gap-2.5 rounded-lg px-2.5 py-1 font-mono lowercase leading-[1.6]',
          mobile ? 'w-[330px] text-[12.5px]' : 'w-[380px] text-[11.5px]',
          selected && 'bg-mn-hover-fill',
          wrap
        )}
      >
        <span
          data-part="sign"
          aria-hidden
          className={cn('w-2.5 flex-none', removal ? 'text-mn-signal-removal' : 'text-mn-text')}
        >
          {removal ? '−' : '+'}
        </span>
        <span
          data-part="title"
          className={cn(
            'min-w-0',
            removal
              ? 'text-mn-text-secondary line-through decoration-mn-signal-removal'
              : 'text-mn-text'
          )}
        >
          {displayTitle}
        </span>
        {displayMeta !== '' && (
          <span data-part="meta" className={cellMeta}>
            {displayMeta}
          </span>
        )}
      </div>
    )
  }

  /* ── reminder: the floating card with the ONE burnt-orange due-dot ── */
  if (kind === 'reminder') {
    return (
      <div
        data-kind={kind}
        data-state={state}
        className={cn(
          'flex items-center gap-3 rounded-mn-card border border-mn-line bg-card/85 py-3 pr-3 pl-4 font-sans shadow-mn-lg backdrop-blur-xl',
          mobile ? 'w-[330px]' : 'w-[380px]',
          wrap
        )}
      >
        <span
          data-part="due-dot"
          aria-hidden
          className="size-[7px] flex-none rounded-mn-hair bg-mn-signal-dated"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span data-part="title" className={cn('font-medium', fs)}>
            {displayTitle}
          </span>
          <span data-part="meta" className={cellMeta}>
            {displayMeta}
          </span>
        </span>
        {trailing ?? (
          <span
            data-part="action"
            className="flex-none rounded-mn-pill px-3 py-1.5 text-[12px] text-mn-text ring-1 ring-inset ring-mn-text/20"
          >
            open
          </span>
        )}
      </div>
    )
  }

  /* ── task-card: the small board card ── */
  const showDot = color !== 'ink' || accent !== undefined
  const hasMeta = !empty && (displayMeta !== '' || (value ?? '') !== '')
  return (
    <div
      data-kind={kind}
      data-state={state}
      className={cn(
        'flex flex-col gap-[7px] rounded-xl bg-card font-sans',
        mobile ? 'w-[300px] p-3' : 'w-[200px] px-2.5 py-[9px]',
        selected
          ? 'shadow-mn-sm ring-2 ring-mn-text'
          : hover
            ? '-translate-y-px shadow-mn-md'
            : 'shadow-mn-sm',
        'motion-reduce:transform-none',
        editing && 'shadow-none ring-[1.4px] ring-inset ring-mn-text',
        empty && 'bg-transparent shadow-none ring-[1.4px] ring-inset ring-mn-text/20',
        on && 'opacity-60',
        wrap
      )}
    >
      <span className="flex items-baseline gap-[7px]">
        {showDot && kindDot('bg-mn-text/50', 'size-1.5 -translate-y-px')}
        <span
          data-part="title"
          className={cn(
            'min-w-0 flex-1 leading-[1.35]',
            mobile ? 'text-[14.5px]' : 'text-[12.5px]',
            empty && 'text-mn-text-secondary',
            on && 'line-through decoration-mn-text/40'
          )}
        >
          {displayTitle}
        </span>
      </span>
      {hasMeta && (
        <span className="flex items-center justify-between gap-2">
          {displayMeta !== '' && (
            <PondAtom
              kind="date"
              value={displayMeta}
              due={due ?? false}
              state={atomState}
              size={size}
            />
          )}
          {(value ?? '') !== '' && (
            <span data-part="meta" className={cellMeta}>
              {value}
            </span>
          )}
        </span>
      )}
    </div>
  )
}
