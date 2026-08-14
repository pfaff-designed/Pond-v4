'use client'

/**
 * v85 CLEARING — the "Project Tracker" page.
 *
 * One focal element: a large sage <Ring> = the active project's % complete,
 * flanked by three quiet mono stats. Everything else recedes into air, hairlines,
 * and a few soft-shadow module cards. Sage ACCENT is the ambient tint (progress
 * bars, KindDots, status accents), LIME appears exactly once (Add task), RUST is a
 * single punctuation mark (the one at-risk milestone dot + the sprint "due" line).
 * Slow staggered rise on mount, disabled under prefers-reduced-motion.
 */

import { useEffect, useState } from 'react'
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
  EASE,
  radius,
  kicker,
  cardShadow,
  Card,
  KindDot,
  Ring,
  Receipt,
  Segmented,
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

type ProjectId = 'ds' | 'q3' | 'mn' | 'site'

interface Milestone {
  title: string
  done: number
  total: number
  status: 'on track' | 'at risk'
}

interface Task {
  title: string
  area: string
  meta: string
}

type Column = 'todo' | 'doing' | 'done'
interface BoardTask extends Task {
  id: string
  col: Column
}

interface Activity {
  when: string
  what: string
}

interface Project {
  name: string
  tag: string
  due: string
  done: number
  total: number
  area: string
  status: 'on track' | 'at risk'
  nextMilestone: string
  milestones: Milestone[]
  board: BoardTask[]
  activity: Activity[]
  sprint: { tasks: number; done: number; inflight: number; due: string }
}

