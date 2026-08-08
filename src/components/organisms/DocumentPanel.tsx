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
import { getPage, saveBlocks, updateTitle } from '@/lib/pages/client'
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

  const [title, setTitle] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [saved, setSaved] = useState(true)
  const loadedId = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seed local editable state when a different page loads (don't clobber edits
  // on background refetch of the same page).
  useEffect(() => {
    if (page && page.id !== loadedId.current) {
      loadedId.current = page.id
      setTitle(page.title)
      setBlocks(page.blocks)
      setSaved(true)
    }
    if (!nodeId) loadedId.current = null
  }, [page, nodeId])

  function scheduleSave(nextTitle: string, nextBlocks: Block[]) {
    const id = loadedId.current
    if (!id) return
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await Promise.all([
        updateTitle(supabase, id, nextTitle),
        saveBlocks(supabase, id, nextBlocks),
      ])
      // refresh the sidebar so a rename shows immediately
      await queryClient.invalidateQueries({ queryKey: ['pages'] })
      setSaved(true)
      // re-embed in the background so semantic retrieval matches the latest edit
      void fetch('/api/pages/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: id }),
      }).catch(() => {})
    }, 600)
  }

  function onTitle(value: string) {
    setTitle(value)
    scheduleSave(value, blocks)
  }

  function commitBlocks(next: Block[]) {
    setBlocks(next)
    scheduleSave(title, next)
  }

  function setBlockAt(index: number, next: Block) {
    commitBlocks(blocks.map((b, i) => (i === index ? next : b)))
  }

  function removeBlockAt(index: number) {
    commitBlocks(blocks.filter((_, i) => i !== index))
  }

  function addTextBlock() {
    commitBlocks([...blocks, { id: crypto.randomUUID(), type: 'text', content: '' }])
  }

  // ── Empty / loading states ─────────────────────────────────────────────────
  if (!nodeId) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-zinc-400">
        Select a page to view or edit it
      </div>
    )
  }
  if (isLoading || !page) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-zinc-400">Loading…</div>
    )
  }

  // ── Editor ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between gap-3 mb-4">
          <input
            className="flex-1 text-2xl font-semibold text-zinc-900 outline-none bg-transparent placeholder:text-zinc-300"
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            placeholder="Untitled"
            aria-label="Page title"
          />
          <span className="text-xs text-zinc-400 flex-shrink-0" aria-live="polite">
            {saved ? 'Saved' : 'Saving…'}
          </span>
        </div>

        <div className="space-y-3">
          {blocks.map((block, i) => (
            <BlockEditor
              key={block.id}
              block={block}
              onChange={(next) => setBlockAt(i, next)}
              onRemove={() => removeBlockAt(i)}
            />
          ))}
        </div>

        <button className="mt-4 text-sm text-zinc-400 hover:text-zinc-700" onClick={addTextBlock}>
          + Add text
        </button>
      </div>
    </div>
  )
}

// ── Per-block editors ──────────────────────────────────────────────────────────

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
    <div className="group relative">
      <button
        className="absolute -left-5 top-1 opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-600 text-sm"
        title="Delete block"
        aria-label="Delete block"
        onClick={onRemove}
      >
        ×
      </button>
      {block.type === 'text' && (
        <textarea
          className="w-full resize-none outline-none text-sm text-zinc-800 bg-transparent leading-relaxed"
          value={block.content}
          rows={Math.max(1, block.content.split('\n').length)}
          placeholder="Write something…"
          onChange={(e) => onChange({ ...block, content: e.target.value })}
        />
      )}
      {block.type === 'todo' && (
        <ul className="space-y-1">
          {block.items.map((item, j) => (
            <li key={item.id} className="flex items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(e) =>
                  onChange({
                    ...block,
                    items: block.items.map((it, k) =>
                      k === j ? { ...it, checked: e.target.checked } : it
                    ),
                  })
                }
              />
              <input
                className="flex-1 outline-none bg-transparent"
                value={item.label}
                onChange={(e) =>
                  onChange({
                    ...block,
                    items: block.items.map((it, k) =>
                      k === j ? { ...it, label: e.target.value } : it
                    ),
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
      {block.type === 'metric' && (
        <div className="text-sm text-zinc-800">
          <span className="text-zinc-500">{block.label}:</span> {block.value}
          {block.unit ? ` ${block.unit}` : ''}
          {block.trend ? ` (${block.trend})` : ''}
        </div>
      )}
    </div>
  )
}
