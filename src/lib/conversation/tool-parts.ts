import type { ModuleChange, ModuleData } from '@/lib/modules/ai-composition'
import type { NodeType } from '@/lib/supabase/types'
import { DEFINE_SCHEMA_TYPE } from '@/lib/conversation/proposals'
import type { AiPropertyDef } from '@/lib/properties/schema'

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
