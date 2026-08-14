'use client'

/**
 * v85 CLEARING — the "Reading List" page.
 *
 * One focal element: an oversized Instrument-Serif numeral = books finished this
 * year. Everything else recedes into air, hairlines, flat serif prose, and a few
 * soft-shadow module cards. Sage ACCENT is the ambient tint (progress bars, rating
 * dots, KindDots), LIME appears exactly once (Log today's pages), RUST is a single
 * punctuation mark (the longest-streak value on the receipt). Slow staggered rise
 * on mount, disabled under prefers-reduced-motion.
 */

import { useState } from 'react'
import {
  sans,
  serif,
  display,
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
  cardShadow,
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

const BOOKS_THIS_YEAR = 23

interface Reading {
  title: string
  author: string
  page: number
  pages: number
  note: string
}
const CURRENT: Reading[] = [
  {
    title: 'Daniels’ Running Formula',
    author: 'Jack Daniels',
    page: 214,
    pages: 320,
    note: '~4 days left at 30pg/day',
  },
  {
    title: 'The Design of Everyday Things',
    author: 'Don Norman',
    page: 96,
    pages: 288,
    note: 'slow re-read — one chapter a night',
  },
  {
    title: 'The Overstory',
    author: 'Richard Powers',
    page: 442,
    pages: 502,
    note: '~2 days left, can’t put it down',
  },
]

// pages/day over the last two weeks — for the small spark in the stats card
const PAGES_PER_DAY = [22, 31, 18, 40, 27, 12, 35, 44, 29, 33, 21, 38, 30, 42]

interface Queued {
  title: string
  author: string
  why: string
}
const UP_NEXT: Queued[] = [
  { title: 'Endure', author: 'Alex Hutchinson', why: 'the mental side of the sub-4:00 build' },
  { title: 'Shape Up', author: 'Ryan Singer', why: 'sharpen the Q3 design-system cadence' },
  { title: 'The Anthropocene Reviewed', author: 'John Green', why: 'a warm palate-cleanser between the heavy ones' },
  { title: 'The Soul of a Tree', author: 'George Nakashima', why: 'for the walnut bench that’s next on the saw' },
  { title: 'Refactoring UI', author: 'Wathan & Schoger', why: 'flagged twice in review — finally reading it' },
  { title: 'Piranesi', author: 'Susanna Clarke', why: 'three people I trust said “just start it”' },
]

interface Finished {
  title: string
  author: string
  take: string
  rating: number // 0–5, sage dots
}
const FINISHED: Finished[] = [
  {
    title: 'Born to Run',
    author: 'Christopher McDougall',
    take: 'Made the long runs feel like play again.',
    rating: 5,
  },
  {
    title: 'A Pattern Language',
    author: 'Christopher Alexander',
    take: 'Reshaped how I think about component seams.',
    rating: 4,
  },
  {
    title: 'The Understory',
    author: 'Robert Macfarlane',
    take: 'Quiet, patient — read it in the shop.',
    rating: 4,
  },
  {
    title: 'Project Hail Mary',
    author: 'Andy Weir',
    take: 'Finished it in a single rainy Saturday.',
    rating: 5,
  },
]

// ── small rating dots (sage filled ● / faint hollow ○) ──────────────────────────
function Rating({ value }: { value: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }} aria-label={`${value} of 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: radius.pill,
            background: i < value ? ACCENT : 'transparent',
            border: i < value ? 'none' : `1px solid ${FAINT}`,
          }}
        />
      ))}
    </span>
  )
}

// ── thin sage progress bar ──────────────────────────────────────────────────────
function Progress({ pct }: { pct: number }) {
  return (
    <div style={{ height: 4, borderRadius: radius.pill, background: ACCENT_SOFT, overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%`,
          borderRadius: radius.pill,
          background: ACCENT,
        }}
      />
    </div>
  )
}

