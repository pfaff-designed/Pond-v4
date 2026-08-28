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
 * split: the caret toggles expand, the label opens.
 *
 * Life is the workspace root, NOT a row in `pages`: it can't be renamed or
 * deleted, and its caret is a collapse-all / expand-all for the whole tree.
 * The data source is unchanged — the `['pages']` query + parent_id tree
 * (ticket-25's reveal, ticket-27's delete, ticket-26's create all preserved) —
 * this is a view-layer restructure.
 *
 * Split for Storybook: <RailView> is presentational (state + mutations raised
 * as props); <Rail> is the container that wires Supabase + React Query.
 *
 * Keyboard (WAI-ARIA APG tree): a single roving tab stop; ↑/↓ move focus
 * through visible rows, → expands (or steps into the first child), ← collapses
 * (or steps out to the parent), Enter/Space open the focused page, Home/End
 * jump to the first/last visible row.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
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
import { TreeRow } from '@/components/molecules/TreeRow'

// ── Tree types + helpers ─────────────────────────────────────────────────────

/** The synthetic id of the Life root — never a real `pages` row. */
export const LIFE_ID = '__life__'

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

/** A node is a folder if it's an area or has children (composite pages count). */
export function isFolderNode(node: RailNode): boolean {
  return node.type === 'area' || node.children.length > 0
}

/** A flattened, in-order view of the tree — only rows currently visible given
 *  `expanded`. Drives keyboard navigation and the roving tab stop. */
export interface FlatRow {
  node: RailNode
  depth: number
  isFolder: boolean
}

export function flattenVisible(
  roots: RailNode[],
  expanded: ReadonlySet<string>,
  lifeExpanded: boolean
): FlatRow[] {
  const out: FlatRow[] = []
  const walk = (nodes: RailNode[], depth: number) => {
    for (const node of nodes) {
      const folder = isFolderNode(node)
      out.push({ node, depth, isFolder: folder })
      if (folder && expanded.has(node.id)) walk(node.children, depth + 1)
    }
  }
  // The areas sit at depth 1 under the Life root; shown only when Life is open.
  if (lifeExpanded) walk(roots, 1)
  return out
}

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
  /** The single roving tab stop; null → default to selection, then Life root. */
  focusedId: string | null
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onAddChild: (id: string) => void
  onDelete: (id: string) => void
  onLife: () => void
  onToggleLife: () => void
  onFocusRow: (id: string) => void
  onKeyDown: (id: string, e: KeyboardEvent<HTMLDivElement>) => void
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
  focusedId,
  onSelect,
  onToggle,
  onAddChild,
  onDelete,
  onLife,
  onToggleLife,
  onFocusRow,
  onKeyDown,
}: RailViewProps) {
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const setRowRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) rowRefs.current.set(id, el)
      else rowRefs.current.delete(id)
    },
    []
  )

  const flat = useMemo(
    () => flattenVisible(tree, expanded, lifeExpanded),
    [tree, expanded, lifeExpanded]
  )

  // The effective roving tab stop: the focused row if it's still visible, else
  // the selection, else the Life root — always exactly one tabbable row.
  const visibleIds = useMemo(() => new Set(flat.map((f) => f.node.id)), [flat])
  const rovingId =
    focusedId && (focusedId === LIFE_ID || visibleIds.has(focusedId))
      ? focusedId
      : selectedId && visibleIds.has(selectedId)
        ? selectedId
        : LIFE_ID

  // Reflect a keyboard-driven focus change into real DOM focus so arrow keys
  // keep firing on the newly focused row.
  useEffect(() => {
    if (focusedId) rowRefs.current.get(focusedId)?.focus()
  }, [focusedId])

  return (
    <aside className="w-[252px] flex-shrink-0 h-full overflow-y-auto px-4 pt-6 pb-8 font-sans">
      <div className="flex items-baseline gap-2.5 px-2 pb-6">
        <span className="font-display text-[26px] text-foreground">Pond</span>
      </div>

      <div role="tree" aria-label="Workspace" aria-multiselectable={false}>
        {/* Life — the root folder of the whole tree (depth 0). Caret is a
            collapse-all / expand-all; the label opens the Life overview. */}
        <TreeRow
          ref={setRowRef(LIFE_ID)}
          id={LIFE_ID}
          title="Life"
          depth={0}
          isFolder
          isExpanded={lifeExpanded}
          isSelected={selectedId === null}
          isOnPath={false}
          isFocused={rovingId === LIFE_ID}
          isBusy={false}
          isRoot
          leading={<LifeMark />}
          trailing={
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-press-faint pr-1 select-none">
              all
            </span>
          }
          onSelect={onLife}
          onToggle={onToggleLife}
          onAddChild={() => {}}
          onDelete={() => {}}
          onFocus={onFocusRow}
          onKeyDown={onKeyDown}
        />

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

        {lifeExpanded &&
          flat.map(({ node, depth, isFolder }) => (
            <TreeRow
              ref={setRowRef(node.id)}
              key={node.id}
              id={node.id}
              title={node.title}
              depth={depth}
              isFolder={isFolder}
              isExpanded={expanded.has(node.id)}
              isSelected={node.id === selectedId}
              isOnPath={node.id !== selectedId && pathIds.has(node.id)}
              isFocused={rovingId === node.id}
              isBusy={node.id === busyId}
              accent={node.type === 'area' ? pageAccent(node.id) : undefined}
              onSelect={onSelect}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onDelete={onDelete}
              onFocus={onFocusRow}
              onKeyDown={onKeyDown}
            />
          ))}
      </div>
    </aside>
  )
}

