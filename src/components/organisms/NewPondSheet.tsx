'use client'

/**
 * The new-pond sheet — `Pond 06.13` `s6m2` / `s6m3` / `s6m4`.
 *
 * The board draws creating a pond as a three-step sheet over a paper scrim, NOT
 * an inline field in the switcher menu. #316 ruled that the sheet ships **whole**,
 * with `name` the only enabled control: glyph, theme and the areas step render in
 * `PondControl`'s own `disabled` state — one of the eight states
 * `PondControl.dc.html` specifies — so nothing is missing from the board and
 * nothing pretends to be live.
 *
 * Every value here is read inline from the board's markup, not eyeballed:
 *
 *   scrim    inset 0 · rgba(250,249,239,.62)        ← PAPER at .62, not an ink backdrop
 *   sheet    540 · top 120 · centred · padding 22/24 · gap 18 · radius 20
 *   glass    linear-gradient(160deg, rgba(255,255,255,.9), rgba(255,255,255,.72))
 *            border rgba(255,255,255,.9) · inset 0 1px 0 rgba(255,255,255,.7)
 *            + 0 20px 54px rgba(40,34,24,.16) · blur(24px) saturate(1.3)
 *   head     mono 11 · ink .68 · `new pond` ⟷ `N of 3`
 *   title    22 / 500 / -.01em
 *   lede     13.5 / 1.55 · ink .8
 *   label    10.5 / 500 / .1em / uppercase · ink .68
 *   glyph    34×34 · radius 10 · selected `inset 0 0 0 2px #1B1D14` + ink .05
 *            unselected ink .04 · the glyph itself 15px over currentColor
 *   chip     padding 6/11 · radius 999 · 12.5 · selected `#1B1D14`/paper
 *            unselected `inset 0 0 0 1px rgba(27,29,20,.2)`
 *   source   row padding 8/0 · border-top ink .09 · name 13.5/500 · sub mono 10.5 ink .68
 *   foot     gap 8 · padding-top 4 · ghost `skip` ⟷ primary `continue`
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

import { useState } from 'react'
import { Icon } from '@/components/atoms/Icon'
import { PondControl } from '@/components/atoms/PondControl'

/** `s6m2`'s glyph row, in the board's order. The first is the skip default. */
const GLYPHS = ['lightning-03', 'waves-02', 'star-01', 'house', 'ring', 'heart'] as const

/** `s6m2`'s theme row. `paper` is the skip default. */
const THEMES = ['paper', 'ink', 'sage', 'mist', 'navy', 'wheat', 'burnt orange', 'ember'] as const

/** `s6m3`'s suggested areas. Where they come from is unspecified (AUDIT 6m, p2). */
const AREAS = ['clients', 'projects', 'studio', 'notes', 'finances', 'people', 'admin'] as const

/** `s6m4`'s sources, with the board's own cadence copy. */
const SOURCES = [
  ['google sheet', 'syncs every 15 min'],
  ['calendar', 'as events change'],
  ['bank feed', 'as transactions arrive'],
  ['csv file', 'copied once'],
] as const

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

