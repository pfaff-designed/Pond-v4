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
import { buildSystemPrompt } from './prompt'
import { createPageTool, proposeChangesTool, fetchContextTool, readPageTool } from './tools'
import { webSearchTool } from './web-search'
import { makeRepairToolCall } from '@/lib/ai/repair'
import { fetchLinkContext } from '@/lib/context/paste-link'
import { fetchNodeContext, formatNodeContext } from '@/lib/context/assemble'
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
  const userText = latestUserText(messages)
  let system = buildSystemPrompt()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Paste-a-link (ticket-29): any http(s) URL in the latest user message is fetched
  // server-side (sanitized, size-capped, no redirects into private ranges) and
  // injected as source material the model can cite. Gated on an authenticated
  // user: in production the proxy already redirects unauthenticated requests, but
  // the dev auto-login bypass (DEV_AUTOLOGIN) lets cookie-less calls through, and
  // an SSRF-adjacent fetch surface must never run for anonymous callers.
  const contextBlocks: string[] = []
  if (user) {
    const linkContext = await fetchLinkContext(userText)
    if (linkContext) contextBlocks.push(linkContext)

    const context = await buildChatContext(supabase, user.id, {
      nodeId,
      nodeType,
      latestUserText: userText,
    })
    if (context) contextBlocks.push(context)
  }
  if (contextBlocks.length > 0) {
    system = buildSystemPrompt(contextBlocks.join('\n\n'))
  }

  const result = streamText({
    model: anthropic(AI_MODELS.standard),
    system,
    // Resolved proposal cards are stamped with their user decision as a synthetic
    // tool result (ticket-19) so the model sees what was actioned and stops
    // re-proposing; unresolved calls are still dropped by toModelMessages.
    messages: await toModelMessages(applyResolutions(messages, resolutions)),
    // Allow several round-trips: the model can call fetch_context or run one or more
    // web searches (ticket-29), read the results, and answer in the same turn.
    // create_page stays client-side (no execute) and still ends the turn as before.
    // The web_search tool caps its own uses per turn (WEB_SEARCH_MAX_USES); this
    // outer bound covers the read-then-answer round-trips around those searches.
    stopWhen: stepCountIs(8),
    // Self-correction on top of the strict inputSchema gate (t16 branch 7): if the
    // model emits a tool call whose arguments fail schema validation — most likely a
    // slightly-off propose_changes batch against the closed discriminated union —
    // re-ask it to produce valid arguments rather than dropping the turn. The strict
    // schema is still the gate; this only widens the model's second chance to hit it.
    // Logic lives in @/lib/ai/repair so it can be exercised directly (eval-repair.mts).
    repairToolCall: makeRepairToolCall(),
    tools: {
      create_page: tool(createPageTool),
      // propose_changes can now target ANY page the model names by id from the
      // workspace outline, not just the open one (ticket-30): it edits the open
      // page by default, or a page named via `targetPageId` after a read_page.
      // Always offered — even from Life home, where the cross-page path is the
      // whole point.
      propose_changes: tool(proposeChangesTool),
      // read_page (ticket-30): fetch a named page's current blocks (with ids) so a
      // cross-page edit references the right target blocks. Server-executed here so
      // the closure can capture the per-request supabase client + user.
      read_page: tool({
        ...readPageTool,
        execute: async ({ pageId }) => {
          if (!user) return 'No user session; cannot read that page.'
          const data = await fetchNodeContext(supabase, user.id, pageId)
          if (!data) return `No page found with id ${pageId} (it may not exist or is not yours).`
          return formatNodeContext(data, { label: `Read: ${data.title}`, includeBlockIds: true })
        },
      }),
      fetch_context: tool({
        ...fetchContextTool,
        execute: async ({ query }) => {
          if (!user) return 'No user session; cannot retrieve workspace context.'
          const pages = await retrievePages(supabase, user.id, query, { matchCount: 5 })
          return formatRetrievedPages(pages)
        },
      }),
      // Provider-executed web search (ticket-29): Anthropic runs the search and
      // returns cited results; the SDK surfaces them as `source-url` message parts.
      web_search: webSearchTool,
    },
  })

  // sendSources streams the web_search citations (source-url parts) to the client so
  // the terminal can render them as a SourceList under the sourced answer (ticket-29).
  return result.toUIMessageStreamResponse({ sendSources: true })
}
