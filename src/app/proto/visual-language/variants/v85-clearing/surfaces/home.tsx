'use client'

/**
 * v85 CLEARING — the "Today" surface.
 *
 * One focal element: an oversized Instrument-Serif numeral = the count of things
 * that need you today (DIGEST kind==='due'). It updates live as due items are
 * dismissed. Everything else is air, hairlines, and flat rows — LIME appears once
 * (Draft it), RUST not at all, sage ACCENT is the ambient tint. Slow staggered rise
 * on mount, honoured only where motion is welcome.
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
  Card,
  KindDot,
} from '../ui'
import { DIGEST, SUGGESTION, DOCS, AREA_TITLE, TODAY_EYEBROW } from '../data'
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

/** A calm quiet action — no fill, no border, just a hairline underline on hover. */
function Quiet({
  label,
  onClick,
  color = MUTED,
}: {
  label: string
  onClick: () => void
  color?: string
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        appearance: 'none',
        background: 'none',
        border: 'none',
        padding: '2px 0',
        cursor: 'pointer',
        fontFamily: sans,
        fontSize: 12.5,
        fontWeight: 500,
        color: hover ? INK : color,
        borderBottom: `1px solid ${hover ? LINE : 'transparent'}`,
        transition: `color 200ms ${EASE}, border-color 200ms ${EASE}`,
      }}
    >
      {label}
    </button>
  )
}

