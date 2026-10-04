'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { createNode } from '@/lib/nodes/create'
import { useWorkspace } from '@/lib/workspace/context'
import { usePondId } from '@/lib/pond/context'
import type { UIMessage } from 'ai'
import type { SaveExtraction } from '@/app/api/save-extract/route'

// ── Types ──────────────────────────────────────────────────────────────────

interface ExtractionItem extends SaveExtraction {
  status: 'pending' | 'saving' | 'saved' | 'skipped'
  error?: string
}

interface SavePickerModalProps {
  isOpen: boolean
  messages: UIMessage[]
  onClose: () => void
}

// ── SavePickerModal ────────────────────────────────────────────────────────

export function SavePickerModal({ isOpen, messages, onClose }: SavePickerModalProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [items, setItems] = useState<ExtractionItem[]>([])
  const queryClient = useQueryClient()
  const workspace = useWorkspace()
  const pondId = usePondId()

  useEffect(() => {
    if (!isOpen) return
    setIsLoading(true)
    setItems([])

    fetch('/api/save-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    })
      .then((r) => r.json())
      .then((data: { extractions: SaveExtraction[] }) => {
        setItems(data.extractions.map((e) => ({ ...e, status: 'pending' })))
      })
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false))
  }, [isOpen, messages])

  if (!isOpen) return null

  async function handleSave(id: string) {
    const item = items.find((i) => i.id === id)
    if (!item || item.status !== 'pending') return

    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'saving' } : i)))

    try {
      const supabase = createClient()
      await createNode(supabase, { type: item.type, name: item.name }, workspace, pondId)
      await queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'saved' } : i)))
    } catch (err) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? { ...i, status: 'pending', error: err instanceof Error ? err.message : 'Failed' }
            : i
        )
      )
    }
  }

  function handleSkip(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const pendingCount = items.filter((i) => i.status === 'pending').length

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Save as"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="w-full max-w-md mx-4 bg-white rounded-xl shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-zinc-50">
          <span className="text-sm font-semibold text-zinc-800">Save as…</span>
          {/* Fixed square + grid centering so the ✕ glyph sits optically centered
              on both axes (#60) — a bare inline button leaves the glyph's line box
              floating off-center. Same pattern as the rail-row CRUD / BlockCanvas ×. */}
          <button
            onClick={onClose}
            className="grid h-5 w-5 place-items-center rounded text-zinc-400 hover:text-zinc-700 text-sm leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 min-h-[8rem] flex flex-col gap-3">
          {isLoading && <p className="text-sm text-zinc-400">Extracting from conversation…</p>}

          {!isLoading && items.length === 0 && (
            <p className="text-sm text-zinc-400">Nothing to save from this conversation.</p>
          )}

          {!isLoading &&
            items.map((item) => (
              <div key={item.id} className="border border-zinc-200 rounded-lg p-3 bg-zinc-50">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-zinc-400 uppercase tracking-wide block mb-0.5">
                      {item.type}
                    </span>
                    <span className="text-sm font-medium text-zinc-900 truncate block">
                      {item.name}
                    </span>
                    {item.error && <span className="text-xs text-red-500">{item.error}</span>}
                  </div>

                  {item.status === 'pending' && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleSave(item.id)}
                        className="px-3 py-1 bg-zinc-900 text-white text-xs rounded hover:bg-zinc-700"
                        aria-label="Save"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => handleSkip(item.id)}
                        className="px-3 py-1 border border-zinc-300 text-zinc-600 text-xs rounded hover:bg-zinc-100"
                        aria-label="Skip"
                      >
                        Skip
                      </button>
                    </div>
                  )}

                  {item.status === 'saving' && (
                    <span className="text-xs text-zinc-400 flex-shrink-0">Saving…</span>
                  )}

                  {item.status === 'saved' && (
                    <span className="text-xs text-emerald-600 flex-shrink-0">Saved</span>
                  )}
                </div>
              </div>
            ))}
        </div>

        {/* Footer */}
        {!isLoading && (pendingCount === 0 || items.length === 0) && (
          <div className="px-4 pb-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-zinc-900 text-white text-sm rounded hover:bg-zinc-700"
              aria-label="Done"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
