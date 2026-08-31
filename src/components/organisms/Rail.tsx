'use client'

/**
 * The left rail — a true VS Code-grade recursive file tree, rooted at Life
 * (ticket-28). Elevated to the Press aesthetic: hairline indentation guides,
 * a calm authored chevron, breathing row rhythm, and the muted sage dot
 * language.
 *
 * ONE continuous tree. Life is the root folder at depth 0 — not a separate
 * header button, but the first `treeitem`. Everything nests under it:
 * Life › area › page › sub-page, to arbitrary depth. Any node with children is
 * a folder (disclosure chevron); any leaf is a file. A composite page (blocks
 * AND children, ticket-22) is a folder that also opens as a document — VS Code's
 * split, kept strict: the caret toggles expand, the label opens, and the label
 * never toggles.
 *
 * Life is the workspace root, NOT a row in `pages`: it can't be renamed or
 * deleted, and its caret is a collapse-all (collapsing closes every folder, so
 * re-opening shows the resting top level). The data source is unchanged — the
 * `['pages']` query + parent_id tree (ticket-25's reveal, ticket-27's delete,
 * ticket-26's create all preserved) — this is a view-layer restructure.
 *
 * Split for Storybook: <RailView> is presentational (all data and mutations
 * raised as props) but OWNS the roving focus + keyboard machine, since focus is
 * a view concern; <Rail> is the container that wires Supabase + React Query.
 *
 * Keyboard (WAI-ARIA APG tree — pure rules in `lib/rail/tree.ts`, jest-covered):
 * one roving tab stop; ↑/↓ move, → expands / steps into the first child,
 * ← collapses / steps out to the parent, Enter/Space open, Home/End jump,
 * Delete/⌫ deletes the focused row (through the same confirm/undo path as ×),
 * + adds a child. The row's ＋/× are also real tab stops (ticket-27
 * reachability). When the focused row vanishes (deleted, or hidden by an
 * ancestor collapse) focus falls to the nearest surviving neighbor, VS Code
 * style.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { createPage, deletePage } from '@/lib/pages/client'
import { fetchPages, type PageRow } from '@/lib/pages/tree'
import { useWorkspace } from '@/lib/workspace/context'
import { workspaceUrl, workspaceBasePath } from '@/lib/pages/nav'
import { pageAccent } from '@/lib/pages/accent'
import { ancestorPath } from '@/lib/pages/overview'
import {
  LIFE_ID,
  buildTree,
  flattenVisible,
  treeKeyCommand,
  focusFallback,
  type RailNode,
  type FlatRow,
} from '@/lib/rail/tree'
import {
  countDescendants,
  subtreeIds,
  needsConfirm,
  blastRadiusLabel,
} from '@/lib/deletion/blast-radius'
import { removeRow, restoreRow } from '@/lib/deletion/row-cache'
import { useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog'
import { TreeRow } from '@/components/molecules/TreeRow'

// Re-exported so stories and consumers keep one import site for the tree types.
export { LIFE_ID, buildTree, flattenVisible, isFolderNode } from '@/lib/rail/tree'
export type { RailNode, FlatRow } from '@/lib/rail/tree'

// ── Presentational rail ──────────────────────────────────────────────────────

const NO_PATH: ReadonlySet<string> = new Set()

export interface RailViewProps {
  tree: RailNode[]
  selectedId: string | null
  /** Ancestor ids of the selected node — rendered at a raised tone (ticket-25). */
  pathIds?: ReadonlySet<string>
  expanded: Set<string>
  /** Whether the Life root is expanded (reveals the whole tree). */
  lifeExpanded: boolean
  busyId: string | null
  isLoading: boolean
  isEmpty: boolean
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onAddChild: (id: string) => void
  onDelete: (id: string) => void
  onLife: () => void
  onToggleLife: () => void
}

/** The Life root's mark — a calm sage half-disc, drawn (not a glyph). */
function LifeMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden className="flex-shrink-0">
      <circle cx="7" cy="7" r="6" fill="none" stroke="var(--press-accent)" strokeWidth="1.2" />
      <path d="M7 1a6 6 0 0 1 0 12z" fill="var(--press-accent)" opacity="0.85" />
    </svg>
  )
}

