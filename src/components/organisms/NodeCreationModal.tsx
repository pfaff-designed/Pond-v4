'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { createNode, parseActionCard } from '@/lib/nodes/create'
import { createNodeChatTransport } from '@/lib/ai/transports'
import type { ActionCard } from '@/lib/nodes/create'

// ── Types ──────────────────────────────────────────────────────────────────

interface NodeCreationModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (nodeId: string, type: ActionCard['type'], name: string) => void
  /** Pre-loaded intent from AI tool call — skips the chat step */
  intent?: ActionCard
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Scan assistant messages for a fenced JSON block and parse it as an ActionCard.
 * Walks backwards — the most recent assistant message wins.
 */
function extractActionCardFromMessages(
  messages: Array<{ role: string; parts: Array<{ type: string; text?: string }> }>
): ActionCard | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'assistant') continue

    const text = msg.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('')

    const match = text.match(/```json\s*([\s\S]*?)```/)
    if (!match) continue

    const card = parseActionCard(match[1].trim())
    if (card) return card
  }
  return null
}

// ── ModalBody — inner component, remounts on each open ────────────────────

interface ModalBodyProps {
  onClose: () => void
  onCreated: (nodeId: string, type: ActionCard['type'], name: string) => void
  autoApproved: React.MutableRefObject<Set<ActionCard['type']>>
  intent?: ActionCard
}

function ModalBody({ onClose, onCreated, autoApproved, intent }: ModalBodyProps) {
  const [input, setInput] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { messages, sendMessage, status } = useChat({
    transport: createNodeChatTransport(),
  })

  const isStreaming = status === 'streaming' || status === 'submitted'

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Stable reference — intent takes priority; otherwise derived from messages
  const pendingCard = useMemo(
    () =>
      intent ??
      extractActionCardFromMessages(
        messages as Array<{ role: string; parts: Array<{ type: string; text?: string }> }>
      ),
    [intent, messages]
  )

  // ── Send message ─────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isStreaming) return
    sendMessage({ text })
    setInput('')
  }, [input, isStreaming, sendMessage])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Confirm creation ─────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!pendingCard || isCreating) return
    setIsCreating(true)
    setError(null)
    try {
      const supabase = createClient()
      const created = await createNode(supabase, pendingCard)
      // Invalidate the pages cache so the sidebar refreshes
      await queryClient.invalidateQueries({ queryKey: ['pages'] })
      onCreated(created.id, pendingCard.type, pendingCard.name)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create node')
      setIsCreating(false)
    }
  }, [pendingCard, isCreating, queryClient, onCreated, onClose])

  // Auto-create when a card of a session-approved type appears
  useEffect(() => {
    if (pendingCard && !isCreating && autoApproved.current.has(pendingCard.type)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- handleCreate is an async side effect (network call), not a derived-state computation
      void handleCreate()
    }
  }, [pendingCard, isCreating, handleCreate, autoApproved])

  const isAutoApproved = pendingCard ? autoApproved.current.has(pendingCard.type) : false

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create new node"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-xl shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-zinc-50">
          <span className="text-sm font-semibold text-zinc-800">New Node</span>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 text-sm leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Chat messages — hidden when intent is pre-loaded from a tool call */}
        {!intent && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 font-mono text-sm min-h-0 max-h-64">
            {messages.length === 0 && !isStreaming && (
              <p className="text-zinc-400 text-xs">
                Tell me what you&apos;d like to create — an Area, Project, Routine, or Action.
              </p>
            )}
            {messages.map((message) => {
              const text = message.parts
                .filter((p) => p.type === 'text')
                .map((p) => (p as { type: 'text'; text: string }).text)
                .join('')

              // Strip the JSON code block from display — the action card UI replaces it
              const displayText = text.replace(/```json[\s\S]*?```/g, '').trim()

              if (!displayText && message.role === 'assistant' && pendingCard) return null

              return (
                <div
                  key={message.id}
                  className={message.role === 'user' ? 'text-right' : 'text-left'}
                >
                  <span
                    className={`inline-block text-sm px-3 py-1.5 rounded max-w-prose whitespace-pre-wrap text-left ${
                      message.role === 'user'
                        ? 'bg-zinc-900 text-white'
                        : 'bg-zinc-100 text-zinc-800'
                    }`}
                  >
                    {displayText || text}
                  </span>
                </div>
              )
            })}
            {isStreaming && (
              <div className="text-left">
                <span className="inline-block text-sm px-3 py-1.5 rounded bg-zinc-100 text-zinc-400">
                  …
                </span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Action card — hidden for auto-approved types (auto-creates silently) */}
        {pendingCard && !isAutoApproved && (
          <div className="mx-4 mb-3 border border-zinc-200 rounded-lg p-3 bg-zinc-50">
            <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">
              Proposed {pendingCard.type}
            </div>
            <div className="text-sm font-medium text-zinc-900 mb-3">{pendingCard.name}</div>
            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
            <div className="flex gap-2 mb-3">
              <button
                onClick={handleCreate}
                disabled={isCreating}
                className="px-3 py-1.5 bg-zinc-900 text-white text-sm rounded hover:bg-zinc-700 disabled:opacity-40"
              >
                {isCreating ? 'Creating…' : 'Create'}
              </button>
              <button
                onClick={onClose}
                className="px-3 py-1.5 border border-zinc-300 text-zinc-700 text-sm rounded hover:bg-zinc-100"
              >
                Cancel
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-zinc-300"
                aria-label={`Always approve ${pendingCard.type} this session`}
                onChange={(e) => {
                  if (e.target.checked) {
                    autoApproved.current.add(pendingCard.type)
                    handleCreate()
                  }
                }}
              />
              Always approve {pendingCard.type} this session
            </label>
          </div>
        )}

        {/* Input — shown when no action card is pending */}
        {!pendingCard && (
          <div className="flex flex-col gap-2 px-4 py-3 border-t border-zinc-100 flex-shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what you'd like to create…"
                rows={2}
                className="flex-1 resize-none border border-zinc-200 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-400 font-mono"
                disabled={isStreaming}
                autoFocus
              />
              <button
                onClick={handleSend}
                disabled={isStreaming || !input.trim()}
                className="px-3 py-2 bg-zinc-900 text-white text-sm rounded hover:bg-zinc-700 disabled:opacity-40 self-end"
              >
                Send
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="text-sm text-zinc-500 hover:text-zinc-800 px-2 py-1 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── NodeCreationModal — outer gate ────────────────────────────────────────
// useRef here (before early return) persists autoApproved across open/close cycles.

export function NodeCreationModal({ isOpen, onClose, onCreated, intent }: NodeCreationModalProps) {
  const autoApproved = useRef(new Set<ActionCard['type']>())
  if (!isOpen) return null
  return (
    <ModalBody
      onClose={onClose}
      onCreated={onCreated}
      autoApproved={autoApproved}
      intent={intent}
    />
  )
}
