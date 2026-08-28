'use client'

/**
 * The left rail — v85 Clearing chrome harvested into the real app.
 *
 * Fully data-driven from the ['pages'] tree: every top-level page is a rail
 * entry — `type='area'` renders as a collapsible folder (caret toggles the
 * folder, the name opens the page), every other type is a plain leaf row.
 * Nothing is hardcoded; the five canonical areas are just seed content.
 *
 * Split for Storybook: <RailView> is presentational (all state and mutations
 * raised as props); <Rail> is the container that wires Supabase + React Query
 * and replaces the old Sidebar in the workspace layout.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { createPage, deletePage } from '@/lib/pages/client'
import { fetchPages, type PageRow } from '@/lib/pages/tree'
import { workspaceUrl } from '@/lib/pages/nav'
import { pageAccent } from '@/lib/pages/accent'
import { ancestorPath } from '@/lib/pages/overview'
import {
  countDescendants,
  subtreeIds,
  needsConfirm,
  blastRadiusLabel,
} from '@/lib/deletion/blast-radius'
import { removeRow, restoreRow } from '@/lib/deletion/row-cache'
import { useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog'

// ── Tree types + helpers ─────────────────────────────────────────────────────

export interface RailNode {
  id: string
  parentId: string | null
  type: string
  title: string
  order: number
  children: RailNode[]
}

/** Build a nested tree from the flat page list, sorted by order then title. */
export function buildTree(rows: PageRow[]): RailNode[] {
  const byId = new Map<string, RailNode>()
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      parentId: r.parent_id,
      type: r.type,
      title: r.title,
      order: r.order ?? 0,
      children: [],
    })
  }
  const roots: RailNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sortRec = (arr: RailNode[]) => {
    arr.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    arr.forEach((n) => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

/** A muted rounded-square dot — the calm way to color-code an area. */
function KindDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="w-[7px] h-[7px] rounded-[2px] flex-shrink-0"
      style={{ background: color }}
    />
  )
}

const kicker = 'font-mono text-[10px] tracking-[0.2em] uppercase text-press-faint'

// ── Rows ─────────────────────────────────────────────────────────────────────

interface RowCallbacks {
  onSelect: (node: RailNode) => void
  onToggle: (id: string) => void
  onAddChild: (node: RailNode) => void
  onDelete: (node: RailNode) => void
}

