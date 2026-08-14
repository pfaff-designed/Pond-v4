'use client'

/**
 * v85 CLEARING — the "Journal" page (area: personal · Knowledge).
 *
 * The most reflective surface, so it leans hardest into serif + air. ONE focal
 * Instrument-Serif numeral = the current writing streak. A small sage Spark reads
 * mood/energy over the last two weeks. Entries are FLAT serif rows — excerpts as a
 * single italic line, never boxed — hairline-separated and calm. LIME appears
 * exactly once (New entry). A quiet Pond reflection sits in a sage-tinted card,
 * noticing a recurring theme without prescribing anything. Deterministic only.
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
  LIME,
  LIME_INK,
  EASE,
  radius,
  kicker,
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

// mood / energy over the last ~14 days (deterministic — no Math.random).
const MOOD = [4, 3, 5, 4, 6, 5, 4, 6, 7, 5, 6, 7, 8, 7]

interface Entry {
  date: string
  title: string
  excerpt: string
  tags: string[]
  fromTrip?: boolean
  month: 'aug'
}

const ENTRIES: Entry[] = [
  {
    date: 'Aug 13',
    title: 'Morning long run, then quiet',
    excerpt: 'Ran the river loop before the heat. The city was still asleep and I let it be.',
    tags: ['#running', '#morning'],
    month: 'aug',
  },
  {
    date: 'Aug 11',
    title: 'Booking the Lisbon flights',
    excerpt: 'Finally pulled the trigger. Nervous and light at the same time, which feels right.',
    tags: ['#lisbon', '#travel'],
    fromTrip: true,
    month: 'aug',
  },
  {
    date: 'Aug 9',
    title: 'A slow afternoon at the bench',
    excerpt: 'Cut the joinery twice and it still fought me. Learned more from the second pass.',
    tags: ['#woodworking', '#patience'],
    month: 'aug',
  },
  {
    date: 'Aug 7',
    title: 'What I want from the trip',
    excerpt: 'Not sights. Mornings with coffee, one long walk a day, no plan after four.',
    tags: ['#lisbon', '#intentions'],
    fromTrip: true,
    month: 'aug',
  },
  {
    date: 'Aug 5',
    title: 'The work is finally moving',
    excerpt: 'Shipped the thing I dreaded. It was smaller than the fear it cast ahead of it.',
    tags: ['#work', '#relief'],
    month: 'aug',
  },
  {
    date: 'Aug 2',
    title: 'On keeping the streak honest',
    excerpt: 'Three lines still counts. The point was never length, it was showing up.',
    tags: ['#writing', '#habits'],
    month: 'aug',
  },
]

const POND_REFLECTION =
  'Across your recent entries, the calm ones keep arriving in the mornings — the run, the coffee, the slow bench. It reads like your quiet hours are doing more for you than the busy ones.'

type Filter = 'all' | 'month'

export default function Journal(ctx: SurfaceCtx) {
  const { askPond } = ctx

  const [filter, setFilter] = useState<Filter>('all')
  const entries = filter === 'all' ? ENTRIES : ENTRIES.filter((e) => e.month === 'aug')

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
          maxWidth: 700,
          margin: '0 auto',
          padding: '30px 32px 156px',
          fontFamily: sans,
        }}
      >
        {/* ── Header: kicker · focal streak numeral · calm serif caption ─────── */}
        <Rise i={ri++}>
          <div style={{ ...kicker, fontSize: 11, color: FAINT }}>Journal · Personal</div>
        </Rise>

        <Rise
          i={ri++}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 20,
            marginTop: 26,
            marginBottom: 8,
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
            12
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
            days in a row you’ve written something down.
          </span>
        </Rise>

        <Rise i={ri++}>
          <div style={{ fontFamily: mono, fontSize: 11.5, color: MUTED, letterSpacing: '0.02em' }}>
            day streak · 34 entries this year
          </div>
        </Rise>

        {/* ── Mood / energy: a small sage spark over the last two weeks ──────── */}
        <div style={{ marginTop: 44 }}>
          <Rise i={ri++}>
            <GroupLabel>Mood · energy</GroupLabel>
          </Rise>
          <Rise
            i={ri++}
            style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}
          >
            <Spark data={MOOD} w={280} h={52} color={ACCENT} />
            <span style={{ fontFamily: mono, fontSize: 11.5, color: MUTED, paddingBottom: 4 }}>
              last 14 days · steadier than last week
            </span>
          </Rise>
        </div>

        {/* ── Recent entries: flat serif rows, hairline-separated, whole-row tap ─ */}
        <div style={{ marginTop: 48 }}>
          <Rise
            i={ri++}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <div style={{ ...kicker }}>Recent entries</div>
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'month', label: 'This month' },
              ]}
            />
          </Rise>

          {entries.map((e, idx) => (
            <Rise key={`${e.date}-${e.title}`} i={ri++}>
              <EntryRow
                entry={e}
                first={idx === 0}
                onOpen={() => askPond(`Open journal entry: ${e.title}`)}
              />
            </Rise>
          ))}
        </div>

        {/* ── Pond reflection: sage-tinted, serif, noticing not nagging ──────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div
            style={{
              padding: '18px 18px',
              borderRadius: radius.soft,
              background: ACCENT_SOFT,
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: ACCENT,
                marginTop: 8,
                flexShrink: 0,
              }}
            />
            <span style={{ fontFamily: serif, fontSize: 15, lineHeight: 1.55, color: BODY }}>
              {POND_REFLECTION}
              <span style={{ ...kicker, color: ACCENT, marginLeft: 8 }}>— Pond</span>
            </span>
          </div>
        </Rise>

        {/* ── The one LIME primary action ───────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 26, maxWidth: 340 }}>
          <NewEntryButton onClick={() => askPond('New journal entry…')} />
        </Rise>

        {/* ── Closing serif exhale ──────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 20 }}>
            <span style={{ fontFamily: serif, fontSize: 14, fontStyle: 'italic', color: FAINT }}>
              Nothing today needs solving here. Just leave a little of it on the page.
            </span>
          </div>
        </Rise>
      </div>
    </div>
  )
}

/** A single flat serif entry row — the whole row is the click target. */
function EntryRow({ entry, first, onOpen }: { entry: Entry; first: boolean; onOpen: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onOpen()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer',
        padding: '16px 0',
        borderTop: first ? 'none' : `1px solid ${HAIR}`,
        transition: `opacity 200ms ${EASE}`,
        opacity: hover ? 0.72 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontFamily: mono, fontSize: 11.5, color: FAINT, width: 48, flexShrink: 0 }}>
          {entry.date}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: INK }}>
              {entry.title}
            </span>
            <span
              style={{
                fontFamily: mono,
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: FAINT,
                flexShrink: 0,
                opacity: hover ? 1 : 0,
                transition: `opacity 200ms ${EASE}`,
              }}
            >
              read
            </span>
          </div>
          <p
            style={{
              margin: '5px 0 0',
              fontFamily: serif,
              fontStyle: 'italic',
              fontSize: 14.5,
              lineHeight: 1.5,
              color: MUTED,
            }}
          >
            {entry.excerpt}
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 8,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontFamily: mono, fontSize: 11, color: FAINT }}>
              {entry.tags.join('  ')}
            </span>
            {entry.fromTrip && (
              <span style={{ fontFamily: sans, fontSize: 11, color: ACCENT }}>
                · from Lisbon planning
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The one LIME primary action on the page. */
function NewEntryButton({ onClick }: { onClick: () => void }) {
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
      + New entry
    </button>
  )
}
