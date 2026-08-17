/**
 * THROWAWAY PROTOTYPE — not wired into the app, safe to delete.
 *
 * Tests the ONE thing proto-createpage.mts masked by forcing the tool call:
 * ROUTING. Given the four real tools unforced — create_node, propose_changes,
 * create_page (the proposed new one), fetch_context — does the model pick the
 * right one? The dangerous cases are the collisions:
 *   - "add a recipe" while on a page → new create_page, or propose_changes edit?
 *   - "create a project" → existing create_node (empty shell), or create_page?
 *
 * Uses the REAL system prompt from src/app/api/chat/route.ts, plus one added line
 * describing create_page, and injects a simulated current-node context per scenario
 * exactly like buildChatContext does. No forcing (toolChoice auto). We watch what it
 * chooses. Bad routing here = a cheap prompt fix, which is the point of finding it now.
 *
 * Run:  node --env-file=.env.local scripts/proto-routing.mts
 */
import { anthropic } from '@ai-sdk/anthropic'
import { generateText, tool, stepCountIs } from 'ai'
import { z } from 'zod'

const MODEL = 'claude-sonnet-4-6' // AI_MODELS.standard — the app default

// ── block data (id-stripped, mirrors moduleDataSchema) ──
const blockData = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), content: z.string() }),
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
    label: z.string(),
    sub: z.string().optional(),
    pct: z.number().min(0).max(1),
  }),
])

const changeSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), data: blockData, after: z.string().optional() }),
  z.object({ op: z.literal('edit'), blockId: z.string(), data: blockData }),
  z.object({ op: z.literal('remove'), blockId: z.string() }),
])

// ── The four tools, described as the real app describes them ──
const tools = {
  create_node: tool({
    description:
      'Open the node creation dialog when the user wants to create an area, project, routine, or action. Call this whenever creation intent is detected.',
    inputSchema: z.object({
      type: z.enum(['area', 'project', 'routine', 'action']),
      name: z.string().min(1),
    }),
  }),
  propose_changes: tool({
    description:
      'Propose a batch of composition changes to the CURRENT node — create new blocks, edit existing ones, remove blocks. Use when the user asks to build or compose content on the page they are currently viewing.',
    inputSchema: z.object({ changes: z.array(changeSchema).min(1) }),
  }),
  create_page: tool({
    description:
      'Create a NEW page (separate from the current one) and scaffold its initial blocks in one step — a recipe, document, dashboard, inventory/collection, or any new page with content. Use when the user wants a brand-new page, not to edit the page they are on.',
    inputSchema: z.object({
      type: z.enum(['area', 'routine', 'project', 'action', 'page']),
      title: z.string(),
      blocks: z.array(blockData),
    }),
  }),
  fetch_context: tool({
    description:
      "Search the user's entire workspace for content related to a query. Call ONLY when the user asks to recall what they wrote before or bring in context from elsewhere.",
    inputSchema: z.object({ query: z.string().min(1) }),
  }),
}

// Real system prompt (src/app/api/chat/route.ts:13-22) + one create_page line.
const CATALOG = [
  '- text: prose in markdown.',
  '- todo: a checklist of toggleable items.',
  '- metric: a single labelled number with optional unit and trend.',
  '- metric-ring: a progress ring around a focal number.',
].join('\n')

const SYSTEM = `You are Pond, a thinking partner. Your role is steward, collector, and presenter.
You surface and organise the user's thinking — you do not replace it.
You never initiate production of documents, plans, or action lists.
Think together with the user until they explicitly request an artifact.
When you hear something worth capturing, offer a short candidate and wait for confirmation.
When the user expresses intent to create a node (area, project, routine, or action), call the create_node tool.
When the user asks to change, rewrite, reword, build, add, or compose content in the CURRENT node — rewrite an existing block, add new blocks, a checklist, a metric — call the propose_changes tool. Only propose on an explicit request; never emit blocks unprompted.
When the user wants a BRAND-NEW page with content (a recipe, document, dashboard, inventory/collection) rather than editing the page they are on, call the create_page tool.
The available block types are:
${CATALOG}
When the user explicitly asks to recall what they wrote elsewhere, call the fetch_context tool. Never search unprompted.`

