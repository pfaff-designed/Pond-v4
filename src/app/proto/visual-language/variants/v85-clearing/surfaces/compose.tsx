'use client'

/**
 * v85 CLEARING — the COMPOSE surface (t16 "AI composition" feel-proto).
 *
 * The one interaction v85 didn't yet dramatize: Pond assembling a view that
 * didn't exist. A ComposeScript is played back on a timer — a build-trace of
 * narration lines interleaved with module cards that materialize (skeleton →
 * filled), each carrying a one-line "why this". One beat is an UNCERTAIN module:
 * Pond asks rather than guesses, so we can feel how doubt lands mid-compose. When
 * the last beat settles, a landing bar offers the composition's accept verb
 * (Pin / Apply / Create) or Dismiss.
 *
 * Deterministic: advances on setTimeout, no Date.now / no Math.random. Reuses
 * ui.tsx primitives (Ring/Spark/Card) so no new dashboards are needed.
 *
 * Calm discipline holds: LIME is the only primary action (the landing verb);
 * RUST is rare punctuation (an off-track stat dot); one focal serif title.
 */

import { useEffect, useState } from 'react'
import type { ComposeScript, ModuleBeat, UncertainBeat } from '../data'
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
  kicker,
  radius,
  cardShadow,
  Ring,
  Spark,
  KindDot,
  AREA_ACCENT,
} from '../ui'

export default function Compose({
  script,
  seed,
  settled = false,
  onLand,
  onClose,
}: {
  script: ComposeScript
  seed?: string
  /** re-opened from the rail: everything already filled, no timer, no landing bar. */
  settled?: boolean
  onLand: () => void
  onClose: () => void
}) {
  const { beats } = script
  // head = index of the beat currently materializing; < head is filled, === head
  // is skeleton/typing, > head is not yet arrived. beats.length ⇒ all settled.
  const [head, setHead] = useState(settled ? beats.length : 0)
  const [choices, setChoices] = useState<Record<number, string>>({})

  useEffect(() => {
    if (settled || head >= beats.length) return
    const b = beats[head]
    const ms = b.ms ?? (b.kind === 'read' ? 640 : 900)
    const t = setTimeout(() => setHead((h) => h + 1), ms)
    return () => clearTimeout(t)
  }, [head, settled, beats])

  const done = head >= beats.length
  const ask = seed?.trim() || script.ask

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <style>{`
        @keyframes cmp-rise { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes cmp-pulse { 0%,100%{opacity:.35;transform:scale(.8)} 50%{opacity:.9;transform:scale(1)} }
        @keyframes cmp-shim { 0%{opacity:.5} 50%{opacity:.85} 100%{opacity:.5} }
        .cmp-rise{ animation:cmp-rise 520ms ${EASE} both }
        .cmp-dot{ animation:cmp-pulse 1200ms ease-in-out infinite }
        .cmp-shim{ animation:cmp-shim 1100ms ease-in-out infinite }
        @media (prefers-reduced-motion: reduce){ .cmp-rise,.cmp-dot,.cmp-shim{animation:none!important} }
      `}</style>

      <div
        style={{
          maxWidth: 660,
          margin: '0 auto',
          padding: '56px 32px 140px',
          fontFamily: sans,
        }}
      >
        {/* ── header: what Pond is building, and the ask that triggered it ──── */}
        <div className="cmp-rise" style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
            <span
              className={done ? undefined : 'cmp-dot'}
              style={{ width: 8, height: 8, borderRadius: 999, background: done ? ACCENT : LIME }}
            />
            <span style={{ ...kicker, color: ACCENT }}>{script.eyebrow}</span>
          </div>
          <h1
            style={{
              fontFamily: display,
              fontSize: 42,
              lineHeight: 1.05,
              letterSpacing: '-0.015em',
              color: INK,
              margin: '0 0 10px',
            }}
          >
            {script.title}
          </h1>
          <p
            style={{
              fontFamily: serif,
              fontSize: 15.5,
              lineHeight: 1.5,
              color: MUTED,
              margin: 0,
            }}
          >
            <span style={{ color: FAINT }}>“</span>
            {ask}
            <span style={{ color: FAINT }}>”</span>
          </p>
        </div>

        {/* ── the composition: beats in order, streaming in ─────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {beats.map((b, i) => {
            if (i > head) return null
            const materializing = i === head && !settled
            if (b.kind === 'read') {
              return <ReadRow key={i} text={b.text} typing={materializing} />
            }
            if (b.kind === 'uncertain') {
              return (
                <UncertainCard
                  key={i}
                  beat={b}
                  skeleton={materializing}
                  choice={choices[i]}
                  onChoose={(opt) => setChoices((c) => ({ ...c, [i]: opt }))}
                />
              )
            }
            return <ModuleCard key={i} beat={b} skeleton={materializing} />
          })}
        </div>

        {/* ── landing bar: the composition is assembled, now place it ────────── */}
        {done && !settled && (
          <div
            className="cmp-rise"
            style={{
              marginTop: 26,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px 18px',
              borderRadius: radius.card,
              border: `1px solid ${LINE}`,
              background: ACCENT_SOFT,
            }}
          >
            <span style={{ fontFamily: serif, fontSize: 14, color: BODY, flex: 1, minWidth: 0 }}>
              Assembled from {beats.filter((x) => x.kind !== 'read').length} pieces across your
              life. Yours to keep or let go.
            </span>
            <button onClick={onClose} style={ghostBtn}>
              Dismiss
            </button>
            <button onClick={onLand} style={primaryBtn}>
              {script.landCta}
            </button>
          </div>
        )}

        {settled && (
          <div style={{ ...kicker, color: FAINT, marginTop: 24 }}>
            Pinned composition · a live read, recomposed each time you open it
          </div>
        )}
      </div>
    </div>
  )
}

