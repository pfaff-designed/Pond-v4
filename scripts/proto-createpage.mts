/**
 * THROWAWAY PROTOTYPE — not wired into the app, safe to delete.
 *
 * Answers one design question before any real build (t16 follow-on):
 *   Given ONLY the 4 existing block types (text / todo / metric / metric-ring),
 *   can the model scaffold a genuinely good "recipe" / "inventory" / "dashboard" /
 *   "document" page in a single create_page gesture — or is the output thin enough
 *   that these page-kinds need real per-type templates?
 *
 * It calls the REAL model (AI_MODELS.standard = claude-sonnet-4-6, the app default)
 * with a create_page tool whose block schemas are copied id-stripped from
 * the src/lib/modules block schemas (i.e. faithful to moduleDataSchema). No persistence,
 * no UI, no accept flow — it forces the tool call and dumps the JSON for eyeballing.
 *
 * Run:  node --env-file=.env.local scripts/proto-createpage.mts
 */
import { anthropic } from '@ai-sdk/anthropic'
import { generateText, tool } from 'ai'
import { z } from 'zod'

const MODEL = 'claude-sonnet-4-6' // AI_MODELS.standard — the app's real default

// ── Block data schemas — copied id-stripped from the src/lib/modules blocks ──
// (mirrors moduleDataSchema in ai-composition.ts; the model never mints ids)
const blockData = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), content: z.string().describe('markdown') }),
  z.object({
    type: z.literal('todo'),
    items: z.array(z.object({ label: z.string(), checked: z.boolean() })),
  }),
  z.object({
    type: z.literal('metric'),
    label: z.string(),
    value: z.number(),
    unit: z.string().optional(),
    trend: z.enum(['up', 'down', 'flat']).optional(),
  }),
  z.object({
    type: z.literal('metric-ring'),
    label: z.string().describe('focal numeral, e.g. "38"'),
    sub: z.string().optional().describe('caption under the numeral, e.g. "MILES"'),
    pct: z.number().min(0).max(1).describe('ring fill 0..1'),
  }),
])

// The "loose / generic" hypothesis made concrete: one gesture that mints a page
// shell (type tag + title) AND fills its blocks. No per-kind template.
const createPageSchema = z.object({
  type: z
    .enum(['area', 'routine', 'project', 'action', 'page'])
    .describe('the page type tag — use "page" for anything without a better fit'),
  title: z.string(),
  blocks: z.array(blockData).describe('the scaffolded content, using only the block types above'),
})

const BLOCK_CATALOG = [
  '- text: a prose block in markdown. Notes, explanations, headings, freeform writing.',
  '- todo: a checklist of toggleable items. Tasks, steps, packing lists, ingredients to gather.',
  '- metric: a single labelled number (optional unit + up/down/flat trend). One key figure.',
  '- metric-ring: a progress ring around a focal number. A metric with a target/percentage.',
].join('\n')

const SYSTEM = `You are Pond, a thinking partner that helps a user structure their workspace.
When the user asks to create a page — a project, dashboard, inventory/collection, recipe, document, or anything else — call the create_page tool.
Choose a sensible page \`type\` tag, a clear \`title\`, and scaffold the \`blocks\` so the page is genuinely useful the moment it's created — the way a thoughtful person would set it up.
You may ONLY use these block types:
${BLOCK_CATALOG}
Compose several blocks when it helps. Do not invent block types or fields beyond the schema.`

// Pass your own prompts as CLI args to test interactively:
//   node --env-file=.env.local scripts/proto-createpage.mts "make me a travel packing list"
// With no args, runs the default five sample kinds.
const DEFAULTS = [
  { kind: 'recipe', text: 'Create a recipe page for chicken parmesan.' },
  { kind: 'inventory/collection', text: 'Make an inventory page for my board game collection.' },
  { kind: 'dashboard', text: 'Create a new dashboard for my fitness.' },
  { kind: 'document', text: 'Create a document to plan my Q3 goals.' },
  { kind: 'project', text: 'Create a new project for redesigning my personal website.' },
]
const cliPrompts = process.argv.slice(2)
const PROMPTS =
  cliPrompts.length > 0 ? cliPrompts.map((text) => ({ kind: 'custom', text })) : DEFAULTS

const tools = {
  create_page: tool({
    description:
      'Create a new page and scaffold its initial content blocks in one step. Call whenever the user wants to make a project, dashboard, inventory, collection, recipe, document, or any new page.',
    inputSchema: createPageSchema,
  }),
}

function summarize(blocks: Array<{ type: string }>): string {
  const counts: Record<string, number> = {}
  for (const b of blocks) counts[b.type] = (counts[b.type] ?? 0) + 1
  return Object.entries(counts)
    .map(([t, n]) => `${n}×${t}`)
    .join(', ')
}

async function run() {
  for (const { kind, text } of PROMPTS) {
    console.log('\n' + '═'.repeat(72))
    console.log(`▸ ${kind.toUpperCase()}  —  "${text}"`)
    console.log('═'.repeat(72))
    try {
      const result = await generateText({
        model: anthropic(MODEL),
        system: SYSTEM,
        prompt: text,
        tools,
        // Force the create_page call so the eval isolates FILL quality, not routing.
        toolChoice: { type: 'tool', toolName: 'create_page' },
      })
      const call = result.toolCalls[0]
      if (!call) {
        console.log('  ⚠️  no tool call emitted')
        continue
      }
      const input = call.input as z.infer<typeof createPageSchema>
      console.log(`  type: ${input.type}   title: ${input.title}`)
      console.log(`  blocks: ${input.blocks.length}  (${summarize(input.blocks)})`)
      console.log('  ── full payload ──')
      console.log(
        JSON.stringify(input, null, 2)
          .split('\n')
          .map((l) => '  ' + l)
          .join('\n')
      )
    } catch (err) {
      console.log(`  ✖ error: ${(err as Error).message}`)
    }
  }
  console.log('\n' + '═'.repeat(72))
  console.log('Done. Read each payload and judge: is this a good page with generic')
  console.log('blocks, or does the kind need a real template? That settles the fork.')
  console.log('═'.repeat(72) + '\n')
}

run()
