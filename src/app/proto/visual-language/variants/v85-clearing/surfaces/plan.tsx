'use client'

/**
 * v85 CLEARING — PLAN surface.
 *
 * A calm temporal agenda. Week ↔ Day toggle; a day timeline of airy hour rows
 * (07:00–20:00) separated by hairlines; an unscheduled tray you drag onto hours;
 * and a quiet "Plan my day" that lays every remaining item down with a gentle
 * staggered enter. One rust accent only: the now-line. Color-coding is done with
 * KindDots, never colored side-borders.
 */

import { useState, useMemo } from 'react'
import type { SurfaceCtx } from '../shell-types'
import {
  sans,
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
  ACCENT_WASH,
  RUST,
  EASE,
  kicker,
  radius,
  Card,
  KindDot,
  Segmented,
} from '../ui'
import {
  TRAY,
  PLAN_HOURS,
  HOURS,
  NOW_HOUR,
  WEEK_DAYS,
  WEEK_PLACED,
  AREA_TITLE,
  NOW,
  TODAY_EYEBROW,
} from '../data'

type View = 'week' | 'day'
type Placed = Record<string, number> // itemId → hour

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`
const byId = Object.fromEntries(TRAY.map((t) => [t.id, t]))

export default function Plan(_ctx: SurfaceCtx) {
  const [view, setView] = useState<View>('day')
  // The day opens lived-in: the morning run + a work block already laid down,
  // leaving a few items in the tray to place (or let "Plan my day" finish).
  const [placed, setPlaced] = useState<Placed>({ p1: 7, p3: 10 })
  const [dragId, setDragId] = useState<string | null>(null)
  const [overHour, setOverHour] = useState<number | null>(null)
  const [planKey, setPlanKey] = useState(0) // re-key to replay the stagger
  const [planned, setPlanned] = useState(false)

  const unscheduled = useMemo(() => TRAY.filter((t) => !(t.id in placed)), [placed])
  const allDone = unscheduled.length === 0
  // hour → itemId (inverse of placed), so a slot knows what sits in it
  const hourItem = useMemo(() => {
    const m: Record<number, string> = {}
    for (const id in placed) m[placed[id]] = id
    return m
  }, [placed])

  const place = (id: string, hour: number) => {
    if (hourItem[hour]) return // one item per hour
    setPlaced((p) => ({ ...p, [id]: hour }))
  }
  const unplace = (id: string) => {
    setPlaced((p) => {
      const n = { ...p }
      delete n[id]
      return n
    })
    setPlanned(false)
  }
  const planMyDay = () => {
    const next: Placed = { ...placed }
    const taken = new Set(Object.values(next))
    for (const t of TRAY) {
      if (t.id in next) continue
      const want = PLAN_HOURS[t.id]
      if (want != null && !taken.has(want)) {
        next[t.id] = want
        taken.add(want)
      }
    }
    setPlaced(next)
    setPlanKey((k) => k + 1)
    setPlanned(true)
    if (view !== 'day') setView('day')
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <style>{`
        @keyframes v85pl-drop {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .v85pl-drop { animation: none !important; }
        }
      `}</style>

      <div
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '30px 26px 156px',
          fontFamily: sans,
        }}
      >
        {/* ── header ─────────────────────────────────────────────── */}
        <header style={{ marginBottom: 26 }}>
          <div style={{ ...kicker, marginBottom: 10 }}>
            {view === 'week' ? NOW.weekLabel : TODAY_EYEBROW}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 18,
              flexWrap: 'wrap',
            }}
          >
            <h1
              style={{
                fontFamily: display,
                fontSize: 40,
                fontWeight: 400,
                lineHeight: 1,
                color: INK,
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              {view === 'week' ? 'This week' : 'Today'}
            </h1>
            <Segmented<View>
              value={view}
              onChange={setView}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
              ]}
            />
          </div>
        </header>

        {view === 'day' && <DayGlance placed={placed} />}

        {view === 'week' ? (
          <WeekGrid onPick={() => setView('day')} />
        ) : (
          <DayView
            hourItem={hourItem}
            placed={placed}
            overHour={overHour}
            dragId={dragId}
            planKey={planKey}
            unscheduled={unscheduled}
            allDone={allDone}
            planned={planned}
            onDragStart={setDragId}
            onDragEnd={() => {
              setDragId(null)
              setOverHour(null)
            }}
            onOver={setOverHour}
            onDrop={(hour) => {
              if (dragId) place(dragId, hour)
              setDragId(null)
              setOverHour(null)
            }}
            onUnplace={unplace}
            onPlanDay={planMyDay}
          />
        )}
      </div>
    </div>
  )
}

/* ── DAY GLANCE — a calm stat strip above the timeline ────────────── */

const fmtMins = (m: number) => {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h ? `${h}h${mm ? ` ${mm}m` : ''}` : `${mm}m`
}

function DayGlance({ placed }: { placed: Placed }) {
  const ids = Object.keys(placed)
  const plannedMins = ids.reduce((sum, id) => sum + (byId[id]?.mins ?? 0), 0)
  const hoursPlaced = Object.values(placed)
  const first = hoursPlaced.length ? Math.min(...hoursPlaced) : null
  const stats: [string, string][] = [
    ['Scheduled', `${ids.length} of ${TRAY.length}`],
    ['Planned', plannedMins ? fmtMins(plannedMins) : '—'],
    ['First block', first != null ? hh(first) : '—'],
    ['Now', hh(NOW_HOUR)],
  ]
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        marginBottom: 26,
        border: `1px solid ${LINE}`,
        borderRadius: radius.soft,
        overflow: 'hidden',
      }}
    >
      {stats.map(([k, v], i) => (
        <div
          key={k}
          style={{
            flex: '1 1 120px',
            padding: '12px 16px',
            borderLeft: i === 0 ? 'none' : `1px solid ${HAIR}`,
            background: CARD,
          }}
        >
          <div style={{ ...kicker, marginBottom: 6 }}>{k}</div>
          <div style={{ fontFamily: mono, fontSize: 15, color: INK, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
        </div>
      ))}
    </div>
  )
}

/* ── WEEK ─────────────────────────────────────────────────────────── */

function WeekGrid({ onPick }: { onPick: (day: string) => void }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 1,
        background: HAIR,
        border: `1px solid ${LINE}`,
        borderRadius: radius.soft,
        overflow: 'hidden',
      }}
    >
      {WEEK_DAYS.map((day) => {
        const items = WEEK_PLACED[day] ?? []
        return (
          <button
            key={day}
            onClick={() => onPick(day)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minHeight: 168,
              padding: '12px 10px',
              background: CARD,
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: sans,
              transition: `background 200ms ${EASE}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT_WASH)}
            onMouseLeave={(e) => (e.currentTarget.style.background = CARD)}
          >
            <span
              style={{
                fontFamily: mono,
                fontSize: 10.5,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: MUTED,
              }}
            >
              {day}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((it, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    fontSize: 12,
                    color: BODY,
                    lineHeight: 1.25,
                  }}
                >
                  <KindDot area={it.area} size={6} />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {it.label}
                  </span>
                </div>
              ))}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* ── DAY ──────────────────────────────────────────────────────────── */

