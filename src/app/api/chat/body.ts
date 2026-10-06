/**
 * The chat request body, parsed. Lives beside the route because a route file
 * may export only HTTP handlers and route config — `next build` rejects any
 * other export from `route.ts`.
 */
import type { UIMessage } from 'ai'
import type { NodeType } from '@/lib/supabase/types'
import { parseResolutions, type ConversationResolutions } from '@/lib/conversation/resolutions'
import { parseRequestChanges, type RequestChangesBody } from './request-changes'

const NODE_TYPES: readonly NodeType[] = ['routine', 'project', 'action', 'page']

export interface ChatBody {
  messages: UIMessage[]
  nodeId?: string
  pondId?: string
  nodeType?: NodeType
  resolutions: ConversationResolutions
  /** Deep research is on for this question — the only turn that may read the web. */
  research: boolean
  /** #98 — this turn is a request-changes note (or an outdated revise) on a
   *  propose_changes card; the reply must be a revised diff. */
  requestChanges?: RequestChangesBody
}

/** Minimal body-shape guard: the chat route requires a `messages` array. A
 *  malformed body (bad JSON, missing/non-array `messages`) returns 400 instead of
 *  letting `streamText` throw a 500 deeper in the request. */
export function parseChatBody(body: unknown): ChatBody | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  if (!Array.isArray(b.messages)) return null
  const nodeType =
    typeof b.nodeType === 'string' && (NODE_TYPES as string[]).includes(b.nodeType)
      ? (b.nodeType as NodeType)
      : undefined
  const requestChanges = parseRequestChanges(b.requestChanges)
  return {
    messages: b.messages as UIMessage[],
    nodeId: typeof b.nodeId === 'string' ? b.nodeId : undefined,
    pondId: typeof b.pondId === 'string' ? b.pondId : undefined,
    nodeType,
    resolutions: parseResolutions(b.resolutions),
    research: b.research === true,
    ...(requestChanges ? { requestChanges } : {}),
  }
}
