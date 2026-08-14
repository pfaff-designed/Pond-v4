'use client'

/**
 * v85 CLEARING — the "Focus" surface.
 *
 * The deepest calm state. One focal object: a large radial dial with the
 * count-up timer as an oversized Instrument-Serif numeral. Idle is a quiet
 * setup (a page · a length · a couple of protocol toggles). Starting collapses
 * everything — we tell the shell to let the chrome recede (setSessionActive) so
 * the room goes quiet and singular. Stopping surfaces a calm Press summary.
 *
 * Calm discipline: LIME is the only primary action (Start / one summary CTA) +
 * the protocol checks. RUST is rare punctuation only — the single "ON AIR" dot.
 * Sage ACCENT is the ambient tint. Everything else is air and hairlines.
 */

import { useEffect, useRef, useState } from 'react'
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
  glass,
  kicker,
  radius,
  Card,
  KindDot,
} from '../ui'
import { PAGES, DURATIONS, PROTOCOLS, AREA_TITLE } from '../data'
import type { SurfaceCtx } from '../shell-types'

type Phase = 'idle' | 'running'
interface Summary {
  mins: number
  page: string
  pageId: string
  kept: number
  total: number
  length: number
}

/** mm:ss from whole seconds — deterministic, tabular. */
function fmt(total: number) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** A calm Pond note for the summary — deterministic, no wall-clock. */
function pondNote(page: string, mins: number, kept: number, total: number) {
  return `${mins} unbroken minutes on ${page}. You held ${kept} of ${total} protocols — the room stayed quiet, and the thread is still warm. Leave yourself a line before it cools.`
}

/** Recent focus history — seeded inline, deterministic. Quiet/secondary. */
interface PastSession {
  id: string
  title: string
  area: string
  mins: number
  kept: number
  total: number
}
const HISTORY: PastSession[] = [
  { id: 'marathon', title: 'Marathon Training', area: 'health', mins: 50, kept: 4, total: 4 },
  { id: 'q3', title: 'Q3 Planning', area: 'professional', mins: 25, kept: 3, total: 4 },
  { id: 'design', title: 'Design System', area: 'professional', mins: 15, kept: 2, total: 4 },
  { id: 'walnut', title: 'Walnut Shelf', area: 'creativity', mins: 5, kept: 4, total: 4 },
]
const TODAY_MINS = HISTORY.reduce((sum, s) => sum + s.mins, 0)

