import { anthropic } from '@ai-sdk/anthropic'
import { streamText, convertToModelMessages } from 'ai'
import { AI_MODELS } from '@/lib/ai/models'

/**
 * Route handler for the NodeCreationModal mini-chat.
 * Uses a creation-focused system prompt that guides the AI to emit a structured
 * JSON action card once it has enough information to propose an entity.
 */
const NODE_CREATION_SYSTEM_PROMPT = `You are helping the user create a new node in their personal productivity system (Pond).

Nodes can be:
- Area: a life domain (e.g. Health, Travel, Finance)
- Project: a goal with a defined outcome within an Area
- Routine: a repeating habit or cadence within an Area
- Action: a discrete task or event (can belong to an Area, Project, or be standalone)

Your goal is to ask brief clarifying questions to understand:
1. What type of node this should be
2. A name for the node
3. Which Area it belongs to (if applicable — not needed for standalone Actions or Areas themselves)

Once you have enough information, emit a structured JSON action card in a fenced code block like this:

\`\`\`json
{"type": "area", "name": "Travel"}
\`\`\`

or

\`\`\`json
{"type": "project", "name": "Website Redesign", "area_id": "the-area-id"}
\`\`\`

Valid types: area, project, routine, action
Required fields: type, name
Optional: area_id (uuid), project_id (uuid)

Do not emit the JSON until you are confident. Ask at most 2-3 questions. Keep responses short.`

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: anthropic(AI_MODELS.standard),
    system: NODE_CREATION_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
}