/* ── a narration line in Pond's build-trace ─────────────────────────────────── */
function ReadRow({ text, typing }: { text: string; typing: boolean }) {
  return (
    <div
      className="cmp-rise"
      style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '7px 2px' }}
    >
      <span
        className={typing ? 'cmp-dot' : undefined}
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          flexShrink: 0,
          background: typing ? ACCENT : FAINT,
        }}
      />
      <span
        style={{
          fontFamily: serif,
          fontSize: 13.5,
          lineHeight: 1.5,
          color: typing ? BODY : MUTED,
          fontStyle: 'italic',
        }}
      >
        {text}
        {typing && (
          <span className="cmp-shim" style={{ color: FAINT }}>
            {' '}
            ···
          </span>
        )}
      </span>
    </div>
  )
}

/* ── the frame every composed module shares: area dot · title · why · body ──── */
function ModuleShell({
  area,
  title,
  why,
  children,
}: {
  area: string
  title: string
  why: string
  children: React.ReactNode
}) {
  return (
    <div
      className="cmp-rise"
      style={{
        margin: '6px 0',
        padding: '18px 20px',
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: radius.card,
        boxShadow: cardShadow,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <KindDot area={area} />
        <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>{title}</span>
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 14, paddingLeft: 15 }}>
        <span style={{ color: ACCENT }}>why</span> · {why}
      </div>
      {children}
    </div>
  )
}

/* ── skeleton shimmer, shown for a beat while it materializes ────────────────── */
function Skeleton() {
  const bar = (w: string): React.CSSProperties => ({
    height: 10,
    width: w,
    borderRadius: 6,
    background: HAIR,
    marginBottom: 9,
  })
  return (
    <div className="cmp-shim">
      <div style={{ ...bar('42%'), height: 22 }} />
      <div style={bar('78%')} />
      <div style={bar('58%')} />
    </div>
  )
}

function ModuleCard({ beat, skeleton }: { beat: ModuleBeat; skeleton: boolean }) {
  return (
    <ModuleShell area={beat.area} title={beat.title} why={beat.why}>
      {skeleton ? <Skeleton /> : <ModuleBody beat={beat} />}
    </ModuleShell>
  )
}