/** A small group heading — mono kicker over a hairline of air. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ ...kicker, marginBottom: 14 }}>{children}</div>
}

export default function Home(ctx: SurfaceCtx) {
  const { openId, goRead, openPage, goFocus, askPond } = ctx
  void goRead // kept on the contract; Today routes via openPage so modules open their dashboards
  void openId // ctx.openId is part of the contract; unused on Today.

  // Live local state: the due list drives the focal numeral.
  const [dueIds, setDueIds] = useState<string[]>(
    DIGEST.filter((d) => d.kind === 'due').map((d) => d.id),
  )
  const [showSuggestion, setShowSuggestion] = useState(true)

  const due = DIGEST.filter((d) => d.kind === 'due' && dueIds.includes(d.id))
  const changed = DIGEST.filter((d) => d.kind === 'changed')
  const count = due.length

  const dismiss = (id: string) => setDueIds((ids) => ids.filter((x) => x !== id))

  // Stagger index that keeps walking down the whole page.
  let ri = 0

  // Secondary "glance" stats — read small, never focal.
  const GLANCE: { value: string; label: string }[] = [
    { value: '38 mi', label: 'this week' },
    { value: '7.1 h', label: 'sleep' },
    { value: '$2,480', label: 'safe to spend' },
    { value: '23', label: 'books this year' },
  ]

  // "Up next" mini-agenda — flat rows, faint mono times.
  const UP_NEXT: { time: string; label: string; area: string }[] = [
    { time: '07:00', label: '16-mile long run', area: 'health' },
    { time: '10:00', label: 'Design-system tokens', area: 'work' },
    { time: '16:00', label: 'Walnut Shelf glue-up', area: 'wood' },
  ]

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
          maxWidth: 640,
          margin: '0 auto',
          padding: '30px 32px 156px',
          fontFamily: sans,
        }}
      >
        {/* ── Header: kicker · focal numeral · calm serif line ─────────────── */}
        <Rise i={ri++}>
          <div style={{ ...kicker, fontSize: 11, color: FAINT }}>
            {TODAY_EYEBROW} · Good morning, Charles
          </div>
        </Rise>

        <Rise
          i={ri++}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 20,
            marginTop: 34,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontFamily: display,
              fontSize: 96,
              lineHeight: 0.82,
              color: INK,
              fontFeatureSettings: '"lnum" 1',
              letterSpacing: '-0.02em',
            }}
          >
            {count}
          </span>
          <span
            style={{
              fontFamily: serif,
              fontSize: 21,
              lineHeight: 1.35,
              color: BODY,
              maxWidth: 260,
              paddingBottom: 8,
            }}
          >
            {count === 0
              ? 'nothing needs you today.'
              : count === 1
                ? 'thing needs you today.'
                : 'things need you today.'}
          </span>
        </Rise>

        {/* ── Glance: four small secondary stats, hairline-separated ────────── */}
        <Rise i={ri++} style={{ marginTop: 24 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
            }}
          >
            {GLANCE.map((s, idx) => (
              <div
                key={s.label}
                style={{
                  flex: 1,
                  minWidth: 0,
                  paddingLeft: idx === 0 ? 0 : 16,
                  paddingRight: idx === GLANCE.length - 1 ? 0 : 16,
                  borderLeft: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 15.5,
                    color: INK,
                    lineHeight: 1.2,
                    letterSpacing: '-0.01em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {s.value}
                </span>
                <span style={{ ...kicker, color: FAINT }}>{s.label}</span>
              </div>
            ))}
          </div>
        </Rise>

        {/* ── Enter focus: the day's anchor session, one calm affordance ────── */}
        <Rise i={ri++} style={{ marginTop: 26 }}>
          <button
            onClick={() => goFocus('marathon')}
            style={{
              appearance: 'none',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 18px',
              borderRadius: radius.soft,
              border: `1px solid ${LINE}`,
              background: ACCENT_SOFT,
              fontFamily: sans,
              transition: `background 220ms ${EASE}`,
            }}
          >
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                background: ACCENT,
                color: '#f4f1ea',
                fontFamily: display,
                fontSize: 15,
              }}
            >
              ›
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>
                Enter focus · {DOCS.marathon.title}
              </span>
              <span style={{ fontSize: 12.5, color: MUTED }}>
                Sunday’s anchor session · everything else can recede
              </span>
            </span>
          </button>
        </Rise>

        {/* ── Needs you: the due items, flat rows with quiet actions ────────── */}
        <div style={{ marginTop: 50 }}>
          <Rise i={ri++}>
            <GroupLabel>Needs you</GroupLabel>
          </Rise>

          {due.length === 0 && (
            <Rise i={ri++}>
              <div
                style={{
                  fontFamily: serif,
                  fontSize: 15.5,
                  color: MUTED,
                  padding: '4px 0 6px',
                }}
              >
                All clear. The day is yours.
              </div>
            </Rise>
          )}

          {due.map((item, idx) => (
            <Rise key={item.id} i={ri++}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '16px 0',
                  borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                }}
              >
                <KindDot area={item.area} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 500, color: INK, lineHeight: 1.3 }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>{item.detail}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0 }}>
                  <Quiet label="Open" onClick={() => openPage(item.page)} />
                  <Quiet label="Dismiss" color={FAINT} onClick={() => dismiss(item.id)} />
                </div>
              </div>
            </Rise>
          ))}
        </div>

        {/* ── Up next: quiet mini-agenda, faint mono times ──────────────────── */}
        <div style={{ marginTop: 50 }}>
          <Rise i={ri++}>
            <GroupLabel>Up next</GroupLabel>
          </Rise>
          {UP_NEXT.map((item, idx) => (
            <Rise key={item.time} i={ri++}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '16px 0',
                  borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                }}
              >
                <KindDot area={item.area} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 500, color: INK, lineHeight: 1.3 }}>
                    {item.label}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 13,
                    color: FAINT,
                    flexShrink: 0,
                    letterSpacing: '0.01em',
                  }}
                >
                  {item.time}
                </span>
              </div>
            </Rise>
          ))}
        </div>

        {/* ── Pond suggests: one card, one lime action ──────────────────────── */}
        {showSuggestion && (
          <div style={{ marginTop: 50 }}>
            <Rise i={ri++}>
              <GroupLabel>Pond suggests</GroupLabel>
            </Rise>
            <Rise i={ri++}>
              <Card>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <KindDot area={SUGGESTION.area} />
                  <span style={{ ...kicker, color: MUTED }}>
                    {AREA_TITLE[SUGGESTION.area]}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontFamily: serif,
                    fontSize: 17,
                    lineHeight: 1.5,
                    color: INK,
                  }}
                >
                  {SUGGESTION.text}
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 20,
                    marginTop: 18,
                  }}
                >
                  <button
                    onClick={() =>
                      askPond(
                        `Draft a note for ${AREA_TITLE[SUGGESTION.area]}: ${SUGGESTION.text}`,
                      )
                    }
                    style={{
                      appearance: 'none',
                      cursor: 'pointer',
                      border: 'none',
                      borderRadius: radius.pill,
                      padding: '9px 18px',
                      background: LIME,
                      color: LIME_INK,
                      fontFamily: sans,
                      fontSize: 13,
                      fontWeight: 600,
                      transition: `transform 200ms ${EASE}`,
                    }}
                  >
                    Draft it
                  </button>
                  <Quiet label="Not now" color={FAINT} onClick={() => setShowSuggestion(false)} />
                </div>
              </Card>
            </Rise>
          </div>
        )}

        {/* ── Quietly changed: flat clickable rows ──────────────────────────── */}
        <div style={{ marginTop: 50 }}>
          <Rise i={ri++}>
            <GroupLabel>Quietly changed</GroupLabel>
          </Rise>
          {changed.map((item, idx) => (
            <Rise key={item.id} i={ri++}>
              <ChangedRow
                item={item}
                first={idx === 0}
                onClick={() => openPage(item.page)}
              />
            </Rise>
          ))}
        </div>

        {/* ── Closing serif exhale ──────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 54 }}>
          <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 20 }}>
            <span
              style={{
                fontFamily: serif,
                fontSize: 14,
                fontStyle: 'italic',
                color: FAINT,
              }}
            >
              That’s the whole of it. Nothing else is asking.
            </span>
          </div>
        </Rise>
      </div>
    </div>
  )
}

/** A "quietly changed" row: whole row is one calm click target. */
function ChangedRow({
  item,
  first,
  onClick,
}: {
  item: { area: string; label: string; detail: string }
  first: boolean
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '15px 12px',
        margin: '0 -12px',
        cursor: 'pointer',
        borderTop: first ? 'none' : `1px solid ${HAIR}`,
        borderRadius: radius.chip,
        background: hover ? ACCENT_SOFT : 'transparent',
        transition: `background 220ms ${EASE}`,
      }}
    >
      <KindDot area={item.area} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 500, color: INK, lineHeight: 1.3 }}>
          {item.label}
        </div>
        <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>{item.detail}</div>
      </div>
      <span
        aria-hidden
        style={{
          fontFamily: mono,
          fontSize: 15,
          color: hover ? ACCENT : FAINT,
          transition: `color 220ms ${EASE}`,
        }}
      >
        ›
      </span>
    </div>
  )
}
