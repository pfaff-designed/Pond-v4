'use client'

/**
 * v85 CLEARING — the "Workout Routine" page.
 *
 * One focal element: an oversized Instrument-Serif "Day 3" label = today's slot in
 * the marathon block. Everything else recedes into air, hairlines, and a few
 * soft-shadow module cards. Sage ACCENT is the ambient tint (today highlight,
 * completed-day KindDots, mileage spark), LIME appears exactly once (Start session)
 * AND as the "set done" check, RUST is a single punctuation mark (the live streak on
 * the receipt). Checking a set pip bumps a live "6 / 14 sets" count. Slow staggered
 * rise on mount, disabled under prefers-reduced-motion.
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
  CARD,
  ACCENT,
  ACCENT_SOFT,
  LIME,
  LIME_INK,
  RUST,
  EASE,
  radius,
  kicker,
  Card,
  KindDot,
  Spark,
  Receipt,
} from '../ui'
import type { SurfaceCtx } from '../shell-types'

/** Staggered rise-on-mount wrapper. index drives the delay. */
function Rise({ i, children, style }: { i: number; children: React.ReactNode; style?: React.CSSProperties }) {
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

// ── inline seed data (lived-in, deterministic, no imports from ../data) ─────────

interface Exercise {
  name: string
  scheme: string // sets × reps
  target: string // weight / pace
  sets: number
}
const TODAY_SESSION = 'Legs + core'
const TODAY_EXERCISES: Exercise[] = [
  { name: 'Back squat', scheme: '4 × 5', target: '225 lb', sets: 4 },
  { name: 'Romanian deadlift', scheme: '3 × 8', target: '185 lb', sets: 3 },
  { name: 'Walking lunge', scheme: '3 × 12', target: '2 × 35 lb', sets: 3 },
  { name: 'Calf raise', scheme: '2 × 15', target: 'bodyweight + 45', sets: 2 },
  { name: 'Hanging leg raise', scheme: '2 × 12', target: 'slow tempo', sets: 2 },
]
const TOTAL_SETS = TODAY_EXERCISES.reduce((n, e) => n + e.sets, 0) // 14

type DayState = 'done' | 'today' | 'upcoming'
interface Day {
  label: string // Mon
  focus: string
  state: DayState
}
const WEEK: Day[] = [
  { label: 'Mon', focus: 'Easy run', state: 'done' },
  { label: 'Tue', focus: 'Push', state: 'done' },
  { label: 'Wed', focus: 'Tempo', state: 'done' },
  { label: 'Thu', focus: 'Legs + core', state: 'today' },
  { label: 'Fri', focus: 'Pull', state: 'upcoming' },
  { label: 'Sat', focus: 'Rest', state: 'upcoming' },
  { label: 'Sun', focus: 'Long run', state: 'upcoming' },
]

// weekly mileage across the marathon build (last 8 weeks) — for the mileage spark
const WEEKLY_MILES = [22, 26, 24, 30, 33, 31, 37, 41]

export default function Workout(ctx: SurfaceCtx) {
  // one boolean per set, keyed "exerciseIndex-setIndex"
  const [doneSets, setDoneSets] = useState<Record<string, boolean>>({})
  const [started, setStarted] = useState(false)

  const doneCount = Object.values(doneSets).filter(Boolean).length

  const toggleSet = (key: string) =>
    setDoneSets((prev) => ({ ...prev, [key]: !prev[key] }))

  // Stagger index that keeps walking down the whole page.
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
        {/* ── Header: kicker · focal display label · calm serif line ────────── */}
        <Rise i={ri++}>
          <div style={{ ...kicker, fontSize: 11 }}>Workout · Marathon block · Week 7</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 10 }}>
            <span style={{ fontFamily: display, fontSize: 84, lineHeight: 0.9, color: INK }}>Day 3</span>
            <span style={{ fontFamily: serif, fontSize: 20, color: MUTED, fontStyle: 'italic' }}>Legs.</span>
          </div>
          <div style={{ fontFamily: serif, fontSize: 15.5, color: MUTED, marginTop: 12, lineHeight: 1.5 }}>
            Building mileage this week — Sunday&rsquo;s long run is the anchor.
          </div>
        </Rise>

        {/* ── Today — session card with checkable set pips ──────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <div style={{ ...kicker }}>Today</div>
            <div style={{ fontFamily: sans, fontSize: 12.5, color: MUTED }}>
              <span style={{ color: doneCount > 0 ? INK : MUTED, fontWeight: 600 }}>{doneCount}</span> / {TOTAL_SETS} sets
            </div>
          </div>
          <Card>
            <div style={{ fontFamily: serif, fontSize: 22, color: INK }}>{TODAY_SESSION}</div>
            <div style={{ fontFamily: sans, fontSize: 12.5, color: FAINT, marginTop: 2 }}>
              Strength · {TOTAL_SETS} working sets
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 16 }}>
              {TODAY_EXERCISES.map((ex, exi) => (
                <div
                  key={ex.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '13px 0',
                    borderTop: exi === 0 ? 'none' : `1px solid ${HAIR}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: serif, fontSize: 17, color: INK }}>{ex.name}</div>
                    <div style={{ fontFamily: sans, fontSize: 12, color: MUTED, marginTop: 2 }}>
                      {ex.scheme} · {ex.target}
                    </div>
                  </div>
                  {/* one checkable pip per set */}
                  <div style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
                    {Array.from({ length: ex.sets }).map((_, si) => {
                      const key = `${exi}-${si}`
                      const on = !!doneSets[key]
                      return (
                        <button
                          key={key}
                          onClick={() => toggleSet(key)}
                          aria-pressed={on}
                          aria-label={`${ex.name} set ${si + 1}`}
                          style={{
                            width: 18,
                            height: 18,
                            padding: 0,
                            borderRadius: radius.pill,
                            cursor: 'pointer',
                            border: on ? 'none' : `1.5px solid ${FAINT}`,
                            background: on ? LIME : 'transparent',
                            color: LIME_INK,
                            display: 'grid',
                            placeItems: 'center',
                            fontFamily: sans,
                            fontSize: 11,
                            lineHeight: 1,
                            transition: `transform 180ms ${EASE}, background 180ms ${EASE}`,
                            transform: on ? 'scale(1.06)' : 'scale(1)',
                          }}
                        >
                          {on ? '✓' : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Rise>

        {/* ── This week split — Mon–Sun mini grid ──────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ ...kicker, marginBottom: 14 }}>This week</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
            {WEEK.map((d) => {
              const isToday = d.state === 'today'
              const isDone = d.state === 'done'
              return (
                <div
                  key={d.label}
                  style={{
                    background: isToday ? ACCENT_SOFT : CARD,
                    border: `1px solid ${isToday ? 'transparent' : LINE}`,
                    borderRadius: radius.chip,
                    padding: '12px 8px',
                    textAlign: 'center',
                    opacity: d.state === 'upcoming' ? 0.62 : 1,
                  }}
                >
                  <div
                    style={{
                      fontFamily: mono,
                      fontSize: 10,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: isToday ? ACCENT : FAINT,
                    }}
                  >
                    {d.label}
                  </div>
                  <div
                    style={{
                      fontFamily: serif,
                      fontSize: 13,
                      color: d.state === 'upcoming' ? MUTED : INK,
                      marginTop: 8,
                      lineHeight: 1.25,
                      minHeight: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {d.focus}
                  </div>
                  <div style={{ height: 10, marginTop: 6, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {isDone && <KindDot area="health" size={7} />}
                  </div>
                </div>
              )
            })}
          </div>
        </Rise>

        {/* ── Marathon tie-in — weekly mileage spark + next long run ────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 24,
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ ...kicker, marginBottom: 6 }}>Next long run</div>
              <div style={{ fontFamily: serif, fontSize: 20, color: INK }}>Sunday · 16 mi</div>
              <div style={{ fontFamily: sans, fontSize: 12.5, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
                Easy effort, ~9:10/mi. The anchor of the build.
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...kicker, marginBottom: 8 }}>Weekly miles · 8 wks</div>
              <Spark data={WEEKLY_MILES} w={168} h={44} />
            </div>
          </div>
        </Rise>

        {/* ── This week — receipt ──────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46, maxWidth: 320 }}>
          <Receipt
            title="This week"
            rows={[
              ['sessions', '3 / 7'],
              ['total volume', '18,400 lb'],
              ['miles', '37'],
              ['streak', '9 days', RUST],
            ]}
          />
        </Rise>

        {/* ── The single LIME CTA ──────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 44 }}>
          <button
            onClick={() => {
              setStarted(true)
              ctx.askPond('Start today’s session — Legs + core. Coach me set by set.')
            }}
            style={{
              appearance: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: sans,
              fontSize: 13.5,
              fontWeight: 600,
              color: LIME_INK,
              background: LIME,
              padding: '11px 20px',
              borderRadius: radius.pill,
              boxShadow: '0 1px 2px rgba(40,34,24,0.10)',
              transition: `transform 200ms ${EASE}, opacity 200ms ${EASE}`,
            }}
          >
            {started ? 'Session live — go.' : 'Start session'}
          </button>
        </Rise>

        {/* faint closing note in flat body */}
        <div style={{ fontFamily: sans, fontSize: 12, color: FAINT, marginTop: 18, lineHeight: 1.6 }}>
          {doneCount === TOTAL_SETS ? 'All sets done. Recover well.' : `${TOTAL_SETS - doneCount} sets to go.`}
        </div>
      </div>
    </div>
  )
}
