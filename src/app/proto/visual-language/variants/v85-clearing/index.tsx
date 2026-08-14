'use client'

/**
 * v85 CLEARING — the consolidation.
 *
 * The best parts of the last six protos (v79–v84) woven into ONE calm, navigable
 * Folio product, with the Press aesthetic evolved toward zen — elegance, balance,
 * calm. The LOCKED layout holds: left rail · top-right glass cluster · bottom AI
 * bar. Four surfaces share one design language and one shell:
 *   • Today  — a morning digest, one focal number   (from v83 Agenda + v79 Glance)
 *   • Read   — a serene long-form reading surface    (from v81 Reader — the zen star)
 *   • Plan   — a temporal day/week agenda            (from v83 Agenda)
 *   • Focus  — a session where the chrome recedes     (from v84 Player)
 * The ⌘K palette is the one keeper salvaged from v82 Console (light, not dark).
 *
 * Throwaway (src/app/proto/). Harvest the patterns into the real chrome later.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Variant } from '../../types'
import type { SurfaceCtx, SurfaceId } from './shell-types'
import { tree, diffCard, PAGES, DOCS, AREA_TITLE, isModulePage, ACTIVITY } from './data'
import type { ActivityItem, ActivityType } from './data'
import {
  sans,
  serif,
  display,
  mono,
  PAPER,
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
  glass,
  kicker,
  kbd,
  radius,
  KindDot,
  Receipt,
} from './ui'
import Home from './surfaces/home'
import Read from './surfaces/read'
import Plan from './surfaces/plan'
import Focus from './surfaces/focus'
import ReadingList from './pages/reading-list'
import Grocery from './pages/grocery'
import Recipes from './pages/recipes'
import Finance from './pages/finance'
import Workout from './pages/workout'
import ProjectTracker from './pages/project-tracker'
import Shelf from './pages/shelf'
import Sleep from './pages/sleep'

/** Module-pages: an id → its dedicated rich surface. */
const MODULE_SURFACES: Record<string, React.ComponentType<SurfaceCtx>> = {
  'reading-list': ReadingList,
  grocery: Grocery,
  recipes: Recipes,
  finance: Finance,
  workout: Workout,
  projects: ProjectTracker,
  // Areas leaves that now open their own dashboard instead of the shared essay:
  shelf: Shelf,
  sleep: Sleep,
  // Work projects reuse the project-tracker, keyed by the openId set below:
  q3: ProjectTracker,
  ds: ProjectTracker,
  // Portfolio-only projects (reached by drilling into the Project Tracker roll-up):
  mn: ProjectTracker,
  site: ProjectTracker,
}

const LENSES: { id: SurfaceId; label: string; glyph: string }[] = [
  { id: 'home', label: 'Today', glyph: '◒' },
  { id: 'read', label: 'Read', glyph: '¶' },
  { id: 'plan', label: 'Plan', glyph: '▦' },
  { id: 'focus', label: 'Focus', glyph: '◉' },
]

interface Cmd {
  kind: 'Go' | 'Open' | 'Do'
  label: string
  sub?: string
  run: () => void
}

type CaptureKind = 'note' | 'task' | 'expense'
const CAPTURE_KINDS: { value: CaptureKind; label: string }[] = [
  { value: 'note', label: 'Note' },
  { value: 'task', label: 'Task' },
  { value: 'expense', label: 'Expense' },
]

/** subsequence fuzzy filter — the calm salvage from Console. */
function subseq(q: string, s: string) {
  q = q.toLowerCase()
  s = s.toLowerCase()
  let i = 0
  for (const ch of s) if (i < q.length && ch === q[i]) i++
  return i === q.length
}

