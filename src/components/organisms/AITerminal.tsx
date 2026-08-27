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
import type {
  ConversationResolutions,
  ProposalDecision,
  ProposalTarget,
} from '@/lib/conversation/resolutions'
import { getPage, listPages } from '@/lib/pages/client'
import { FOCUS_TERMINAL_EVENT } from '@/lib/terminal-focus'
import { toParentOptions } from '@/lib/pages/parent-options'
import { writeAcceptedChanges } from '@/lib/pages/accept'
import { createPageFromProposal } from '@/lib/pages/create-page'
import { SavePickerModal } from './SavePickerModal'
import {
  TerminalDrawer,
  TERMINAL_DEFAULT_HEIGHT,
  TERMINAL_MAX_HEIGHT,
  clampTerminalHeight,
} from '@/components/molecules/TerminalDrawer'
import { Markdown } from '@/components/atoms/Markdown'
import { ProposalGroup } from '@/components/molecules/ProposalGroup'
import {
  CreatePageProposalCard,
  TOP_LEVEL_VALUE,
  type ParentOption,
} from '@/components/molecules/CreatePageProposalCard'
import type { ProposalStatus } from '@/components/atoms/ProposalActions'
import {
  changeStatus,
  unresolvedProposalIds,
  type ProposalMessageLike,
} from '@/lib/conversation/proposals'
import { previewForChange } from '@/lib/modules/preview'
import type { ModuleChange, ModuleData } from '@/lib/modules/ai-composition'
import type { NodeType } from '@/lib/supabase/types'

type CommandResult = 'clear' | 'handoff' | 'save' | null

// Remembered drawer ergonomics (ticket-24).
const TERMINAL_HEIGHT_KEY = 'pond:terminal-height'
const TERMINAL_COLLAPSED_KEY = 'pond:terminal-collapsed'
// When a proposal card arrives the drawer auto-grows to at least this so the
// user can review create-page/diff cards without inner scrolling.
const PROPOSAL_MIN_HEIGHT = 460

// Tiny persisted-state helpers: localStorage can throw (privacy modes, quota),
// and the drawer must degrade to defaults rather than crash.
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* ignore persistence failures */
  }
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

/** A create_page tool part — a proposed brand-new page + scaffold (M1). Client-
 *  resolved (no execute); the card below drives accept/reject + placement. */
interface CreatePagePart {
  type: 'tool-create_page'
  toolCallId: string
  state: string
  input?: {
    type?: NodeType
    kind?: string
    title?: string
    parentTitle?: string | null
    blocks?: ModuleData[]
    reason?: string
  }
}

