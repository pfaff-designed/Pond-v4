'use client'

/**
 * The main-panel page editor. Reads the open page id from the URL (?nodeId=),
 * loads the page, and lets you edit its title and content blocks. Everything is
 * a page, so this is the editor for areas, sub-pages, projects — all of them.
 *
 * Saves are debounced and write the whole block array (per the spec, blocks are
 * never partially persisted). Renaming refreshes the sidebar via the ['pages']
 * query. Re-embedding on save is wired in Slice 6 alongside the retrieval switch.
 *
 * Manual block authoring (ticket-37): the user is now an equal author to the AI.
 * A '/' in an empty text block (or the quiet + between blocks) opens the block
 * palette — the same module vocabulary the AI composes from, derived live from
 * the registry. Blocks reorder by drag handle or ⌥↑/⌥↓ on a focused block.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  useNavigateCrumb,
  useOpenCard,
} from '@/components/organisms/OverviewSurface'
import { ChildrenGrid } from '@/components/molecules/ChildrenGrid'
import { Breadcrumb } from '@/components/molecules/Breadcrumb'
import { childCards, ancestorPath } from '@/lib/pages/overview'
import { fetchPages } from '@/lib/pages/tree'
import { useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { moduleDescriptors } from '@/lib/modules/registry'
import { SlashMenu, type SlashMenuItem } from '@/components/molecules/SlashMenu'
import { cn } from '@/lib/utils'
import type { Block } from '@/lib/documents/types'

/** A short, human label for a block in the undo toast ("Deleted text block"). */
function blockLabel(block: Block): string {
  return `Deleted ${block.type} block`
}

// ── Block palette derived from the registry (ticket-37) ───────────────────────
// One vocabulary with the AI's catalog: the palette lists every registered
// module's type + when-to-use description, read from moduleDescriptors at load.
// Excludes 'page' (structural, not a content block a user drops into a page).
// A module added by a parallel ticket (t35 kanban, t36 charts) appears here at
// merge with zero edits — the registry is the single source, never a hardcoded
// list.
const EXCLUDED_FROM_PALETTE = new Set(['page'])

const paletteItems: SlashMenuItem[] = Object.values(moduleDescriptors)
  .filter((d) => !EXCLUDED_FROM_PALETTE.has(d.type))
  .map((d) => ({
    id: d.type,
    name: d.type.charAt(0).toUpperCase() + d.type.slice(1).replace(/-/g, ' '),
    description: d.description,
  }))

// ── Empty-block factories (ticket-37) ─────────────────────────────────────────
// The manual-authoring empty state per module: todo = one blank item, table =
// 2×2, metric = manual 0. Returns null for a type with no local empty state
// (e.g. a module registered by a not-yet-merged branch) — callers must guard
// null, so an unknown palette pick degrades to a no-op instead of a crash.
function emptyBlockForType(type: string): Block | null {
  const id = crypto.randomUUID()
  switch (type) {
    case 'text':
      return { id, type: 'text', content: '' }
    case 'todo':
      return {
        id,
        type: 'todo',
        items: [{ id: crypto.randomUUID(), label: '', checked: false }],
      }
    case 'table':
      return {
        id,
        type: 'table',
        columns: ['Column 1', 'Column 2'],
        rows: [
          { id: crypto.randomUUID(), cells: ['', ''] },
          { id: crypto.randomUUID(), cells: ['', ''] },
        ],
      }
    case 'metric':
      return { id, type: 'metric', label: '', value: 0 }
    case 'metric-ring':
      return { id, type: 'metric-ring', label: '', pct: 0 }
    default:
      return null
  }
}

