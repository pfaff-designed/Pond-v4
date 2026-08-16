'use client'

import { useChat } from '@ai-sdk/react'
import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getOrCreateConversation,
  saveTranscript,
  dissolveConversation,
} from '@/lib/conversation/client'
import { performHandoff } from '@/lib/conversation/handoff'
import { getPage } from '@/lib/pages/client'
import { applyProposedEdit, applyProposedChanges } from '@/lib/pages/edits'
import { commitBlocks } from '@/lib/pages/commit'
import { NodeCreationModal } from './NodeCreationModal'
import { SavePickerModal } from './SavePickerModal'
import { DiffCard, type DiffCardStatus } from '@/components/molecules/DiffCard'
import { ProposalGroup } from '@/components/molecules/ProposalGroup'
import type { ProposalStatus } from '@/components/atoms/ProposalActions'
import { previewForChange } from '@/lib/modules/preview'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import type { ActionCard } from '@/lib/nodes/create'

type CommandResult = 'clear' | 'handoff' | 'save' | null

/** A propose_edit tool part as it appears in a UI message (ticket-10). */
interface ProposeEditPart {
  type: 'tool-propose_edit'
  toolCallId: string
  state: string
  input?: { blockId?: string; newContent?: string; reason?: string }
  output?: { decision?: 'accepted' | 'rejected' | 'edited' }
}

function isProposeEditPart(part: { type: string }): part is ProposeEditPart {
  return part.type === 'tool-propose_edit'
}

/** A propose_changes tool part — the generalized composition batch (t16 Phase 5). */
interface ProposeChangesPart {
  type: 'tool-propose_changes'
  toolCallId: string
  state: string
  input?: { changes?: ModuleChange[] }
}

function isProposeChangesPart(part: { type: string }): part is ProposeChangesPart {
  return part.type === 'tool-propose_changes'
}

type ProposalDecision = 'accepted' | 'rejected' | 'edited'

function parseCommand(text: string): CommandResult {
  const t = text.trim()
  if (t === '/clear') return 'clear'
  if (t === '/handoff') return 'handoff'
  if (t === '/save') return 'save'
  return null
}

