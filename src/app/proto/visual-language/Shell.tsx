'use client'

/**
 * THROWAWAY (ticket-14). A faithful Pond three-panel shell — sidebar page tree ·
 * page editor · bottom AI terminal with an inline diff card — driven entirely by
 * a concrete `ShellTheme` of literal style values. Lower/mid variants on the
 * boldness ladder are just a theme object; bolder variants pass `backdrop` +
 * `rootClass` or bypass Shell and render custom JSX from the shared `content`.
 *
 * Deliberately self-contained: no shadcn wrappers, no app tokens — each variant
 * owns its own visual world so we can compare them honestly.
 */

import type { CSSProperties, ReactNode } from 'react'
import {
  tree,
  openPage,
  transcript,
  diffCard,
  contextLabel,
  openNodeId,
  type TreeNode,
  type Block,
  type Message,
} from './content'

export interface ShellTheme {
  // fonts (pass the CSS vars from layout.tsx, e.g. 'var(--proto-font-sans)')
  fontBody: string
  fontHead: string
  fontMono: string
  // core palette
  bg: string
  fg: string
  muted: string
  faint: string
  border: string
  borderWidth?: string
  sidebarBg: string
  surface: string
  surface2: string
  terminalBg: string
  terminalFg: string
  accent: string
  accentFg: string
  // presentation
  radius: number
  shadow: string
  density?: 'compact' | 'cozy' | 'roomy'
  titleSize?: number
  titleFont?: string
  titleWeight?: number | string
  uppercaseLabels?: boolean
  letterSpacing?: string
  // hooks for bolder variants
  rootStyle?: CSSProperties
  rootClass?: string
  backdrop?: ReactNode
  // status dot color for active projects
  activeDot?: string
}

const DENSITY = {
  compact: { pad: 16, gap: 8, text: 13, line: 1.5 },
  cozy: { pad: 24, gap: 12, text: 14, line: 1.6 },
  roomy: { pad: 36, gap: 18, text: 15, line: 1.75 },
}