/** Renders a beat's body from a ui.tsx primitive keyed by `render`. */
function ModuleBody({ beat }: { beat: ModuleBeat }) {
  const accent = AREA_ACCENT[beat.area] || ACCENT
  if (beat.render === 'ring' && beat.ring) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
        <Ring
          pct={beat.ring.pct}
          size={108}
          label={beat.ring.label}
          sub={beat.ring.sub}
          color={accent}
        />
      </div>
    )
  }
  if (beat.render === 'spark' && beat.spark) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
        <span style={{ fontFamily: display, fontSize: 40, lineHeight: 1, color: INK }}>
          {beat.spark.big}
        </span>
        <div style={{ flex: 1 }}>
          <Spark data={beat.spark.data} w={220} h={46} color={accent} />
        </div>
        <span style={{ ...kicker, color: FAINT, alignSelf: 'flex-end' }}>{beat.spark.note}</span>
      </div>
    )
  }
  if (beat.render === 'stat' && beat.stat) {
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        {beat.stat.off && (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: RUST,
              alignSelf: 'center',
            }}
          />
        )}
        <span style={{ fontFamily: display, fontSize: 34, lineHeight: 1, color: INK }}>
          {beat.stat.big}
        </span>
        {beat.stat.unit && <span style={{ fontSize: 14, color: MUTED }}>{beat.stat.unit}</span>}
        <span style={{ fontSize: 12.5, color: MUTED, marginLeft: 'auto', alignSelf: 'center' }}>
          {beat.stat.note}
        </span>
      </div>
    )
  }
  if (beat.render === 'diff' && beat.diff) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 13.5,
            color: FAINT,
            textDecoration: 'line-through',
            fontFamily: serif,
          }}
        >
          {beat.diff.before}
        </span>
        <span style={{ color: ACCENT, fontSize: 14 }}>→</span>
        <span style={{ fontSize: 14, color: INK, fontFamily: serif, fontWeight: 500 }}>
          {beat.diff.after}
        </span>
      </div>
    )
  }
  if (beat.render === 'list' && beat.list) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {beat.list.map((line, i) => (
          <div
            key={i}
            style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: BODY }}
          >
            <span
              style={{ width: 5, height: 5, borderRadius: 999, background: accent, flexShrink: 0 }}
            />
            {line}
          </div>
        ))}
      </div>
    )
  }
  return null
}

/* ── the uncertain module: Pond asks instead of guessing ────────────────────── */
function UncertainCard({
  beat,
  skeleton,
  choice,
  onChoose,
}: {
  beat: UncertainBeat
  skeleton: boolean
  choice?: string
  onChoose: (opt: string) => void
}) {
  return (
    <div
      className="cmp-rise"
      style={{
        margin: '6px 0',
        padding: '18px 20px',
        background: 'transparent',
        border: `1px dashed ${LINE}`,
        borderRadius: radius.card,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <KindDot area={beat.area} />
        <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>{beat.title}</span>
        <span style={{ ...kicker, color: RUST, marginLeft: 'auto' }}>not sure</span>
      </div>
      {skeleton ? (
        <div style={{ paddingLeft: 15, marginTop: 10 }}>
          <Skeleton />
        </div>
      ) : (
        <div style={{ paddingLeft: 15 }}>
          <p
            style={{
              fontFamily: serif,
              fontSize: 14,
              lineHeight: 1.55,
              color: BODY,
              margin: '6px 0 14px',
            }}
          >
            {beat.question}
          </p>
          {choice ? (
            <span style={{ ...kicker, color: ACCENT }}>✓ {choice}</span>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => onChoose(beat.options[0])} style={primaryBtn}>
                {beat.options[0]}
              </button>
              <button onClick={() => onChoose(beat.options[1])} style={ghostBtn}>
                {beat.options[1]}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  padding: '9px 20px',
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer',
  background: LIME,
  color: LIME_INK,
  fontFamily: sans,
  fontWeight: 700,
  fontSize: 13,
  flexShrink: 0,
}
const ghostBtn: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 999,
  border: `1px solid ${LINE}`,
  cursor: 'pointer',
  background: 'transparent',
  color: MUTED,
  fontFamily: sans,
  fontSize: 13,
  flexShrink: 0,
}
