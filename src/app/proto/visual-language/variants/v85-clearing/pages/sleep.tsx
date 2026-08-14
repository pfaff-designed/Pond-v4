'use client'

/**
 * v85 CLEARING — the "Sleep" page.
 *
 * Sleep is a headline number across the app (7.1h, up 4%) — it deserves a home.
 * One focal element: an oversized Instrument-Serif "7.1h" = the week's average.
 * A nightly-hours Spark, a Mon–Sun bar grid keyed to the 7.5h target, contributing
 * factors as checkable habits, and a bed/wake-consistency receipt give it parity
 * with the Workout page. Sage ACCENT is the ambient tint, LIME appears once (the
 * habit checks) — RUST is a single punctuation mark (the one short night).
 * Staggered rise on mount, disabled under prefers-reduced-motion.
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
  DONE,
  DONE_INK,
  EASE,
  radius,
  kicker,
  Card,
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

const TARGET = 7.5

interface Night {
  day: string
  hours: number
  bed: string
  wake: string
}
const WEEK: Night[] = [
  { day: 'Mon', hours: 7.4, bed: '10:48', wake: '06:12' },
  { day: 'Tue', hours: 6.2, bed: '11:40', wake: '05:54' }, // the one short night — RUST
  { day: 'Wed', hours: 7.1, bed: '10:55', wake: '06:02' },
  { day: 'Thu', hours: 7.6, bed: '10:32', wake: '06:08' },
  { day: 'Fri', hours: 7.9, bed: '10:20', wake: '06:14' },
  { day: 'Sat', hours: 6.9, bed: '11:30', wake: '06:24' },
  { day: 'Sun', hours: 7.4, bed: '10:50', wake: '06:14' },
]

// nightly hours across the last 14 nights — the spark
const NIGHTLY = [6.8, 7.2, 6.5, 7.4, 7.0, 6.9, 7.3, 7.4, 6.2, 7.1, 7.6, 7.9, 6.9, 7.4]

interface Factor {
  label: string
  detail: string
  helps: boolean
}
const FACTORS: Factor[] = [
  { label: 'Cooler bedroom (65°F)', detail: 'The lever that moved the average', helps: true },
  { label: 'No screens after 10pm', detail: 'Held 5 of 7 nights', helps: true },
  { label: 'Magnesium before bed', detail: 'New this week', helps: true },
  { label: 'Late caffeine', detail: 'Tuesday espresso cost you an hour', helps: false },
]

export default function Sleep(ctx: SurfaceCtx) {
  // contributing factors are checkable habits
  const [on, setOn] = useState<Record<string, boolean>>({
    'Cooler bedroom (65°F)': true,
    'No screens after 10pm': true,
    'Magnesium before bed': true,
  })
  const [logged, setLogged] = useState(false)

  const avg = 7.1
  const kept = FACTORS.filter((f) => f.helps && on[f.label]).length
  const helping = FACTORS.filter((f) => f.helps).length

  const maxH = Math.max(...WEEK.map((n) => n.hours), TARGET)

  let ri = 0

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'transparent' }}>
      <style>{`
        @keyframes clearing-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes clearing-grow {
          from { transform: scaleY(0); }
          to   { transform: scaleY(1); }
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
        {/* ── Header: kicker · focal average · calm serif line ──────────────── */}
        <Rise i={ri++}>
          <div style={{ ...kicker, fontSize: 11 }}>Health · Sleep · This week</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginTop: 10 }}>
            <span style={{ fontFamily: display, fontSize: 88, lineHeight: 0.86, color: INK, letterSpacing: '-0.02em' }}>
              7.1h
            </span>
            <span style={{ fontFamily: serif, fontSize: 20, lineHeight: 1.35, color: BODY, maxWidth: 240, paddingBottom: 6 }}>
              average a night — <span style={{ color: ACCENT }}>up 4%</span> on last week.
            </span>
          </div>
          <div style={{ fontFamily: mono, fontSize: 11.5, color: MUTED, marginTop: 14 }}>
            <span style={{ color: ACCENT }}>▲ 0.3h</span> vs last week · target {TARGET}h
          </div>
        </Rise>

        {/* ── Nightly trend + this-week bar grid ────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 44 }}>
          <Card style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ ...kicker, marginBottom: 8 }}>Nightly hours · 14 nights</div>
                <Spark data={NIGHTLY} w={220} h={46} color={ACCENT} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: mono }}>
                <Stat k="best" v="7.9h" accent={ACCENT} />
                <Stat k="shortest" v="6.2h" accent={RUST} />
                <Stat k="consistency" v="86%" />
              </div>
            </div>

            {/* Mon–Sun bars, keyed to the target line */}
            <div>
              <div style={{ ...kicker, marginBottom: 12 }}>This week</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, alignItems: 'end', height: 120 }}>
                {WEEK.map((n, idx) => {
                  const short = n.hours < 6.5
                  const h = Math.round((n.hours / maxH) * 100)
                  return (
                    <div key={n.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                      <div style={{ fontFamily: mono, fontSize: 10.5, color: short ? RUST : MUTED }}>{n.hours}</div>
                      <div style={{ width: '100%', maxWidth: 26, height: `${h}%`, position: 'relative', borderRadius: radius.chip, overflow: 'hidden', background: HAIR }}>
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: radius.chip,
                            background: short ? RUST : ACCENT,
                            transformOrigin: 'bottom',
                            animation: `clearing-grow 640ms ${EASE} both`,
                            animationDelay: `${140 + idx * 60}ms`,
                          }}
                        />
                      </div>
                      <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: FAINT }}>
                        {n.day}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        </Rise>

        {/* ── Contributing factors — checkable habits ───────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <div style={{ ...kicker }}>What’s moving it</div>
            <div style={{ fontFamily: sans, fontSize: 12.5, color: MUTED }}>
              <span style={{ color: kept > 0 ? INK : MUTED, fontWeight: 600 }}>{kept}</span> / {helping} habits kept
            </div>
          </div>
          <Card style={{ padding: '8px 20px' }}>
            {FACTORS.map((f, idx) => {
              const checked = !!on[f.label]
              return (
                <div
                  key={f.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '13px 0',
                    borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                  }}
                >
                  {f.helps ? (
                    <button
                      onClick={() => setOn((p) => ({ ...p, [f.label]: !p[f.label] }))}
                      aria-pressed={checked}
                      aria-label={f.label}
                      style={{
                        width: 18,
                        height: 18,
                        flexShrink: 0,
                        padding: 0,
                        borderRadius: radius.pill,
                        cursor: 'pointer',
                        border: checked ? 'none' : `1.5px solid ${FAINT}`,
                        background: checked ? DONE : 'transparent',
                        color: DONE_INK,
                        display: 'grid',
                        placeItems: 'center',
                        fontFamily: sans,
                        fontSize: 11,
                        lineHeight: 1,
                        transition: `transform 180ms ${EASE}, background 180ms ${EASE}`,
                        transform: checked ? 'scale(1)' : 'scale(1)',
                      }}
                    >
                      {checked ? '✓' : ''}
                    </button>
                  ) : (
                    <span
                      aria-hidden
                      style={{ width: 18, flexShrink: 0, display: 'grid', placeItems: 'center' }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: RUST }} />
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: serif, fontSize: 16, color: f.helps ? INK : MUTED }}>{f.label}</div>
                    <div style={{ fontFamily: sans, fontSize: 12, color: f.helps ? MUTED : RUST, marginTop: 2 }}>{f.detail}</div>
                  </div>
                </div>
              )
            })}
          </Card>
        </Rise>

        {/* ── Rhythm receipt + the single LIME CTA ──────────────────────────── */}
        <div style={{ marginTop: 46, display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Rise i={ri++} style={{ flex: 1, minWidth: 240 }}>
            <Receipt
              title="Rhythm"
              rows={[
                ['avg bedtime', '10:50'],
                ['avg wake', '06:10'],
                ['avg sleep', '7.1h', ACCENT],
                ['short nights', '1', RUST],
              ]}
            />
          </Rise>
          <Rise i={ri++}>
            <button
              onClick={() => {
                setLogged(true)
                ctx.askPond('Log last night’s sleep — bedtime, wake, how I feel.')
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
              {logged ? 'How did you sleep?' : 'Log last night'}
            </button>
          </Rise>
        </div>

        {/* closing serif exhale */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 20 }}>
            <span style={{ fontFamily: serif, fontSize: 14, fontStyle: 'italic', color: FAINT }}>
              The cooler room is working. Keep the screens off and the average holds.
            </span>
          </div>
        </Rise>
      </div>
    </div>
  )
}

/** A single mono summary stat: tiny mono key over a value. */
function Stat({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ ...kicker, color: FAINT }}>{k}</span>
      <span style={{ fontFamily: mono, fontSize: 15, color: accent || INK }}>{v}</span>
    </div>
  )
}
