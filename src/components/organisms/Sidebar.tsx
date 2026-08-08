'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { createPage, deletePage } from '@/lib/pages/client'
import { PageTreeItem, type PageNode } from '@/components/molecules/PageTreeItem'

interface PageRow {
  id: string
  parent_id: string | null
  type: string
  title: string
  order: number
}

async function fetchPages(): Promise<PageRow[]> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('pages')
    .select('id, parent_id, type, title, "order"')
    .eq('user_id', user.id)
    .order('order')

  if (error) throw error
  return (data ?? []) as PageRow[]
}

/** Build a nested tree from the flat page list, sorted by order then title. */
function buildTree(rows: PageRow[]): PageNode[] {
  const byId = new Map<string, PageNode>()
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
  const roots: PageNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sortRec = (arr: PageNode[]) => {
    arr.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    arr.forEach((n) => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

export function Sidebar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const seededRef = useRef(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: fetchPages,
  })

  const tree = useMemo(() => buildTree(pages), [pages])
  const selectedNodeId = searchParams.get('nodeId')

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
    const params = new URLSearchParams({
      nodeType: node.type,
      nodeId: node.id,
      nodeName: node.title,
    })
    router.push(`/workspace?${params.toString()}`)
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

  async function handleCreateTop() {
    setBusyId('__new__')
    try {
      const created = await withUser((sb, uid) =>
        createPage(sb, uid, { parentId: null, type: 'area', title: 'Untitled' })
      )
      if (created) navigateTo({ id: created.id, type: 'area', title: 'Untitled' })
    } finally {
      setBusyId(null)
    }
  }

  async function handleAddChild(node: PageNode) {
    setBusyId(node.id)
    try {
      const created = await withUser((sb, uid) =>
        createPage(sb, uid, { parentId: node.id, type: 'page', title: 'Untitled' })
      )
      // ensure the parent is expanded so the new child is visible
      setCollapsed((prev) => {
        const next = new Set(prev)
        next.delete(node.id)
        return next
      })
      if (created) navigateTo({ id: created.id, type: 'page', title: 'Untitled' })
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(node: PageNode) {
    const count = countDescendants(node)
    const suffix = count > 0 ? ` and ${count} item${count === 1 ? '' : 's'} inside it` : ''
    if (!window.confirm(`Delete "${node.title || 'Untitled'}"${suffix}? This cannot be undone.`))
      return

    setBusyId(node.id)
    try {
      await withUser(async (sb) => {
        await deletePage(sb, node.id)
      })
      // if the open page was in the deleted subtree, clear the workspace
      if (selectedNodeId && subtreeIds(node).has(selectedNodeId)) {
        router.push('/workspace')
      }
    } finally {
      setBusyId(null)
    }
  }

  function handleToggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <aside className="w-64 flex-shrink-0 border-r border-zinc-200 flex flex-col h-full bg-zinc-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
        <span className="text-sm font-semibold text-zinc-800">Pond</span>
        <button
          className="text-zinc-400 hover:text-zinc-700 text-lg leading-none disabled:opacity-40"
          title="New page"
          aria-label="New page"
          disabled={busyId !== null}
          onClick={handleCreateTop}
        >
          +
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {isLoading && <p className="px-4 text-xs text-zinc-400">Loading…</p>}
        {!isLoading && pages.length === 0 && (
          <p className="px-4 text-xs text-zinc-400">Setting up your workspace…</p>
        )}
        {tree.map((node) => (
          <PageTreeItem
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedNodeId}
            collapsed={collapsed}
            busyId={busyId}
            onSelect={navigateTo}
            onToggle={handleToggle}
            onAddChild={handleAddChild}
            onDelete={handleDelete}
          />
        ))}
      </nav>
    </aside>
  )
}

// ── tree helpers ─────────────────────────────────────────────────────────────

function countDescendants(node: PageNode): number {
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0)
}

function subtreeIds(node: PageNode): Set<string> {
  const ids = new Set<string>([node.id])
  for (const c of node.children) for (const id of subtreeIds(c)) ids.add(id)
  return ids
}
