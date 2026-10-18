'use client'

/**
 * The new-pond sheet — `Pond 06.13` `s6m2` / `s6m3`.
 *
 * The board draws creating a pond as a three-step sheet over a paper scrim (name/
 * glyph/theme · areas · sources), NOT an inline field in the switcher menu. The
 * sources step is a separate ticket's ask and is left out here, so this sheet is
 * **two** steps. #316 ruled that the sheet ships **whole**, with `name` the only
 * enabled control: glyph, theme and the areas step render in `PondControl`'s own
 * `disabled` state — one of the eight states `PondControl.dc.html` specifies — so
 * nothing is missing from the board and nothing pretends to be live.
 *
 * Every value here is read inline from the board's markup, not eyeballed:
 *
 *   scrim    inset 0 · rgba(250,249,239,.62)        ← PAPER at .62, not an ink backdrop
 *   sheet    540 · top 120 · centred · padding 22/24 · gap 18 · radius 20
 *   glass    linear-gradient(160deg, rgba(255,255,255,.9), rgba(255,255,255,.72))
 *            border rgba(255,255,255,.9) · inset 0 1px 0 rgba(255,255,255,.7)
 *            + 0 20px 54px rgba(40,34,24,.16) · blur(24px) saturate(1.3)
 *   head     mono 11 · ink .68 · `N of 2`
 *   title    22 / 500 / -.01em
 *   lede     13.5 / 1.55 · ink .8
 *   label    10.5 / 500 / .1em / uppercase · ink .68
 *   glyph    34×34 · radius 10 · selected `inset 0 0 0 2px #1B1D14` + ink .05
 *            unselected ink .04 · the glyph itself 15px over currentColor
 *   chip     padding 6/11 · radius 999 · 12.5 · selected `#1B1D14`/paper
 *            unselected `inset 0 0 0 1px rgba(27,29,20,.2)`
 *   foot     gap 8 · padding-top 4 · primary `continue` ⟷ `make pond`
 *
 * **This sheet's glass is a THIRD recipe** — `.9 → .72` with a `.16` shadow —
 * distinct from both `--mn-glass` (`.86 → .64` / `.14`) and `PondRail`'s switcher
 * menu (`.92 → .76` / `.16`). It is written out rather than snapped to the token,
 * because ADR 0004 ruling 11 governs the floating-glass family that appears
 * *together* on one screen, and this sheet sits alone over a scrim.
 *
 * The ⌘1–⌘3 shortcuts bind only in a desktop app (AUDIT K1, decided 8 oct). Not
 * built, recorded as fog on #312: the areas step actually creating pages (it is
 * disabled per #316, so picking nothing is the only path and a new pond is born
 * with one root, per #320).
 */

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Icon } from '@/components/atoms/Icon'
import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'
import { PondControl } from '@/components/atoms/PondControl'
import { holdInkGround, holdPaperGround } from '@/lib/theme/mode'

/** `s6m2`'s glyph row, in the board's order. The first is the column default. */
const GLYPHS = ['lightning-03', 'waves-02', 'star-01', 'house', 'ring', 'heart'] as const

/** `s6m2`'s theme row. `paper` is the column default. Only these two are live (#175 owns the rest). */
const THEMES = ['paper', 'ink', 'sage', 'mist', 'navy', 'wheat', 'burnt orange', 'ember'] as const
type LiveTheme = 'paper' | 'ink'

/** `s6m3`'s suggested areas. Where they come from is unspecified (AUDIT 6m, p2). */
const AREAS = ['clients', 'projects', 'studio', 'notes', 'finances', 'people', 'admin'] as const

const SHEET_GLASS =
  'bg-[linear-gradient(160deg,rgba(255,255,255,.9),rgba(255,255,255,.72))] ' +
  'border border-white/90 ' +
  'shadow-[inset_0_1px_0_rgba(255,255,255,.7),0_20px_54px_rgba(40,34,24,.16)] ' +
  'backdrop-blur-[24px] backdrop-saturate-[1.3] ' +
  'dark:bg-[linear-gradient(160deg,rgba(48,49,42,.92),rgba(48,49,42,.78))] ' +
  'dark:border-[rgba(250,249,239,.09)] ' +
  'dark:shadow-[inset_0_1px_0_rgba(250,249,239,.06),0_20px_54px_rgba(0,0,0,.42)]'

const LABEL =
  'text-[10.5px] leading-[normal] font-medium tracking-[0.1em] uppercase text-mn-text-secondary'

