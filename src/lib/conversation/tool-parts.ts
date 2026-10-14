import type { ModuleChange, ModuleData } from '@/lib/modules/ai-composition'
import type { NodeType } from '@/lib/supabase/types'
import {
  DEFINE_SCHEMA_TYPE,
  ADD_ROW_TYPE,
  CONFIGURE_VIEW_TYPE,
  LINK_RECORDS_TYPE,
  PROMOTE_TABLE_TYPE,
} from '@/lib/conversation/proposals'
import { ASK_QUESTION_TYPE, SUGGEST_FOLLOWUPS_TYPE } from '@/lib/conversation/parts'
import type { AiPropertyDef } from '@/lib/properties/schema'
import type {
  ViewMode,
  FilterOp,
  ViewChartKind,
  ViewAggValue,
  ViewFigureFormat,
} from '@/lib/modules/view/schema'
// Type-only: erased at compile time, so importing it never pulls the `ai`
// runtime (eventsource-parser et al, which jsdom can't load) into this module.
import type { UIMessage } from 'ai'

export const PROPOSE_CHANGES_TYPE = 'tool-propose_changes'

/** A propose_changes tool part — the generalized composition batch (t16 Phase 5).
 *  `targetPageId` (ticket-30) names a page OTHER than the open one to edit. */
export interface ProposeChangesPart {
  type: typeof PROPOSE_CHANGES_TYPE
  toolCallId: string
  state: string
  input?: { targetPageId?: string; changes?: ModuleChange[] }
}

export function isProposeChangesPart(part: { type: string }): part is ProposeChangesPart {
  return part.type === PROPOSE_CHANGES_TYPE
}

export const CREATE_PAGE_TYPE = 'tool-create_page'

/** A create_page tool part — a proposed brand-new page + scaffold (M1). Client-
 *  resolved (no execute); the card below drives accept/reject + placement. */
