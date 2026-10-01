/**
 * Repair eval — runtime proof for repairToolCall (brief §6).
 *
 * The repair path (src/lib/ai/repair.ts, extracted from route.ts) was typechecked
 * but never exercised: it can't be forced through the UI, since the strict
 * inputSchema gate rarely fails in practice. This script invokes the extracted
 * `repairToolCallArgs` DIRECTLY with a fabricated schema-invalid propose_changes
 * tool call, feeds it the REAL `proposeChangesSchema` (as the JSON schema the AI
 * SDK would hand the repair function in production), and asserts the repaired
 * output validates against that same real schema.
 *
 * This makes a REAL generateObject call to the standard model — the actual repair
 * mechanism, not a mock.
 *
 * Run:  node --env-file=.env.local scripts/eval-repair.mts
 * Exit code is non-zero if the repaired output does not validate.
 */
import { zodSchema } from 'ai'
import { repairToolCallArgs } from '../src/lib/ai/repair.ts'
import { proposeChangesSchema } from '../src/lib/modules/ai-composition.ts'

// The JSON schema the AI SDK resolves for propose_changes at runtime — the exact
// artifact repairToolCall receives via inputSchema({ toolName }).
const proposeChangesJsonSchema = zodSchema(proposeChangesSchema).jsonSchema

// ── A fabricated schema-INVALID propose_changes tool call ────────────────────
// It fails validation in several realistic ways at once:
//  - op "update" is not in the union {create, edit, remove}
//  - block type "metric-ring" is not a known module (closed data union — #111
//    deleted the nine data-holding display blocks)
//  - a create op invents an id (the model must never mint ids)
//  - a table's rows are bare arrays rather than `{ cells }` objects
// A real slightly-off model batch would trip one of these; we stack them.
const invalidInput = {
  changes: [
    {
      op: 'update', // invalid op
      blockId: 'b1',
      data: { type: 'text', content: 'A warmer, more casual intro.' },
    },
    {
      op: 'create',
      id: 'block-i-invented', // must NOT mint ids
      data: {
        type: 'table',
        columns: ['A', 'B'],
        rows: [['a', 'b']], // rows must be `{ cells: [...] }` objects
      },
    },
    {
      op: 'create',
      data: { type: 'metric-ring', label: 'Progress', pct: 1.5 }, // unknown block type
    },
  ],
}

async function run() {
  console.log('═'.repeat(80))
  console.log('REPAIR EVAL — feeding a schema-invalid propose_changes call to the real repair')
  console.log('═'.repeat(80))
  console.log('\nFED (invalid input):')
  console.log(JSON.stringify(invalidInput, null, 2))

  const repaired = await repairToolCallArgs({
    toolCall: { toolName: 'propose_changes', input: invalidInput },
    error: {
      message:
        'Invalid discriminator value for `op` ("update"); unknown block type "table"; unexpected id on create; pct 1.5 exceeds max 1.',
    },
    inputSchema: async () => proposeChangesJsonSchema,
  })

  if (!repaired) {
    console.error('\nFAIL: repair returned null (expected a repaired propose_changes call).')
    process.exit(1)
  }

  console.log('\nRETURNED (repaired input string):')
  console.log(repaired.input)

  // The real gate: does the repaired output validate against the REAL zod schema?
  const parsed = JSON.parse(repaired.input)
  const validation = proposeChangesSchema.safeParse(parsed)

  console.log('\n' + '─'.repeat(80))
  console.log('ASSERTIONS')
  console.log('─'.repeat(80))
  const checks: [string, boolean, string][] = []
  checks.push(['toolName preserved', repaired.toolName === 'propose_changes', repaired.toolName])
  checks.push([
    'repaired output validates against real proposeChangesSchema',
    validation.success,
    validation.success ? 'valid' : JSON.stringify(validation.error.issues).slice(0, 200),
  ])
  if (validation.success) {
    const changes = validation.data.changes
    checks.push(['batch is non-empty', changes.length >= 1, `${changes.length} change(s)`])
    const ops = new Set(changes.map((c) => c.op))
    checks.push([
      'every op is in {create, edit, remove}',
      [...ops].every((o) => o === 'create' || o === 'edit' || o === 'remove'),
      [...ops].join(', '),
    ])
    const types = changes.map((c) => ('data' in c ? c.data.type : '(remove)'))
    checks.push([
      'no unknown block types (e.g. "table")',
      !types.includes('table' as never),
      types.join(', '),
    ])
    // No minted ids: create ops carry no top-level id; the zod schema strips unknown
    // keys, so validation.data cannot contain one — assert the raw JSON too.
    const rawCreatesHaveNoId = parsed.changes.every(
      (c: Record<string, unknown>) => c.op !== 'create' || !('id' in c),
    )
    checks.push(['no minted ids on create ops', rawCreatesHaveNoId, String(rawCreatesHaveNoId)])
  }

  let allPass = true
  for (const [name, ok, detail] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}  —  ${detail}`)
    if (!ok) allPass = false
  }

  console.log('\n' + '═'.repeat(80))
  console.log(allPass ? 'RESULT: PASS — repair produced schema-valid arguments.' : 'RESULT: FAIL')
  console.log('═'.repeat(80) + '\n')
  process.exit(allPass ? 0 : 1)
}

run()
