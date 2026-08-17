import { anthropic } from '@ai-sdk/anthropic'
import { streamText, tool, stepCountIs } from 'ai'
import type { UIMessage } from 'ai'
import { AI_MODELS } from '@/lib/ai/models'
import { createClient } from '@/lib/supabase/server'
import { toModelMessages } from '@/lib/conversation/transcript'
import { buildChatContext } from '@/lib/context/assemble'
import { retrievePages, formatRetrievedPages } from '@/lib/embeddings/retrieve'
import { buildSystemPrompt } from './prompt'
import { createNodeTool, proposeChangesTool, fetchContextTool } from './tools'
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

export async function POST(req: Request) {
  const { messages, nodeId, nodeType } = (await req.json()) as {
    messages: UIMessage[]
    nodeId?: string
    nodeType?: NodeType
  }

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

  const result = streamText({
    model: anthropic(AI_MODELS.standard),
    system,
    messages: await toModelMessages(messages),
    // Allow one round-trip so the model can call fetch_context, read the result,
    // and answer in the same turn. create_node stays client-side (no execute) and
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
      create_node: tool(createNodeTool),
      propose_changes: tool(proposeChangesTool),
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
