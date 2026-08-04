'use client'

import { useChat } from '@ai-sdk/react'
import { useRef, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  getOrCreateConversation,
  saveTranscript,
  dissolveConversation,
} from '@/lib/conversation/client'
import { NodeCreationModal } from './NodeCreationModal'

type CommandResult = 'clear' | 'handoff' | 'save' | null

function parseCommand(text: string): CommandResult {
  const t = text.trim()
  if (t === '/clear') return 'clear'
  if (t === '/handoff') return 'handoff'
  if (t === '/save') return 'save'
  return null
}

export function AITerminal() {
  const searchParams = useSearchParams()
  const nodeName = searchParams.get('nodeName')
  const contextLabel = nodeName ?? 'Life'

  const { messages, sendMessage, setMessages, status } = useChat()
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isCreationModalOpen, setIsCreationModalOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isStreaming = status === 'streaming' || status === 'submitted'

  // ── Load or create active conversation on mount ───────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const conversation = await getOrCreateConversation(supabase, user.id)
      setConversationId(conversation.id)
      if (conversation.messages.length > 0) {
        setMessages(conversation.messages)
      }
      setIsReady(true)
    })
  }, [setMessages])

  // ── Save transcript after each completed exchange ─────────────────────────
  useEffect(() => {
    if (status === 'ready' && conversationId && messages.length > 0) {
      const supabase = createClient()
      saveTranscript(supabase, conversationId, messages).catch(console.error)
    }
  }, [status, conversationId, messages])

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Handle /clear ─────────────────────────────────────────────────────────
  const handleClear = useCallback(async () => {
    if (!conversationId) return
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    await dissolveConversation(supabase, conversationId)
    const fresh = await getOrCreateConversation(supabase, user.id)
    setConversationId(fresh.id)
    setMessages([])
  }, [conversationId, setMessages])

  // ── Handle /handoff ───────────────────────────────────────────────────────
  // Stub: dissolves and clears. Entity extraction added in a later slice.
  const handleHandoff = useCallback(async () => {
    if (!conversationId) return
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    await dissolveConversation(supabase, conversationId)
    const fresh = await getOrCreateConversation(supabase, user.id)
    setConversationId(fresh.id)
    setMessages([])
  }, [conversationId, setMessages])

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    const command = parseCommand(text)
    if (command === 'clear') {
      setInput('')
      await handleClear()
      return
    }
    if (command === 'handoff') {
      setInput('')
      await handleHandoff()
      return
    }
    if (command === 'save') {
      setInput('')
      setIsCreationModalOpen(true)
      return
    }

    sendMessage({ text })
    setInput('')
  }, [input, isStreaming, sendMessage, handleClear, handleHandoff])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      <NodeCreationModal
        isOpen={isCreationModalOpen}
        onClose={() => setIsCreationModalOpen(false)}
        onCreated={() => setIsCreationModalOpen(false)}
      />
      <div className="flex flex-col border-t border-zinc-200 bg-white" style={{ height: '18rem' }}>
        {/* Header */}
        <div className="flex items-center px-4 py-2 border-b border-zinc-100 bg-zinc-50 text-xs text-zinc-500 font-mono flex-shrink-0">
          Context: {contextLabel}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 font-mono text-sm">
          {!isReady && <p className="text-zinc-400 text-xs">Loading…</p>}
          {isReady && messages.length === 0 && (
            <p className="text-zinc-400 text-xs">Start a conversation…</p>
          )}
          {messages.map((message) => {
            const text = message.parts
              .filter((p) => p.type === 'text')
              .map((p) => (p as { type: 'text'; text: string }).text)
              .join('')

            return (
              <div
                key={message.id}
                className={message.role === 'user' ? 'text-right' : 'text-left'}
              >
                <span
                  className={`inline-block text-sm px-3 py-1.5 rounded max-w-prose whitespace-pre-wrap text-left ${
                    message.role === 'user' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-800'
                  }`}
                >
                  {text}
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

        {/* Input */}
        <div className="flex items-end gap-2 px-4 py-2 border-t border-zinc-100 flex-shrink-0">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Talk to Pond… (/clear · /handoff · /save)"
            rows={2}
            className="flex-1 resize-none border border-zinc-200 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-400 font-mono"
            disabled={isStreaming || !isReady}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim() || !isReady}
            className="px-3 py-2 bg-zinc-900 text-white text-sm rounded hover:bg-zinc-700 disabled:opacity-40 self-end"
          >
            Send
          </button>
        </div>
      </div>
    </>
  )
}