/** A pill: the board's one shape for a theme, an area and a selected tick. */
function Pill({ children, on, muted }: { children: string; on?: boolean; muted?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-[6px] rounded-full px-[11px] py-[6px] text-[12.5px] leading-[normal] ${
        on
          ? 'bg-mn-text text-raw-paper dark:text-raw-ink'
          : 'text-mn-text ring-1 ring-mn-text/20 ring-inset'
      } ${muted ? 'opacity-40' : ''}`}
    >
      {children}
    </span>
  )
}

export interface NewPondSheetProps {
  /** Submitted with the typed name — empty is legal and means "untitled pond". */
  onCreate: (name: string) => void
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

  const last = step === 3

  return (
    <>
      {/* `s6m2`: the scrim is PAPER at .62 — not the ink dialog backdrop. */}
      <div
        className="fixed inset-0 z-[40] bg-raw-paper/[0.62] dark:bg-raw-ink/[0.62]"
        aria-hidden
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New pond"
        className={`fixed top-[120px] left-1/2 z-[41] box-border flex w-[540px] -translate-x-1/2 flex-col gap-[18px] rounded-[20px] p-[22px_24px] text-mn-text ${SHEET_GLASS}`}
      >
        <div className="flex items-baseline justify-between font-mono text-[11px] leading-[normal] text-mn-text-secondary">
          <span>new pond</span>
          <span>{step} of 3</span>
        </div>

        {step === 1 && (
          <>
            <span className="text-[22px] leading-[normal] font-medium tracking-[-0.01em]">
              Name it
            </span>

            <div className="flex flex-col gap-[8px]">
              <span className={LABEL}>name</span>
              <PondControl
                kind="field"
                label="make noise"
                value={name}
                onValueChange={setName}
                disabled={pending}
              />
            </div>

            <div className="flex flex-col gap-[8px]">
              <span className={LABEL}>glyph</span>
              <div className="pointer-events-none flex flex-wrap gap-[6px] opacity-40">
                {GLYPHS.map((g, i) => (
                  <span
                    key={g}
                    className={`flex h-[34px] w-[34px] items-center justify-center rounded-[10px] ${
                      i === 0
                        ? 'bg-mn-text/[0.05] shadow-[inset_0_0_0_2px_var(--mn-text)]'
                        : 'bg-mn-text/[0.04]'
                    }`}
                  >
                    <Icon name={g} size={15} />
                  </span>
                ))}
              </div>
            </div>

            {/* Eight pills because the board draws eight; only paper and ink are
                built (#175 owns the other six), which is why the row is inert. */}
            <div className="flex flex-col gap-[8px]">
              <span className={LABEL}>theme</span>
              <div className="flex flex-wrap gap-[6px]">
                {THEMES.map((t) => (
                  <Pill key={t} on={t === 'paper'} muted>
                    {t}
                  </Pill>
                ))}
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
              <PondControl kind="field" label="add your own" disabled />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <span className="text-[22px] leading-[normal] font-medium tracking-[-0.01em]">
              Sources
            </span>
            <p className="m-0 text-[13.5px] leading-[1.55] text-mn-text/80">
              Each arrives under this pond&rsquo;s databases, read-only while connected.
            </p>
            {/* Genuinely blocked, not a choice: #161–#167 are open and ADR 0006
                defers them, so there is nothing for `connect` to reach. */}
            <div className="pointer-events-none flex flex-col opacity-40">
              {SOURCES.map(([title, cadence]) => (
                <div
                  key={title}
                  className="flex items-center gap-[12px] border-t border-mn-text/[0.09] py-[8px]"
                >
                  <div className="flex flex-1 flex-col gap-[2px]">
                    <span className="text-[13.5px] leading-[normal] font-medium">{title}</span>
                    <span className="font-mono text-[10.5px] leading-[normal] text-mn-text-secondary">
                      {cadence}
                    </span>
                  </div>
                  <PondControl kind="button" variant="secondary" label="connect" disabled />
                </div>
              ))}
            </div>
          </>
        )}

        {failure && (
          <div className="font-mono text-[10.5px] leading-[normal] text-mn-text/80">
            could not make it. {failure}
          </div>
        )}

        <div className="flex items-center gap-[8px] pt-[4px]">
          {/* `s6m2`: "skip gives 'untitled pond', the first glyph and the paper
              theme" — so skip creates, with the column defaults. */}
          <PondControl
            kind="button"
            variant="ghost"
            label="skip"
            disabled={pending}
            onClick={() => onCreate('')}
          />
          <div className="flex-1" />
          <PondControl
            kind="button"
            variant="primary"
            label={last ? 'make pond' : 'continue'}
            disabled={pending}
            onClick={() => (last ? onCreate(name) : setStep((s) => s + 1))}
          />
        </div>
      </div>
    </>
  )
}