const GLYPH_CELL = `flex h-[34px] w-[34px] items-center justify-center rounded-[10px] outline-none ${FOCUS_VISIBLE_RING}`
const GLYPH_SELECTED = 'bg-mn-text/[0.05] shadow-[inset_0_0_0_2px_var(--mn-text)]'
const GLYPH_UNSELECTED = 'bg-mn-text/[0.04]'

/** `s6m2`'s glyph row: a real radiogroup, roving tabindex, clamped (no wrap) ←/→. */
function GlyphRow({ value, onChange }: { value: string; onChange: (glyph: string) => void }) {
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = (index: number) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const target = index + (e.key === 'ArrowRight' ? 1 : -1)
    if (target < 0 || target >= GLYPHS.length) return
    e.preventDefault()
    onChange(GLYPHS[target])
    cellRefs.current[target]?.focus()
  }

  return (
    <div role="radiogroup" aria-label="glyph" className="flex flex-wrap gap-[6px]">
      {GLYPHS.map((g, i) => (
        <button
          key={g}
          type="button"
          ref={(el) => {
            cellRefs.current[i] = el
          }}
          role="radio"
          aria-checked={g === value}
          tabIndex={g === value ? 0 : -1}
          onClick={() => onChange(g)}
          onKeyDown={handleKeyDown(i)}
          className={`${GLYPH_CELL} ${g === value ? GLYPH_SELECTED : GLYPH_UNSELECTED}`}
        >
          <Icon name={g} size={15} />
        </button>
      ))}
    </div>
  )
}

/** A pill: the board's one shape for a theme, an area and a selected tick. Live when `onClick` is given. */
function Pill({
  children,
  on,
  muted,
  onClick,
}: {
  children: string
  on?: boolean
  muted?: boolean
  onClick?: () => void
}) {
  const className = `inline-flex items-center gap-[6px] rounded-full px-[11px] py-[6px] text-[12.5px] leading-[normal] outline-none ${FOCUS_VISIBLE_RING} ${
    on
      ? 'bg-mn-text text-raw-paper dark:text-raw-ink'
      : 'text-mn-text ring-1 ring-mn-text/20 ring-inset'
  } ${muted ? 'opacity-40' : ''}`

  if (onClick) {
    return (
      <button type="button" aria-pressed={on} onClick={onClick} className={className}>
        {children}
      </button>
    )
  }

  return (
    <span aria-disabled={muted ? 'true' : undefined} className={className}>
      {children}
    </span>
  )
}

export interface NewPondSheetProps {
  /** Submitted with the trimmed name and the picked glyph/theme — never a blank
   *  name; `continue`/`make pond` stay disabled until it isn't. `theme` is
   *  omitted while still on the `paper` default, matching `createPond`'s
   *  "defaults send nothing" contract. */
  onCreate: (name: string, options: { glyph?: string; theme?: 'ink' }) => void
  onCancel: () => void
  pending?: boolean
  failure?: string | null
  /** The name already typed — the palette's `new pond “q”` hands over its `q`. */
  defaultName?: string
}

