'use client'

/**
 * PondControl (#221) — the five control kinds of `PondControl.dc.html`, level 1 of
 * `Pond 02 Component library`: **button · field · toggle · checkbox · menu**.
 *
 * Each kind is a base-ui primitive (the shadcn layer — focus management, keyboard
 * handling, the ARIA state machine) wearing the board's values: `ui/button` under
 * `button`, `Field` + `Input` under `field`, `Switch` under `toggle`, `Checkbox`
 * under `checkbox`, and a row surface a `Menu.Item` renders into under `menu`
 * (`<Menu.Item render={<PondControl kind="menu" … />} />` — the item's props,
 * `data-highlighted` and ref all land on the row). A primitive under its wrapper
 * is the architecture working, not a duplicate.
 *
 * Every literal below is from `wayfinder/board-values.generated.json`
 * (`.components.PondControl`) — the board's own `renderVals()` output. Ink washes
 * are written as `bg-mn-text/[x]` literals (they flip with `--mn-text` on dark);
 * the two text tiers the board uses, `.68` and `.8`, are the house tiers
 * `text-mn-text-secondary` / `text-mn-text-meta` (identical values both themes).
 *
 * The eight states are ONE shared map ({@link STATE}), as the board applies them:
 * a part a kind does not have simply does not render. `hover` differs per button
 * variant (primary is opacity .9, the rest a ground) — that lives in
 * `buttonStateGround`, with the cva, so the two never drift. `loading` is a copy
 * swap, never a spinner. `error` composes the 1.4px ink inset BEFORE the card
 * shadow. The explicit `state` prop drives the matrix and forces appearance; at
 * `rest`, the live pseudo-classes (`hover:` · `focus-visible:` · `data-[checked]`)
 * do the same work.
 *
 * Class strings here are plain template literals, NOT `cn()`, where `PondAtom`
 * and `PondMolecule` use `cn()`. Deliberate: this file is almost entirely
 * size+colour pairs, and `tailwind-merge` cannot tell `text-mn-11` (a size) from
 * `text-mn-text-secondary` (a colour) and drops whichever came first (#252 — two
 * live instances of that bug already exist in those two siblings). The cost is
 * that a consumer's `className` does not MERGE for the four non-button kinds: it
 * is appended, and CSS source order wins. Pass a `className` that adds rather
 * than overrides until #252 lands.
 *
 * Three boards, three checkboxes — unreconciled, each final for its board
 * (ADR 0003 amendment): THIS one is the standalone control, **14 × 14 / radius 4 /
 * inset 1.4px at ink .68**. `PondAtom kind="checkbox"` is the inline atom the
 * `check-row` composes (12 / 3 / .68), and `PondTemplate.dc.html`'s row box
 * (13 / 3 / .4) is a level-4 rendering with no code of its own yet.
 */

import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { Checkbox } from '@base-ui/react/checkbox'
import { Field } from '@base-ui/react/field'
import { Input } from '@base-ui/react/input'
import { Switch } from '@base-ui/react/switch'

import { FOCUS_RING, FOCUS_VISIBLE_RING, FOCUS_WITHIN_RING } from '@/components/atoms/focus-ring'
import { Button, buttonStateGround, type ButtonVariant } from '@/components/ui/button'

export const POND_CONTROL_KINDS = ['button', 'field', 'toggle', 'checkbox', 'menu'] as const
/**
 * Derived, never hand-kept (#221 review): `buttonStateGround` is a
 * `Record<ButtonVariant, …>` over the cva's own union, so TypeScript already
 * forces it to hold every variant and forbids a stray one. Reading its keys makes
 * the button's variant axis and the control's one fact with one owner — a fifth
 * cva variant appears here with no edit, and cannot be forgotten.
 */
export const POND_CONTROL_VARIANTS = Object.keys(buttonStateGround) as readonly ButtonVariant[]
export const POND_CONTROL_STATES = [
  'rest',
  'hover',
  'focus',
  'selected',
  'editing',
  'disabled',
  'loading',
  'error',
] as const

export type PondControlKind = (typeof POND_CONTROL_KINDS)[number]
export type PondControlVariant = ButtonVariant
export type PondControlState = (typeof POND_CONTROL_STATES)[number]

export interface PondControlProps extends Omit<
  HTMLAttributes<HTMLElement>,
  'onChange' | 'color' | 'defaultValue'
