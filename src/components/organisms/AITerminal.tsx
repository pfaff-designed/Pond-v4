'use client'

import { useChat } from '@ai-sdk/react'
import { Fragment, useRef, useEffect, useMemo, useState, useReducer, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import {
  getOrCreateConversation,
  saveTranscript,
  dissolveConversation,
} from '@/lib/conversation/client'
import {
  resolveStampTarget,
  resolveAcceptTarget,
  type ConversationResolutions,
  type ProposalDecision,
} from '@/lib/conversation/resolutions'
import { getPage, listPages } from '@/lib/pages/client'
import { usePond } from '@/lib/pond/context'
import { pagesKey } from '@/lib/pages/keys'
import { usePondName } from '@/lib/pond/name'
import {
  COMPOSER_NOTICE_EVENT,
  FOCUS_TERMINAL_EVENT,
  HTML_IMPORT_PICKER_EVENT,
  OPEN_THREAD_MESSAGE_EVENT,
  TOGGLE_COMPOSER_EVENT,
  requestHtmlImportPicker,
  type ComposerNoticeDetail,
  type FocusTerminalDetail,
  type OpenThreadMessageDetail,
} from '@/lib/terminal-focus'
import { ParentGoneError, makePageFromAnswer, recordPageProposal } from '@/lib/pages/make-page'
import {
  DEFAULT_PAGE_KIND,
  derivePageName,
  earlierAnswers,
  formatThreadTime,
  openPageProposalIds,
  readChips,
  readStamp,
  withEarlierAnswer,
  withReadStamp,
  type EarlierAnswer,
  type PageProposal,
  type ReadPartLike,
} from '@/lib/conversation/page-proposals'
import { pageEyebrowClass, chipBaseClass } from '@/components/atoms/kicker'
import { ReadChips } from '@/components/molecules/ReadChips'
import { AnswerActions } from '@/components/molecules/AnswerActions'
import { PageProposalCard } from '@/components/molecules/PageProposalCard'
import { toParentOptions } from '@/lib/pages/parent-options'
import { workspaceHref } from '@/lib/pages/nav'
import { insertPageOptimistic } from '@/lib/pages/tree'
import { writeAcceptedChanges } from '@/lib/pages/accept'
import { sessionUndo } from '@/lib/change-log/session-undo'
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
import {
  SelectionBar,
  type SelectionContext,
} from '@/components/molecules/SelectionBar'
import { FileAttachmentChip } from '@/components/molecules/FileAttachmentChip'
import { useAttachments } from '@/lib/attachments/use-attachments'
import { useInlineAttachment } from '@/lib/attachments/use-inline-attachment'
import { ATTACHMENT_ACCEPT } from '@/lib/attachments/validate'
import {
  describeFoundCounts,
  isHtmlSendBlockedOffline,
  startStoppableHtmlRead,
} from '@/lib/attachments/html'
import type { ReadHtmlError, ReadHtmlResult } from '@/lib/import/types'
import { formatBytes } from '@/components/molecules/HtmlAttachmentPill'
import { QuoteChip } from '@/components/atoms/QuoteChip'
import { parseCsv } from '@/lib/csv/parse-csv'
import {
  getInlineAttachmentDescriptor,
  getInlineAttachmentDescriptorForFile,
  type InlineAttachment,
  type CsvInlineAttachment,
  type HtmlInlineAttachment,
} from '@/lib/attachments/inline-attachment-kinds'
import { TerminalDrawer } from '@/components/molecules/TerminalDrawer'
import { useComposerHeight } from '@/lib/layout/composer-height'
import {
  AnswerError,
  EarlierAnswerFold,
  EarlierTurns,
  ThreadHead,
  Turn,
  YouRow,
} from '@/components/molecules/ComposerThread'
import { foldedTurnCount, groupTurns } from '@/lib/conversation/turns'
import { areaOf } from '@/lib/pages/crumbs'
import { ComposerLine } from '@/components/molecules/ComposerLine'
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
  type ProposalMessageLike,
} from '@/lib/conversation/proposals'
import {
  isProposeChangesPart,
  isCreatePagePart,
  isDefineSchemaPart,
  isAddRowPart,
  isConfigureViewPart,
  isLinkRecordsPart,
  isPromoteTablePart,
  isAskQuestionPart,
  isSuggestFollowupsPart,
  type CreatePagePart,
  type DefineSchemaPart,
  type AddRowPart,
  type ConfigureViewPart,
  type LinkRecordsPart,
  type PromoteTablePart,
} from '@/lib/conversation/tool-parts'
import {
  detectLifecycleIntent,
  detectLifecycleSignal,
  applyLifecycleSignal,
  beginLifecycle,
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
import type { ModuleChange } from '@/lib/modules/ai-composition'
import type { Block } from '@/lib/documents/types'
import { withSchema, isCollection, readSchema } from '@/lib/properties/schema'
/** The canned note `revise` sends on an outdated card (#98, G2): Pond redrafts
 *  the diff against the page as it now stands. */
const REVISE_NOTE =
  'the page changed since this was proposed — revise it against the page as it now stands.'

/** An ask again that ends without a replacement (failed, or stopped before its first
 *  chunk) puts the answer it was replacing back verbatim at its own index. It never
 *  left the person's thread, so it is not folded into `earlier`. */
const restoreReplacedAnswer = <T extends { id: string }>(
  thread: T[],
  stashed: { message: T; messageIndex: number } | null
): T[] => {
  if (!stashed || thread.some((m) => m.id === stashed.message.id)) return thread
  const at = Math.min(stashed.messageIndex, thread.length)
  return [...thread.slice(0, at), stashed.message, ...thread.slice(at)]
}

/** The offer once an html read settles ok (KAN-251, 06.25 frame 1/2): typing
 *  anything else works too, so these are chips onto the ordinary send path. */
const HTML_IMPORT_CHIPS = ['make this a page', 'file it as it is']

/** 06.25 frame 6's two unreadable-failure chips (`rg -o` on the board's own
 *  copy: "try another file", not the ticket's shorthand "try another"). */
const HTML_UNREADABLE_CHIPS = ['keep it as a file', 'try another file']

/** 06.25 frame 6's single too-large-failure chip — there is no "try another"
 *  here, since the file itself (not the attempt) is the problem. */
const HTML_TOO_LARGE_CHIPS = ['keep it as a file']

/** Frame 1's offer and frame 6's failure options are the same `chips` section
 *  (board `sChips` + `chip`), so one row draws both. `chipBaseClass` is the
 *  primitive `AnswerActions` hangs "make this a page" on — not the hairline
 *  outlined `FollowupChips`, which is a different board's variant. */
const HtmlChipRow = ({
  label,
  chips,
  disabled,
  onPick,
}: {
  label: string
  chips: string[]
  disabled: boolean
  onPick: (chip: string) => void
}) => (
  <div
    role="group"
    aria-label={label}
    className="flex flex-wrap items-center gap-[7px] font-mono text-[11px] lowercase tracking-[0.02em]"
  >
    {chips.map((chip) => (
      // `max-md:h-11` overrides PondComposer's `chip` mob height on purpose:
      // 06.25 frame 7's caption ("44px — chips, buttons and the reply line")
      // and AUDIT X1 outrank the DC here. Same exception as the composer ＋
      // in ComposerLine.tsx, which carries the ruling; don't revert this to
      // the DC in a parity pass. The horizontal padding follows the DC's
      // mob `chip` padding (`10px 14px`) — only the height is overridden.
      <button
        key={chip}
        type="button"
        disabled={disabled}
        onClick={() => onPick(chip)}
        className={`${chipBaseClass} flex max-md:h-11 max-md:px-[14px] items-center justify-center py-1.5 text-mn-text-meta hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-mn-text disabled:opacity-40 disabled:hover:text-mn-text-meta`}
      >
        {chip}
      </button>
    ))}
  </div>
)

/** 06.25 frame 6's failure copy, read via `rg -o` from the board and filled in
 *  with the real filename and sizes. The board's `a` strings are sentence
 *  case with curly apostrophes — unlike the lowercase line/chip copy, this
 *  is rendered verbatim, never through a `lowercase` className. Offline has
 *  no case here — it isn't a `ReadHtmlError`, since the read itself can
 *  succeed; only asking fails (see `describeHtmlOfflineNote` below). */
function describeHtmlFailure(filename: string, error: ReadHtmlError): string {
  if (error.kind === 'unreadable') {
    return `I can’t read ${filename}: it’s empty, or it isn’t html. Nothing was made.`
  }
  return `${filename} is ${formatBytes(error.size, 'upper')}. I can read html files up to ${formatBytes(error.limit, 'upper')}. Split it, or keep it as a file.`
}

/** 06.25 frame 6's offline copy — a turn's `note`, not its `a`: asking failed
 *  before any read ran, so there's nothing to answer. Sentence case verbatim
 *  from the board (its own first word is lowercase "asking", a continuation
 *  of the turn's question, not a new sentence). */
function describeHtmlOfflineNote(filename: string): string {
  return `asking needs a connection. ${filename} stays attached; nothing is sent until you’re back online.`
}

/** A snapshot of a settled html read, kept after its file is removed (the
 *  pill's ×, KAN-251 10098): PROJECT_RULES says answers live in the thread,
 *  so removing the file must not take the question/answer with it. Only a
 *  SETTLED read (ok or failed) is ever snapshotted — Esc mid-read, a new
 *  attach and `try another file` still clear everything, same as today,
 *  since there's no answer yet to keep. `afterMessages` anchors it to the
 *  ordinary thread: the number of chat `messages` that existed when the
 *  read happened, so it renders back in that position once removed. */
type HtmlTurnSnapshot = {
  id: string
  question: string
  at: string | null
  filename: string
  size: number
  result: ReadHtmlResult
  afterMessages: number
}

/** Renders one html read turn (q → a → readRow, 06.25 frame 2/6) — shared by
 *  the live attachment above the composer line and a kept snapshot in the
 *  thread body once the file's been removed. A kept turn passes no
 *  `failureChips`: the file is gone, so there's nothing left to act on. */
function HtmlReadTurn({
  question,
  at,
  filename,
  size,
  reading,
  result,
  offlineNote,
  failureChips,
}: {
  question: string
  at: string | null
  filename: string
  size: number
  reading: boolean
  result: ReadHtmlResult | null
  offlineNote?: string
  failureChips?: { chips: string[]; disabled: boolean; onPick: (chip: string) => void }
}) {
  return (
    <Turn>
      <YouRow text={question} time={formatThreadTime(at)} />
      {/* AUDIT G6: the reading/answer/failure state above is otherwise
          announced to sighted users only — a screen reader gets no word
          that Pond started reading, finished, or refused the file. */}
      <div role="status" aria-live="polite">
        {/* 6z frame 2's `a` is a turn answer from the moment reading starts,
            not just once it settles — the person spends the whole read in
            this frame, so it can't be blank. The read chip renders after
            it: board order is `q → a → readRow`, same as the ordinary
            thread's own turns. */}
        {(reading || result?.ok) && (
          <p className="font-sans text-[13.5px] max-md:text-[15px] leading-[1.55] text-mn-text">
            Reading {filename}.{result?.ok && ` So far: ${describeFoundCounts(result.found)}.`}
          </p>
        )}
        {/* 6z frame 2 keeps the read chip ON the turn once it settles, not
            just while reading — every answer shows what it read
            (PROJECT_RULES). Reuses ReadChips rather than a bespoke row
            (AGENTS.md: duplicates go). */}
        {(reading || result?.ok) && <ReadChips read={[`${filename} · ${formatBytes(size)}`]} />}
        {/* 06.25 frame 6: each failure says what happened and what is still
            possible — nothing half made. The board's `a` copy is sentence
            case, so this paragraph drops the `lowercase` className other
            machine-surface text here carries — only the line/chip strings
            are lowercase. */}
        {result && !result.ok && (
          <>
            <p className="font-sans text-[13.5px] max-md:text-[15px] leading-[1.55] text-mn-text">
              {describeHtmlFailure(filename, result.error)}
            </p>
            {failureChips && (
              <HtmlChipRow
                label="Options"
                chips={failureChips.chips}
                disabled={failureChips.disabled}
                onPick={failureChips.onPick}
              />
            )}
          </>
        )}
        {/* 06.25 frame 6 offline: a turn's `note`, not its `a` — asking
            failed before any read ran, so there's no answer and no failure
            chips, only the pill staying attached. The offer chips (live
            only — a kept turn has no pill left to offer against) stay
            beside this note (the 11 oct ruling at that gate). */}
        {offlineNote && (
          <p className="font-mono text-[11px] text-mn-text-secondary">{offlineNote}</p>
        )}
      </div>
    </Turn>
  )
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

export function AITerminal() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nodeName = searchParams.get('nodeName')
  const nodeId = searchParams.get('nodeId')
  const nodeType = searchParams.get('nodeType')
  // At the root the context is the pond itself — its name, never an assumed one
  // (AUDIT W9: copy says "this pond", not "life").
  const pondName = usePondName()
  const contextLabel = nodeName ?? pondName

  const queryClient = useQueryClient()
  // Lazily created on first use, not at render — so an envless mount (Storybook,
  // CI) never constructs a real client and throws (#38); queryFns, effects and
  // the accept handlers below construct it only when they actually run.
  const getSupabase = useLazySupabase()
  const { pond, ponds, loading: pondsLoading } = usePond()
  const pondId = pond?.id ?? null
  // An unresolved pond reads as the person's FIRST pond (`resolvePond`), so a thread
  // may only load once the list has loaded and named this one. A `?pond=` the list
  // does not hold (yet) resolves to null too; only an empty list means no pond scope.
  const pondSettled = !pondsLoading && (pond !== null || ponds.length === 0)
  const composerHeight = useComposerHeight()

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
          pondId,
          toolCallId,
          decision,
        })
      })()
    },
    [getSupabase, pondId]
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
    changePlace,
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
  // MUST be keyed separately from the sidebar's pagesKey() cache: that
  // one is fed by `fetchPages`, a lean projection with NO `props`. This query is
  // `listPages` — the full page shape *including* `props`, which #18's
  // `collectionOptions` needs to read `_schema` (isCollection). Sharing the key
  // let React Query serve the props-less shape here, silently emptying the
  // collection picker. The extra key segment keeps them distinct while
  // prefix-based `invalidateQueries(['pages'])` still refreshes both.
  const { data: allPages = [], isFetched: pagesLoaded } = useQuery({
    queryKey: [...pagesKey(pondId), 'full'],
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      return user ? listPages(supabase, user.id, pondId) : []
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
  const { messages, sendMessage, regenerate, setMessages, status, stop, error, clearError } =
    useChat()
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
  //
  // A failed ask again also puts the answer it was replacing back, verbatim and
  // at its own index, as the current answer: it never left the person's thread,
  // so it is not folded into `earlier`. The stash is cleared here, before the
  // merge effect below can mistake the partial replacement for a finished one.
  const droppedForError = useRef<unknown>(null)
  const pendingRegenerate = useRef<{
    message: (typeof messages)[number]
    messageIndex: number
  } | null>(null)
  useEffect(() => {
    if (!error) {
      droppedForError.current = null
      return
    }
    if (droppedForError.current === error) return
    droppedForError.current = error
    const stashed = pendingRegenerate.current
    pendingRegenerate.current = null
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      const kept = last?.role === 'assistant' ? prev.slice(0, -1) : prev
      return restoreReplacedAnswer(kept, stashed)
    })
  }, [error, setMessages])
  // Deep research: the only road to the web, off by default and spent per question.
  const [research, setResearch] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  // The pond whose thread is on screen; `undefined` until the first thread lands.
  // Ready means the thread on screen is THIS pond's: mid-switch, a send would carry
  // the new pond's context into the old pond's thread, and a save could pair one
  // pond's messages with the other's conversation id.
  const [threadPondId, setThreadPondId] = useState<string | null | undefined>(undefined)
  const isReady = threadPondId !== undefined && threadPondId === pondId
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
  const {
    attachment: csvAttachment,
    setAttachment: setCsvAttachment,
    clear: clearCsvAttachment,
  } = useInlineAttachment<CsvInlineAttachment>()

  const processCsvFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const raw = e.target?.result
        if (typeof raw !== 'string') return
        const result = parseCsv(raw)
        if (!result.ok) {
          setInput(`[CSV error: ${result.message}]`)
          return
        }
        setCsvAttachment({ kind: 'csv', parsed: result, filename: file.name })
      }
      reader.readAsText(file)
    },
    [setCsvAttachment]
  )

  // ── HTML attachment (KAN-251) ─────────────────────────────────────────────
  // Mirrors the csv attachment above: an html file keeps its own inline pill
  // above the line rather than riding the upload path. One stoppable, timed
  // read runs at a time; Esc while it's in flight stops it and clears every
  // bit of html state back to nothing — no pill, no message, no record —
  // since nothing has been made yet to undo.
  const {
    attachment: htmlAttachment,
    setAttachment: setHtmlAttachment,
    clear: clearHtmlAttachmentSlot,
  } = useInlineAttachment<HtmlInlineAttachment>()
  const [htmlReading, setHtmlReading] = useState(false)
  const [htmlResult, setHtmlResult] = useState<ReadHtmlResult | null>(null)
  // The only state in which a send is an ask about the attached file: no read
  // running (it is already asking) and none settled (ok or failed).
  const isHtmlAskPending = Boolean(htmlAttachment) && !htmlReading && !htmlResult
  // Set by the offline guard: asking failed for lack of a
  // connection, not a read error, so it isn't a `ReadHtmlResult` at all —
  // the file stays attached and nothing is sent until it clears.
  const [htmlOffline, setHtmlOffline] = useState(false)
  // What the person asked (06.25 frame 2's turn `q`) — unset until they pick
  // `make this a page` or type and send. An offline attempt also sets this,
  // purely so the note has a `q` to render against — it must NOT double as
  // the read-start/offer-chip gate (that's `isHtmlAskPending`, above), or one
  // offline attempt permanently hides the offer chips and blocks every later
  // ask for this attachment.
  const [htmlQuestion, setHtmlQuestion] = useState<string | null>(null)
  // When it was asked, for the turn's `q` row — every 6z turn and the
  // ordinary thread both draw a time beside the question.
  const [htmlQuestionAt, setHtmlQuestionAt] = useState<string | null>(null)
  const htmlReadRef = useRef<{ stop: () => void } | null>(null)
  // The raw `File`, kept only so the read can start later, on the ask —
  // `htmlAttachment` carries just the name/size a render needs.
  const htmlFileRef = useRef<File | null>(null)

  const clearHtmlAttachment = useCallback(() => {
    htmlReadRef.current?.stop()
    htmlReadRef.current = null
    htmlFileRef.current = null
    clearHtmlAttachmentSlot()
    setHtmlReading(false)
    setHtmlResult(null)
    setHtmlOffline(false)
    setHtmlQuestion(null)
    setHtmlQuestionAt(null)
  }, [clearHtmlAttachmentSlot])

  // Settled html reads kept in the thread after their file is removed (the
  // pill's ×, KAN-251 10098) — PROJECT_RULES: answers live in the thread,
  // so removing the file must not take the question/answer with it. Esc
  // mid-read, `try another file` and a fresh attach still call
  // `clearHtmlAttachment` directly and keep nothing (no answer exists yet).
  const [keptHtmlTurns, setKeptHtmlTurns] = useState<HtmlTurnSnapshot[]>([])

  // The pill's own ×, distinct from `clearHtmlAttachment`: it snapshots a
  // SETTLED read (ok or failed) into `keptHtmlTurns` before wiping the live
  // html state, so the turn survives the file's removal. Nothing to keep
  // while reading (no answer yet) or for an offline-only attempt (no read
  // ever ran) — both fall through to the ordinary clear.
  const removeHtmlAttachment = useCallback(() => {
    if (htmlResult && htmlQuestion && htmlAttachment) {
      setKeptHtmlTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          question: htmlQuestion,
          at: htmlQuestionAt,
          filename: htmlAttachment.filename,
          size: htmlAttachment.size,
          result: htmlResult,
          afterMessages: messages.length,
        },
      ])
    }
    clearHtmlAttachment()
  }, [
    htmlResult,
    htmlQuestion,
    htmlQuestionAt,
    htmlAttachment,
    messages.length,
    clearHtmlAttachment,
  ])

  // The one entry point every html door calls — the ＋ input, the drop
  // handler, ⌘K's `import a page`, and (unchanged, once KAN-186/KAN-193
  // build it) zen's own ＋. 6z frame 1 offers the two chips on attach, with
  // no read and no turn yet — the read only starts once the person asks.
  const handleHtmlFile = useCallback(
    (file: File) => {
      htmlReadRef.current?.stop()
      htmlReadRef.current = null
      htmlFileRef.current = file
      setHtmlAttachment({ kind: 'html', filename: file.name, size: file.size })
      setHtmlResult(null)
      setHtmlReading(false)
      setHtmlOffline(false)
      setHtmlQuestion(null)
      setHtmlQuestionAt(null)
    },
    [setHtmlAttachment]
  )

  // The read's own start signal (06.25 frame 2): `make this a page`, or
  // typing anything else and sending, both ask the same question. `file it
  // as it is` never calls this — it's the ordinary capture path (KAN-130/7c),
  // not a read.
  const startHtmlRead = useCallback((question: string) => {
    const file = htmlFileRef.current
    if (!file) return
    setHtmlQuestion(question)
    setHtmlQuestionAt(new Date().toISOString())
    setHtmlResult(null)
    setHtmlReading(true)
    htmlReadRef.current = startStoppableHtmlRead(file, (result) => {
      setHtmlReading(false)
      setHtmlResult(result)
    })
  }, [])

  // Offline note state, set and cleared in one place: the `htmlQuestion` /
  // `htmlQuestionAt` pair exists only so the note has a `q` to render
  // against, and must go with the flag.
  // Only called while an ask is pending, so `htmlResult` is already null here.
  const markHtmlOffline = useCallback((question: string) => {
    setHtmlQuestion(question)
    setHtmlQuestionAt(new Date().toISOString())
    setHtmlOffline(true)
  }, [])

  const clearHtmlOffline = useCallback(() => {
    setHtmlOffline(false)
    setHtmlQuestion(null)
    setHtmlQuestionAt(null)
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
      // Kind → parse handler: a new kind extends this map, not a new branch.
      const kindParsers: Record<InlineAttachment['kind'], (file: File) => void> = {
        csv: processCsvFile,
        html: handleHtmlFile,
      }
      for (const file of Array.from(files ?? [])) {
        const descriptor = getInlineAttachmentDescriptorForFile(file)
        if (descriptor) kindParsers[descriptor.kind](file)
        else void addFile(file)
      }
    },
    [handleHtmlFile, processCsvFile, addFile]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      handlePickedFiles(e.dataTransfer.files)
    },
    [handlePickedFiles]
  )

  const handleAttachClick = useCallback(() => attachInputRef.current?.click(), [])

  const htmlImportInputRef = useRef<HTMLInputElement>(null)

  // ── Collapse ───────────────────────────────────────────────────────────────
  // Collapse is the session's alone: nothing is remembered, so the composer opens
  // expanded every time. ⌘J, Esc and the thread head's × take it to the tab; the tab,
  // ⌘J and any request for the input bring it back.
  const [isCollapsed, setIsCollapsed] = useState(false)
  // The thread whose earlier turns have been opened (`N earlier turns`), named by
  // its first message — so a fresh thread folds again without anyone resetting it.
  const [earlierOpenFrom, setEarlierOpenFrom] = useState<string | null>(null)
  // The last answer that had finished arriving. The tab reports `pond answered`
  // when this has moved on since the composer was closed.
  const lastSettledAnswerId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== 'assistant') continue
      if (i === messages.length - 1 && isStreaming) continue
      return messages[i].id
    }
    return null
  }, [messages, isStreaming])
  const [answerSeenAtCollapse, setAnswerSeenAtCollapse] = useState<string | null>(null)
  const collapseComposer = useCallback(() => {
    setAnswerSeenAtCollapse(lastSettledAnswerId)
    setIsCollapsed(true)
  }, [lastSettledAnswerId])
  const handleExpand = useCallback(() => setIsCollapsed(false), [])

  // Dedicated html-only picker (KAN-251): ⌘K's `import a page` fires
  // `HTML_IMPORT_PICKER_EVENT`; this is the one place that listens, so a
  // later door (zen's ＋, KAN-186/KAN-193) can dispatch the same event with
  // no change here.
  //
  // Robustness (ticket-24, same shape as `pendingFocus` below): a *collapsed*
  // composer unmounts this input, so a synchronous click() while collapsed
  // finds nothing. Uncollapse and set a pending flag; the effect near
  // `effectiveCollapsed` clicks once the input is back in the DOM.
  const pendingHtmlImport = useRef(false)
  useEffect(() => {
    function onHtmlImportPickerRequest() {
      const el = htmlImportInputRef.current
      if (el) {
        el.click()
        return
      }
      setIsCollapsed(false)
      pendingHtmlImport.current = true
    }
    window.addEventListener(HTML_IMPORT_PICKER_EVENT, onHtmlImportPickerRequest)
    return () => window.removeEventListener(HTML_IMPORT_PICKER_EVENT, onHtmlImportPickerRequest)
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
    function onFocusRequest(e: Event) {
      // The palette's `ask pond about “q”` (#279) arrives with the question typed —
      // into an EMPTY composer only. A draft in progress is the person's and is
      // never overwritten (there is no undo for it); the question still gets focus.
      const text = (e as CustomEvent<FocusTerminalDetail>).detail?.text
      if (text) setInput((prev) => (prev.trim() ? prev : text))
      setIsCollapsed(false)
      focusInputSoon()
    }
    window.addEventListener(FOCUS_TERMINAL_EVENT, onFocusRequest)
    return () => window.removeEventListener(FOCUS_TERMINAL_EVENT, onFocusRequest)
  }, [focusInputSoon])

  // A stale/blocked/refused ⌘Z or ⇧⌘Z (ShellCommands) says why in this one
  // line — the composer's only notice line, machine register. Replaces
  // rather than queues: only the latest chord's outcome is worth showing.
  const [composerNotice, setComposerNotice] = useState<string | null>(null)
  useEffect(() => {
    function onComposerNotice(e: Event) {
      // An empty text clears the line: a done/empty chord has nothing to say,
      // and leaving the last stale/blocked wording up would read backwards.
      setComposerNotice((e as CustomEvent<ComposerNoticeDetail>).detail.text || null)
    }
    window.addEventListener(COMPOSER_NOTICE_EVENT, onComposerNotice)
    return () => window.removeEventListener(COMPOSER_NOTICE_EVENT, onComposerNotice)
  }, [])

  // ── Load or create active conversation on mount ───────────────────────────
  // `initialMessageIds` records what was re-seeded from the saved transcript:
  // pending decisions are never persisted (ticket-19), so a prior session's
  // still-pending cards would otherwise read as "unresolved" forever and pin
  // the composer open on every mount. That hold is scoped to proposals that
  // arrive during THIS session.
  const [initialMessageIds, setInitialMessageIds] = useState<ReadonlySet<string>>(new Set())
  // Likewise the page proposals re-seeded from the saved envelope: still in the
  // thread, but only a card opened THIS session pins the composer open.
  const [seededProposalIds, setSeededProposalIds] = useState<ReadonlySet<string>>(new Set())
  /** Which pond's thread was last loaded (#312); `undefined` before the first. */
  const loadedPondRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!pondSettled) return
    // Switched away and back before the other pond's thread landed: this pond's is
    // still on screen, and reloading it would wipe a turn sent meanwhile.
    if (loadedPondRef.current === pondId) return
    // A turn still streaming belongs to the pond it was asked in.
    if (loadedPondRef.current !== undefined) stop()
    // Only the latest pond's load may land: an earlier one resolving after it would
    // put that pond's thread, and its conversation id, under this pond's context.
    let cancelled = false
    // Async IIFE so an envless client construction (#38) rejects into the catch
    // below instead of throwing out of the effect and crashing the mount.
    ;(async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const conversation = await getOrCreateConversation(supabase, user.id, pondId)
      if (cancelled) return
      setConversationId(conversation.id)
      // #312: a thread is per pond, so SWITCHING ponds replaces what is on screen.
      // The palette switches by client-side navigation, where this component does
      // not unmount, so without this the previous pond's conversation stayed
      // visible in the new pond, its context chips pointing at pages that pond
      // cannot see.
      //
      // Guarded on the pond having actually CHANGED, not on every run: `undefined`
      // means "nothing loaded yet", and a first mount with an empty thread must not
      // touch `setMessages`, which is what two 6a tests assert (an error must drop
      // exactly one answer, and asking again must not reset the thread).
      const prev = loadedPondRef.current
      const switched = prev !== undefined && prev !== pondId
      loadedPondRef.current = pondId
      if (switched || conversation.messages.length > 0) {
        // The stashed answer belongs to the thread being replaced.
        pendingRegenerate.current = null
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
      setThreadPondId(pondId)
    })().catch(console.error)
    return () => {
      cancelled = true
    }
    // `pondId` is a real dependency: the thread it loads belongs to that pond.
  }, [setMessages, getSupabase, pondId, pondSettled, stop])

  // ── Save transcript after each completed exchange ─────────────────────────
  // Also fires on each card decision (`resolutions` dep) so Accept/Dismiss
  // persists immediately, not only after the next exchange.
  useEffect(() => {
    if (isReady && status === 'ready' && conversationId && messages.length > 0) {
      saveTranscript(getSupabase(), conversationId, messages, resolutions).catch(console.error)
    }
  }, [isReady, status, conversationId, messages, resolutions, getSupabase])

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

  // ── Open proposals hold the composer open ──────────────────────────────────
  // An unresolved proposal from this session keeps the composer from collapsing;
  // mount-seeded pending cards are excluded (see initialMessageIds).
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
      // prior session is still in the thread, it just doesn't pin the composer open.
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

  // Held open while a proposal needs review. Derived, not an effect: the person's
  // collapse is untouched, so it re-applies once the proposal resolves.
  const effectiveCollapsed = isCollapsed && !hasUnresolvedProposal
  const answerLanded =
    effectiveCollapsed &&
    lastSettledAnswerId !== null &&
    lastSettledAnswerId !== answerSeenAtCollapse

  // ⌘J (ShellCommands owns the key; this is the answer to it): closed → open and
  // into the input; open → closed. While a proposal is open the composer is held
  // open, so the key only returns focus to the input rather than queueing a close
  // that would fire when the card resolves.
  useEffect(() => {
    const handleToggleRequest = () => {
      if (effectiveCollapsed) {
        setIsCollapsed(false)
        focusInputSoon()
        return
      }
      if (hasUnresolvedProposal) {
        focusInputSoon()
        return
      }
      collapseComposer()
    }
    window.addEventListener(TOGGLE_COMPOSER_EVENT, handleToggleRequest)
    return () => window.removeEventListener(TOGGLE_COMPOSER_EVENT, handleToggleRequest)
  }, [effectiveCollapsed, hasUnresolvedProposal, collapseComposer, focusInputSoon])

  // Fulfil a pending ⌘K focus once the input is actually mounted (i.e. the composer
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

  // Fulfil a pending html-import click once the dedicated input is actually
  // mounted (i.e. the composer finished uncollapsing). Same shape as the
  // pending-focus effect above, for the same reason (ticket-24).
  useEffect(() => {
    if (!effectiveCollapsed && pendingHtmlImport.current) {
      htmlImportInputRef.current?.click()
      pendingHtmlImport.current = false
    }
  }, [effectiveCollapsed])

  // ── New thread (the thread head) ──────────────────────────────────────────
  const handleClear = useCallback(async () => {
    if (!conversationId) return
    const supabase = getSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    await dissolveConversation(supabase, conversationId)
    const fresh = await getOrCreateConversation(supabase, user.id, pondId)
    setConversationId(fresh.id)
    pendingRegenerate.current = null
    setMessages([])
    // Stale decisions must not leak into the fresh conversation's transcript.
    resetResolutions()
    // A kept html turn anchors to this conversation's `messages`; a fresh
    // thread has none to anchor against.
    setKeptHtmlTurns([])
  }, [conversationId, setMessages, resetResolutions, getSupabase, pondId])

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
      if (!isReady) return
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
        const ctx = getInlineAttachmentDescriptor(csvAttachment.kind)?.formatContext?.(
          csvAttachment
        )
        finalText = ctx ? `${finalText}\n\n${ctx}` : finalText
        clearCsvAttachment()
      }

      // Send the open node so the server can auto-inject its context (Track C),
      // plus the card resolutions so replay carries the user's decisions (t19)
      // and the route reads this turn's lifecycle phase (t39). Pending file
      // attachments (#61) ride along as FileUIParts — single-turn, cleared on
      // send like the CSV/quote context. An attachment-only send omits `text`
      // entirely so no empty text part reaches the model.
      // `pondId` scopes the change-log record the route writes for any
      // proposal in this turn (#110 criterion 11) — it lives in a client context,
      // so without it every sandbox proposal would be filed into main.
      // #312: `pondId` so the route's context reads only this pond (`s6m5`).
      const body = { nodeId, nodeType, pondId, resolutions: outgoing, research }
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
      setResearch(false)
    },
    [
      isReady,
      nextLifecycle,
      resolutions,
      sendMessage,
      clearError,
      nodeId,
      nodeType,
      pondId,
      quoteCtx,
      csvAttachment,
      clearCsvAttachment,
      fileParts,
      clearAttachments,
      research,
    ]
  )

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = input.trim()
    // An attachment can go out without accompanying text (#61); everything
    // else still requires a message.
    if ((!text && attachments.length === 0) || isStreaming) return
    // KAN-283: nothing leaves the line until the thread on screen is the
    // active pond's — the html read below bypasses `sendText`, so it is
    // gated here as well.
    if (!isReady) return
    // 06.25 frame 6: a reply to an attached html file is a question Pond has
    // to ask, which needs a connection. Offline, it leaves the file attached
    // and sends nothing rather than failing silently — the turn's `q` is
    // still what was asked, since the offline note is a `note` on that
    // same turn, not a bare paragraph outside one.
    if (isHtmlSendBlockedOffline(isHtmlAskPending, navigator.onLine)) {
      markHtmlOffline(text)
      return
    }
    // The offline note left `htmlQuestion` set to that attempt's text so the
    // note could render as a `q` on its own turn; clear it along with the
    // flag so coming back online doesn't leave that turn's live region empty.
    if (htmlOffline) clearHtmlOffline()

    // "typing anything else works too" (06.25): an html attachment with no
    // read yet run (never started, or an earlier attempt only got as far as
    // the offline note) treats any sent text as the question, same as the
    // `make this a page` chip — the read starts, and this text never
    // reaches the model. Gated on `isHtmlAskPending`, not `htmlQuestion` —
    // the offline note also sets `htmlQuestion`, and that must not
    // permanently fall through to a bare `sendText` once back online.
    if (isHtmlAskPending) {
      startHtmlRead(text)
      setInput('')
      return
    }

    sendText(text)
  }, [
    input,
    isStreaming,
    isReady,
    attachments.length,
    sendText,
    isHtmlAskPending,
    htmlOffline,
    startHtmlRead,
    markHtmlOffline,
    clearHtmlOffline,
  ])

  // A follow-up chip / question option click sends its text as the next message
  // (ticket-39). Ignored mid-stream so a click can't interleave a turn.
  const handleChipPick = useCallback(
    (chip: string) => {
      if (isStreaming || !isReady) return
      if (isHtmlSendBlockedOffline(isHtmlAskPending, navigator.onLine)) {
        markHtmlOffline(chip)
        return
      }
      if (htmlOffline) clearHtmlOffline()
      sendText(chip)
    },
    [
      isStreaming,
      isReady,
      sendText,
      isHtmlAskPending,
      htmlOffline,
      markHtmlOffline,
      clearHtmlOffline,
    ]
  )

  // The two offer chips (06.25 frame 1): `make this a page` starts the read
  // locally (no model call — KAN-252/253's asking/proposal aren't built
  // here), so it never joins `handleChipPick`'s send path. `file it as it
  // is` is the ordinary capture path and keeps that path unchanged.
  const handleHtmlOfferPick = useCallback(
    (chip: string) => {
      if (chip !== 'make this a page') {
        handleChipPick(chip)
        return
      }
      if (isStreaming || !isReady) return
      if (isHtmlSendBlockedOffline(isHtmlAskPending, navigator.onLine)) {
        markHtmlOffline(chip)
        return
      }
      if (htmlOffline) clearHtmlOffline()
      startHtmlRead(chip)
    },
    [
      handleChipPick,
      isStreaming,
      isReady,
      isHtmlAskPending,
      htmlOffline,
      startHtmlRead,
      markHtmlOffline,
      clearHtmlOffline,
    ]
  )

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Esc stops a stream and keeps what arrived; else it leaves the field. It never
    // clears what was typed. An in-flight html read takes priority over both: it
    // has made nothing yet, so Esc discards it outright.
    if (e.key === 'Escape') {
      e.preventDefault()
      if (htmlReading) {
        clearHtmlAttachment()
        return
      }
      if (isStreaming) stop()
      else e.currentTarget.blur()
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
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
      if (htmlReading) {
        clearHtmlAttachment()
        return
      }
      if (isStreaming) {
        stop()
        return
      }
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
        e.preventDefault()
        target.blur()
        return
      }
      collapseComposer()
    },
    [isStreaming, stop, collapseComposer, htmlReading, clearHtmlAttachment]
  )

  // Open the thread at a message (#97): a page's made-from chip asks for the
  // moment its prose came from. Uncollapse, then scroll that line into view if
  // the thread still holds it (a cleared thread simply opens).
  useEffect(() => {
    function onOpenThreadMessage(e: Event) {
      const { messageId } = (e as CustomEvent<OpenThreadMessageDetail>).detail ?? {}
      setIsCollapsed(false)
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
      if (indices.length === 0) return null
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
        pondId,
        resolutions,
        toolCallId,
        openNodeId: changePlace[toolCallId] ?? nodeId,
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
      const placeName = changePlace[toolCallId]
        ? allPages.find((p) => p.id === changePlace[toolCallId])?.title
        : undefined
      const targetName = changeTargets[toolCallId]?.nodeName || placeName || contextLabel
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
      return result.recordId
    },
    [
      decideChanges,
      getSupabase,
      queryClient,
      resolutions,
      nodeId,
      changeTargets,
      changePlace,
      contextLabel,
      router,
      allPages,
      pondId,
    ]
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
      if (!isReady) return
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
        pondId,
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
    [isReady, proposals, logDecision, nodeId, nodeType, pondId, sendMessage, clearError]
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
        pondId,
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
  }, [liveDiffCards, changeDecisions, currentPage?.blocks, pondId, getSupabase])

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
          pondId
        )
        // F26: seed the cache with the new row (correct parent_id) before navigating,
        // so the rail nests it immediately; reconcile in the background.
        insertPageOptimistic(
          queryClient,
          {
            id: created.id,
            parentId: parentRef,
            type: part.type,
            title: part.title,
          },
          pondId
        )
        router.push(workspaceHref({ id: created.id, type: part.type, title: part.title }))
        void queryClient.invalidateQueries({ queryKey: pagesKey() })
        // The write landed — only now may the record say so. The log only grows,
        // so an `accepted` stamped before this point could never be taken back.
        logDecision(toolCallId, 'accepted')
      } catch (err) {
        // Surface the failure by reverting the card to pending so the user can retry.
        console.error('create_page failed', err)
        dispatch({ kind: 'revert', type: 'creates', id: toolCallId })
      }
    },
    [getSupabase, queryClient, router, pondId, logDecision]
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
        void queryClient.invalidateQueries({ queryKey: pagesKey() })
        // The write landed — only now may the record say so. The log only grows,
        // so an `accepted` stamped before this point could never be taken back.
        logDecision(toolCallId, 'accepted')
      } catch (err) {
        // Surface the failure by reverting the card to pending so the user can retry.
        console.error('define_schema failed', err)
        dispatch({ kind: 'revert', type: 'schemas', id: toolCallId })
      }
    },
    [getSupabase, queryClient, allPages, logDecision]
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
          pondId
        )
        void queryClient.invalidateQueries({ queryKey: pagesKey() })
        // The write landed — only now may the record say so. The log only grows,
        // so an `accepted` stamped before this point could never be taken back.
        logDecision(toolCallId, 'accepted')
      } catch (err) {
        // Surface the failure by reverting the card to pending so the user can retry.
        console.error('add_row failed', err)
        dispatch({ kind: 'revert', type: 'rows', id: toolCallId })
      }
    },
    [getSupabase, queryClient, pondId, logDecision]
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
          pondId
        )
        void queryClient.invalidateQueries({ queryKey: pagesKey() })
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
    [getSupabase, queryClient, pondId, logDecision]
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
          pondId
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
    [getSupabase, queryClient, pondId, logDecision]
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
        void queryClient.invalidateQueries({ queryKey: pagesKey() })
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
    [getSupabase, queryClient, nodeId, logDecision]
  )

  // ── make this a page ───────────────────────────────────────────────────────
  // An answer never lands on a page by itself. "make this a page" opens a
  // `new page — proposed` card (one per answer — a second press is ignored by
  // the reducer); the proposal is born as a `proposed` change-log record and rides
  // the resolutions envelope with the transcript, so closing Pond leaves it pending.
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
      // The card opens under the answer — bring it into view.
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
      void (async () => {
        const supabase = getSupabase()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        await recordPageProposal(supabase, {
          userId: user.id,
          // #312: otherwise the proposal's change-log record is invisible in every
          // pond's proposed view and change log.
          pondId,
          threadId: conversationId,
          proposal,
        })
      })()
    },
    [nodeId, allPages, pageProposals, getSupabase, pondId, conversationId]
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
          { proposal, threadId: conversationId, pages: allPages, pondId },
          () => crypto.randomUUID()
        )
        dispatch({ kind: 'notePageMade', id, pageId: made.id })
        // Rail entry at once (the correct parent), reconciled in the background.
        insertPageOptimistic(
          queryClient,
          {
            id: made.id,
            parentId: proposal.parentId,
            type: 'page',
            title: made.title,
          },
          pondId
        )
        void queryClient.invalidateQueries({ queryKey: pagesKey() })
        router.push(workspaceHref({ id: made.id, type: 'page', title: made.title }))
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
    [pageProposals, getSupabase, conversationId, allPages, queryClient, router, pondId, logDecision]
  )

  const openMadePage = useCallback(
    (proposal: PageProposal) => {
      if (!proposal.pageId) return
      router.push(workspaceHref({ id: proposal.pageId, type: 'page', title: proposal.name }))
    },
    [router]
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
    const landedAt = new Date().toISOString()
    // The route sends no messageMetadata, so an answer has no `sentAt` of its own:
    // the fold line ('earlier answer · 07:12') and the time beside an answer read
    // it. An answer re-seeded from a saved transcript landed in another session —
    // stamping it now would invent a time — so only a live answer gets one, and
    // never over a `sentAt` it already carries.
    const withLandedAt = (m: (typeof messages)[number]): (typeof messages)[number] => {
      if (initialMessageIds.has(m.id)) return m
      const base = typeof m.metadata === 'object' && m.metadata !== null ? m.metadata : {}
      if (typeof (base as { sentAt?: unknown }).sentAt === 'string') return m
      return { ...m, metadata: { ...base, sentAt: landedAt } }
    }
    setMessages((prev) =>
      prev.map((m) =>
        ids.has(m.id)
          ? withLandedAt(
              withReadStamp(
                m,
                readChips({
                  contextLabel: initialMessageIds.has(m.id) ? '' : contextLabel,
                  parts: m.parts as ReadPartLike[],
                  resolvePageName,
                })
              )
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

  // The thread owns only its scroll: the card grows upward with it, and past the
  // viewport allowance it scrolls. The latest assistant message carries the actions
  // row (make this a page / ask again, or stop while streaming).
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

  // Ask again replaces the answer under the same question instead of opening a new
  // turn. The answer being replaced is held WHOLE: regenerate() drops it from the
  // thread at once, and a failed run must be able to put it back verbatim.
  const handleAskAgain = (messageIndex: number) => {
    // Mid-switch the thread on screen is the previous pond's: regenerating would
    // resend into it with the new pond's context (KAN-283).
    if (!isReady || isStreaming) return
    const message = messages[messageIndex]
    // regenerate() acts on the LAST message, so only an answer that is the last
    // message can be re-asked (a thread ending on a user line would resend that
    // line instead); the error row passes the trailing user line, which
    // regenerate() just resends.
    if (message?.role === 'assistant' && messageIndex !== messages.length - 1) return
    pendingRegenerate.current = message?.role === 'assistant' ? { message, messageIndex } : null
    // The question was sent (and its lifecycle advanced) on the original turn, so
    // the phase rides along as it stands; the body is otherwise sendText's.
    const outgoing: ConversationResolutions = isLifecycleActive(lifecycle)
      ? { ...resolutions, lifecycle }
      : { ...resolutions, lifecycle: undefined }
    clearError?.()
    void regenerate({ body: { nodeId, nodeType, pondId, resolutions: outgoing, research } })
    setResearch(false)
  }

  // The replaced answer folds under its replacement only once the run is over:
  // the SDK rebuilds the streaming message on every chunk, so metadata set
  // mid-stream would be overwritten. The replacement arrives as a fresh message
  // (new id) with no metadata.earlier of its own, so the stash it replaced
  // carries over — a second ask again appends to the first.
  useEffect(() => {
    const pending = pendingRegenerate.current
    if (!pending || isStreaming) return
    const replacement = messages[pending.messageIndex]
    if (replacement?.role !== 'assistant') {
      // Stopped before the first chunk: regenerate() already sliced the answer out
      // and nothing replaced it.
      pendingRegenerate.current = null
      setMessages((prev) => restoreReplacedAnswer(prev, pending))
      return
    }
    if (replacement.id === pending.message.id) return
    pendingRegenerate.current = null
    const replaced = pending.message
    const replacedSentAt = (replaced.metadata as { sentAt?: unknown } | undefined)?.sentAt
    const entries: EarlierAnswer[] = [
      ...earlierAnswers(replaced.metadata),
      {
        parts: replaced.parts,
        sentAt: typeof replacedSentAt === 'string' ? replacedSentAt : null,
        read: readStamp(replaced.metadata) ?? [],
      },
    ]
    setMessages((prev) =>
      prev.map((m) =>
        m.id === replacement.id
          ? entries.reduce((acc, entry) => withEarlierAnswer(acc, entry), m)
          : m
      )
    )
  }, [isStreaming, messages, setMessages])

  const renderMessage = (message: (typeof messages)[number], messageIndex: number) => {
    const text = message.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { type: 'text'; text: string }).text)
      .join('')
    const isLastAssistant = messageIndex === lastAssistantIndex
    const canAskAgain = messageIndex === messages.length - 1
    const answerStreaming = isLastAssistant && isStreaming
    const sentAt = (message.metadata as { sentAt?: unknown } | undefined)?.sentAt
    const sentLabel = formatThreadTime(typeof sentAt === 'string' ? sentAt : null)
    // What Pond read comes from the stamp written when the answer landed, never
    // recomputed from live navigation. Only an answer still arriving has no stamp.
    const read =
      message.role === 'assistant'
        ? (readStamp(message.metadata) ??
          readChips({
            contextLabel,
            parts: message.parts as ReadPartLike[],
            resolvePageName,
          }))
        : []
    const earlierFolds = [...earlierAnswers(message.metadata)].reverse().map((entry) => ({
      sentAt: entry.sentAt,
      read: entry.read,
      text: entry.parts
        .filter((p) => p.type === 'text')
        .map((p) => (p as { type: 'text'; text: string }).text)
        .join(''),
    }))
    const cardsForMessage = Object.values(pageProposals).filter((p) => p.messageId === message.id)
    const hasOpenCard = cardsForMessage.some((p) => p.status === 'proposed')
    // A sent message's file parts render as inert chips: the message is already out.
    const attachmentParts = (
      message.parts as Array<{
        type: string
        url?: string
        mediaType?: string
        filename?: string
      }>
    ).filter((p) => p.type === 'file' && typeof p.url === 'string')
    const changeBatches = (message.parts as Array<{ type: string }>).filter(isProposeChangesPart)
    const createPageParts = (message.parts as Array<{ type: string }>).filter(isCreatePagePart)
    const defineSchemaParts = (message.parts as Array<{ type: string }>).filter(isDefineSchemaPart)
    const addRowParts = (message.parts as Array<{ type: string }>).filter(isAddRowPart)
    const promoteTableParts = (message.parts as Array<{ type: string }>).filter(isPromoteTablePart)
    const configureViewParts = (message.parts as Array<{ type: string }>).filter(
      isConfigureViewPart
    )
    const linkRecordsParts = (message.parts as Array<{ type: string }>).filter(isLinkRecordsPart)
    const questionParts = (message.parts as Array<{ type: string }>).filter(isAskQuestionPart)
    const followupParts = (message.parts as Array<{ type: string }>).filter(isSuggestFollowupsPart)
    // The route streams a `source-url` part per cited result.
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
    // One diff card per propose_changes batch, decided as a whole. A streaming
    // batch waits for its complete input: partially parsed block payloads can miss
    // required fields, and the module views render them unvalidated.
    const batchById = new Map<string, ModuleChange[]>()
    const diffCards: ProposalGroupCard[] = []
    for (const part of changeBatches) {
      if (part.state === 'input-streaming') continue
      const rawChanges = part.input?.changes ?? []
      batchById.set(part.toolCallId, rawChanges)
      // A batch aimed at another page is diffed against THAT page's blocks.
      const target = changeTargets[part.toolCallId]
      const targetMissing = target?.missing === true
      const crossPage = target && !targetMissing && target.nodeId !== nodeId ? target : null
      const targetBlocks = crossPage
        ? (blocksForTarget.get(crossPage.nodeId) ?? [])
        : (currentPage?.blocks ?? [])
      const effectiveOpenNodeId = changePlace[part.toolCallId] ?? nodeId
      const needsPlace =
        !targetMissing &&
        resolveAcceptTarget(resolutions, part.toolCallId, effectiveOpenNodeId) === null
      // KAN-267: a picked place names no stamp, so without this the header (and
      // the accept receipt below) would keep reading the pond's own name even
      // after the person chose a real page to write to.
      const placeName = changePlace[part.toolCallId]
        ? allPages.find((p) => p.id === changePlace[part.toolCallId])?.title
        : undefined
      diffCards.push({
        id: part.toolCallId,
        changes: rawChanges.map((c) => previewForChange(c, targetBlocks)),
        status: batchStatus(changeDecisions, part.toolCallId, rawChanges.length),
        // KAN-267: needsPlace with nothing picked yet means there IS no target —
        // falling to contextLabel here would claim the pond itself as the
        // target while the card, in the same breath, says it needs a place.
        targetName:
          needsPlace && !placeName ? undefined : target?.nodeName || placeName || contextLabel,
        targetMissing,
        needsPlace,
        parentOptions,
        pondName,
        note: changeNotes[part.toolCallId],
        revised: !!revisions[part.toolCallId],
        skippedCount: changeSkipped[part.toolCallId] ?? 0,
        skippedReasons: changeSkipReasons[part.toolCallId] ?? [],
      })
    }
    const allIndices = (id: string) => (batchById.get(id) ?? []).map((_, i) => i)
    const pendingDiffIds = diffCards.filter((c) => c.status === 'pending').map((c) => c.id)
    // KAN-267: accept-all must skip exactly what a single card's own accept
    // button would refuse (targetMissing || needsPlace) — reject all stays over
    // EVERY pending id, since reject always lands regardless of a target.
    const acceptablePendingDiffIds = diffCards
      .filter((c) => c.status === 'pending' && !c.targetMissing && !c.needsPlace)
      .map((c) => c.id)
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
            <YouRow text={text} time={sentLabel} />
          ) : (
            // The answer is the sans at reading scale, never the serif (that is for
            // the page). `text` grows token by token and is re-parsed each time.
            <div data-part="answer" className="mn-arrive flex flex-col gap-[7px]">
              <span className={pageEyebrowClass}>pond</span>
              <div className="relative">
                <Markdown>{text}</Markdown>
                {answerStreaming && (
                  <span
                    aria-hidden
                    data-part="stream-caret"
                    className="ml-[3px] inline-block h-[17px] w-[9px] translate-y-[3px] bg-mn-text/[0.22] align-baseline"
                  />
                )}
              </div>
              {sources.length > 0 && <SourceList sources={sources} />}
              <ReadChips read={read} />
            </div>
          ))}
        {/* Sources can arrive on a message with no text; the citation still shows. */}
        {message.role !== 'user' && !text && sources.length > 0 && (
          <div data-part="answer" className="mn-arrive flex flex-col gap-[7px]">
            <span className={pageEyebrowClass}>pond</span>
            <SourceList sources={sources} />
            <ReadChips read={read} />
          </div>
        )}
        {/* Stashed oldest first; the most recently replaced answer sits nearest the current one. */}
        {message.role === 'assistant' &&
          earlierFolds.map((earlier, i) => (
            <EarlierAnswerFold
              key={`${message.id}-earlier-${earlierFolds.length - 1 - i}`}
              time={formatThreadTime(earlier.sentAt)}
            >
              <Markdown>{earlier.text}</Markdown>
              <ReadChips read={earlier.read} />
            </EarlierAnswerFold>
          ))}
        {/* Make-this-a-page cards: editable while pending; make page is the only write. */}
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
            onAskAgain={canAskAgain ? () => handleAskAgain(messageIndex) : undefined}
            onStop={stop}
          />
        )}
        {diffCards.length > 0 && (
          <div className="mn-arrive">
            <ProposalGroup
              cards={diffCards}
              onAccept={(id) => {
                void (async () => {
                  const recordId = await acceptChanges(id, batchById.get(id) ?? [], allIndices(id))
                  if (pondId && recordId) sessionUndo.remember({ pondId, recordIds: [recordId] })
                })()
              }}
              onReject={(id) => decideChanges(id, allIndices(id), 'rejected')}
              onPickPlace={(id, destinationId) => {
                dispatch({ kind: 'pickDestination', type: 'changes', id, destinationId })
              }}
              onRequestChanges={(id, note) =>
                sendRequestChanges(id, allIndices(id).length, note, 'note')
              }
              onRevise={(id) =>
                sendRequestChanges(id, allIndices(id).length, REVISE_NOTE, 'outdated')
              }
              onAskAgain={canAskAgain ? () => handleAskAgain(messageIndex) : undefined}
              onAcceptAll={() => {
                // Sequential: each accept rewrites its target page's whole block array,
                // and two cards can name the same page, so parallel accepts would drop
                // the first batch. Also keeps the toast receipts in card order. One
                // accept-all click is one undo step, so every card's record id is
                // collected and remembered together after the loop, not per card.
                void (async () => {
                  const recordIds: string[] = []
                  try {
                    for (const id of acceptablePendingDiffIds) {
                      const recordId = await acceptChanges(id, batchById.get(id) ?? [], allIndices(id))
                      if (recordId) recordIds.push(recordId)
                    }
                  } catch (err) {
                    // Fire-and-forget (see the pageProposals IIFE above): a card's
                    // accept throwing partway must not leak an unhandled rejection —
                    // the cards that already landed are still remembered below.
                    console.error('[accept-all] a card’s accept failed partway', err)
                  } finally {
                    if (pondId && recordIds.length > 0) sessionUndo.remember({ pondId, recordIds })
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
        {/* define_schema: Accept writes the schema; the decision rides the resolutions
            envelope so the card goes inert and the model stops re-proposing. */}
        {defineSchemaParts.map((part) => {
          // A partially parsed `properties` array would preview incompletely.
          if (part.state === 'input-streaming') return null
          const input = part.input
          const properties = input?.properties ?? []
          if (!input?.pageId || properties.length === 0) return null
          const status = schemaDecisions[part.toolCallId] ?? 'pending'
          const selectedTargetId = schemaTarget[part.toolCallId] ?? input.pageId
          // Flags rollups whose relation won't resolve on the resulting collection;
          // the same test the accept path applies, so preview and receipt agree.
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
        {/* add_row: Accept creates the row; the decision rides the resolutions envelope. */}
        {addRowParts.map((part) => {
          // A partially parsed `props` map would preview incompletely.
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
        {/* promote_table: the preview columns are inferred from the host page's table,
            mirroring the accept path. */}
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
              { columns: PromotedColumn[]; rowCount: number; tableTitle?: string } | undefined)
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
              onAccept={() => acceptPromoteTable(part.toolCallId, input, selectedTargetId, preview)}
              onReject={() => rejectCard('promotions', part.toolCallId)}
            />
          )
        })}
        {/* configure_view: Accept upserts the view block; the decision rides the
            resolutions envelope. */}
        {configureViewParts.map((part) => {
          // A partially parsed input would preview incompletely.
          if (part.state === 'input-streaming') return null
          const input = part.input
          if (!input?.pageId || !input?.mode) return null
          const status = viewDecisions[part.toolCallId] ?? 'pending'
          // A linked view names ANOTHER collection to draw: resolve it to an id so the
          // picker lands on it. An inline view falls back to the proposed pageId.
          const preResolvedTarget = input.targetCollection
            ? resolveCollectionByName(allPages, input.targetCollection)
            : null
          const selectedTargetId = viewTarget[part.toolCallId] ?? preResolvedTarget ?? input.pageId
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
        {/* link_records: everything is named by title; Accept resolves titles to ids
            strictly and appends the links. */}
        {linkRecordsParts.map((part) => {
          // A partially parsed `toRows` array would preview incompletely.
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
        {/* Answering rides the resolutions envelope; an answered card renders inert. */}
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
        {/* Clicking a chip sends its text; disabled mid-stream. */}
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
  }

  const turns = groupTurns(messages)
  const earlierOpen = earlierOpenFrom !== null && earlierOpenFrom === messages[0]?.id
  const foldedCount = earlierOpen ? 0 : foldedTurnCount(turns.length)
  const shownTurns = turns.slice(foldedCount)
  const threadArea = (nodeId ? areaOf(allPages, nodeId) : null) ?? contextLabel

  // Kept html turns anchor to the chat message count at the moment they were
  // read (`afterMessages`) — grouped by the shown turn whose last message
  // index is `afterMessages - 1`, so each renders right after the turn it
  // followed live. `afterMessages === 0` (nothing had been sent yet) has no
  // such turn, so it's keyed `-1` and rendered before the first one.
  const keptHtmlTurnsByAnchor = new Map<number, HtmlTurnSnapshot[]>()
  for (const kept of keptHtmlTurns) {
    const anchor = kept.afterMessages - 1
    const forAnchor = keptHtmlTurnsByAnchor.get(anchor) ?? []
    forAnchor.push(kept)
    keptHtmlTurnsByAnchor.set(anchor, forAnchor)
  }
  const renderKeptHtmlTurns = (anchor: number) =>
    (keptHtmlTurnsByAnchor.get(anchor) ?? []).map((kept) => (
      <HtmlReadTurn
        key={kept.id}
        question={kept.question}
        at={kept.at}
        filename={kept.filename}
        size={kept.size}
        reading={false}
        result={kept.result}
      />
    ))

  const messagesBody = (messages.length > 0 || keptHtmlTurns.length > 0) && (
    <>
      {turns.length > 1 && (
        <ThreadHead
          area={threadArea}
          turns={turns.length}
          onNewThread={() => void handleClear()}
          onClose={collapseComposer}
        />
      )}
      <div
        className="max-h-[calc(100dvh-14rem)] min-h-0 flex-1 overflow-y-auto group-data-[sized]/composer:max-h-none"
        onKeyDown={handleBodyKeyDown}
      >
        <div className="flex w-full flex-col gap-[14px]">
          {foldedCount > 0 && (
            <EarlierTurns
              count={foldedCount}
              onExpand={() => setEarlierOpenFrom(messages[0]?.id ?? null)}
            />
          )}
          {renderKeptHtmlTurns(-1)}
          {shownTurns.map((indices, shownIndex) => (
            <Fragment key={messages[indices[0]].id}>
              <Turn>
                {indices.map((index) => renderMessage(messages[index], index))}
                {shownIndex === shownTurns.length - 1 && (
                  <>
                    {/* Stays until the tool part settles, even once reply text is arriving: a
                        long tool call beside growing text would otherwise look stalled. */}
                    {isStreaming && lastAssistantHasActiveTool && (
                      <StageText label={stageLine ?? THINKING_STAGE_TEXT} />
                    )}
                    {/* An error keeps nothing: the partial answer was dropped above. */}
                    {error && !isStreaming && (
                      <AnswerError
                        onAskAgain={
                          lastQuestion.text ? () => handleAskAgain(messages.length - 1) : undefined
                        }
                      />
                    )}
                  </>
                )}
              </Turn>
              {renderKeptHtmlTurns(indices[indices.length - 1])}
            </Fragment>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </>
  )

  // Send is off with nothing to send; mid-stream it is the stop square.
  const canSend = isReady && !isUploading && (input.trim().length > 0 || attachments.length > 0)

  const csvAttachmentDescriptor = csvAttachment
    ? getInlineAttachmentDescriptor(csvAttachment.kind)
    : undefined

  const htmlAttachmentDescriptor = htmlAttachment
    ? getInlineAttachmentDescriptor(htmlAttachment.kind)
    : undefined

  // 06.25's own composer line per html state: frame 1 (attached, not yet
  // asked), frame 2 (reading), frame 6 (any of the three failures). A
  // settled success leaves this unset — not a state the board gives a line
  // for — and the default placeholder below takes over.
  const htmlPlaceholder = htmlAttachment
    ? htmlOffline || (htmlResult && !htmlResult.ok)
      ? 'reply, or ask something else'
      : htmlReading
        ? 'esc to stop'
        : !htmlResult
          ? `ask about ${htmlAttachment.filename}`
          : null
    : null

  const inputFooter = (
    <div
      className="flex flex-col gap-[14px]"
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={handleDrop}
    >
      {quoteCtx && <QuoteChip text={quoteCtx.text} onRemove={() => setQuoteCtx(null)} />}
      {csvAttachment && csvAttachmentDescriptor && (
        <csvAttachmentDescriptor.Pill attachment={csvAttachment} onRemove={clearCsvAttachment} />
      )}
      {/* KAN-251: the pill and the two offer chips come up together at attach
          (06.25 frame 1) — no read, no turn yet. Picking `make this a page`
          (or typing anything else and sending) is the ask that starts the
          read; its answer renders as a turn (frame 2) in the sans answer
          register, sentence case — board `sAnswer`, not the mono machine
          surface. */}
      {htmlAttachment && htmlAttachmentDescriptor && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-[7px]">
            <htmlAttachmentDescriptor.Pill
              attachment={htmlAttachment}
              onRemove={removeHtmlAttachment}
            />
          </div>
          {/* Gated on whether a read has actually run, not on `htmlQuestion`
              — an offline attempt sets `htmlQuestion` for the note's `q`
              but never starts a read, so these chips re-show once back
              online instead of staying hidden for the rest of this
              attachment's life.

              Decided by the user, 11 Oct 2026: the offer stays alive across
              a reconnect. Frame 6 offline draws no `chips` section, but that
              frame draws a moment and is silent on what happens once the
              connection returns — losing the offer on a blip would make the
              person re-attach the file for nothing. This is a reading of a
              silent board, not a deviation from a drawn one, and it is NOT
              the row-delete `×` precedent: that was an affordance no board
              describes at all; here the board simply declines to say. Do
              not revert this gate back to hiding the chips on `htmlOffline`. */}
          {isHtmlAskPending && (
            <HtmlChipRow
              label="Offer"
              chips={HTML_IMPORT_CHIPS}
              disabled={isStreaming}
              onPick={handleHtmlOfferPick}
            />
          )}
          {htmlQuestion && (
            <HtmlReadTurn
              question={htmlQuestion}
              at={htmlQuestionAt}
              filename={htmlAttachment.filename}
              size={htmlAttachment.size}
              reading={htmlReading}
              result={htmlResult}
              offlineNote={
                htmlOffline ? describeHtmlOfflineNote(htmlAttachment.filename) : undefined
              }
              failureChips={
                htmlResult && !htmlResult.ok
                  ? {
                      chips:
                        htmlResult.error.kind === 'unreadable'
                          ? HTML_UNREADABLE_CHIPS
                          : HTML_TOO_LARGE_CHIPS,
                      disabled: isStreaming,
                      onPick: (chip) => {
                        if (chip === 'try another file') {
                          clearHtmlAttachment()
                          requestHtmlImportPicker()
                          return
                        }
                        handleChipPick(chip)
                      },
                    }
                  : undefined
              }
            />
          )}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
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
      {composerNotice && (
        <p className="font-mono text-[11px] lowercase text-mn-text-secondary" role="status">
          {composerNotice}
        </p>
      )}
      <ComposerLine
        value={input}
        placeholder={
          htmlPlaceholder ??
          (messages.length > 0 ? 'reply, or ask something else' : 'ask pond, or / for blocks')
        }
        disabled={!isReady}
        streaming={isStreaming}
        canSend={canSend}
        attachDisabled={isStreaming || !isReady}
        textareaRef={inputRef}
        anchorRef={composerRef}
        research={research}
        onToggleResearch={() => setResearch((on) => !on)}
        onChange={setInput}
        onKeyDown={handleKeyDown}
        onAttach={handleAttachClick}
        onSend={handleSend}
        onStop={stop}
        // Images/pdf/txt/md upload to storage and ride the message; .csv keeps its
        // inline-context path. The input is persistent so re-picking the same file
        // re-fires.
        attachInput={
          <input
            ref={attachInputRef}
            type="file"
            multiple
            accept={`.html,.htm,text/html,.csv,text/csv,${ATTACHMENT_ACCEPT}`}
            className="hidden"
            onChange={(e) => {
              handlePickedFiles(e.target.files)
              e.target.value = ''
            }}
          />
        }
      />
      {/* ⌘K's `import a page` (KAN-251) — a dedicated, html-only picker so
          that door never touches the general attach input above. */}
      <input
        ref={htmlImportInputRef}
        type="file"
        accept=".html,.htm,text/html"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            handleHtmlFile(file)
            // The native chooser leaves focus on BODY once it closes (the
            // input it opened from is `hidden`, so it isn't a focus target
            // to return to) — reuse `focusInputSoon` so the offer the pill
            // just rendered is reachable by keyboard without tabbing in from
            // the top of the document.
            focusInputSoon()
          }
          e.target.value = ''
        }}
      />
    </div>
  )

  return (
    <>
      {/* Highlight-to-ask popover (ticket-40 F20) — global selection listener */}
      <SelectionBar onAsk={handleAskFromSelection} disabled={isStreaming} />
      <TerminalDrawer
        collapsed={effectiveCollapsed}
        landed={answerLanded}
        onExpand={handleExpand}
        footer={inputFooter}
        height={composerHeight.height}
        onHeightChange={composerHeight.setHeight}
        onHeightCommit={composerHeight.commitHeight}
      >
        {messagesBody}
      </TerminalDrawer>
    </>
  )
}
