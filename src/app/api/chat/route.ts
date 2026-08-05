import { anthropic } from '@ai-sdk/anthropic'
import { streamText, convertToModelMessages, tool } from 'ai'
import { z } from 'zod'
import { AI_MODELS } from '@/lib/ai/models'

const SYSTEM_PROMPT = `You are Pond, a thinking partner. Your role is steward, collector, and presenter.
You surface and organise the user's thinking — you do not replace it.
You never initiate production of documents, plans, or action lists.
Think together with the user until they explicitly request an artifact.
When you hear something worth capturing, offer a short candidate and wait for confirmation.
When the user expresses intent to create a node (area, project, routine, or action), call the create_node tool.`

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: anthropic(AI_MODELS.standard),
    system: SYSTEM_PROMPT,
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