function RailRow({
  node,
  depth,
  accent,
  selectedId,
  pathIds,
  expanded,
  busyId,
  callbacks,
}: {
  node: RailNode
  depth: number
  accent: string
  selectedId: string | null
  pathIds: ReadonlySet<string>
  expanded: Set<string>
  busyId: string | null
  callbacks: RowCallbacks
}) {
  const isArea = node.type === 'area'
  const hasChildren = node.children.length > 0
  const isExpanded = expanded.has(node.id)
  const isSelected = node.id === selectedId
  // An ancestor of the current node — the trail reads at a slightly raised tone,
  // calmer than the selected row's soft background (ticket-25).
  const isOnPath = !isSelected && pathIds.has(node.id)
  const isBusy = node.id === busyId
  const showCaret = isArea || hasChildren

  return (
    <div className="mb-0.5">
      <div
        className={`group flex items-center rounded-[10px] pr-1.5 transition-colors ${
          isSelected ? 'bg-press-accent-soft' : 'hover:bg-press-accent-wash'
        }`}
      >
        {/* caret — toggles the folder without navigating */}
        {showCaret ? (
          <button
            className={`w-[22px] h-[30px] flex-shrink-0 grid place-items-center text-press-faint hover:text-foreground text-[9px] transition-transform duration-200 ${
              isExpanded ? 'rotate-90' : ''
            }`}
            aria-label={
              isExpanded
                ? `Collapse ${node.title || 'Untitled'}`
                : `Expand ${node.title || 'Untitled'}`
            }
            onClick={() => callbacks.onToggle(node.id)}
          >
            ▶
          </button>
        ) : (
          <span className="w-[22px] flex-shrink-0" />
        )}

        {/* name — opens the page. On the path to the current node the tone is
            raised one step (foreground for areas, body for leaves) so the trail
            reads in the rail without competing with the selected row. */}
        <button
          className={`flex-1 min-w-0 flex items-center gap-2 text-left py-1.5 ${
            isArea
              ? `text-[13px] font-semibold ${
                  isSelected || isOnPath
                    ? 'text-foreground'
                    : 'text-press-body hover:text-foreground'
                }`
              : `text-[12.5px] ${
                  isSelected
                    ? 'text-foreground font-medium'
                    : isOnPath
                      ? 'text-press-body hover:text-foreground'
                      : 'text-press-muted hover:text-foreground'
                }`
          }`}
          data-on-path={isOnPath || undefined}
          onClick={() => callbacks.onSelect(node)}
          title={node.title || 'Untitled'}
        >
          {isArea && <KindDot color={accent} />}
          <span className="truncate">{node.title || 'Untitled'}</span>
        </button>

        {/* hover CRUD — revealed on hover so the resting rail stays calm; also
            revealed when the row (or a control) has keyboard focus so it's
            reachable without a pointer (focus-within on the group + focus-visible
            on the control itself). */}
        <button
          className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-press-faint hover:text-foreground focus-visible:text-foreground text-sm leading-none px-0.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-press-accent disabled:opacity-30"
          title="Add sub-page"
          aria-label={`Add sub-page to ${node.title || 'Untitled'}`}
          disabled={isBusy}
          onClick={() => callbacks.onAddChild(node)}
        >
          +
        </button>
        <button
          className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-press-faint hover:text-destructive focus-visible:text-destructive text-sm leading-none px-0.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-press-accent disabled:opacity-30"
          title="Delete page"
          aria-label={`Delete ${node.title || 'Untitled'}`}
          disabled={isBusy}
          onClick={() => callbacks.onDelete(node)}
        >
          ×
        </button>
      </div>

      {isExpanded && hasChildren && (
        <div className="ml-[22px]">
          {node.children.map((child) => (
            <RailRow
              key={child.id}
              node={child}
              depth={depth + 1}
              accent={accent}
              selectedId={selectedId}
              pathIds={pathIds}
              expanded={expanded}
              busyId={busyId}
              callbacks={callbacks}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Presentational rail ──────────────────────────────────────────────────────

const NO_PATH: ReadonlySet<string> = new Set()

export interface RailViewProps extends RowCallbacks {
  tree: RailNode[]
  selectedId: string | null
  /** Ancestor ids of the selected node — rendered at a raised tone (ticket-25). */
  pathIds?: ReadonlySet<string>
  expanded: Set<string>
  busyId: string | null
  isLoading: boolean
  isEmpty: boolean
  lifeActive: boolean
  onLife: () => void
}

export function RailView({
  tree,
  selectedId,
  pathIds = NO_PATH,
  expanded,
  busyId,
  isLoading,
  isEmpty,
  lifeActive,
  onLife,
  onSelect,
  onToggle,
  onAddChild,
  onDelete,
}: RailViewProps) {
  const callbacks = { onSelect, onToggle, onAddChild, onDelete }
  return (
    <aside className="w-[250px] flex-shrink-0 h-full overflow-y-auto px-4 pt-6 pb-8 font-sans">
      <div className="flex items-baseline gap-2.5 px-2 pb-5">
        <span className="font-display text-[25px] text-foreground">Pond</span>
      </div>

      {/* Life — the top overview page (everything, across your life) */}
      <div className="mb-4">
        <button
          className={`flex items-center gap-[11px] w-full text-left px-2.5 py-2 rounded-[10px] text-sm transition-colors ${
            lifeActive
              ? 'bg-press-accent-soft text-foreground font-bold'
              : 'text-press-muted font-semibold hover:bg-press-accent-soft hover:text-foreground'
          }`}
          onClick={onLife}
        >
          <span
            aria-hidden
            className={`w-4 text-center text-[13px] ${lifeActive ? 'text-press-accent' : 'text-press-faint'}`}
          >
            ◒
          </span>
          Life
          <span className={`${kicker} ml-auto`}>all</span>
        </button>
      </div>

      <div className={`${kicker} px-2.5 pb-2`}>Pages</div>
      <nav>
        {isLoading && <p className="px-2.5 text-xs text-press-faint">Loading…</p>}
        {!isLoading && isEmpty && (
          <p className="px-2.5 text-xs text-press-faint">Setting up your workspace…</p>
        )}
        {tree.map((node) => (
          <RailRow
            key={node.id}
            node={node}
            depth={0}
            accent={pageAccent(node.id)}
            selectedId={selectedId}
            pathIds={pathIds}
            expanded={expanded}
            busyId={busyId}
            callbacks={callbacks}
          />
        ))}
      </nav>
    </aside>
  )
}

// ── Container ────────────────────────────────────────────────────────────────

export function Rail() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const seededRef = useRef(false)
  // Area folders start collapsed (the proto's resting state) and open per session.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  // The subtree-delete confirm (blast-radius modal); null when closed.
  const [confirmTarget, setConfirmTarget] = useState<RailNode | null>(null)
  const { stageDeletion, notify } = useDeletionUndo()

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: fetchPages,
  })

  const tree = useMemo(() => buildTree(pages), [pages])
  const selectedNodeId = searchParams.get('nodeId')

  // The ancestor ids of the selected node — the rail renders these at a raised
  // tone so the trail to "you are here" reads even in a deep tree (ticket-25).
  const pathIds = useMemo<ReadonlySet<string>>(
    () =>
      selectedNodeId
        ? new Set(ancestorPath(pages, selectedNodeId).map((c) => c.id))
        : new Set<string>(),
    [pages, selectedNodeId]
  )

  // ── Rail follows you (ticket-25) ────────────────────────────────────────────
  // When the selection changes — via a rail click, an overview card, the
  // breadcrumb, or a page created through chat / ＋ — auto-expand every folder on
  // the path to the current node so it's revealed and its ancestors highlight.
  // We reveal a given selection exactly once (tracked by ref) so a manual
  // re-collapse afterward isn't fought: collapsing a folder changes neither the
  // selection nor the rows, so this effect stays quiet until you navigate again.
  // A page created via chat lands in the URL before ['pages'] refetches, so the
  // effect also depends on `pages` and reveals once the new node's ancestors
  // become resolvable.
  const revealedForRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedNodeId) {
      revealedForRef.current = null
      return
    }
    if (selectedNodeId === revealedForRef.current) return
    // Wait until the node itself is present so its ancestor chain is resolvable.
    if (!pages.some((r) => r.id === selectedNodeId)) return
    const ancestors = ancestorPath(pages, selectedNodeId).map((c) => c.id)
    revealedForRef.current = selectedNodeId
    if (ancestors.length === 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reveals the path in response to an external navigation (URL ?nodeId, incl. chat/＋ creation), guarded to fire once per selection; not a derived-state computation
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const id of ancestors) next.add(id)
      return next
    })
  }, [selectedNodeId, pages])

  // Deferred commits fire up to ~6s after staging — read the selection fresh at
  // commit time via this ref, not the render-time closure value.
  const selectedNodeIdRef = useRef<string | null>(null)
  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

  // Seed default pages on first login — fires once when the tree is empty after load
  useEffect(() => {
    if (isLoading || pages.length > 0 || seededRef.current) return
    seededRef.current = true

    async function seed() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)('seed_default_pages', { p_user_id: user.id })
      queryClient.invalidateQueries({ queryKey: ['pages'] })
    }

    seed()
  }, [isLoading, pages.length, queryClient])

  function navigateTo(node: { id: string; type: string; title: string }) {
    router.push(workspaceUrl(node))
  }

  /** Run a mutation with a fresh client + user, refresh the tree, return its result. */
  async function withUser<T>(
    fn: (sb: ReturnType<typeof createClient>, userId: string) => Promise<T>
  ): Promise<T | undefined> {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return undefined
    const result = await fn(supabase, user.id)
    await queryClient.invalidateQueries({ queryKey: ['pages'] })
    return result
  }

  async function handleAddChild(node: RailNode) {
    setBusyId(node.id)
    try {
      const created = await withUser((sb, uid) =>
        createPage(sb, uid, { parentId: node.id, type: 'page', title: 'Untitled' })
      )
      // ensure the parent folder is open so the new child is visible
      setExpanded((prev) => new Set(prev).add(node.id))
      if (created) navigateTo({ id: created.id, type: 'page', title: 'Untitled' })
    } finally {
      setBusyId(null)
    }
  }

  /** Put a single optimistically-removed row back (surgical) and reconcile. */
  function restoreDeletedRow(row: PageRow | undefined) {
    if (row) {
      queryClient.setQueryData<PageRow[]>(['pages'], (rows) =>
        rows ? restoreRow(rows, row) : rows
      )
    }
    queryClient.invalidateQueries({ queryKey: ['pages'] })
  }

  /**
   * The real hard-delete + open-page bookkeeping, shared by both delete paths.
   * Runs up to ~6s after staging (deferred commit), so the selection is read
   * fresh from the ref. On failure the removed row is restored and the failure
   * surfaced — never a silently ghosted cache.
   */
  async function commitDelete(node: RailNode, removedRow?: PageRow) {
    try {
      await withUser(async (sb) => {
        await deletePage(sb, node.id)
      })
      // if the open page was in the deleted subtree, clear the workspace
      const selected = selectedNodeIdRef.current
      if (selected && subtreeIds(node).has(selected)) {
        router.push('/workspace')
      }
    } catch {
      restoreDeletedRow(removedRow)
      notify(`Couldn't delete "${node.title || 'Untitled'}"`)
    }
  }

  function handleDelete(node: RailNode) {
    // A subtree delete is irreversible and heavy — gate it behind the styled
    // blast-radius confirm. A leaf goes straight to an optimistic-remove + undo
    // toast (deferred commit), no modal.
    if (needsConfirm(countDescendants(node))) {
      setConfirmTarget(node)
      return
    }

    // Leaf: surgically drop this one row from the tree cache so it vanishes at
    // once, open an undo toast, and defer the destructive write. Undo re-inserts
    // ONLY this row (never a whole snapshot — a snapshot would resurrect other
    // concurrently-deleted rows) and reconciles with the server, whose row still
    // exists during the grace window (see the caveat in deferred-commit.ts).
    const removedRow = pages.find((r) => r.id === node.id)
    queryClient.setQueryData<PageRow[]>(['pages'], (rows) => removeRow(rows ?? [], node.id))
    if (selectedNodeId === node.id) router.push('/workspace')

    stageDeletion({
      message: `Deleted "${node.title || 'Untitled'}"`,
      scope: 'rail',
      commit: () => commitDelete(node, removedRow),
      undo: () => restoreDeletedRow(removedRow),
    })
  }

  async function handleConfirmDelete() {
    const node = confirmTarget
    setConfirmTarget(null)
    if (!node) return
    setBusyId(node.id)
    try {
      await commitDelete(node)
    } finally {
      setBusyId(null)
    }
  }

  function handleToggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Opening a page from the rail also opens its folder (the proto's openArea). */
  function handleSelect(node: RailNode) {
    if (node.type === 'area' || node.children.length > 0) {
      setExpanded((prev) => new Set(prev).add(node.id))
    }
    navigateTo(node)
  }

  const confirmCount = confirmTarget ? countDescendants(confirmTarget) : 0

  return (
    <>
      <RailView
        tree={tree}
        selectedId={selectedNodeId}
        pathIds={pathIds}
        expanded={expanded}
        busyId={busyId}
        isLoading={isLoading}
        isEmpty={!isLoading && pages.length === 0}
        lifeActive={!selectedNodeId}
        onLife={() => router.push('/workspace')}
        onSelect={handleSelect}
        onToggle={handleToggle}
        onAddChild={handleAddChild}
        onDelete={handleDelete}
      />
      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null)
        }}
        title={`Delete "${confirmTarget?.title || 'Untitled'}"?`}
        blastRadius={blastRadiusLabel(confirmCount)}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}