// ── Container ────────────────────────────────────────────────────────────────

export function Rail() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const seededRef = useRef(false)
  // Area folders start collapsed and open per session; Life starts expanded so
  // the tree is visible on load (collapsing Life is the "collapse everything").
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [lifeExpanded, setLifeExpanded] = useState(true)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // The subtree-delete confirm (blast-radius modal); null when closed.
  const [confirmTarget, setConfirmTarget] = useState<RailNode | null>(null)
  const { stageDeletion, notify } = useDeletionUndo()

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: fetchPages,
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

  async function handleAddChild(id: string) {
    setBusyId(id)
    try {
      const created = await withUser((sb, uid) =>
        createPage(sb, uid, { parentId: id, type: 'page', title: 'Untitled' })
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

  /** Life's caret: collapse-all (close every area folder) / expand-all toggle. */
  function handleToggleLife() {
    setLifeExpanded((prev) => {
      // Collapsing Life also clears open folders so re-opening starts clean at
      // the top level (the resting state).
      if (prev) setExpanded(new Set())
      return !prev
    })
  }

  /** Opening a page from the rail also opens its folder (the proto's openArea). */
  function handleSelect(id: string) {
    const node = nodeById.get(id)
    if (!node) return
    if (isFolderNode(node)) setExpanded((prev) => new Set(prev).add(id))
    navigateTo(node)
  }

  // ── Keyboard navigation (WAI-ARIA APG tree) ─────────────────────────────────
  // ↑/↓ move focus through visible rows; → expands or steps into the first
  // child; ← collapses or steps out to the parent; Enter/Space open; Home/End
  // jump to the first/last visible row. The Life root is the first row.
  const flat = useMemo(
    () => flattenVisible(tree, expanded, lifeExpanded),
    [tree, expanded, lifeExpanded]
  )
  const order = useMemo(() => [LIFE_ID, ...flat.map((f) => f.node.id)], [flat])

  function handleKeyDown(id: string, e: KeyboardEvent<HTMLDivElement>) {
    const idx = order.indexOf(id)
    const move = (to: number) => {
      const clamped = Math.max(0, Math.min(order.length - 1, to))
      setFocusedId(order[clamped])
    }
    const node = id === LIFE_ID ? null : nodeById.get(id)
    const folder = id === LIFE_ID ? true : node ? isFolderNode(node) : false
    const isOpen = id === LIFE_ID ? lifeExpanded : expanded.has(id)

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        move(idx + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(idx - 1)
        break
      case 'Home':
        e.preventDefault()
        move(0)
        break
      case 'End':
        e.preventDefault()
        move(order.length - 1)
        break
      case 'ArrowRight':
        e.preventDefault()
        if (folder && !isOpen) {
          if (id === LIFE_ID) setLifeExpanded(true)
          else setExpanded((p) => new Set(p).add(id))
        } else if (folder && isOpen) {
          move(idx + 1) // step into the first child
        }
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (folder && isOpen) {
          if (id === LIFE_ID) handleToggleLife()
          else
            setExpanded((p) => {
              const n = new Set(p)
              n.delete(id)
              return n
            })
        } else {
          // step out to the parent (Life is the parent of top-level areas)
          const parentId = node?.parentId ?? (id === LIFE_ID ? null : LIFE_ID)
          if (parentId) setFocusedId(parentId)
        }
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (id === LIFE_ID) router.push('/workspace')
        else handleSelect(id)
        break
    }
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
        focusedId={focusedId}
        onSelect={handleSelect}
        onToggle={handleToggle}
        onAddChild={handleAddChild}
        onDelete={handleDelete}
        onLife={() => router.push('/workspace')}
        onToggleLife={handleToggleLife}
        onFocusRow={setFocusedId}
        onKeyDown={handleKeyDown}
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