export default function ReadingList(ctx: SurfaceCtx) {
  const [logged, setLogged] = useState(false)

  const totalPages = 6420
  const avgPerBook = Math.round(totalPages / BOOKS_THIS_YEAR)

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
        {/* ── Header: kicker · focal numeral · calm serif line ─────────────── */}
        <Rise i={ri++}>
          <div style={{ ...kicker, fontSize: 11 }}>Reading</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 10 }}>
            <span style={{ fontFamily: display, fontSize: 92, lineHeight: 0.9, color: INK }}>
              {BOOKS_THIS_YEAR}
            </span>
            <span style={{ fontFamily: serif, fontSize: 20, color: MUTED, fontStyle: 'italic' }}>
              books, this year.
            </span>
          </div>
        </Rise>

        {/* ── Currently reading ──────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 52 }}>
          <div style={{ ...kicker, marginBottom: 18 }}>Currently reading</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {CURRENT.map((b) => {
              const pct = b.page / b.pages
              return (
                <div key={b.title}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <KindDot area="reading" />
                    <span style={{ fontFamily: serif, fontSize: 19, color: INK }}>{b.title}</span>
                    <span style={{ fontFamily: serif, fontSize: 15, color: MUTED }}>· {b.author}</span>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Progress pct={pct} />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginTop: 7,
                    }}
                  >
                    <span style={{ fontFamily: sans, fontSize: 12, color: FAINT }}>
                      page {b.page} of {b.pages} · {Math.round(pct * 100)}%
                    </span>
                    <span style={{ fontFamily: sans, fontSize: 12, color: MUTED }}>{b.note}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </Rise>

        {/* ── Up next ────────────────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 52 }}>
          <div style={{ ...kicker, marginBottom: 16 }}>Up next</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {UP_NEXT.map((b, idx) => (
              <div
                key={b.title}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 12,
                  padding: '13px 0',
                  borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                }}
              >
                <span style={{ fontFamily: serif, fontSize: 17, color: INK, flexShrink: 0 }}>{b.title}</span>
                <span style={{ fontFamily: serif, fontSize: 14, color: FAINT, flexShrink: 0 }}>{b.author}</span>
                <span
                  style={{
                    fontFamily: sans,
                    fontSize: 12.5,
                    color: MUTED,
                    marginLeft: 'auto',
                    textAlign: 'right',
                  }}
                >
                  {b.why}
                </span>
              </div>
            ))}
          </div>
        </Rise>

        {/* ── Recently finished ──────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 52 }}>
          <div style={{ ...kicker, marginBottom: 18 }}>Recently finished</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 14,
            }}
          >
            {FINISHED.map((b) => (
              <div
                key={b.title}
                style={{
                  background: CARD,
                  border: `1px solid ${LINE}`,
                  borderRadius: radius.soft,
                  boxShadow: cardShadow,
                  padding: '16px 18px',
                }}
              >
                <div style={{ fontFamily: serif, fontSize: 17, color: INK }}>{b.title}</div>
                <div style={{ fontFamily: serif, fontSize: 13.5, color: MUTED, marginTop: 1 }}>{b.author}</div>
                <div style={{ fontFamily: sans, fontSize: 12.5, color: BODY, marginTop: 10, lineHeight: 1.5 }}>
                  {b.take}
                </div>
                <div style={{ marginTop: 12 }}>
                  <Rating value={b.rating} />
                </div>
              </div>
            ))}
          </div>
        </Rise>

        {/* ── This year — receipt + a small pages/day spark ──────────────── */}
        <Rise i={ri++} style={{ marginTop: 52 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 24,
              alignItems: 'center',
            }}
          >
            <Receipt
              title="This year"
              rows={[
                ['books', String(BOOKS_THIS_YEAR)],
                ['pages', totalPages.toLocaleString('en-US')],
                ['avg / book', `${avgPerBook} pg`],
                ['longest streak', '41 days', RUST],
              ]}
            />
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...kicker, marginBottom: 8 }}>Pages / day · 2 wks</div>
              <Spark data={PAGES_PER_DAY} w={168} h={44} />
            </div>
          </div>
        </Rise>

        {/* ── The single LIME CTA ────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 44 }}>
          <button
            onClick={() => {
              setLogged(true)
              ctx.askPond('Log today’s reading — pages, and a line on how it landed.')
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
            {logged ? 'Logged — nice.' : 'Log today’s pages'}
          </button>
        </Rise>
      </div>
    </div>
  )
}