> {
  kind: PondControlKind
  /** button only. @default 'primary' */
  variant?: PondControlVariant
  /** Forces a board state; `rest` leaves the live pseudo-classes in charge. @default 'rest' */
  state?: PondControlState
  /** @default 'desktop' */
  size?: 'desktop' | 'mobile'
  /**
   * button label · field placeholder · toggle/checkbox/menu row label.
   *
   * Omitted, it falls back to {@link FIXTURE} — the board's own
   * `p.label ?? (kind === 'field' ? 'email' : 'keep page')`, which is a MOCKUP
   * HARNESS default so a cell renders standalone. **A product call site must pass
   * one, or pass `null` to say it has none** (a value slot, a table cell) — an
   * omitted label there would ship the board's fixture copy to a reader.
   */
  label?: string | null
  /** field — the typed value (controlled when `onValueChange` is given). */
  value?: string
  /** field — the mono hint under the card · menu — the trailing hint. */
  hint?: string
  /** toggle/checkbox — checked · menu — show the ↵ glyph. `selected` also sets it. */
  on?: boolean
  disabled?: boolean
  onCheckedChange?: (checked: boolean) => void
  onValueChange?: Input.Props['onValueChange']
  children?: ReactNode
  ref?: Ref<HTMLElement>
}

/** The board's `off`. */
const OFF = 'opacity-40 pointer-events-none'
/** The board's error `field.boxShadow`: `inset 0 0 0 1.4px <ink>, <card shadow>` — both paint. */
const ERROR_SHADOW = 'shadow-[inset_0_0_0_1.4px_var(--mn-text),var(--mn-shadow-card)]'

interface StateRow {
  /** Grounds the state forces on a part (replacing the rest ground). */
  ground?: Partial<Record<'track' | 'box' | 'menu', string>>
  /** button — which of the variant's own grounds to force. */
  variantKey?: 'hover' | 'selected'
  /** The mist ring on the kind's focusable surface, plus the field caret. */
  ring?: boolean
  on?: boolean
  caret?: boolean
  inert?: boolean
  copy?: { button: string; field: string }
  fieldShadow?: string
  hint?: string
}

/** The board's ONE state map — `hover`, `focus`, `sel`, `edit`, `dis`, `load`, `err`. */
const STATE: Record<PondControlState, StateRow> = {
  rest: {},
  hover: {
    ground: { track: 'bg-mn-text/[0.28]', box: 'bg-mn-text/[0.07]', menu: 'bg-mn-text/5' },
    variantKey: 'hover',
  },
  focus: { ring: true, caret: true },
  selected: { ground: { menu: 'bg-mn-text/[0.07]' }, variantKey: 'selected', on: true },
  editing: { caret: true },
  disabled: { inert: true },
  loading: { copy: { button: 'saving…', field: 'checking…' } },
  error: { fieldShadow: ERROR_SHADOW, hint: 'that isn’t an email address' },
}

/** The board's default `label` per kind (`p.label ?? (kind === 'field' ? 'email' : 'keep page')`). */
const FIXTURE: Record<PondControlKind, string> = {
  button: 'keep page',
  field: 'email',
  toggle: 'keep page',
  checkbox: 'keep page',
  menu: 'keep page',
}

/** `rowWrap` — the toggle / checkbox row: inline-flex · gap 10 · sans 13.5 (15) · ink · min-h 24 (44). */
const ROW = 'inline-flex items-center gap-2.5 font-sans text-mn-text'

const TICK = (
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
  >
    <path d="M1.8 4.8 3.7 6.6 7.2 2.4" />
  </svg>
)

