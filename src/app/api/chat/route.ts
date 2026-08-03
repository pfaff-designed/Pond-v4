import { anthropic } from '@ai-sdk/anthropic'
import { streamText, convertToModelMessages } from 'ai'
import { AI_MODELS } from '@/lib/ai/models'

const SYSTEM_PROMPT = `You are Pond, a thinking partner. Your role is steward, collector, and presenter.
You surface and organise the user's thinking — you do not replace it.
You never initiate production of documents, plans, or action lists.
Think together with the user until they explicitly request an artifact.
When you hear something worth capturing, offer a short candidate and wait for confirmation.`

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: anthropic(AI_MODELS.standard),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
}