export interface CreatePagePart {
  type: typeof CREATE_PAGE_TYPE
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

export function isCreatePagePart(part: { type: string }): part is CreatePagePart {
  return part.type === CREATE_PAGE_TYPE
}

/** The same guard `CreatePageProposalCard`'s render branch applies before
 *  showing the card — shared so the two can never drift apart. */
export function createPageInputIsVisible(
  input: CreatePagePart['input']
): input is NonNullable<CreatePagePart['input']> & { title: string; type: NodeType } {
  return !!input?.title && !!input?.type
}

/** A define_schema tool part — a proposed property schema for an EXISTING page
 *  (#17 slice 5). Client-resolved (no execute); the card below drives
 *  accept/reject + which page it applies to. */
export interface DefineSchemaPart {
  type: typeof DEFINE_SCHEMA_TYPE
  toolCallId: string
  state: string
  input?: {
    pageId?: string
    properties?: AiPropertyDef[]
    reason?: string
  }
}

export function isDefineSchemaPart(part: { type: string }): part is DefineSchemaPart {
  return part.type === DEFINE_SCHEMA_TYPE
}

/** The same guard `DefineSchemaProposalCard`'s render branch applies. */
export function defineSchemaInputIsVisible(
  input: DefineSchemaPart['input']
): input is NonNullable<DefineSchemaPart['input']> & { pageId: string; properties: AiPropertyDef[] } {
  return !!input?.pageId && (input?.properties?.length ?? 0) > 0
}

/** An add_row tool part — a proposed row (a schema-bound child page) for an
 *  EXISTING collection (#18). Client-resolved (no execute); the card below drives
 *  accept/reject + which collection it joins. */
export interface AddRowPart {
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

export function isAddRowPart(part: { type: string }): part is AddRowPart {
  return part.type === ADD_ROW_TYPE
}

/** The same guard `AddRowProposalCard`'s render branch applies. */
export function addRowInputIsVisible(
  input: AddRowPart['input']
): input is NonNullable<AddRowPart['input']> & { collectionId: string } {
  return !!input?.collectionId
}

/** A configure_view tool part — a proposed view config (mode + optional group-by /
 *  sort / filter, keyed by property NAME) for an EXISTING collection (#19 slice 5).
 *  Client-resolved (no execute); the card below drives accept/reject + which
 *  collection it applies to. */
export interface ConfigureViewPart {
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

export function isConfigureViewPart(part: { type: string }): part is ConfigureViewPart {
  return part.type === CONFIGURE_VIEW_TYPE
}

/** The same guard `ConfigureViewProposalCard`'s render branch applies. */
export function configureViewInputIsVisible(
  input: ConfigureViewPart['input']
): input is NonNullable<ConfigureViewPart['input']> & { pageId: string; mode: ViewMode } {
  return !!input?.pageId && !!input?.mode
}

/** A link_records tool part — a proposal to link EXISTING rows through an
 *  existing relation property (#40). Everything is named by TITLE (the model
 *  never sees row ids); the accept path resolves titles→ids strictly on accept.
 *  Client-resolved (no execute); the card below drives accept/reject + which
 *  collection the source row is in. */
export interface LinkRecordsPart {
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

export function isLinkRecordsPart(part: { type: string }): part is LinkRecordsPart {
  return part.type === LINK_RECORDS_TYPE
}

/** The same guard `LinkRecordsProposalCard`'s render branch applies. */
export function linkRecordsInputIsVisible(
  input: LinkRecordsPart['input']
): input is NonNullable<LinkRecordsPart['input']> & {
  fromRow: string
  relation: string
  toRows: string[]
} {
  return !!input?.fromRow && !!input?.relation && (input?.toRows?.length ?? 0) > 0
}

/** A promote_table tool part — a proposal to convert an EXISTING freeform `table`
 *  block on a page into a schema-bound collection (#29). Client-resolved (no
 *  execute); the card below drives accept/reject + which page it applies to. The
 *  model names only the page + block by id — the terminal reads that table to
 *  preview the inferred columns. */
export interface PromoteTablePart {
  type: typeof PROMOTE_TABLE_TYPE
  toolCallId: string
  state: string
  input?: {
    pageId?: string
    blockId?: string
    reason?: string
  }
}

export function isPromoteTablePart(part: { type: string }): part is PromoteTablePart {
  return part.type === PROMOTE_TABLE_TYPE
}

/** The first half of the guard `PromoteTableProposalCard`'s render branch
 *  applies — the rest (`!preview`) resolves the live or frozen table preview,
 *  state this module has no access to, so a promote_table part with a pageId
 *  still counts as visible even on the rare turn whose preview comes back
 *  null. */
export function promoteTableInputIsVisible(
  input: PromoteTablePart['input']
): input is NonNullable<PromoteTablePart['input']> & { pageId: string } {
  return !!input?.pageId
}

/** An ask_question tool part — a branch-pause question card (ticket-39). Client-
 *  resolved (no execute); the QuestionCard below drives the answer, which rides
 *  the resolutions envelope. */
export interface AskQuestionPart {
  type: typeof ASK_QUESTION_TYPE
  toolCallId: string
  state: string
  input?: { question?: string; options?: string[]; branch?: string }
}

export function isAskQuestionPart(part: { type: string }): part is AskQuestionPart {
  return part.type === ASK_QUESTION_TYPE
}

/** The same guard `QuestionCard`'s render branch applies. */
export function askQuestionInputIsVisible(
  input: AskQuestionPart['input']
): input is NonNullable<AskQuestionPart['input']> & { question: string; options: string[] } {
  return !!input?.question && Array.isArray(input?.options) && input.options.length > 0
}

/** A suggest_followups tool part — quiet follow-up chips (ticket-39). Client-
 *  resolved (no execute); clicking a chip sends its text. */
export interface SuggestFollowupsPart {
  type: typeof SUGGEST_FOLLOWUPS_TYPE
  toolCallId: string
  state: string
  input?: { suggestions?: string[] }
}

export function isSuggestFollowupsPart(part: { type: string }): part is SuggestFollowupsPart {
  return part.type === SUGGEST_FOLLOWUPS_TYPE
}

/** The same guard the follow-up chips' render branch applies: a call that
 *  landed with no suggestions renders nothing. */
export function suggestFollowupsInputIsVisible(
  input: SuggestFollowupsPart['input']
): input is NonNullable<SuggestFollowupsPart['input']> & { suggestions: string[] } {
  return (input?.suggestions?.length ?? 0) > 0
}

/** The open_change_log tool's own part type (KAN-94) — not a proposal (it lives
 *  outside proposals.ts's TYPE list), so it never counts toward the unresolved-
 *  proposal derivations those types drive. */
export const OPEN_CHANGE_LOG_TYPE = 'tool-open_change_log'

/** An open_change_log tool part — carries no decision, just a navigation
 *  gesture. Client-resolved (no execute); AITerminal pushes the change log's
 *  workspace URL the moment the call streams in. */
export interface OpenChangeLogPart {
  type: typeof OPEN_CHANGE_LOG_TYPE
  toolCallId: string
  state: string
  input?: Record<string, never>
}

export function isOpenChangeLogPart(part: { type: string }): part is OpenChangeLogPart {
  return part.type === OPEN_CHANGE_LOG_TYPE
}

type AssistantPart = UIMessage['parts'][number]

/**
 * True when an assistant message's parts have anything `AITerminal`'s
 * `renderMessage` actually draws: non-whitespace text, a `source-url`
 * citation, or a proposal/follow-up part whose own input clears the same
 * guard its card's render branch applies (the `*InputIsVisible` helpers
 * above — one guard, shared, not a second notion of "empty"). A part still
 * `input-streaming`; a `read_page`, `fetch_context`, or `open_change_log`
 * call (none of these ever render on their own — read chips only ever show
 * nested inside a text or sources block); `reasoning`, `file`, `data-*`, and
 * any tool type this module doesn't know how to draw all count as nothing to
 * show.
 */
export function hasVisibleAssistantContent(parts: AssistantPart[]): boolean {
  return parts.some(isVisiblePart)
}

function isVisiblePart(part: AssistantPart): boolean {
  if (part.type === 'text') return part.text.trim().length > 0
  if (part.type === 'source-url') return true
  const typed = part as { type: string; state?: string; input?: unknown }
  if (typed.state === 'input-streaming') return false
  switch (typed.type) {
    case CREATE_PAGE_TYPE:
      return createPageInputIsVisible(typed.input as CreatePagePart['input'])
    case DEFINE_SCHEMA_TYPE:
      return defineSchemaInputIsVisible(typed.input as DefineSchemaPart['input'])
    case ADD_ROW_TYPE:
      return addRowInputIsVisible(typed.input as AddRowPart['input'])
    case CONFIGURE_VIEW_TYPE:
      return configureViewInputIsVisible(typed.input as ConfigureViewPart['input'])
    case LINK_RECORDS_TYPE:
      return linkRecordsInputIsVisible(typed.input as LinkRecordsPart['input'])
    case PROMOTE_TABLE_TYPE:
      return promoteTableInputIsVisible(typed.input as PromoteTablePart['input'])
    case ASK_QUESTION_TYPE:
      return askQuestionInputIsVisible(typed.input as AskQuestionPart['input'])
    case SUGGEST_FOLLOWUPS_TYPE:
      return suggestFollowupsInputIsVisible(typed.input as SuggestFollowupsPart['input'])
    case PROPOSE_CHANGES_TYPE:
      // diffCards pushes one card per non-streaming propose_changes part
      // regardless of how many changes it carries (AITerminal.tsx ~3224).
      return true
    default:
      return false
  }
}
