'use client'

/**
 * v85 CLEARING — shared design language.
 *
 * Zen-Press: the LOCKED Press aesthetic (warm paper · Instrument-Serif numerals ·
 * liquid-glass chrome · soft-shadow module cards) dialed toward calm — more air,
 * MUTED accents used as rare punctuation, one focal element per view, slower
 * gentler motion. Every surface imports its tokens/primitives from here so the
 * whole product reads as one calm hand.
 *
 * Calm discipline (hold these across all four surfaces):
 *  • LIME is the ONLY primary-action color (Send/Start/one CTA) + todo checks. Rare.
 *  • RUST is rare punctuation only (a single now-line / one live streak). Never fill.
 *  • Sage ACCENT is the ambient tint (active-nav wash, quiet emphasis).
 *  • Prose is FLAT serif on paper. Modules are soft-shadow cards. Chrome is glass.
 *  • Reach for whitespace + a hairline before reaching for a card or a color.
 */

export const sans = 'var(--proto-font-sans)'
export const serif = 'var(--proto-font-serif)'
export const display = 'var(--proto-font-display)'
export const mono = 'var(--proto-font-mono)'

// ── palette (Press base, unchanged values — calm comes from how sparingly we use them)
export const PAPER = '#efeae0' // warm paper base
export const INK = '#211f1b' // richest ink
export const BODY = 'rgba(33,31,27,0.80)'
export const MUTED = 'rgba(33,31,27,0.52)'
export const FAINT = 'rgba(33,31,27,0.30)'
export const LINE = 'rgba(33,31,27,0.09)'
export const HAIR = 'rgba(33,31,27,0.055)' // even fainter — the calm divider
export const CARD = '#faf8f2' // near-white module surface
export const ACCENT = '#5f7355' // sage — ambient tint
export const ACCENT_SOFT = 'rgba(95,115,85,0.12)'
export const ACCENT_WASH = 'rgba(95,115,85,0.06)'
export const LIME = '#c4e08a' // the single primary-action color
export const LIME_INK = '#2c3a17'
export const RUST = '#c2632f' // rare punctuation only
// "quietly done" — a muted, desaturated olive for COMPLETED/checked states, so
// inert done-rows recede instead of glowing with the primary-action lime.
export const DONE = 'rgba(95,115,85,0.34)' // sage, dropped in saturation + opacity
export const DONE_INK = 'rgba(33,31,27,0.62)' // the tick mark on a done fill

// ── motion — slow + gentle for calm
export const EASE = 'cubic-bezier(0.22,0.8,0.2,1)'

// ── soft-shadow module card (softer than Press for a quieter surface)
export const cardShadow = '0 1px 2px rgba(40,34,24,0.04), 0 8px 24px rgba(40,34,24,0.06)'
export const radius = { card: 20, pill: 999, soft: 14, chip: 10 } as const

// ── liquid glass — floating chrome ONLY
export const glass = {
  background: 'linear-gradient(160deg, rgba(255,254,250,0.84) 0%, rgba(255,254,250,0.62) 100%)',
  backdropFilter: 'blur(24px) saturate(1.3)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
  border: '1px solid rgba(255,255,255,0.8)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 20px 54px rgba(40,34,24,0.14)',
} as const

// ── micro-label + keycap
export const kicker = {
  fontFamily: mono,
  fontSize: 10,
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  color: FAINT,
}
export const kbd = {
  fontFamily: mono,
  fontSize: 11,
  padding: '2px 7px',
  borderRadius: 6,
  border: `1px solid ${LINE}`,
  background: 'rgba(33,31,27,0.03)',
  color: BODY,
  lineHeight: 1,
}

// ── area accent (one dot color per area; muted)
export const AREA_ACCENT: Record<string, string> = {
  health: ACCENT,
  work: '#6b7a86', // muted slate
  life: '#8a6b74', // muted mauve
  wood: '#9a6b43', // muted clay
  reading: '#8a7a4a', // muted gold
}

