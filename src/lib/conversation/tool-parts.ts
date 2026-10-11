import type { ModuleChange, ModuleData } from '@/lib/modules/ai-composition'
import type { NodeType } from '@/lib/supabase/types'
import {
  DEFINE_SCHEMA_TYPE,
  ADD_ROW_TYPE,
  CONFIGURE_VIEW_TYPE,
  LINK_RECORDS_TYPE,
} from '@/lib/conversation/proposals'
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
