'use client'

/**
 * v85 CLEARING — the "Trips" page.
 *
 * One focal element: an oversized Instrument-Serif numeral = days until the next
 * trip. Everything else recedes into air, hairlines, and mono. The next-trip Card
 * carries a calm prep checklist (DONE state is a muted olive, never lime-glow) and
 * a mono relations row. A Segmented control swaps Upcoming ↔ Past below. RUST is a
 * single dot of punctuation (passport expiring). LIME appears exactly once (Plan a
 * trip). Gentle staggered rise on mount, honoured only where motion is welcome.
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
  RUST,
  LIME,
  LIME_INK,
  DONE,
  DONE_INK,
  EASE,
  radius,
  kicker,
  Card,
  Spark,
  Segmented,
  KindDot,
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

// ── prep checklist for the next trip ─────────────────────────────────────────
interface Prep {
  id: string
  label: string
  done: boolean
  alarm?: boolean // one rust dot — passport expiring
}
const INITIAL_PREP: Prep[] = [
  { id: 'flights', label: 'Book flights', done: true },
  { id: 'passport', label: 'Renew passport', done: false, alarm: true },
  { id: 'airbnb', label: 'Confirm Airbnb', done: true },
  { id: 'itinerary', label: 'Draft day-1 itinerary', done: false },
]

// ── trips ────────────────────────────────────────────────────────────────────
interface Trip {
  place: string
  country: string
  dates: string
  days: number
  type: string
}
const UPCOMING: Trip[] = [
  { place: 'Lisbon', country: 'Portugal', dates: 'Sep 6 – 14', days: 8, type: 'Leisure' },
  { place: 'Porto', country: 'Portugal', dates: 'Sep 14 – 17', days: 3, type: 'Leisure' },
  { place: 'Berlin', country: 'Germany', dates: 'Nov 2 – 6', days: 4, type: 'Work' },
]

interface PastTrip {
  place: string
  dates: string
  rating: number // 1–5
}
const PAST: PastTrip[] = [
  { place: 'Kyoto, Japan', dates: 'Apr 3 – 12', rating: 5 },
  { place: 'Reykjavík, Iceland', dates: 'Feb 18 – 22', rating: 4 },
  { place: 'Austin, USA', dates: 'Mar 8 – 11', rating: 3 },
  { place: 'Mexico City, Mexico', dates: 'Jan 6 – 13', rating: 5 },
]

// a quiet wishlist at the foot of the page
const WISHLIST = ['Patagonia', 'Hokkaido', 'The Dolomites', 'Marrakesh']

// nights away per month — deterministic, no Math.random / new Date()
const NIGHTS = [3, 0, 4, 9, 2, 0, 5, 0, 11, 0, 4, 6]

type View = 'upcoming' | 'past'

const DAYS_UNTIL = 23

/** Five little stars — filled to `rating`, empty after. Faint, no color. */
function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, flexShrink: 0 }} aria-label={`${rating} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          aria-hidden
          style={{
            fontFamily: mono,
            fontSize: 11,
            color: n <= rating ? MUTED : HAIR,
            lineHeight: 1,
          }}
        >
          ★
        </span>
      ))}
    </span>
  )
}

export default function Trips(ctx: SurfaceCtx) {
  const { askPond } = ctx

  const [view, setView] = useState<View>('upcoming')
  const [prep, setPrep] = useState<Prep[]>(INITIAL_PREP)

  const togglePrep = (id: string) =>
    setPrep((rows) => rows.map((r) => (r.id === id ? { ...r, done: !r.done } : r)))

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
          maxWidth: 720,
          margin: '0 auto',
          padding: '30px 32px 156px',
          fontFamily: sans,
        }}
      >
        {/* ── Header: kicker · focal days-until numeral · calm serif caption ─── */}
        <Rise
          i={ri++}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ ...kicker, fontSize: 11, color: FAINT }}>Trips · personal</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ ...kicker, color: MUTED, marginBottom: 6 }}>Nights away · this year</div>
            <Spark data={NIGHTS} w={132} h={34} color={ACCENT} />
          </div>
        </Rise>

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
            {DAYS_UNTIL}
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
            days until Lisbon.
          </span>
        </Rise>

        <Rise i={ri++}>
          <div style={{ fontFamily: mono, fontSize: 11.5, color: MUTED, letterSpacing: '0.02em' }}>
            <span style={{ color: ACCENT }}>Sep 6</span> · 3 trips ahead · 15 nights away
          </div>
        </Rise>

        {/* ── Next trip: destination · dates · prep checklist · relations ───── */}
        <div style={{ marginTop: 48 }}>
          <Rise i={ri++}>
            <GroupLabel>Next trip</GroupLabel>
          </Rise>
          <Rise i={ri++}>
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 16,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span
                      style={{
                        fontFamily: display,
                        fontSize: 30,
                        lineHeight: 1,
                        color: INK,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      Lisbon
                    </span>
                    <span style={{ fontSize: 13, color: MUTED }}>Portugal</span>
                  </div>
                  <div
                    style={{
                      fontFamily: mono,
                      fontSize: 12,
                      color: MUTED,
                      marginTop: 8,
                      letterSpacing: '0.02em',
                    }}
                  >
                    Sep 6 – 14 · 8 days
                  </div>
                </div>
                <span style={{ ...kicker, color: ACCENT, letterSpacing: '0.16em' }}>Leisure</span>
              </div>

              <div style={{ fontFamily: serif, fontSize: 15, lineHeight: 1.45, color: BODY }}>
                Eight slow days — miradouros, pastéis, and a train down the coast.
              </div>

              {/* prep checklist — calm DONE, one rust dot on passport */}
              <div>
                <div style={{ ...kicker, marginBottom: 6 }}>Prep</div>
                {prep.map((p, idx) => (
                  <button
                    key={p.id}
                    onClick={() => togglePrep(p.id)}
                    style={{
                      appearance: 'none',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '11px 0',
                      borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                    }}
                  >
                    {/* check-circle — quietly done, never lime-glow */}
                    <span
                      aria-hidden
                      style={{
                        width: 17,
                        height: 17,
                        borderRadius: 999,
                        flexShrink: 0,
                        border: p.done ? 'none' : `1.5px solid ${LINE}`,
                        background: p.done ? DONE : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: `background 200ms ${EASE}`,
                      }}
                    >
                      {p.done && (
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                          <path
                            d="M1.5 5.2L4 7.6L8.6 2.4"
                            stroke={DONE_INK}
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 14,
                        color: p.done ? MUTED : INK,
                        textDecoration: p.done ? 'line-through' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      {p.label}
                      {p.alarm && !p.done && (
                        <span
                          aria-hidden
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 999,
                            background: RUST,
                            display: 'inline-block',
                          }}
                        />
                      )}
                    </span>
                    {p.alarm && !p.done && (
                      <span
                        style={{ fontFamily: mono, fontSize: 10.5, color: RUST, flexShrink: 0 }}
                      >
                        expires soon
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* relations row — mono, faint */}
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 11.5,
                  color: FAINT,
                  letterSpacing: '0.02em',
                  borderTop: `1px solid ${HAIR}`,
                  paddingTop: 14,
                }}
              >
                3 tasks · 4 docs · est. $2,400
              </div>
            </Card>
          </Rise>
        </div>

        {/* ── Upcoming ↔ Past — a Segmented that swaps the list below ───────── */}
        <div style={{ marginTop: 48 }}>
          <Rise
            i={ri++}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div style={{ ...kicker, color: FAINT }}>
              {view === 'upcoming' ? 'Upcoming' : 'Past · this year'}
            </div>
            <Segmented<View>
              value={view}
              onChange={setView}
              options={[
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'past', label: 'Past' },
              ]}
            />
          </Rise>

          {view === 'upcoming'
            ? UPCOMING.map((t, idx) => (
                <Rise key={`${t.place}-${t.dates}`} i={ri++}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 0',
                      borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                    }}
                  >
                    <KindDot area="personal" />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: INK }}>
                      {t.place}
                      <span style={{ fontFamily: sans, fontSize: 11.5, color: FAINT }}>
                        {' '}
                        · {t.country}
                      </span>
                    </span>
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 10,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: FAINT,
                        width: 70,
                        textAlign: 'right',
                      }}
                    >
                      {t.type}
                    </span>
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 12,
                        color: BODY,
                        width: 96,
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      {t.dates}
                    </span>
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 11.5,
                        color: FAINT,
                        width: 42,
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      {t.days}d
                    </span>
                  </div>
                </Rise>
              ))
            : PAST.map((t, idx) => (
                <Rise key={`${t.place}-${t.dates}`} i={ri++}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 0',
                      borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                    }}
                  >
                    <KindDot area="personal" />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: INK }}>
                      {t.place}
                    </span>
                    <Stars rating={t.rating} />
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 12,
                        color: BODY,
                        width: 96,
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      {t.dates}
                    </span>
                  </div>
                </Rise>
              ))}
        </div>

        {/* ── Destinations wishlist — a quiet, faint mini-list ──────────────── */}
        <div style={{ marginTop: 48 }}>
          <Rise i={ri++}>
            <GroupLabel>Destinations wishlist</GroupLabel>
          </Rise>
          {WISHLIST.map((w, idx) => (
            <Rise key={w} i={ri++}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 0',
                  borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: FAINT }}>{w}</span>
                <span style={{ fontFamily: mono, fontSize: 11, color: HAIR }}>someday</span>
              </div>
            </Rise>
          ))}
        </div>

        {/* ── The single LIME primary action ────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 44, maxWidth: 340 }}>
          <PlanTripButton onClick={() => askPond('Plan a trip…')} />
        </Rise>

        {/* ── Closing serif exhale ──────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 20 }}>
            <span style={{ fontFamily: serif, fontSize: 14, fontStyle: 'italic', color: FAINT }}>
              The bags aren’t packed yet. There’s still time to be somewhere else.
            </span>
          </div>
        </Rise>
      </div>
    </div>
  )
}

/** The one LIME primary action on the page. */
function PlanTripButton({ onClick }: { onClick: () => void }) {
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
      + Plan a trip
    </button>
  )
}