function isCreatePagePart(part: { type: string }): part is CreatePagePart {
  return part.type === 'tool-create_page'
}

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

  const [isSavePickerOpen, setIsSavePickerOpen] = useState(false)
  const queryClient = useQueryClient()
  const supabaseClient = useMemo(() => createClient(), [])

  // A no-execute client tool's part stays `input-available` after addToolOutput,
  // so we can't drive the card's resolved state off the SDK part — the local maps
  // below track the user's decision instead.
  //
  // propose_changes decisions, keyed `${toolCallId}:${changeIndex}` so each card in a
  // batch resolves independently (partial accept). Same no-execute caveat as above —
  // this local map, not the SDK part, drives each card's status. `changeSkipped`
  // records how many accepted changes failed the accept-time re-validation gate.
  const [changeDecisions, setChangeDecisions] = useState<Record<string, ProposalStatus>>({})
  const [changeSkipped, setChangeSkipped] = useState<Record<string, number>>({})
  // Proposal-time target page per batch (BUG 1/2 fix): recorded the moment the
  // part streams in, so Accept commits there even after the user navigates away.
  const [changeTargets, setChangeTargets] = useState<Record<string, ProposalTarget>>({})

  // create_page decisions + the user-chosen destination, keyed by toolCallId. Same
  // no-execute caveat as propose_changes: the local maps (not the SDK part) drive
  // each card's resolved state and picked parent. `undefined` in the parent map means
  // "not yet touched" — the card falls back to the AI-proposed parent (pre-resolved
  // against the pages list) until the user overrides it.
  const [createDecisions, setCreateDecisions] = useState<Record<string, ProposalStatus>>({})
  const [createParent, setCreateParent] = useState<Record<string, string>>({})

  // The persistable projection of the decision maps (ticket-19): saved with the
  // transcript so cards stay resolved across reloads, and sent with each chat
  // request so the model sees which proposals were actioned. 'pending' is never
  // stored, only settled decisions.
  const resolutions: ConversationResolutions = useMemo(() => {
    const settled = (map: Record<string, ProposalStatus>) =>
      Object.fromEntries(Object.entries(map).filter(([, v]) => v !== 'pending')) as Record<
        string,
        ProposalDecision
      >
    return {
      changes: settled(changeDecisions),
      creates: settled(createDecisions),
      skipped: changeSkipped,
      targets: changeTargets,
    }
  }, [changeDecisions, createDecisions, changeSkipped, changeTargets])

  const resetResolutions = useCallback(() => {
    setChangeDecisions({})
    setChangeSkipped({})
    setChangeTargets({})
    setCreateDecisions({})
    setCreateParent({})
  }, [])

  // Current page blocks — the source of the "before" text in a diff card, and
  // the array we rewrite when a proposal is accepted. Shares the ['page', nodeId]
  // cache with DocumentPanel.
  const { data: currentPage } = useQuery({
    queryKey: ['page', nodeId],
    queryFn: () => (nodeId ? getPage(supabaseClient, nodeId) : Promise.resolve(null)),
    enabled: !!nodeId,
  })

  // The user's pages, used to populate the create_page destination picker and to
  // pre-resolve an AI-proposed parent title to an id. Keyed separately from the
  // sidebar's ['pages'] cache (different shape), but invalidated by the same key so a
  // new page refreshes both.
  const { data: allPages = [] } = useQuery({
    queryKey: ['pages', 'list'],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser()
      return user ? listPages(supabaseClient, user.id) : []
    },
  })
  // Duplicate titles are disambiguated with their ancestor path (and type as a
  // tie-break) so "Woodworking" ×2 are tellable apart in the picker.
  const parentOptions: ParentOption[] = useMemo(() => toParentOptions(allPages), [allPages])
  // Resolve an AI-proposed parent title (or id) to a selectable option id.
  const resolveProposedParent = useCallback(
    (parentTitle?: string | null): string => {
      const ref = parentTitle?.trim()
      if (!ref) return TOP_LEVEL_VALUE
      const match = allPages.find(
        (p) => p.id === ref || p.title.toLowerCase() === ref.toLowerCase()
      )
      return match ? match.id : TOP_LEVEL_VALUE
    },
    [allPages]
  )

  // The chat AI's creation gesture is now create_page (client-resolved, rendered as
  // a proposal card below) — there is no create_node tool in this path, so useChat
  // needs no onToolCall handler. The manual creation gesture is the top bar's ＋
  // (CreatePageModal, ticket-26), not this terminal.
  const { messages, sendMessage, setMessages, status } = useChat()
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isStreaming = status === 'streaming' || status === 'submitted'

  // ── Drawer ergonomics (ticket-24) ─────────────────────────────────────────
  // Height + collapse are user-controlled and remembered across sessions. The
  // drawer is a flex sibling of the main panel, so shrinking/collapsing it hands
  // the space back to the content above — it never overlays what's being read.
  const [drawerHeight, setDrawerHeight] = useState(TERMINAL_DEFAULT_HEIGHT)
  const [isCollapsed, setIsCollapsed] = useState(false)
  // The user resized *while* the auto-grow floor was pinning the drawer: their
  // drag wins over the floor for that proposal set (see effectiveHeight below).
  const [growOverrideKey, setGrowOverrideKey] = useState<string | null>(null)
  // Restore persisted height/collapse on mount. Client-only by design: reading
  // localStorage during SSR/hydration would mismatch the server markup, so we
  // accept one frame at the default height instead of Next's inline-script
  // pattern — the drawer sits below the fold of attention and the flash is a
  // height tween, not a content pop.
  useEffect(() => {
    const h = readStored(TERMINAL_HEIGHT_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from an external store (localStorage), read client-side to avoid SSR mismatch
    if (h) setDrawerHeight(clampTerminalHeight(Number(h)))
    setIsCollapsed(readStored(TERMINAL_COLLAPSED_KEY) === '1')
  }, [])
  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev
      writeStored(TERMINAL_COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }, [])

  // ⌘K (top bar icon or global hotkey) moves focus into the terminal input.
  // Robustness (ticket-24): a *collapsed* input is unmounted, so a synchronous
  // focus() finds nothing. We uncollapse and set a pending-focus flag; the effect
  // below focuses once the textarea is mounted. When already open, focus is
  // immediate. This closes every candidate cause of the "⌘K didn't focus" report.
  const pendingFocus = useRef(false)
  const focusInputSoon = useCallback(() => {
    const el = inputRef.current
    if (el) {
      // Input is mounted: attempt focus and consume the request either way — a
      // disabled input (mid-stream) silently drops it rather than leaving a
      // stale flag that would steal focus on some later collapse/ready change.
      el.focus()
      pendingFocus.current = false
      return
    }
    // Collapsed (input unmounted): fulfil after the uncollapse re-render.
    pendingFocus.current = true
  }, [])
  useEffect(() => {
    function onFocusRequest() {
      setIsCollapsed((prev) => {
        if (prev) writeStored(TERMINAL_COLLAPSED_KEY, '0')
        return false
      })
      focusInputSoon()
    }
    window.addEventListener(FOCUS_TERMINAL_EVENT, onFocusRequest)
    return () => window.removeEventListener(FOCUS_TERMINAL_EVENT, onFocusRequest)
  }, [focusInputSoon])

  // ── Load or create active conversation on mount ───────────────────────────
  // `initialMessageIds` records what was re-seeded from the saved transcript:
  // pending decisions are never persisted (ticket-19), so a prior session's
  // still-pending cards would otherwise read as "unresolved" forever and pin
  // the drawer's auto-grow open on every mount. Auto-grow is scoped to
  // proposals that arrive during THIS session.
  const [initialMessageIds, setInitialMessageIds] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const conversation = await getOrCreateConversation(supabase, user.id)
      setConversationId(conversation.id)
      if (conversation.messages.length > 0) {
        setInitialMessageIds(new Set(conversation.messages.map((m) => m.id)))
        setMessages(conversation.messages)
      }
      // Restore card decisions so historical proposal cards render resolved
      // (inert) instead of re-arming with live buttons (ticket-19).
      setChangeDecisions(conversation.resolutions.changes)
      setChangeSkipped(conversation.resolutions.skipped)
      setChangeTargets(conversation.resolutions.targets)
      setCreateDecisions(conversation.resolutions.creates)
      setIsReady(true)
    })
  }, [setMessages])

  // ── Save transcript after each completed exchange ─────────────────────────
  // Also fires on each card decision (`resolutions` dep) so Accept/Dismiss
  // persists immediately, not only after the next exchange.
  useEffect(() => {
    if (status === 'ready' && conversationId && messages.length > 0) {
      const supabase = createClient()
      saveTranscript(supabase, conversationId, messages, resolutions).catch(console.error)
    }
  }, [status, conversationId, messages, resolutions])

  // ── Stamp proposal targets on stream ──────────────────────────────────────
  // The moment a propose_changes part finishes streaming, record which page it
  // was proposed against. Accept later commits to this stamped id regardless of
  // where the user has navigated (BUG 1/2). Persistence rides the transcript-save
  // effect above via the `resolutions` projection. No node open → no stamp; that
  // can't happen once the route stops offering the tool without a nodeId, but
  // guard anyway (an unstamped card falls back to legacy open-node behavior).
  useEffect(() => {
    // Require the name too: a stamp with an empty name would render the current
    // context label on a card that commits elsewhere — worse than no stamp.
    if (!nodeId || !nodeName) return
    const unstamped = messages
      .flatMap((m) => m.parts as Array<{ type: string }>)
      .filter(isProposeChangesPart)
      .filter((p) => p.state === 'input-available' && !changeTargets[p.toolCallId])
    if (unstamped.length === 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- records the arrival of streamed tool parts (an external-system event), not a derived-state computation; guarded to fire once per toolCallId
    setChangeTargets((prev) => {
      const next = { ...prev }
      for (const part of unstamped) {
        if (!next[part.toolCallId]) {
          next[part.toolCallId] = { nodeId, nodeName }
        }
      }
      return next
    })
  }, [messages, nodeId, nodeName, changeTargets])

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Auto-grow for proposal review (ticket-24) ─────────────────────────────
  // A create-page/diff card is the moment of decision — it deserves room. When
  // an unresolved proposal *from this session* is on screen (mount-seeded
  // pending cards are excluded — see initialMessageIds), expand the drawer (and
  // uncollapse it) to PROPOSAL_MIN_HEIGHT if it's currently shorter, so the
  // preview + picker + buttons are visible without inner scroll. We never
  // shrink a user who's set a taller height, and once every proposal is
  // resolved the drawer returns to the remembered height (never persisted).
  const unresolvedIds = useMemo(
    () =>
      unresolvedProposalIds(
        messages as ProposalMessageLike[],
        changeDecisions,
        createDecisions,
        initialMessageIds
      ),
    [messages, changeDecisions, createDecisions, initialMessageIds]
  )
  const hasUnresolvedProposal = unresolvedIds.length > 0

  // Drag wins over the floor (ticket-24 review): resizing while the floor pins
  // the drawer records an override for exactly this proposal set, so the drag is
  // live from the visible height instead of dead until it crosses 460. A new
  // proposal (different key) re-arms the floor; resolution falls back to the
  // remembered height on its own.
  const unresolvedKey = unresolvedIds.join(',')
  const growOverridden = hasUnresolvedProposal && growOverrideKey === unresolvedKey

  const handleHeightChange = useCallback(
    (h: number) => {
      setDrawerHeight(h)
      if (hasUnresolvedProposal) setGrowOverrideKey(unresolvedKey)
    },
    [hasUnresolvedProposal, unresolvedKey]
  )
  // Persist only at gesture end (pointerup / a keyboard nudge), never per move.
  // Every committed height was on screen at commit time — drag-wins means the
  // pinned state can't absorb moves invisibly — so no unseen height is stored.
  const handleHeightCommit = useCallback((h: number) => {
    writeStored(TERMINAL_HEIGHT_KEY, String(h))
  }, [])

  // The effective height feeding the drawer: auto-grown while a proposal is open
  // (unless the user's drag overrode it), otherwise the remembered height.
  const effectiveHeight =
    hasUnresolvedProposal && !growOverridden
      ? Math.min(TERMINAL_MAX_HEIGHT, Math.max(drawerHeight, PROPOSAL_MIN_HEIGHT))
      : drawerHeight

  // Force the drawer open while a proposal needs review — a hidden decision is
  // worse than a big drawer. Derived (not an effect): the user's stored collapse
  // preference is untouched, so it re-applies once the proposal resolves.
  const effectiveCollapsed = isCollapsed && !hasUnresolvedProposal

  // Fulfil a pending ⌘K focus once the input is actually mounted (i.e. the drawer
  // finished uncollapsing). Runs after the commit that mounts the textarea.
  useEffect(() => {
    if (!effectiveCollapsed && pendingFocus.current) {
      inputRef.current?.focus()
      pendingFocus.current = false
    }
  }, [effectiveCollapsed, isReady])

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
    // Stale decisions must not leak into the fresh conversation's transcript.
    resetResolutions()
  }, [conversationId, setMessages, resetResolutions])

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
    resetResolutions()
  }, [conversationId, messages, queryClient, setMessages, resetResolutions])

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

    // Send the open node so the server can auto-inject its context (Track C),
    // plus the card resolutions so replay carries the user's decisions (t19).
    sendMessage({ text }, { body: { nodeId, nodeType, resolutions } })
    setInput('')
  }, [input, isStreaming, sendMessage, handleClear, handleHandoff, nodeId, nodeType, resolutions])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── propose_changes resolution (t16 Phase 5) ──────────────────────────────
  // The generalized Accept path: mint ids for the accepted batch, apply it, and
  // commit to the batch's stamped target page (writeAcceptedChanges in
  // lib/pages/accept.ts). This is also the accept-time re-validation gate —
  // applyProposedChanges skips anything that fails blockSchema, so the returned
  // `skipped` count surfaces a "couldn't apply" notice rather than a corrupt write.
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
      const skipped = await writeAcceptedChanges({
        supabase: supabaseClient,
        queryClient,
        resolutions,
        toolCallId,
        openNodeId: nodeId,
        changes: indices.map((i) => allChanges[i]),
      })
      if (skipped > 0) {
        setChangeSkipped((prev) => ({ ...prev, [toolCallId]: (prev[toolCallId] ?? 0) + skipped }))
      }
    },
    [decideChanges, supabaseClient, queryClient, resolutions, nodeId]
  )

  // Edit: accept the change, then jump to its block in the document panel to keep
  // editing there (full inline-editable drop deferred). A `create` has no id until
  // it lands, so there's nothing to scroll to yet.
  const editChange = useCallback(
    async (toolCallId: string, allChanges: ModuleChange[], index: number) => {
      await acceptChanges(toolCallId, allChanges, [index])
      const change = allChanges[index]
      const blockId = change.op === 'create' ? undefined : change.blockId
      if (blockId) {
        requestAnimationFrame(() => {
          const el = document.getElementById(`block-${blockId}`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          // Text blocks are now click-to-edit (ticket-20): the source textarea only
          // exists once the block is in edit mode, so trigger that first. Interactive
          // blocks (todo/table) keep their inline inputs and fall through to focus.
          const editTrigger = el?.querySelector<HTMLElement>('[data-text-edit-trigger]')
          if (editTrigger) editTrigger.click()
          else el?.querySelector('textarea')?.focus()
        })
      }
    },
    [acceptChanges]
  )

  // ── create_page resolution (M1) ───────────────────────────────────────────
  // Accept: mint block ids, resolve the user-chosen parent, write via createPage,
  // then navigate to the new page (matching the create_node dialog's post-create
  // nav). The user's selected destination wins over the AI's proposed placement.
  const acceptCreatePage = useCallback(
    async (toolCallId: string, part: CreatePagePart['input'], selectedParentId: string) => {
      if (!part?.title || !part.type) return
      setCreateDecisions((prev) => ({ ...prev, [toolCallId]: 'accepted' }))
      try {
        // A selected option id is a real page id (UUID); TOP_LEVEL_VALUE = no parent.
        // createPageFromProposal resolves either a UUID or a title, so passing the id
        // through parentTitle is safe.
        const parentRef = selectedParentId === TOP_LEVEL_VALUE ? null : selectedParentId
        const created = await createPageFromProposal(
          supabaseClient,
          {
            type: part.type,
            kind: part.kind,
            title: part.title,
            parentRef,
            blocks: part.blocks ?? [],
          },
          () => crypto.randomUUID()
        )
        await queryClient.invalidateQueries({ queryKey: ['pages'] })
        await queryClient.invalidateQueries({ queryKey: ['pages', 'list'] })
        router.push(
          `/workspace?nodeType=${part.type}&nodeId=${created.id}&nodeName=${encodeURIComponent(part.title)}`
        )
      } catch (err) {
        // Surface the failure by reverting the card to pending so the user can retry.
        console.error('create_page failed', err)
        setCreateDecisions((prev) => {
          const next = { ...prev }
          delete next[toolCallId]
          return next
        })
      }
    },
    [supabaseClient, queryClient, router]
  )

  const messagesBody = (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 font-mono text-sm">
      {!isReady && <p className="text-press-faint text-xs">Loading…</p>}
      {isReady && messages.length === 0 && (
        <p className="text-press-faint text-xs">Start a conversation…</p>
      )}
      {messages.map((message) => {
        const text = message.parts
          .filter((p) => p.type === 'text')
          .map((p) => (p as { type: 'text'; text: string }).text)
          .join('')
        const changeBatches = (message.parts as Array<{ type: string }>).filter(
          isProposeChangesPart
        )
        const createPageParts = (message.parts as Array<{ type: string }>).filter(isCreatePagePart)

        return (
          <div key={message.id} className="space-y-2">
            {text && (
              <div className={message.role === 'user' ? 'text-right' : 'text-left'}>
                {message.role === 'user' ? (
                  // User text is verbatim — never interpret their keystrokes as markdown.
                  <span className="inline-block text-sm px-3 py-1.5 rounded max-w-prose whitespace-pre-wrap text-left bg-press-ink text-press-paper">
                    {text}
                  </span>
                ) : (
                  // Assistant answers author in markdown everywhere; render it typeset
                  // (ticket-20). Streaming-safe: `text` grows token-by-token and
                  // react-markdown re-parses each partial string on every render.
                  <div className="inline-block text-sm px-3 py-1.5 rounded max-w-prose text-left bg-press-accent-soft text-foreground">
                    <Markdown variant="terminal">{text}</Markdown>
                  </div>
                )}
              </div>
            )}
            {changeBatches.map((part) => {
              // While the tool input is still streaming, `part.input` is partially
              // parsed JSON — block payloads can be missing required fields, and the
              // module views render them unvalidated. Wait for the complete input.
              if (part.state === 'input-streaming') return null
              const rawChanges = part.input?.changes ?? []
              const previews = rawChanges.map((c) => previewForChange(c, currentPage?.blocks ?? []))
              const statuses = rawChanges.map((_, i) =>
                changeStatus(changeDecisions, part.toolCallId, i)
              )
              const pending = rawChanges.map((_, i) => i).filter((i) => statuses[i] === 'pending')
              const skipped = changeSkipped[part.toolCallId] ?? 0
              return (
                <div key={part.toolCallId} className="space-y-1.5">
                  <ProposalGroup
                    changes={previews}
                    statuses={statuses}
                    targetName={changeTargets[part.toolCallId]?.nodeName || contextLabel}
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
            {createPageParts.map((part) => {
              // Same streaming caveat as above: a partially-parsed `blocks` array
              // crashes the block previews (e.g. TableView on undefined rows).
              if (part.state === 'input-streaming') return null
              const input = part.input
              if (!input?.title || !input.type) return null
              const status = createDecisions[part.toolCallId] ?? 'pending'
              const selectedParentId =
                createParent[part.toolCallId] ?? resolveProposedParent(input.parentTitle)
              return (
                <CreatePageProposalCard
                  key={part.toolCallId}
                  title={input.title}
                  type={input.type}
                  kind={input.kind}
                  blocks={input.blocks ?? []}
                  reason={input.reason}
                  status={status}
                  selectedParentId={selectedParentId}
                  parentOptions={parentOptions}
                  onParentChange={(id) =>
                    setCreateParent((prev) => ({ ...prev, [part.toolCallId]: id }))
                  }
                  onAccept={() => acceptCreatePage(part.toolCallId, input, selectedParentId)}
                  onReject={() =>
                    setCreateDecisions((prev) => ({ ...prev, [part.toolCallId]: 'rejected' }))
                  }
                />
              )
            })}
          </div>
        )
      })}
      {isStreaming && (
        <div className="text-left">
          <span className="inline-block text-sm px-3 py-1.5 rounded bg-press-accent-soft text-press-faint">
            …
          </span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )

  const inputFooter = (
    <div className="flex items-end gap-2 px-4 py-2 border-t border-press-hair flex-shrink-0">
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Talk to Pond… (/clear · /handoff · /save)"
        rows={2}
        className="flex-1 resize-none border border-border rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring font-mono bg-transparent placeholder:text-press-faint"
        disabled={isStreaming || !isReady}
      />
      <button
        onClick={handleSend}
        disabled={isStreaming || !input.trim() || !isReady}
        className="px-3 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-full hover:opacity-90 disabled:opacity-40 self-end"
      >
        Send
      </button>
    </div>
  )

  return (
    <>
      <TerminalDrawer
        contextLabel={contextLabel}
        height={effectiveHeight}
        collapsed={effectiveCollapsed}
        onToggleCollapsed={toggleCollapsed}
        onHeightChange={handleHeightChange}
        onHeightCommit={handleHeightCommit}
        onClear={handleClear}
        canClear={messages.length > 0}
        footer={inputFooter}
      >
        {messagesBody}
      </TerminalDrawer>
      <SavePickerModal
        isOpen={isSavePickerOpen}
        messages={messages}
        onClose={() => setIsSavePickerOpen(false)}
      />
    </>
  )
}
