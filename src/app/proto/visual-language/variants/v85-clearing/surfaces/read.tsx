'use client'

/**
 * v85 CLEARING — READ surface.
 *
 * The calmest room in the product: a long-form reading experience on warm paper.
 * Flat serif prose, no cards. Sentences are the DOM source of truth — each is a
 * clickable <span data-sid> so highlight / annotate / ask-Pond selection is
 * deterministic. Live reader settings (measure · typeface · size · theme) sit in
 * a quiet glass panel. Pond's ambient notes drift in the right margin. Motion is
 * slow, gentle, and respectful of prefers-reduced-motion.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  RUST,
  EASE,
  glass,
  kicker,
  radius,
  Segmented,
  THEMES,
  type ReaderTheme,
} from '../ui'
import { READER, AMBIENT_NOTES } from '../data'
import type { SurfaceCtx } from '../shell-types'

type ThemeKey = 'paper' | 'sepia' | 'night'
type Face = 'serif' | 'sans'
type Measure = '540' | '620' | '740'
type Size = '18' | '20' | '22'

const reduced =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface BarState {
  sid: string
  text: string
  x: number
  y: number
}

export default function Read({ askPond }: SurfaceCtx) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── live reader settings ────────────────────────────────────────────────
  const [measure, setMeasure] = useState<Measure>('620')
  const [face, setFace] = useState<Face>('serif')
  const [size, setSize] = useState<Size>('20')
  const [themeKey, setThemeKey] = useState<ThemeKey>('paper')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const theme: ReaderTheme = THEMES[themeKey]

  // ── interaction state ───────────────────────────────────────────────────
  const [bar, setBar] = useState<BarState | null>(null)
  const [highlights, setHighlights] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [annotating, setAnnotating] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)

  // ── reading progress + active section ───────────────────────────────────
  const [progress, setProgress] = useState(0)
  const [activeHid, setActiveHid] = useState(READER.sections[0].hid)

  // ── ambient notes ───────────────────────────────────────────────────────
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Margin notes live in the right gutter, never over the text. We anchor each
  // note to the vertical offset of its sentence within the (position:relative)
  // section, measured after layout + on any reflow (resize / setting change).
  const sentRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const [anchorTops, setAnchorTops] = useState<Record<string, number>>({})
  const measureAnchors = useCallback(() => {
    const tops: Record<string, number> = {}
    for (const sid in sentRefs.current) {
      const el = sentRefs.current[sid]
      if (el) tops[sid] = el.offsetTop
    }
    setAnchorTops(tops)
  }, [])

  const bodyPx = Number(size)
  const colWidth = Number(measure)
  const bodyFamily = face === 'serif' ? serif : sans
  const trans = reduced ? 'none' : `background .3s ${EASE}, color .3s ${EASE}`

  // ── scroll → progress + which heading is nearest the top ────────────────
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const denom = el.scrollHeight - el.clientHeight
    setProgress(denom > 0 ? el.scrollTop / denom : 0)
    let current = READER.sections[0].hid
    const anchor = el.getBoundingClientRect().top + 140
    for (const s of READER.sections) {
      const h = el.querySelector<HTMLElement>(`[data-hid="${s.hid}"]`)
      if (h && h.getBoundingClientRect().top <= anchor) current = s.hid
    }
    setActiveHid(current)
    if (bar) setBar(null)
  }, [bar])

  // ── sentence click → floating glass action bar above it ─────────────────
  const onSentence = useCallback((e: React.MouseEvent, sid: string, text: string) => {
    e.stopPropagation()
    const host = scrollRef.current
    if (!host) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const h = host.getBoundingClientRect()
    setBar({
      sid,
      text,
      x: r.left - h.left + host.scrollLeft + r.width / 2,
      y: r.top - h.top + host.scrollTop,
    })
    setCopied(false)
  }, [])

  const closeBar = useCallback(() => {
    setBar(null)
    setCopied(false)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setBar(null)
        setAnnotating(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // re-measure gutter-note anchors after layout + whenever the measure/size/face
  // (which reflow the column) change; also on window resize.
  useEffect(() => {
    const id = requestAnimationFrame(measureAnchors)
    window.addEventListener('resize', measureAnchors)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', measureAnchors)
    }
  }, [measureAnchors, measure, size, face, notes])

  const toggleHighlight = (sid: string) => {
    setHighlights((prev) => {
      const next = new Set(prev)
      next.has(sid) ? next.delete(sid) : next.add(sid)
      return next
    })
    closeBar()
  }

  const openAnnotate = (sid: string) => {
    setAnnotating(sid)
    setDraft(notes[sid] ?? '')
    closeBar()
  }
  const saveAnnotate = (sid: string) => {
    setNotes((prev) => {
      const next = { ...prev }
      const v = draft.trim()
      if (v) next[sid] = v
      else delete next[sid]
      return next
    })
    setAnnotating(null)
    setDraft('')
  }

  const jumpTo = (hid: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-hid="${hid}"]`)
    el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }

  // ── ambient notes grouped by their anchor sid ────────────────────────────
  const notesBySid = useMemo(() => {
    const m: Record<string, typeof AMBIENT_NOTES> = {}
    for (const n of AMBIENT_NOTES) (m[n.sid] ??= []).push(n)
    return m
  }, [])

  const areaLabel = READER.crumb.join(' · ')

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      onClick={closeBar}
      style={{
        height: '100%',
        overflowY: 'auto',
        position: 'relative',
        background: theme.bg,
        color: theme.body,
        transition: trans,
      }}
    >
      {/* reading-progress rail — slim rust line pinned to the top */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          height: 3,
          zIndex: 40,
          background: 'transparent',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            height: '100%',
            width: '100%',
            background: RUST,
            transformOrigin: 'left',
            transform: `scaleX(${progress})`,
            transition: reduced ? 'none' : `transform 120ms linear`,
          }}
        />
      </div>

      {/* quiet settings control — top-right of the reading room */}
      <div style={{ position: 'sticky', top: 3, zIndex: 30, height: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '18px 24px 0' }}>
          <SettingsControl
            open={settingsOpen}
            onToggle={() => setSettingsOpen((v) => !v)}
            measure={measure}
            setMeasure={setMeasure}
            face={face}
            setFace={setFace}
            size={size}
            setSize={setSize}
            themeKey={themeKey}
            setThemeKey={setThemeKey}
          />
        </div>
      </div>

      {/* centered reading column */}
      <div
        style={{
          margin: '0 auto',
          maxWidth: colWidth,
          padding: '40px 24px 140px',
          position: 'relative',
        }}
      >
        {/* floating outline — sits to the LEFT of the column on wide viewports */}
        <Outline
          sections={READER.sections}
          activeHid={activeHid}
          onJump={jumpTo}
          faint={theme.faint}
          ink={theme.ink}
        />

        {/* header */}
        <header style={{ marginBottom: 40 }}>
          <div style={{ ...kicker, color: theme.faint, marginBottom: 18 }}>{READER.kicker}</div>
          <h1
            style={{
              fontFamily: display,
              fontWeight: 400,
              fontSize: 44,
              lineHeight: 1.1,
              letterSpacing: '-0.01em',
              color: theme.ink,
              margin: '0 0 18px',
              transition: trans,
            }}
          >
            {READER.title}
          </h1>
          <p
            style={{
              fontFamily: serif,
              fontStyle: 'italic',
              fontSize: 21,
              lineHeight: 1.5,
              color: theme.body,
              margin: '0 0 20px',
              maxWidth: 620,
              transition: trans,
            }}
          >
            {READER.standfirst}
          </p>
          <div style={{ fontFamily: mono, fontSize: 11.5, letterSpacing: '0.04em', color: theme.faint }}>
            {areaLabel} · {READER.minutes} min read
          </div>
          <div style={{ height: 1, background: theme.line, marginTop: 28, transition: trans }} />
        </header>

        {/* prose — flat serif, sentences are the DOM truth */}
        {READER.sections.map((section) => (
          <section key={section.hid} data-hid={section.hid} style={{ scrollMarginTop: 24, marginBottom: 8, position: 'relative' }}>
            <h2
              style={{
                fontFamily: bodyFamily,
                fontWeight: 600,
                fontSize: bodyPx + 4,
                lineHeight: 1.3,
                color: theme.ink,
                margin: '34px 0 14px',
                transition: trans,
              }}
            >
              {section.heading}
            </h2>
            <p
              style={{
                fontFamily: bodyFamily,
                fontSize: bodyPx,
                lineHeight: 1.72,
                color: theme.body,
                margin: 0,
                transition: trans,
              }}
            >
              {section.sentences.map((s) => {
                const on = highlights.has(s.sid)
                const hasNote = !!notesBySid[s.sid] || !!notes[s.sid]
                return (
                  <span
                    key={s.sid}
                    ref={(el) => { sentRefs.current[s.sid] = el }}
                    data-sid={s.sid}
                    onClick={(e) => onSentence(e, s.sid, s.text)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 3,
                      padding: '0.5px 1px',
                      boxDecorationBreak: 'clone',
                      WebkitBoxDecorationBreak: 'clone',
                      background: on ? theme.mark : 'transparent',
                      // a subtle pencil marker under any annotated sentence — the
                      // note itself lives in the gutter and never covers words
                      borderBottom: hasNote ? `1px solid ${theme.faint}` : undefined,
                      transition: reduced ? 'none' : `background 220ms ${EASE}`,
                    }}
                  >
                    {s.text}{' '}
                  </span>
                )
              })}
            </p>

            {/* right-gutter margin notes — absolutely placed against the section,
                aligned to each anchor sentence's top; never over the reading measure */}
            {section.sentences.map((s) => {
              const top = anchorTops[s.sid]
              if (top == null) return null
              const anchored = notesBySid[s.sid] ?? []
              const items: React.ReactNode[] = []
              if (notes[s.sid] && annotating !== s.sid) {
                items.push(
                  <MarginNote key={`m-${s.sid}`} text={notes[s.sid]} theme={theme} onEdit={() => openAnnotate(s.sid)} />,
                )
              }
              for (const n of anchored) {
                if (dismissed.has(n.id)) continue
                items.push(
                  <AmbientMargin
                    key={n.id}
                    text={n.text}
                    open={expanded.has(n.id)}
                    theme={theme}
                    onToggle={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev)
                        next.has(n.id) ? next.delete(n.id) : next.add(n.id)
                        return next
                      })
                    }
                    onDismiss={() => setDismissed((prev) => new Set(prev).add(n.id))}
                  />,
                )
              }
              if (annotating === s.sid) {
                items.push(
                  <span
                    key={`edit-${s.sid}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: 'block' }}
                  >
                    <textarea
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="A note to yourself…"
                      style={{
                        width: '100%',
                        minHeight: 74,
                        resize: 'none',
                        padding: '10px 12px',
                        fontFamily: bodyFamily,
                        fontSize: 14,
                        lineHeight: 1.5,
                        color: theme.ink,
                        background: 'transparent',
                        border: `1px solid ${theme.line}`,
                        borderLeft: `2px solid ${RUST}`,
                        borderRadius: radius.chip,
                        outline: 'none',
                      }}
                    />
                    <span style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <MiniBtn label="Save" onClick={() => saveAnnotate(s.sid)} theme={theme} accent />
                      <MiniBtn label="Cancel" onClick={() => setAnnotating(null)} theme={theme} />
                    </span>
                  </span>,
                )
              }
              if (items.length === 0) return null
              return (
                <div
                  key={`gutter-${s.sid}`}
                  style={{
                    position: 'absolute',
                    left: '100%',
                    top,
                    marginLeft: 28,
                    width: 208,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {items}
                </div>
              )
            })}
          </section>
        ))}

        <div
          style={{
            marginTop: 56,
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: theme.faint,
            textAlign: 'center',
          }}
        >
          — end of note —
        </div>

        {/* related reading — flat serif rows, shares the measure */}
        <RelatedReading theme={theme} onOpen={(title) => askPond('Open: ' + title)} />
      </div>

      {/* floating action bar — glass, rises above the clicked sentence */}
      {bar && (
        <ActionBar
          bar={bar}
          on={highlights.has(bar.sid)}
          copied={copied}
          onHighlight={() => toggleHighlight(bar.sid)}
          onAnnotate={() => openAnnotate(bar.sid)}
          onAsk={() => {
            askPond('“' + bar.text + '”')
            closeBar()
          }}
          onCopy={() => setCopied(true)}
        />
      )}
    </div>
  )
}

/* ── floating glass action bar ──────────────────────────────────────────── */
function ActionBar({
  bar,
  on,
  copied,
  onHighlight,
  onAnnotate,
  onAsk,
  onCopy,
}: {
  bar: BarState
  on: boolean
  copied: boolean
  onHighlight: () => void
  onAnnotate: () => void
  onAsk: () => void
  onCopy: () => void
}) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: bar.x,
        top: bar.y,
        transform: `translate(-50%, calc(-100% - 12px)) translateY(${
          reduced || shown ? 0 : 6
        }px)`,
        opacity: reduced || shown ? 1 : 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 4,
        borderRadius: radius.pill,
        ...glass,
        transition: reduced ? 'none' : `opacity 180ms ${EASE}, transform 180ms ${EASE}`,
      }}
    >
      <BarBtn label={on ? 'Unhighlight' : 'Highlight'} onClick={onHighlight} active={on} />
      <Sep />
      <BarBtn label="Annotate" onClick={onAnnotate} />
      <Sep />
      <BarBtn label="Ask Pond" onClick={onAsk} accent />
      <Sep />
      <BarBtn label={copied ? 'Copied' : 'Copy'} onClick={onCopy} />
    </div>
  )
}

function Sep() {
  return <span style={{ width: 1, alignSelf: 'stretch', margin: '4px 0', background: LINE }} />
}

function BarBtn({
  label,
  onClick,
  active,
  accent,
}: {
  label: string
  onClick: () => void
  active?: boolean
  accent?: boolean
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: 'none',
        cursor: 'pointer',
        padding: '7px 12px',
        borderRadius: radius.pill,
        fontFamily: sans,
        fontSize: 12.5,
        fontWeight: active || accent ? 600 : 500,
        color: accent ? INK : active ? INK : BODY,
        background: hover ? 'rgba(33,31,27,0.05)' : 'transparent',
        transition: reduced ? 'none' : `background 160ms ${EASE}`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

/* ── heading outline (left margin, floats on wide viewports) ─────────────── */
function Outline({
  sections,
  activeHid,
  onJump,
  faint,
  ink,
}: {
  sections: typeof READER.sections
  activeHid: string
  onJump: (hid: string) => void
  faint: string
  ink: string
}) {
  return (
    <nav
      aria-label="Outline"
      style={{
        position: 'absolute',
        left: -196,
        top: 96,
        width: 164,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ ...kicker, color: faint, marginBottom: 4 }}>Contents</div>
      {sections.map((s) => {
        const on = s.hid === activeHid
        return (
          <button
            key={s.hid}
            onClick={() => onJump(s.hid)}
            style={{
              border: 'none',
              background: 'transparent',
              textAlign: 'left',
              cursor: 'pointer',
              padding: 0,
              fontFamily: sans,
              fontSize: 13,
              lineHeight: 1.4,
              fontWeight: on ? 600 : 400,
              color: on ? ink : faint,
              transition: reduced ? 'none' : `color 240ms ${EASE}`,
            }}
          >
            {s.heading}
          </button>
        )
      })}
    </nav>
  )
}

/* ── related reading — flat serif footer inside the reading column ───────── */
const RELATED: ReadonlyArray<{ title: string; area: string; minutes: number }> = [
  { title: 'The case for the easy long run', area: 'Health', minutes: 5 },
  { title: 'Tokens before components', area: 'Work', minutes: 6 },
  { title: 'A shelf that floats', area: 'Woodworking', minutes: 4 },
]

function RelatedReading({
  theme,
  onOpen,
}: {
  theme: ReaderTheme
  onOpen: (title: string) => void
}) {
  return (
    <div style={{ marginTop: 72 }}>
      <div style={{ height: 1, background: theme.line, transition: reduced ? 'none' : `background .3s ${EASE}` }} />
      <div style={{ ...kicker, color: theme.faint, margin: '28px 0 6px' }}>Keep reading</div>
      <div>
        {RELATED.map((r) => (
          <RelatedRow key={r.title} {...r} theme={theme} onOpen={() => onOpen(r.title)} />
        ))}
      </div>
    </div>
  )
}

function RelatedRow({
  title,
  area,
  minutes,
  theme,
  onOpen,
}: {
  title: string
  area: string
  minutes: number
  theme: ReaderTheme
  onOpen: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer',
        padding: '16px 0',
        borderBottom: `1px solid ${theme.line}`,
      }}
    >
      <div
        style={{
          fontFamily: serif,
          fontSize: 20,
          lineHeight: 1.35,
          color: hover ? theme.ink : theme.body,
          transition: reduced ? 'none' : `color 200ms ${EASE}`,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: mono,
          fontSize: 11.5,
          letterSpacing: '0.04em',
          color: theme.faint,
          marginTop: 5,
        }}
      >
        {area} · {minutes} min
      </div>
    </div>
  )
}

/* ── a saved annotation shown in the right margin ────────────────────────── */
function MarginNote({
  text,
  theme,
  onEdit,
}: {
  text: string
  theme: ReaderTheme
  onEdit: () => void
}) {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation()
        onEdit()
      }}
      style={{
        display: 'block',
        cursor: 'pointer',
        padding: '8px 12px',
        borderLeft: `2px solid ${RUST}`,
        fontFamily: sans,
        fontSize: 13,
        lineHeight: 1.5,
        color: theme.body,
        background: 'transparent',
      }}
    >
      {text}
    </span>
  )
}

/* ── ambient Pond note (glass, expandable + dismissible) ─────────────────── */
function AmbientMargin({
  text,
  open,
  theme,
  onToggle,
  onDismiss,
}: {
  text: string
  open: boolean
  theme: ReaderTheme
  onToggle: () => void
  onDismiss: () => void
}) {
  const short = text.length > 46 ? text.slice(0, 44).trimEnd() + '…' : text
  return (
    <span onClick={(e) => e.stopPropagation()} style={{ display: 'block' }}>
      <span
        onClick={onToggle}
        style={{
          display: 'block',
          cursor: 'pointer',
          padding: '10px 12px',
          borderRadius: radius.soft,
          ...glass,
          transition: reduced ? 'none' : `all 220ms ${EASE}`,
        }}
      >
        <span style={{ ...kicker, display: 'block', marginBottom: 5 }}>Pond noticed</span>
        <span
          style={{
            display: 'block',
            fontFamily: sans,
            fontSize: 12.5,
            lineHeight: 1.5,
            color: theme.ink,
          }}
        >
          {open ? text : short}
        </span>
        {open && (
          <span style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <span
              onClick={(e) => {
                e.stopPropagation()
                onDismiss()
              }}
              style={{ fontFamily: sans, fontSize: 11.5, color: theme.faint, cursor: 'pointer' }}
            >
              Dismiss
            </span>
          </span>
        )}
      </span>
    </span>
  )
}

/* ── inline editor mini-buttons ──────────────────────────────────────────── */
function MiniBtn({
  label,
  onClick,
  theme,
  accent,
}: {
  label: string
  onClick: () => void
  theme: ReaderTheme
  accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${theme.line}`,
        cursor: 'pointer',
        padding: '4px 12px',
        borderRadius: radius.pill,
        fontFamily: sans,
        fontSize: 12,
        fontWeight: accent ? 600 : 500,
        color: accent ? INK : theme.faint,
        background: 'transparent',
      }}
    >
      {label}
    </button>
  )
}

/* ── quiet settings control + glass panel ────────────────────────────────── */
function SettingsControl({
  open,
  onToggle,
  measure,
  setMeasure,
  face,
  setFace,
  size,
  setSize,
  themeKey,
  setThemeKey,
}: {
  open: boolean
  onToggle: () => void
  measure: Measure
  setMeasure: (v: Measure) => void
  face: Face
  setFace: (v: Face) => void
  size: Size
  setSize: (v: Size) => void
  themeKey: ThemeKey
  setThemeKey: (v: ThemeKey) => void
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onToggle}
        style={{
          border: `1px solid ${LINE}`,
          cursor: 'pointer',
          padding: '7px 14px',
          borderRadius: radius.pill,
          fontFamily: mono,
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: open ? INK : MUTED,
          background: open ? 'rgba(255,254,250,0.7)' : 'rgba(255,254,250,0.4)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          transition: reduced ? 'none' : `all 200ms ${EASE}`,
        }}
      >
        Aa
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: 264,
            padding: 18,
            borderRadius: radius.card,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            ...glass,
          }}
        >
          <Setting label="Width">
            <Segmented<Measure>
              value={measure}
              onChange={setMeasure}
              options={[
                { value: '540', label: 'Narrow' },
                { value: '620', label: 'Medium' },
                { value: '740', label: 'Wide' },
              ]}
            />
          </Setting>
          <Setting label="Typeface">
            <Segmented<Face>
              value={face}
              onChange={setFace}
              options={[
                { value: 'serif', label: 'Serif' },
                { value: 'sans', label: 'Sans' },
              ]}
            />
          </Setting>
          <Setting label="Size">
            <Segmented<Size>
              value={size}
              onChange={setSize}
              options={[
                { value: '18', label: 'S' },
                { value: '20', label: 'M' },
                { value: '22', label: 'L' },
              ]}
            />
          </Setting>
          <Setting label="Theme">
            <Segmented<ThemeKey>
              value={themeKey}
              onChange={setThemeKey}
              options={[
                { value: 'paper', label: 'Paper' },
                { value: 'sepia', label: 'Sepia' },
                { value: 'night', label: 'Night' },
              ]}
            />
          </Setting>
        </div>
      )}
    </div>
  )
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ ...kicker, color: FAINT }}>{label}</span>
      {children}
    </div>
  )
}
