import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'
import { AI_MODELS } from '@/lib/ai/models'
import type { UIMessage } from 'ai'

const EXTRACT_SYSTEM_PROMPT = `You are extracting entities from a conversation transcript.
Look for things that were discussed and could be saved as structured items:
- Pages: anything that is a place to put things — a life domain or broad category ("health", "travel", "finance", "work"), a note, a list, a document
- Projects: goals with a defined outcome within an area (e.g. "redesign the website", "plan the trip")
- Actions: discrete tasks or to-dos mentioned (e.g. "send invoice", "call dentist")

Extract only items that were clearly mentioned as things the user wants to do or create.
Do not invent items. If there is nothing to extract, return an empty array.
Names should be concise (3-6 words max). Types must be "page", "project", or "action".
There is no "area" type: an area is just a page that has pages inside it, so a life
domain like "travel" is a "page".`

const ExtractionSchema = z.object({
  extractions: z.array(
    z.object({
      id: z.string().describe('A unique short ID for this item, e.g. e1, e2'),
      type: z.enum(['page', 'project', 'action']),
      name: z.string().min(1).max(100),
    })
  ),
})

export type SaveExtraction = z.infer<typeof ExtractionSchema>['extractions'][number]

function transcriptToText(messages: UIMessage[]): string {
  return messages
    .map((m) => {
      const text = m.parts
        .filter((p) => p.type === 'text')
        .map((p) => (p as { type: 'text'; text: string }).text)
        .join('')
      return `${m.role}: ${text}`
    })
    .filter((line) => line.length > 10)
    .join('\n')
}

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] }

  const transcript = transcriptToText(messages)

  if (!transcript.trim()) {
    return Response.json({ extractions: [] })
  }

  const { object } = await generateObject({
    model: anthropic(AI_MODELS.quick),
    system: EXTRACT_SYSTEM_PROMPT,
    prompt: `Extract entities from this conversation:\n\n${transcript}`,
    schema: ExtractionSchema,
  })

  return Response.json(object)
}
