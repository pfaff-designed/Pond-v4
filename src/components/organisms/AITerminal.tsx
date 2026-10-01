'use client'

import { useChat } from '@ai-sdk/react'
import { useRef, useEffect, useMemo, useState, useReducer, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
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
import { useWorkspace } from '@/lib/workspace/context'
import {
  FOCUS_TERMINAL_EVENT,
  OPEN_THREAD_MESSAGE_EVENT,
  type OpenThreadMessageDetail,
} from '@/lib/terminal-focus'
import { ParentGoneError, makePageFromAnswer, recordPageProposal } from '@/lib/pages/make-page'
import {
  DEFAULT_PAGE_KIND,
  derivePageName,
  formatThreadTime,
  openPageProposalIds,
  readChips,
  readStamp,
  withReadStamp,
  type PageProposal,
  type ReadPartLike,
} from '@/lib/conversation/page-proposals'
import { machineEyebrowClass } from '@/components/atoms/kicker'
import { ReadChips } from '@/components/molecules/ReadChips'
import { AnswerActions } from '@/components/molecules/AnswerActions'
import { PageProposalCard } from '@/components/molecules/PageProposalCard'
import { toParentOptions } from '@/lib/pages/parent-options'
import { workspaceHref, workspaceBasePath } from '@/lib/pages/nav'
import { insertPageOptimistic } from '@/lib/pages/tree'
import { writeAcceptedChanges } from '@/lib/pages/accept'
import {
  createPageFromProposal,
  defineSchemaFromProposal,
  collectionPropertyResolver,
  addRowFromProposal,
  collectionNameResolver,
  collectionTitleResolver,
  unresolvableRollupNames,
} from '@/lib/pages/create-page'
import { configureViewFromProposal, resolveCollectionByName } from '@/lib/pages/configure-view'
import { promoteTableFromProposal, inferColumnType } from '@/lib/pages/promote-table'
import { linkRecordsFromProposal } from '@/lib/pages/link-records'
import { requestNotify } from '@/lib/deletion/notify-bridge'
import { SavePickerModal } from './SavePickerModal'
import { SlashMenu, type SlashMenuItem } from '@/components/molecules/SlashMenu'
import {
  TextSelectionPopover,
  type SelectionContext,
} from '@/components/molecules/TextSelectionPopover'
import { VoiceInputButton } from '@/components/molecules/VoiceInputButton'
import { CsvAttachmentPill } from '@/components/molecules/CsvAttachmentPill'
import { FileAttachmentChip } from '@/components/molecules/FileAttachmentChip'
import { useAttachments } from '@/lib/attachments/use-attachments'
import { ATTACHMENT_ACCEPT } from '@/lib/attachments/validate'
import { QuoteChip } from '@/components/atoms/QuoteChip'
import { GhostSuggestion, useGhostKeyHandler } from '@/components/molecules/GhostSuggestion'
import { parseCsv, formatCsvContext, type CsvParseOk } from '@/lib/csv/parse-csv'
import {
  TerminalDrawer,
  TERMINAL_DEFAULT_HEIGHT,
  TERMINAL_MAX_HEIGHT,
  clampTerminalHeight,
} from '@/components/molecules/TerminalDrawer'
import { PROPOSAL_MIN_HEIGHT } from '@/lib/layout/terminal-height'
import { Markdown } from '@/components/molecules/Markdown'
import { StageText } from '@/components/molecules/StageText'
import { ProposalGroup, type ProposalGroupCard } from '@/components/molecules/ProposalGroup'
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
import { DefineSchemaProposalCard } from '@/components/molecules/DefineSchemaProposalCard'
import { AddRowProposalCard } from '@/components/molecules/AddRowProposalCard'
import {
  PromoteTableProposalCard,
  type PromotedColumn,
} from '@/components/molecules/PromoteTableProposalCard'
import { ConfigureViewProposalCard } from '@/components/molecules/ConfigureViewProposalCard'
import { LinkRecordsProposalCard } from '@/components/molecules/LinkRecordsProposalCard'
import {
  unresolvedProposalIds,
  batchStatus,
  reconcileCardStatus,
  DEFINE_SCHEMA_TYPE,
  ADD_ROW_TYPE,
  PROMOTE_TABLE_TYPE,
  CONFIGURE_VIEW_TYPE,
  LINK_RECORDS_TYPE,
  type ProposalMessageLike,
} from '@/lib/conversation/proposals'
import { ASK_QUESTION_TYPE, SUGGEST_FOLLOWUPS_TYPE } from '@/lib/conversation/parts'
import {
  detectLifecycleIntent,
  detectLifecycleSignal,
  applyLifecycleSignal,
  beginLifecycle,
  lifecycleContextLabel,
  isLifecycleActive,
  type LifecycleState,
} from '@/lib/conversation/lifecycle'
import {
  proposalReducer,
  initialProposalState,
  projectResolutions,
  type ProposalType,
} from '@/lib/conversation/proposal-store'
import { resolveChangeLogRecord } from '@/lib/change-log/resolve'
import { listRecordsByToolCalls } from '@/lib/change-log/store'
import { previewForChange } from '@/lib/modules/preview'
import type { ModuleChange, ModuleData } from '@/lib/modules/ai-composition'
import type { Block } from '@/lib/documents/types'
import type { NodeType } from '@/lib/supabase/types'
import { withSchema, isCollection, readSchema, type AiPropertyDef } from '@/lib/properties/schema'
import type {
  ViewMode,
  FilterOp,
  ViewChartKind,
  ViewAggValue,
  ViewFigureFormat,
} from '@/lib/modules/view/schema'

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

/** The canned note `revise` sends on an outdated card (#98, G2): Pond redrafts
 *  the diff against the page as it now stands. */
const REVISE_NOTE =
  'the page changed since this was proposed — revise it against the page as it now stands.'

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

/** A define_schema tool part — a proposed property schema for an EXISTING page
 *  (#17 slice 5). Client-resolved (no execute); the card below drives
 *  accept/reject + which page it applies to. */
interface DefineSchemaPart {
  type: typeof DEFINE_SCHEMA_TYPE
  toolCallId: string
  state: string
  input?: {
    pageId?: string
    properties?: AiPropertyDef[]
    reason?: string
  }
}

function isDefineSchemaPart(part: { type: string }): part is DefineSchemaPart {
  return part.type === DEFINE_SCHEMA_TYPE
}

/** An add_row tool part — a proposed row (a schema-bound child page) for an
 *  EXISTING collection (#18). Client-resolved (no execute); the card below drives
 *  accept/reject + which collection it joins. */
interface AddRowPart {
  type: typeof ADD_ROW_TYPE
  toolCallId: string
  state: string
  input?: {
    collectionId?: string
    title?: string
    props?: Record<string, unknown>
    reason?: string
  }
}

function isAddRowPart(part: { type: string }): part is AddRowPart {
  return part.type === ADD_ROW_TYPE
}

/** A configure_view tool part — a proposed view config (mode + optional group-by /
 *  sort / filter, keyed by property NAME) for an EXISTING collection (#19 slice 5).
 *  Client-resolved (no execute); the card below drives accept/reject + which
 *  collection it applies to. */
interface ConfigureViewPart {
  type: typeof CONFIGURE_VIEW_TYPE
  toolCallId: string
  state: string
  input?: {
    pageId?: string
    mode?: ViewMode
    groupBy?: string
    sort?: { key: string; dir: 'asc' | 'desc' }
    filter?: { property: string; op: FilterOp; value: string }
    startDate?: string
    endDate?: string
    /** Chart mode (#111): kind + the property NAMES that bucket and get plotted. */
    chart?: {
      kind: ViewChartKind
      xProperty?: string
      series: Array<{ property: string; agg: ViewAggValue }>
      stacked?: boolean
      target?: number
    }
    /** Big-number mode (#111): the one figure, by property NAME + verb + format. */
    bigNumber?: {
      property?: string
      agg: ViewAggValue
      format?: ViewFigureFormat
      delta?: { property: string; value: string }
    }
    /** Linked view (#41): NAME of ANOTHER collection whose rows this view draws. */
    targetCollection?: string
    reason?: string
  }
}

function isConfigureViewPart(part: { type: string }): part is ConfigureViewPart {
  return part.type === CONFIGURE_VIEW_TYPE
}

/** A link_records tool part — a proposal to link EXISTING rows through an
 *  existing relation property (#40). Everything is named by TITLE (the model
 *  never sees row ids); the accept path resolves titles→ids strictly on accept.
 *  Client-resolved (no execute); the card below drives accept/reject + which
 *  collection the source row is in. */
interface LinkRecordsPart {
  type: typeof LINK_RECORDS_TYPE
  toolCallId: string
  state: string
  input?: {
    fromRow?: string
    fromCollection?: string
    relation?: string
    toRows?: string[]
    reason?: string
  }
}

function isLinkRecordsPart(part: { type: string }): part is LinkRecordsPart {
  return part.type === LINK_RECORDS_TYPE
}

/** A promote_table tool part — a proposal to convert an EXISTING freeform `table`
 *  block on a page into a schema-bound collection (#29). Client-resolved (no
 *  execute); the card below drives accept/reject + which page it applies to. The
 *  model names only the page + block by id — the terminal reads that table to
 *  preview the inferred columns. */
interface PromoteTablePart {
  type: typeof PROMOTE_TABLE_TYPE
  toolCallId: string
  state: string
  input?: {
    pageId?: string
    blockId?: string
    reason?: string
  }
}

function isPromoteTablePart(part: { type: string }): part is PromoteTablePart {
  return part.type === PROMOTE_TABLE_TYPE
}

/** Preview what a promote_table would produce, read from the host page's blocks:
 *  the named `table` block (or the page's sole table when unnamed) reduced to its
 *  inferred columns + row count + caption. Null when the page/table isn't resolved
 *  yet (still loading, or the id doesn't match), so the card is held back until it
 *  has a real preview to show. Mirrors the inference the accept path runs. */
function tablePromotionPreview(
  page: { blocks: Block[] } | undefined,
  blockId: string | undefined
): { columns: PromotedColumn[]; rowCount: number; tableTitle?: string } | null {
  if (!page) return null
  const tables = (page.blocks ?? []).filter((b) => (b as { type?: string }).type === 'table')
  const table =
    (blockId ? tables.find((b) => (b as { id?: string }).id === blockId) : undefined) ??
    (tables.length === 1 ? tables[0] : undefined)
  if (!table) return null
  const t = table as unknown as { title?: string; columns: string[]; rows: { cells: string[] }[] }
  const columns: PromotedColumn[] = t.columns.map((name, col) => ({
    name,
    type: inferColumnType(t.rows.map((r) => r.cells[col] ?? '')),
  }))
  return { columns, rowCount: t.rows.length, tableTitle: t.title }
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
  const contextLabel = nodeName ?? 'life'

  const [isSavePickerOpen, setIsSavePickerOpen] = useState(false)
  const queryClient = useQueryClient()
  // Lazily created on first use, not at render — so an envless mount (Storybook,
  // CI) never constructs a real client and throws (#38); queryFns, effects and
  // the accept handlers below construct it only when they actually run.
  const getSupabase = useLazySupabase()
  const workspace = useWorkspace()
  const basePath = workspaceBasePath(workspace)

  // A no-execute client tool's part stays `input-available` after addToolOutput,
  // so we can't drive the card's resolved state off the SDK part — the local maps
  // below track the user's decision instead.
  //
  // All proposal client-state now lives in ONE deep, pure, jest-pinned reducer
  // (Deep Proposal Store, Candidate 1) — see lib/conversation/proposal-store. The
  // ~20 flat useState maps this replaced are destructured back into their old local
  // names below, so every READER downstream is unchanged; only WRITES dispatch.
  const [proposals, dispatch] = useReducer(proposalReducer, undefined, initialProposalState)
  // Every SETTLED card advances its change-log record off `proposed` (#146 item 1).
  // Without this the propose path's records stayed `proposed` for good, so the
  // log's headline figure — "N proposed, waiting on you" — counted decisions the
  // person had already made.
  //
  // Called ALONGSIDE the dispatch that settles a card, never instead of it, and
  // deliberately not folded into `dispatch` itself: wrapping useReducer's dispatch
  // trips react-hooks/refs and makes all thirteen of its consumers report a
  // missing dependency, because the lint rule treats only useReducer's own
  // dispatch as stable.
  //
  // The one card this is NOT called for is an accepted block edit:
  // `writeAcceptedChanges` has to commit the page and advance the record in a
  // single transaction (spec #110 criterion 3), so it owns that advance.
  const loggedDecisions = useRef<Set<string>>(new Set())
  const logDecision = useCallback(
    (toolCallId: string, decision: ProposalDecision) => {
      // A batch reject dispatches once per change index; the record advances once.
      if (loggedDecisions.current.has(toolCallId)) return
      // Fire-and-forget: the card has already resolved, and resolveChangeLogRecord
      // swallows its own failures rather than raising an unhandled rejection.
      void (async () => {
        const supabase = getSupabase()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        // No session: leave the call UNMARKED so a later decision can still log it.
        // Marking before this check meant one signed-out moment blocked that call's
        // advance for the rest of the session.
        if (!user) return
        if (loggedDecisions.current.has(toolCallId)) return
        loggedDecisions.current.add(toolCallId)
        await resolveChangeLogRecord(supabase, {
          userId: user.id,
          workspace,
          toolCallId,
          decision,
        })
      })()
    },
    [getSupabase, workspace]
  )

  /**
   * Reject a non-block card and advance its record together, so the two cannot
   * drift. Reject only: there is no write to fail, so the record can settle at
   * the same moment the card does.
   *
   * An ACCEPT cannot work this way. Every accept handler below settles its card
   * optimistically and then reverts it to pending if the write throws, so
   * advancing the record here would stamp `accepted` on a change that never
   * landed — and the log only grows, so that stamp could not be taken back.
   * Accepts call logDecision at the END of their try block instead.
   */
  const rejectCard = useCallback(
    (type: ProposalType, toolCallId: string) => {
      dispatch({ kind: 'resolve', type, id: toolCallId, decision: 'rejected' })
      logDecision(toolCallId, 'rejected')
    },
    [logDecision]
  )
  // Same-batch bindKey→minted-id memory (ticket-31) stays a ref, not reducer state:
  // writeAcceptedChanges mutates it in place across accept clicks; never rendered/projected/reseeded.
  const proposalRefIds = useRef<Record<string, Record<string, string>>>({})
  // #98 — the card a request-changes note (or an outdated revise) was sent on:
  // the next propose_changes to stream in is Pond's revision of it. It lives for
  // exactly ONE turn; the effect below clears it when that turn settles.
  const pendingRevisionOf = useRef<string | null>(null)
  const {
    changes: changeDecisions,
    creates: createDecisions,
    schemas: schemaDecisions,
    rows: rowDecisions,
    promotions: promotionDecisions,
    views: viewDecisions,
    links: linkDecisions,
    skipped: changeSkipped,
    targets: changeTargets,
    questions: questionAnswers,
    schemaInertRollups,
    viewReplaced,
    lifecycle,
    skipReasons: changeSkipReasons,
    linkErrors,
    promotionSnapshot,
    createParent,
    schemaTarget,
    rowTarget,
    viewTarget,
    linkTarget,
    promotionTarget,
    pageProposals,
    pageProposalErrors,
    changeNotes,
    revisions,
  } = proposals

  // The persistable projection of the decision maps (ticket-19): saved with the
  // transcript so cards stay resolved across reloads, and sent with each chat
  // request so the model sees which proposals were actioned. 'pending' is never
  // stored, only settled decisions. Ticket-39 folds question answers + the
  // lifecycle phase into the SAME envelope.
  const resolutions: ConversationResolutions = useMemo(
    () => projectResolutions(proposals),
    [proposals]
  )

  const resetResolutions = useCallback(() => {
    dispatch({ kind: 'reset' })
  }, [])

  // Record a question-card answer (ticket-39): stamps the local map, which rides
  // the envelope so the card renders inert and the answer reaches the model next
  // turn (applyResolutions stamps it as a synthetic tool result).
  const answerQuestion = useCallback(
    (toolCallId: string, answer: string, via: QuestionAnswerVia) => {
      dispatch({ kind: 'answerQuestion', id: toolCallId, answer, via })
    },
    []
  )

  // Current page blocks — the source of the "before" text in a diff card, and
  // the array we rewrite when a proposal is accepted. Shares the ['page', nodeId]
  // cache with DocumentPanel.
  const { data: currentPage } = useQuery({
    queryKey: ['page', nodeId],
    queryFn: () => (nodeId ? getPage(getSupabase(), nodeId) : Promise.resolve(null)),
    enabled: !!nodeId,
  })

  // The user's pages, used to populate the create_page destination picker, to
  // pre-resolve an AI-proposed parent title to an id, and to resolve a cross-page
  // proposal target BY ID (ticket-30). `pagesLoaded` gates target stamping: a
  // write-once stamp must never be taken against a still-in-flight list (it
  // would mis-read a valid target as missing).
  //
  // MUST be keyed separately from the sidebar's ['pages', workspace] cache: that
  // one is fed by `fetchPages`, a lean projection with NO `props`. This query is
  // `listPages` — the full page shape *including* `props`, which #18's
  // `collectionOptions` needs to read `_schema` (isCollection). Sharing the key
  // let React Query serve the props-less shape here, silently emptying the
  // collection picker. The extra key segment keeps them distinct while
  // prefix-based `invalidateQueries(['pages'])` still refreshes both.
  const { data: allPages = [], isFetched: pagesLoaded } = useQuery({
    queryKey: ['pages', workspace, 'full'],
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      return user ? listPages(supabase, user.id, workspace) : []
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
      queryFn: () => getPage(getSupabase(), id),
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

  // The add_row destination picker (#18) offers ONLY collections — pages that
  // carry a `_schema` — so a row can never be added to a page with no columns to
  // coerce it against. Same duplicate-title disambiguation as parentOptions.
  const collectionOptions: ParentOption[] = useMemo(
    () => toParentOptions(allPages.filter((p) => isCollection(p.props))),
    [allPages]
  )
  // The promote_table destination picker (#29) offers ONLY pages that host at
  // least one freeform `table` block — the only pages there is a table to convert.
  const tableHostOptions: ParentOption[] = useMemo(
    () =>
      toParentOptions(
        allPages.filter((p) =>
          (p.blocks ?? []).some((b) => (b as { type?: string }).type === 'table')
        )
      ),
    [allPages]
  )
  // Preview a relation's proposed target NAME as the collection accept would
  // actually link into (#37, relation spec decision 8) — same resolution rules as
  // the accept path's collectionNameResolver, but yielding the canonical title
  // for the define_schema card's per-property preview.
  const resolveTargetTitle = useMemo(() => collectionTitleResolver(allPages), [allPages])
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
  const { messages, sendMessage, setMessages, status, stop, error, clearError } = useChat()
  const [input, setInput] = useState('')
  // 6a frame 2: "an error keeps nothing" — a turn that failed mid-stream drops
  // its partial answer, so the thread never holds half an answer as if it were
  // one. (Esc / stop is the opposite: it KEEPS what arrived — `stop` leaves the
  // partial message in place.) The error line below offers ask again.
  //
  // Exactly ONE message goes: the answer that was in flight when the error
  // arrived. Keyed off the error object (and not off `messages`), because a turn
  // can leave two assistant messages in a row — a tool-only one, then the text —
  // and re-running on the shortened list would eat the earlier, complete answer
  // too.
  const droppedForError = useRef<unknown>(null)
  useEffect(() => {
    if (!error) {
      droppedForError.current = null
      return
    }
    if (droppedForError.current === error) return
    droppedForError.current = error
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      return last?.role === 'assistant' ? prev.slice(0, -1) : prev
    })
  }, [error, setMessages])
  const [chatMenuOpen, setChatMenuOpen] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const isStreaming = status === 'streaming' || status === 'submitted'

  // ── Highlight-to-ask quote context (ticket-40 F20) ────────────────────────
  const [quoteCtx, setQuoteCtx] = useState<SelectionContext | null>(null)

  const handleAskFromSelection = useCallback((ctx: SelectionContext) => {
    setQuoteCtx(ctx)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  // ── CSV attachment (ticket-40 F16) ────────────────────────────────────────
  const [csvAttachment, setCsvAttachment] = useState<{
    parsed: CsvParseOk
    filename: string
  } | null>(null)

  const processCsvFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const raw = e.target?.result
      if (typeof raw !== 'string') return
      const result = parseCsv(raw)
      if (!result.ok) {
        setInput(`[CSV error: ${result.message}]`)
        return
      }
      setCsvAttachment({ parsed: result, filename: file.name })
    }
    reader.readAsText(file)
  }, [])

  // ── File attachments (#61) ────────────────────────────────────────────────
  // Images + documents upload to Supabase Storage and ride the outgoing message
  // as FileUIParts (so Pond can see them); a .csv keeps its dedicated inline-
  // context path above (parsed, never uploaded). Rejections (bad type /
  // oversize / failed upload) surface through the notify toast.
  const {
    attachments,
    addFile,
    remove: removeAttachment,
    clear: clearAttachments,
    fileParts,
    isUploading,
  } = useAttachments({ onReject: (message) => requestNotify({ message }) })
  const attachInputRef = useRef<HTMLInputElement>(null)

  const handlePickedFiles = useCallback(
    (files: FileList | null) => {
      for (const file of Array.from(files ?? [])) {
        if (file.name.toLowerCase().endsWith('.csv')) processCsvFile(file)
        else void addFile(file)
      }
    },
    [processCsvFile, addFile]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      handlePickedFiles(e.dataTransfer.files)
    },
    [handlePickedFiles]
  )

  const handleAttachClick = useCallback(() => attachInputRef.current?.click(), [])

  // ── Ghost suggestion from t39 followup chips (ticket-40 §5) ──────────────
  const ghostSuggestion = useMemo<string | null>(() => {
    if (isStreaming) return null
    for (let i = messages.length - 1; i >= 0; i--) {
      const parts = messages[i].parts as Array<{ type: string }>
      const fp = parts.filter(isSuggestFollowupsPart)
      for (const p of fp) {
        const s = (p as SuggestFollowupsPart).input?.suggestions?.[0]
        if (s) return s
      }
    }
    return null
  }, [messages, isStreaming])

  const [ghostDismissed, setGhostDismissed] = useState(false)
  const prevGhost = useRef(ghostSuggestion)
  useEffect(() => {
    if (ghostSuggestion !== prevGhost.current) {
      prevGhost.current = ghostSuggestion
      setGhostDismissed(false)
    }
  }, [ghostSuggestion])

  const activeSuggestion = ghostDismissed ? null : ghostSuggestion

  const handleGhostAccept = useCallback((text: string) => {
    setInput(text)
    setGhostDismissed(false)
  }, [])

  const handleGhostDismiss = useCallback(() => {
    setGhostDismissed(true)
  }, [])

  const ghostKeyHandler = useGhostKeyHandler({
    suggestion: activeSuggestion,
    inputValue: input,
    onAccept: handleGhostAccept,
    onDismiss: handleGhostDismiss,
  })

  // ── Drawer ergonomics (ticket-24, #96) ────────────────────────────────────
  // Height + collapse are user-controlled and remembered across sessions. The
  // drawer is an absolute overlay floating over the bottom of the shell (the
  // page scrolls behind it); it publishes its real height to the shell and the
  // surfaces pad against it, so what's being read can always scroll clear.
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
      el.classList.add('ring-1', 'ring-mn-text')
      setTimeout(() => el.classList.remove('ring-1', 'ring-mn-text'), 800)
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
  // #97: likewise, the page proposals re-seeded from the saved envelope — a
  // pending one is still in the thread (6d closing) but must not pin the drawer
  // open on every mount; only a card opened THIS session does.
  const [seededProposalIds, setSeededProposalIds] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    // Async IIFE so an envless client construction (#38) rejects into the catch
    // below instead of throwing out of the effect and crashing the mount.
    ;(async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const conversation = await getOrCreateConversation(supabase, user.id, workspace)
      setConversationId(conversation.id)
      if (conversation.messages.length > 0) {
        setInitialMessageIds(new Set(conversation.messages.map((m) => m.id)))
        setMessages(conversation.messages)
      }
      // Restore card decisions so historical proposal cards render resolved
      // (inert) instead of re-arming with live buttons (ticket-19), plus the #52
      // honesty maps and the ticket-39 question answers + lifecycle phase, so a
      // returning session resumes mid-arc. One dispatch; the reducer restores only
      // the persisted-derived fields and leaves session-scoped aux empty.
      dispatch({ kind: 'reseed', resolutions: conversation.resolutions })
      setSeededProposalIds(new Set(Object.keys(conversation.resolutions.pageProposals ?? {})))
      setIsReady(true)
    })().catch(console.error)
  }, [setMessages, getSupabase, workspace])

  // ── Save transcript after each completed exchange ─────────────────────────
  // Also fires on each card decision (`resolutions` dep) so Accept/Dismiss
  // persists immediately, not only after the next exchange.
  useEffect(() => {
    if (status === 'ready' && conversationId && messages.length > 0) {
      saveTranscript(getSupabase(), conversationId, messages, resolutions).catch(console.error)
    }
  }, [status, conversationId, messages, resolutions, getSupabase])

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
    for (const part of unstamped) {
      // #98 — the first batch to stream in after a request-changes note is
      // Pond's revision of that card. Write-once in the store.
      const revising = pendingRevisionOf.current
      if (revising && revising !== part.toolCallId && !revisions[part.toolCallId]) {
        dispatch({ kind: 'noteRevision', id: part.toolCallId, revisedFrom: revising })
        pendingRevisionOf.current = null
      }
      const resolved = resolveStampTarget({
        targetPageId: part.input?.targetPageId,
        pages: allPages,
        pagesLoaded,
        openNodeId: nodeId,
        openNodeName: nodeName,
      })
      // 'defer' → stamp on a later run (pages still loading); null → leave
      // unstamped (no safe target; accept skips). The reducer's stampTarget is
      // write-once, so a later run never overwrites an earlier stamp.
      if (resolved !== 'defer' && resolved !== null)
        dispatch({ kind: 'stampTarget', id: part.toolCallId, target: resolved })
    }
  }, [messages, nodeId, nodeName, changeTargets, allPages, pagesLoaded, revisions])

  // ── The revision ref lives for ONE turn (#98 review) ──────────────────────
  // `pendingRevisionOf` was set on send and cleared only when a propose_changes
  // batch arrived. A revision turn that comes back as PROSE — "which part did
  // you mean?", or a refusal — therefore left it set, and the next unrelated
  // batch, however many questions later, was stamped as a revision of that old
  // card and linked to it in the log. The note's turn is the ref's whole life:
  // when the turn settles, it goes. Declared AFTER the stamping effect above so
  // that effect still gets the ref on the commit the batch lands in.
  useEffect(() => {
    if (status === 'ready') pendingRevisionOf.current = null
  }, [status])

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
    () => [
      ...unresolvedProposalIds(
        messages as ProposalMessageLike[],
        changeDecisions,
        createDecisions,
        initialMessageIds,
        schemaDecisions,
        rowDecisions,
        viewDecisions,
        promotionDecisions,
        linkDecisions
      ),
      // #97: an open `new page — proposed` card is a decision too. Scoped to
      // this session's answers like the tool cards — a card re-seeded from a
      // prior session is still in the thread, it just doesn't pin the drawer.
      ...openPageProposalIds(pageProposals, seededProposalIds),
    ],
    [
      messages,
      changeDecisions,
      createDecisions,
      initialMessageIds,
      schemaDecisions,
      rowDecisions,
      viewDecisions,
      promotionDecisions,
      linkDecisions,
      pageProposals,
      seededProposalIds,
    ]
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
        el.classList.add('ring-1', 'ring-mn-text')
        setTimeout(() => el.classList.remove('ring-1', 'ring-mn-text'), 800)
      }
      pendingFocus.current = false
    }
  }, [effectiveCollapsed, isReady])

  // ── Handle /clear ─────────────────────────────────────────────────────────
  const handleClear = useCallback(async () => {
    if (!conversationId) return
    const supabase = getSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    await dissolveConversation(supabase, conversationId)
    const fresh = await getOrCreateConversation(supabase, user.id, workspace)
    setConversationId(fresh.id)
    setMessages([])
    // Stale decisions must not leak into the fresh conversation's transcript.
    resetResolutions()
  }, [conversationId, setMessages, resetResolutions, getSupabase, workspace])

  // ── Handle /handoff ───────────────────────────────────────────────────────
  // Extract entities from the transcript (Quick model), write them all, then
  // dissolve and start a fresh session (build-brief §9).
  const handleHandoff = useCallback(async () => {
    if (!conversationId) return
    const supabase = getSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const { freshConversation, written } = await performHandoff(
      supabase,
      conversationId,
      user.id,
      messages,
      undefined,
      workspace
    )
    if (written > 0) {
      await queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
    }
    setConversationId(freshConversation.id)
    setMessages([])
    resetResolutions()
  }, [conversationId, messages, queryClient, setMessages, resetResolutions, getSupabase, workspace])

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
      dispatch({ kind: 'advanceLifecycle', lifecycle: advanced })
      const outgoing: ConversationResolutions = isLifecycleActive(advanced)
        ? { ...resolutions, lifecycle: advanced }
        : { ...resolutions, lifecycle: undefined }

      // Build the final message text, injecting quote + CSV context single-turn.
      let finalText = text
      if (quoteCtx) {
        const blockNote = quoteCtx.blockId ? ` [block:${quoteCtx.blockId}]` : ''
        finalText = `> "${quoteCtx.text}"${blockNote}\n\n${text}`
        setQuoteCtx(null)
      }
      if (csvAttachment) {
        const ctx = formatCsvContext(csvAttachment.parsed, csvAttachment.filename)
        finalText = `${finalText}\n\n${ctx}`
        setCsvAttachment(null)
      }

      // Send the open node so the server can auto-inject its context (Track C),
      // plus the card resolutions so replay carries the user's decisions (t19)
      // and the route reads this turn's lifecycle phase (t39). Pending file
      // attachments (#61) ride along as FileUIParts — single-turn, cleared on
      // send like the CSV/quote context. An attachment-only send omits `text`
      // entirely so no empty text part reaches the model.
      // `workspace` scopes the change-log record the route writes for any
      // proposal in this turn (#110 criterion 11) — it lives in a client context,
      // so without it every sandbox proposal would be filed into main.
      const body = { nodeId, nodeType, workspace, resolutions: outgoing }
      // #97: the thread shows when each line was said ("you · 07:12"), and a
      // page made from the answer carries that moment on its made-from chip.
      const metadata = { sentAt: new Date().toISOString() }
      clearError?.()
      if (fileParts.length > 0) {
        sendMessage(
          finalText
            ? { text: finalText, files: fileParts, metadata }
            : { files: fileParts, metadata },
          { body }
        )
        clearAttachments()
      } else {
        sendMessage({ text: finalText, metadata }, { body })
      }
      setInput('')
      setGhostDismissed(false)
    },
    [
      nextLifecycle,
      resolutions,
      sendMessage,
      clearError,
      nodeId,
      nodeType,
      workspace,
      quoteCtx,
      csvAttachment,
      fileParts,
      clearAttachments,
    ]
  )

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim()
    // An attachment can go out without accompanying text (#61); everything
    // else still requires a message.
    if ((!text && attachments.length === 0) || isStreaming) return

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
  }, [input, isStreaming, attachments.length, handleClear, handleHandoff, sendText])

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
    // Ghost suggestion: Tab/→ accepts before any other handling.
    ghostKeyHandler(e)
    if (e.defaultPrevented) return

    // Esc steps back (2f's rule, AUDIT C8 — not frame 1's "clears"): stop a
    // stream and keep what arrived; else close the / menu; else leave the field.
    // It never clears what was typed (G1: a failed answer keeps what you typed).
    if (e.key === 'Escape') {
      e.preventDefault()
      if (isStreaming) stop()
      else if (chatMenuOpen) setChatMenuOpen(false)
      else e.currentTarget.blur()
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      setChatMenuOpen(false)
      handleSend()
    }
  }

  // The last step of Esc: with focus elsewhere in the composer (a chip, a card
  // control), Esc closes the composer. The textarea handles its own Esc above.
  //
  // Esc STEPS BACK, one rung at a time (AUDIT C8): stop the stream, else leave the
  // field, else close the composer. So Esc inside a proposal card's own field —
  // name, under, kind — only leaves that field; it must never collapse the whole
  // composer out from under the card the person is filling in. A second Esc, with
  // focus back on the body, takes the next rung.
  const handleBodyKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const target = e.target as HTMLElement
      if (target.tagName === 'TEXTAREA') return
      if (isStreaming) {
        stop()
        return
      }
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
        e.preventDefault()
        target.blur()
        return
      }
      setIsCollapsed(true)
      writeStored(TERMINAL_COLLAPSED_KEY, '1')
    },
    [isStreaming, stop]
  )

  // Open the thread at a message (#97): a page's made-from chip asks for the
  // moment its prose came from. Uncollapse, then scroll that line into view if
  // the thread still holds it (a cleared thread simply opens).
  useEffect(() => {
    function onOpenThreadMessage(e: Event) {
      const { messageId } = (e as CustomEvent<OpenThreadMessageDetail>).detail ?? {}
      setIsCollapsed((prev) => {
        if (prev) writeStored(TERMINAL_COLLAPSED_KEY, '0')
        return false
      })
      requestAnimationFrame(() => {
        const el = messageId
          ? document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`)
          : null
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }
    window.addEventListener(OPEN_THREAD_MESSAGE_EVENT, onOpenThreadMessage)
    return () => window.removeEventListener(OPEN_THREAD_MESSAGE_EVENT, onOpenThreadMessage)
  }, [])

  // ── propose_changes resolution (t16 Phase 5) ──────────────────────────────
  // The generalized Accept path: mint ids for the accepted batch, apply it, and
  // commit to the batch's stamped target page (writeAcceptedChanges in
  // lib/pages/accept.ts). This is also the accept-time re-validation gate —
  // applyProposedChanges skips anything that fails blockSchema, so the returned
  // `skipped` count surfaces a "couldn't apply" notice rather than a corrupt write.
  const decideChanges = useCallback(
    (toolCallId: string, indices: number[], decision: ProposalDecision) => {
      for (const i of indices)
        dispatch({ kind: 'resolve', type: 'changes', id: toolCallId, index: i, decision })
      // An ACCEPTED block edit advances inside writeAcceptedChanges, sharing the
      // page commit's transaction; a rejected one has no page write to share, so
      // it advances here.
      //
      // A mixed batch records its FIRST decision and keeps it. The log holds one
      // record per tool call while the card decides per change, and the state
      // machine has no `reject → accepted` edge to promote it later — so
      // rejecting one change and then accepting another leaves the record
      // `rejected`. There is no "partly accepted" status among the eight; #110
      // assumes one decision per record.
      if (decision === 'rejected') logDecision(toolCallId, 'rejected')
    },
    [logDecision]
  )

  const acceptChanges = useCallback(
    async (toolCallId: string, allChanges: ModuleChange[], indices: number[]) => {
      if (indices.length === 0) return
      decideChanges(toolCallId, indices, 'accepted')
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const result = await writeAcceptedChanges({
        supabase,
        queryClient,
        // The accept advances this call's change-log record, so it needs the pond
        // it belongs to. Null only when there is no session — the blocks still
        // commit, the log is simply left alone (there is no pond to scope a record
        // to), which is how this path behaved before the log existed.
        userId: user?.id ?? null,
        workspace,
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
        dispatch({
          kind: 'resolve',
          type: 'changes',
          id: toolCallId,
          decision: 'accepted',
          aux: { skipped: result.skipped, skipReasons: result.skippedReasons },
        })
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
                  workspaceHref(
                    {
                      id: openTarget,
                      type: allPages.find((p) => p.id === openTarget)?.type ?? 'page',
                      title: targetName,
                    },
                    basePath
                  )
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
      getSupabase,
      queryClient,
      workspace,
      resolutions,
      nodeId,
      changeTargets,
      contextLabel,
      router,
      allPages,
      basePath,
    ]
  )

  // "Open page" on a cross-page proposal card (ticket-30): navigate to the
  // stamped target. The page's type is looked up here (not inline in JSX) so
  // the render path stays a plain callback reference.
  const openTargetPage = useCallback(
    (target: ProposalTarget) => {
      router.push(
        workspaceHref(
          {
            id: target.nodeId,
            type: allPages.find((p) => p.id === target.nodeId)?.type ?? 'page',
            title: target.nodeName,
          },
          basePath
        )
      )
    },
    [router, allPages, basePath]
  )

  // ── Request changes / revise (#98, board 6c frame 3) ──────────────────────
  // The note under the card goes to whoever proposed the diff — in M1 always
  // Pond — who returns a REVISED diff. The decision settles the card here and
  // rides THIS turn's envelope (so the model reads the stamp as well as the
  // note); the body names the call so the route lands the record's advance and
  // links the revision it emits. `revise` on an outdated card is the same path
  // with a canned note — the record is already settled, so nothing re-decides.
  const sendRequestChanges = useCallback(
    (toolCallId: string, count: number, note: string, reason: 'note' | 'outdated') => {
      let next = proposals
      if (reason === 'note') {
        for (let i = 0; i < count; i++) {
          const action = {
            kind: 'resolve' as const,
            type: 'changes' as const,
            id: toolCallId,
            index: i,
            decision: 'changes_requested' as const,
            ...(i === 0 ? { aux: { note } } : {}),
          }
          next = proposalReducer(next, action)
          dispatch(action)
        }
        logDecision(toolCallId, 'changes_requested')
      }
      pendingRevisionOf.current = toolCallId
      const body = {
        nodeId,
        nodeType,
        workspace,
        resolutions: projectResolutions(next),
        requestChanges: { toolCallId, note, reason },
      }
      // The thread shows the note under the card, not as a second "you" line;
      // the metadata is how the renderer knows this message is that note.
      const metadata = {
        sentAt: new Date().toISOString(),
        requestChanges: { toolCallId, reason },
      }
      clearError?.()
      sendMessage({ text: note, metadata }, { body })
    },
    [proposals, logDecision, nodeId, nodeType, workspace, sendMessage, clearError]
  )

  // ── Read the cards' records back (#98, G2) ────────────────────────────────
  // The change log is the durable record; the decision maps are a UI cache.
  // Whenever the open page's blocks change (an own edit landed, an accept swept
  // the page) re-read the records behind the propose_changes cards still live
  // here and adopt what the log settled — most often `outdated`, which greys
  // the card, drops accept and offers revise. Idempotent: once adopted, the
  // reconcile returns null and the loop ends.
  const liveDiffCards = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of messages) {
      for (const p of m.parts as Array<{ type: string }>) {
        if (!isProposeChangesPart(p) || p.state !== 'input-available') continue
        const count = p.input?.changes?.length ?? 0
        const status = batchStatus(changeDecisions, p.toolCallId, count)
        if (status === 'pending' || status === 'accepted') counts.set(p.toolCallId, count)
      }
    }
    return counts
  }, [messages, changeDecisions])
  useEffect(() => {
    if (liveDiffCards.size === 0) return
    let cancelled = false
    ;(async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const records = await listRecordsByToolCalls(supabase, {
        userId: user.id,
        workspace,
        toolCallIds: [...liveDiffCards.keys()],
      })
      if (cancelled) return
      for (const record of records) {
        const id = record.toolCallId
        if (!id) continue
        const count = liveDiffCards.get(id) ?? 0
        const adopt = reconcileCardStatus(batchStatus(changeDecisions, id, count), record.status)
        if (!adopt) continue
        for (let i = 0; i < count; i++) {
          dispatch({ kind: 'resolve', type: 'changes', id, index: i, decision: adopt })
        }
      }
    })().catch((err) => console.error('[change-log] card record sync failed', err))
    return () => {
      cancelled = true
    }
    // `currentPage?.blocks` is the trigger: react-query hands back a new array only
    // when the blocks actually changed (an own edit saved, an accept landed) or
    // the person navigated to another page — which is when a card aimed at it can
    // have gone stale. A record outdated from ANOTHER tab is read on the next of
    // those, not live (no realtime subscription in M1).
  }, [liveDiffCards, changeDecisions, currentPage?.blocks, workspace, getSupabase])

  // ── create_page resolution (M1) ───────────────────────────────────────────
  // Accept: mint block ids, resolve the user-chosen parent, write via createPage,
  // then navigate to the new page (matching the create_node dialog's post-create
  // nav). The user's selected destination wins over the AI's proposed placement.
  const acceptCreatePage = useCallback(
    async (toolCallId: string, part: CreatePagePart['input'], selectedParentId: string) => {
      if (!part?.title || !part.type) return
      dispatch({ kind: 'resolve', type: 'creates', id: toolCallId, decision: 'accepted' })
      try {
        // A selected option id is a real page id (UUID); TOP_LEVEL_VALUE = no parent.
        // createPageFromProposal resolves either a UUID or a title, so passing the id
        // through parentTitle is safe.
        const parentRef = selectedParentId === TOP_LEVEL_VALUE ? null : selectedParentId
        const created = await createPageFromProposal(
          getSupabase(),
          {
            type: part.type,
            kind: part.kind,
            title: part.title,
            parentRef,
            blocks: part.blocks ?? [],
          },
          () => crypto.randomUUID(),
          workspace
        )
        // F26: seed the cache with the new row (correct parent_id) before navigating,
        // so the rail nests it immediately; reconcile in the background.
        insertPageOptimistic(queryClient, workspace, {
          id: created.id,
          parentId: parentRef,
          type: part.type,
          title: part.title,
        })
        router.push(workspaceHref({ id: created.id, type: part.type, title: part.title }, basePath))
        void queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
        // The write landed — only now may the record say so. The log only grows,
        // so an `accepted` stamped before this point could never be taken back.
        logDecision(toolCallId, 'accepted')
      } catch (err) {
        // Surface the failure by reverting the card to pending so the user can retry.
        console.error('create_page failed', err)
        dispatch({ kind: 'revert', type: 'creates', id: toolCallId })
      }
    },
    [getSupabase, queryClient, router, workspace, basePath, logDecision]
  )

  // ── define_schema resolution (#17 slice 5) ────────────────────────────────
  // Accept: mint property/option ids, write the schema to the chosen target page
  // via the merge-safe defineSchema (preserving existing row values), then seed
  // the target's ['page', id] cache with the new _schema so the PropertyInspector
  // appears immediately, and invalidate ['pages'] so the collection is reflected
  // elsewhere. The user's chosen target wins over the AI's proposed pageId.
  const acceptDefineSchema = useCallback(
    async (toolCallId: string, part: DefineSchemaPart['input'], selectedTargetId: string) => {
      const properties = part?.properties ?? []
      if (!selectedTargetId || properties.length === 0) return
      dispatch({ kind: 'resolve', type: 'schemas', id: toolCallId, decision: 'accepted' })
      try {
        // #20: resolve a relation def's proposed target NAME to the matching
        // collection's id, and a rollup's rolled property NAME to its id within the
        // relation's target collection (both from the full pages cache in scope).
        // Unmatched names stay untargeted/unset inside hydratePropertySchema (lenient).
        const { schema, inertRollups } = await defineSchemaFromProposal(
          getSupabase(),
          { pageId: selectedTargetId, schema: properties },
          () => crypto.randomUUID(),
          collectionNameResolver(allPages),
          collectionPropertyResolver(allPages)
        )
        // #52 fix 1 — freeze which rollups couldn't link to a local relation, so the
        // card receipt is honest and the model stamp (via the envelope) says the same.
        if (inertRollups.length > 0) {
          dispatch({
            kind: 'resolve',
            type: 'schemas',
            id: toolCallId,
            decision: 'accepted',
            aux: { inertRollups },
          })
        }
        // Optimistic seed: merge the freshly-written schema into the target page's
        // cached props (via the reserved-key merge helper, never a raw overwrite),
        // so DocumentPanel renders the inspector without waiting on a refetch.
        queryClient.setQueryData(['page', selectedTargetId], (prev: unknown) => {
          if (!prev || typeof prev !== 'object') return prev
          const page = prev as { props?: Record<string, unknown> }
          return { ...page, props: withSchema(page.props, schema) }
        })
        void queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
        // The write landed — only now may the record say so. The log only grows,
        // so an `accepted` stamped before this point could never be taken back.
        logDecision(toolCallId, 'accepted')
      } catch (err) {
        // Surface the failure by reverting the card to pending so the user can retry.
        console.error('define_schema failed', err)
        dispatch({ kind: 'revert', type: 'schemas', id: toolCallId })
      }
    },
    [getSupabase, queryClient, workspace, allPages, logDecision]
  )

  // ── add_row resolution (#18) ──────────────────────────────────────────────
  // Accept: create a type='row' child page under the chosen collection, its values
  // coerced against the collection's schema (addRowFromProposal), then invalidate
  // ['pages'] so the collection reflects the new row. The user's chosen collection
  // wins over the AI's proposed collectionId. A row is filtered out of the rail
  // tree, so there's no ['page', id] seed to do here (unlike define_schema, which
  // seeds the target's _schema so its inspector appears at once).
  const acceptAddRow = useCallback(
    async (toolCallId: string, part: AddRowPart['input'], selectedCollectionId: string) => {
      const rowProps = part?.props ?? {}
      if (!selectedCollectionId) return
      dispatch({ kind: 'resolve', type: 'rows', id: toolCallId, decision: 'accepted' })
      try {
        await addRowFromProposal(
          getSupabase(),
          { collectionId: selectedCollectionId, title: part?.title, props: rowProps },
          workspace
        )
        void queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
        // The write landed — only now may the record say so. The log only grows,
        // so an `accepted` stamped before this point could never be taken back.
        logDecision(toolCallId, 'accepted')
      } catch (err) {
        // Surface the failure by reverting the card to pending so the user can retry.
        console.error('add_row failed', err)
        dispatch({ kind: 'revert', type: 'rows', id: toolCallId })
      }
    },
    [getSupabase, queryClient, workspace, logDecision]
  )

  // ── promote_table resolution (#29) ────────────────────────────────────────
  // Accept: convert the freeform table block on the chosen page into a collection
  // (promoteTableFromProposal — infer schema, rows→row pages, table block→view),
  // then invalidate ['pages'] AND the target's ['page', id] so the rail count and
  // the now-collection page re-render. The user's chosen page wins over the AI's
  // proposed pageId; when they switch pages, blockId is dropped so the sole table
  // on the new page is used. Never re-asks confirmation (client-resolved).
  const acceptPromoteTable = useCallback(
    async (
      toolCallId: string,
      part: PromoteTablePart['input'],
      selectedTargetId: string,
      preview: { columns: PromotedColumn[]; rowCount: number; tableTitle?: string }
    ) => {
      if (!selectedTargetId) return
      // The proposed blockId only applies to the AI's proposed page — if the user
      // switched pages, promote that page's sole table instead.
      const blockId = selectedTargetId === part?.pageId ? part?.blockId : undefined
      // Freeze the preview BEFORE the write drops the live table, so the resolved
      // card keeps showing its columns + "Table converted" line.
      dispatch({
        kind: 'resolve',
        type: 'promotions',
        id: toolCallId,
        decision: 'accepted',
        aux: { snapshot: preview },
      })
      try {
        await promoteTableFromProposal(
          getSupabase(),
          { pageId: selectedTargetId, blockId },
          () => crypto.randomUUID(),
          workspace
        )
        void queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
        void queryClient.invalidateQueries({ queryKey: ['page', selectedTargetId] })
        // The write landed — only now may the record say so. The log only grows,
        // so an `accepted` stamped before this point could never be taken back.
        logDecision(toolCallId, 'accepted')
      } catch (err) {
        // Surface the failure by reverting the card to pending so the user can retry.
        console.error('promote_table failed', err)
        dispatch({ kind: 'revert', type: 'promotions', id: toolCallId })
      }
    },
    [getSupabase, queryClient, workspace, logDecision]
  )

  // ── link_records resolution (#40) ─────────────────────────────────────────
  // Accept: resolve every proposed TITLE (source row, relation, targets) against
  // live data and append the links onto the source row's relation value
  // (linkRecordsFromProposal — strict: any unresolvable/ambiguous title throws
  // BEFORE any write, so a dangling id is impossible), then invalidate the source
  // collection's ['rows'] cache like a row edit — rollups and backlinks (#39) are
  // derived on read, so they recompute from the fresh value — plus the target
  // collection's rows and the source row's own ['page'] cache. On failure the
  // card re-arms with the thrown message so the user can retry or dismiss.
  const acceptLinkRecords = useCallback(
    async (toolCallId: string, part: LinkRecordsPart['input'], selectedCollectionId: string) => {
      const fromRow = part?.fromRow
      const relation = part?.relation
      const toRows = part?.toRows ?? []
      if (!selectedCollectionId || !fromRow || !relation || toRows.length === 0) return
      dispatch({ kind: 'noteLinkError', id: toolCallId })
      dispatch({ kind: 'resolve', type: 'links', id: toolCallId, decision: 'accepted' })
      try {
        const linked = await linkRecordsFromProposal(
          getSupabase(),
          { collectionId: selectedCollectionId, fromRow, relation, toRows },
          workspace
        )
        void queryClient.invalidateQueries({ queryKey: ['rows', selectedCollectionId] })
        if (linked.targetCollectionId && linked.targetCollectionId !== selectedCollectionId) {
          void queryClient.invalidateQueries({ queryKey: ['rows', linked.targetCollectionId] })
        }
        void queryClient.invalidateQueries({ queryKey: ['page', linked.sourceRowId] })
        // The write landed — only now may the record say so. The log only grows,
        // so an `accepted` stamped before this point could never be taken back.
        logDecision(toolCallId, 'accepted')
      } catch (err) {
        // Surface the failure ON the card (its message names the unresolvable or
        // duplicate title) and revert to pending so the user can retry.
        console.error('link_records failed', err)
        dispatch({
          kind: 'noteLinkError',
          id: toolCallId,
          error: err instanceof Error ? err.message : 'Could not link those records',
        })
        dispatch({ kind: 'revert', type: 'links', id: toolCallId })
      }
    },
    [getSupabase, queryClient, workspace, logDecision]
  )

  // ── configure_view resolution (#19 slice 5) ───────────────────────────────
  // Accept: resolve the proposed name-keyed config against the chosen collection's
  // schema and upsert THE view block on it (configureViewFromProposal), then
  // invalidate ['pages'] AND the target's ['page', id] so the reconfigured view
  // re-renders at once. The user's chosen collection wins over the AI's proposed
  // pageId. Never touches props — the view block lives in blocks, so _schema is safe.
  const acceptConfigureView = useCallback(
    async (toolCallId: string, part: ConfigureViewPart['input'], selectedTargetId: string) => {
      const mode = part?.mode
      if (!selectedTargetId || !mode) return
      // A LINKED view (#41) lives on the CURRENTLY-OPEN page (the host) and draws the
      // selected collection's rows; the picker resolves/disambiguates that target. An
      // inline view is configured on the selected collection itself. Host = where the
      // block (and its ['page'] cache) lives, so that's what we invalidate.
      const linked = !!part?.targetCollection
      const host = linked ? nodeId : selectedTargetId
      if (!host) return
      dispatch({ kind: 'resolve', type: 'views', id: toolCallId, decision: 'accepted' })
      try {
        const { replaced } = await configureViewFromProposal(
          getSupabase(),
          {
            pageId: host,
            collectionId: linked ? selectedTargetId : undefined,
            mode,
            groupBy: part?.groupBy,
            sort: part?.sort,
            filter: part?.filter,
            startDate: part?.startDate,
            endDate: part?.endDate,
            chart: part?.chart,
            bigNumber: part?.bigNumber,
          },
          () => crypto.randomUUID()
        )
        // #52 fix 2 — a second configure_view SWITCHES the one active view. Freeze that
        // so the card receipt + model stamp say "switched", never claim they coexist.
        if (replaced)
          dispatch({
            kind: 'resolve',
            type: 'views',
            id: toolCallId,
            decision: 'accepted',
            aux: { replaced: true },
          })
        void queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
        void queryClient.invalidateQueries({ queryKey: ['page', host] })
        // The write landed — only now may the record say so. The log only grows,
        // so an `accepted` stamped before this point could never be taken back.
        logDecision(toolCallId, 'accepted')
      } catch (err) {
        // Surface the failure by reverting the card to pending so the user can retry.
        console.error('configure_view failed', err)
        dispatch({ kind: 'revert', type: 'views', id: toolCallId })
      }
    },
    [getSupabase, queryClient, workspace, nodeId, logDecision]
  )

  // ── make this a page (#97, `Pond 06.01` 6a frames 3–5) ──────────────────
  // An answer never lands on a page by itself. "make this a page" opens a
  // `new page — proposed` card (one per answer — a second press is ignored by
  // the reducer); the proposal is born as a `proposed` change-log record so it
  // is in the proposed view; and it rides the resolutions envelope with the
  // transcript, so closing Pond leaves it pending (6d closing).
  const proposePage = useCallback(
    (opts: {
      messageId: string
      question: string
      askedAt: string | null
      prose: string
      read: string[]
    }) => {
      const proposal: PageProposal = {
        id: crypto.randomUUID(),
        messageId: opts.messageId,
        question: opts.question,
        askedAt: opts.askedAt,
        prose: opts.prose,
        read: opts.read,
        name: derivePageName(opts.question, opts.prose),
        // Placement defaults to the page the answer was about (6a frame 4);
        // Life home is the pond's root, so it reads as top level.
        parentId: nodeId && allPages.some((p) => p.id === nodeId) ? nodeId : null,
        kind: DEFAULT_PAGE_KIND,
        status: 'proposed',
      }
      // One card per answer: when a pending card already exists for this
      // answer the reducer ignores the dispatch — and so must the record.
      const already = Object.values(pageProposals).some(
        (p) => p.messageId === opts.messageId && p.status === 'proposed'
      )
      if (already) return
      dispatch({ kind: 'proposePage', proposal })
      // The card opens under the answer — bring it into view with the drawer's grow.
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
      void (async () => {
        const supabase = getSupabase()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        await recordPageProposal(supabase, {
          userId: user.id,
          workspace,
          threadId: conversationId,
          proposal,
        })
      })()
    },
    [nodeId, allPages, pageProposals, getSupabase, workspace, conversationId]
  )

  const editPageProposal = useCallback(
    (id: string, patch: Partial<Pick<PageProposal, 'name' | 'parentId' | 'kind'>>) => {
      dispatch({ kind: 'editPageProposal', id, patch })
    },
    []
  )

  // Cancel returns to the thread and makes nothing (6a); the record is rejected.
  const cancelPageProposal = useCallback(
    (id: string) => {
      if (pageProposals[id]?.status !== 'proposed') return
      dispatch({ kind: 'settlePageProposal', id, status: 'rejected' })
      logDecision(id, 'rejected')
    },
    [pageProposals, logDecision]
  )

  // make page: the ONLY write. The card settles optimistically BEFORE the await
  // and an in-flight set guards the async gap, so a double ↵ makes one page
  // (G9). A failed write reverts the card to pending with its reason — a parent
  // deleted between proposal and make page resets the place to top level and
  // asks for another; nothing is half-made either way.
  const makingPages = useRef<Set<string>>(new Set())
  const makePage = useCallback(
    async (id: string) => {
      const proposal = pageProposals[id]
      if (!proposal || proposal.status !== 'proposed' || makingPages.current.has(id)) return
      makingPages.current.add(id)
      dispatch({ kind: 'settlePageProposal', id, status: 'accepted' })
      try {
        const made = await makePageFromAnswer(
          getSupabase(),
          { proposal, threadId: conversationId, pages: allPages, workspace },
          () => crypto.randomUUID()
        )
        dispatch({ kind: 'notePageMade', id, pageId: made.id })
        // Rail entry at once (the correct parent), reconciled in the background.
        insertPageOptimistic(queryClient, workspace, {
          id: made.id,
          parentId: proposal.parentId,
          type: 'page',
          title: made.title,
        })
        void queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
        router.push(workspaceHref({ id: made.id, type: 'page', title: made.title }, basePath))
        // The write landed — only now may the record say so (the log only grows).
        logDecision(id, 'accepted')
      } catch (err) {
        console.error('make page failed', err)
        if (err instanceof ParentGoneError) {
          dispatch({ kind: 'revertPageProposal', id, error: err.message })
          dispatch({ kind: 'editPageProposal', id, patch: { parentId: null } })
        } else {
          dispatch({
            kind: 'revertPageProposal',
            id,
            error: err instanceof Error ? err.message : 'pond could not make the page',
          })
        }
      } finally {
        makingPages.current.delete(id)
      }
    },
    [
      pageProposals,
      getSupabase,
      conversationId,
      allPages,
      workspace,
      queryClient,
      router,
      basePath,
      logDecision,
    ]
  )

  const openMadePage = useCallback(
    (proposal: PageProposal) => {
      if (!proposal.pageId) return
      router.push(
        workspaceHref({ id: proposal.pageId, type: 'page', title: proposal.name }, basePath)
      )
    },
    [router, basePath]
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

  // ── Stamp the read chips on arrival (S8 provenance) ───────────────────────
  // An answer's read chips are a fact about the answer: the page the question was
  // asked from, plus every page the turn read. Deriving them at render time from
  // live navigation made them drift — walk to another page and an old answer
  // started claiming it had read THAT page (PROJECT_RULES: every answer names
  // what it read; every value that came from somewhere else carries a provenance
  // chip). So the chips are written onto the message the moment the answer is
  // done, beside `sentAt`, and every render after that reads the stamp.
  //
  // Deferred until the pages list resolves, like the proposal-target stamp above,
  // so a read_page chip stamps its page's TITLE and not a raw id. An answer
  // re-seeded from the saved transcript is stamped from its own parts only: we
  // know what it read, but the page it was asked from is no longer knowable, and
  // guessing it from where the person is standing now is the very drift this
  // fixes.
  useEffect(() => {
    if (isStreaming || !pagesLoaded) return
    const unstamped = messages.filter(
      (m) => m.role === 'assistant' && readStamp(m.metadata) === null
    )
    if (unstamped.length === 0) return
    const ids = new Set(unstamped.map((m) => m.id))
    setMessages((prev) =>
      prev.map((m) =>
        ids.has(m.id)
          ? withReadStamp(
              m,
              readChips({
                contextLabel: initialMessageIds.has(m.id) ? '' : contextLabel,
                parts: m.parts as ReadPartLike[],
                resolvePageName,
              })
            )
          : m
      )
    )
  }, [
    isStreaming,
    pagesLoaded,
    messages,
    initialMessageIds,
    contextLabel,
    resolvePageName,
    setMessages,
  ])
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

  // The transcript lives inside the TerminalDrawer's composer card, which is
  // itself the column (#96: 534 wide, centred on the shell) — so the body owns
  // only its scroll + inner gutter and does no centring or offsetting of its
  // own. One typeset object, not a console bolted under a document.
  // #97: the latest assistant message carries the actions row (make this a
  // page / ask again, or stop while streaming) — the mockup's `hasActions`.
  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return i
    return -1
  })()
  // The question a given answer replied to: the nearest user line above it.
  const questionBefore = (index: number): { text: string; sentAt: string | null } => {
    for (let i = index - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role !== 'user') continue
      const text = m.parts
        .filter((p) => p.type === 'text')
        .map((p) => (p as { type: 'text'; text: string }).text)
        .join('')
      const sentAt = (m.metadata as { sentAt?: unknown } | undefined)?.sentAt
      return { text, sentAt: typeof sentAt === 'string' ? sentAt : null }
    }
    return { text: '', sentAt: null }
  }
  const lastQuestion = questionBefore(messages.length)

  const messagesBody = (
    <div className="flex-1 overflow-y-auto py-4" onKeyDown={handleBodyKeyDown}>
      <div className="w-full space-y-5 px-8">
        {!isReady && <p className="font-serif text-sm italic text-mn-text-faint">Loading…</p>}
        {isReady && messages.length === 0 && (
          <p className="font-serif text-sm italic text-mn-text-faint">
            Talk with Pond — think out loud, ask, or compose.
          </p>
        )}
        {messages.map((message, messageIndex) => {
          const text = message.parts
            .filter((p) => p.type === 'text')
            .map((p) => (p as { type: 'text'; text: string }).text)
            .join('')
          const isLastAssistant = messageIndex === lastAssistantIndex
          const answerStreaming = isLastAssistant && isStreaming
          const sentAt = (message.metadata as { sentAt?: unknown } | undefined)?.sentAt
          const sentLabel = formatThreadTime(typeof sentAt === 'string' ? sentAt : null)
          // S8: what Pond read before this answer, taken from the STAMP written when
          // the answer landed (never recomputed from live navigation — see the
          // stamping effect above). Only an answer still arriving has no stamp yet,
          // and that one row is live by definition.
          const read =
            message.role === 'assistant'
              ? (readStamp(message.metadata) ??
                readChips({
                  contextLabel,
                  parts: message.parts as ReadPartLike[],
                  resolvePageName,
                }))
              : []
          const cardsForMessage = Object.values(pageProposals).filter(
            (p) => p.messageId === message.id
          )
          const hasOpenCard = cardsForMessage.some((p) => p.status === 'proposed')
          // Sent file attachments (#61): a user message's file parts render as
          // inert chips (no remove — the message is already out).
          const attachmentParts = (
            message.parts as Array<{
              type: string
              url?: string
              mediaType?: string
              filename?: string
            }>
          ).filter((p) => p.type === 'file' && typeof p.url === 'string')
          const changeBatches = (message.parts as Array<{ type: string }>).filter(
            isProposeChangesPart
          )
          const createPageParts = (message.parts as Array<{ type: string }>).filter(
            isCreatePagePart
          )
          const defineSchemaParts = (message.parts as Array<{ type: string }>).filter(
            isDefineSchemaPart
          )
          const addRowParts = (message.parts as Array<{ type: string }>).filter(isAddRowPart)
          const promoteTableParts = (message.parts as Array<{ type: string }>).filter(
            isPromoteTablePart
          )
          const configureViewParts = (message.parts as Array<{ type: string }>).filter(
            isConfigureViewPart
          )
          const linkRecordsParts = (message.parts as Array<{ type: string }>).filter(
            isLinkRecordsPart
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
          // #98 — one diff card per propose_changes batch ("one card per page
          // touched"), decided as a whole. While the tool input is still
          // streaming, `part.input` is partially parsed JSON — block payloads can
          // be missing required fields, and the module views render them
          // unvalidated — so a streaming batch waits for its complete input.
          const batchById = new Map<string, ModuleChange[]>()
          const diffCards: ProposalGroupCard[] = []
          for (const part of changeBatches) {
            if (part.state === 'input-streaming') continue
            const rawChanges = part.input?.changes ?? []
            batchById.set(part.toolCallId, rawChanges)
            // The stamped target (ticket-30): `crossPage` is set when the batch
            // resolved to a real page other than the open one, and the diff is
            // read against THAT page's blocks.
            const target = changeTargets[part.toolCallId]
            const targetMissing = target?.missing === true
            const crossPage = target && !targetMissing && target.nodeId !== nodeId ? target : null
            const targetBlocks = crossPage
              ? (blocksForTarget.get(crossPage.nodeId) ?? [])
              : (currentPage?.blocks ?? [])
            diffCards.push({
              id: part.toolCallId,
              changes: rawChanges.map((c) => previewForChange(c, targetBlocks)),
              status: batchStatus(changeDecisions, part.toolCallId, rawChanges.length),
              targetName: target?.nodeName || contextLabel,
              targetMissing,
              onOpenTarget: crossPage ? () => openTargetPage(crossPage) : undefined,
              note: changeNotes[part.toolCallId],
              revised: !!revisions[part.toolCallId],
              skippedCount: changeSkipped[part.toolCallId] ?? 0,
              skippedReasons: changeSkipReasons[part.toolCallId] ?? [],
            })
          }
          const allIndices = (id: string) => (batchById.get(id) ?? []).map((_, i) => i)
          const pendingDiffIds = diffCards.filter((c) => c.status === 'pending').map((c) => c.id)
          // A request-changes note renders under its card (from the envelope),
          // not as a second "you" line in the thread.
          const isRequestChangesNote =
            message.role === 'user' &&
            !!(message.metadata as { requestChanges?: unknown } | undefined)?.requestChanges

          return (
            <div key={message.id} data-message-id={message.id} className="space-y-3">
              {message.role === 'user' && attachmentParts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {attachmentParts.map((p, i) => (
                    <FileAttachmentChip
                      key={`${message.id}-file-${i}`}
                      filename={p.filename ?? 'attachment'}
                      url={p.url!}
                      mediaType={p.mediaType ?? ''}
                    />
                  ))}
                </div>
              )}
              {text &&
                !isRequestChangesNote &&
                (message.role === 'user' ? (
                  // The question sits in mono (`Pond 06.01` 6a frame 2, PondComposer
                  // `youRow`): "you" · the line · when it was said, 12.5px at ink .8,
                  // the words themselves in full ink. The machine surface is lowercase
                  // chrome, but the person's words keep their own case.
                  <div
                    data-part="you-row"
                    className="flex items-baseline gap-1.5 font-mono text-[12.5px] tracking-[0.02em] text-mn-text-meta"
                  >
                    <span className="font-medium lowercase">you</span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground">
                      {text}
                    </span>
                    {sentLabel && <span className="text-[10.5px]">{sentLabel}</span>}
                  </div>
                ) : (
                  // The answer is Pond talking, not a page: the sans at reading scale
                  // (13.5px / 1.55) under a "pond" eyebrow — never the serif, which is
                  // for the page only (PROJECT_RULES "Where answers live"). Read chips
                  // sit under every answer (S8). Arrives with one calm breath
                  // (mn-arrive). Streaming-safe: `text` grows token-by-token and
                  // react-markdown re-parses each partial (ticket-20); the caret shows
                  // while this answer is still arriving.
                  <div data-part="answer" className="mn-arrive flex flex-col gap-1.5">
                    <span className={machineEyebrowClass}>pond</span>
                    <div className="relative">
                      <Markdown variant="answer">{text}</Markdown>
                      {answerStreaming && (
                        <span
                          aria-hidden
                          data-part="stream-caret"
                          className="ml-[3px] inline-block h-[17px] w-[9px] translate-y-[2px] bg-mn-text/[0.22] align-baseline"
                        />
                      )}
                    </div>
                    {sources.length > 0 && <SourceList sources={sources} />}
                    <ReadChips read={read} />
                  </div>
                ))}
              {/* Sources can arrive on an assistant message with no text (rare, but the
                citation should still show) — same attributed treatment. */}
              {message.role !== 'user' && !text && sources.length > 0 && (
                <div data-part="answer" className="mn-arrive flex flex-col gap-1.5">
                  <span className={machineEyebrowClass}>pond</span>
                  <SourceList sources={sources} />
                  <ReadChips read={read} />
                </div>
              )}
              {/* #97: the `new page — proposed` card(s) for this answer. A pending card
                  is editable in place; make page is the only write; cancel returns
                  to the thread. Re-seeded pending cards (6d closing) render live. */}
              {cardsForMessage.map((proposal) => (
                <PageProposalCard
                  key={proposal.id}
                  className="mn-arrive"
                  name={proposal.name}
                  parentId={proposal.parentId}
                  kind={proposal.kind}
                  parentOptions={parentOptions}
                  status={proposal.status}
                  error={pageProposalErrors[proposal.id]}
                  onNameChange={(name) => editPageProposal(proposal.id, { name })}
                  onParentChange={(parentId) => editPageProposal(proposal.id, { parentId })}
                  onKindChange={(kind) => editPageProposal(proposal.id, { kind })}
                  onMakePage={() => void makePage(proposal.id)}
                  onCancel={() => cancelPageProposal(proposal.id)}
                  onOpenPage={proposal.pageId ? () => openMadePage(proposal) : undefined}
                />
              ))}
              {/* The actions under the latest answer (6a frames 2–3): make this a
                  page / ask again — or stop while it streams. Nothing else (W4). */}
              {message.role === 'assistant' && isLastAssistant && (text || isStreaming) && (
                <AnswerActions
                  streaming={answerStreaming}
                  canMakePage={!!text && !hasOpenCard}
                  onMakePage={() => {
                    const q = questionBefore(messageIndex)
                    proposePage({
                      messageId: message.id,
                      question: q.text,
                      askedAt: q.sentAt,
                      prose: text,
                      read,
                    })
                  }}
                  onAskAgain={() => {
                    // "ask again" asks the same question as a NEW turn; the earlier
                    // answer stays in the thread (threads keep every answer).
                    const q = questionBefore(messageIndex).text
                    if (q && !isStreaming) sendText(q)
                  }}
                  onStop={stop}
                />
              )}
              {diffCards.length > 0 && (
                <div className="mn-arrive">
                  <ProposalGroup
                    cards={diffCards}
                    onAccept={(id) => acceptChanges(id, batchById.get(id) ?? [], allIndices(id))}
                    onReject={(id) => decideChanges(id, allIndices(id), 'rejected')}
                    onRequestChanges={(id, note) =>
                      sendRequestChanges(id, allIndices(id).length, note, 'note')
                    }
                    onRevise={(id) =>
                      sendRequestChanges(id, allIndices(id).length, REVISE_NOTE, 'outdated')
                    }
                    onAskAgain={() => {
                      const q = questionBefore(messageIndex).text
                      if (q && !isStreaming) sendText(q)
                    }}
                    onAcceptAll={() => {
                      // Sequentially (#98 review). Each accept is a
                      // read-modify-write of its target page's whole block
                      // array, and two cards in one message can name the SAME
                      // page — fired in parallel they both read the pre-write
                      // blocks and the second save silently drops the first
                      // batch. `writeAcceptedChanges` serialises per page as
                      // well (the lock is the guarantee, since a second click
                      // or another surface can race too); awaiting here also
                      // keeps the toast receipts in card order.
                      void (async () => {
                        for (const id of pendingDiffIds) {
                          await acceptChanges(id, batchById.get(id) ?? [], allIndices(id))
                        }
                      })()
                    }}
                    onRejectAll={() => {
                      for (const id of pendingDiffIds) decideChanges(id, allIndices(id), 'rejected')
                    }}
                  />
                </div>
              )}
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
                    className="mn-arrive"
                    title={input.title}
                    type={input.type}
                    kind={input.kind}
                    blocks={input.blocks ?? []}
                    reason={input.reason}
                    status={status}
                    selectedParentId={selectedParentId}
                    parentOptions={parentOptions}
                    onParentChange={(id) =>
                      dispatch({
                        kind: 'pickDestination',
                        type: 'creates',
                        id: part.toolCallId,
                        destinationId: id,
                      })
                    }
                    onAccept={() => acceptCreatePage(part.toolCallId, input, selectedParentId)}
                    onReject={() => rejectCard('creates', part.toolCallId)}
                  />
                )
              })}
              {/* define_schema proposal cards (#17 slice 5): turn an existing page
                  into a collection. Client-resolved; Accept writes the schema and
                  the decision rides the resolutions envelope so the card goes
                  inert and the model stops re-proposing. */}
              {defineSchemaParts.map((part) => {
                // Same streaming caveat as the other cards: a partially-parsed
                // `properties` array would render an incomplete preview.
                if (part.state === 'input-streaming') return null
                const input = part.input
                const properties = input?.properties ?? []
                if (!input?.pageId || properties.length === 0) return null
                const status = schemaDecisions[part.toolCallId] ?? 'pending'
                const selectedTargetId = schemaTarget[part.toolCallId] ?? input.pageId
                // #52 fix 1 — flag rollups whose relation won't resolve to a relation on
                // the RESULTING collection (existing schema of the selected target + the
                // proposed props), recomputed as the picker changes. Same test the accept
                // path applies, so preview and receipt never disagree.
                const targetSchema =
                  readSchema(allPages.find((p) => p.id === selectedTargetId)?.props) ?? []
                const unresolvableRollups = unresolvableRollupNames(properties, targetSchema)
                return (
                  <DefineSchemaProposalCard
                    key={part.toolCallId}
                    className="mn-arrive"
                    properties={properties}
                    reason={input.reason}
                    status={status}
                    selectedTargetId={selectedTargetId}
                    targetOptions={parentOptions}
                    resolveTargetTitle={resolveTargetTitle}
                    unresolvableRollups={unresolvableRollups}
                    resolvedInertRollups={schemaInertRollups[part.toolCallId]}
                    onTargetChange={(id) =>
                      dispatch({
                        kind: 'pickDestination',
                        type: 'schemas',
                        id: part.toolCallId,
                        destinationId: id,
                      })
                    }
                    onAccept={() => acceptDefineSchema(part.toolCallId, input, selectedTargetId)}
                    onReject={() => rejectCard('schemas', part.toolCallId)}
                  />
                )
              })}
              {/* add_row proposal cards (#18): add a schema-bound row to an existing
                  collection. Client-resolved; Accept creates the row and the
                  decision rides the resolutions envelope so the card goes inert and
                  the model stops re-proposing. */}
              {addRowParts.map((part) => {
                // Same streaming caveat as the other cards: a partially-parsed
                // `props` map would render an incomplete preview.
                if (part.state === 'input-streaming') return null
                const input = part.input
                if (!input?.collectionId) return null
                const status = rowDecisions[part.toolCallId] ?? 'pending'
                const selectedTargetId = rowTarget[part.toolCallId] ?? input.collectionId
                return (
                  <AddRowProposalCard
                    key={part.toolCallId}
                    className="mn-arrive"
                    title={input.title}
                    props={input.props ?? {}}
                    reason={input.reason}
                    status={status}
                    selectedTargetId={selectedTargetId}
                    targetOptions={collectionOptions}
                    onTargetChange={(id) =>
                      dispatch({
                        kind: 'pickDestination',
                        type: 'rows',
                        id: part.toolCallId,
                        destinationId: id,
                      })
                    }
                    onAccept={() => acceptAddRow(part.toolCallId, input, selectedTargetId)}
                    onReject={() => rejectCard('rows', part.toolCallId)}
                  />
                )
              })}
              {/* promote_table proposal cards (#29): CONVERT an existing freeform
                  table block into a collection. Client-resolved; the preview columns
                  are inferred from the host page's table (read here, mirroring the
                  accept path). Accept writes and the decision rides the resolutions
                  envelope so the card goes inert and the model stops re-proposing. */}
              {promoteTableParts.map((part) => {
                if (part.state === 'input-streaming') return null
                const input = part.input
                if (!input?.pageId) return null
                const status = promotionDecisions[part.toolCallId] ?? 'pending'
                const selectedTargetId = promotionTarget[part.toolCallId] ?? input.pageId
                // Preview from the SELECTED page's table (the AI's proposed block id
                // only applies to its proposed page).
                const targetPage = allPages.find((p) => p.id === selectedTargetId)
                const livePreview = tablePromotionPreview(
                  targetPage,
                  selectedTargetId === input.pageId ? input.blockId : undefined
                )
                // Accepting replaces the table with a view, so the live preview then
                // reads null — fall back to the snapshot frozen at accept time so the
                // resolved card keeps its columns + "Table converted" line.
                // The store keeps the frozen snapshot structurally (columns:
                // readonly unknown[]) to stay React-free; it never inspects columns,
                // so reading them back as the terminal's PromotedColumn[] is safe.
                const preview =
                  livePreview ??
                  (promotionSnapshot[part.toolCallId] as
                    | { columns: PromotedColumn[]; rowCount: number; tableTitle?: string }
                    | undefined)
                // No resolvable table AND no snapshot (still loading, or a stale/
                // hallucinated id): hold the card back rather than show an empty one.
                if (!preview) return null
                return (
                  <PromoteTableProposalCard
                    key={part.toolCallId}
                    className="mn-arrive"
                    tableTitle={preview.tableTitle}
                    columns={preview.columns}
                    rowCount={preview.rowCount}
                    reason={input.reason}
                    status={status}
                    selectedTargetId={selectedTargetId}
                    targetOptions={tableHostOptions}
                    onTargetChange={(id) =>
                      dispatch({
                        kind: 'pickDestination',
                        type: 'promotions',
                        id: part.toolCallId,
                        destinationId: id,
                      })
                    }
                    onAccept={() =>
                      acceptPromoteTable(part.toolCallId, input, selectedTargetId, preview)
                    }
                    onReject={() => rejectCard('promotions', part.toolCallId)}
                  />
                )
              })}
              {/* configure_view proposal cards (#19 slice 5): SELECT a layout
                  (table/board/calendar/gallery) for an existing collection's rows,
                  optionally grouped/sorted/filtered. Client-resolved; Accept upserts
                  the view block and the decision rides the resolutions envelope so the
                  card goes inert and the model stops re-proposing. */}
              {configureViewParts.map((part) => {
                // Same streaming caveat as the other cards: a partially-parsed input
                // would render an incomplete preview.
                if (part.state === 'input-streaming') return null
                const input = part.input
                if (!input?.pageId || !input?.mode) return null
                const status = viewDecisions[part.toolCallId] ?? 'pending'
                // A LINKED view (#41) names ANOTHER collection to draw; pre-resolve
                // that name to its id so the picker lands on it (and disambiguates a
                // duplicate title). An inline view falls back to the proposed pageId.
                const preResolvedTarget = input.targetCollection
                  ? resolveCollectionByName(allPages, input.targetCollection)
                  : null
                const selectedTargetId =
                  viewTarget[part.toolCallId] ?? preResolvedTarget ?? input.pageId
                return (
                  <ConfigureViewProposalCard
                    key={part.toolCallId}
                    className="mn-arrive"
                    mode={input.mode}
                    groupBy={input.groupBy}
                    sort={input.sort}
                    filter={input.filter}
                    chart={input.chart}
                    bigNumber={input.bigNumber}
                    reason={input.reason}
                    status={status}
                    replacedActiveView={viewReplaced[part.toolCallId] === true}
                    selectedTargetId={selectedTargetId}
                    targetOptions={collectionOptions}
                    destinationLabel={input.targetCollection ? 'Draw rows from' : 'Configure on'}
                    onTargetChange={(id) =>
                      dispatch({
                        kind: 'pickDestination',
                        type: 'views',
                        id: part.toolCallId,
                        destinationId: id,
                      })
                    }
                    onAccept={() => acceptConfigureView(part.toolCallId, input, selectedTargetId)}
                    onReject={() => rejectCard('views', part.toolCallId)}
                  />
                )
              })}
              {/* link_records proposal cards (#40): link EXISTING rows through an
                  existing relation, everything named by TITLE. Client-resolved;
                  Accept resolves titles→ids strictly and appends the links, and
                  the decision rides the resolutions envelope so the card goes
                  inert and the model stops re-proposing. */}
              {linkRecordsParts.map((part) => {
                // Same streaming caveat as the other cards: a partially-parsed
                // toRows array would render an incomplete preview.
                if (part.state === 'input-streaming') return null
                const input = part.input
                if (!input?.fromRow || !input?.relation || !input?.toRows?.length) return null
                const status = linkDecisions[part.toolCallId] ?? 'pending'
                // Pre-resolve the proposed source-collection NAME to its id so
                // the picker lands on it (and disambiguates a duplicate title),
                // exactly like a linked view's targetCollection.
                const preResolvedTarget = input.fromCollection
                  ? resolveCollectionByName(allPages, input.fromCollection)
                  : null
                const selectedTargetId = linkTarget[part.toolCallId] ?? preResolvedTarget ?? ''
                return (
                  <LinkRecordsProposalCard
                    key={part.toolCallId}
                    className="mn-arrive"
                    fromRow={input.fromRow}
                    relation={input.relation}
                    toRows={input.toRows}
                    reason={input.reason}
                    error={linkErrors[part.toolCallId]}
                    status={status}
                    selectedTargetId={selectedTargetId}
                    targetOptions={collectionOptions}
                    onTargetChange={(id) =>
                      dispatch({
                        kind: 'pickDestination',
                        type: 'links',
                        id: part.toolCallId,
                        destinationId: id,
                      })
                    }
                    onAccept={() => acceptLinkRecords(part.toolCallId, input, selectedTargetId)}
                    onReject={() => rejectCard('links', part.toolCallId)}
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
        {/* An error keeps nothing (6a frame 2; PondComposer `errRow`): the partial
            answer was dropped above; say so and offer the question again. */}
        {error && !isStreaming && (
          <div
            role="alert"
            data-part="error-row"
            className="flex flex-wrap items-center gap-2.5 font-mono text-[12px] lowercase tracking-[0.02em] text-mn-text-meta"
          >
            <span>pond couldn’t finish this answer. nothing was kept.</span>
            {lastQuestion.text && (
              <button
                type="button"
                onClick={() => sendText(lastQuestion.text)}
                className="rounded-mn-pill bg-mn-text/[0.07] px-[11px] py-1.5 text-[11px] text-mn-text-meta transition-colors hover:text-foreground"
              >
                ask again
              </button>
            )}
          </div>
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
  // ticket-42 follow-up: the TerminalDrawer card owns the column; the footer only
  // owns its inner gutter + the divider above it. No re-centering here.
  const inputFooter = (
    <div
      className="flex-shrink-0"
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={handleDrop}
    >
      <div className="w-full px-8">
        <div className="border-t border-mn-hair">
          {/* Quote chip — highlight-to-ask (ticket-40 F20) */}
          {quoteCtx && (
            <div className="pt-2">
              <QuoteChip text={quoteCtx.text} onRemove={() => setQuoteCtx(null)} />
            </div>
          )}
          {/* CSV attachment pill (ticket-40 F16) */}
          {csvAttachment && (
            <div className="pt-2">
              <CsvAttachmentPill
                filename={csvAttachment.filename}
                rowCount={csvAttachment.parsed.totalRows}
                onRemove={() => setCsvAttachment(null)}
              />
            </div>
          )}
          {/* Uploaded file attachments (#61) — removable before send */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {attachments.map((a) => (
                <FileAttachmentChip
                  key={a.path}
                  filename={a.filename}
                  url={a.url}
                  mediaType={a.mediaType}
                  onRemove={() => removeAttachment(a.path)}
                />
              ))}
            </div>
          )}
          <div className="flex items-end gap-4 py-3">
            {/* ticket-41: the threshold. The sage baseline DRAWS in left→right on
                focus (motion-focus-draw's ::after) rather than the border flipping
                color — a stroke, not a flash. The static hairline below stays;
                the draw is the focus signal. Reduced-motion snaps it in.
                ticket-40: composerRef anchors the highlight-to-ask popover. */}
            <div ref={composerRef} className="motion-focus-draw relative flex-1">
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
                  // ticket-41: anchored above the composer, so it grows from its
                  // bottom edge (--motion-menu-origin overrides the default top-left).
                  className="absolute bottom-full left-0 z-20 w-64 mb-1 [--motion-menu-origin:bottom_left]"
                />
              )}
              {/* Ghost suggestion (ticket-40 §5) — behind the textarea, visible only when empty */}
              <GhostSuggestion
                suggestion={activeSuggestion}
                inputValue={input}
                onAccept={handleGhostAccept}
                onDismiss={handleGhostDismiss}
                id="ghost-suggestion"
                className="py-1.5"
              />
              <textarea
                ref={inputRef}
                value={input}
                aria-describedby={activeSuggestion && !input ? 'ghost-suggestion' : undefined}
                onChange={(e) => {
                  const val = e.target.value
                  setInput(val)
                  if (val === '/' || (val.startsWith('/') && !val.includes(' '))) {
                    setChatMenuOpen(true)
                  } else {
                    setChatMenuOpen(false)
                  }
                }}
                onKeyDown={handleKeyDown}
                // When a ghost suggestion is showing on the empty input, it IS the
                // empty-state hint — suppress the static placeholder so the two
                // don't render on top of each other.
                // MN: the composer's placeholder shifts once the thread has a turn —
                // "reply, or ask something else" — matching the mockup's two-state hint.
                placeholder={
                  activeSuggestion && !input
                    ? ''
                    : messages.length > 0
                      ? 'reply, or ask something else'
                      : 'ask pond, or / for blocks'
                }
                rows={inputRows}
                // relative z-10 (ticket-40) keeps the textarea above the ghost
                // suggestion behind it; the focus signal is ticket-41's draw-in
                // baseline (motion-focus-draw), so no border-color flip here.
                // MN: the composer is a machine surface — mono, lowercase, tight
                // tracking (--voice-mono). Typed intent reads as machine input.
                className="relative z-10 w-full resize-none border-0 border-b border-mn-line bg-transparent px-0 py-1.5 font-mono lowercase tracking-[0.02em] text-mn-13 text-mn-text-meta outline-none placeholder:text-mn-text-faint disabled:opacity-60"
                disabled={isStreaming || !isReady}
              />
            </div>
            {/* Voice input button (ticket-40 F6) */}
            <VoiceInputButton
              onTranscript={(t) => setInput(t)}
              disabled={isStreaming || !isReady}
              className="self-end mb-2"
            />
            {/* Attachment paperclip (#61, generalized from the ticket-40 F16
                CSV-only clip): images/pdf/txt/md upload to storage and ride the
                message; .csv keeps its inline-context path. The input is a
                persistent hidden element (not a transient createElement) so the
                picker is testable and re-picking the same file re-fires. */}
            <input
              ref={attachInputRef}
              type="file"
              multiple
              accept={`.csv,text/csv,${ATTACHMENT_ACCEPT}`}
              className="hidden"
              onChange={(e) => {
                handlePickedFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              aria-label="Attach a file"
              title="Attach a file — images, pdf, txt, md, csv · up to 10MB"
              onClick={handleAttachClick}
              disabled={isStreaming || !isReady}
              className="self-end mb-2 text-mn-text-faint hover:text-mn-text transition-colors disabled:opacity-40"
            >
              <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" width={14} height={14}>
                <path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v7a.5.5 0 0 0 1 0V3a1.5 1.5 0 0 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v7a3.5 3.5 0 1 1-7 0V3Z" />
              </svg>
            </button>
            <button
              onClick={handleSend}
              disabled={
                isStreaming ||
                (!input.trim() && attachments.length === 0) ||
                isUploading ||
                !isReady
              }
              // MN: the composer is a machine surface — its Send control speaks the
              // mono machine voice (lowercase, tracking-wider), not the serif kicker.
              className="self-end pb-2 font-mono lowercase tracking-wider text-xs text-mn-text transition-colors hover:text-mn-text disabled:opacity-40 disabled:hover:text-mn-text"
            >
              send
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // The quiet phase indicator (ticket-39 §2): while a project is in flight the
  // context bar reads e.g. "Kiln Studio · charting"; otherwise just the base
  // context label. Derived from the lifecycle state (grilling → charting →
  // building), kept quiet.
  const phaseContextLabel = lifecycleContextLabel(lifecycle, contextLabel)

  return (
    <>
      {/* Highlight-to-ask popover (ticket-40 F20) — global selection listener */}
      <TextSelectionPopover onAsk={handleAskFromSelection} disabled={isStreaming} />
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
