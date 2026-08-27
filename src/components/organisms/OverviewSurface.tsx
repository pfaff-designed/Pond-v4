'use client'

/**
 * The shared overview surface — v85 Clearing's area-overview pattern,
 * data-driven: kicker header, one focal numeral, a card per child page, a
 * closing serif exhale. Used for both an area page and the Life root (slice 5);
 * the callers derive the model from real ['pages'] rows via lib/pages/overview.
 *
 * Deliberately structural: no Pond note, no AI synthesis — that's a named
 * follow-up with its own grill.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { updateTitle } from '@/lib/pages/client'
import { FocalNumeral } from '@/components/molecules/FocalNumeral'
import { ChildrenGrid, ChildrenGridLabel } from '@/components/molecules/ChildrenGrid'
import {
  areaOverview,
  lifeOverview,
  type OverviewCardModel,
  type OverviewModel,
} from '@/lib/pages/overview'
import { fetchPages } from '@/lib/pages/tree'
import { pageAccent, rootAncestorId } from '@/lib/pages/accent'
import { requestTerminalFocus } from '@/lib/terminal-focus'

/** Staggered rise-on-mount wrapper. index drives the delay. */
function Rise({
  i,
  className = '',
  children,
}: {
  i: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`press-rise ${className}`} style={{ animationDelay: `${i * 70}ms` }}>
      {children}
    </div>
  )
}

/**
 * The kicker micro-label above the numeral. Static text when read-only; an
 * inline click-to-rename field when `onRename` is supplied (ticket-26). Kept
 * uppercase-mono so a renamed area reads the same resting as a static one, and
 * the caption ("Health") stays legible while typing lowercase — the CSS
 * uppercases the display. Enter commits + blurs; Escape reverts; blur commits.
 */
function EditableKicker({
  value,
  onRename,
}: {
  value: string
  onRename?: (title: string) => void
}) {
  const kickerClass = 'font-mono text-[11px] tracking-[0.2em] uppercase text-press-faint'
  const [draft, setDraft] = useState(value)

  if (!onRename) {
    return <span className={kickerClass}>{value}</span>
  }

  function commit() {
    const next = draft.trim()
    // Only persist a genuine change; an empty title is refused (revert to value).
    if (next && next !== value) onRename!(next)
    else setDraft(value)
  }

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
      aria-label="Rename page"
      className={`${kickerClass} bg-transparent outline-none rounded-sm px-1 -mx-1 min-w-[6ch] hover:bg-press-accent-wash focus:bg-press-accent-wash focus:text-press-body transition-colors`}
    />
  )
}

export interface OverviewSurfaceProps {
  /** Micro-label above the numeral, e.g. the page title or "Life". */
  kicker: string
  /**
   * When set, the kicker becomes an inline click-to-rename field (ticket-26):
   * a page must be renamable from every surface it renders as, and an area's
   * overview is one such surface. Called with the committed new title on blur or
   * Enter; a no-op change is ignored by the caller. Omit for non-renamable
   * surfaces (the Life root), which keep a static label.
   */
  onRenameKicker?: (title: string) => void
  /** Muted accent for the kicker dot (an area's hue); omit for Life. */
  accent?: string
  model: OverviewModel
  /** The closing serif line, e.g. "That's Health at a glance…". */
  closing: string
  onOpenCard: (card: OverviewCardModel) => void
  /** The quiet "ask Pond →" affordance — focuses the terminal. */
  onAskPond?: () => void
  /**
   * The quiet "+ Add content" affordance. Present when this node could hold its
   * own blocks but has none yet (a pure area/container). Adding a block flips the
   * node to the composite editor+children surface (ticket-22).
   */
  onAddContent?: () => void
}