type Scenario = { name: string; expect: string; ctx: string; text: string }
const SCENARIOS: Scenario[] = [
  {
    name: 'pure chat (no tool)',
    expect: 'NO tool — just converse',
    ctx: 'The user is on their Home view. No current page.',
    text: "I've been meaning to cook more Italian food lately.",
  },
  {
    name: 'edit current page',
    expect: 'propose_changes (edit b1)',
    ctx: 'Current page "Chicken Parmesan". Blocks: [text id=b1 "# Chicken Parmesan\\nA classic..."], [todo id=b2 ingredients].',
    text: 'reword the intro to sound more casual',
  },
  {
    name: 'add content to current page',
    expect: 'propose_changes (create)',
    ctx: 'Current page "Chicken Parmesan". Blocks: [text id=b1 intro], [todo id=b2 ingredients].',
    text: 'add a step-by-step instructions checklist',
  },
  {
    name: 'new page with content, from Home',
    expect: 'create_page',
    ctx: 'The user is on their Home view. No current page.',
    text: 'make me a recipe page for lasagna',
  },
  {
    name: 'new page while ON another page (explicit "separate")',
    expect: 'create_page',
    ctx: 'Current page "Chicken Parmesan". Blocks: [text id=b1 intro], [todo id=b2 ingredients].',
    text: 'create a separate page for my lasagna recipe',
  },
  {
    name: 'AMBIGUOUS: "add a recipe" while on an index page',
    expect: 'ambiguous — create_page vs propose_changes',
    ctx: 'Current page "Recipes" (a text index of recipe links). Blocks: [text id=b1 "# My Recipes\\n- Chicken Parm\\n- Carbonara"].',
    text: 'add a recipe for lasagna',
  },
  {
    name: 'COLLISION: "create a project"',
    expect: 'create_node vs create_page — observe',
    ctx: 'The user is on their Home view. No current page.',
    text: 'create a new project called Website Redesign',
  },
  {
    name: 'recall from workspace',
    expect: 'fetch_context',
    ctx: 'The user is on their Home view. No current page.',
    text: 'what have I written about my trip to Japan?',
  },
]

async function run() {
  const rows: string[] = []
  for (const s of SCENARIOS) {
    console.log('\n' + '─'.repeat(72))
    console.log(`▸ ${s.name}`)
    console.log(`  say:    "${s.text}"`)
    console.log(`  ctx:    ${s.ctx}`)
    console.log(`  expect: ${s.expect}`)
    try {
      const result = await generateText({
        model: anthropic(MODEL),
        system: `${SYSTEM}\n\nContext about the user's workspace:\n${s.ctx}`,
        prompt: s.text,
        tools,
        toolChoice: 'auto', // the whole point — let it decide
        stopWhen: stepCountIs(1),
      })
      const call = result.toolCalls[0]
      if (!call) {
        const preview = result.text.replace(/\s+/g, ' ').slice(0, 100)
        console.log(`  → NO TOOL. text: "${preview}${result.text.length > 100 ? '…' : ''}"`)
        rows.push(`${s.name.padEnd(48)} → (no tool)`)
      } else {
        const arg = JSON.stringify(call.input)
        console.log(`  → ${call.toolName}  ${arg.slice(0, 140)}${arg.length > 140 ? '…' : ''}`)
        rows.push(`${s.name.padEnd(48)} → ${call.toolName}`)
      }
    } catch (err) {
      console.log(`  ✖ error: ${(err as Error).message}`)
      rows.push(`${s.name.padEnd(48)} → ERROR`)
    }
  }
  console.log('\n' + '═'.repeat(72))
  console.log('ROUTING SUMMARY')
  console.log('═'.repeat(72))
  for (const r of rows) console.log('  ' + r)
  console.log('')
}

run()
