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

/** A propose_changes tool part — the generalized composition batch (t16 Phase 5).
 *  `targetPageId` (ticket-30) names a page OTHER than the open one to edit. */
export interface ProposeChangesPart {
  type: 'tool-propose_changes'
  toolCallId: string
  state: string
  input?: { targetPageId?: string; changes?: ModuleChange[] }
}

export function isProposeChangesPart(part: { type: string }): part is ProposeChangesPart {
  return part.type === 'tool-propose_changes'
}

/** A create_page tool part — a proposed brand-new page + scaffold (M1). Client-
 *  resolved (no execute); the card below drives accept/reject + placement. */
export interface CreatePagePart {
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

export function isCreatePagePart(part: { type: string }): part is CreatePagePart {
  return part.type === 'tool-create_page'
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