export function PondControl({
  kind,
  variant = 'primary',
  state = 'rest',
  size = 'desktop',
  label,
  value,
  hint,
  on,
  disabled,
  className = '',
  onCheckedChange,
  onValueChange,
  children,
  ref,
  ...rest
}: PondControlProps) {
  const s = STATE[state]
  const mobile = size === 'mobile'
  const text = label === null ? '' : (label ?? FIXTURE[kind])
  const inert = s.inert || disabled === true
  const ring = s.ring ? FOCUS_RING : ''
  const off = inert ? OFF : ''
  const data = { 'data-kind': kind, 'data-state': state }
  /** Controlled when the host (or `selected`) says so; otherwise the primitive owns it. */
  const checked = s.on || on !== undefined ? { checked: s.on || on === true } : {}
  const change = { onCheckedChange: (next: boolean) => onCheckedChange?.(next) }

  if (kind === 'button') {
    const forced = s.variantKey ? buttonStateGround[variant][s.variantKey] : ''
    return (
      <Button
        {...data}
        variant={variant}
        size={mobile ? 'mobile' : 'desktop'}
        disabled={inert}
        aria-busy={s.copy ? true : undefined}
        className={`${forced} ${ring} ${className}`}
        ref={ref as Ref<HTMLButtonElement>}
        {...rest}
      >
        {s.copy ? s.copy.button : (children ?? text)}
      </Button>
    )
  }

  if (kind === 'field') {
    const shown = value ?? (state === 'editing' ? 'hi@make-noise' : undefined)
    const hintText = hint ?? s.hint
    const error = state === 'error'
    const Hint = error ? Field.Error : Field.Description
    return (
      <Field.Root
        {...data}
        invalid={error}
        disabled={inert}
        className={`inline-flex flex-col gap-1.5 ${className}`}
      >
        <span
          data-part="field"
          className={`box-border flex items-center gap-0.5 rounded-mn-inner bg-mn-card px-[14px] font-sans text-mn-text ${s.fieldShadow ?? 'shadow-mn-card'} ${mobile ? 'h-[48px] w-[280px] text-[15px]' : 'h-[38px] w-[240px] text-[13.5px]'} ${FOCUS_WITHIN_RING} ${ring} ${off}`}
        >
          <Input
            placeholder={s.copy ? s.copy.field : text}
            {...(onValueChange ? { value: shown ?? '', onValueChange } : { defaultValue: shown })}
            aria-invalid={error || undefined}
            className="min-w-0 flex-1 bg-transparent text-inherit caret-mn-text outline-none placeholder:text-mn-text-secondary"
            ref={ref}
            {...rest}
          />
          {s.caret && (
            <span
              data-part="caret"
              aria-hidden
              className={`inline-block w-[1.5px] flex-none bg-mn-text ${mobile ? 'h-[17px]' : 'h-[15px]'}`}
            />
          )}
        </span>
        {hintText && (
          <Hint
            data-part="hint"
            match={error || undefined}
            className="pl-1 font-mono text-[10.5px] text-mn-text-meta"
          >
            {hintText}
          </Hint>
        )}
      </Field.Root>
    )
  }

  if (kind === 'toggle') {
    return (
      <label
        {...data}
        className={`${ROW} ${mobile ? 'min-h-11 text-[15px]' : 'min-h-6 text-[13.5px]'} ${off} ${className}`}
      >
        <Switch.Root
          {...checked}
          {...change}
          disabled={inert}
          className={`relative flex-none rounded-mn-pill ${s.ground?.track ?? 'bg-mn-text/20'} hover:data-[unchecked]:bg-mn-text/[0.28] data-[checked]:bg-mn-text ${FOCUS_VISIBLE_RING} ${mobile ? 'h-[22px] w-[38px]' : 'h-[18px] w-[30px]'} ${ring}`}
          ref={ref}
          {...rest}
        >
          <Switch.Thumb
            data-part="knob"
            className={`absolute top-0.5 left-0.5 rounded-mn-pill bg-mn-card shadow-[0_1px_2px_rgba(0,0,0,0.18)] data-[checked]:bg-raw-paper dark:data-[checked]:bg-raw-ink ${mobile ? 'size-[18px] data-[checked]:left-[18px]' : 'size-3.5 data-[checked]:left-3.5'}`}
          />
        </Switch.Root>
        {text && <span data-part="label">{text}</span>}
      </label>
    )
  }

  if (kind === 'checkbox') {
    return (
      <label
        {...data}
        className={`${ROW} ${mobile ? 'min-h-11 text-[15px]' : 'min-h-6 text-[13.5px]'} ${off} ${className}`}
      >
        <Checkbox.Root
          {...checked}
          {...change}
          disabled={inert}
          className={`flex flex-none items-center justify-center rounded-[4px] text-raw-paper ring-[1.4px] ring-mn-text-secondary ring-inset dark:text-raw-ink ${s.ground?.box ?? 'bg-transparent'} hover:data-[unchecked]:bg-mn-text/[0.07] data-[checked]:bg-mn-text data-[checked]:ring-0 ${FOCUS_VISIBLE_RING} ${mobile ? 'size-5' : 'size-3.5'} ${ring}`}
          ref={ref}
          {...rest}
        >
          <Checkbox.Indicator data-part="tick" className="flex">
            {TICK}
          </Checkbox.Indicator>
        </Checkbox.Root>
        {text && <span data-part="label">{text}</span>}
      </label>
    )
  }

  // menu — `menuRow`: mono, the surface you talk to.
  return (
    <div
      role="menuitem"
      {...data}
      className={`box-border flex w-[320px] items-center gap-2.5 rounded-mn-row px-2.5 font-mono text-mn-text ${s.ground?.menu ?? 'bg-transparent'} hover:bg-mn-text/5 data-[highlighted]:bg-mn-text/5 ${FOCUS_VISIBLE_RING} ${mobile ? 'min-h-11 text-[14px]' : 'min-h-[30px] text-[12px]'} ${ring} ${off} ${className}`}
      ref={ref as Ref<HTMLDivElement>}
      {...rest}
    >
      <span data-part="label" className="min-w-0 flex-1 truncate">
        {children ?? text}
      </span>
      {hint && (
        <span data-part="hint" className="whitespace-nowrap text-[10.5px] text-mn-text-secondary">
          {hint}
        </span>
      )}
      {(s.on || on) && (
        <span data-part="enter" className="text-[10px] text-mn-text-meta">
          ↵
        </span>
      )}
    </div>
  )
}
