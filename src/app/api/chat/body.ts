/** The chat request body, parsed. */
import type { UIMessage } from 'ai'
import type { NodeType } from '@/lib/supabase/types'
import type { PageReference } from '@/lib/references/reference'
import { parseResolutions, type ConversationResolutions } from '@/lib/conversation/resolutions'
import { parseRequestChanges, type RequestChangesBody } from './request-changes'
import { parseReferences } from './references'

const NODE_TYPES: readonly NodeType[] = ['routine', 'project', 'action', 'page']

interface ChatBody {
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
  /** KAN-98 — page-plus-range references the user highlighted and asked about this turn. */
  references: PageReference[]
  /** KAN-99 — false once the person has dismissed the open page's whole-page
   *  chip for this visit; withholds that page's content, default true. */
  openPageContext: boolean
}

/** Minimal body-shape guard: null unless `body` is an object carrying a
 *  `messages` array. Unknown or mistyped optional fields are dropped. */
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
    references: parseReferences(b.references),
    openPageContext: b.openPageContext !== false,
    ...(requestChanges ? { requestChanges } : {}),
  }
}