export function AITerminal() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nodeName = searchParams.get('nodeName')
  const nodeId = searchParams.get('nodeId')
  const nodeType = searchParams.get('nodeType')
  const contextLabel = nodeName ?? 'Life'

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalIntent, setModalIntent] = useState<ActionCard | null>(null)
  const pendingToolCallId = useRef<string | null>(null)
  const [isSavePickerOpen, setIsSavePickerOpen] = useState(false)
  const queryClient = useQueryClient()
  const supabaseClient = useMemo(() => createClient(), [])

  // A no-execute client tool's part stays `input-available` after addToolOutput,
  // so we can't drive the card's resolved state off the SDK part. Track the
  // user's decision locally instead (keyed by toolCallId).
  const [proposalDecisions, setProposalDecisions] = useState<Record<string, ProposalDecision>>({})

  // propose_changes decisions, keyed `${toolCallId}:${changeIndex}` so each card in a
  // batch resolves independently (partial accept). Same no-execute caveat as above —
  // this local map, not the SDK part, drives each card's status. `changeSkipped`
  // records how many accepted changes failed the accept-time re-validation gate.
  const [changeDecisions, setChangeDecisions] = useState<Record<string, ProposalStatus>>({})
  const [changeSkipped, setChangeSkipped] = useState<Record<string, number>>({})

  // Current page blocks — the source of the "before" text in a diff card, and
  // the array we rewrite when a proposal is accepted. Shares the ['page', nodeId]
  // cache with DocumentPanel.
  const { data: currentPage } = useQuery({
    queryKey: ['page', nodeId],
    queryFn: () => (nodeId ? getPage(supabaseClient, nodeId) : Promise.resolve(null)),
    enabled: !!nodeId,
  })

  const { messages, sendMessage, setMessages, status, addToolOutput } = useChat({
    onToolCall: ({ toolCall }) => {
      const tc = toolCall as unknown as {
        toolCallId: string
        toolName: string
        input: { type: ActionCard['type']; name: string }
      }
      if (tc.toolName === 'create_node') {
        pendingToolCallId.current = tc.toolCallId
        setModalIntent({ type: tc.input.type, name: tc.input.name } as ActionCard)
        setIsModalOpen(true)
      }
    },
  })
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
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
  // Extract entities from the transcript (Quick model), write them all, then
  // dissolve and start a fresh session (build-brief §9).
  const handleHandoff = useCallback(async () => {
    if (!conversationId) return
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const { freshConversation, written } = await performHandoff(
      supabase,
      conversationId,
      user.id,
      messages
    )
    if (written > 0) {
      await queryClient.invalidateQueries({ queryKey: ['pages'] })
    }
    setConversationId(freshConversation.id)
    setMessages([])
  }, [conversationId, messages, queryClient, setMessages])

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
      setIsSavePickerOpen(true)
      return
    }

    // Send the open node so the server can auto-inject its context (Track C).
    sendMessage({ text }, { body: { nodeId, nodeType } })
    setInput('')
  }, [input, isStreaming, sendMessage, handleClear, handleHandoff, nodeId, nodeType])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Node creation from terminal ───────────────────────────────────────────
  const handleNodeCreated = useCallback(
    (id: string, type: ActionCard['type'], name: string) => {
      setIsModalOpen(false)
      setModalIntent(null)
      if (pendingToolCallId.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(addToolOutput as any)(pendingToolCallId.current, { created: true, nodeId: id })
        pendingToolCallId.current = null
      }
      router.push(`/workspace?nodeType=${type}&nodeId=${id}&nodeName=${encodeURIComponent(name)}`)
    },
    [addToolOutput, router]
  )

  // ── Diff-card proposal resolution (ticket-10) ─────────────────────────────
  // Accepting writes the proposed content to the target block in the open page,
  // then refreshes the ['page'] cache (DocumentPanel re-seeds) and re-embeds.
  const writeAcceptedEdit = useCallback(
    async (blockId: string, newContent: string) => {
      if (!nodeId) return
      const page = await getPage(supabaseClient, nodeId)
      if (!page) return
      const next = applyProposedEdit(page.blocks, blockId, newContent)
      await commitBlocks(supabaseClient, queryClient, nodeId, next)
      // This is an EXTERNAL write to the open page: invalidate ['page'] so the
      // DocumentPanel refetches and adopts the new blocks (commitBlocks leaves the
      // ['page'] cache alone precisely so this stays the caller's decision).
      await queryClient.invalidateQueries({ queryKey: ['page', nodeId] })
    },
    [nodeId, supabaseClient, queryClient]
  )

  const resolveProposal = useCallback(
    (part: ProposeEditPart, decision: ProposalDecision) => {
      setProposalDecisions((prev) => ({ ...prev, [part.toolCallId]: decision }))
      // Best-effort: also record it on the SDK transcript. (No-execute client
      // tools don't advance to output-available, so the local map above is what
      // actually drives the UI.)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(addToolOutput as any)(part.toolCallId, { decision })
    },
    [addToolOutput]
  )

  const handleAcceptProposal = useCallback(
    async (part: ProposeEditPart) => {
      resolveProposal(part, 'accepted')
      const blockId = part.input?.blockId
      if (blockId) await writeAcceptedEdit(blockId, part.input?.newContent ?? '')
    },
    [resolveProposal, writeAcceptedEdit]
  )

  const handleRejectProposal = useCallback(
    (part: ProposeEditPart) => {
      resolveProposal(part, 'rejected')
    },
    [resolveProposal]
  )

  // Edit (stub this slice): accept the content, then jump to the block in the
  // document panel to keep editing there. Full inline-editable drop is deferred.
  const handleEditProposal = useCallback(
    async (part: ProposeEditPart) => {
      resolveProposal(part, 'edited')
      const blockId = part.input?.blockId
      if (blockId) await writeAcceptedEdit(blockId, part.input?.newContent ?? '')
      if (blockId) {
        requestAnimationFrame(() => {
          const el = document.getElementById(`block-${blockId}`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el?.querySelector('textarea')?.focus()
        })
      }
    },
    [resolveProposal, writeAcceptedEdit]
  )

  // ── propose_changes resolution (t16 Phase 5) ──────────────────────────────
  // The generalized Accept path: mint ids for the accepted batch, apply it, and
  // re-seed the open page. This is also the accept-time re-validation gate —
  // applyProposedChanges skips anything that fails blockSchema, so the returned
  // `skipped` count surfaces a "couldn't apply" notice rather than a corrupt write.
  const writeAcceptedChanges = useCallback(
    async (changes: ModuleChange[]): Promise<number> => {
      if (!nodeId || changes.length === 0) return 0
      const page = await getPage(supabaseClient, nodeId)
      if (!page) return 0
      const result = applyProposedChanges(page.blocks, changes, () => crypto.randomUUID())
      await commitBlocks(supabaseClient, queryClient, nodeId, result.blocks)
      // External write to the open page — same pattern as writeAcceptedEdit.
      await queryClient.invalidateQueries({ queryKey: ['page', nodeId] })
      return result.skipped
    },
    [nodeId, supabaseClient, queryClient]
  )

  const decideChanges = useCallback(
    (toolCallId: string, indices: number[], decision: ProposalStatus) => {
      setChangeDecisions((prev) => {
        const next = { ...prev }
        for (const i of indices) next[`${toolCallId}:${i}`] = decision
        return next
      })
    },
    []
  )

  const acceptChanges = useCallback(
    async (toolCallId: string, allChanges: ModuleChange[], indices: number[]) => {
      if (indices.length === 0) return
      decideChanges(toolCallId, indices, 'accepted')
      const skipped = await writeAcceptedChanges(indices.map((i) => allChanges[i]))
      if (skipped > 0) {
        setChangeSkipped((prev) => ({ ...prev, [toolCallId]: (prev[toolCallId] ?? 0) + skipped }))
      }
    },
    [decideChanges, writeAcceptedChanges]
  )

  // Edit: accept the change, then jump to its block in the document panel to keep
  // editing there (full inline-editable drop deferred, as with propose_edit). A
  // `create` has no id until it lands, so there's nothing to scroll to yet.
  const editChange = useCallback(
    async (toolCallId: string, allChanges: ModuleChange[], index: number) => {
      await acceptChanges(toolCallId, allChanges, [index])
      const change = allChanges[index]
      const blockId = change.op === 'create' ? undefined : change.blockId
      if (blockId) {
        requestAnimationFrame(() => {
          const el = document.getElementById(`block-${blockId}`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el?.querySelector('textarea')?.focus()
        })
      }
    },
    [acceptChanges]
  )

  return (
    <>
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
            const proposals = (message.parts as Array<{ type: string }>).filter(isProposeEditPart)
            const changeBatches = (message.parts as Array<{ type: string }>).filter(
              isProposeChangesPart
            )

            return (
              <div key={message.id} className="space-y-2">
                {text && (
                  <div className={message.role === 'user' ? 'text-right' : 'text-left'}>
                    <span
                      className={`inline-block text-sm px-3 py-1.5 rounded max-w-prose whitespace-pre-wrap text-left ${
                        message.role === 'user'
                          ? 'bg-zinc-900 text-white'
                          : 'bg-zinc-100 text-zinc-800'
                      }`}
                    >
                      {text}
                    </span>
                  </div>
                )}
                {proposals.map((part) => {
                  const blockId = part.input?.blockId
                  const target = blockId
                    ? currentPage?.blocks.find((b) => b.id === blockId)
                    : undefined
                  const beforeText = target && target.type === 'text' ? target.content : ''
                  const decision = proposalDecisions[part.toolCallId]
                  const status: DiffCardStatus = !decision
                    ? 'pending'
                    : decision === 'rejected'
                      ? 'rejected'
                      : 'accepted'
                  return (
                    <DiffCard
                      key={part.toolCallId}
                      before={beforeText}
                      after={part.input?.newContent ?? ''}
                      reason={part.input?.reason}
                      status={status}
                      onAccept={() => handleAcceptProposal(part)}
                      onReject={() => handleRejectProposal(part)}
                      onEdit={() => handleEditProposal(part)}
                    />
                  )
                })}
                {changeBatches.map((part) => {
                  const rawChanges = part.input?.changes ?? []
                  const previews = rawChanges.map((c) =>
                    previewForChange(c, currentPage?.blocks ?? [])
                  )
                  const statuses = rawChanges.map(
                    (_, i) => changeDecisions[`${part.toolCallId}:${i}`] ?? 'pending'
                  )
                  const pending = rawChanges
                    .map((_, i) => i)
                    .filter((i) => statuses[i] === 'pending')
                  const skipped = changeSkipped[part.toolCallId] ?? 0
                  return (
                    <div key={part.toolCallId} className="space-y-1.5">
                      <ProposalGroup
                        changes={previews}
                        statuses={statuses}
                        onAccept={(i) => acceptChanges(part.toolCallId, rawChanges, [i])}
                        onReject={(i) => decideChanges(part.toolCallId, [i], 'rejected')}
                        onEdit={(i) => editChange(part.toolCallId, rawChanges, i)}
                        onAcceptAll={() => acceptChanges(part.toolCallId, rawChanges, pending)}
                        onRejectAll={() => decideChanges(part.toolCallId, pending, 'rejected')}
                      />
                      {skipped > 0 && (
                        <p className="text-xs text-amber-600">
                          {skipped} change{skipped > 1 ? 's' : ''} couldn’t be applied and{' '}
                          {skipped > 1 ? 'were' : 'was'} skipped.
                        </p>
                      )}
                    </div>
                  )
                })}
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
      <NodeCreationModal
        isOpen={isModalOpen}
        onClose={() => {
          if (pendingToolCallId.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(addToolOutput as any)(pendingToolCallId.current, { cancelled: true })
            pendingToolCallId.current = null
          }
          setIsModalOpen(false)
          setModalIntent(null)
        }}
        onCreated={handleNodeCreated}
        intent={modalIntent ?? undefined}
      />
      <SavePickerModal
        isOpen={isSavePickerOpen}
        messages={messages}
        onClose={() => setIsSavePickerOpen(false)}
      />
    </>
  )
}
