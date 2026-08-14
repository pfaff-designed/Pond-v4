'use client'

/**
 * v85 CLEARING — the "Tasks" page (filtered task views for area "professional").
 *
 * One focal element: an oversized Instrument-Serif numeral = OPEN task count, which
 * decrements live as tasks are checked. Everything else recedes into air, hairlines,
 * and mono. A calm Segmented filter (Today / This week / All) narrows the visible
 * list. Tasks group by project, each carrying a muted KindDot for its area. Checking
 * a row recesses it into the "quietly done" DONE tint (never a lime glow), and the
 * project summary bars — thin sage hairline bars, the finance pattern — shrink with
 * it. LIME appears exactly once (Add task). RUST is one small overdue dot.
 */

import { useMemo, useState } from 'react'
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
  RUST,
  LIME,
  LIME_INK,
  DONE,
  DONE_INK,
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
  return <div style={{ ...kicker, marginBottom: 12 }}>{children}</div>
}

// ── seed data (deterministic only — no Math.random / no new Date) ─────────────
type Area = 'health' | 'work' | 'life' | 'wood' | 'reading'
type Filter = 'today' | 'week' | 'all'

interface Project {
  key: string
  label: string
  area: Area
}

// KindDot keys map to AREA_ACCENT: professional→work, health→health,
// creativity→wood, personal→life.
const PROJECTS: Project[] = [
  { key: 'ds', label: 'Design System', area: 'work' },
  { key: 'q3', label: 'Q3 Planning', area: 'work' },
  { key: 'marathon', label: 'Marathon prep', area: 'health' },
  { key: 'shelf', label: 'Walnut Shelf', area: 'wood' },
  { key: 'house', label: 'House admin', area: 'life' },
]

const PROJECT: Record<string, Project> = PROJECTS.reduce(
  (m, p) => ((m[p.key] = p), m),
  {} as Record<string, Project>
)

interface Seed {
  title: string
  project: string
  due: string
  scope: Filter // the tightest bucket this task belongs to
  done: boolean
  overdue?: boolean
}

// scope: 'today' also shows in week+all; 'week' shows in week+all; 'all' only in all.
const SEED: Seed[] = [
  {
    title: 'Finalize color-token contrast pass',
    project: 'ds',
    due: 'Today',
    scope: 'today',
    done: false,
  },
  {
    title: 'Ship Segmented + Ring to registry',
    project: 'ds',
    due: 'Today',
    scope: 'today',
    done: false,
  },
  { title: 'Write motion guidelines doc', project: 'ds', due: 'Thu', scope: 'week', done: false },
  {
    title: 'Audit spacing scale',
    project: 'ds',
    due: 'Aug 06',
    scope: 'week',
    done: true,
    overdue: true,
  },

  {
    title: 'Draft Q3 objectives one-pager',
    project: 'q3',
    due: 'Today',
    scope: 'today',
    done: false,
  },
  { title: 'Book planning offsite room', project: 'q3', due: 'Tue', scope: 'week', done: false },
  {
    title: 'Collect team capacity estimates',
    project: 'q3',
    due: 'Aug 18',
    scope: 'week',
    done: false,
  },
  {
    title: 'Review last-quarter retro notes',
    project: 'q3',
    due: 'Aug 22',
    scope: 'all',
    done: true,
  },

  { title: 'Long run — 14 miles', project: 'marathon', due: 'Today', scope: 'today', done: false },
  {
    title: 'Order race-day nutrition',
    project: 'marathon',
    due: 'Wed',
    scope: 'week',
    done: false,
  },
  {
    title: 'Schedule gait analysis',
    project: 'marathon',
    due: 'Aug 25',
    scope: 'all',
    done: false,
  },

  { title: 'Cut walnut shelf to length', project: 'shelf', due: 'Sat', scope: 'week', done: false },
  { title: 'Sand & oil the boards', project: 'shelf', due: 'Aug 24', scope: 'all', done: false },
  {
    title: 'Buy floating-shelf brackets',
    project: 'shelf',
    due: 'Aug 09',
    scope: 'week',
    done: true,
  },

  {
    title: 'Renew home insurance',
    project: 'house',
    due: 'Aug 03',
    scope: 'week',
    done: false,
    overdue: true,
  },
  { title: 'Schedule furnace service', project: 'house', due: 'Mon', scope: 'week', done: false },
  { title: 'File Q2 receipts', project: 'house', due: 'Aug 20', scope: 'all', done: true },
]

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All' },
]

