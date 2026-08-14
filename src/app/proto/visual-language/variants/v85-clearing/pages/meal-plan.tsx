'use client'

/**
 * v85 CLEARING — the "Meal plan" page (area: personal · Food).
 *
 * A calm domestic surface. One focal Instrument-Serif numeral = dinners planned
 * this week. The centerpiece is a quiet 7-day week grid: mono day labels down the
 * left, a hairline dinner slot per night. Empty nights show a faint "+ plan"
 * affordance; clicking cycles the seed rotation in (assign), clicking a filled
 * night clears it — the focal count updates live. A Segmented toggle swaps This
 * week / Next week. LIME appears exactly once (Generate groceries). No RUST — this
 * page is meant to feel unhurried. Sage ACCENT is the only ambient tint.
 */

import { useState } from 'react'
import {
  sans,
  serif,
  display,
  mono,
  INK,
  BODY,
  MUTED,
  FAINT,
  LINE,
  HAIR,
  ACCENT,
  ACCENT_WASH,
  LIME,
  LIME_INK,
  EASE,
  radius,
  kicker,
  Card,
  Receipt,
  Segmented,
} from '../ui'
import type { SurfaceCtx } from '../shell-types'

/** Staggered rise-on-mount wrapper. index drives the delay. */
function Rise({
  i,
  children,
  style,
}: {
  i: number
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        animation: `clearing-rise 560ms ${EASE} both`,
        animationDelay: `${i * 70}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** A small group heading — mono kicker over a hairline of air. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ ...kicker, marginBottom: 14 }}>{children}</div>
}

// ── the rotation seed: recipes we cycle empty slots through ───────────────────
const ROTATION = [
  'Sesame salmon',
  'Chickpea curry',
  'Ragù',
  'Sheet-pan chicken',
  'Miso soup',
  'Tacos',
  'Roast veg pasta',
] as const

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

// a filled slot is a recipe name; null = an open night.
type Week = (string | null)[]

// This week: 5 planned, two open (Thu + Sun) → matches "of 7 nights · two open".
const THIS_WEEK: Week = [
  'Sesame salmon',
  'Chickpea curry',
  'Ragù',
  null,
  'Sheet-pan chicken',
  'Tacos',
  null,
]
// Next week: a lighter sketch — 3 planned, four open.
const NEXT_WEEK: Week = ['Roast veg pasta', null, 'Miso soup', null, null, 'Sesame salmon', null]

// a faint lunch line under each dinner — ambient, non-interactive.
const LUNCHES: (string | null)[] = [
  'Leftover ragù',
  'Big salad',
  'Soup + toast',
  'Grain bowl',
  'Leftovers',
  'Out',
  'Eggs',
]

type WeekKey = 'this' | 'next'

export default function MealPlan(ctx: SurfaceCtx) {
  const { openPage, askPond } = ctx

  const [week, setWeek] = useState<WeekKey>('this')
  // both weeks live in state so slot edits persist across the toggle.
  const [thisWeek, setThisWeek] = useState<Week>(THIS_WEEK)
  const [nextWeek, setNextWeek] = useState<Week>(NEXT_WEEK)

  const grid = week === 'this' ? thisWeek : nextWeek
  const setGrid = week === 'this' ? setThisWeek : setNextWeek

  const planned = grid.filter((d) => d !== null).length
  const open = grid.length - planned

  // clicking a slot: empty → assign next rotation recipe; filled → clear.
  const toggleSlot = (idx: number) => {
    setGrid((prev) => {
      const nextGrid = [...prev]
      if (nextGrid[idx] === null) {
        // pick the first rotation recipe not already on the board this week.
        const used = new Set(nextGrid.filter((d): d is string => d !== null))
        const pick = ROTATION.find((r) => !used.has(r)) ?? ROTATION[idx % ROTATION.length]
        nextGrid[idx] = pick
      } else {
        nextGrid[idx] = null
      }
      return nextGrid
    })
  }

  // "this week's recipes" — the distinct planned dinners, in order.
  const weeksRecipes = grid.filter((d): d is string => d !== null)

  const openLabel = open === 0 ? 'fully planned' : open === 1 ? 'one open' : `${numWord(open)} open`

  let ri = 0

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'transparent' }}>
      <style>{`
        @keyframes clearing-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-clearing] * { animation: none !important; }
        }
      `}</style>

      <div
        data-clearing
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '30px 32px 156px',
          fontFamily: sans,
        }}
      >
        {/* ── Header: kicker · week toggle ─────────────────────────────────── */}
        <Rise
          i={ri++}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ ...kicker, fontSize: 11, color: FAINT }}>Food · Meal plan</div>
          <Segmented<WeekKey>
            value={week}
            onChange={setWeek}
            options={[
              { value: 'this', label: 'This week' },
              { value: 'next', label: 'Next week' },
            ]}
          />
        </Rise>

        {/* ── Focal numeral: dinners planned this week ─────────────────────── */}
        <Rise
          i={ri++}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 20,
            marginTop: 30,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontFamily: display,
              fontSize: 88,
              lineHeight: 0.84,
              color: INK,
              fontFeatureSettings: '"lnum" 1',
              letterSpacing: '-0.02em',
            }}
          >
            {planned}
          </span>
          <span
            style={{
              fontFamily: serif,
              fontSize: 20,
              lineHeight: 1.35,
              color: BODY,
              maxWidth: 240,
              paddingBottom: 6,
            }}
          >
            dinners planned this week.
          </span>
        </Rise>

        <Rise i={ri++}>
          <div style={{ fontFamily: mono, fontSize: 11.5, color: MUTED, letterSpacing: '0.02em' }}>
            of 7 nights · <span style={{ color: ACCENT }}>{openLabel}</span>
          </div>
        </Rise>

        {/* ── The week grid: the centerpiece ──────────────────────────────── */}
        <div style={{ marginTop: 48 }}>
          <Rise i={ri++}>
            <GroupLabel>The week</GroupLabel>
          </Rise>
          <Rise i={ri++}>
            <Card style={{ padding: '4px 20px' }}>
              {DAYS.map((day, idx) => {
                const dinner = grid[idx]
                const lunch = LUNCHES[idx]
                const filled = dinner !== null
                return (
                  <button
                    key={day}
                    onClick={() => toggleSlot(idx)}
                    aria-label={filled ? `Clear ${day} dinner` : `Plan ${day} dinner`}
                    style={{
                      appearance: 'none',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                      padding: '14px 0',
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 16,
                    }}
                  >
                    {/* mono day label down the left */}
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 11,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: FAINT,
                        width: 34,
                        flexShrink: 0,
                      }}
                    >
                      {day}
                    </span>

                    {/* dinner slot + faint lunch line */}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {filled ? (
                        <span
                          style={{
                            fontSize: 15,
                            color: INK,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: 2,
                              background: ACCENT,
                              flexShrink: 0,
                            }}
                          />
                          {dinner}
                        </span>
                      ) : (
                        <span style={{ fontSize: 14, color: FAINT, fontStyle: 'italic' }}>
                          + plan a dinner
                        </span>
                      )}
                      {lunch && (
                        <span
                          style={{
                            display: 'block',
                            fontFamily: sans,
                            fontSize: 11.5,
                            color: FAINT,
                            marginTop: 3,
                          }}
                        >
                          lunch · {lunch}
                        </span>
                      )}
                    </span>

                    {/* the tiny action hint on the right */}
                    <span
                      style={{
                        ...kicker,
                        color: filled ? FAINT : ACCENT,
                        flexShrink: 0,
                        paddingTop: 2,
                      }}
                    >
                      {filled ? 'clear' : 'plan'}
                    </span>
                  </button>
                )
              })}
            </Card>
          </Rise>
        </div>

        {/* ── This week's recipes — each links to the recipes page ────────── */}
        <div style={{ marginTop: 48 }}>
          <Rise i={ri++}>
            <GroupLabel>This week&rsquo;s recipes</GroupLabel>
          </Rise>
          {weeksRecipes.length === 0 ? (
            <Rise i={ri++}>
              <div style={{ fontFamily: serif, fontSize: 14, fontStyle: 'italic', color: FAINT }}>
                Nothing planned yet — tap a night above to begin.
              </div>
            </Rise>
          ) : (
            weeksRecipes.map((r, idx) => (
              <Rise key={`${r}-${idx}`} i={ri++}>
                <button
                  onClick={() => openPage('recipes')}
                  style={{
                    appearance: 'none',
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                    padding: '13px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <span
                    style={{
                      fontFamily: mono,
                      fontSize: 11.5,
                      color: FAINT,
                      width: 34,
                      flexShrink: 0,
                    }}
                  >
                    {DAYS[grid.indexOf(r)] ?? ''}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: INK }}>{r}</span>
                  <span style={{ ...kicker, color: FAINT, flexShrink: 0 }}>open recipe →</span>
                </button>
              </Rise>
            ))
          )}
        </div>

        {/* ── Shortlist / rotation — favourites to pull from ──────────────── */}
        <div style={{ marginTop: 48 }}>
          <Rise i={ri++}>
            <GroupLabel>Shortlist · rotation</GroupLabel>
          </Rise>
          <Rise i={ri++}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ROTATION.map((r) => {
                const inWeek = grid.includes(r)
                return (
                  <button
                    key={r}
                    onClick={() => openPage('recipes')}
                    style={{
                      appearance: 'none',
                      cursor: 'pointer',
                      fontFamily: sans,
                      fontSize: 12.5,
                      color: inWeek ? INK : MUTED,
                      background: inWeek ? ACCENT_WASH : 'transparent',
                      border: `1px solid ${inWeek ? 'transparent' : LINE}`,
                      borderRadius: radius.pill,
                      padding: '7px 14px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                    }}
                  >
                    {inWeek && (
                      <span
                        aria-hidden
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 2,
                          background: ACCENT,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    {r}
                  </button>
                )
              })}
            </div>
          </Rise>
        </div>

        {/* ── Calm receipt summary + the single LIME CTA ──────────────────── */}
        <Rise i={ri++} style={{ marginTop: 48, maxWidth: 340 }}>
          <Receipt
            title={week === 'this' ? 'This week' : 'Next week'}
            rows={[
              ['planned', `${planned} dinners`, ACCENT],
              ['open', `${open} nights`],
              ['to buy', '12 ingredients'],
              ['out', '2 nights'],
            ]}
          />
          <div style={{ marginTop: 14 }}>
            <GenerateGroceriesButton
              onClick={() => {
                askPond('Build my grocery list from this week’s meal plan…')
                openPage('grocery')
              }}
            />
          </div>
        </Rise>

        {/* ── Closing serif exhale ────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 20 }}>
            <span style={{ fontFamily: serif, fontSize: 14, fontStyle: 'italic', color: FAINT }}>
              Two nights left open on purpose. Leftovers, or whatever the day asks for.
            </span>
          </div>
        </Rise>
      </div>
    </div>
  )
}

/** Tiny number-to-word for the calm caption (only small counts occur here). */
function numWord(n: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven']
  return words[n] ?? String(n)
}

/** The one LIME primary action on the page. */
function GenerateGroceriesButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        appearance: 'none',
        cursor: 'pointer',
        width: '100%',
        border: 'none',
        borderRadius: radius.pill,
        padding: '11px 22px',
        background: LIME,
        color: LIME_INK,
        fontFamily: sans,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: hover ? `0 4px 14px rgba(40,34,24,0.12)` : '0 1px 2px rgba(40,34,24,0.06)',
        transform: hover ? 'translateY(-1px)' : 'translateY(0)',
        transition: `transform 200ms ${EASE}, box-shadow 200ms ${EASE}`,
      }}
    >
      Generate groceries →
    </button>
  )
}