export function OverviewSurface({
  kicker,
  onRenameKicker,
  accent,
  model,
  closing,
  onOpenCard,
  onAskPond,
  onAddContent,
}: OverviewSurfaceProps) {
  let ri = 0
  return (
    <div className="h-full overflow-y-auto font-sans">
      <div className="max-w-[720px] mx-auto px-8 pt-8 pb-24">
        {/* ── Header: kicker + "ask Pond" ─────────────────────────────────── */}
        <Rise i={ri++} className="flex items-baseline justify-between gap-4">
          <div className="flex items-center gap-2">
            {accent && (
              <span
                aria-hidden
                className="w-2 h-2 rounded-[2px] flex-shrink-0"
                style={{ background: accent }}
              />
            )}
            {/* keyed on value so an external rename (rail/AI) re-seeds the draft */}
            <EditableKicker key={kicker} value={kicker} onRename={onRenameKicker} />
          </div>
          <div className="flex items-center gap-4">
            {onAddContent && (
              <button
                onClick={onAddContent}
                className="text-[12.5px] font-medium text-press-muted hover:text-foreground border-b border-transparent hover:border-border transition-colors whitespace-nowrap"
              >
                + Add content
              </button>
            )}
            {onAskPond && (
              <button
                onClick={onAskPond}
                className="text-[12.5px] font-medium text-press-accent hover:text-foreground border-b border-transparent hover:border-border transition-colors whitespace-nowrap"
              >
                ask Pond →
              </button>
            )}
          </div>
        </Rise>

        {/* ── Focal numeral + caption ─────────────────────────────────────── */}
        <Rise i={ri++} className="mt-7 mb-1.5">
          <FocalNumeral value={model.focal} caption={model.focalCaption} />
        </Rise>

        {/* ── Everything within — a card per child page ───────────────────── */}
        {model.cards.length > 0 && (
          <div className="mt-11">
            <Rise i={ri++}>
              <ChildrenGridLabel />
            </Rise>
            <ChildrenGrid
              cards={model.cards}
              onOpenCard={onOpenCard}
              label={false}
              cell={(_card, node) => <Rise i={ri++}>{node}</Rise>}
            />
          </div>
        )}

        {/* ── Closing serif exhale ────────────────────────────────────────── */}
        <Rise i={ri++} className="mt-12">
          <div className="border-t border-press-hair pt-5">
            <span className="font-serif text-sm italic text-press-faint">{closing}</span>
          </div>
        </Rise>
      </div>
    </div>
  )
}

/** Card → workspace navigation shared by the overview containers and the
 * composite content+children surface (ticket-22). */
export function useOpenCard() {
  const router = useRouter()
  return function openCard(card: OverviewCardModel) {
    const params = new URLSearchParams({
      nodeType: card.type,
      nodeId: card.id,
      nodeName: card.title,
    })
    router.push(`/workspace?${params.toString()}`)
  }
}

// ── Area container ───────────────────────────────────────────────────────────

/**
 * The overview for one area page, derived from the same ['pages'] rows the
 * rail reads. Cards navigate the workspace; "ask Pond" focuses the terminal.
 * Rendered only for an area with NO blocks of its own — an area with blocks gets
 * the composite editor+children surface in DocumentPanel instead (ticket-22);
 * the "+ Add content" affordance is the bridge from this surface to that one.
 */
export function AreaOverviewPanel({
  areaId,
  title,
  onAddContent,
}: {
  areaId: string
  title: string
  /** When set, the surface offers a "+ Add content" affordance (ticket-22). */
  onAddContent?: () => void
}) {
  const openCard = useOpenCard()
  const queryClient = useQueryClient()
  const { data: rows = [] } = useQuery({ queryKey: ['pages'], queryFn: fetchPages })

  const model = useMemo(() => areaOverview(rows, areaId, new Date()), [rows, areaId])
  const accent = useMemo(() => {
    const parentById = new Map(rows.map((r) => [r.id, r.parent_id]))
    return pageAccent(rootAncestorId(areaId, parentById))
  }, [rows, areaId])

  // Rename from the overview surface (ticket-26): same updateTitle path the
  // editor uses, then invalidate ['pages'] so the rail label updates and
  // ['page'] so the editor title stays in step if it opens this page next.
  async function handleRename(next: string) {
    const supabase = createClient()
    await updateTitle(supabase, areaId, next)
    await queryClient.invalidateQueries({ queryKey: ['pages'] })
    await queryClient.invalidateQueries({ queryKey: ['page', areaId] })
  }

  const name = title || 'Untitled'
  return (
    <OverviewSurface
      kicker={name}
      onRenameKicker={handleRename}
      accent={accent}
      model={model}
      closing={`That’s ${name} at a glance. Open any of it, or ask.`}
      onOpenCard={openCard}
      onAskPond={requestTerminalFocus}
      onAddContent={onAddContent}
    />
  )
}

// ── Life container ───────────────────────────────────────────────────────────

/**
 * The Life/home overview at the workspace root — replaces the old "Select a
 * page" empty state. Structural only: real counts and recency per top-level
 * page; the "Across your life" AI synthesis is a deferred follow-up.
 */
export function LifeOverviewPanel() {
  const openCard = useOpenCard()
  const { data: rows = [], isLoading } = useQuery({ queryKey: ['pages'], queryFn: fetchPages })

  const model = useMemo(() => lifeOverview(rows, new Date()), [rows])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-press-faint">
        Loading…
      </div>
    )
  }

  return (
    <OverviewSurface
      kicker="Life · everything"
      model={model}
      closing="That’s the whole of it. Open an area, or ask."
      onOpenCard={openCard}
      onAskPond={requestTerminalFocus}
    />
  )
}