const PROJECTS: Record<ProjectId, Project> = {
  ds: {
    name: 'Design System',
    tag: 'Design system',
    due: 'Sep 15',
    done: 34,
    total: 52,
    area: 'work',
    status: 'at risk',
    nextMilestone: 'Storybook coverage',
    milestones: [
      { title: 'Token layer — colour + type', done: 8, total: 8, status: 'on track' },
      { title: 'shadcn wrappers (atoms)', done: 11, total: 14, status: 'on track' },
      { title: 'Storybook coverage', done: 9, total: 20, status: 'at risk' },
      { title: 'Brand-init CLI', done: 4, total: 9, status: 'on track' },
      { title: 'Docs + usage guidelines', done: 2, total: 12, status: 'on track' },
    ],
    board: [
      { id: 'mn1', col: 'todo', title: 'Audit spacing scale vs. Press', area: 'work', meta: 'S · design' },
      { id: 'mn2', col: 'todo', title: 'Write Button usage guidelines', area: 'reading', meta: 'M · docs' },
      { id: 'mn3', col: 'todo', title: 'Draft brand-brain prompt v2', area: 'wood', meta: 'M · cli' },
      { id: 'mn4', col: 'doing', title: 'Storybook stories for Card', area: 'work', meta: 'M · in review' },
      { id: 'mn5', col: 'doing', title: 'Wire tokens into Tailwind v4', area: 'health', meta: 'L · tokens' },
      { id: 'mn6', col: 'done', title: 'Colour contrast audit', area: 'work', meta: 'passed 16/20' },
      { id: 'mn7', col: 'done', title: 'Instrument-Serif numerals', area: 'reading', meta: 'shipped' },
      { id: 'mn8', col: 'done', title: 'Sage / lime / rust palette lock', area: 'wood', meta: 'v78 Press' },
    ],
    activity: [
      { when: 'Aug 12', what: 'Shipped token audit — 16/20 contrast pass' },
      { when: 'Aug 11', what: 'Locked palette: sage · lime · rust' },
      { when: 'Aug 09', what: 'Card stories merged into Storybook' },
      { when: 'Aug 07', what: 'Brand-init CLI scaffolded' },
      { when: 'Aug 04', what: 'Cut Relationships from the taxonomy' },
    ],
    sprint: { tasks: 12, done: 7, inflight: 3, due: 'Fri' },
  },
  q3: {
    name: 'Q3 Planning',
    tag: 'Planning',
    due: 'Aug 30',
    done: 9,
    total: 24,
    area: 'work',
    status: 'at risk',
    nextMilestone: 'Marketing site copy',
    milestones: [
      { title: 'Roadmap outline', done: 4, total: 4, status: 'on track' },
      { title: 'Scope the design-system launch', done: 3, total: 6, status: 'on track' },
      { title: 'Marketing site copy', done: 1, total: 7, status: 'at risk' },
      { title: 'Pricing + packaging notes', done: 1, total: 7, status: 'on track' },
    ],
    board: [
      { id: 'q1', col: 'todo', title: 'Draft launch narrative', area: 'reading', meta: 'M · copy' },
      { id: 'q2', col: 'todo', title: 'Sketch pricing tiers', area: 'work', meta: 'S · notes' },
      { id: 'q3', col: 'todo', title: 'List Q3 dependencies', area: 'wood', meta: 'S · plan' },
      { id: 'q4', col: 'doing', title: 'Roadmap review with self', area: 'health', meta: 'M · today' },
      { id: 'q5', col: 'doing', title: 'Estimate DS launch effort', area: 'work', meta: 'M · sizing' },
      { id: 'q6', col: 'done', title: 'Define Q3 north-star', area: 'reading', meta: 'shipped' },
      { id: 'q7', col: 'done', title: 'Archive Q2 retro', area: 'wood', meta: 'filed' },
    ],
    activity: [
      { when: 'Aug 13', what: 'Blocked out roadmap outline' },
      { when: 'Aug 10', what: 'Defined the Q3 north-star' },
      { when: 'Aug 08', what: 'Pulled Q2 retro learnings forward' },
      { when: 'Aug 05', what: 'Opened the Q3 planning doc' },
    ],
    sprint: { tasks: 8, done: 3, inflight: 2, due: 'Mon' },
  },
  mn: {
    name: 'Make-Noise',
    tag: 'Product',
    due: 'Oct 01',
    done: 18,
    total: 40,
    area: 'work',
    status: 'on track',
    nextMilestone: 'Component library in Storybook',
    milestones: [
      { title: 'Foundation methodology doc', done: 5, total: 5, status: 'on track' },
      { title: 'Next.js + Vercel AI SDK shell', done: 6, total: 8, status: 'on track' },
      { title: 'Supabase data layer (TDD)', done: 4, total: 10, status: 'on track' },
      { title: 'Component library in Storybook', done: 3, total: 12, status: 'on track' },
      { title: 'QA agent + Chrome extension loop', done: 0, total: 5, status: 'on track' },
    ],
    board: [
      { id: 'x1', col: 'todo', title: 'Rewrite make-noise-agent.md', area: 'reading', meta: 'M · docs' },
      { id: 'x2', col: 'todo', title: 'Enrich voice rules', area: 'work', meta: 'S · voice' },
      { id: 'x3', col: 'doing', title: 'Wire tokens from brand-brain', area: 'work', meta: 'M · tokens' },
      { id: 'x4', col: 'doing', title: 'Supabase RLS policies', area: 'health', meta: 'L · data' },
      { id: 'x5', col: 'done', title: 'Foundation methodology locked', area: 'wood', meta: 'authoritative' },
      { id: 'x6', col: 'done', title: 'Stack decision: Next + AI SDK', area: 'work', meta: 'shipped' },
    ],
    activity: [
      { when: 'Aug 13', what: 'Chose QA-agent + Storybook visual loop' },
      { when: 'Aug 11', what: 'Locked the foundation methodology' },
      { when: 'Aug 08', what: 'Scaffolded the Next.js reference app' },
      { when: 'Aug 05', what: 'Committed to Supabase + TDD data layer' },
    ],
    sprint: { tasks: 10, done: 4, inflight: 2, due: 'Wed' },
  },
  site: {
    name: 'Portfolio Site',
    tag: 'Personal',
    due: 'Sep 05',
    done: 21,
    total: 30,
    area: 'reading',
    status: 'on track',
    nextMilestone: 'Case-study writing',
    milestones: [
      { title: 'Agentic-canvas shell', done: 9, total: 9, status: 'on track' },
      { title: 'CMS-MCP editing pipeline', done: 6, total: 8, status: 'on track' },
      { title: 'Case-study writing', done: 4, total: 9, status: 'on track' },
      { title: 'Deploy + polish pass', done: 2, total: 4, status: 'on track' },
    ],
    board: [
      { id: 's1', col: 'todo', title: 'Write the Pond case study', area: 'reading', meta: 'L · copy' },
      { id: 's2', col: 'todo', title: 'Record focus/fork demo clip', area: 'life', meta: 'M · media' },
      { id: 's3', col: 'doing', title: 'Wire lead-mode brief generator', area: 'work', meta: 'M · ai' },
      { id: 's4', col: 'done', title: 'Focus/fork block interaction', area: 'work', meta: 'shipped' },
      { id: 's5', col: 'done', title: 'MCP deploy tool wired', area: 'wood', meta: 'live' },
    ],
    activity: [
      { when: 'Aug 12', what: 'Wired the lead-mode brief generator' },
      { when: 'Aug 09', what: 'Shipped the focus/fork block' },
      { when: 'Aug 06', what: 'Connected CMS-MCP deploy tool' },
    ],
    sprint: { tasks: 7, done: 5, inflight: 1, due: 'Thu' },
  },
}