// ── InsertBetween affordance (ticket-37) ──────────────────────────────────────
// A quiet separator between blocks: hover reveals a '+' that opens the block
// palette and inserts THERE (insert-between, not append). The hairline gives
// the hover target an honest footprint without adding visual weight at rest.
function InsertBetween({ onInsert }: { onInsert: (item: SlashMenuItem) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="group relative h-4 flex items-center" role="separator">
      <button
        className="absolute left-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-press-muted hover:text-press-accent text-sm w-4 h-4 flex items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-press-accent"
        aria-label="Insert block"
        onClick={() => setOpen(true)}
      >
        +
      </button>
      <span
        aria-hidden
        className="w-full h-px bg-press-hair opacity-0 group-hover:opacity-50 transition-opacity"
      />
      {open && (
        <SlashMenu
          items={paletteItems}
          onSelect={(item) => {
            onInsert(item)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
          className="absolute left-0 top-full z-10 mt-1 w-72"
        />
      )}
    </div>
  )
}

export function DocumentPanel() {
  const searchParams = useSearchParams()
  const nodeId = searchParams.get('nodeId')
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const { stageDeletion, flushScope } = useDeletionUndo()

  // The panel is layout-level, so it does NOT unmount when ?nodeId changes.
  // Flush pending block toasts when leaving a page — a surviving toast's Undo
  // would otherwise re-insert the old page's block into the newly-opened page.
  useEffect(() => {
    return () => {
      flushScope('block')
    }
  }, [nodeId, flushScope])

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
  const navigateCrumb = useNavigateCrumb()
  const cards = useMemo(() => (nodeId ? childCards(rows, nodeId, new Date()) : []), [rows, nodeId])
  // The ancestor trail for the editor header — the title input stays the tail,
  // so the breadcrumb shows only the path down to (not including) this node.
  const crumbs = useMemo(() => (nodeId ? ancestorPath(rows, nodeId) : []), [rows, nodeId])

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

  // Which block index has the '/' palette open (null = closed). Index, not block
  // id: the palette replaces the text block AT that position (ticket-37).
  const [slashMenuOpenAt, setSlashMenuOpenAt] = useState<number | null>(null)

  // Which block index is mid-drag (null = no drag). Drives the dragged block's
  // ghost opacity; cleared on drop OR dragend so a cancelled drag never leaves
  // a block ghosted.
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)

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
    // Optimistically drop the block (this schedules the debounced save, so the
    // removal persists) and offer an undo toast that re-inserts it at its
    // original index. The write isn't held back — instead undo re-adds the block
    // and re-saves; the grace window is the user's chance to catch a misclick.
    const removed = viewBlocks[index]
    if (!removed) return
    commitLocalEdit(viewBlocks.filter((_, i) => i !== index))
    stageDeletion({
      message: blockLabel(removed),
      // The removal already persists via the debounced save — nothing to defer.
      // Flushed via scope 'block' on page change so the toast can't outlive its page.
      scope: 'block',
      commit: () => {},
      undo: () => {
        setBlocks((current) => {
          // Re-insert at the original index (clamped, in case the array shifted).
          const at = Math.min(index, current.length)
          const next = [...current.slice(0, at), removed, ...current.slice(at)]
          scheduleSave(viewTitle, next)
          return next
        })
      },
    })
  }

  function addTextBlock() {
    commitLocalEdit([...viewBlocks, { id: crypto.randomUUID(), type: 'text', content: '' }])
  }

  // Insert an empty block of the picked palette type at `at` (ticket-37). No-op
  // for a type with no empty-state factory (unknown module — see emptyBlockForType).
  function insertBlockAt(at: number, item: SlashMenuItem) {
    const nb = emptyBlockForType(item.id)
    if (!nb) return
    commitLocalEdit([...viewBlocks.slice(0, at), nb, ...viewBlocks.slice(at)])
  }

  // Keyboard reorder (⌥↑/⌥↓, ticket-37): swap with the neighbor; persists via
  // the normal debounced save like every other edit.
  function moveBlockAt(index: number, dir: 'up' | 'down') {
    const target = dir === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= viewBlocks.length) return
    const next = [...viewBlocks]
    ;[next[index], next[target]] = [next[target], next[index]]
    commitLocalEdit(next)
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
        {/* Breadcrumb shows the ancestor path (ticket-25); the title input below
            is the editable tail, so the crumb never duplicates the current name. */}
        <Breadcrumb crumbs={crumbs} onNavigate={navigateCrumb} />
        <div className="flex items-center justify-between gap-3 mt-2 mb-4">
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
            checklist toggle re-derives every metric in the same render. `pageId` lets a
            cross-page rollup metric find this page's children (ticket-38).

            The InsertBetween separators (ticket-37) replace the old space-y gap:
            the h-4 separator IS the block rhythm now, and every seam — before the
            first block included — is an insertion point. */}
        <SiblingBlocksProvider value={{ blocks: viewBlocks, scrollToBlock, pageId: page.id }}>
          <div className="space-y-0">
            <InsertBetween onInsert={(item) => insertBlockAt(0, item)} />
            {viewBlocks.map((block, i) => (
              <React.Fragment key={block.id}>
                <BlockEditor
                  block={block}
                  onChange={(next) => setBlockAt(i, next)}
                  onRemove={() => removeBlockAt(i)}
                  onMoveUp={() => moveBlockAt(i, 'up')}
                  onMoveDown={() => moveBlockAt(i, 'down')}
                  onSlashKey={() => setSlashMenuOpenAt(i)}
                  slashMenuOpen={slashMenuOpenAt === i}
                  onSlashSelect={(item) => {
                    // Replace the empty text block at i with the picked module's
                    // empty state (the '/' gesture: text block → chosen block).
                    const nb = emptyBlockForType(item.id)
                    if (!nb) return
                    commitLocalEdit(viewBlocks.map((b, bi) => (bi === i ? nb : b)))
                    setSlashMenuOpenAt(null)
                  }}
                  onSlashClose={() => setSlashMenuOpenAt(null)}
                  isDragging={draggingIndex === i}
                  onDragStart={() => setDraggingIndex(i)}
                  onDragEnd={() => setDraggingIndex(null)}
                  onDragOver={(e) => {
                    e.preventDefault()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (draggingIndex === null || draggingIndex === i) {
                      setDraggingIndex(null)
                      return
                    }
                    // Move the dragged block to position i (splice, not swap, so
                    // the blocks between shift by one — the reorder a user expects).
                    const next = [...viewBlocks]
                    const [moved] = next.splice(draggingIndex, 1)
                    next.splice(i, 0, moved)
                    commitLocalEdit(next)
                    setDraggingIndex(null)
                  }}
                />
                <InsertBetween onInsert={(item) => insertBlockAt(i + 1, item)} />
              </React.Fragment>
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
 * One block row: drag handle + delete affordance + the module's own view, editable.
 * Rendering goes through the ModuleView registry — the panel has no per-type
 * branches, so every registered module (and any future one) is editable here with
 * zero edits. Views that fold editing in (text/todo/table) emit full-state
 * onChange into the debounced save; display-only views ignore `editable`.
 *
 * Ticket-37 adds: '/' in an empty text block opens the block palette (intercepted
 * in the onChange below, so the slash never persists); ⌥↑/⌥↓ reorders the focused
 * block; the ⠿ handle drags to reorder. `draggable` is armed only while the
 * pointer is down on the handle — a block that is always draggable would hijack
 * text-selection drags inside the module's own inputs.
 */
function BlockEditor({
  block,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onSlashKey,
  slashMenuOpen,
  onSlashSelect,
  onSlashClose,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  block: Block
  onChange: (next: Block) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onSlashKey?: () => void
  slashMenuOpen?: boolean
  onSlashSelect?: (item: SlashMenuItem) => void
  onSlashClose?: () => void
  isDragging?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}) {
  // Armed by pointer-down on the ⠿ handle, disarmed when the drag ends (or the
  // pointer is released without dragging). Keeps `draggable` off during normal
  // editing so selecting text inside a textarea never starts a block drag.
  const [dragArmed, setDragArmed] = useState(false)

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault()
      onMoveUp?.()
    }
    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault()
      onMoveDown?.()
    }
  }

  return (
    <div
      className={cn('group relative', isDragging && 'opacity-50')}
      id={blockDomId(block.id)}
      draggable={dragArmed}
      onDragStart={onDragStart}
      onDragEnd={() => {
        setDragArmed(false)
        onDragEnd?.()
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onKeyDown={handleKeyDown}
    >
      {/* Drag handle (ticket-37): arms the block's draggable for this gesture. */}
      <button
        className="absolute -left-8 top-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-press-faint hover:text-press-ink text-sm rounded outline-none focus-visible:ring-2 focus-visible:ring-press-accent cursor-grab"
        title="Drag to reorder"
        aria-label="Drag to reorder block"
        onPointerDown={() => setDragArmed(true)}
        onPointerUp={() => setDragArmed(false)}
      >
        ⠿
      </button>
      <button
        className="absolute -left-5 top-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-press-faint hover:text-destructive focus-visible:text-destructive text-sm rounded outline-none focus-visible:ring-2 focus-visible:ring-press-accent"
        title="Delete block"
        aria-label="Delete block"
        onClick={onRemove}
      >
        ×
      </button>

      {/* The '/' block palette, anchored under this block (ticket-37). */}
      {slashMenuOpen && (
        <SlashMenu
          items={paletteItems}
          onSelect={onSlashSelect ?? (() => {})}
          onClose={onSlashClose ?? (() => {})}
          className="absolute left-0 top-full z-10 mt-1 w-72"
        />
      )}

      <ModuleView
        type={block.type}
        data={block}
        editable
        onChange={(next) => {
          const nextBlock = next as Block
          // '/' typed into an EMPTY text block opens the palette instead of
          // persisting the slash (ticket-37). Only the empty→'/' transition
          // triggers — a '/' mid-sentence is just prose.
          if (
            nextBlock.type === 'text' &&
            block.type === 'text' &&
            (block as { content: string }).content === '' &&
            (nextBlock as { content: string }).content === '/'
          ) {
            onSlashKey?.()
            return
          }
          onChange(nextBlock)
        }}
      />
    </div>
  )
}