export default function Focus(ctx: SurfaceCtx) {
  const { openId, goRead, setSessionActive } = ctx

  // ── session config (idle setup) ────────────────────────────────────────────
  const hasOpen = PAGES.some((p) => p.id === openId)
  const [pageId, setPageId] = useState<string>(hasOpen ? openId : (PAGES[0]?.id ?? 'marathon'))
  const [duration, setDuration] = useState<number>(DURATIONS[1] ?? 50)
  const page = PAGES.find((p) => p.id === pageId) ?? PAGES[0]
  const targetSec = duration * 60

  const [ambient, setAmbient] = useState(true)
  const [dnd, setDnd] = useState(true)
  const [protocols, setProtocols] = useState(PROTOCOLS)
  const kept = protocols.filter((p) => p.done).length

  // ── transport ──────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0) // seconds, counts UP
  const [summary, setSummary] = useState<Summary | null>(null)
  const running = phase === 'running'
  const pct = targetSec > 0 ? Math.min(1, elapsed / targetSec) : 0
  const remaining = Math.max(0, targetSec - elapsed)

  // finish() lives in a ref so key handlers + the interval never go stale.
  const finishRef = useRef<() => void>(() => {})

  function start() {
    if (phase === 'running') return
    setSummary(null)
    setElapsed(0)
    setPhase('running')
    setSessionActive(true)
  }

  function finish() {
    setPhase('idle')
    setSessionActive(false)
    setSummary({
      mins: Math.max(1, Math.round(elapsed / 60)),
      page: page?.title ?? 'your page',
      pageId,
      kept,
      total: protocols.length,
      length: duration,
    })
    setElapsed(0)
  }
  // keep the ref current without touching it during render.
  useEffect(() => {
    finishRef.current = finish
  })

  // count-up interval — seed-safe (no Date.now), cleaned up on phase change.
  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [phase])

  // auto-finish when the block fills.
  useEffect(() => {
    if (phase === 'running' && elapsed >= targetSec && targetSec > 0) {
      finishRef.current()
    }
  }, [elapsed, phase, targetSec])

  // leaving mid-session restores the chrome.
  useEffect(() => {
    return () => setSessionActive(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Space toggles start/stop (when not typing) · Esc closes the summary.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA'
      if (e.key === 'Escape' && summary) {
        setSummary(null)
        return
      }
      if (e.key === ' ' && !typing && !summary) {
        e.preventDefault()
        if (phase === 'running') finishRef.current()
        else start()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, summary])

  const areaTitle = (page && AREA_TITLE[page.area]) || page?.area || ''

  // ── the focal dial ─────────────────────────────────────────────────────────
  const DIAL = 320
  const STROKE = 5
  const r = (DIAL - STROKE) / 2
  const circ = 2 * Math.PI * r

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'transparent' }}>
      <style>{`
        @keyframes clearing-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes clearing-rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes clearing-breathe { 0%,100% { opacity: 0.9; transform: scale(1) } 50% { opacity: 0.5; transform: scale(0.82) } }
        @keyframes clearing-glow { 0%,100% { opacity: 0.5 } 50% { opacity: 0.9 } }
        .clr-focus { animation: clearing-fade 500ms ${EASE} both }
        .clr-rise { animation: clearing-rise 560ms ${EASE} both }
        .clr-dot { animation: clearing-breathe 2400ms ease-in-out infinite }
        .clr-halo { animation: clearing-glow 4200ms ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) {
          .clr-focus, .clr-rise, .clr-dot, .clr-halo { animation: none !important }
        }
      `}</style>

      <div
        className="clr-focus"
        style={{
          maxWidth: 560,
          margin: '0 auto',
          padding: running ? '54px 32px 80px' : '30px 32px 130px',
          fontFamily: sans,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          transition: `padding 700ms ${EASE}`,
        }}
      >
        {/* ── status kicker — RUST dot only while live ──────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            minHeight: 16,
            marginBottom: 6,
          }}
        >
          {running ? (
            <>
              <span
                className="clr-dot"
                style={{ width: 7, height: 7, borderRadius: 999, background: RUST }}
              />
              <span style={{ ...kicker, color: RUST }}>ON AIR · FOCUSING</span>
            </>
          ) : (
            <span style={{ ...kicker, color: FAINT }}>Focus · one page, one length</span>
          )}
        </div>

        {/* ── calm serif line ──────────────────────────────────────────────── */}
        <div
          style={{
            fontFamily: serif,
            fontSize: 20,
            lineHeight: 1.4,
            color: running ? BODY : INK,
            maxWidth: 360,
            marginBottom: 30,
            transition: `color 500ms ${EASE}`,
          }}
        >
          {running ? (
            <>
              Focusing on <span style={{ fontStyle: 'italic', color: INK }}>{page?.title}</span>.
              Everything else can wait.
            </>
          ) : (
            <>Ready when you are. Nothing else will reach you here.</>
          )}
        </div>

        {/* ── THE DIAL ─────────────────────────────────────────────────────── */}
        <div style={{ position: 'relative', width: DIAL, height: DIAL, marginBottom: 30 }}>
          {/* soft ambient halo behind the ring */}
          <div
            className={running ? 'clr-halo' : undefined}
            aria-hidden
            style={{
              position: 'absolute',
              inset: -30,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${ACCENT_SOFT} 0%, rgba(95,115,85,0) 70%)`,
              opacity: running ? undefined : 0.6,
              pointerEvents: 'none',
            }}
          />
          <svg
            width={DIAL}
            height={DIAL}
            style={{ transform: 'rotate(-90deg)', display: 'block', position: 'relative' }}
          >
            <circle
              cx={DIAL / 2}
              cy={DIAL / 2}
              r={r}
              fill="none"
              stroke={LINE}
              strokeWidth={STROKE}
            />
            <circle
              cx={DIAL / 2}
              cy={DIAL / 2}
              r={r}
              fill="none"
              stroke={running ? ACCENT : FAINT}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - pct)}
              style={{ transition: `stroke-dashoffset 950ms linear, stroke 500ms ${EASE}` }}
            />
          </svg>

          {/* center: oversized Instrument-Serif numeral + mono readout */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span style={{ ...kicker, color: MUTED }}>{running ? 'elapsed' : 'set for'}</span>
            <span
              style={{
                fontFamily: display,
                fontSize: 80,
                lineHeight: 0.82,
                letterSpacing: '-0.02em',
                color: INK,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {running ? fmt(elapsed) : fmt(targetSec)}
            </span>
            <span
              style={{
                fontFamily: mono,
                fontSize: 12,
                letterSpacing: '0.08em',
                color: running ? RUST : MUTED,
              }}
            >
              −{fmt(remaining)} · {duration} MIN
            </span>
          </div>
        </div>

        {/* ── the single primary action ────────────────────────────────────── */}
        {running ? (
          <button
            onClick={finish}
            aria-label="End focus session"
            style={{
              appearance: 'none',
              cursor: 'pointer',
              border: `1px solid ${LINE}`,
              background: CARD,
              color: INK,
              borderRadius: radius.pill,
              padding: '13px 34px',
              fontFamily: sans,
              fontSize: 14,
              fontWeight: 600,
              boxShadow: '0 6px 18px rgba(40,34,24,0.08)',
              transition: `transform 200ms ${EASE}`,
            }}
          >
            End session
          </button>
        ) : (
          <button
            onClick={start}
            aria-label="Start focus session"
            style={{
              appearance: 'none',
              cursor: 'pointer',
              border: 'none',
              background: LIME,
              color: LIME_INK,
              borderRadius: radius.pill,
              padding: '15px 44px',
              fontFamily: sans,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '0.01em',
              boxShadow: '0 12px 30px rgba(95,115,85,0.26)',
              transition: `transform 200ms ${EASE}`,
            }}
          >
            Begin focus
          </button>
        )}
        <div
          style={{
            fontFamily: mono,
            fontSize: 10.5,
            letterSpacing: '0.14em',
            color: FAINT,
            marginTop: 14,
          }}
        >
          {running ? 'SPACE TO END' : 'SPACE TO BEGIN'}
        </div>

        {/* ── While running, the whole setup decision-surface collapses to ONE
              quiet line so the room empties out — only the ring remains ─────── */}
        {running ? (
          <div
            className="clr-focus"
            style={{
              marginTop: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontFamily: mono,
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: FAINT,
            }}
          >
            <KindDot area={page?.area} />
            <span>
              {page?.title} · {areaTitle}
            </span>
            <button
              onClick={finish}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: mono,
                fontSize: 11,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: ACCENT,
                padding: 0,
              }}
            >
              change
            </button>
          </div>
        ) : (
          /* ── SETUP — pickers + protocols (idle only) ─────────────────────── */
          <div
            className="clr-rise"
            style={{
              width: '100%',
              marginTop: 46,
              display: 'flex',
              flexDirection: 'column',
              gap: 26,
              transition: `opacity 700ms ${EASE}`,
            }}
          >
            {/* page picker */}
            <SetupGroup label="Focusing on">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {PAGES.map((p) => (
                  <Pill
                    key={p.id}
                    on={p.id === pageId}
                    onClick={() => setPageId(p.id)}
                    label={p.title}
                    sub={(AREA_TITLE[p.area] || p.area).toUpperCase()}
                  />
                ))}
              </div>
            </SetupGroup>

            {/* duration picker */}
            <SetupGroup label="Block length">
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                {DURATIONS.map((d) => (
                  <Pill
                    key={d}
                    on={d === duration}
                    onClick={() => setDuration(d)}
                    label={`${d}`}
                    sub="MIN"
                  />
                ))}
              </div>
            </SetupGroup>

            {/* ambient · dnd */}
            <SetupGroup label="The room">
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <SoftToggle
                  on={ambient}
                  onClick={() => setAmbient((v) => !v)}
                  label="Ambient"
                  sub={ambient ? 'Brown noise' : 'Silent'}
                />
                <SoftToggle
                  on={dnd}
                  onClick={() => setDnd((v) => !v)}
                  label="Do not disturb"
                  sub={dnd ? 'Muted' : 'Alerts on'}
                />
              </div>
            </SetupGroup>

            {/* protocols checklist */}
            <SetupGroup label={`Protocols · ${kept}/${protocols.length} kept`}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  maxWidth: 320,
                  margin: '0 auto',
                }}
              >
                {protocols.map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      setProtocols((ps) =>
                        ps.map((x) => (x.id === p.id ? { ...x, done: !x.done } : x))
                      )
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '9px 4px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: sans,
                      fontSize: 14,
                    }}
                  >
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 999,
                        flexShrink: 0,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 11,
                        color: DONE_INK,
                        background: p.done ? DONE : 'transparent',
                        border: p.done ? 'none' : `1.5px solid ${FAINT}`,
                        transition: `background 200ms ${EASE}`,
                      }}
                    >
                      {p.done ? '✓' : ''}
                    </span>
                    <span
                      style={{
                        color: p.done ? MUTED : INK,
                        textDecorationLine: p.done ? 'line-through' : 'none',
                        textDecorationColor: FAINT,
                      }}
                    >
                      {p.label}
                    </span>
                  </button>
                ))}
              </div>
            </SetupGroup>

            {/* recent sessions — quiet history, hairline-separated */}
            <SetupGroup label="Recent sessions">
              <div style={{ maxWidth: 340, margin: '0 auto' }}>
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    color: MUTED,
                    textAlign: 'center',
                    marginBottom: 12,
                  }}
                >
                  {TODAY_MINS} min focused today · {HISTORY.length} sessions
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {HISTORY.map((s, i) => (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 11,
                        padding: '10px 2px',
                        borderTop: i === 0 ? 'none' : `1px solid ${HAIR}`,
                      }}
                    >
                      <KindDot area={s.area} />
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          textAlign: 'left',
                          fontFamily: sans,
                          fontSize: 13.5,
                          color: BODY,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {s.title}
                      </span>
                      <span
                        style={{
                          fontFamily: mono,
                          fontSize: 11,
                          letterSpacing: '0.04em',
                          color: MUTED,
                          flexShrink: 0,
                        }}
                      >
                        {s.mins}m · {s.kept}/{s.total}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </SetupGroup>
          </div>
        )}
      </div>

      {/* ── POST-SESSION SUMMARY — a calm centered glass card ───────────────── */}
      {summary && (
        <div
          className="clr-focus"
          onClick={() => setSummary(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(33,31,27,0.30)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
          }}
        >
          <div
            className="clr-rise"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(500px, 92vw)',
              ...glass,
              borderRadius: 28,
              padding: 34,
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: LIME }} />
              <span style={{ ...kicker, color: ACCENT }}>Session complete</span>
              <button
                onClick={() => setSummary(null)}
                aria-label="Close summary"
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: MUTED,
                  fontSize: 18,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span
                style={{
                  fontFamily: display,
                  fontSize: 82,
                  lineHeight: 0.82,
                  letterSpacing: '-0.02em',
                  color: INK,
                }}
              >
                {summary.mins}
              </span>
              <span
                style={{ fontFamily: mono, fontSize: 13, letterSpacing: '0.1em', color: MUTED }}
              >
                MIN FOCUSED
              </span>
            </div>

            <div style={{ display: 'flex', gap: 26, marginTop: 22, flexWrap: 'wrap' }}>
              <Stat label="Page" value={summary.page} />
              <Stat label="Protocols kept" value={`${summary.kept}/${summary.total}`} />
              <Stat label="Length" value={`${summary.length} min`} />
            </div>

            <p
              style={{
                fontFamily: serif,
                fontSize: 17,
                lineHeight: 1.55,
                color: BODY,
                margin: '24px 0 0',
                borderTop: `1px solid ${LINE}`,
                paddingTop: 20,
              }}
            >
              {pondNote(summary.page, summary.mins, summary.kept, summary.total)}
            </p>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  const id = summary.pageId
                  setSummary(null)
                  goRead(id)
                }}
                style={{
                  padding: '12px 22px',
                  borderRadius: radius.pill,
                  border: 'none',
                  cursor: 'pointer',
                  background: LIME,
                  color: LIME_INK,
                  fontFamily: sans,
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                New note →
              </button>
              <button
                onClick={() => setSummary(null)}
                style={{
                  padding: '12px 20px',
                  borderRadius: radius.pill,
                  border: `1px solid ${LINE}`,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: BODY,
                  fontFamily: sans,
                  fontSize: 13,
                }}
              >
                Ask Pond
              </button>
              <button
                onClick={() => setSummary(null)}
                style={{
                  marginLeft: 'auto',
                  padding: '12px 18px',
                  borderRadius: radius.pill,
                  border: 'none',
                  cursor: 'pointer',
                  background: 'transparent',
                  color: MUTED,
                  fontFamily: sans,
                  fontSize: 13,
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** A quiet titled group: mono kicker over centered content. */
function SetupGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ ...kicker, marginBottom: 12 }}>{label}</div>
      {children}
    </div>
  )
}

/** A quiet segmented pill — page / duration selection. */
function Pill({
  on,
  onClick,
  label,
  sub,
}: {
  on: boolean
  onClick: () => void
  label: string
  sub: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '10px 16px',
        borderRadius: radius.soft,
        cursor: 'pointer',
        border: `1px solid ${on ? ACCENT : LINE}`,
        background: on ? ACCENT_SOFT : 'transparent',
        fontFamily: sans,
        transition: `all 200ms ${EASE}`,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: on ? 700 : 500, color: on ? INK : BODY }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: mono,
          fontSize: 9,
          letterSpacing: '0.14em',
          color: on ? ACCENT : MUTED,
        }}
      >
        {sub}
      </span>
    </button>
  )
}

/** Sage ambient toggle — a quiet switch with a mono state line. */
function SoftToggle({
  on,
  onClick,
  label,
  sub,
}: {
  on: boolean
  onClick: () => void
  label: string
  sub: string
}) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      style={{
        flex: 1,
        maxWidth: 180,
        textAlign: 'left',
        padding: '11px 14px',
        borderRadius: radius.soft,
        cursor: 'pointer',
        border: `1px solid ${on ? ACCENT : LINE}`,
        background: on ? ACCENT_SOFT : 'transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            width: 30,
            height: 17,
            borderRadius: 999,
            background: on ? ACCENT : FAINT,
            position: 'relative',
            flexShrink: 0,
            transition: `background 200ms ${EASE}`,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: on ? 15 : 2,
              width: 13,
              height: 13,
              borderRadius: 999,
              background: CARD,
              transition: `left 200ms ${EASE}`,
            }}
          />
        </span>
        <span style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: INK }}>
          {label}
        </span>
      </span>
      <span
        style={{
          fontFamily: mono,
          fontSize: 10,
          letterSpacing: '0.08em',
          color: on ? ACCENT : MUTED,
        }}
      >
        {sub.toUpperCase()}
      </span>
    </button>
  )
}

/** A small summary stat — kicker over a serif value. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={kicker}>{label}</span>
      <span style={{ fontFamily: serif, fontSize: 18, color: INK }}>{value}</span>
    </div>
  )
}
