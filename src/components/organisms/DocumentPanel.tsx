'use client'

/**
 * The main-panel page editor. Reads the open page id from the URL (?nodeId=),
 * loads the page, and lets you edit its title and content blocks. Everything is
 * a page, so this is the editor for areas, sub-pages, projects — all of them.
 *
 * Saves are debounced and write the whole block array (per the spec, blocks are
 * never partially persisted). Renaming refreshes the sidebar via the ['pages']
 * query. Re-embedding on save is wired in Slice 6 alongside the retrieval switch.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getPage, updateTitle } from '@/lib/pages/client'
import { commitBlocks } from '@/lib/pages/commit'
import { ModuleView } from '@/lib/modules/renderers'
import { SiblingBlocksProvider } from '@/lib/modules/sibling-context'
import { blockDomId, scrollToBlock } from '@/lib/modules/block-dom'
import {
  AreaOverviewPanel,
  LifeOverviewPanel,
  useOpenCard,
} from '@/components/organisms/OverviewSurface'
import { ChildrenGrid } from '@/components/molecules/ChildrenGrid'
import { childCards } from '@/lib/pages/overview'
import { fetchPages } from '@/lib/pages/tree'
import type { Block } from '@/lib/documents/types'

export function DocumentPanel() {
  const searchParams = useSearchParams()
  const nodeId = searchParams.get('nodeId')
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()

  const { data: page, isLoading } = useQuery({
    queryKey: ['page', nodeId],
    queryFn: () => (nodeId ? getPage(supabase, nodeId) : Promise.resolve(null)),
    enabled: !!nodeId,
  })

  // The flat page tree — the same cache the rail and overview surfaces read — so
  // this node's own children can be shown alongside its blocks (ticket-22).
  // `new Date()` is captured per rows/nodeId change, so the cards' "updated Xd
  // ago" captions refresh with the data rather than the wall clock — the same
  // coarse recency the overview surfaces accept (AreaOverviewPanel does likewise).
  const { data: rows = [] } = useQuery({ queryKey: ['pages'], queryFn: fetchPages })
  const openCard = useOpenCard()
  const cards = useMemo(() => (nodeId ? childCards(rows, nodeId, new Date()) : []), [rows, nodeId])

  const [title, setTitle] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [saved, setSaved] = useState(true)
  // Which page the local title/blocks state was seeded from. State (not the ref)
  // so render can branch on it; the ref below serves the event-handler save path.
  // Never reset on navigate-away: it can only ever match a page whose local state
  // came from that same page, so a stale value is harmless (re-seeded on return).
  const [seededId, setSeededId] = useState<string | null>(null)
  const loadedId = useRef<string | null>(null)
  const serverSig = useRef<string>('') // signature of the server blocks we've reconciled
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seed local editable state when a different page loads. On a *same-page*
  // refetch we normally leave local edits alone — but when there are no unsaved
  // edits (`saved`) and the server blocks differ from ours, adopt them: that
  // difference means an external write (e.g. an accepted AI diff-card proposal),
  // since our own saves keep the ['page'] cache in sync (see scheduleSave).
  //
  // KNOWN LIMITATION (ticket-10, accepted this slice): if the panel has UNSAVED
  // local edits (`!saved`) when an AI proposal is accepted, that external write is
  // NOT adopted here and will be overwritten by the pending debounced save — the
  // accepted edit is effectively dropped. We guard on `saved` deliberately so an
  // external write never clobbers in-flight keystrokes. The window is narrow
  // (type + Accept within the 600ms debounce) and the app is single-user; a proper
  // block-level merge is deferred. Accept an AI edit with a settled ("Saved") panel.
  useEffect(() => {
    if (page && page.id !== loadedId.current) {
      loadedId.current = page.id
      serverSig.current = JSON.stringify(page.blocks)
      setSeededId(page.id)
      setTitle(page.title)
      setBlocks(page.blocks)
      setSaved(true)
    } else if (page && page.id === loadedId.current && saved) {
      // Same page, no unsaved edits: adopt server blocks only when they changed
      // vs. what we last reconciled — i.e. an external write (accepted proposal).
      const sig = JSON.stringify(page.blocks)
      if (sig !== serverSig.current) {
        serverSig.current = sig
        setBlocks(page.blocks)
      }
    }
    if (!nodeId) loadedId.current = null
  }, [page, nodeId, saved])

  // Until the seeding effect above has run for THIS page, the local title/blocks
  // state still holds the previous node's values (effects run after paint). Every
  // read below — the type-switch branch included — goes through these derived
  // values so the correct surface and content paint on the very first frame: no
  // overview→editor flash on an area with blocks, no one-frame leak of the
  // previous page's state on node change (ticket-22 review).
  const seeded = !!page && page.id === seededId
  const viewBlocks: Block[] = seeded ? blocks : (page?.blocks ?? [])
  const viewTitle = seeded ? title : (page?.title ?? '')

  function scheduleSave(nextTitle: string, nextBlocks: Block[]) {
    const id = loadedId.current
    if (!id) return
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      // Title first, then blocks + sidebar-refresh + re-embed via the shared
      // commitBlocks (same tail the accepted-AI-edit path uses). Sequential so
      // the ['pages'] invalidation inside commitBlocks lands after the rename,
      // keeping the sidebar rename immediate.
      await updateTitle(supabase, id, nextTitle)
      await commitBlocks(supabase, queryClient, id, nextBlocks)
      // keep the ['page'] cache in step with what we just saved, so the
      // same-page adopt above only fires for genuinely external writes.
      queryClient.setQueryData(['page', id], (prev: typeof page) =>
        prev ? { ...prev, title: nextTitle, blocks: nextBlocks } : prev
      )
      setSaved(true)
    }, 600)
  }

  function onTitle(value: string) {
    setTitle(value)
    scheduleSave(value, viewBlocks)
  }

  // Apply an in-editor block change: update local state and schedule the
  // debounced persist. (Named to avoid colliding with the DB-level commitBlocks.)
  function commitLocalEdit(next: Block[]) {
    setBlocks(next)
    scheduleSave(viewTitle, next)
  }

  function setBlockAt(index: number, next: Block) {
    commitLocalEdit(viewBlocks.map((b, i) => (i === index ? next : b)))
  }

  function removeBlockAt(index: number) {
    commitLocalEdit(viewBlocks.filter((_, i) => i !== index))
  }

  function addTextBlock() {
    commitLocalEdit([...viewBlocks, { id: crypto.randomUUID(), type: 'text', content: '' }])
  }

  // ── Root: the Life overview owns the panel (no more empty state) ──────────
  if (!nodeId) {
    return <LifeOverviewPanel />
  }
  if (isLoading || !page) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-press-faint">
        Loading…
      </div>
    )
  }

  // ── Type switch (ticket-22) ───────────────────────────────────────────────
  // "Everything is a page": a node may hold BOTH its own blocks AND children.
  //   • A pure area/container (no blocks) keeps the calm Press overview — its
  //     focal treatment earns its place. A "+ Add content" affordance lets it
  //     gain blocks, which flips it to the composite below.
  //   • Any node WITH blocks (or a non-area with children) shows its content in
  //     the full editor, with the "Everything within" children grid *below* it —
  //     so an accepted edit is immediately visible, and no page can ever hide
  //     its own content behind a folder view.
  if (page.type === 'area' && viewBlocks.length === 0) {
    return <AreaOverviewPanel areaId={page.id} title={page.title} onAddContent={addTextBlock} />
  }

  // ── Editor (+ children grid when the node has sub-pages) ──────────────────────
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between gap-3 mb-4">
          <input
            className="flex-1 text-2xl font-semibold text-foreground outline-none bg-transparent placeholder:text-press-faint"
            value={viewTitle}
            onChange={(e) => onTitle(e.target.value)}
            placeholder="Untitled"
            aria-label="Page title"
          />
          <span className="text-xs text-muted-foreground flex-shrink-0" aria-live="polite">
            {saved ? 'Saved' : 'Saving…'}
          </span>
        </div>

        {/* Provide sibling-block state so bound metrics derive live and their `→`
            can scroll to source (ticket-23). Keyed off the live `viewBlocks`, so a
            checklist toggle re-derives every metric in the same render. */}
        <SiblingBlocksProvider value={{ blocks: viewBlocks, scrollToBlock }}>
          <div className="space-y-3">
            {viewBlocks.map((block, i) => (
              <BlockEditor
                key={block.id}
                block={block}
                onChange={(next) => setBlockAt(i, next)}
                onRemove={() => removeBlockAt(i)}
              />
            ))}
          </div>
        </SiblingBlocksProvider>

        <button
          className="mt-4 text-sm text-muted-foreground hover:text-foreground"
          onClick={addTextBlock}
        >
          + Add text
        </button>

        {/* Content above, children below — the page's own blocks stay primary; its
            sub-pages read as a quiet index beneath them (ticket-22). Collapses to
            nothing when the node has no children. */}
        {cards.length > 0 && (
          <div className="mt-12 border-t border-press-hair pt-6">
            <ChildrenGrid cards={cards} onOpenCard={openCard} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Per-block editor ───────────────────────────────────────────────────────────

/**
 * One block row: delete affordance + the module's own view, editable. Rendering goes
 * through the ModuleView registry — the panel has no per-type branches, so every
 * registered module (and any future one) is editable here with zero edits. Views
 * that fold editing in (text/todo/table) emit full-state onChange into the
 * debounced save; display-only views (metric, metric-ring) ignore `editable`.
 */
function BlockEditor({
  block,
  onChange,
  onRemove,
}: {
  block: Block
  onChange: (next: Block) => void
  onRemove: () => void
}) {
  return (
    <div className="group relative" id={blockDomId(block.id)}>
      <button
        className="absolute -left-5 top-1 opacity-0 group-hover:opacity-100 text-press-faint hover:text-destructive text-sm"
        title="Delete block"
        aria-label="Delete block"
        onClick={onRemove}
      >
        ×
      </button>
      <ModuleView
        type={block.type}
        data={block}
        editable
        onChange={(next) => onChange(next as Block)}
      />
    </div>
  )
}
