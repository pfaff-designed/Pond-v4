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

// ── Block palette derived from the registry ────────────────────────────────────
// Excludes 'page' (structural, not user-authored). Picks up any new module at
// merge automatically (t35/t36 kanban etc).
const EXCLUDED_FROM_PALETTE = new Set(['page'])

const paletteItems: SlashMenuItem[] = Object.values(moduleDescriptors)
  .filter((d) => !EXCLUDED_FROM_PALETTE.has(d.type))
  .map((d) => ({
    id: d.type,
    name: d.type.charAt(0).toUpperCase() + d.type.slice(1).replace(/-/g, ' '),
    description: d.description,
  }))

// ── Empty-block factories ─────────────────────────────────────────────────────
// Returns a fully-formed empty block for the given type, or null for unknown
// types (e.g. a module from a not-yet-merged branch) — callers must guard null.
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
      // Unknown type (e.g. kanban from t35 if not yet merged): skip gracefully
      return null
  }
}

// ── InsertBetween affordance ──────────────────────────────────────────────────
// A quiet separator between blocks. Shows a '+' on hover that opens the block
// palette for inline insertion.
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
  const { data: rows = [] } = useQuery({ queryKey: ['pages'], queryFn: fetchPages })
  const openCard = useOpenCard()
  const navigateCrumb = useNavigateCrumb()
  const cards = useMemo(() => (nodeId ? childCards(rows, nodeId, new Date()) : []), [rows, nodeId])
  const crumbs = useMemo(() => (nodeId ? ancestorPath(rows, nodeId) : []), [rows, nodeId])

  const [title, setTitle] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [saved, setSaved] = useState(true)
  const [seededId, setSeededId] = useState<string | null>(null)
  const loadedId = useRef<string | null>(null)
  const serverSig = useRef<string>('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Slash menu state: which block index has the palette open (null = closed)
  const [slashMenuOpenAt, setSlashMenuOpenAt] = useState<number | null>(null)

  // Drag state: which block index is currently being dragged
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)

  useEffect(() => {
    if (page && page.id !== loadedId.current) {
      loadedId.current = page.id
      serverSig.current = JSON.stringify(page.blocks)
      setSeededId(page.id)
      setTitle(page.title)
      setBlocks(page.blocks)
      setSaved(true)
    } else if (page && page.id === loadedId.current && saved) {
      const sig = JSON.stringify(page.blocks)
      if (sig !== serverSig.current) {
        serverSig.current = sig
        setBlocks(page.blocks)
      }
    }
    if (!nodeId) loadedId.current = null
  }, [page, nodeId, saved])

  const seeded = !!page && page.id === seededId
  const viewBlocks: Block[] = seeded ? blocks : (page?.blocks ?? [])
  const viewTitle = seeded ? title : (page?.title ?? '')

  function scheduleSave(nextTitle: string, nextBlocks: Block[]) {
    const id = loadedId.current
    if (!id) return
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await updateTitle(supabase, id, nextTitle)
      await commitBlocks(supabase, queryClient, id, nextBlocks)
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

  function commitLocalEdit(next: Block[]) {
    setBlocks(next)
    scheduleSave(viewTitle, next)
  }

  function setBlockAt(index: number, next: Block) {
    commitLocalEdit(viewBlocks.map((b, i) => (i === index ? next : b)))
  }

  function removeBlockAt(index: number) {
    const removed = viewBlocks[index]
    if (!removed) return
    commitLocalEdit(viewBlocks.filter((_, i) => i !== index))
    stageDeletion({
      message: blockLabel(removed),
      scope: 'block',
      commit: () => {},
      undo: () => {
        setBlocks((current) => {
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
  if (page.type === 'area' && viewBlocks.length === 0) {
    return <AreaOverviewPanel areaId={page.id} title={page.title} onAddContent={addTextBlock} />
  }

  // ── Editor (+ children grid when the node has sub-pages) ──────────────────────
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-8">
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

        <SiblingBlocksProvider value={{ blocks: viewBlocks, scrollToBlock }}>
          <div className="space-y-0">
            {/* Insert-before the first block */}
            <InsertBetween
              onInsert={(item) => {
                const nb = emptyBlockForType(item.id)
                if (!nb) return
                commitLocalEdit([nb, ...viewBlocks])
              }}
            />
            {viewBlocks.map((block, i) => (
              <React.Fragment key={block.id}>
                <BlockEditor
                  block={block}
                  index={i}
                  onChange={(next) => setBlockAt(i, next)}
                  onRemove={() => removeBlockAt(i)}
                  onMoveUp={() => moveBlockAt(i, 'up')}
                  onMoveDown={() => moveBlockAt(i, 'down')}
                  onSlashKey={() => setSlashMenuOpenAt(i)}
                  slashMenuOpen={slashMenuOpenAt === i}
                  onSlashSelect={(item) => {
                    const nb = emptyBlockForType(item.id)
                    if (!nb) return
                    const next = viewBlocks.map((b, bi) => (bi === i ? nb : b))
                    commitLocalEdit(next)
                    setSlashMenuOpenAt(null)
                  }}
                  onSlashClose={() => setSlashMenuOpenAt(null)}
                  isDragging={draggingIndex === i}
                  onDragStart={() => setDraggingIndex(i)}
                  onDragOver={(e) => {
                    e.preventDefault()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (draggingIndex === null || draggingIndex === i) {
                      setDraggingIndex(null)
                      return
                    }
                    // Swap dragging block into position i
                    const next = [...viewBlocks]
                    const [moved] = next.splice(draggingIndex, 1)
                    next.splice(i, 0, moved)
                    commitLocalEdit(next)
                    setDraggingIndex(null)
                  }}
                />
                <InsertBetween
                  onInsert={(item) => {
                    const nb = emptyBlockForType(item.id)
                    if (!nb) return
                    const next = [...viewBlocks.slice(0, i + 1), nb, ...viewBlocks.slice(i + 1)]
                    commitLocalEdit(next)
                  }}
                />
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
 * Supports slash-menu block replacement, keyboard reorder (⌥↑/⌥↓), and
 * HTML5 drag-and-drop via the drag handle.
 */
function BlockEditor({
  block,
  index,
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
  onDragOver,
  onDrop,
}: {
  block: Block
  index: number
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
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}) {
  // Suppress unused-variable warning — index is part of the public API for
  // consumers that may need it (e.g. tests checking data-index attributes).
  void index

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
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onKeyDown={handleKeyDown}
    >
      {/* Drag handle */}
      <button
        className="absolute -left-8 top-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-press-faint hover:text-press-ink text-sm rounded outline-none focus-visible:ring-2 focus-visible:ring-press-accent cursor-grab"
        title="Drag to reorder"
        aria-label="Drag to reorder block"
        onMouseDown={(e) => {
          // Drag starts on the div via draggable — prevent button focus steal
          e.preventDefault()
        }}
      >
        ⠿
      </button>
      {/* Delete button */}
      <button
        className="absolute -left-5 top-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-press-faint hover:text-destructive focus-visible:text-destructive text-sm rounded outline-none focus-visible:ring-2 focus-visible:ring-press-accent"
        title="Delete block"
        aria-label="Delete block"
        onClick={onRemove}
      >
        ×
      </button>

      {/* Slash menu (block replacement) */}
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
          // Detect '/' typed into an empty text block — open the palette
          // instead of persisting the slash character.
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
