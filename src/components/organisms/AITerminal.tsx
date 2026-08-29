'use client'

import { useChat } from '@ai-sdk/react'
import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import {
  getOrCreateConversation,
  saveTranscript,
  dissolveConversation,
} from '@/lib/conversation/client'
import { performHandoff } from '@/lib/conversation/handoff'
import {
  resolveStampTarget,
  type ConversationResolutions,
  type ProposalDecision,
  type ProposalTarget,
} from '@/lib/conversation/resolutions'
import { getPage, listPages } from '@/lib/pages/client'
import { FOCUS_TERMINAL_EVENT } from '@/lib/terminal-focus'
import { toParentOptions } from '@/lib/pages/parent-options'
import { workspaceHref } from '@/lib/pages/nav'
import { writeAcceptedChanges } from '@/lib/pages/accept'
import { createPageFromProposal } from '@/lib/pages/create-page'
import { requestNotify } from '@/lib/deletion/notify-bridge'
import { SavePickerModal } from './SavePickerModal'
import { SlashMenu, type SlashMenuItem } from '@/components/molecules/SlashMenu'
import {
  TerminalDrawer,
  TERMINAL_DEFAULT_HEIGHT,
  TERMINAL_MAX_HEIGHT,
  RAIL_WIDTH_PX,
  clampTerminalHeight,
} from '@/components/molecules/TerminalDrawer'
import { cn } from '@/lib/utils'
import { Markdown } from '@/components/atoms/Markdown'
import { StageText } from '@/components/atoms/StageText'
import { pressKickerClass } from '@/components/atoms/press-kicker'
import { ProposalGroup } from '@/components/molecules/ProposalGroup'
import { FollowupChips } from '@/components/molecules/FollowupChips'
import { QuestionCard, type QuestionAnswerVia } from '@/components/molecules/QuestionCard'
import { SourceList, type Source } from '@/components/molecules/SourceList'
import {
  stageTextForParts,
  hasActiveTool,
  THINKING_STAGE_TEXT,
  type StagePart,
} from '@/lib/conversation/stage-text'
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
import {
  ASK_QUESTION_TYPE,
  SUGGEST_FOLLOWUPS_TYPE,
  type QuestionResolutions,
} from '@/lib/conversation/parts'
import {
  idleLifecycle,
  detectLifecycleIntent,
  detectLifecycleSignal,
  applyLifecycleSignal,
  beginLifecycle,
  lifecycleContextLabel,
  isLifecycleActive,
  type LifecycleState,
} from '@/lib/conversation/lifecycle'
import { previewForChange } from '@/lib/modules/preview'
import type { ModuleChange, ModuleData } from '@/lib/modules/ai-composition'
import type { Block } from '@/lib/documents/types'
import type { NodeType } from '@/lib/supabase/types'

type CommandResult = 'clear' | 'handoff' | 'save' | null

const CHAT_COMMANDS: SlashMenuItem[] = [
  { id: 'clear', name: '/clear', description: 'Clear the conversation and start fresh' },
  { id: 'handoff', name: '/handoff', description: 'Extract entities and start a fresh session' },
  { id: 'save', name: '/save', description: 'Save the conversation to a page' },
]

// Remembered drawer ergonomics (ticket-24).
const TERMINAL_HEIGHT_KEY = 'pond:terminal-height'
const TERMINAL_COLLAPSED_KEY = 'pond:terminal-collapsed'
// When a proposal card arrives the drawer auto-grows to at least this so the
// user can review create-page/diff cards without inner scrolling. Raised from 460
// for the letterpress skin (ticket-32): the create-page card's display-serif title
// and roomier chrome added ~30px, and the whole card (header + preview + Save-to +
// actions) must fit the floor — live-verified against a real create_page proposal.
const PROPOSAL_MIN_HEIGHT = 500

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

/** A propose_changes tool part — the generalized composition batch (t16 Phase 5).
 *  `targetPageId` (ticket-30) names a page OTHER than the open one to edit. */