// ── reader themes (paper / sepia / night) — warm, never harsh
export interface ReaderTheme {
  bg: string
  ink: string
  body: string
  mark: string
  faint: string
  line: string
}
export const THEMES: Record<'paper' | 'sepia' | 'night', ReaderTheme> = {
  paper: { bg: PAPER, ink: INK, body: BODY, mark: 'rgba(196,224,138,0.5)', faint: FAINT, line: LINE },
  sepia: {
    bg: '#f0e2c8',
    ink: '#2a2016',
    body: 'rgba(42,32,22,0.82)',
    mark: 'rgba(194,99,47,0.26)',
    faint: 'rgba(42,32,22,0.34)',
    line: 'rgba(42,32,22,0.10)',
  },
  night: {
    bg: '#26231e',
    ink: '#f0ebe1',
    body: 'rgba(240,235,225,0.82)',
    mark: 'rgba(196,224,138,0.24)',
    faint: 'rgba(240,235,225,0.34)',
    line: 'rgba(240,235,225,0.11)',
  },
}

// ── shared primitives ────────────────────────────────────────────────────────

/** Soft-shadow module card. Prose never uses this — only modules do. */
export function Card({
  children,
  style,
  onClick,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: radius.card,
        boxShadow: cardShadow,
        padding: '18px 20px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** A muted rounded-square dot keyed to an area. The calm way to color-code. */
export function KindDot({ area, size = 7 }: { area?: string; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 2,
        flexShrink: 0,
        background: (area && AREA_ACCENT[area]) || FAINT,
      }}
    />
  )
}

/** Hand-rolled sparkline — deterministic, no Math.random. */
export function Spark({
  data,
  w = 132,
  h = 40,
  color = ACCENT,
}: {
  data: number[]
  w?: number
  h?: number
  color?: string
}) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const pts = data
    .map(
      (v, i) =>
        `${((i / (data.length - 1)) * w).toFixed(1)},${(h - ((v - min) / (max - min || 1)) * (h - 6) - 3).toFixed(1)}`,
    )
    .join(' ')
  const last = pts.split(' ').pop()!.split(',')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
    </svg>
  )
}

/** Thin progress ring with an optional center label. */
export function Ring({
  pct,
  size = 96,
  label,
  sub,
  color = ACCENT,
  stroke = 7,
}: {
  pct: number
  size?: number
  label?: string
  sub?: string
  color?: string
  stroke?: number
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={LINE} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, pct)))}
          style={{ transition: `stroke-dashoffset 700ms ${EASE}` }}
        />
      </svg>
      {(label || sub) && (
        <div
          style={{
            position: 'absolute',
            // sit inside the inner well: inset by the stroke + a breathing gutter,
            // so neither the number nor its caption is ever touched by the arc.
            inset: stroke + Math.round(size * 0.1),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: Math.max(2, Math.round(size * 0.03)),
            textAlign: 'center',
            lineHeight: 1,
            overflow: 'hidden',
          }}
        >
          {label && (
            <span style={{ fontFamily: display, fontSize: size * 0.28, color: INK, lineHeight: 1, letterSpacing: '-0.01em' }}>
              {label}
            </span>
          )}
          {sub && (
            <span
              style={{
                ...kicker,
                fontSize: Math.max(7.5, Math.min(10, size * 0.085)),
                letterSpacing: '0.12em',
                lineHeight: 1.1,
                maxWidth: '100%',
              }}
            >
              {sub}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** The mono "receipt" stat block — a calm signature carried from Press. */
export function Receipt({ title, rows }: { title: string; rows: [string, string, string?][] }) {
  return (
    <div
      style={{
        padding: '14px 14px',
        border: `1px dashed ${LINE}`,
        borderRadius: radius.soft,
        fontFamily: mono,
        fontSize: 11,
        color: MUTED,
        lineHeight: 1.9,
      }}
    >
      <div style={{ ...kicker, marginBottom: 6 }}>{title}</div>
      {rows.map(([k, v, accent]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{k}</span>
          <span style={{ color: accent || INK }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

/** Small segmented control — the calm toggle (Week/Day, typeface, size…). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: radius.pill, background: ACCENT_WASH }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: '6px 14px',
              borderRadius: radius.pill,
              border: 'none',
              cursor: 'pointer',
              fontFamily: sans,
              fontSize: 12.5,
              fontWeight: on ? 600 : 500,
              color: on ? INK : MUTED,
              background: on ? CARD : 'transparent',
              boxShadow: on ? '0 1px 3px rgba(40,34,24,0.08)' : 'none',
              transition: `all 200ms ${EASE}`,
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