function View() {
  const [surface, setSurface] = useState<SurfaceId>('home')
  const [openId, setOpenId] = useState('marathon')
  const [moduleId, setModuleId] = useState<string | null>(null)
  const [sessionActive, setSessionActive] = useState(false)

  const [chatOpen, setChatOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [sent, setSent] = useState<string[]>([])
  const chatInput = useRef<HTMLInputElement>(null)

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const paletteInput = useRef<HTMLInputElement>(null)

  const [notifOpen, setNotifOpen] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // capture composer
  const [captureOpen, setCaptureOpen] = useState(false)
  const [captureText, setCaptureText] = useState('')
  const [captureKind, setCaptureKind] = useState<CaptureKind>('note')
  const [captureArea, setCaptureArea] = useState<string>('')
  const captureInput = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (captureOpen) setTimeout(() => captureInput.current?.focus(), 10)
  }, [captureOpen])

  const doc = DOCS[openId] ?? DOCS.marathon

  // Chrome restoration on leaving Focus is owned by the Focus surface's own
  // unmount cleanup (surfaces/focus.tsx) — sessionActive is only ever set while
  // Focus is mounted, so no redundant reset effect is needed here.
  useEffect(() => {
    if (chatOpen) chatInput.current?.focus()
  }, [chatOpen])
  // Reset happens at the open event (not in an effect); the effect only moves
  // focus into the palette once it's on screen.
  const openPalette = () => {
    setQuery('')
    setSel(0)
    setPaletteOpen(true)
  }
  useEffect(() => {
    if (paletteOpen) setTimeout(() => paletteInput.current?.focus(), 10)
  }, [paletteOpen])

  const ctx: SurfaceCtx = useMemo(
    () => ({
      openId,
      goRead: (id) => {
        setOpenId(id)
        setSurface('read')
      },
      openPage: (id) => {
        setOpenId(id)
        if (isModulePage(id)) setModuleId(id)
        else {
          setSurface('read')
          setModuleId(null)
        }
      },
      goFocus: (id) => {
        setOpenId(id)
        setSurface('focus')
      },
      goPlan: () => setSurface('plan'),
      goHome: () => setSurface('home'),
      askPond: (seed) => {
        setChatOpen(true)
        if (seed) setDraft(seed)
      },
      setSessionActive,
    }),
    [openId]
  )

  function send() {
    const t = draft.trim()
    if (!t) return
    setSent((s) => [...s, t])
    setDraft('')
  }
  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2200)
  }
  function confirmCapture() {
    const t = captureText.trim()
    if (!t) return
    const kind = CAPTURE_KINDS.find((k) => k.value === captureKind)?.label ?? 'Note'
    const where = captureArea ? ` → ${AREA_TITLE[captureArea]}` : ''
    setCaptureOpen(false)
    setCaptureText('')
    setCaptureArea('')
    setCaptureKind('note')
    flash(`Captured ${kind}${where} ✓`)
  }
  function goLens(id: SurfaceId) {
    setSurface(id)
    setModuleId(null)
  }
  function openTreePage(id: string) {
    // Setting openId even for module-pages lets a shared module (project-tracker)
    // know WHICH leaf opened it (q3 vs ds).
    setOpenId(id)
    if (isModulePage(id)) setModuleId(id)
    else {
      setSurface('read')
      setModuleId(null)
    }
  }

  // command palette results
  const commands = useMemo<Cmd[]>(() => {
    const nav: Cmd[] = LENSES.map((l) => ({ kind: 'Go', label: l.label, run: () => goLens(l.id) }))
    const pages: Cmd[] = PAGES.map((p) => ({
      kind: 'Open',
      label: p.title,
      sub: AREA_TITLE[p.area],
      run: () => openTreePage(p.id),
    }))
    const acts: Cmd[] = [
      { kind: 'Do', label: 'Start a focus session', run: () => goLens('focus') },
      { kind: 'Do', label: 'Plan my day', run: () => goLens('plan') },
    ]
    return [...acts, ...pages, ...nav]
  }, [])
  const results = useMemo(
    () => (query ? commands.filter((c) => subseq(query, c.label)) : commands),
    [query, commands]
  )

  // global keys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (paletteOpen) setPaletteOpen(false)
        else openPalette()
        return
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false)
        setNotifOpen(false)
        setCaptureOpen(false)
        if (!paletteOpen) setChatOpen(false)
      }
      if (paletteOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSel((s) => Math.min(s + 1, results.length - 1))
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSel((s) => Math.max(s - 1, 0))
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          results[sel]?.run()
          setPaletteOpen(false)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, results, sel])

  const chromeStyle = (hideWhenFocus: boolean): React.CSSProperties => ({
    opacity: sessionActive && hideWhenFocus ? 0 : sessionActive ? 0.4 : 1,
    pointerEvents: sessionActive && hideWhenFocus ? 'none' : 'auto',
    transition: `opacity 700ms ${EASE}`,
  })

  const Surface = { home: Home, read: Read, plan: Plan, focus: Focus }[surface]
  const ActiveModule = moduleId ? MODULE_SURFACES[moduleId] : null

  return (
    <div
      style={{
        position: 'relative',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: PAPER,
        fontFamily: sans,
        color: INK,
      }}
    >
      <style>{`
        @keyframes v85-rise { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes v85-fade { from{opacity:0} to{opacity:1} }
        .v85-rise{ animation:v85-rise 520ms ${EASE} both }
        .v85-fade{ animation:v85-fade 320ms ease both }
        .v85-in::placeholder{ color:${FAINT} } .v85-in:focus{ outline:none }
        .v85-nav:hover{ background:${ACCENT_SOFT} }
        @media (prefers-reduced-motion: reduce){ .v85-rise,.v85-fade{animation:none!important} }
      `}</style>

      {/* one faint, slow sage wash — not the old dual orbs */}
      <div
        style={{
          position: 'fixed',
          bottom: '-24%',
          right: '-10%',
          width: '52%',
          height: '64%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(95,115,85,0.10) 0%, rgba(95,115,85,0) 68%)',
          filter: 'blur(80px)',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex' }}>
        {/* LOCKED: left rail */}
        <aside
          style={{
            width: 250,
            flexShrink: 0,
            height: '100%',
            overflowY: 'auto',
            padding: '24px 16px 32px',
            ...chromeStyle(false),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 8px 22px' }}>
            <span style={{ fontFamily: display, fontSize: 25, color: INK }}>Pond</span>
            <span style={{ ...kicker, color: MUTED }}>clearing</span>
          </div>

          {/* lens switch */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 18 }}>
            {LENSES.map((l) => {
              const on = l.id === surface && !moduleId
              return (
                <button
                  key={l.id}
                  className="v85-nav"
                  onClick={() => goLens(l.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: radius.chip,
                    border: 'none',
                    cursor: 'pointer',
                    background: on ? ACCENT_SOFT : 'transparent',
                    color: on ? INK : MUTED,
                    fontFamily: sans,
                    fontSize: 13.5,
                    fontWeight: on ? 600 : 500,
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      textAlign: 'center',
                      color: on ? ACCENT : FAINT,
                      fontSize: 13,
                    }}
                  >
                    {l.glyph}
                  </span>
                  {l.label}
                  {l.id === 'read' && on && (
                    <span style={{ ...kicker, marginLeft: 'auto', color: FAINT }}>
                      {doc.title.slice(0, 10)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* areas → pages */}
          <div style={{ ...kicker, padding: '0 10px 8px' }}>Areas</div>
          {tree.map((a) => (
            <div key={a.id} style={{ marginBottom: 6 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: INK,
                }}
              >
                <KindDot area={a.id} /> {a.title}
              </div>
              {(a.children ?? []).map((c) => {
                const on = moduleId ? c.id === moduleId : c.id === openId && surface === 'read'
                return (
                  <button
                    key={c.id}
                    className="v85-nav"
                    onClick={() => openTreePage(c.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      marginLeft: 15,
                      padding: '5px 10px',
                      borderRadius: 9,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12.5,
                      color: on ? INK : MUTED,
                      fontWeight: on ? 600 : 400,
                      background: on ? ACCENT_SOFT : 'transparent',
                    }}
                  >
                    {c.title}
                  </button>
                )
              })}
            </div>
          ))}

          <div style={{ marginTop: 20, padding: '0 4px' }}>
            <Receipt
              title="Week receipt"
              rows={[
                ['MILEAGE', '38 MI'],
                ['STREAK', '12 WK', RUST],
                ['SLEEP', '7.1 H'],
              ]}
            />
          </div>
        </aside>

        {/* the active surface renders in main */}
        <main style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>
          {ActiveModule ? <ActiveModule {...ctx} /> : <Surface {...ctx} />}
        </main>
      </div>

      {/* LOCKED: top-right glass cluster */}
      <div
        style={{
          position: 'fixed',
          top: 22,
          right: 26,
          zIndex: 40,
          display: 'flex',
          gap: 10,
          ...chromeStyle(true),
        }}
      >
        <button
          onClick={() => {
            setNotifOpen(true)
          }}
          style={clusterBtn}
        >
          ◔ Notifications
          {!accepted && (
            <span
              style={{ width: 6, height: 6, borderRadius: 999, background: RUST, marginLeft: 2 }}
            />
          )}
        </button>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setCaptureOpen((v) => !v)}
            style={{
              ...clusterBtn,
              background: captureOpen ? ACCENT_SOFT : (clusterBtn.background as string),
              color: captureOpen ? INK : clusterBtn.color,
            }}
          >
            ＋ Capture
          </button>
          {captureOpen && (
            <div
              className="v85-rise"
              style={{
                position: 'absolute',
                top: 'calc(100% + 10px)',
                right: 0,
                width: 320,
                ...glass,
                borderRadius: 20,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '13px 16px',
                  borderBottom: `1px solid ${LINE}`,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 999, background: LIME }} />
                <span style={{ ...kicker, color: ACCENT }}>Capture</span>
                <button
                  onClick={() => setCaptureOpen(false)}
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: MUTED,
                    fontSize: 16,
                  }}
                >
                  ×
                </button>
              </div>
              <div
                style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <textarea
                  ref={captureInput}
                  className="v85-in"
                  value={captureText}
                  onChange={(e) => setCaptureText(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      confirmCapture()
                    }
                  }}
                  placeholder="Capture a thought, task, or expense…"
                  rows={3}
                  style={{
                    width: '100%',
                    resize: 'none',
                    border: `1px solid ${LINE}`,
                    borderRadius: 12,
                    background: CARD,
                    padding: '10px 12px',
                    fontFamily: sans,
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: INK,
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  {CAPTURE_KINDS.map((k) => {
                    const on = k.value === captureKind
                    return (
                      <button
                        key={k.value}
                        onClick={() => setCaptureKind(k.value)}
                        style={{
                          flex: 1,
                          padding: '7px 0',
                          borderRadius: 999,
                          border: `1px solid ${on ? ACCENT : LINE}`,
                          cursor: 'pointer',
                          background: on ? ACCENT_SOFT : 'transparent',
                          color: on ? INK : MUTED,
                          fontFamily: sans,
                          fontSize: 12.5,
                          fontWeight: on ? 600 : 500,
                        }}
                      >
                        {k.label}
                      </button>
                    )
                  })}
                </div>
                <select
                  value={captureArea}
                  onChange={(e) => setCaptureArea(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  style={{
                    width: '100%',
                    border: `1px solid ${LINE}`,
                    borderRadius: 10,
                    background: CARD,
                    padding: '8px 10px',
                    fontFamily: sans,
                    fontSize: 13,
                    color: captureArea ? INK : MUTED,
                    cursor: 'pointer',
                  }}
                >
                  <option value="">No area</option>
                  {Object.entries(AREA_TITLE).map(([id, title]) => (
                    <option key={id} value={id}>
                      {title}
                    </option>
                  ))}
                </select>
                <button
                  onClick={confirmCapture}
                  disabled={!captureText.trim()}
                  style={{
                    width: '100%',
                    padding: '10px 0',
                    borderRadius: 999,
                    border: 'none',
                    cursor: captureText.trim() ? 'pointer' : 'default',
                    background: LIME,
                    color: LIME_INK,
                    fontWeight: 700,
                    fontSize: 13,
                    opacity: captureText.trim() ? 1 : 0.5,
                  }}
                >
                  Capture
                </button>
              </div>
            </div>
          )}
        </div>
        <button onClick={openPalette} style={clusterBtn}>
          Ask <span style={kbd}>⌘K</span>
        </button>
      </div>

      {/* a soft cushion of paper under the bar — the content fades out beneath it
          rather than being hard-covered (the Things/Arc translucent-backdrop pattern).
          Skipped on Read, whose sepia/night themes own their own background. */}
      {surface !== 'read' && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: 250,
            right: 0,
            bottom: 0,
            height: 120,
            zIndex: 30,
            pointerEvents: 'none',
            background: `linear-gradient(to top, ${PAPER} 22%, rgba(239,234,224,0) 100%)`,
            ...chromeStyle(true),
          }}
        />
      )}

      {/* LOCKED: bottom-center AI bar */}
      <div
        style={{
          position: 'fixed',
          left: 'calc(50% + 125px)',
          bottom: 26,
          transform: 'translateX(-50%)',
          zIndex: 35,
          width: 'min(600px, 58vw)',
          ...chromeStyle(true),
        }}
      >
        {chatOpen ? (
          <div className="v85-rise" style={{ ...glass, borderRadius: 26, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '13px 18px',
                borderBottom: `1px solid ${LINE}`,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: LIME }} />
              <span style={{ ...kicker, color: ACCENT }}>Pond · {doc.title}</span>
              <button
                onClick={() => setChatOpen(false)}
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: MUTED,
                  fontSize: 16,
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                maxHeight: 240,
                overflowY: 'auto',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <span
                  style={{
                    maxWidth: '82%',
                    padding: '10px 14px',
                    borderRadius: 16,
                    fontSize: 14,
                    lineHeight: 1.55,
                    fontFamily: serif,
                    background: CARD,
                    border: `1px solid ${LINE}`,
                    color: INK,
                  }}
                >
                  You logged 38 miles last week, up 12%. Hold mileage steady and sharpen Tuesday’s
                  tempo — goal pace needs the repetition more than more volume.
                </span>
              </div>
              {sent.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <span
                    style={{
                      maxWidth: '82%',
                      padding: '10px 14px',
                      borderRadius: 16,
                      fontSize: 14,
                      background: ACCENT_SOFT,
                      border: `1px solid ${LINE}`,
                      color: INK,
                    }}
                  >
                    {s}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                borderTop: `1px solid ${LINE}`,
              }}
            >
              <input
                ref={chatInput}
                className="v85-in"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder="Talk to Pond…"
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  fontFamily: sans,
                  fontSize: 14,
                  color: INK,
                }}
              />
              <button
                onClick={send}
                style={{
                  padding: '9px 20px',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  background: LIME,
                  color: LIME_INK,
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setChatOpen(true)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '15px 20px',
              cursor: 'pointer',
              ...glass,
              borderRadius: 999,
              fontFamily: sans,
              fontSize: 14,
              color: MUTED,
              textAlign: 'left',
            }}
          >
            <span
              style={{ width: 9, height: 9, borderRadius: 999, background: LIME, flexShrink: 0 }}
            />
            Talk to Pond…
            <span
              style={{
                marginLeft: 'auto',
                padding: '7px 16px',
                borderRadius: 999,
                background: LIME,
                color: LIME_INK,
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              Ask
            </span>
          </button>
        )}
      </div>

      {/* ⌘K palette — the calm Console salvage */}
      {paletteOpen && (
        <div
          className="v85-fade"
          onClick={() => setPaletteOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(33,31,27,0.14)',
            display: 'flex',
            justifyContent: 'center',
            paddingTop: '14vh',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...glass,
              width: 'min(560px, 92vw)',
              height: 'fit-content',
              maxHeight: '64vh',
              borderRadius: 20,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '15px 18px',
                borderBottom: `1px solid ${LINE}`,
              }}
            >
              <span style={{ color: FAINT }}>⌘K</span>
              <input
                ref={paletteInput}
                className="v85-in"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSel(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setPaletteOpen(false)
                    return
                  }
                  e.stopPropagation()
                }}
                placeholder="Go to a page, or ask Pond to do something…"
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  fontFamily: sans,
                  fontSize: 15,
                  color: INK,
                }}
              />
            </div>
            <div style={{ overflowY: 'auto', padding: 8 }}>
              {results.length === 0 && (
                <div style={{ padding: '20px 14px', color: MUTED, fontSize: 13 }}>
                  Nothing matches “{query}”.
                </div>
              )}
              {results.map((r, i) => (
                <button
                  key={r.label}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => {
                    r.run()
                    setPaletteOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    textAlign: 'left',
                    padding: '11px 12px',
                    borderRadius: 12,
                    border: 'none',
                    cursor: 'pointer',
                    background: i === sel ? ACCENT_SOFT : 'transparent',
                  }}
                >
                  <span style={{ ...kicker, width: 42, color: r.kind === 'Do' ? RUST : ACCENT }}>
                    {r.kind}
                  </span>
                  <span style={{ fontSize: 14, color: INK, fontWeight: 500 }}>{r.label}</span>
                  {r.sub && (
                    <span style={{ marginLeft: 'auto', ...kicker, color: FAINT }}>{r.sub}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Notifications drawer — a reverse-chronological timeline of Pond activity */}
      {notifOpen && (
        <div
          className="v85-fade"
          onClick={() => setNotifOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(33,31,27,0.14)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="v85-rise"
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              height: '100%',
              width: 'min(408px, 92vw)',
              ...glass,
              borderRadius: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* header — pinned above the scrolling feed */}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                padding: '26px 24px 16px',
                borderBottom: `1px solid ${LINE}`,
                flexShrink: 0,
              }}
            >
              <span style={{ fontFamily: display, fontSize: 26, color: INK }}>Activity</span>
              <span style={{ ...kicker, color: FAINT }}>{ACTIVITY.length} recent</span>
              <button
                onClick={() => setNotifOpen(false)}
                aria-label="Close"
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: MUTED,
                  fontSize: 18,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* the feed — a left-spine timeline the nodes hang from */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 24px 30px' }}>
              <div style={{ position: 'relative' }}>
                {/* the spine — one continuous rail down the left edge */}
                <div
                  style={{
                    position: 'absolute',
                    left: GUTTER,
                    top: 22,
                    bottom: 10,
                    width: 1,
                    background: LINE,
                  }}
                />
                {DAY_ORDER.map((day) => {
                  const items = ACTIVITY.filter((a) => a.day === day)
                  if (items.length === 0) return null
                  return (
                    <div key={day}>
                      <DayMarker day={day} />
                      {items.map((a) =>
                        a.proposal ? (
                          <ProposalRow
                            key={a.id}
                            item={a}
                            accepted={accepted}
                            onAccept={() => {
                              setAccepted(true)
                              flash('Applied to Marathon Training')
                            }}
                            onLater={() => setNotifOpen(false)}
                          />
                        ) : (
                          <ActivityRow
                            key={a.id}
                            item={a}
                            onOpen={() => {
                              openTreePage(
                                a.area === 'life'
                                  ? 'finance'
                                  : a.area === 'work'
                                    ? 'ds'
                                    : a.area === 'wood'
                                      ? 'shelf'
                                      : a.area === 'reading'
                                        ? 'reading-list'
                                        : 'sleep'
                              )
                              setNotifOpen(false)
                            }}
                          />
                        )
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ ...kicker, color: FAINT, textAlign: 'center', padding: '24px 0 8px' }}>
                You’re all caught up
              </div>
            </div>
          </div>
        </div>
      )}

      {/* capture toast */}
      {toast && (
        <div
          className="v85-fade"
          style={{
            position: 'fixed',
            bottom: 104,
            left: 'calc(50% + 125px)',
            transform: 'translateX(-50%)',
            zIndex: 70,
            ...glass,
            padding: '11px 18px',
            borderRadius: 999,
            fontSize: 13,
            color: INK,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 999, background: LIME }} /> {toast}
        </div>
      )}
    </div>
  )
}

const clusterBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '9px 14px',
  cursor: 'pointer',
  ...glass,
  borderRadius: 999,
  fontFamily: sans,
  fontSize: 13,
  fontWeight: 600,
  color: INK,
}

/* ── Notifications timeline — a left-spine rail the nodes hang from ─────────── */
const DAY_ORDER = ['Today', 'Yesterday', 'Earlier'] as const
const VERB: Record<ActivityType, string> = {
  noticed: 'Noticed',
  changed: 'Changed',
  proposed: 'Proposes',
}

// Geometry: the timestamp sits in a fixed left gutter; the rail runs down its
// right edge and every node is centered on that x. Cards sit to the right.
const GUTTER = 52
const NODE_Y = 15 // node center, from each row's top — aligns with the first line
const NODE_RING = '0 0 0 3px rgba(255,254,250,0.94)' // punches the rail behind a node

/** The frame every timeline entry shares: [ time | ·node· | content ]. */
function SpineRow({
  time,
  node,
  onClick,
  hoverable,
  children,
}: {
  time?: string
  node: React.ReactNode
  onClick?: () => void
  hoverable?: boolean
  children: React.ReactNode
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={hoverable ? () => setHover(true) : undefined}
      onMouseLeave={hoverable ? () => setHover(false) : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        fontFamily: sans,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {/* timestamp — right-aligned so it reads into the rail */}
      <div
        style={{
          width: GUTTER,
          flexShrink: 0,
          textAlign: 'right',
          paddingRight: 15,
          marginTop: NODE_Y - 6,
          fontFamily: mono,
          fontSize: 11,
          color: FAINT,
        }}
      >
        {time}
      </div>
      {/* node — centered on the rail */}
      <div
        style={{
          position: 'absolute',
          left: GUTTER,
          top: NODE_Y,
          transform: 'translate(-50%,-50%)',
          display: 'flex',
        }}
      >
        {node}
      </div>
      {/* content — to the right of the rail */}
      <div style={{ flex: 1, minWidth: 0, paddingLeft: 22, paddingTop: 7, paddingBottom: 15 }}>
        <div
          style={{
            margin: hoverable ? '-6px -8px' : 0,
            padding: hoverable ? '6px 8px' : 0,
            borderRadius: radius.chip,
            background: hover ? ACCENT_SOFT : 'transparent',
            transition: `background 200ms ${EASE}`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/** A day divider, drawn as a hollow node on the spine. */
function DayMarker({ day }: { day: string }) {
  return (
    <div
      style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '18px 0 4px' }}
    >
      <div style={{ width: GUTTER, flexShrink: 0 }} />
      <div
        style={{
          position: 'absolute',
          left: GUTTER,
          top: '50%',
          transform: 'translate(-50%,-50%)',
          width: 9,
          height: 9,
          borderRadius: 999,
          background: CARD,
          border: `1.5px solid ${FAINT}`,
        }}
      />
      <div style={{ ...kicker, color: MUTED, paddingLeft: 22 }}>{day}</div>
    </div>
  )
}

/** A quiet activity node: verb tag + line; opens its area on click. */
function ActivityRow({ item, onOpen }: { item: ActivityItem; onOpen: () => void }) {
  const node = (
    <span style={{ display: 'flex', borderRadius: 999, boxShadow: NODE_RING }}>
      <KindDot area={item.area} />
    </span>
  )
  return (
    <SpineRow time={item.time} node={node} onClick={onOpen} hoverable>
      <span style={{ ...kicker, color: FAINT }}>{VERB[item.type]}</span>
      <span
        style={{ display: 'block', fontSize: 13.5, lineHeight: 1.45, color: INK, marginTop: 4 }}
      >
        {item.line}
      </span>
    </SpineRow>
  )
}

/** The one proposed-edit node — a diff card hanging off the spine. */
function ProposalRow({
  item,
  accepted,
  onAccept,
  onLater,
}: {
  item: ActivityItem
  accepted: boolean
  onAccept: () => void
  onLater: () => void
}) {
  const node = (
    <span
      style={{
        display: 'block',
        width: 9,
        height: 9,
        borderRadius: 999,
        background: ACCENT,
        boxShadow: NODE_RING,
      }}
    />
  )
  return (
    <SpineRow time={item.time} node={node}>
      <div style={{ ...kicker, color: ACCENT }}>{VERB[item.type]} · Marathon Training</div>
      <div
        style={{
          marginTop: 8,
          padding: '13px 15px',
          background: CARD,
          border: `1px solid ${LINE}`,
          borderRadius: radius.soft,
          boxShadow: '0 1px 2px rgba(40,34,24,0.04)',
        }}
      >
        <p style={{ fontFamily: serif, fontSize: 14.5, lineHeight: 1.55, color: BODY, margin: 0 }}>
          {diffCard.after}
        </p>
        <p style={{ fontSize: 12, color: MUTED, margin: '8px 0 0' }}>{diffCard.reason}</p>
        <div style={{ marginTop: 13, paddingTop: 13, borderTop: `1px solid ${HAIR}` }}>
          {accepted ? (
            <span style={{ ...kicker, color: ACCENT }}>✓ Accepted · applied to the page</span>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onAccept}
                style={{
                  padding: '8px 18px',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  background: LIME,
                  color: LIME_INK,
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                Accept
              </button>
              <button
                onClick={onLater}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  border: `1px solid ${LINE}`,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: MUTED,
                  fontSize: 13,
                }}
              >
                Later
              </button>
            </div>
          )}
        </div>
      </div>
    </SpineRow>
  )
}

export const variant: Variant = {
  id: 85,
  name: 'Clearing',
  pov: 'Consolidation of v79–v84 into one calm, navigable Folio product on the LOCKED layout, with the Press aesthetic evolved toward zen — elegance, balance, calm. Four surfaces share one design language: Today (digest, one focal number), Read (serene long-form + select-to-act + ambient notes), Plan (day/week agenda, drag-to-schedule), Focus (a session where the chrome recedes). ⌘K palette is the one keeper from Console; the dual gradient orbs and numeral-noise were dropped for air.',
  boldness: 85,
  Component: View,
}

export default variant
