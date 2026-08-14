'use client'

/**
 * v85 CLEARING — AREA OVERVIEW.
 *
 * One shared, data-driven page: each of the five areas (Health · Professional ·
 * Finances · Creativity · Personal) IS a page you open from the rail, showing
 * everything within it at a glance. Keyed by `ctx.openId` (the area id) into
 * AREA_OVERVIEW. One focal Instrument-Serif numeral, a quiet Pond read, then a
 * card per child page — each opens its own dashboard. Calm: LIME never appears
 * here (navigation, not a primary action), RUST not at all, sage ACCENT ambient.
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
  EASE,
  radius,
  kicker,
  Card,
  KindDot,
} from '../ui'
import { AREA_OVERVIEW, AREA_TITLE } from '../data'
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

export default function AreaOverview(ctx: SurfaceCtx) {
  const { openId, openPage, askPond } = ctx
  const data = AREA_OVERVIEW[openId] ?? AREA_OVERVIEW.health
  const area = openId
  const title = AREA_TITLE[area] ?? 'Area'
  let ri = 0

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'transparent' }}>
      <style>{`
        @keyframes clearing-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { [data-clearing] * { animation: none !important; } }
      `}</style>

      <div
        data-clearing
        style={{ maxWidth: 720, margin: '0 auto', padding: '30px 32px 156px', fontFamily: sans }}
      >
        {/* ── Header: kicker + "ask Pond" ─────────────────────────────────── */}
        <Rise
          i={ri++}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <KindDot area={area} size={8} />
            <span style={{ ...kicker, fontSize: 11, color: FAINT }}>{data.kicker}</span>
          </div>
          <AskLink
            label={`ask Pond about ${title} →`}
            onClick={() => askPond(`How is ${title} going this week?`)}
          />
        </Rise>

        {/* ── Focal numeral + caption ─────────────────────────────────────── */}
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
              whiteSpace: 'nowrap',
            }}
          >
            {data.focal}
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
            {data.focalCaption}
          </span>
        </Rise>

        {/* ── Pond's read across the area ─────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 22 }}>
          <div
            style={{
              padding: '14px 16px',
              borderRadius: radius.soft,
              background: ACCENT_SOFT,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: ACCENT,
                marginTop: 6,
                flexShrink: 0,
              }}
            />
            <span style={{ fontFamily: serif, fontSize: 14.5, lineHeight: 1.5, color: BODY }}>
              {data.note}
              <span style={{ ...kicker, color: ACCENT, marginLeft: 8 }}>— Pond</span>
            </span>
          </div>
        </Rise>

        {/* ── Everything within — a card per child page ───────────────────── */}
        <div style={{ marginTop: 44 }}>
          <Rise i={ri++}>
            <div style={{ ...kicker, marginBottom: 14 }}>Everything within</div>
          </Rise>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            {data.cards.map((c) => (
              <Rise key={`${c.page}-${c.title}`} i={ri++}>
                <ChildCard
                  title={c.title}
                  stat={c.stat}
                  sub={c.sub}
                  area={area}
                  onOpen={() => openPage(c.page)}
                />
              </Rise>
            ))}
          </div>
        </div>

        {/* ── Closing serif exhale ────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 20 }}>
            <span style={{ fontFamily: serif, fontSize: 14, fontStyle: 'italic', color: FAINT }}>
              That’s {title} at a glance. Open any of it, or ask.
            </span>
          </div>
        </Rise>
      </div>
    </div>
  )
}

/** A child-page card — the whole card is one calm click target. */
function ChildCard({
  title,
  stat,
  sub,
  area,
  onOpen,
}: {
  title: string
  stat: string
  sub: string
  area: string
  onOpen: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <Card
      onClick={onOpen}
      style={{
        cursor: 'pointer',
        padding: '16px 18px',
        transform: hover ? 'translateY(-1px)' : 'translateY(0)',
        transition: `transform 200ms ${EASE}, box-shadow 200ms ${EASE}`,
        boxShadow: hover
          ? '0 2px 4px rgba(40,34,24,0.05), 0 12px 30px rgba(40,34,24,0.09)'
          : undefined,
      }}
    >
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <KindDot area={area} />
          <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{title}</span>
          <span
            style={{
              marginLeft: 'auto',
              color: hover ? ACCENT : FAINT,
              fontSize: 15,
              transition: `color 200ms ${EASE}`,
            }}
          >
            ›
          </span>
        </div>
        <div
          style={{
            fontFamily: display,
            fontSize: 30,
            lineHeight: 1,
            color: INK,
            letterSpacing: '-0.01em',
          }}
        >
          {stat}
        </div>
        <div style={{ fontFamily: mono, fontSize: 11.5, color: MUTED, letterSpacing: '0.01em' }}>
          {sub}
        </div>
      </div>
    </Card>
  )
}

/** A quiet sage "ask Pond" link — no fill, hairline underline on hover. */
function AskLink({ label, onClick }: { label: string; onClick: () => void }) {
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
        color: hover ? INK : ACCENT,
        borderBottom: `1px solid ${hover ? LINE : 'transparent'}`,
        transition: `color 200ms ${EASE}, border-color 200ms ${EASE}`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}
