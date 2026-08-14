'use client'

/**
 * v85 CLEARING — the "Wishlist" page (area: creativity).
 *
 * A Products wishlist + Price Tracker for the maker life. One focal element: an
 * oversized Instrument-Serif numeral = items tracked. Everything else recedes into
 * air, hairlines, and mono. Each item carries a calm sage Spark of its price
 * history, current-vs-target in mono, and a status tag. A price DROP reads as
 * good news (sage ACCENT); exactly ONE item carries a rust "price went UP" note.
 * LIME appears once (Track a product). Gentle staggered rise on mount.
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
  ACCENT_SOFT,
  RUST,
  LIME,
  LIME_INK,
  EASE,
  radius,
  kicker,
  Card,
  Spark,
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

type Filter = 'all' | 'dropped' | 'got'

interface Item {
  id: string
  name: string
  note: string
  current: number // current price, USD
  target: number // the price I'm waiting for
  history: number[] // deterministic price series; last point = current
  dropped: boolean // price recently fell
  up?: boolean // the single item whose price ticked UP
}

// Deterministic price series — the last value equals `current`.
const ITEMS: Item[] = [
  {
    id: 'festool-tsc55',
    name: 'Festool track saw',
    note: 'TSC 55 cordless · the clean-crosscut dream',
    current: 585,
    target: 620,
    history: [660, 660, 649, 649, 630, 649, 619, 585],
    dropped: true,
  },
  {
    id: 'walnut-boards',
    name: 'Walnut boards (8 bf)',
    note: '4/4 kiln-dried · for the hall table',
    current: 96,
    target: 90,
    history: [84, 86, 88, 90, 92, 90, 95, 96],
    dropped: false,
    up: true,
  },
  {
    id: 'bench-chisels',
    name: 'Bench chisels set',
    note: 'Six-piece · dovetail-ready',
    current: 148,
    target: 150,
    history: [175, 175, 168, 168, 159, 159, 154, 148],
    dropped: true,
  },
  {
    id: 'garmin-fr',
    name: 'Garmin Forerunner',
    note: '265 · for the long slow miles',
    current: 429,
    target: 380,
    history: [449, 449, 449, 429, 429, 429, 429, 429],
    dropped: false,
  },
  {
    id: 'a3-print',
    name: 'A3 print of the coast road',
    note: 'Archival · the one from the drive north',
    current: 68,
    target: 60,
    history: [72, 72, 70, 70, 68, 68, 68, 68],
    dropped: false,
  },
  {
    id: 'oled-monitor',
    name: 'OLED reference monitor',
    note: '27" · for grading the print work',
    current: 899,
    target: 800,
    history: [999, 999, 949, 949, 929, 899, 899, 899],
    dropped: false,
  },
]

const fmtUsd = (n: number) => '$' + n.toLocaleString('en-US')

export default function Wishlist(ctx: SurfaceCtx) {
  const { askPond } = ctx

  const [filter, setFilter] = useState<Filter>('all')
  // items marked "Got it" live here — greyed, moved out of the wanting list.
  const [got, setGot] = useState<Record<string, boolean>>({})

  const markGot = (id: string) => setGot((g) => ({ ...g, [id]: true }))

  const tracked = ITEMS.filter((it) => !got[it.id]).length
  const droppedCount = ITEMS.filter(
    (it) => !got[it.id] && (it.dropped || it.current <= it.target)
  ).length

  // the freshest drop — surfaced in the Pond "best time to buy" note.
  const bestBuy = ITEMS.find((it) => !got[it.id] && it.dropped) ?? null

  const visible = ITEMS.filter((it) => {
    if (filter === 'got') return !!got[it.id]
    if (got[it.id]) return false
    if (filter === 'dropped') return it.dropped || it.current <= it.target
    return true
  })

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
        {/* ── Header: kicker · focal "items tracked" numeral · calm serif line ── */}
        <Rise
          i={ri++}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ ...kicker, fontSize: 11, color: FAINT }}>Wishlist · Creativity</div>
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
            {tracked}
          </span>
          <span
            style={{
              fontFamily: serif,
              fontSize: 20,
              lineHeight: 1.35,
              color: BODY,
              maxWidth: 260,
              paddingBottom: 6,
            }}
          >
            things you’re waiting on the right moment for.
          </span>
        </Rise>

        <Rise i={ri++}>
          <div style={{ fontFamily: mono, fontSize: 11.5, color: MUTED, letterSpacing: '0.02em' }}>
            tracked · <span style={{ color: ACCENT }}>{droppedCount} dropped in price</span>
          </div>
        </Rise>

        {/* ── Best time to buy: a calm serif Pond note in a sage tint ────────── */}
        {bestBuy && (
          <Rise i={ri++} style={{ marginTop: 34 }}>
            <div
              style={{
                borderRadius: radius.soft,
                background: ACCENT_SOFT,
                padding: '16px 18px',
              }}
            >
              <div style={{ ...kicker, color: ACCENT, marginBottom: 8 }}>Best time to buy</div>
              <div style={{ fontFamily: serif, fontSize: 16, lineHeight: 1.5, color: BODY }}>
                The <span style={{ color: INK }}>{bestBuy.name}</span> just slid to{' '}
                <span style={{ fontFamily: mono, fontSize: 14, color: ACCENT }}>
                  {fmtUsd(bestBuy.current)}
                </span>{' '}
                — the lowest it’s been all season. If you were going to, this is the window.
              </div>
            </div>
          </Rise>
        )}

        {/* ── Filter: All / Price dropped / Got it ──────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 40, marginBottom: 18 }}>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'dropped', label: 'Price dropped' },
              { value: 'got', label: 'Got it' },
            ]}
          />
        </Rise>

        {/* ── The list — a small Card per item ──────────────────────────────── */}
        {visible.length === 0 ? (
          <Rise i={ri++}>
            <div
              style={{
                fontFamily: serif,
                fontSize: 15,
                fontStyle: 'italic',
                color: FAINT,
                padding: '18px 0',
              }}
            >
              Nothing here yet.
            </div>
          </Rise>
        ) : (
          visible.map((it) => {
            const owned = !!got[it.id]
            const good = !owned && (it.dropped || it.current <= it.target)
            const diff = it.current - it.target
            return (
              <Rise key={it.id} i={ri++} style={{ marginBottom: 12 }}>
                <Card style={{ opacity: owned ? 0.55 : 1, transition: `opacity 300ms ${EASE}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 500,
                          color: INK,
                          textDecoration: owned ? 'line-through' : 'none',
                        }}
                      >
                        {it.name}
                      </div>
                      <div style={{ fontFamily: sans, fontSize: 11.5, color: FAINT, marginTop: 3 }}>
                        {it.note}
                      </div>

                      {/* status tag row */}
                      <div
                        style={{
                          marginTop: 12,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          flexWrap: 'wrap',
                        }}
                      >
                        {owned ? (
                          <span style={{ ...kicker, color: MUTED }}>Got it</span>
                        ) : good ? (
                          <Tag color={ACCENT}>↓ {fmtUsd(Math.abs(diff))} · good time</Tag>
                        ) : (
                          <span style={{ ...kicker, color: FAINT }}>
                            {fmtUsd(diff)} over target
                          </span>
                        )}
                        {!owned && it.up && (
                          <span style={{ fontFamily: mono, fontSize: 11, color: RUST }}>
                            ↑ $15 this week
                          </span>
                        )}
                      </div>
                    </div>

                    {/* right rail — spark + prices + action */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: 8,
                        flexShrink: 0,
                      }}
                    >
                      <Spark data={it.history} w={112} h={34} color={ACCENT} />
                      <div style={{ fontFamily: mono, fontSize: 13, color: INK }}>
                        {fmtUsd(it.current)}
                      </div>
                      <div style={{ fontFamily: mono, fontSize: 10.5, color: FAINT }}>
                        target {fmtUsd(it.target)}
                      </div>
                      {!owned && (
                        <button
                          onClick={() => markGot(it.id)}
                          style={{
                            appearance: 'none',
                            cursor: 'pointer',
                            marginTop: 2,
                            border: `1px solid ${LINE}`,
                            borderRadius: radius.pill,
                            padding: '5px 13px',
                            background: 'transparent',
                            color: MUTED,
                            fontFamily: sans,
                            fontSize: 11.5,
                            fontWeight: 500,
                            transition: `all 200ms ${EASE}`,
                          }}
                        >
                          Got it
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              </Rise>
            )
          })
        )}

        {/* ── The one LIME primary action ───────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 30, maxWidth: 340 }}>
          <TrackButton onClick={() => askPond('Track a product…')} />
        </Rise>

        {/* ── Closing serif exhale ──────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 20 }}>
            <span style={{ fontFamily: serif, fontSize: 14, fontStyle: 'italic', color: FAINT }}>
              Want it long enough and the price usually comes to you.
            </span>
          </div>
        </Rise>
      </div>
    </div>
  )
}

/** A small pill tag — used for the sage "good time" status. */
function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: radius.pill,
        padding: '3px 10px',
        background: ACCENT_SOFT,
        color,
        fontFamily: mono,
        fontSize: 11,
        letterSpacing: '0.02em',
      }}
    >
      {children}
    </span>
  )
}

/** The one LIME primary action on the page. */
function TrackButton({ onClick }: { onClick: () => void }) {
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
      + Track a product
    </button>
  )
}