/** Portfolio display order — the all-projects roll-up. */
const PORTFOLIO_ORDER: ProjectId[] = ['ds', 'q3', 'mn', 'site']

/** A tree-leaf project id maps 1:1 to a detail; anything else falls back. */
function projectFromOpenId(id: string): ProjectId {
  return (['ds', 'q3', 'mn', 'site'] as const).includes(id as ProjectId)
    ? (id as ProjectId)
    : 'ds'
}

const COLUMNS: { key: Column; label: string }[] = [
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'In progress' },
  { key: 'done', label: 'Done' },
]

// ── thin sage progress bar — alive via transform:scaleX, never width ─────────────
function Progress({ pct }: { pct: number }) {
  const v = Math.max(0, Math.min(1, pct))
  return (
    <div style={{ height: 4, borderRadius: radius.pill, background: ACCENT_SOFT, overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: '100%',
          borderRadius: radius.pill,
          background: ACCENT,
          transform: `scaleX(${v})`,
          transformOrigin: 'left',
          transition: `transform 700ms ${EASE}`,
        }}
      />
    </div>
  )
}

export default function ProjectTracker(ctx: SurfaceCtx) {
  // 'projects' (the Project Tracker leaf) is the all-projects PORTFOLIO roll-up;
  // any specific project id (ds/q3/mn/site) is that project's detail view.
  const isPortfolio = ctx.openId === 'projects'

  // The tree leaf that opened this page selects the shown project. Keep it in
  // sync with the shell's openId so re-clicking a different leaf (Q3 ↔ DS) while
  // this surface is already mounted actually switches the shown project.
  const [projectId, setProjectId] = useState<ProjectId>(() => projectFromOpenId(ctx.openId))
  useEffect(() => {
    if (!isPortfolio) setProjectId(projectFromOpenId(ctx.openId))
  }, [ctx.openId, isPortfolio])

  const [board, setBoard] = useState<Record<ProjectId, BoardTask[]>>({
    ds: PROJECTS.ds.board,
    q3: PROJECTS.q3.board,
    mn: PROJECTS.mn.board,
    site: PROJECTS.site.board,
  })
  const [added, setAdded] = useState(false)

  if (isPortfolio) return <Portfolio ctx={ctx} />

  const project = PROJECTS[projectId]
  const cols = board[projectId]
  const pct = project.done / project.total

  // clicking a task cycles it to the next column
  const cycle = (id: string) => {
    setBoard((prev) => ({
      ...prev,
      [projectId]: prev[projectId].map((t) => {
        if (t.id !== id) return t
        const order: Column[] = ['todo', 'doing', 'done']
        const next = order[(order.indexOf(t.col) + 1) % order.length]
        return { ...t, col: next }
      }),
    }))
  }

  let ri = 0

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
          maxWidth: 860,
          margin: '0 auto',
          padding: '30px 32px 156px',
          fontFamily: sans,
        }}
      >
        {/* ── Header: kicker · project name · project switch ────────────────── */}
        <Rise i={ri++}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <div style={{ ...kicker, fontSize: 11 }}>Projects</div>
              <div style={{ fontFamily: display, fontSize: 40, lineHeight: 1.05, color: INK, marginTop: 8 }}>
                {project.name}
              </div>
              <div style={{ fontFamily: serif, fontSize: 15, color: MUTED, fontStyle: 'italic', marginTop: 4 }}>
                {project.tag} · due {project.due}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
              <button
                onClick={() => ctx.openPage('projects')}
                style={{
                  appearance: 'none',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontFamily: mono,
                  fontSize: 10,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: ACCENT,
                }}
              >
                ← All projects
              </button>
              <Segmented<ProjectId>
                value={projectId}
                onChange={(v) => ctx.openPage(v)}
                options={[
                  { value: 'ds', label: 'Design System' },
                  { value: 'q3', label: 'Q3 Planning' },
                  { value: 'mn', label: 'Make-Noise' },
                  { value: 'site', label: 'Site' },
                ]}
              />
            </div>
          </div>
        </Rise>

        {/* ── Focal: the ONE dominant element — a large sage Ring + mono stats ── */}
        <Rise i={ri++} style={{ marginTop: 44 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
            <Ring
              pct={pct}
              size={168}
              stroke={10}
              label={`${Math.round(pct * 100)}%`}
              sub="complete"
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '0 40px' }}>
              {(
                [
                  ['tasks', `${project.done} / ${project.total}`],
                  ['milestones', String(project.milestones.length)],
                  ['due', project.due],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontFamily: display, fontSize: 34, color: INK, lineHeight: 1 }}>{v}</div>
                  <div style={{ ...kicker, marginTop: 8 }}>{k}</div>
                </div>
              ))}
            </div>
          </div>
        </Rise>

        {/* ── Milestones ───────────────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 56 }}>
          <div style={{ ...kicker, marginBottom: 18 }}>Milestones</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {project.milestones.map((m) => {
              const risk = m.status === 'at risk'
              return (
                <div key={m.title}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 2,
                        flexShrink: 0,
                        alignSelf: 'center',
                        background: risk ? RUST : ACCENT,
                      }}
                    />
                    <span style={{ fontFamily: serif, fontSize: 18, color: INK }}>{m.title}</span>
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 10.5,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: risk ? RUST : MUTED,
                        marginLeft: 'auto',
                      }}
                    >
                      {m.status}
                    </span>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Progress pct={m.done / m.total} />
                  </div>
                  <div style={{ fontFamily: sans, fontSize: 12, color: FAINT, marginTop: 7 }}>
                    {m.done} of {m.total} done
                  </div>
                </div>
              )
            })}
          </div>
        </Rise>

        {/* ── Board: three quiet columns · clicking a card cycles its column ── */}
        <Rise i={ri++} style={{ marginTop: 56 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ ...kicker }}>Board</div>
            <div style={{ fontFamily: sans, fontSize: 11.5, color: FAINT }}>tap a card to move it</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {COLUMNS.map((c) => {
              const tasks = cols.filter((t) => t.col === c.key)
              return (
                <div key={c.key}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      paddingBottom: 10,
                      borderBottom: `1px solid ${LINE}`,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 11,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: MUTED,
                      }}
                    >
                      {c.label}
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 11, color: FAINT }}>{tasks.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {tasks.map((t, idx) => (
                      <div
                        key={t.id}
                        onClick={() => cycle(t.id)}
                        style={{
                          cursor: 'pointer',
                          padding: '13px 0',
                          borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ alignSelf: 'center' }}>
                            <KindDot area={t.area} />
                          </span>
                          <span
                            style={{
                              fontFamily: sans,
                              fontSize: 13.5,
                              color: c.key === 'done' ? MUTED : INK,
                              lineHeight: 1.35,
                            }}
                          >
                            {t.title}
                          </span>
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 10.5, color: FAINT, marginTop: 5, paddingLeft: 15 }}>
                          {t.meta}
                        </div>
                      </div>
                    ))}
                    {tasks.length === 0 && (
                      <div style={{ fontFamily: serif, fontSize: 13.5, color: FAINT, fontStyle: 'italic', paddingTop: 13 }}>
                        nothing here
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Rise>

        {/* ── Recent activity + This-sprint receipt ─────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 56 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 32, alignItems: 'start' }}>
            <div>
              <div style={{ ...kicker, marginBottom: 16 }}>Recent activity</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {project.activity.map((a, idx) => (
                  <div
                    key={a.when + a.what}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 14,
                      padding: '11px 0',
                      borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                    }}
                  >
                    <span style={{ fontFamily: mono, fontSize: 11, color: FAINT, flexShrink: 0, width: 46 }}>
                      {a.when}
                    </span>
                    <span style={{ fontFamily: sans, fontSize: 13.5, color: BODY, lineHeight: 1.4 }}>{a.what}</span>
                  </div>
                ))}
              </div>
            </div>
            <Card style={{ padding: 0, background: 'transparent', border: 'none', boxShadow: 'none' }}>
              <Receipt
                title="This sprint"
                rows={[
                  ['tasks', String(project.sprint.tasks)],
                  ['done', String(project.sprint.done)],
                  ['in-flight', String(project.sprint.inflight)],
                  ['due', project.sprint.due, RUST],
                ]}
              />
            </Card>
          </div>
        </Rise>

        {/* ── The single LIME CTA ────────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 44 }}>
          <button
            onClick={() => {
              setAdded(true)
              ctx.askPond(`Add a task to ${project.name}…`)
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
            {added ? 'What’s the task?' : 'Add task'}
          </button>
        </Rise>
      </div>
    </div>
  )
}

// ── Portfolio: the all-projects roll-up (the "Project Tracker" leaf) ────────────

function Portfolio({ ctx }: { ctx: SurfaceCtx }) {
  const projects = PORTFOLIO_ORDER.map((id) => ({ id, ...PROJECTS[id] }))
  const atRisk = projects.filter((p) => p.status === 'at risk').length
  const totalDone = projects.reduce((s, p) => s + p.done, 0)
  const totalTasks = projects.reduce((s, p) => s + p.total, 0)
  let ri = 0

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

      <div data-clearing style={{ maxWidth: 860, margin: '0 auto', padding: '30px 32px 156px', fontFamily: sans }}>
        {/* Header — ONE focal serif numeral (active projects), matching the
            archetype every other module-page uses */}
        <Rise i={ri++}>
          <div style={{ ...kicker, fontSize: 11 }}>Project Tracker</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginTop: 10 }}>
            <span
              style={{
                fontFamily: display,
                fontSize: 96,
                lineHeight: 0.82,
                color: INK,
                letterSpacing: '-0.02em',
              }}
            >
              {projects.length}
            </span>
            <span style={{ fontFamily: serif, fontSize: 21, lineHeight: 1.35, color: BODY, maxWidth: 260, paddingBottom: 8 }}>
              active projects
              {atRisk > 0 && (
                <>
                  , <span style={{ color: RUST }}>{atRisk} at risk</span>.
                </>
              )}
            </span>
          </div>
        </Rise>

        {/* Project grid — each drills into its detail */}
        <Rise i={ri++} style={{ marginTop: 44 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
            {projects.map((p) => {
              const pct = p.done / p.total
              const risk = p.status === 'at risk'
              return (
                <Card
                  key={p.id}
                  onClick={() => ctx.openPage(p.id)}
                  style={{ cursor: 'pointer', display: 'flex', gap: 18, alignItems: 'center' }}
                >
                  <Ring
                    pct={pct}
                    size={72}
                    stroke={7}
                    color={risk ? RUST : ACCENT}
                    label={`${Math.round(pct * 100)}%`}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <KindDot area={p.area} />
                      <span style={{ fontFamily: display, fontSize: 22, color: INK, lineHeight: 1.1 }}>{p.name}</span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 6,
                        fontFamily: mono,
                        fontSize: 10.5,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: risk ? RUST : MUTED,
                      }}
                    >
                      {risk && (
                        <span
                          style={{ width: 6, height: 6, borderRadius: 2, background: RUST, flexShrink: 0 }}
                          aria-hidden
                        />
                      )}
                      {p.status} · due {p.due}
                    </div>
                    <div style={{ fontFamily: serif, fontSize: 13.5, color: BODY, marginTop: 8, lineHeight: 1.4 }}>
                      Next: {p.nextMilestone}
                    </div>
                    <div style={{ fontFamily: sans, fontSize: 11.5, color: FAINT, marginTop: 6 }}>
                      {p.done} / {p.total} tasks
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </Rise>

        {/* Portfolio receipt */}
        <Rise i={ri++} style={{ marginTop: 44 }}>
          <div style={{ maxWidth: 320 }}>
            <Receipt
              title="Across all projects"
              rows={[
                ['projects', String(projects.length)],
                ['tasks done', `${totalDone} / ${totalTasks}`],
                ['at risk', String(atRisk), atRisk ? RUST : undefined],
              ]}
            />
          </div>
        </Rise>
      </div>
    </div>
  )
}
