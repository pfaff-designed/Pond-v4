import { anthropic } from '@ai-sdk/anthropic'
import { streamText, tool, stepCountIs } from 'ai'
import type { UIMessage } from 'ai'
import { AI_MODELS } from '@/lib/ai/models'
import { createClient } from '@/lib/supabase/server'
import { toModelMessages } from '@/lib/conversation/transcript'
import {
  applyResolutions,
  parseResolutions,
  type ConversationResolutions,
} from '@/lib/conversation/resolutions'
import { buildChatContext } from '@/lib/context/assemble'
import { retrievePages, formatRetrievedPages } from '@/lib/embeddings/retrieve'
import { buildSystemPrompt, NO_OPEN_PAGE_STEERING } from './prompt'
import { createPageTool, proposeChangesTool, fetchContextTool } from './tools'
import { makeRepairToolCall } from '@/lib/ai/repair'
import type { NodeType } from '@/lib/supabase/types'

/** Plain text of the most recent user message, for @mention parsing. */
function latestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    return m.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { type: 'text'; text: string }).text)
      .join(' ')
  }
  return ''
}

/** Minimal body-shape guard: the chat route requires a `messages` array. A
 *  malformed body (bad JSON, missing/non-array `messages`) returns 400 instead of
 *  letting `streamText` throw a 500 deeper in the request. */
const NODE_TYPES: readonly NodeType[] = ['area', 'routine', 'project', 'action', 'page']

export function parseChatBody(body: unknown): {
  messages: UIMessage[]
  nodeId?: string
  nodeType?: NodeType
  resolutions: ConversationResolutions
} | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  if (!Array.isArray(b.messages)) return null
  const nodeType =
    typeof b.nodeType === 'string' && (NODE_TYPES as string[]).includes(b.nodeType)
      ? (b.nodeType as NodeType)
      : undefined
  return {
    messages: b.messages as UIMessage[],
    nodeId: typeof b.nodeId === 'string' ? b.nodeId : undefined,
    nodeType,
    resolutions: parseResolutions(b.resolutions),
  }
}

export async function POST(req: Request) {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = parseChatBody(rawBody)
  if (!parsed) {
    return Response.json({ error: 'Request body must include a messages array' }, { status: 400 })
  }
  const { messages, nodeId, nodeType, resolutions } = parsed

  // Assemble node context (current node + @mentions) to inject into the prompt.
  let system = buildSystemPrompt()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const context = await buildChatContext(supabase, user.id, {
      nodeId,
      nodeType,
      latestUserText: latestUserText(messages),
    })
    if (context) {
      system = buildSystemPrompt(context)
    }
  }
  // No open node → propose_changes is withheld below; steer the model to say
  // "open that page and ask again" instead of faking the edit via create_page.
  if (!nodeId) {
    system += NO_OPEN_PAGE_STEERING
  }

  const result = streamText({
    model: anthropic(AI_MODELS.standard),
    system,
    // Resolved proposal cards are stamped with their user decision as a synthetic
    // tool result (ticket-19) so the model sees what was actioned and stops
    // re-proposing; unresolved calls are still dropped by toModelMessages.
    messages: await toModelMessages(applyResolutions(messages, resolutions)),
    // Allow one round-trip so the model can call fetch_context, read the result,
    // and answer in the same turn. create_page stays client-side (no execute) and
    // still ends the turn as before.
    stopWhen: stepCountIs(3),
    // Self-correction on top of the strict inputSchema gate (t16 branch 7): if the
    // model emits a tool call whose arguments fail schema validation — most likely a
    // slightly-off propose_changes batch against the closed discriminated union —
    // re-ask it to produce valid arguments rather than dropping the turn. The strict
    // schema is still the gate; this only widens the model's second chance to hit it.
    // Logic lives in @/lib/ai/repair so it can be exercised directly (eval-repair.mts).
    repairToolCall: makeRepairToolCall(),
    tools: {
      create_page: tool(createPageTool),
      // propose_changes edits the CURRENT page — with no node open there is no
      // valid target, so the tool is withheld entirely (build-brief decision 2).
      ...(nodeId ? { propose_changes: tool(proposeChangesTool) } : {}),
      fetch_context: tool({
        ...fetchContextTool,
        execute: async ({ query }) => {
          if (!user) return 'No user session; cannot retrieve workspace context.'
          const pages = await retrievePages(supabase, user.id, query, { matchCount: 5 })
          return formatRetrievedPages(pages)
        },
      }),
    },
  })

  return result.toUIMessageStreamResponse()
}
