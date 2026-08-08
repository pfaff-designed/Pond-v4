import { anthropic } from '@ai-sdk/anthropic'
import { streamText, convertToModelMessages, tool, stepCountIs } from 'ai'
import type { UIMessage } from 'ai'
import { z } from 'zod'
import { AI_MODELS } from '@/lib/ai/models'
import { createClient } from '@/lib/supabase/server'
import { buildChatContext } from '@/lib/context/assemble'
import { retrieveDocuments, formatRetrievedDocs } from '@/lib/embeddings/retrieve'
import type { NodeType } from '@/lib/supabase/types'

const SYSTEM_PROMPT = `You are Pond, a thinking partner. Your role is steward, collector, and presenter.
You surface and organise the user's thinking — you do not replace it.
You never initiate production of documents, plans, or action lists.
Think together with the user until they explicitly request an artifact.
When you hear something worth capturing, offer a short candidate and wait for confirmation.
When the user expresses intent to create a node (area, project, routine, or action), call the create_node tool.
When the user explicitly asks to recall what they have written elsewhere, or to bring in context from across their workspace, call the fetch_context tool. Never search their workspace unprompted.`

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
  let system = SYSTEM_PROMPT
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
      system = `${SYSTEM_PROMPT}\n\nUse the following context about the user's workspace when relevant. Do not repeat it back verbatim unless asked.\n\n${context}`
    }
  }

  const result = streamText({
    model: anthropic(AI_MODELS.standard),
    system,
    messages: await convertToModelMessages(messages),
    // Allow one round-trip so the model can call fetch_context, read the result,
    // and answer in the same turn. create_node stays client-side (no execute) and
    // still ends the turn as before.
    stopWhen: stepCountIs(3),
    tools: {
      create_node: tool({
        description:
          'Open the node creation dialog when the user wants to create an area, project, routine, or action. Call this whenever creation intent is detected.',
        inputSchema: z.object({
          type: z.enum(['area', 'project', 'routine', 'action']),
          name: z.string().min(1).describe('The name for the new node'),
        }),
      }),
      fetch_context: tool({
        description:
          'Search the user\'s entire workspace (all areas, projects, routines, and documents) for content semantically related to a query. Call this ONLY when the user explicitly asks to recall what they wrote before or to bring in context from elsewhere (e.g. "what have I written about X", "pull in my notes on Y"). Never call it to browse unprompted.',
        inputSchema: z.object({
          query: z.string().min(1).describe('What to search the workspace for'),
        }),
        execute: async ({ query }) => {
          if (!user) return 'No user session; cannot retrieve workspace context.'
          const docs = await retrieveDocuments(supabase, user.id, query, { matchCount: 5 })
          return formatRetrievedDocs(docs)
        },
      }),
    },
  })

  return result.toUIMessageStreamResponse()
}