export function Shell({ theme: t }: { theme: ShellTheme }) {
  const d = DENSITY[t.density ?? 'cozy']
  const bw = t.borderWidth ?? '1px'
  const label: CSSProperties = {
    fontFamily: t.fontMono,
    fontSize: 11,
    color: t.muted,
    textTransform: t.uppercaseLabels ? 'uppercase' : 'none',
    letterSpacing: t.uppercaseLabels ? '0.08em' : t.letterSpacing ?? 'normal',
  }

  return (
    <div
      className={`relative h-screen w-screen overflow-hidden ${t.rootClass ?? ''}`}
      style={{ background: t.bg, color: t.fg, fontFamily: t.fontBody, ...t.rootStyle }}
    >
      {t.backdrop}
      <div className="relative z-10 flex h-full">
        {/* ── Sidebar ─────────────────────────────────────────── */}
        <aside
          className="flex h-full flex-col"
          style={{
            width: 264,
            flexShrink: 0,
            background: t.sidebarBg,
            borderRight: `${bw} solid ${t.border}`,
          }}
        >
          <div
            className="flex items-center justify-between"
            style={{ padding: `14px ${d.pad}px`, borderBottom: `${bw} solid ${t.border}` }}
          >
            <span
              style={{
                fontFamily: t.fontHead,
                fontWeight: 600,
                fontSize: 15,
                letterSpacing: t.letterSpacing ?? 'normal',
              }}
            >
              Pond
            </span>
            <span style={{ color: t.muted, fontSize: 18, lineHeight: 1 }}>+</span>
          </div>
          <nav className="flex-1 overflow-y-auto" style={{ padding: `${d.gap}px 8px` }}>
            {tree.map((n) => (
              <TreeRow key={n.id} node={n} depth={0} t={t} d={d} />
            ))}
          </nav>
        </aside>

        {/* ── Main column: doc + terminal ─────────────────────── */}
        <div className="flex h-full min-w-0 flex-1 flex-col">
          {/* Document panel */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div style={{ maxWidth: 680, margin: '0 auto', padding: `${d.pad + 12}px ${d.pad + 8}px` }}>
              <div style={{ ...label, marginBottom: 10 }}>{openPage.breadcrumb.join('  ›  ')}</div>
              <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: d.pad }}>
                <h1
                  style={{
                    fontFamily: t.titleFont ?? t.fontHead,
                    fontSize: t.titleSize ?? 30,
                    fontWeight: t.titleWeight ?? 600,
                    lineHeight: 1.1,
                    letterSpacing: t.letterSpacing ?? 'normal',
                  }}
                >
                  {openPage.title}
                </h1>
                <span style={{ ...label, flexShrink: 0 }}>{openPage.saved ? 'Saved' : 'Saving…'}</span>
              </div>

              <div className="flex flex-col" style={{ gap: d.gap + 4 }}>
                {openPage.blocks.map((b) => (
                  <BlockView key={b.id} block={b} t={t} d={d} />
                ))}
              </div>

              <button style={{ ...label, marginTop: d.pad, background: 'none', border: 'none', cursor: 'pointer' }}>
                + Add text
              </button>
            </div>
          </div>

          {/* AI terminal */}
          <div
            className="flex flex-col"
            style={{
              height: 300,
              flexShrink: 0,
              background: t.terminalBg,
              color: t.terminalFg,
              borderTop: `${bw} solid ${t.border}`,
            }}
          >
            <div
              style={{
                ...label,
                padding: `8px ${d.pad}px`,
                borderBottom: `${bw} solid ${t.border}`,
                background: t.surface,
              }}
            >
              Context: {contextLabel}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto" style={{ padding: `12px ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {transcript.map((m) => (
                <Bubble key={m.id} m={m} t={t} d={d} />
              ))}
              <DiffCardView t={t} d={d} />
            </div>
            <div className="flex items-end gap-2" style={{ padding: `10px ${d.pad}px`, borderTop: `${bw} solid ${t.border}` }}>
              <div
                className="flex-1"
                style={{
                  border: `${bw} solid ${t.border}`,
                  borderRadius: t.radius * 0.6,
                  padding: '9px 12px',
                  fontFamily: t.fontMono,
                  fontSize: 13,
                  color: t.muted,
                  background: t.bg,
                }}
              >
                Talk to Pond… (/clear · /handoff · /save)
              </div>
              <button
                style={{
                  background: t.accent,
                  color: t.accentFg,
                  border: 'none',
                  borderRadius: t.radius * 0.6,
                  padding: '9px 16px',
                  fontFamily: t.fontHead,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TreeRow({ node, depth, t, d }: { node: TreeNode; depth: number; t: ShellTheme; d: typeof DENSITY['cozy'] }) {
  const selected = node.id === openNodeId
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: `6px 10px`,
          paddingLeft: 10 + depth * 16,
          margin: '1px 0',
          borderRadius: t.radius * 0.5,
          fontSize: d.text,
          fontFamily: depth === 0 ? t.fontHead : t.fontBody,
          fontWeight: depth === 0 ? 600 : 400,
          color: selected ? t.accentFg : depth === 0 ? t.fg : t.muted,
          background: selected ? t.accent : 'transparent',
        }}
      >
        <span style={{ opacity: 0.5, fontSize: 10 }}>{node.children?.length ? '▾' : '·'}</span>
        <span className="truncate">{node.title}</span>
        {node.status === 'active' && (
          <span
            style={{
              marginLeft: 'auto',
              width: 6,
              height: 6,
              borderRadius: 999,
              background: selected ? t.accentFg : t.activeDot ?? t.accent,
            }}
          />
        )}
      </div>
      {node.children?.map((c) => (
        <TreeRow key={c.id} node={c} depth={depth + 1} t={t} d={d} />
      ))}
    </>
  )
}

