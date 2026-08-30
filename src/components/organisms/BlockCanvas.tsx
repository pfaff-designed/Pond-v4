'use client'

/**
 * The shared block editor body (ticket-44) — the full manual-authoring surface
 * extracted from DocumentPanel so EVERY editable page renders it identically: the
 * document editor, an area page with content, AND the Life home page.
 *
 * It renders a `SiblingBlocksProvider`-wrapped list of blocks with, at every seam,
 * the ticket-37 machinery — the `/` palette on an empty text block, the hover `+`
 * InsertBetween, drag/⌥↑/⌥↓ reorder, per-block delete with undo — and, at the
 * foot, the ticket-44 always-visible palette-first "+ Add a block".
 *
 * Persistence is the CALLER's concern: BlockCanvas is controlled (it takes
 * `blocks` and emits the full next array via `onChange`), so DocumentPanel keeps
 * its debounced whole-array save and the Life home surface keeps its own. This is
 * the same "blocks are never partially persisted" contract, just hoisted so two
 * surfaces share one editor.
 */

import React, { useState } from 'react'
import { SiblingBlocksProvider } from '@/lib/modules/sibling-context'
import { blockDomId, scrollToBlock } from '@/lib/modules/block-dom'
import { ModuleView } from '@/lib/modules/renderers'
import { SlashMenu, type SlashMenuItem } from '@/components/molecules/SlashMenu'
import { InsertBetween, AddBlockButton } from '@/components/molecules/BlockInserters'
import { paletteItems, emptyBlockForType } from '@/lib/modules/palette'
import { useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { cn } from '@/lib/utils'
import type { Block } from '@/lib/documents/types'

/** A short, human label for a block in the undo toast ("Deleted text block"). */
function blockLabel(block: Block): string {
  return `Deleted ${block.type} block`
}

export interface BlockCanvasProps {
  /** The blocks to render — controlled by the caller. */
  blocks: Block[]
  /** The page these blocks belong to (drives bound-metric cross-page lookups). */
  pageId: string
  /** Emit the full next block array; the caller owns persistence (debounced save). */
  onChange: (next: Block[]) => void
  /**
   * Undo a block removal (ticket-44 review). The caller re-inserts `block` at
   * `index` via a FUNCTIONAL state update against its LATEST blocks — NOT through
   * `onChange`, which would re-base on the stale `blocks` snapshot captured when
   * the toast was staged. This preserves DocumentPanel's original
   * `setBlocks((current) => …)` correctness: an edit between remove and Undo
   * must not be clobbered by the re-insert. Required whenever removal is possible.
   */
  onUndoRemove: (index: number, block: Block) => void
  /**
   * Block ids inserted this session, so a freshly-inserted block SETTLES in
   * (motion-settle-in) while blocks present on load do not (ticket-41). The Set is
   * OWNED BY THE PARENT (so it survives the panel's stable mount across page
   * changes), not by BlockCanvas — `markInserted` mutates it through this prop.
   * Optional — a surface that doesn't track it passes nothing and no block animates.
   */
  insertedIds?: Set<string>
}

/**
 * The controlled block editor. All edits go through `emit`, which hands the full
 * next array up; the caller schedules the persist. Reorder, insert, remove, and
 * the palette picks all reduce to one `emit`.
 */
export function BlockCanvas({
  blocks,
  pageId,
  onChange,
  onUndoRemove,
  insertedIds,
}: BlockCanvasProps) {
  const { stageDeletion } = useDeletionUndo()

  // Which block index has the `/` palette open (null = closed). Index, not id:
  // the palette replaces the text block AT that position (ticket-37).
  const [slashMenuOpenAt, setSlashMenuOpenAt] = useState<number | null>(null)
  // Which block index is mid-drag (null = no drag).
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)

  // Mark a freshly-inserted block on the PARENT-owned insertedIds Set (see the
  // prop doc): BlockCanvas doesn't own it, it just records into it.
  function markInserted(id: string) {
    insertedIds?.add(id)
  }

  function setBlockAt(index: number, next: Block) {
    onChange(blocks.map((b, i) => (i === index ? next : b)))
  }

  function removeBlockAt(index: number) {
    const removed = blocks[index]
    if (!removed) return
    onChange(blocks.filter((_, i) => i !== index))
    stageDeletion({
      message: blockLabel(removed),
      // The removal already persists via the caller's debounced save; undo
      // re-inserts and re-saves. Flushed via scope 'block' on page change.
      //
      // Route the re-insert through the caller's FUNCTIONAL update
      // (onUndoRemove), NOT onChange: `blocks` here is the snapshot at
      // stage-time, so an edit before Undo would otherwise re-base the insert on
      // stale state and drop that edit (ticket-44 review).
      scope: 'block',
      commit: () => {},
      undo: () => onUndoRemove(index, removed),
    })
  }

  // Insert an empty block of the picked palette type at `at` (ticket-37). No-op
  // for a type with no empty-state factory (unknown module).
  function insertBlockAt(at: number, item: SlashMenuItem) {
    const nb = emptyBlockForType(item.id)
    if (!nb) return
    markInserted(nb.id)
    onChange([...blocks.slice(0, at), nb, ...blocks.slice(at)])
  }

  // The foot palette-first add (ticket-44 §3): append the picked module's empty state.
  function addBlockFromPalette(item: SlashMenuItem) {
    insertBlockAt(blocks.length, item)
  }

  function moveBlockAt(index: number, dir: 'up' | 'down') {
    const target = dir === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= blocks.length) return
    const next = [...blocks]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <>
      {/* Provide sibling-block state so bound metrics derive live and their `→`
          can scroll to source (ticket-23). Keyed off the live `blocks`, so a
          checklist toggle re-derives every metric in the same render. `pageId`
          lets a cross-page rollup metric find this page's children (ticket-38). */}
      <SiblingBlocksProvider value={{ blocks, scrollToBlock, pageId }}>
        <div className="space-y-0">
          <InsertBetween onInsert={(item) => insertBlockAt(0, item)} />
          {blocks.map((block, i) => (
            <React.Fragment key={block.id}>
              <BlockEditor
                block={block}
                settleOnMount={insertedIds?.has(block.id) ?? false}
                onChange={(next) => setBlockAt(i, next)}
                onRemove={() => removeBlockAt(i)}
                onMoveUp={() => moveBlockAt(i, 'up')}
                onMoveDown={() => moveBlockAt(i, 'down')}
                onSlashKey={() => setSlashMenuOpenAt(i)}
                slashMenuOpen={slashMenuOpenAt === i}
                onSlashSelect={(item) => {
                  // Replace the empty text block at i with the picked module's
                  // empty state (the `/` gesture: text block → chosen block).
                  const nb = emptyBlockForType(item.id)
                  if (!nb) return
                  markInserted(nb.id)
                  onChange(blocks.map((b, bi) => (bi === i ? nb : b)))
                  setSlashMenuOpenAt(null)
                }}
                onSlashClose={() => setSlashMenuOpenAt(null)}
                isDragging={draggingIndex === i}
                onDragStart={() => setDraggingIndex(i)}
                onDragEnd={() => setDraggingIndex(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (draggingIndex === null || draggingIndex === i) {
                    setDraggingIndex(null)
                    return
                  }
                  // Move the dragged block to position i (splice, not swap).
                  const next = [...blocks]
                  const [moved] = next.splice(draggingIndex, 1)
                  next.splice(i, 0, moved)
                  onChange(next)
                  setDraggingIndex(null)
                }}
              />
              <InsertBetween onInsert={(item) => insertBlockAt(i + 1, item)} />
            </React.Fragment>
          ))}
        </div>
      </SiblingBlocksProvider>

      {/* The always-visible palette-first foot add (ticket-44 §3) — replaces the
          old text-only "+ Add text". */}
      <AddBlockButton onAdd={addBlockFromPalette} />
    </>
  )
}

// ── Per-block editor ───────────────────────────────────────────────────────────

/**
 * One block row: drag handle + delete affordance + the module's own view, editable.
 * Rendering goes through the ModuleView registry — no per-type branches, so every
 * registered module (and any future one) is editable here with zero edits. Views
 * that fold editing in (text/todo/table) emit full-state onChange; display-only
 * views ignore `editable`.
 *
 * Ticket-37: `/` in an empty text block opens the block palette (intercepted in the
 * onChange below, so the slash never persists); ⌥↑/⌥↓ reorders the focused block;
 * the ⠿ handle drags to reorder. `draggable` is armed only while the pointer is
 * down on the handle — an always-draggable block would hijack text-selection drags.
 */
function BlockEditor({
  block,
  settleOnMount = false,
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
  settleOnMount?: boolean
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
      className={cn(
        'group relative',
        settleOnMount && 'motion-settle-in',
        isDragging && 'opacity-50'
      )}
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

      {/* The `/` block palette, anchored under this block (ticket-37). */}
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
          // `/` typed into an EMPTY text block opens the palette instead of
          // persisting the slash (ticket-37). Only the empty→'/' transition fires.
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