export function RailView({
  tree,
  selectedId,
  pathIds = NO_PATH,
  expanded,
  lifeExpanded,
  busyId,
  isLoading,
  isEmpty,
  onSelect,
  onToggle,
  onAddChild,
  onDelete,
  onLife,
  onToggleLife,
}: RailViewProps) {
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const setRowRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) rowRefs.current.set(id, el)
      else rowRefs.current.delete(id)
    },
    []
  )

  // The ONE flattened list — Life first — driving render, ARIA coordinates,
  // and keyboard order alike (they can't drift; see lib/rail/tree.ts).
  const flat = useMemo(
    () => flattenVisible(tree, expanded, lifeExpanded),
    [tree, expanded, lifeExpanded]
  )
  const visibleIds = useMemo(() => new Set(flat.map((f) => f.id)), [flat])

  // ── Roving focus (view-owned: focus is a view concern) ─────────────────────
  const [focusedId, setFocusedId] = useState<string | null>(null)

  // The effective roving tab stop: the focused row if it's still visible, else
  // the selection, else the Life root — always exactly one tabbable row.
  const rovingId =
    focusedId && visibleIds.has(focusedId)
      ? focusedId
      : selectedId && visibleIds.has(selectedId)
        ? selectedId
        : LIFE_ID

  // Reflect a keyboard-driven focus change into real DOM focus so arrow keys
  // keep firing on the newly focused row.
  useEffect(() => {
    if (focusedId && visibleIds.has(focusedId)) rowRefs.current.get(focusedId)?.focus()
  }, [focusedId, visibleIds])

  // When the focused row vanishes (deleted, or hidden by an ancestor collapse),
  // keep focus in the tree like VS Code: fall to the nearest surviving neighbor
  // in the previous order (else the nearest before it, else Life). Only re-grab
  // DOM focus if the removal actually dropped it to <body> — never steal focus
  // the user has moved elsewhere (e.g. into the editor).
  const prevOrderRef = useRef<string[]>([])
  useEffect(() => {
    const prev = prevOrderRef.current
    prevOrderRef.current = flat.map((f) => f.id)
    if (!focusedId || visibleIds.has(focusedId)) return
    const fallback = focusFallback(prev, focusedId, visibleIds)
    setFocusedId(fallback)
    if (document.activeElement === document.body) rowRefs.current.get(fallback)?.focus()
  }, [flat, focusedId, visibleIds])

  // ── Keyboard machine (pure rules; commands dispatched to the callbacks) ────
  function handleKeyDown(id: string, e: KeyboardEvent<HTMLDivElement>) {
    const cmd = treeKeyCommand(e.key, id, flat, { expanded, lifeExpanded })
    if (!cmd) return
    e.preventDefault()
    switch (cmd.kind) {
      case 'focus':
        setFocusedId(cmd.id)
        break
      case 'expand':
      case 'collapse':
        if (cmd.id === LIFE_ID) onToggleLife()
        else onToggle(cmd.id)
        break
      case 'open':
        if (cmd.id === LIFE_ID) onLife()
        else onSelect(cmd.id)
        break
      case 'delete':
        onDelete(cmd.id)
        break
      case 'addChild':
        onAddChild(cmd.id)
        break
    }
  }

  const renderRow = ({ id, node, depth, isFolder, posInSet, setSize }: FlatRow) =>
    id === LIFE_ID ? (
      <TreeRow
        ref={setRowRef(id)}
        key={id}
        id={id}
        title="Life"
        depth={0}
        isFolder
        isExpanded={lifeExpanded}
        isSelected={selectedId === null}
        isOnPath={false}
        isFocused={rovingId === id}
        isBusy={false}
        isRoot
        posInSet={posInSet}
        setSize={setSize}
        leading={<LifeMark />}
        trailing={
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-press-faint pr-1 select-none">
            all
          </span>
        }
        onSelect={onLife}
        onToggle={onToggleLife}
        onFocus={setFocusedId}
        onKeyDown={handleKeyDown}
      />
    ) : (
      <TreeRow
        ref={setRowRef(id)}
        key={id}
        id={id}
        title={node.title}
        depth={depth}
        isFolder={isFolder}
        isExpanded={expanded.has(id)}
        isSelected={id === selectedId}
        isOnPath={id !== selectedId && pathIds.has(id)}
        isFocused={rovingId === id}
        isBusy={id === busyId}
        isArea={node.type === 'area'}
        posInSet={posInSet}
        setSize={setSize}
        accent={node.type === 'area' ? pageAccent(id) : undefined}
        // ticket-41: a row revealed on expand (any non-top-level row) settles in
        // rather than popping. Keyed by id, so only newly-mounted rows animate.
        settleOnMount={depth > 0}
        onSelect={onSelect}
        onToggle={onToggle}
        onAddChild={onAddChild}
        onDelete={onDelete}
        onFocus={setFocusedId}
        onKeyDown={handleKeyDown}
      />
    )

  return (
    <aside className="w-[252px] flex-shrink-0 h-full overflow-y-auto px-4 pb-8 font-sans">
      {/* Pinned to the top-left: the wordmark stays put while the tree scrolls
          beneath it (sticky, with the paper bg so rows pass under cleanly). */}
      <div className="sticky top-0 z-10 flex items-baseline gap-2.5 bg-background px-2 pt-6 pb-4">
        <span className="font-display text-[26px] text-foreground">Pond</span>
      </div>

      <div role="tree" aria-label="Workspace" aria-multiselectable={false}>
        {flat.map(renderRow)}
      </div>

      {/* Status text lives OUTSIDE the tree — role="tree" only allows treeitem
          children (WAI-ARIA); a <p> inside it would be an illegal child. */}
      {isLoading && (
        <p className="px-2.5 py-2 text-xs text-press-faint" role="status">
          Loading…
        </p>
      )}
      {!isLoading && isEmpty && (
        <p className="px-2.5 py-2 text-xs text-press-faint" role="status">
          Setting up your workspace…
        </p>
      )}
    </aside>
  )
}

