import { anthropic } from '@ai-sdk/anthropic'
import { streamText, tool, stepCountIs } from 'ai'
import type { UIMessage } from 'ai'
import { z } from 'zod'
import { AI_MODELS } from '@/lib/ai/models'
import { createClient } from '@/lib/supabase/server'
import { toModelMessages } from '@/lib/conversation/transcript'
import { buildChatContext } from '@/lib/context/assemble'
import { retrievePages, formatRetrievedPages } from '@/lib/embeddings/retrieve'
import { moduleCatalog, proposeChangesSchema } from '@/lib/modules/ai-composition'
import type { NodeType } from '@/lib/supabase/types'

const SYSTEM_PROMPT = `You are Pond, a thinking partner. Your role is steward, collector, and presenter.
You surface and organise the user's thinking — you do not replace it.
You never initiate production of documents, plans, or action lists.
Think together with the user until they explicitly request an artifact.
When you hear something worth capturing, offer a short candidate and wait for confirmation.
When the user expresses intent to create a node (area, project, routine, or action), call the create_node tool.
When the user asks to change, rewrite, or reword existing text in the current node, do NOT write it yourself — call the propose_edit tool with the target block's id (from the "Editable blocks" list in the injected context) and the full new content. The user reviews and accepts the proposal. If it is unclear which block they mean, ask a short clarifying question before proposing.
When the user explicitly asks you to build, add, or compose content in the current node — new blocks, a checklist, a metric, or several at once — call the propose_changes tool with a batch of operations. Only propose on an explicit request; never emit blocks unprompted. Do NOT invent block ids: omit the id when creating (the client assigns one on accept), and reference existing blocks by the ids in the injected context when editing or removing. The available block types are:
${moduleCatalog}
The user reviews every proposed change and accepts or rejects it before anything is written.
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
    messages: await toModelMessages(messages),
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
      propose_edit: tool({
        description:
          'Propose an edit to an existing TEXT block in the current node instead of writing it directly. Use when the user asks to change, rewrite, or reword existing text. The user reviews the proposal (accept/reject/edit) before anything is written. Resolved client-side — no execute.',
        inputSchema: z.object({
          blockId: z
            .string()
            .min(1)
            .describe(
              "The stable id of the target block, from the 'Editable blocks' list in the injected context"
            ),
          newContent: z
            .string()
            .describe(
              'The full proposed markdown content for the block (replaces its current content)'
            ),
          reason: z
            .string()
            .optional()
            .describe('A short, optional note on what the edit changes and why'),
        }),
      }),
      propose_changes: tool({
        description:
          'Propose a batch of composition changes to the current node — create new blocks, edit existing ones (including changing a block from one type to another), remove blocks, or several at once. Use when the user explicitly asks to build or compose content. The user reviews the proposal (per-change and all-at-once accept/reject) before anything is written. Never propose unprompted. Resolved client-side — no execute. The tool schema is generated from the module registry, so it structurally cannot carry an unknown block type or an id you invented; the emitted data IS the server-side validation gate (t16 branch 7). ' +
          'experimental_repairToolCall retry is a Phase-5 follow-up (needs live-model verification).',
        inputSchema: proposeChangesSchema,
      }),
      fetch_context: tool({
        description:
          'Search the user\'s entire workspace (all areas, projects, routines, and documents) for content semantically related to a query. Call this ONLY when the user explicitly asks to recall what they wrote before or to bring in context from elsewhere (e.g. "what have I written about X", "pull in my notes on Y"). Never call it to browse unprompted.',
        inputSchema: z.object({
          query: z.string().min(1).describe('What to search the workspace for'),
        }),
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
