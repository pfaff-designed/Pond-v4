/**
 * THROWAWAY PROTOTYPE — not wired into the app, kept as reference (like
 * proto-createpage.mts / proto-routing.mts).
 *
 * M3 pre-build question (brief §5 B): before committing to a real `table` block
 * primitive, which schema SHAPE does the model fill best when scaffolding
 * inventory/collection pages via create_page?
 *
 * Two candidates probed against the REAL model (AI_MODELS.standard =
 * claude-sonnet-4-6) with the create_page call forced, across three inventory
 * prompts (workshop tools, board games, pantry):
 *
 *   Shape A — rows as objects:  { type:'table', title?, columns: string[],
 *                                 rows: [{ cells: string[] }] }
 *              (matches the persisted shape: rows need minted ids like todo
 *               items, so `{cells}` row objects are what hydrate stamps onto)
 *   Shape B — rows as flat arrays: { type:'table', title?, columns: string[],
 *                                    rows: string[][] }
 *
 * Judgement criteria: right columns for the domain, real (non-placeholder) rows,
 * every row's cell count == columns.length, NO markdown-table leakage into text
 * blocks, sensible use of a table (not a todo faking it).
 *
 * Run:  node --env-file=.env.local scripts/proto-table.mts [A|B]
 *       (no arg = run both shapes)
 */
import { anthropic } from '@ai-sdk/anthropic'
import { generateText, tool } from 'ai'
import { z } from 'zod'

const MODEL = 'claude-sonnet-4-6' // AI_MODELS.standard — the app's real default

// ── Shared non-table blocks (id-stripped, mirrors moduleDataSchema) ──────────
const textData = z.object({ type: z.literal('text'), content: z.string().describe('markdown') })
const todoData = z.object({
  type: z.literal('todo'),
  items: z.array(z.object({ label: z.string(), checked: z.boolean() })),
})
const metricData = z.object({
  type: z.literal('metric'),
  label: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  trend: z.enum(['up', 'down', 'flat']).optional(),
})

// ── Candidate table shapes ───────────────────────────────────────────────────
const tableA = z.object({
  type: z.literal('table'),
  title: z.string().optional().describe('optional short table caption'),
  columns: z.array(z.string()).min(1).describe('column header labels'),
  rows: z
    .array(z.object({ cells: z.array(z.string()).describe('one cell per column, same order') }))
    .describe('data rows'),
})

const tableB = z.object({
  type: z.literal('table'),
  title: z.string().optional().describe('optional short table caption'),
  columns: z.array(z.string()).min(1).describe('column header labels'),
  rows: z.array(z.array(z.string())).describe('data rows; each row = one cell per column'),
})

const TABLE_CATALOG_LINE =
  '- table: a structured table of rows and columns. Use for inventories, collections, and any list of items with several attributes each (name, quantity, location, …). Do NOT fake tables as markdown inside text blocks.'

const CATALOG = [
  '- text: a prose block in markdown. Notes, explanations, headings, freeform writing.',
  '- todo: a checklist of toggleable items. Tasks, steps, packing lists.',
  '- metric: a single labelled number (optional unit + up/down/flat trend). One key figure.',
  TABLE_CATALOG_LINE,
].join('\n')

const SYSTEM = `You are Pond, a thinking partner that helps a user structure their workspace.
When the user asks to create a page, call the create_page tool.
Choose a sensible page \`type\` tag, a clear \`title\`, and scaffold the \`blocks\` so the page is genuinely useful the moment it's created.
You may ONLY use these block types:
${CATALOG}
Compose several blocks when it helps. Do not invent block types or fields beyond the schema.`

const PROMPTS = [
  { kind: 'workshop tools', text: 'Make an inventory page for my workshop tools.' },
  { kind: 'board games', text: 'Make an inventory page for my board game collection.' },
  { kind: 'pantry', text: 'Create a page to track my pantry stock.' },
]

function buildTools(tableShape: z.ZodTypeAny) {
  const blockData = z.discriminatedUnion('type', [
    textData,
    todoData,
    metricData,
    tableShape as typeof tableA,
  ])
  const createPageSchema = z.object({
    type: z.enum(['area', 'routine', 'project', 'action', 'page']),
    title: z.string(),
    blocks: z.array(blockData),
  })
  return {
    create_page: tool({
      description:
        'Create a new page and scaffold its initial content blocks in one step. Call whenever the user wants to make an inventory, collection, project, or any new page.',
      inputSchema: createPageSchema,
    }),
  }
}

type AnyBlock = { type: string; [k: string]: unknown }

function judge(shape: 'A' | 'B', blocks: AnyBlock[]): string[] {
  const notes: string[] = []
  const tables = blocks.filter((b) => b.type === 'table')
  if (tables.length === 0) notes.push('✖ NO table block emitted')
  for (const t of tables) {
    const cols = (t.columns as string[]) ?? []
    const rows = (t.rows as unknown[]) ?? []
    if (rows.length < 3) notes.push(`⚠ table has only ${rows.length} rows`)
    for (const [i, r] of rows.entries()) {
      const cells = shape === 'A' ? ((r as { cells: string[] }).cells ?? []) : (r as string[])
      if (cells.length !== cols.length)
        notes.push(`✖ row ${i}: ${cells.length} cells vs ${cols.length} columns`)
    }
  }
  for (const b of blocks) {
    if (b.type === 'text' && /\|.*\|.*\n.*\|[-\s|]+\|/.test(String(b.content ?? '')))
      notes.push('✖ markdown-table LEAKED into a text block')
  }
  if (notes.length === 0) notes.push('✓ clean: table(s) present, ragged-row-free, no md leakage')
  return notes
}

async function runShape(shape: 'A' | 'B') {
  const tools = buildTools(shape === 'A' ? tableA : tableB)
  console.log('\n' + '█'.repeat(72))
  console.log(`SHAPE ${shape} — rows as ${shape === 'A' ? '{cells: string[]} objects' : 'flat string[][]'}`)
  console.log('█'.repeat(72))
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
        toolChoice: { type: 'tool', toolName: 'create_page' },
      })
      const call = result.toolCalls[0]
      if (!call) {
        console.log('  ⚠️  no tool call emitted')
        continue
      }
      const input = call.input as { type: string; title: string; blocks: AnyBlock[] }
      console.log(`  type: ${input.type}   title: ${input.title}`)
      console.log(`  blocks: ${input.blocks.map((b) => b.type).join(', ')}`)
      for (const n of judge(shape, input.blocks)) console.log('  ' + n)
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
}

async function run() {
  const arg = (process.argv[2] ?? '').toUpperCase()
  if (arg === 'A' || arg === 'B') await runShape(arg)
  else {
    await runShape('A')
    await runShape('B')
  }
  console.log('\nDone. Judge: right columns, real rows, cells==columns, no md leakage.\n')
}

run()