interface ProposeChangesPart {
  type: 'tool-propose_changes'
  toolCallId: string
  state: string
  input?: { targetPageId?: string; changes?: ModuleChange[] }
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

/** An ask_question tool part — a branch-pause question card (ticket-39). Client-
 *  resolved (no execute); the QuestionCard below drives the answer, which rides
 *  the resolutions envelope. */
interface AskQuestionPart {
  type: typeof ASK_QUESTION_TYPE
  toolCallId: string
  state: string
  input?: { question?: string; options?: string[]; branch?: string }
}

function isAskQuestionPart(part: { type: string }): part is AskQuestionPart {
  return part.type === ASK_QUESTION_TYPE
}

/** A suggest_followups tool part — quiet follow-up chips (ticket-39). Client-
 *  resolved (no execute); clicking a chip sends its text. */
interface SuggestFollowupsPart {
  type: typeof SUGGEST_FOLLOWUPS_TYPE
  toolCallId: string
  state: string
  input?: { suggestions?: string[] }
}

function isSuggestFollowupsPart(part: { type: string }): part is SuggestFollowupsPart {
  return part.type === SUGGEST_FOLLOWUPS_TYPE
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
  // Fix-1 (F1a): the per-skip human reasons for each batch, shown on the card as
  // "couldn't place — <reason>". Session-scoped (not persisted in the resolutions
  // envelope): after reload the count survives via `changeSkipped` and the card
  // degrades to the generic notice.
  const [changeSkipReasons, setChangeSkipReasons] = useState<Record<string, string[]>>({})
  // Proposal-time target page per batch (BUG 1/2 fix): recorded the moment the
  // part streams in, so Accept commits there even after the user navigates away.
  const [changeTargets, setChangeTargets] = useState<Record<string, ProposalTarget>>({})
  // Same-batch binding memory (ticket-31): bindKey→minted-id per proposal, shared
  // across per-change Accept clicks so a metric and its keyed checklist bind even
  // when accepted separately, in either order. A ref (not state): consumed inside
  // the accept write only, never rendered. Session-scoped by design — lost on
  // reload, where a later ref degrades to the clean manual fallback.
  const proposalRefIds = useRef<Record<string, Record<string, string>>>({})

  // create_page decisions + the user-chosen destination, keyed by toolCallId. Same
  // no-execute caveat as propose_changes: the local maps (not the SDK part) drive
  // each card's resolved state and picked parent. `undefined` in the parent map means
  // "not yet touched" — the card falls back to the AI-proposed parent (pre-resolved
  // against the pages list) until the user overrides it.
  const [createDecisions, setCreateDecisions] = useState<Record<string, ProposalStatus>>({})
  const [createParent, setCreateParent] = useState<Record<string, string>>({})

  // Branch-pause question-card answers, keyed by toolCallId (ticket-39). Same
  // no-execute caveat as the proposal maps: the SDK part stays input-available,
  // so this local map drives the card's answered/inert state and rides the
  // resolutions envelope so an answered card stays inert across reloads.
  const [questionAnswers, setQuestionAnswers] = useState<QuestionResolutions>({})

  // The project lifecycle phase (ticket-39). Drives the context-bar phase word
  // and the per-turn step budget; persists in the same envelope so a returning
  // session resumes mid-arc. Advanced deterministically from the user's messages
  // (the user calls the shot) — the model does the adaptive-grill reasoning.
  const [lifecycle, setLifecycle] = useState<LifecycleState>(idleLifecycle)

  // The persistable projection of the decision maps (ticket-19): saved with the
  // transcript so cards stay resolved across reloads, and sent with each chat
  // request so the model sees which proposals were actioned. 'pending' is never
  // stored, only settled decisions. Ticket-39 folds question answers + the
  // lifecycle phase into the SAME envelope.
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
      questions: questionAnswers,
      // Only carry the lifecycle when a project is in flight (keeps ordinary-chat
      // transcripts clean); the route defaults an absent phase to idle chat.
      ...(isLifecycleActive(lifecycle) ? { lifecycle } : {}),
    }
  }, [changeDecisions, createDecisions, changeSkipped, changeTargets, questionAnswers, lifecycle])

  const resetResolutions = useCallback(() => {
    setChangeDecisions({})
    setChangeSkipped({})
    setChangeSkipReasons({})
    setChangeTargets({})
    setCreateDecisions({})
    setCreateParent({})
    setQuestionAnswers({})
    setLifecycle(idleLifecycle())
  }, [])

  // Record a question-card answer (ticket-39): stamps the local map, which rides
  // the envelope so the card renders inert and the answer reaches the model next
  // turn (applyResolutions stamps it as a synthetic tool result).
  const answerQuestion = useCallback(
    (toolCallId: string, answer: string, via: QuestionAnswerVia) => {
      setQuestionAnswers((prev) => ({ ...prev, [toolCallId]: { answer, via } }))
    },
    []
  )

  // Current page blocks — the source of the "before" text in a diff card, and
  // the array we rewrite when a proposal is accepted. Shares the ['page', nodeId]
  // cache with DocumentPanel.
  const { data: currentPage } = useQuery({
    queryKey: ['page', nodeId],
    queryFn: () => (nodeId ? getPage(supabaseClient, nodeId) : Promise.resolve(null)),
    enabled: !!nodeId,
  })

  // The user's pages, used to populate the create_page destination picker, to
  // pre-resolve an AI-proposed parent title to an id, and to resolve a cross-page
  // proposal target BY ID (ticket-30). `pagesLoaded` gates target stamping: a
  // write-once stamp must never be taken against a still-in-flight list (it
  // would mis-read a valid target as missing). Keyed separately from the
  // sidebar's ['pages'] cache (different shape), but invalidated by the same key so a
  // new page refreshes both.
  const { data: allPages = [], isFetched: pagesLoaded } = useQuery({
    queryKey: ['pages', 'list'],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser()
      return user ? listPages(supabaseClient, user.id) : []
    },
  })
  // Cross-page edit previews (ticket-30): an edit/remove aimed at ANOTHER page must
  // diff against THAT page's blocks, not the open page's. Fetch each distinct
  // stamped target id that isn't the open page, on the shared ['page', id] cache
  // (so accept's invalidation refreshes it too). Read-only; the write path still
  // reads the target fresh from the DB at accept time. Missing targets are
  // excluded — there is no page to fetch.
  const crossPageTargetIds = useMemo(() => {
    const ids = new Set<string>()
    for (const t of Object.values(changeTargets ?? {})) {
      if (t.nodeId && !t.missing && t.nodeId !== nodeId) ids.add(t.nodeId)
    }
    return [...ids]
  }, [changeTargets, nodeId])
  const crossPageQueries = useQueries({
    queries: crossPageTargetIds.map((id) => ({
      queryKey: ['page', id],
      queryFn: () => getPage(supabaseClient, id),
    })),
  })
  const blocksForTarget = useMemo(() => {
    const map = new Map<string, Block[] | undefined>()
    crossPageTargetIds.forEach((id, i) => {
      map.set(id, crossPageQueries[i]?.data?.blocks)
    })
    return map
  }, [crossPageTargetIds, crossPageQueries])

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
  const [chatMenuOpen, setChatMenuOpen] = useState(false)
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
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      // Brief visual emphasis so the user knows focus arrived.
      el.classList.add('ring-1', 'ring-press-accent')
      setTimeout(() => el.classList.remove('ring-1', 'ring-press-accent'), 800)
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
    supabaseClient.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const conversation = await getOrCreateConversation(supabaseClient, user.id)
      setConversationId(conversation.id)
      if (conversation.messages.length > 0) {
        setInitialMessageIds(new Set(conversation.messages.map((m) => m.id)))
        setMessages(conversation.messages)
      }
      // Restore card decisions so historical proposal cards render resolved
      // (inert) instead of re-arming with live buttons (ticket-19).
      setChangeDecisions(conversation.resolutions.changes ?? {})
      setChangeSkipped(conversation.resolutions.skipped ?? {})
      setChangeTargets(conversation.resolutions.targets ?? {})
      setCreateDecisions(conversation.resolutions.creates ?? {})
      // Ticket-39: restore answered question cards + the lifecycle phase so an
      // answered branch stays inert and a returning session resumes mid-arc.
      setQuestionAnswers(conversation.resolutions.questions ?? {})
      if (conversation.resolutions.lifecycle) setLifecycle(conversation.resolutions.lifecycle)
      setIsReady(true)
    })
  }, [setMessages, supabaseClient])

  // ── Save transcript after each completed exchange ─────────────────────────
  // Also fires on each card decision (`resolutions` dep) so Accept/Dismiss
  // persists immediately, not only after the next exchange.
  useEffect(() => {
    if (status === 'ready' && conversationId && messages.length > 0) {
      saveTranscript(supabaseClient, conversationId, messages, resolutions).catch(console.error)
    }
  }, [status, conversationId, messages, resolutions, supabaseClient])

  // ── Stamp proposal targets on stream ──────────────────────────────────────
  // The moment a propose_changes part finishes streaming, record which page it
  // was proposed against. Accept later commits to this stamped id regardless of
  // where the user has navigated (BUG 1/2). Persistence rides the transcript-save
  // effect above via the `resolutions` projection.
  //
  // Target resolution (ticket-30) is `resolveStampTarget` (pure, jest-pinned):
  // a batch may name ANOTHER page via `input.targetPageId`, resolved against the
  // user's pages BY ID ONLY (never fuzzy title). While the pages list is still
  // in-flight the stamp is DEFERRED (the effect re-runs when it resolves) — and
  // an id absent from the loaded list stamps `missing: true`, so the card shows
  // a notice and Accept skips. Neither case ever falls back to the open page: a
  // write-once stamp on the wrong page would land the batch's create ops there
  // (review must-fix 1).
  useEffect(() => {
    const unstamped = messages
      .flatMap((m) => m.parts as Array<{ type: string }>)
      .filter(isProposeChangesPart)
      .filter((p) => p.state === 'input-available' && !changeTargets[p.toolCallId])
    if (unstamped.length === 0) return
    const stamps: Record<string, ProposalTarget> = {}
    for (const part of unstamped) {
      const resolved = resolveStampTarget({
        targetPageId: part.input?.targetPageId,
        pages: allPages,
        pagesLoaded,
        openNodeId: nodeId,
        openNodeName: nodeName,
      })
      // 'defer' → stamp on a later run (pages still loading); null → leave
      // unstamped (no safe target; accept skips).
      if (resolved !== 'defer' && resolved !== null) stamps[part.toolCallId] = resolved
    }
    if (Object.keys(stamps).length === 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- records the arrival of streamed tool parts (an external-system event), not a derived-state computation; guarded to fire once per toolCallId
    setChangeTargets((prev) => {
      const next = { ...prev }
      for (const [id, target] of Object.entries(stamps)) {
        if (!next[id]) next[id] = target
      }
      return next
    })
  }, [messages, nodeId, nodeName, changeTargets, allPages, pagesLoaded])

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
  // live from the visible height instead of dead until it crosses the floor. A new
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
      const el = inputRef.current
      if (el) {
        el.focus()
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        el.classList.add('ring-1', 'ring-press-accent')
        setTimeout(() => el.classList.remove('ring-1', 'ring-press-accent'), 800)
      }
      pendingFocus.current = false
    }
  }, [effectiveCollapsed, isReady])

  // ── Handle /clear ─────────────────────────────────────────────────────────
  const handleClear = useCallback(async () => {
    if (!conversationId) return
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()
    if (!user) return
    await dissolveConversation(supabaseClient, conversationId)
    const fresh = await getOrCreateConversation(supabaseClient, user.id)
    setConversationId(fresh.id)
    setMessages([])
    // Stale decisions must not leak into the fresh conversation's transcript.
    resetResolutions()
  }, [conversationId, setMessages, resetResolutions, supabaseClient])

  // ── Handle /handoff ───────────────────────────────────────────────────────
  // Extract entities from the transcript (Quick model), write them all, then
  // dissolve and start a fresh session (build-brief §9).
  const handleHandoff = useCallback(async () => {
    if (!conversationId) return
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()
    if (!user) return
    const { freshConversation, written } = await performHandoff(
      supabaseClient,
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
  }, [conversationId, messages, queryClient, setMessages, resetResolutions, supabaseClient])

  // ── Lifecycle advancement (ticket-39) ─────────────────────────────────────
  // The phase moves on the OUTGOING user message (the user calls the shot): if a
  // project is in flight, the message's transition signal advances / abandons /
  // escapes the phase; otherwise a project-shaped ask (or the escape hatch)
  // BEGINS the arc. The next phase is computed here — synchronously — so it can
  // ride the SAME request body and the route's step budget reflects it this turn.
  const nextLifecycle = useCallback(
    (text: string): LifecycleState => {
      if (isLifecycleActive(lifecycle)) {
        return applyLifecycleSignal(lifecycle, detectLifecycleSignal(text, lifecycle.phase))
      }
      return beginLifecycle(lifecycle, detectLifecycleIntent(text))
    },
    [lifecycle]
  )

  // The one send path — used by the input's Send AND a follow-up chip / question
  // click. Advances the lifecycle from the text, sends it with the up-to-date
  // resolutions (so the route sees this turn's phase + the user's card decisions),
  // and clears the input.
  const sendText = useCallback(
    (text: string) => {
      const advanced = nextLifecycle(text)
      setLifecycle(advanced)
      const outgoing: ConversationResolutions = isLifecycleActive(advanced)
        ? { ...resolutions, lifecycle: advanced }
        : { ...resolutions, lifecycle: undefined }
      // Send the open node so the server can auto-inject its context (Track C),
      // plus the card resolutions so replay carries the user's decisions (t19)
      // and the route reads this turn's lifecycle phase (t39).
      sendMessage({ text }, { body: { nodeId, nodeType, resolutions: outgoing } })
      setInput('')
    },
    [nextLifecycle, resolutions, sendMessage, nodeId, nodeType]
  )

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

    sendText(text)
  }, [input, isStreaming, handleClear, handleHandoff, sendText])

  // A follow-up chip / question option click sends its text as the next message
  // (ticket-39). Ignored mid-stream so a click can't interleave a turn.
  const handleChipPick = useCallback(
    (chip: string) => {
      if (isStreaming) return
      sendText(chip)
    },
    [isStreaming, sendText]
  )

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      setChatMenuOpen(false)
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
      const result = await writeAcceptedChanges({
        supabase: supabaseClient,
        queryClient,
        resolutions,
        toolCallId,
        openNodeId: nodeId,
        changes: indices.map((i) => allChanges[i]),
        // Ticket-31: refs resolve against the FULL batch (not just this click's
        // subset), with minted ids remembered per proposal across clicks.
        batch: allChanges,
        refIds: (proposalRefIds.current[toolCallId] ??= {}),
      })
      if (result.skipped > 0) {
        setChangeSkipped((prev) => ({
          ...prev,
          [toolCallId]: (prev[toolCallId] ?? 0) + result.skipped,
        }))
        setChangeSkipReasons((prev) => ({
          ...prev,
          [toolCallId]: [...(prev[toolCallId] ?? []), ...result.skippedReasons],
        }))
      }
      // Fix-1 (F12): a toast receipt for every accept — honest about applied AND
      // skipped counts, with an Open action to the page the batch landed on. The
      // stamped target name is the human label; contextLabel is the same-page
      // fallback an unstamped legacy card writes to. Fired via the notify bridge:
      // the terminal mounts outside the DeletionUndoProvider (see notify-bridge).
      const targetName = changeTargets[toolCallId]?.nodeName || contextLabel
      const blockNoun = (n: number) => `${n} block${n === 1 ? '' : 's'}`
      if (result.applied > 0) {
        const suffix =
          result.skipped > 0 ? ` — ${blockNoun(result.skipped)} couldn’t be placed` : ' ✓'
        const openTarget = result.targetId
        requestNotify({
          message: `Added ${blockNoun(result.applied)} to ${targetName}${suffix}`,
          action: openTarget
            ? () =>
                router.push(
                  workspaceHref({
                    id: openTarget,
                    type: allPages.find((p) => p.id === openTarget)?.type ?? 'page',
                    title: targetName,
                  })
                )
            : undefined,
          actionLabel: 'Open',
        })
      } else if (result.skipped > 0) {
        // Nothing landed at all — say so plainly, never a silent "success".
        requestNotify({
          message: `Nothing added to ${targetName} — ${blockNoun(result.skipped)} couldn’t be placed`,
        })
      }
    },
    [
      decideChanges,
      supabaseClient,
      queryClient,
      resolutions,
      nodeId,
      changeTargets,
      contextLabel,
      router,
      allPages,
    ]
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

  // "Open page" on a cross-page proposal card (ticket-30): navigate to the
  // stamped target. The page's type is looked up here (not inline in JSX) so
  // the render path stays a plain callback reference.
  const openTargetPage = useCallback(
    (target: ProposalTarget) => {
      router.push(
        workspaceHref({
          id: target.nodeId,
          type: allPages.find((p) => p.id === target.nodeId)?.type ?? 'page',
          title: target.nodeName,
        })
      )
    },
    [router, allPages]
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
        router.push(workspaceHref({ id: created.id, type: part.type, title: part.title }))
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

  // ── Streaming stage text (ticket-32) ──────────────────────────────────────
  // A 25–30s generation used to show a bare "…". Derive a human stage line from the
  // tool-call parts already in the latest assistant message ("reading Ceramics
  // Studio Plan…", "drafting your page…") — see lib/conversation/stage-text. Page
  // ids in a read_page part resolve to titles against the loaded pages list. Only
  // the LATEST assistant message's parts feed the line (an earlier turn's tools are
  // done), and only while streaming with no visible answer yet does the terminal
  // render it (below).
  const resolvePageName = useCallback(
    (id: string) => allPages.find((p) => p.id === id)?.title,
    [allPages]
  )
  const stageLine = useMemo(() => {
    if (!isStreaming) return null
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant') return null
    return stageTextForParts(last.parts as StagePart[], { resolvePageName })
  }, [isStreaming, messages, resolvePageName])
  // Fix-5 (F10): the stage line now also shows while a tool is still running even
  // after reply text has begun streaming. We track whether the latest assistant message
  // has any ACTIVE tool part — if so, the stage line stays visible alongside the
  // growing text so the user knows a long tool call is still in progress.
  const lastAssistantHasActiveTool = useMemo(() => {
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant') return false
    return hasActiveTool(last.parts as StagePart[])
  }, [messages])

  // The transcript shares the document's own column — the drawer spans the full
  // window while the document centers inside <main> (right of the Rail), so a
  // matching paddingLeft: RAIL_WIDTH_PX here makes this max-w-2xl column center
  // over the exact same region DocumentPanel centers in. One typeset object, not a
  // console bolted under a document. RAIL_WIDTH_PX is the single shared metric
  // (ticket-42) — imported from TerminalDrawer so the header chrome and transcript
  // text are always coupled to the same value.
  const messagesBody = (
    <div className="flex-1 overflow-y-auto py-4" style={{ paddingLeft: RAIL_WIDTH_PX }}>
      <div className="mx-auto w-full max-w-2xl space-y-6 px-8">
        {!isReady && <p className="font-serif text-sm italic text-press-faint">Loading…</p>}
        {isReady && messages.length === 0 && (
          <p className="font-serif text-sm italic text-press-faint">
            Talk with Pond — think out loud, ask, or compose.
          </p>
        )}
        {messages.map((message) => {
          const text = message.parts
            .filter((p) => p.type === 'text')
            .map((p) => (p as { type: 'text'; text: string }).text)
            .join('')
          const changeBatches = (message.parts as Array<{ type: string }>).filter(
            isProposeChangesPart
          )
          const createPageParts = (message.parts as Array<{ type: string }>).filter(
            isCreatePagePart
          )
          // Ticket-39: branch-pause question cards + follow-up chips, both client-
          // resolved tool parts on the assistant message.
          const questionParts = (message.parts as Array<{ type: string }>).filter(isAskQuestionPart)
          const followupParts = (message.parts as Array<{ type: string }>).filter(
            isSuggestFollowupsPart
          )
          // Web-search citations (ticket-29): the route streams `source-url` parts for
          // each cited result; collect them so the answer carries a Sources row.
          const sources: Source[] = (
            message.parts as Array<{
              type: string
              sourceId?: string
              url?: string
              title?: string
            }>
          )
            .filter((p) => p.type === 'source-url' && typeof p.url === 'string')
            .map((p, i) => ({
              sourceId: p.sourceId ?? `${message.id}-src-${i}`,
              url: p.url!,
              title: p.title,
            }))

          return (
            <div key={message.id} className="space-y-3">
              {text &&
                (message.role === 'user' ? (
                  // The user's line is a quiet aside — left-aligned on the shared reading edge,
                  // with a faint sage left border. NOT a chat bubble competing with the authored reply.
                  <p className="whitespace-pre-wrap border-l-2 border-press-accent/40 bg-press-accent-wash pl-3.5 pr-2 py-2 font-serif text-[0.95rem] leading-[1.55] text-press-body">
                    {text}
                  </p>
                ) : (
                  // The AI reply is set as full typeset prose in the document's own
                  // measure — letter-style correspondence, not a card in a console. A
                  // press-hair rule with a small-caps "Pond" attribution heads each
                  // reply; the prose below is the same Press serif the page reads in.
                  // Arrives with one calm breath (press-arrive). Streaming-safe: `text`
                  // grows token-by-token and react-markdown re-parses each partial
                  // (ticket-20).
                  <div className="press-arrive">
                    <div className="mb-2.5 flex items-center gap-3">
                      <span className={pressKickerClass}>Pond</span>
                      <span aria-hidden className="h-px flex-1 bg-press-hair" />
                    </div>
                    <Markdown variant="terminal">{text}</Markdown>
                    {sources.length > 0 && <SourceList sources={sources} />}
                  </div>
                ))}
              {/* Sources can arrive on an assistant message with no text (rare, but the
                citation should still show) — same attributed-letter treatment. */}
              {message.role !== 'user' && !text && sources.length > 0 && (
                <div className="press-arrive">
                  <div className="mb-2.5 flex items-center gap-3">
                    <span className={pressKickerClass}>Pond</span>
                    <span aria-hidden className="h-px flex-1 bg-press-hair" />
                  </div>
                  <SourceList sources={sources} />
                </div>
              )}
              {changeBatches.map((part) => {
                // While the tool input is still streaming, `part.input` is partially
                // parsed JSON — block payloads can be missing required fields, and the
                // module views render them unvalidated. Wait for the complete input.
                if (part.state === 'input-streaming') return null
                const rawChanges = part.input?.changes ?? []
                // The stamped target (ticket-30), computed once: `crossPage` is set
                // when the batch resolved to a real page other than the open one.
                const target = changeTargets[part.toolCallId]
                const targetMissing = target?.missing === true
                const crossPage =
                  target && !targetMissing && target.nodeId !== nodeId ? target : null
                // Cross-page edit: diff against the TARGET page's blocks; fall back
                // to the open page's blocks for a same-page proposal.
                const targetBlocks = crossPage
                  ? (blocksForTarget.get(crossPage.nodeId) ?? [])
                  : (currentPage?.blocks ?? [])
                const previews = rawChanges.map((c) => previewForChange(c, targetBlocks))
                const statuses = rawChanges.map((_, i) =>
                  changeStatus(changeDecisions, part.toolCallId, i)
                )
                const pending = rawChanges.map((_, i) => i).filter((i) => statuses[i] === 'pending')
                // Accept-all sweeps REQUESTED changes only (review must-fix 3): an
                // inferred side-effect stays pending for its own click.
                const pendingRequested = pending.filter((i) => rawChanges[i]?.inferred !== true)
                return (
                  <div key={part.toolCallId} className="press-arrive space-y-1.5">
                    <ProposalGroup
                      changes={previews}
                      statuses={statuses}
                      targetName={target?.nodeName || contextLabel}
                      targetMissing={targetMissing}
                      onOpenTarget={crossPage ? () => openTargetPage(crossPage) : undefined}
                      skippedCount={changeSkipped[part.toolCallId] ?? 0}
                      skippedReasons={changeSkipReasons[part.toolCallId] ?? []}
                      onAccept={(i) => acceptChanges(part.toolCallId, rawChanges, [i])}
                      onReject={(i) => decideChanges(part.toolCallId, [i], 'rejected')}
                      onEdit={(i) => editChange(part.toolCallId, rawChanges, i)}
                      onAcceptAll={() =>
                        acceptChanges(part.toolCallId, rawChanges, pendingRequested)
                      }
                      onRejectAll={() => decideChanges(part.toolCallId, pending, 'rejected')}
                    />
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
                    className="press-arrive"
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
              {/* Branch-pause question cards (ticket-39 §2): a decision that is the
                  user's to make. Answering rides the resolutions envelope; an
                  answered card renders inert. */}
              {questionParts.map((part) => {
                if (part.state === 'input-streaming') return null
                const q = part.input
                if (!q?.question || !Array.isArray(q.options) || q.options.length === 0) return null
                return (
                  <QuestionCard
                    key={part.toolCallId}
                    question={q.question}
                    options={q.options}
                    branch={q.branch}
                    answer={questionAnswers[part.toolCallId]?.answer}
                    onAnswer={(answer, via) => answerQuestion(part.toolCallId, answer, via)}
                  />
                )
              })}
              {/* Follow-up chips (ticket-39 §3): quiet suggestions below the reply;
                  clicking one sends its text. Disabled mid-stream. */}
              {followupParts.map((part) => {
                if (part.state === 'input-streaming') return null
                const chips = part.input?.suggestions ?? []
                if (chips.length === 0) return null
                return (
                  <FollowupChips
                    key={part.toolCallId}
                    chips={chips}
                    label="Next"
                    disabled={isStreaming}
                    onPick={handleChipPick}
                  />
                )
              })}
            </div>
          )
        })}
        {/* Stage line (ticket-32 + Fix-5/F10): shown while streaming whenever a tool
            is still running — even after reply text has started arriving. A long tool
            call (read_page, web_search) alongside growing text would otherwise look
            stalled; the stage line stays until the tool part settles. Falls back to
            THINKING_STAGE_TEXT while the model is working but no narratable tool is
            active yet. */}
        {isStreaming && lastAssistantHasActiveTool && (
          <StageText label={stageLine ?? THINKING_STAGE_TEXT} />
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )

  // Auto-grow the textarea with content (cap 6 lines) so the user can review
  // multi-line input without scrolling inside the field.
  const inputRows = Math.min(6, Math.max(2, (input.match(/\n/g)?.length ?? 0) + 1))

  // The input stays quietly monospace by design (ticket-32): it is the console
  // *threshold* — the one seam where the user's typed intent crosses into the serif
  // correspondence. Mono keeps commands (/clear · /handoff · /save) legible as
  // commands and marks "you are typing" distinct from "Pond is speaking". Its dress
  // is pure Press, no stock widgets: a hairline rule above, a bare paper field whose
  // baseline inks sage on focus, and a small-caps Send in the kicker voice — set in
  // the same centered column as the correspondence above.
  //
  // ticket-42: the border-t and padding all live inside the column measure —
  // no full-width hairline spanning edge-to-edge. paddingLeft: RAIL_WIDTH_PX
  // shares the single metric with TerminalDrawer's header chrome.
  const inputFooter = (
    <div className="flex-shrink-0" style={{ paddingLeft: RAIL_WIDTH_PX }}>
      <div className="mx-auto w-full max-w-2xl px-8">
        <div className="border-t border-press-hair">
          <div className="flex items-end gap-4 py-3">
            <div className="relative flex-1">
              {chatMenuOpen && (
                <SlashMenu
                  items={CHAT_COMMANDS}
                  onSelect={(item) => {
                    setChatMenuOpen(false)
                    setInput('')
                    if (item.id === 'clear') {
                      handleClear()
                    } else if (item.id === 'handoff') {
                      handleHandoff()
                    } else if (item.id === 'save') {
                      setIsSavePickerOpen(true)
                    }
                  }}
                  onClose={() => setChatMenuOpen(false)}
                  className="absolute bottom-full left-0 z-20 w-64 mb-1"
                />
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  const val = e.target.value
                  setInput(val)
                  // Open command menu when the user types exactly '/' (or starts with '/' and no space yet)
                  if (val === '/' || (val.startsWith('/') && !val.includes(' '))) {
                    setChatMenuOpen(true)
                  } else {
                    setChatMenuOpen(false)
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder="Talk to Pond… (/clear · /handoff · /save)"
                rows={inputRows}
                className="w-full resize-none border-0 border-b border-press-line bg-transparent px-0 py-1.5 font-mono text-sm text-press-body outline-none transition-colors placeholder:text-press-faint focus:border-press-accent disabled:opacity-60"
                disabled={isStreaming || !isReady}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={isStreaming || !input.trim() || !isReady}
              className={cn(
                pressKickerClass,
                'self-end pb-2 text-press-accent transition-colors hover:text-press-ink disabled:opacity-40 disabled:hover:text-press-accent'
              )}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // The quiet phase indicator (ticket-39 §2): while a project is in flight the
  // context bar reads e.g. "Kiln Studio · charting"; otherwise just the base
  // context label. Derived from the lifecycle state (grilling → charting →
  // building), kept Press-calm.
  const phaseContextLabel = lifecycleContextLabel(lifecycle, contextLabel)

  return (
    <>
      <TerminalDrawer
        contextLabel={phaseContextLabel}
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