export function NewPondSheet({
  onCreate,
  onCancel,
  pending,
  failure,
  defaultName = '',
}: NewPondSheetProps) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState(defaultName)
  // Step-1-level, not step-scoped: a step 2 → step 1 round trip must keep the pick.
  const [glyph, setGlyph] = useState<string>(GLYPHS[0])
  const [theme, setTheme] = useState<LiveTheme>('paper')

  // Nothing is held until the person actually picks a ground to preview — the
  // default `paper` pill never forces light on a person who opened the sheet
  // in dark. Swapping pills releases the old hold before acquiring the new one.
  const releaseThemeHoldRef = useRef<(() => void) | null>(null)
  const handleThemeChange = (next: LiveTheme) => {
    if (next === theme) return
    releaseThemeHoldRef.current?.()
    releaseThemeHoldRef.current = next === 'ink' ? holdInkGround() : holdPaperGround()
    setTheme(next)
  }

  // Every way the sheet closes (Esc, cancel, scrim, ⌘K, make-pond) unmounts it.
  useEffect(() => {
    return () => releaseThemeHoldRef.current?.()
  }, [])

  const trimmed = name.trim()
  const blank = trimmed === ''
  const last = step === 2

  // A step change unmounts whatever was focused (the name field on advancing,
  // `back` on returning to step 1), dropping focus to <body> — a listener on
  // the dialog div's onKeyDown would then never see the key again. Esc/← are
  // handled on `document` instead, for as long as the sheet is mounted.
  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    onCancelRef.current = onCancel
  }, [onCancel])

  const pendingRef = useRef(pending)
  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  useEffect(() => {
    // Capture phase, not bubble: PageChangesPanel keeps its own Escape
    // listener on `document`'s bubble phase, and same-target bubble listeners
    // fire in registration order, so a later `stopPropagation` can't stop an
    // earlier one from already having acted. Capture always runs first,
    // regardless of mount order, so preventDefault/stopPropagation here keep
    // that listener (which checks `e.defaultPrevented`) from firing at all.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (e.isComposing) return
        e.preventDefault()
        e.stopPropagation()
        // A pending make-pond cannot be cancelled: `back` is already
        // disabled while pending, so Esc/← step-back must agree, and
        // closing on Esc would still let `onCreate`'s navigation land in a
        // pond the person just cancelled out of.
        if (pendingRef.current) return
        if (step > 1) {
          setStep((s) => s - 1)
        } else {
          onCancelRef.current()
        }
        return
      }
      if (
        e.key === 'ArrowLeft' &&
        step > 1 &&
        !pendingRef.current &&
        !(e.target instanceof HTMLInputElement)
      ) {
        setStep((s) => s - 1)
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [step])

  return (
    <>
      {/* `s6m2`: the scrim is PAPER at .62 — not the ink dialog backdrop. */}
      <div
        className="fixed inset-0 z-[40] bg-raw-paper/[0.62] dark:bg-raw-ink/[0.62]"
        aria-hidden
        onClick={() => {
          if (pending) return
          onCancel()
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New pond"
        className={`fixed top-[120px] left-1/2 z-[41] box-border flex w-[540px] -translate-x-1/2 flex-col gap-[18px] rounded-[20px] p-[22px_24px] text-mn-text ${SHEET_GLASS}`}
      >
        <div className="flex items-baseline justify-end font-mono text-[11px] leading-[normal] text-mn-text-secondary">
          <span>{step} of 2</span>
        </div>

        {step === 1 && (
          <>
            <span className="text-[22px] leading-[normal] font-medium tracking-[-0.01em]">
              New pond
            </span>

            <div className="flex flex-col gap-[8px]">
              <PondControl
                kind="field"
                label="Name your pond"
                value={name}
                onValueChange={setName}
                disabled={pending}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !blank) {
                    setStep((s) => s + 1)
                  }
                }}
              />
            </div>

            <div className="flex flex-col gap-[8px]">
              <span className={LABEL}>glyph</span>
              <GlyphRow value={glyph} onChange={setGlyph} />
            </div>

            {/* Eight pills because the board draws eight; only paper and ink are
                live (#175 owns the other six, which stay muted/inert). */}
            <div className="flex flex-col gap-[8px]">
              <span className={LABEL}>theme</span>
              <div className="flex flex-wrap gap-[6px]">
                {THEMES.map((t) =>
                  t === 'paper' || t === 'ink' ? (
                    <Pill key={t} on={t === theme} onClick={() => handleThemeChange(t)}>
                      {t}
                    </Pill>
                  ) : (
                    <Pill key={t} muted>
                      {t}
                    </Pill>
                  )
                )}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <span className="text-[22px] leading-[normal] font-medium tracking-[-0.01em]">
              Areas
            </span>
            <p className="m-0 text-[13.5px] leading-[1.55] text-mn-text/80">
              Areas are pages with pages inside. Pick any, or none; you can add them later.
            </p>
            <div className="flex flex-wrap gap-[6px]">
              {AREAS.map((a) => (
                <Pill key={a} muted>
                  {a}
                </Pill>
              ))}
            </div>
            <div className="pointer-events-none opacity-40">
              <PondControl kind="field" label="add your own" disabled aria-disabled="true" />
            </div>
          </>
        )}

        {failure && (
          <div className="font-mono text-[10.5px] leading-[normal] text-mn-text/80">
            could not make it. {failure}
          </div>
        )}

        <div className="flex items-center gap-[8px] pt-[4px]">
          {step > 1 && (
            <PondControl
              kind="button"
              variant="ghost"
              label="back"
              disabled={pending}
              onClick={() => setStep((s) => s - 1)}
            />
          )}
          <div className="flex-1" />
          <PondControl
            kind="button"
            variant="primary"
            label={last ? 'make pond' : 'continue'}
            disabled={pending || blank}
            onClick={() =>
              last
                ? onCreate(trimmed, { glyph, ...(theme === 'ink' ? { theme } : {}) })
                : setStep((s) => s + 1)
            }
          />
        </div>
      </div>
    </>
  )
}
