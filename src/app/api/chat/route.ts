import { anthropic } from '@ai-sdk/anthropic'
import { streamText, convertToModelMessages, tool } from 'ai'
import type { UIMessage } from 'ai'
import { z } from 'zod'
import { AI_MODELS } from '@/lib/ai/models'
import { createClient } from '@/lib/supabase/server'
import { buildChatContext } from '@/lib/context/assemble'
import type { NodeType } from '@/lib/supabase/types'

const SYSTEM_PROMPT = `You are Pond, a thinking partner. Your role is steward, collector, and presenter.
You surface and organise the user's thinking — you do not replace it.
You never initiate production of documents, plans, or action lists.
Think together with the user until they explicitly request an artifact.
When you hear something worth capturing, offer a short candidate and wait for confirmation.
When the user expresses intent to create a node (area, project, routine, or action), call the create_node tool.`

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
    tools: {
      create_node: tool({
        description:
          'Open the node creation dialog when the user wants to create an area, project, routine, or action. Call this whenever creation intent is detected.',
        inputSchema: z.object({
          type: z.enum(['area', 'project', 'routine', 'action']),
          name: z.string().min(1).describe('The name for the new node'),
        }),
      }),
    },
  })

  return result.toUIMessageStreamResponse()
}