// which scopes a given filter reveals
const IN_FILTER: Record<Filter, Set<Filter>> = {
  today: new Set<Filter>(['today']),
  week: new Set<Filter>(['today', 'week']),
  all: new Set<Filter>(['today', 'week', 'all']),
}

export default function Tasks(ctx: SurfaceCtx) {
  const { askPond } = ctx

  // live done-state keyed by stable index
  const [done, setDone] = useState<boolean[]>(() => SEED.map((t) => t.done))
  const [filter, setFilter] = useState<Filter>('today')

  const toggle = (i: number) =>
    setDone((prev) => {
      const next = prev.slice()
      next[i] = !next[i]
      return next
    })

  // focal count: open tasks across ALL scopes (the whole professional life)
  const openCount = done.reduce((n, d) => n + (d ? 0 : 1), 0)
  const dueToday = SEED.reduce((n, t, i) => n + (t.scope === 'today' && !done[i] ? 1 : 0), 0)

  // per-project open counts (drive the summary bars) — recomputed live
  const perProject = useMemo(() => {
    const open: Record<string, number> = {}
    const overdue: Record<string, boolean> = {}
    for (const p of PROJECTS) {
      open[p.key] = 0
      overdue[p.key] = false
    }
    SEED.forEach((t, i) => {
      if (!done[i]) {
        open[t.project] += 1
        if (t.overdue) overdue[t.project] = true
      }
    })
    const maxOpen = Math.max(1, ...PROJECTS.map((p) => open[p.key]))
    return { open, overdue, maxOpen }
  }, [done])

  // visible rows, grouped by project, respecting the filter
  const groups = useMemo(() => {
    const allowed = IN_FILTER[filter]
    return PROJECTS.map((p) => {
      const rows = SEED.map((t, i) => ({ t, i }))
        .filter(({ t }) => t.project === p.key && allowed.has(t.scope))
        // done rows sink to the bottom of each group
        .sort((a, b) => Number(done[a.i]) - Number(done[b.i]))
      return { project: p, rows }
    }).filter((g) => g.rows.length > 0)
  }, [filter, done])

  let ri = 0

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'transparent' }}>
      <style>{`
        @keyframes clearing-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes clearing-bar {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
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
        {/* ── Header: kicker · Segmented filter ─────────────────────────────── */}
        <Rise
          i={ri++}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ ...kicker, fontSize: 11, color: FAINT }}>Tasks · Professional</div>
          <Segmented<Filter> value={filter} onChange={setFilter} options={FILTER_OPTIONS} />
        </Rise>

        {/* ── Focal open-count numeral + serif caption ──────────────────────── */}
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
            {openCount}
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
            still open across your work.
          </span>
        </Rise>

        <Rise i={ri++}>
          <div style={{ fontFamily: mono, fontSize: 11.5, color: MUTED, letterSpacing: '0.02em' }}>
            open · <span style={{ color: ACCENT }}>{dueToday} due today</span>
          </div>
        </Rise>

        {/* ── Grouped task list ─────────────────────────────────────────────── */}
        {groups.map((g) => (
          <div key={g.project.key} style={{ marginTop: 44 }}>
            <Rise i={ri++} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KindDot area={g.project.area} />
              <GroupLabel>{g.project.label}</GroupLabel>
            </Rise>
            <Rise i={ri++}>
              <Card style={{ padding: '4px 20px' }}>
                {g.rows.map(({ t, i }, idx) => (
                  <TaskRow
                    key={t.title}
                    title={t.title}
                    area={g.project.area}
                    projectLabel={g.project.label}
                    due={t.due}
                    overdue={!!t.overdue && !done[i]}
                    done={done[i]}
                    first={idx === 0}
                    onToggle={() => toggle(i)}
                  />
                ))}
              </Card>
            </Rise>
          </div>
        ))}

        {/* ── By project: thin hairline bars, sage fill (finance pattern) ───── */}
        <div style={{ marginTop: 48 }}>
          <Rise i={ri++}>
            <GroupLabel>By project</GroupLabel>
          </Rise>
          <Rise i={ri++}>
            <Card style={{ padding: '8px 20px' }}>
              {PROJECTS.map((p, idx) => {
                const open = perProject.open[p.key]
                const over = perProject.overdue[p.key]
                const frac = open / perProject.maxOpen
                return (
                  <div
                    key={p.key}
                    style={{
                      padding: '14px 0',
                      borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        marginBottom: 9,
                      }}
                    >
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 14,
                          fontWeight: 500,
                          color: INK,
                        }}
                      >
                        <KindDot area={p.area} />
                        {p.label}
                        {over && (
                          <span
                            aria-hidden
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: 999,
                              background: RUST,
                              display: 'inline-block',
                            }}
                          />
                        )}
                      </span>
                      <span
                        style={{
                          fontFamily: mono,
                          fontSize: 12,
                          color: open === 0 ? FAINT : MUTED,
                        }}
                      >
                        {open} open
                      </span>
                    </div>
                    <div
                      style={{
                        position: 'relative',
                        height: 4,
                        borderRadius: 999,
                        background: HAIR,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: 999,
                          background: over ? RUST : ACCENT,
                          transformOrigin: 'left',
                          // scaleX (not width) so the live shrink on check is GPU-composited,
                          // matching finance.tsx's "never animate width" bar pattern.
                          transform: `scaleX(${frac})`,
                          transition: `transform 480ms ${EASE}`,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </Card>
          </Rise>
        </div>

        {/* ── The single LIME primary action ────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 40, maxWidth: 340 }}>
          <AddTaskButton onClick={() => askPond('Add a task…')} />
        </Rise>

        {/* ── Closing serif exhale ──────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 20 }}>
            <span style={{ fontFamily: serif, fontSize: 14, fontStyle: 'italic', color: FAINT }}>
              A short list is a kind of rest. Clear one, then close the lid.
            </span>
          </div>
        </Rise>
      </div>
    </div>
  )
}

/** A single calm task row: check-circle · title · project tag · mono due. */
function TaskRow({
  title,
  area,
  projectLabel,
  due,
  overdue,
  done,
  first,
  onToggle,
}: {
  title: string
  area: Area
  projectLabel: string
  due: string
  overdue: boolean
  done: boolean
  first: boolean
  onToggle: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        padding: '13px 0',
        borderTop: first ? 'none' : `1px solid ${HAIR}`,
      }}
    >
      <CheckCircle done={done} onToggle={onToggle} />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          color: done ? MUTED : INK,
          textDecoration: done ? 'line-through' : 'none',
          transition: `color 220ms ${EASE}`,
        }}
      >
        {title}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <KindDot area={area} size={6} />
        <span style={{ fontFamily: sans, fontSize: 11.5, color: FAINT }}>{projectLabel}</span>
      </span>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: 62,
          justifyContent: 'flex-end',
          flexShrink: 0,
        }}
      >
        {overdue && (
          <span
            aria-hidden
            style={{
              width: 5,
              height: 5,
              borderRadius: 999,
              background: RUST,
              display: 'inline-block',
            }}
          />
        )}
        <span
          style={{ fontFamily: mono, fontSize: 11.5, color: done ? FAINT : overdue ? RUST : MUTED }}
        >
          {due}
        </span>
      </span>
    </div>
  )
}

/**
 * Round check-circle. Unchecked = hairline ring. Checked = the "quietly done"
 * DONE tint with a DONE_INK tick — recessed, NOT a lime glow (lime is reserved
 * for the one primary action).
 */
function CheckCircle({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={done}
      style={{
        appearance: 'none',
        cursor: 'pointer',
        flexShrink: 0,
        width: 20,
        height: 20,
        borderRadius: 999,
        border: done ? 'none' : `1.5px solid ${LINE}`,
        background: done ? DONE : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        transition: `background 200ms ${EASE}, border-color 200ms ${EASE}`,
      }}
    >
      {done && (
        <svg width={11} height={11} viewBox="0 0 11 11" fill="none" aria-hidden>
          <path
            d="M2 5.6L4.3 8L9 2.6"
            stroke={DONE_INK}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}

/** The one LIME primary action on the page. */
function AddTaskButton({ onClick }: { onClick: () => void }) {
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
      + Add task
    </button>
  )
}