interface DayProps {
  hourItem: Record<number, string>
  placed: Placed
  overHour: number | null
  dragId: string | null
  planKey: number
  unscheduled: typeof TRAY
  allDone: boolean
  planned: boolean
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onOver: (hour: number | null) => void
  onDrop: (hour: number) => void
  onUnplace: (id: string) => void
  onPlanDay: () => void
}

function DayView(p: DayProps) {
  return (
    <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
      {/* the tray — unscheduled items, draggable */}
      <aside style={{ width: 208, flexShrink: 0, position: 'sticky', top: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <span style={kicker}>Unscheduled</span>
          <span
            style={{
              fontFamily: display,
              fontSize: 18,
              color: p.allDone ? ACCENT : INK,
              lineHeight: 1,
            }}
          >
            {p.unscheduled.length}
          </span>
        </div>

        {p.allDone ? (
          <Card style={{ padding: '16px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: ACCENT, fontWeight: 500 }}>
              All scheduled&nbsp;✓
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>
              The day is laid down. Nothing left to place.
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {p.unscheduled.map((it) => (
              <div
                key={it.id}
                draggable
                onDragStart={() => p.onDragStart(it.id)}
                onDragEnd={p.onDragEnd}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '11px 12px',
                  background: CARD,
                  border: `1px solid ${LINE}`,
                  borderRadius: radius.chip,
                  cursor: 'grab',
                  opacity: p.dragId === it.id ? 0.4 : 1,
                  transition: `opacity 160ms ${EASE}`,
                }}
              >
                <KindDot area={it.area} size={7} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: INK,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {it.label}
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: FAINT, marginTop: 2 }}>
                    {it.mins}m · {AREA_TITLE[it.area]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={p.onPlanDay}
          disabled={p.allDone}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '9px 12px',
            borderRadius: radius.pill,
            border: `1px solid ${LINE}`,
            background: 'transparent',
            cursor: p.allDone ? 'default' : 'pointer',
            fontFamily: sans,
            fontSize: 12.5,
            fontWeight: 500,
            color: p.allDone ? FAINT : BODY,
            transition: `all 200ms ${EASE}`,
          }}
          onMouseEnter={(e) => {
            if (!p.allDone) e.currentTarget.style.background = ACCENT_SOFT
          }}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {p.planned ? 'Re-plan my day' : 'Plan my day'}
        </button>

        <p style={{ fontSize: 11, color: FAINT, lineHeight: 1.5, marginTop: 12 }}>
          Drag an item onto an hour, or let Pond lay the day down for you.
        </p>
      </aside>

      {/* the timeline — airy hour rows */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {HOURS.map((hour, i) => {
          const isNow = hour === NOW_HOUR
          const over = p.overHour === hour
          const itemId = p.hourItem[hour]
          const item = itemId ? byId[itemId] : undefined
          // stagger index among placed-by-plan items, for the drop animation
          const staggerIdx = item
            ? Object.keys(PLAN_HOURS).indexOf(item.id)
            : 0
          return (
            <div
              key={hour}
              style={{
                display: 'flex',
                alignItems: 'stretch',
                gap: 14,
                borderTop: i === 0 ? 'none' : `1px solid ${HAIR}`,
                position: 'relative',
                minHeight: 56,
              }}
            >
              {/* now-line — the ONE rust accent */}
              {isNow && (
                <div
                  style={{
                    position: 'absolute',
                    left: 62,
                    right: 0,
                    top: -1,
                    height: 2,
                    background: RUST,
                    borderRadius: 2,
                    zIndex: 2,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: -50,
                      top: -6,
                      fontFamily: mono,
                      fontSize: 9.5,
                      letterSpacing: '0.1em',
                      color: RUST,
                    }}
                  >
                    now
                  </span>
                </div>
              )}

              {/* time label */}
              <div
                style={{
                  width: 62,
                  flexShrink: 0,
                  paddingTop: 10,
                  fontFamily: mono,
                  fontSize: 11.5,
                  color: isNow ? BODY : FAINT,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {hh(hour)}
              </div>

              {/* the slot */}
              <div
                onDragOver={(e) => {
                  if (p.dragId && !item) {
                    e.preventDefault()
                    if (p.overHour !== hour) p.onOver(hour)
                  }
                }}
                onDragLeave={() => {
                  if (p.overHour === hour) p.onOver(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (!item) p.onDrop(hour)
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '8px 0',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {item ? (
                  <div
                    key={`${itemId}-${p.planKey}`}
                    className="v85pl-drop"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '10px 14px',
                      background: CARD,
                      border: `1px solid ${LINE}`,
                      borderRadius: radius.soft,
                      animation: p.planned
                        ? `v85pl-drop 440ms ${EASE} ${staggerIdx * 60}ms both`
                        : `v85pl-drop 280ms ${EASE} both`,
                    }}
                  >
                    <KindDot area={item.area} size={8} />
                    <span style={{ fontSize: 13, color: INK, flex: 1, minWidth: 0 }}>
                      {item.label}
                    </span>
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 10.5,
                        color: FAINT,
                        marginRight: 4,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {item.mins}m
                    </span>
                    <button
                      onClick={() => p.onUnplace(item.id)}
                      aria-label={`Unschedule ${item.label}`}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: FAINT,
                        fontSize: 15,
                        lineHeight: 1,
                        padding: '2px 4px',
                        borderRadius: 6,
                        transition: `color 160ms ${EASE}`,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = MUTED)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = FAINT)}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: 34,
                      borderRadius: radius.soft,
                      border: over ? `1px dashed ${ACCENT}` : '1px dashed transparent',
                      background: over ? ACCENT_SOFT : 'transparent',
                      transition: `background 160ms ${EASE}, border-color 160ms ${EASE}`,
                    }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