function BlockView({ block, t, d }: { block: Block; t: ShellTheme; d: typeof DENSITY['cozy'] }) {
  const body: CSSProperties = { fontSize: d.text, lineHeight: d.line, color: t.fg, fontFamily: t.fontBody }
  if (block.type === 'text') return <p style={body}>{block.content}</p>
  if (block.type === 'todo')
    return (
      <ul className="flex flex-col" style={{ gap: 6 }}>
        {block.items.map((it) => (
          <li key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: d.text, color: t.fg }}>
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: t.radius * 0.4,
                border: `1.5px solid ${it.checked ? t.accent : t.border}`,
                background: it.checked ? t.accent : 'transparent',
                color: t.accentFg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              {it.checked ? '✓' : ''}
            </span>
            <span style={{ opacity: it.checked ? 0.55 : 1, textDecoration: it.checked ? 'line-through' : 'none' }}>
              {it.label}
            </span>
          </li>
        ))}
      </ul>
    )
  // metric
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 8,
        alignSelf: 'flex-start',
        padding: `10px 14px`,
        borderRadius: t.radius,
        background: t.surface,
        border: `${t.borderWidth ?? '1px'} solid ${t.border}`,
        boxShadow: t.shadow,
      }}
    >
      <span style={{ ...cssLabel(t), fontSize: 11 }}>{block.label}</span>
      <span style={{ fontFamily: t.fontMono, fontSize: 22, fontWeight: 600, color: t.fg }}>{block.value}</span>
      <span style={{ fontFamily: t.fontMono, fontSize: 12, color: t.muted }}>{block.unit}</span>
      {block.trend && (
        <span style={{ fontFamily: t.fontMono, fontSize: 12, color: t.accent, fontWeight: 600 }}>{block.trend}</span>
      )}
    </div>
  )
}

function Bubble({ m, t, d }: { m: Message; t: ShellTheme; d: typeof DENSITY['cozy'] }) {
  const isUser = m.role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <span
        style={{
          display: 'inline-block',
          maxWidth: '80%',
          padding: '8px 12px',
          borderRadius: t.radius * 0.8,
          fontSize: 13,
          lineHeight: 1.55,
          fontFamily: t.fontMono,
          background: isUser ? t.accent : t.surface2,
          color: isUser ? t.accentFg : t.terminalFg,
        }}
      >
        {m.text}
      </span>
    </div>
  )
}

function DiffCardView({ t, d }: { t: ShellTheme; d: typeof DENSITY['cozy'] }) {
  return (
    <div
      style={{
        borderRadius: t.radius,
        border: `${t.borderWidth ?? '1px'} solid ${t.border}`,
        background: t.surface,
        boxShadow: t.shadow,
        overflow: 'hidden',
        alignSelf: 'flex-start',
        maxWidth: '90%',
      }}
    >
      <div style={{ ...cssLabel(t), padding: '7px 12px', borderBottom: `${t.borderWidth ?? '1px'} solid ${t.border}` }}>
        Proposed edit · {diffCard.blockType}
      </div>
      <div style={{ padding: '10px 12px', fontSize: 13, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ color: t.muted, textDecoration: 'line-through', textDecorationColor: t.border }}>
          {diffCard.before}
        </span>
        <span style={{ color: t.fg }}>{diffCard.after}</span>
      </div>
      <p style={{ padding: '0 12px 8px', fontSize: 12, color: t.muted }}>{diffCard.reason}</p>
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderTop: `${t.borderWidth ?? '1px'} solid ${t.border}` }}>
        <PillBtn label="Accept" style={{ background: t.accent, color: t.accentFg }} t={t} />
        <PillBtn label="Edit" style={{ background: 'transparent', color: t.fg, border: `1px solid ${t.border}` }} t={t} />
        <PillBtn label="Reject" style={{ background: 'transparent', color: t.muted }} t={t} />
      </div>
    </div>
  )
}

function PillBtn({ label, style, t }: { label: string; style: CSSProperties; t: ShellTheme }) {
  return (
    <button
      style={{
        borderRadius: t.radius * 0.5,
        padding: '4px 12px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: t.fontHead,
        border: 'none',
        cursor: 'pointer',
        ...style,
      }}
    >
      {label}
    </button>
  )
}

function cssLabel(t: ShellTheme): CSSProperties {
  return {
    fontFamily: t.fontMono,
    fontSize: 11,
    color: t.muted,
    textTransform: t.uppercaseLabels ? 'uppercase' : 'none',
    letterSpacing: t.uppercaseLabels ? '0.08em' : 'normal',
  }
}
