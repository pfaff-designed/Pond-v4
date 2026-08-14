'use client'

/**
 * v85 CLEARING — the "Walnut Shelf" woodworking page.
 *
 * The creative domain finally gets a home. One focal element: an oversized
 * Instrument-Serif build-stage label ("Glue-up") = where the piece is right now.
 * Board-feet progress rides a sage Ring, the four build stages are a quiet stepper,
 * the cut list is a checkable materials table, and tools/supplies + shop notes give
 * it the lived-in richness of the Workout page. Sage ACCENT is the ambient tint,
 * LIME appears exactly once (Open shop session) AND as the cut-list check, RUST is a
 * single punctuation mark (the one waiting-on-supply). Staggered rise on mount,
 * disabled under prefers-reduced-motion.
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
  KindDot,
  Ring,
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

type StageState = 'done' | 'current' | 'upcoming'
interface Stage {
  key: string
  label: string
  note: string
  state: StageState
}
const STAGES: Stage[] = [
  { key: 'mill', label: 'Milling', note: 'S4S both boards · 6.5 bf', state: 'done' },
  { key: 'glue', label: 'Glue-up', note: 'Edge-joint the panel', state: 'current' },
  { key: 'cleat', label: 'French cleat', note: '45° hidden mount', state: 'upcoming' },
  { key: 'finish', label: 'Finish', note: 'Hand-rubbed oil, 3 coats', state: 'upcoming' },
]

// board feet milled vs. target across the last 8 shop sessions — the spark
const BF_SESSIONS = [0, 1.5, 2.4, 3.2, 4.1, 5.0, 5.8, 6.5]
const BF_TARGET = 8.5

interface Cut {
  part: string
  dims: string
  stock: string
  qty: number
}
const CUT_LIST: Cut[] = [
  { part: 'Shelf top', dims: '32 × 8 × 1½"', stock: 'Walnut', qty: 1 },
  { part: 'Shelf bottom', dims: '32 × 8 × 1½"', stock: 'Walnut', qty: 1 },
  { part: 'Wall cleat', dims: '30 × 3 × ¾"', stock: 'Poplar', qty: 1 },
  { part: 'Shelf cleat', dims: '30 × 3 × ¾"', stock: 'Poplar', qty: 1 },
  { part: 'Filler strips', dims: '30 × 1 × ¾"', stock: 'Walnut', qty: 2 },
]

interface Supply {
  label: string
  meta: string
  waiting?: boolean
}
const SUPPLIES: Supply[] = [
  { label: 'Titebond III', meta: '16 oz · in stock' },
  { label: 'Odie’s Oil', meta: '9 oz tin · in stock' },
  { label: '#8 × 2½" screws', meta: 'for the cleat' },
  { label: 'Walnut plugs', meta: '⅜" · on order', waiting: true },
]

interface Tool {
  label: string
}
const TOOLS: Tool[] = [
  { label: 'Track saw' },
  { label: 'No. 7 jointer plane' },
  { label: 'Parallel clamps ×6' },
  { label: 'Card scraper' },
  { label: 'Random-orbit sander' },
]

// muted clay accent for the woodworking spark (matches AREA_ACCENT.wood)
const AREA_ACCENT_WOOD = '#9a6b43'

const SHOP_NOTES: string[] = [
  'Grain runs continuous across the panel — keep the bookmatch tight at glue-up.',
  'Cleat at 45°; leave 1⁄16" reveal under the shelf so it reads as floating.',
  'Finish sample on offcut first — Odie’s pops the chatoyance beautifully.',
]

export default function Shelf(ctx: SurfaceCtx) {
  // cut-list parts get a checkable "cut" pip
  const [cut, setCut] = useState<Record<string, boolean>>({ 'Shelf top': true, 'Shelf bottom': true })
  const [started, setStarted] = useState(false)

  const cutCount = CUT_LIST.filter((c) => cut[c.part]).length
  const bfMilled = 6.5
  const bfPct = bfMilled / BF_TARGET

  let ri = 0

  const currentStage = STAGES.find((s) => s.state === 'current')

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
        {/* ── Header: kicker · focal stage label · calm serif line ──────────── */}
        <Rise i={ri++}>
          <div style={{ ...kicker, fontSize: 11 }}>Woodworking · Walnut Shelf · Entryway</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 10 }}>
            <span style={{ fontFamily: display, fontSize: 76, lineHeight: 0.9, color: INK }}>
              {currentStage?.label ?? 'Build'}
            </span>
            <span style={{ fontFamily: serif, fontSize: 20, color: MUTED, fontStyle: 'italic' }}>the panel.</span>
          </div>
          <div style={{ fontFamily: serif, fontSize: 15.5, color: MUTED, marginTop: 12, lineHeight: 1.5 }}>
            Floating walnut shelf, hidden French cleat, hand-rubbed oil. Milled and ready to edge-joint.
          </div>
        </Rise>

        {/* ── Focal: board-feet Ring + build stepper ────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 44 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 40, flexWrap: 'wrap' }}>
            <Ring
              pct={bfPct}
              size={148}
              stroke={9}
              label={`${bfMilled}`}
              sub="board feet"
            />
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ ...kicker, marginBottom: 14 }}>Build stages</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {STAGES.map((s, idx) => {
                  const done = s.state === 'done'
                  const cur = s.state === 'current'
                  return (
                    <div
                      key={s.key}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: '11px 0',
                        borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                        opacity: s.state === 'upcoming' ? 0.6 : 1,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          marginTop: 3,
                          width: 14,
                          height: 14,
                          flexShrink: 0,
                          borderRadius: radius.pill,
                          background: done ? ACCENT : cur ? 'transparent' : 'transparent',
                          border: done ? 'none' : cur ? `2px solid ${ACCENT}` : `1.5px solid ${FAINT}`,
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 9,
                          color: done ? '#fff' : LIME_INK,
                          lineHeight: 1,
                        }}
                      >
                        {done ? '✓' : ''}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: serif, fontSize: 17, color: cur ? INK : done ? BODY : MUTED }}>
                          {s.label}
                          {cur && (
                            <span style={{ ...kicker, color: ACCENT, marginLeft: 10 }}>now</span>
                          )}
                        </div>
                        <div style={{ fontFamily: sans, fontSize: 12, color: FAINT, marginTop: 2 }}>{s.note}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </Rise>

        {/* ── Board-feet trend + next step ──────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'center' }}>
            <div>
              <div style={{ ...kicker, marginBottom: 6 }}>Next step</div>
              <div style={{ fontFamily: serif, fontSize: 20, color: INK }}>Edge-joint the panel</div>
              <div style={{ fontFamily: sans, fontSize: 12.5, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
                Dry-fit, spread Titebond, six clamps alternating over/under. ~40 min open time.
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...kicker, marginBottom: 8 }}>Board feet · 8 sessions</div>
              <Spark data={BF_SESSIONS} w={168} h={44} color={AREA_ACCENT_WOOD} />
              <div style={{ fontFamily: mono, fontSize: 11, color: FAINT, marginTop: 6 }}>
                {bfMilled} / {BF_TARGET} bf milled
              </div>
            </div>
          </div>
        </Rise>

        {/* ── Cut list — checkable materials table ──────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <div style={{ ...kicker }}>Cut list</div>
            <div style={{ fontFamily: sans, fontSize: 12.5, color: MUTED }}>
              <span style={{ color: cutCount > 0 ? INK : MUTED, fontWeight: 600 }}>{cutCount}</span> / {CUT_LIST.length} cut
            </div>
          </div>
          <Card style={{ padding: '8px 20px' }}>
            {CUT_LIST.map((c, idx) => {
              const on = !!cut[c.part]
              return (
                <div
                  key={c.part}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '13px 0',
                    borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                  }}
                >
                  <button
                    onClick={() => setCut((p) => ({ ...p, [c.part]: !p[c.part] }))}
                    aria-pressed={on}
                    aria-label={`Cut ${c.part}`}
                    style={{
                      width: 18,
                      height: 18,
                      flexShrink: 0,
                      padding: 0,
                      borderRadius: radius.pill,
                      cursor: 'pointer',
                      border: on ? 'none' : `1.5px solid ${FAINT}`,
                      background: on ? DONE : 'transparent',
                      color: DONE_INK,
                      display: 'grid',
                      placeItems: 'center',
                      fontFamily: sans,
                      fontSize: 11,
                      lineHeight: 1,
                      transition: `transform 180ms ${EASE}, background 180ms ${EASE}`,
                      transform: on ? 'scale(1)' : 'scale(1)',
                    }}
                  >
                    {on ? '✓' : ''}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: serif, fontSize: 16, color: on ? MUTED : INK }}>{c.part}</div>
                    <div style={{ fontFamily: mono, fontSize: 11, color: FAINT, marginTop: 2 }}>{c.dims}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <KindDot area="wood" />
                    <span style={{ fontFamily: sans, fontSize: 12.5, color: MUTED }}>{c.stock}</span>
                    <span style={{ fontFamily: mono, fontSize: 11.5, color: FAINT, width: 24, textAlign: 'right' }}>
                      ×{c.qty}
                    </span>
                  </div>
                </div>
              )
            })}
          </Card>
        </Rise>

        {/* ── Supplies + tools — two quiet columns ──────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            <div>
              <div style={{ ...kicker, marginBottom: 14 }}>Supplies</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {SUPPLIES.map((s, idx) => (
                  <div
                    key={s.label}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 10,
                      padding: '10px 0',
                      borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: INK, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {s.label}
                      {s.waiting && (
                        <span
                          aria-hidden
                          style={{ width: 5, height: 5, borderRadius: 999, background: RUST, display: 'inline-block' }}
                        />
                      )}
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 11, color: s.waiting ? RUST : FAINT }}>{s.meta}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ ...kicker, marginBottom: 14 }}>Tools staged</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TOOLS.map((t) => (
                  <span
                    key={t.label}
                    style={{
                      padding: '7px 12px',
                      borderRadius: radius.pill,
                      background: ACCENT_SOFT,
                      fontFamily: sans,
                      fontSize: 12.5,
                      color: BODY,
                    }}
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Rise>

        {/* ── Shop notes ────────────────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ ...kicker, marginBottom: 14 }}>Shop notes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {SHOP_NOTES.map((n, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 12 }}>
                <span style={{ fontFamily: mono, fontSize: 11, color: FAINT, marginTop: 3, flexShrink: 0 }}>
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span style={{ fontFamily: serif, fontSize: 15.5, color: BODY, lineHeight: 1.55 }}>{n}</span>
              </div>
            ))}
          </div>
        </Rise>

        {/* ── Build receipt + the single LIME CTA ───────────────────────────── */}
        <div style={{ marginTop: 46, display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Rise i={ri++} style={{ flex: 1, minWidth: 240 }}>
            <Receipt
              title="The build"
              rows={[
                ['board feet', `${bfMilled} / ${BF_TARGET}`],
                ['stock cost', '$118.40'],
                ['sessions', '8'],
                ['waiting on', 'plugs', RUST],
              ]}
            />
          </Rise>
          <Rise i={ri++}>
            <button
              onClick={() => {
                setStarted(true)
                ctx.askPond('Start a shop session on the Walnut Shelf — walk me through the glue-up.')
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
              {started ? 'Shop session live.' : 'Open shop session'}
            </button>
          </Rise>
        </div>

        {/* faint closing note */}
        <div style={{ fontFamily: serif, fontSize: 14, fontStyle: 'italic', color: FAINT, marginTop: 24, lineHeight: 1.6 }}>
          Slow work. The panel decides its own pace.
        </div>
      </div>
    </div>
  )
}
