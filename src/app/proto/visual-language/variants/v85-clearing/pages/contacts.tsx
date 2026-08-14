'use client'

/**
 * v85 CLEARING — the "Contacts" page (area: personal).
 *
 * One focal element: an oversized Instrument-Serif numeral = birthdays this month.
 * Everything else recedes into air, hairlines, and mono. A small "Reconnect" Pond
 * card surfaces the one or two people you've drifted from — sage-tinted, calm serif.
 * RUST appears exactly ONCE, as a tiny "haven't spoken in a while" dot on the person
 * you've been quietest with. LIME appears once (+ Add contact). Gentle staggered
 * rise on mount, honoured only where motion is welcome.
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

// ── birthdays this month (deterministic, no new Date) ────────────────────────
interface Birthday {
  name: string
  rel: string
  date: string
}
const BIRTHDAYS: Birthday[] = [
  { name: 'Maya Pfaff', rel: 'sister', date: 'Aug 19' },
  { name: 'Devin Okafor', rel: 'college friend', date: 'Aug 23' },
  { name: 'Priya Nair', rel: 'design lead', date: 'Aug 28' },
]

// ── people ───────────────────────────────────────────────────────────────────
type Group = 'family' | 'friend' | 'work'
interface Person {
  name: string
  group: Group
  role: string
  last: string // mono "3 days" / "2 wks" / "4 mo"
  tag: string
  drifted?: boolean // the single RUST nudge
}

const PEOPLE: Person[] = [
  { name: 'Maya Pfaff', group: 'family', role: 'sister', last: '3 days', tag: 'birthday soon' },
  { name: 'Tom Pfaff', group: 'family', role: 'dad', last: '1 wk', tag: 'call Sundays' },
  { name: 'Devin Okafor', group: 'friend', role: 'college', last: '2 wks', tag: 'owes you a hike' },
  { name: 'Priya Nair', group: 'work', role: 'design lead', last: '4 days', tag: 'design crit' },
  {
    name: 'Lena Vos',
    group: 'friend',
    role: 'running club',
    last: '5 days',
    tag: 'marathon buddy',
  },
  { name: 'Sam Reyes', group: 'work', role: 'eng manager', last: '2 wks', tag: 'roadmap sync' },
  { name: 'Aunt Ro', group: 'family', role: 'aunt', last: '3 wks', tag: 'sends postcards' },
  {
    name: 'Cole Adeyemi',
    group: 'friend',
    role: 'old roommate',
    last: '4 mo',
    tag: 'drifted',
    drifted: true,
  },
  {
    name: 'Nadia Farouk',
    group: 'work',
    role: 'former mentor',
    last: '6 wks',
    tag: 'coffee overdue',
  },
  { name: 'Jonah Kim', group: 'friend', role: 'woodworking', last: '10 days', tag: 'shop day' },
]

type Filter = 'all' | 'family' | 'friend' | 'work'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'family', label: 'Family' },
  { value: 'friend', label: 'Friends' },
  { value: 'work', label: 'Work' },
]

export default function Contacts(ctx: SurfaceCtx) {
  const { askPond } = ctx

  const [filter, setFilter] = useState<Filter>('all')
  const shown = filter === 'all' ? PEOPLE : PEOPLE.filter((p) => p.group === filter)

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
        {/* ── Header: kicker · focal numeral · calm serif caption ───────────── */}
        <Rise
          i={ri++}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ ...kicker, fontSize: 11, color: FAINT }}>People · August</div>
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
            {BIRTHDAYS.length}
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
            birthdays this month — a good reason to reach out.
          </span>
        </Rise>

        <Rise i={ri++}>
          <div style={{ fontFamily: mono, fontSize: 11.5, color: MUTED, letterSpacing: '0.02em' }}>
            <span style={{ color: ACCENT }}>{PEOPLE.length} people</span> in your circle · one
            you&rsquo;ve drifted from
          </div>
        </Rise>

        {/* ── Birthdays this month ──────────────────────────────────────────── */}
        <div style={{ marginTop: 48 }}>
          <Rise i={ri++}>
            <GroupLabel>Birthdays this month</GroupLabel>
          </Rise>
          <Rise i={ri++}>
            <Card style={{ padding: '8px 20px' }}>
              {BIRTHDAYS.map((b, idx) => (
                <div
                  key={b.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 0',
                    borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: INK }}>
                    {b.name}
                    <span
                      style={{
                        display: 'block',
                        fontFamily: sans,
                        fontSize: 11.5,
                        color: FAINT,
                        marginTop: 2,
                      }}
                    >
                      {b.rel}
                    </span>
                  </span>
                  <span style={{ fontFamily: mono, fontSize: 12, color: BODY, flexShrink: 0 }}>
                    {b.date}
                  </span>
                  <QuietAction
                    label="note"
                    onClick={() => askPond(`Write a birthday note to ${b.name}`)}
                  />
                </div>
              ))}
            </Card>
          </Rise>
        </div>

        {/* ── Reconnect: Pond gently surfaces who you've drifted from ────────── */}
        <div style={{ marginTop: 48 }}>
          <Rise i={ri++}>
            <GroupLabel>Reconnect</GroupLabel>
          </Rise>
          <Rise i={ri++}>
            <Card style={{ background: ACCENT_SOFT, border: `1px solid ${LINE}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: ACCENT,
                    display: 'inline-block',
                  }}
                />
                <span style={{ ...kicker, color: ACCENT }}>Pond noticed</span>
              </div>
              <p
                style={{ margin: 0, fontFamily: serif, fontSize: 17, lineHeight: 1.5, color: INK }}
              >
                You and <strong style={{ fontWeight: 600 }}>Cole</strong> haven&rsquo;t spoken in
                about four months — the longest gap in your circle.{' '}
                <strong style={{ fontWeight: 600 }}>Nadia</strong> is close behind at six weeks. No
                urgency; just two names worth a hello.
              </p>
            </Card>
          </Rise>
        </div>

        {/* ── People: filterable list ───────────────────────────────────────── */}
        <div style={{ marginTop: 48 }}>
          <Rise
            i={ri++}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              marginBottom: 14,
            }}
          >
            <div style={{ ...kicker, margin: 0 }}>People</div>
            <Segmented<Filter> value={filter} onChange={setFilter} options={FILTERS} />
          </Rise>
          <Rise i={ri++}>
            <Card style={{ padding: '8px 20px' }}>
              {shown.map((p, idx) => (
                <div
                  key={p.name}
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
                    {p.name}
                    <span
                      style={{
                        display: 'block',
                        fontFamily: sans,
                        fontSize: 11.5,
                        color: FAINT,
                        marginTop: 2,
                      }}
                    >
                      {p.role} · {p.tag}
                    </span>
                  </span>
                  {p.drifted && (
                    <span
                      aria-hidden
                      title="haven't spoken in a while"
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        background: RUST,
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontFamily: mono,
                      fontSize: 11.5,
                      color: p.drifted ? RUST : FAINT,
                      width: 46,
                      textAlign: 'right',
                      flexShrink: 0,
                    }}
                  >
                    {p.last}
                  </span>
                  <QuietAction
                    label="reach out"
                    onClick={() => askPond(`Draft a quick message to ${p.name}`)}
                  />
                </div>
              ))}
              {shown.length === 0 && (
                <div
                  style={{
                    padding: '18px 0',
                    fontFamily: serif,
                    fontSize: 14,
                    fontStyle: 'italic',
                    color: FAINT,
                  }}
                >
                  No one here yet.
                </div>
              )}
            </Card>
          </Rise>
        </div>

        {/* ── The single LIME primary action ────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 32, maxWidth: 340 }}>
          <AddContactButton onClick={() => askPond('Add a contact…')} />
        </Rise>

        {/* ── Closing serif exhale ──────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 20 }}>
            <span style={{ fontFamily: serif, fontSize: 14, fontStyle: 'italic', color: FAINT }}>
              A circle stays warm one small hello at a time.
            </span>
          </div>
        </Rise>
      </div>
    </div>
  )
}

/** A quiet trailing text action — the calm per-row verb. */
function QuietAction({ label, onClick }: { label: string; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        appearance: 'none',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        flexShrink: 0,
        fontFamily: sans,
        fontSize: 12,
        fontWeight: 500,
        color: hover ? ACCENT : MUTED,
        padding: '4px 2px',
        transition: `color 180ms ${EASE}`,
      }}
    >
      {label}
    </button>
  )
}

/** The one LIME primary action on the page. */
function AddContactButton({ onClick }: { onClick: () => void }) {
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
      + Add contact
    </button>
  )
}
