'use client'

/**
 * v85 CLEARING — the "Library" page (Reading & Media, area "personal").
 *
 * One focal element: an oversized Instrument-Serif numeral = books finished this
 * year. A sage Ring holds the reading goal. A Segmented swaps the whole body
 * between Books and Screen. Progress bars are thin hairline-track bars with sage
 * fill (the finance bar pattern); genre bars are thin ACCENT hairlines. Stars are
 * deterministic. LIME appears exactly once (Log a book). One rare RUST dot. Gentle
 * staggered rise on mount, honoured only where motion is welcome.
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
  EASE,
  radius,
  kicker,
  Card,
  Ring,
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

/** Deterministic 1–5 star row (filled/empty), sized small and quiet. */
function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} of 5`} style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          aria-hidden
          style={{
            fontFamily: sans,
            fontSize: 11,
            lineHeight: 1,
            color: n <= rating ? ACCENT : HAIR,
          }}
        >
          {n <= rating ? '★' : '☆'}
        </span>
      ))}
    </span>
  )
}

// ── BOOKS ─────────────────────────────────────────────────────────────────────
interface Reading {
  title: string
  author: string
  pct: number // fraction read
}
const READING: Reading[] = [
  { title: 'The Overstory', author: 'Richard Powers', pct: 0.62 },
  { title: 'A Pattern Language', author: 'Christopher Alexander', pct: 0.18 },
]

interface Finished {
  title: string
  author: string
  rating: number
  date: string
}
const FINISHED: Finished[] = [
  { title: 'Piranesi', author: 'Susanna Clarke', rating: 5, date: '08·02' },
  { title: 'The Dispossessed', author: 'Ursula K. Le Guin', rating: 5, date: '07·19' },
  { title: 'Klara and the Sun', author: 'Kazuo Ishiguro', rating: 4, date: '07·04' },
  { title: 'Braiding Sweetgrass', author: 'Robin Wall Kimmerer', rating: 5, date: '06·21' },
  { title: 'The Vanishing Half', author: 'Brit Bennett', rating: 3, date: '06·02' },
  { title: 'Project Hail Mary', author: 'Andy Weir', rating: 4, date: '05·16' },
]

interface Genre {
  label: string
  count: number
}
const GENRES: Genre[] = [
  { label: 'Literary fiction', count: 9 },
  { label: 'Science fiction', count: 6 },
  { label: 'Nature & essay', count: 4 },
  { label: 'Design & craft', count: 3 },
  { label: 'History', count: 1 },
]
const GENRE_MAX = Math.max(...GENRES.map((g) => g.count))

// ── SCREEN ────────────────────────────────────────────────────────────────────
interface WatchItem {
  id: string
  title: string
  year: number
  type: 'Film' | 'Series'
}
const WATCHLIST: WatchItem[] = [
  { id: 'w1', title: 'Perfect Days', year: 2023, type: 'Film' },
  { id: 'w2', title: 'Shōgun', year: 2024, type: 'Series' },
  { id: 'w3', title: 'The Zone of Interest', year: 2023, type: 'Film' },
  { id: 'w4', title: 'Ripley', year: 2024, type: 'Series' },
  { id: 'w5', title: 'La Chimera', year: 2023, type: 'Film' },
]

interface Watched {
  title: string
  type: 'Film' | 'Series'
  rating: number
  date: string
}
const WATCHED: Watched[] = [
  { title: 'Past Lives', type: 'Film', rating: 5, date: '08·05' },
  { title: 'The Bear · S3', type: 'Series', rating: 4, date: '07·28' },
  { title: 'Oppenheimer', type: 'Film', rating: 5, date: '07·10' },
  { title: 'Aftersun', type: 'Film', rating: 4, date: '06·30' },
]

const BOOKS_DONE = 23
const BOOKS_GOAL = 30

type View = 'books' | 'screen'

export default function Library(ctx: SurfaceCtx) {
  const { askPond } = ctx

  const [view, setView] = useState<View>('books')
  const [watchedIds, setWatchedIds] = useState<Set<string>>(() => new Set())

  const remaining = WATCHLIST.filter((w) => !watchedIds.has(w.id)).length
  const goalPct = BOOKS_DONE / BOOKS_GOAL

  let ri = 0

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'transparent' }}>
      <style>{`
        @keyframes clearing-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes clearing-bar {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
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
        {/* ── Header: kicker · Segmented view swap ─────────────────────────── */}
        <Rise
          i={ri++}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ ...kicker, fontSize: 11, color: FAINT }}>Library · 2026</div>
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: 'books', label: 'Books' },
              { value: 'screen', label: 'Screen' },
            ]}
          />
        </Rise>

        {/* ── Focal numeral: books finished this year + reading-goal ring ───── */}
        <Rise
          i={ri++}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 28,
            marginTop: 30,
            marginBottom: 6,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
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
              {BOOKS_DONE}
            </span>
            <span
              style={{
                fontFamily: serif,
                fontSize: 20,
                lineHeight: 1.35,
                color: BODY,
                maxWidth: 230,
                paddingBottom: 6,
              }}
            >
              books finished this year.
            </span>
          </div>
          <Ring pct={goalPct} size={104} label={`${BOOKS_DONE}/${BOOKS_GOAL}`} sub="reading goal" />
        </Rise>

        <Rise i={ri++}>
          <div style={{ fontFamily: mono, fontSize: 11.5, color: MUTED, letterSpacing: '0.02em' }}>
            of {BOOKS_GOAL} · <span style={{ color: ACCENT }}>a book a fortnight</span>
          </div>
        </Rise>

        {view === 'books' ? (
          <>
            {/* ── Currently reading: thin progress bars, sage fill ─────────── */}
            <div style={{ marginTop: 48 }}>
              <Rise i={ri++}>
                <GroupLabel>Currently reading</GroupLabel>
              </Rise>
              <Rise i={ri++}>
                <Card style={{ padding: '8px 20px' }}>
                  {READING.map((r, idx) => (
                    <div
                      key={r.title}
                      style={{
                        padding: '15px 0',
                        borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                          marginBottom: 9,
                          gap: 12,
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 500, color: INK }}>
                          {r.title}
                          <span
                            style={{
                              display: 'block',
                              fontFamily: sans,
                              fontSize: 11.5,
                              color: FAINT,
                              marginTop: 2,
                            }}
                          >
                            {r.author}
                          </span>
                        </span>
                        <span
                          style={{ fontFamily: mono, fontSize: 12, color: MUTED, flexShrink: 0 }}
                        >
                          {Math.round(r.pct * 100)}%
                        </span>
                      </div>
                      <div
                        style={{
                          position: 'relative',
                          height: 4,
                          borderRadius: 999,
                          background: HAIR,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: `${r.pct * 100}%`,
                            borderRadius: 999,
                            background: ACCENT,
                            transformOrigin: 'left',
                            animation: `clearing-bar 640ms ${EASE} both`,
                            animationDelay: `${140 + idx * 60}ms`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </Card>
              </Rise>
            </div>

            {/* ── Recently finished: title · author · stars · mono date ────── */}
            <div style={{ marginTop: 48 }}>
              <Rise i={ri++}>
                <GroupLabel>Recently finished</GroupLabel>
              </Rise>
              {FINISHED.map((f, idx) => (
                <Rise key={f.title} i={ri++}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '13px 0',
                      borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: INK }}>
                      {f.title}
                      <span
                        style={{
                          display: 'block',
                          fontFamily: sans,
                          fontSize: 11.5,
                          color: FAINT,
                          marginTop: 2,
                        }}
                      >
                        {f.author}
                      </span>
                    </span>
                    <Stars rating={f.rating} />
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 11.5,
                        color: FAINT,
                        width: 44,
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      {f.date}
                    </span>
                  </div>
                </Rise>
              ))}
            </div>

            {/* ── By genre: thin ACCENT hairline bars + mono counts ────────── */}
            <div style={{ marginTop: 48 }}>
              <Rise i={ri++}>
                <GroupLabel>By genre</GroupLabel>
              </Rise>
              <Rise i={ri++}>
                <Card style={{ padding: '8px 20px' }}>
                  {GENRES.map((g, idx) => (
                    <div
                      key={g.label}
                      style={{
                        padding: '13px 0',
                        borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                          marginBottom: 8,
                        }}
                      >
                        <span style={{ fontSize: 13.5, color: INK }}>{g.label}</span>
                        <span style={{ fontFamily: mono, fontSize: 12, color: MUTED }}>
                          {g.count}
                        </span>
                      </div>
                      <div
                        style={{
                          position: 'relative',
                          height: 3,
                          borderRadius: 999,
                          background: HAIR,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: `${(g.count / GENRE_MAX) * 100}%`,
                            borderRadius: 999,
                            background: ACCENT,
                            transformOrigin: 'left',
                            animation: `clearing-bar 640ms ${EASE} both`,
                            animationDelay: `${140 + idx * 60}ms`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </Card>
              </Rise>
            </div>
          </>
        ) : (
          <>
            {/* ── Watchlist: title · year · type · quiet "mark watched" ────── */}
            <div style={{ marginTop: 48 }}>
              <Rise i={ri++}>
                <GroupLabel>Watchlist · {remaining} to go</GroupLabel>
              </Rise>
              {WATCHLIST.map((w, idx) => {
                const done = watchedIds.has(w.id)
                return (
                  <Rise key={w.id} i={ri++}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '13px 0',
                        borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                        opacity: done ? 0.42 : 1,
                        transition: `opacity 300ms ${EASE}`,
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 14,
                          color: INK,
                          textDecoration: done ? 'line-through' : 'none',
                        }}
                      >
                        {w.title}
                        <span
                          style={{ fontFamily: mono, fontSize: 11.5, color: FAINT, marginLeft: 8 }}
                        >
                          {w.year}
                        </span>
                      </span>
                      <span
                        style={{
                          fontFamily: mono,
                          fontSize: 10,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: FAINT,
                          width: 52,
                          textAlign: 'right',
                        }}
                      >
                        {w.type}
                      </span>
                      <button
                        onClick={() => !done && setWatchedIds((prev) => new Set(prev).add(w.id))}
                        disabled={done}
                        style={{
                          appearance: 'none',
                          border: `1px solid ${done ? 'transparent' : LINE}`,
                          borderRadius: radius.pill,
                          background: 'transparent',
                          cursor: done ? 'default' : 'pointer',
                          fontFamily: sans,
                          fontSize: 11.5,
                          color: done ? ACCENT : MUTED,
                          padding: '4px 12px',
                          flexShrink: 0,
                          transition: `color 200ms ${EASE}, border-color 200ms ${EASE}`,
                        }}
                      >
                        {done ? '✓ watched' : 'mark watched'}
                      </button>
                    </div>
                  </Rise>
                )
              })}
            </div>

            {/* ── Recently watched: title · type · stars · mono date ───────── */}
            <div style={{ marginTop: 48 }}>
              <Rise i={ri++}>
                <GroupLabel>Recently watched</GroupLabel>
              </Rise>
              {WATCHED.map((w, idx) => (
                <Rise key={w.title} i={ri++}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '13px 0',
                      borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 14,
                        color: INK,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      {w.title}
                      {w.rating === 5 && (
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
                    <Stars rating={w.rating} />
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 11.5,
                        color: FAINT,
                        width: 44,
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      {w.date}
                    </span>
                  </div>
                </Rise>
              ))}
            </div>
          </>
        )}

        {/* ── The single LIME CTA ──────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 48, maxWidth: 340 }}>
          <LogBookButton onClick={() => askPond('Log a book…')} />
        </Rise>

        {/* ── Closing serif exhale ─────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 20 }}>
            <span style={{ fontFamily: serif, fontSize: 14, fontStyle: 'italic', color: FAINT }}>
              Seven to go before December. No hurry — the stack keeps.
            </span>
          </div>
        </Rise>
      </div>
    </div>
  )
}

/** The one LIME primary action on the page. */
function LogBookButton({ onClick }: { onClick: () => void }) {
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
      + Log a book
    </button>
  )
}
