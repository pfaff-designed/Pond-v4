'use client'

import { useChat } from '@ai-sdk/react'
import { useRef, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

export function AITerminal() {
  const searchParams = useSearchParams()
  const nodeName = searchParams.get('nodeName')
  const contextLabel = nodeName ?? 'Life'

  const { messages, sendMessage, status } = useChat()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const isStreaming = status === 'streaming' || status === 'submitted'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  return (
    <div className="flex flex-col border-t border-zinc-200 bg-white" style={{ height: '18rem' }}>
      {/* Header */}
      <div className="flex items-center px-4 py-2 border-b border-zinc-100 bg-zinc-50 text-xs text-zinc-500 font-mono flex-shrink-0">
        Context: {contextLabel}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 font-mono text-sm">
        {messages.length === 0 && <p className="text-zinc-400 text-xs">Start a conversation…</p>}
        {messages.map((message) => {
          const text = message.parts
            .filter((p) => p.type === 'text')
            .map((p) => (p as { type: 'text'; text: string }).text)
            .join('')

          return (
            <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
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
          placeholder="Talk to Pond… (Enter to send, Shift+Enter for newline)"
          rows={2}
          className="flex-1 resize-none border border-zinc-200 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-400 font-mono"
          disabled={isStreaming}
        />
        <button
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
          className="px-3 py-2 bg-zinc-900 text-white text-sm rounded hover:bg-zinc-700 disabled:opacity-40 self-end"
        >
          Send
        </button>
      </div>
    </div>
  )
}