// ── Container ────────────────────────────────────────────────────────────────

export function Rail() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const workspace = useWorkspace()
  const seededRef = useRef(false)
  // Area folders start collapsed and open per session; Life starts expanded so
  // the tree is visible on load (collapsing Life is the "collapse everything").
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [lifeExpanded, setLifeExpanded] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  // The subtree-delete confirm (blast-radius modal); null when closed.
  const [confirmTarget, setConfirmTarget] = useState<RailNode | null>(null)
  const { stageDeletion, notify } = useDeletionUndo()

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['pages', workspace],
    queryFn: () => fetchPages(workspace),
  })

  const tree = useMemo(() => buildTree(pages), [pages])
  const nodeById = useMemo(() => {
    const map = new Map<string, RailNode>()
    const walk = (nodes: RailNode[]) =>
      nodes.forEach((n) => {
        map.set(n.id, n)
        walk(n.children)
      })
    walk(tree)
    return map
  }, [tree])
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
  // the path to the current node (and Life itself) so it's revealed and its
  // ancestors highlight. We reveal a given selection exactly once (tracked by
  // ref) so a manual re-collapse afterward isn't fought.
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
    // The two reveals below respond to an external navigation (URL ?nodeId, incl.
    // chat/＋ creation) — open Life and every ancestor folder so the current node
    // shows. Guarded to fire once per selection; not a derived-state computation.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLifeExpanded(true)
    if (ancestors.length === 0) return
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const id of ancestors) next.add(id)
      return next
    })
    /* eslint-enable react-hooks/set-state-in-effect */
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

      const seedFn = workspace === 'sandbox' ? 'seed_sandbox_pages' : 'seed_default_pages'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)(seedFn, { p_user_id: user.id })
      queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
    }

    seed()
  }, [isLoading, pages.length, queryClient, workspace])

  const basePath = workspaceBasePath(workspace)

  function navigateTo(node: { id: string; type: string; title: string }) {
    router.push(workspaceUrl(node, basePath))
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
    await queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
    return result
  }

  async function handleAddChild(id: string) {
    setBusyId(id)
    try {
      const created = await withUser((sb, uid) =>
        createPage(sb, uid, { parentId: id, type: 'page', title: 'Untitled', workspace })
      )
      // ensure the parent folder is open so the new child is visible
      setExpanded((prev) => new Set(prev).add(id))
      if (created) navigateTo({ id: created.id, type: 'page', title: 'Untitled' })
    } finally {
      setBusyId(null)
    }
  }

  /** Put a single optimistically-removed row back (surgical) and reconcile. */
  function restoreDeletedRow(row: PageRow | undefined) {
    if (row) {
      queryClient.setQueryData<PageRow[]>(['pages', workspace], (rows) =>
        rows ? restoreRow(rows, row) : rows
      )
    }
    queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
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
        router.push(basePath)
      }
    } catch {
      restoreDeletedRow(removedRow)
      notify(`Couldn't delete "${node.title || 'Untitled'}"`)
    }
  }

  function handleDelete(id: string) {
    const node = nodeById.get(id)
    if (!node) return
    // A subtree delete is irreversible and heavy — gate it behind the styled
    // blast-radius confirm. A leaf goes straight to an optimistic-remove + undo
    // toast (deferred commit), no modal.
    if (needsConfirm(countDescendants(node))) {
      setConfirmTarget(node)
      return
    }

    const removedRow = pages.find((r) => r.id === node.id)
    queryClient.setQueryData<PageRow[]>(['pages', workspace], (rows) =>
      removeRow(rows ?? [], node.id)
    )
    if (selectedNodeId === node.id) router.push(basePath)

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

  /** Life's caret: collapse-all. Collapsing also clears open folders, so
   *  re-opening returns to the resting top level (not the previous open set). */
  function handleToggleLife() {
    setLifeExpanded((prev) => {
      if (prev) setExpanded(new Set())
      return !prev
    })
  }

  /** Open a page — strictly navigation; expansion belongs to the caret alone. */
  function handleSelect(id: string) {
    const node = nodeById.get(id)
    if (node) navigateTo(node)
  }

  const confirmCount = confirmTarget ? countDescendants(confirmTarget) : 0

  return (
    <>
      <RailView
        tree={tree}
        selectedId={selectedNodeId}
        pathIds={pathIds}
        expanded={expanded}
        lifeExpanded={lifeExpanded}
        busyId={busyId}
        isLoading={isLoading}
        isEmpty={!isLoading && pages.length === 0}
        onSelect={handleSelect}
        onToggle={handleToggle}
        onAddChild={handleAddChild}
        onDelete={handleDelete}
        onLife={() => router.push(basePath)}
        onToggleLife={handleToggleLife}
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
