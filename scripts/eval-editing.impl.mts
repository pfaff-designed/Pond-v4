/**
 * Editing-reliability eval — PERMANENT, repeatable. (M2.)
 *
 * The "edit fields reliably" ask (brief §8) maps onto the already-live
 * `propose_changes` `edit` op. The code works; the open question is RELIABILITY,
 * and this eval is the evidence. It imports the REAL system prompt
 * (`buildSystemPrompt`) and the REAL tool descriptions + schemas from the app
 * source (src/app/api/chat/{prompt,tools}.ts) — exactly what production runs — and
 * asserts on the *emitted batch* against a realistic simulated current page.
 *
 * Fidelity requirement: production injects the current-page block context by
 * calling `formatNodeContext(data, { includeBlockIds: true })` (see
 * src/lib/context/assemble.ts → buildChatContext) and wrapping it with
 * `buildSystemPrompt(context)`. This eval reproduces BOTH verbatim, so the model
 * sees the same "Editable blocks … reference a block by its id" listing (with the
 * real ids) it sees in the app. Testing any other context shape would be a fiction.
 *
 * Each case carries deterministic assertions on the batch: which op(s), which
 * blockId(s), and data invariants (content changed, item checked, type morphed,
 * pct value, …). A SURGICAL-BATCH invariant runs on EVERY tool-call case — the batch
 * may touch ONLY the block ids the case expects; any extra edit/remove is a failure.
 * Two cases are guards: a genuinely-ambiguous request must yield NO tool call (the
 * steward clarify-guard), and a both-tools case must emit propose_changes AND
 * create_page in one turn.
 *
 * Run:        node --env-file=.env.local scripts/eval-editing.mts
 * Flake mode: … --runs 3   (run the FULL suite N times; report per-case pass rates)
 * Exit code is non-zero if any case fails on any run.
 */
import { anthropic } from '@ai-sdk/anthropic'
import { generateText, tool, stepCountIs } from 'ai'
import { AI_MODELS } from '../src/lib/ai/models.ts'
import { buildSystemPrompt } from '../src/app/api/chat/prompt.ts'
import {
  createPageTool,
  proposeChangesTool,
  fetchContextTool,
} from '../src/app/api/chat/tools.ts'
import { formatNodeContext, type NodeContextData } from '../src/lib/context/assemble.ts'
import type { Block } from '../src/lib/documents/types.ts'
import type { ModuleChange } from '../src/lib/modules/ai-composition.ts'

const MODEL = AI_MODELS.standard // the app default (claude-sonnet-4-6)

const tools = {
  create_page: tool(createPageTool),
  propose_changes: tool(proposeChangesTool),
  fetch_context: tool(fetchContextTool),
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
// A realistic recipe page: intro text, two todo blocks (ingredients + steps), a
// metric, a progress metric-ring, a tips text block. Stable, human-shaped ids.

const RECIPE_BLOCKS: Block[] = [
  {
    id: 'blk-intro-01',
    type: 'text',
    content: '# Weeknight Lasagna\nA hearty, layered lasagna that reheats well all week.',
  },
  {
    id: 'blk-ingredients-02',
    type: 'todo',
    items: [
      { id: 'it-noodles', label: 'Lasagna noodles', checked: false },
      { id: 'it-beef', label: 'Ground beef', checked: false },
      { id: 'it-ricotta', label: 'Ricotta cheese', checked: false },
      { id: 'it-sauce', label: 'Marinara sauce', checked: false },
    ],
  },
  {
    id: 'blk-steps-03',
    type: 'todo',
    items: [
      { id: 'it-brown', label: 'Brown the beef', checked: false },
      { id: 'it-layer', label: 'Layer noodles, sauce, cheese', checked: false },
      { id: 'it-bake', label: 'Bake 45 minutes', checked: false },
    ],
  },
  { id: 'blk-cal-04', type: 'metric', label: 'Calories per serving', value: 520, unit: 'kcal' },
  { id: 'blk-ring-05', type: 'metric-ring', label: 'Progress', sub: 'prep', pct: 0.2 },
  {
    id: 'blk-tips-06',
    type: 'text',
    content: 'Tips: let it rest 15 minutes before slicing so the layers set. Freezes well.',
  },
]

const RECIPE_CTX: NodeContextData = {
  type: 'page',
  title: 'Weeknight Lasagna',
  documents: [{ title: 'Weeknight Lasagna', blocks: RECIPE_BLOCKS }],
  children: [],
}

// Genuine-ambiguity fixture: two similarly-titled text sections; "reword that
// section" cannot be resolved to one block → the steward must ask, not guess.
const AMBIG_BLOCKS: Block[] = [
  {
    id: 'blk-over-a',
    type: 'text',
    content: '## Overview\nThe first overview of the plan and its goals.',
  },
  { id: 'blk-mid', type: 'text', content: 'Some notes in between the two overviews.' },
  {
    id: 'blk-over-b',
    type: 'text',
    content: '## Overview (revised)\nA second, revised overview written later.',
  },
]

const AMBIG_CTX: NodeContextData = {
  type: 'page',
  title: 'Project Plan',
  documents: [{ title: 'Project Plan', blocks: AMBIG_BLOCKS }],
  children: [],
}

// ── Assertion helpers ────────────────────────────────────────────────────────

type Batch = { changes: ModuleChange[] }
type ToolCall = { toolName: string; input: unknown }

interface CheckCtx {
  changes: ModuleChange[]
  calls: ToolCall[]
  fail: (msg: string) => void
}

/** The block ids the model may touch this case (edit/remove targets). */
function touchedIds(changes: ModuleChange[]): string[] {
  return changes.filter((c): c is Extract<ModuleChange, { blockId: string }> => 'blockId' in c).map((c) => c.blockId)
}

type Scenario = {
  name: string
  ctxData: NodeContextData
  text: string
  /** Expected tool for the primary batch, or null = NO tool call (steward guard). */
  expectTool: keyof typeof tools | null
  /**
   * Block ids the batch is ALLOWED to touch (edit/remove). The surgical invariant
   * asserts touchedIds ⊆ allowed. Omit for no-tool cases and pure-create cases.
   */
  allowedTouch?: string[]
  /** Per-case deterministic assertions on the emitted batch. */
  check?: (c: CheckCtx) => void
  note?: string
}

const orig = (id: string): Block => {
  const b = RECIPE_BLOCKS.find((x) => x.id === id)
  if (!b) throw new Error(`no fixture block ${id}`)
  return b
}

const SCENARIOS: Scenario[] = [
  // 1 — reword the intro: single edit on the intro id, type stays text, content differs.
  {
    name: 'reword the intro',
    ctxData: RECIPE_CTX,
    text: 'reword the intro to sound warmer and more inviting',
    expectTool: 'propose_changes',
    allowedTouch: ['blk-intro-01'],
    check: ({ changes, fail }) => {
      if (changes.length !== 1) return fail(`expected 1 change, got ${changes.length}`)
      const ch = changes[0]
      if (ch.op !== 'edit' || ch.blockId !== 'blk-intro-01') return fail(`expected edit on blk-intro-01, got ${ch.op} ${'blockId' in ch ? ch.blockId : ''}`)
      if (ch.data.type !== 'text') return fail(`type must stay text, got ${ch.data.type}`)
      const before = (orig('blk-intro-01') as Extract<Block, { type: 'text' }>).content
      if (ch.data.content.trim() === before.trim()) return fail('content did not change')
      if (ch.data.content.trim().length === 0) return fail('content is empty')
    },
  },

  // 2 — check off a specific item: edit on the ingredients block; that item checked,
  //     the OTHER items preserved (label + checked state).
  {
    name: 'check off a specific ingredient item',
    ctxData: RECIPE_CTX,
    text: 'check off the ground beef on the ingredients list — I bought it',
    expectTool: 'propose_changes',
    allowedTouch: ['blk-ingredients-02'],
    check: ({ changes, fail }) => {
      if (changes.length !== 1) return fail(`expected 1 change, got ${changes.length}`)
      const ch = changes[0]
      if (ch.op !== 'edit' || ch.blockId !== 'blk-ingredients-02') return fail(`expected edit on blk-ingredients-02, got ${ch.op} ${'blockId' in ch ? ch.blockId : ''}`)
      if (ch.data.type !== 'todo') return fail(`type must stay todo, got ${ch.data.type}`)
      const before = orig('blk-ingredients-02') as Extract<Block, { type: 'todo' }>
      const items = ch.data.items
      if (items.length !== before.items.length) return fail(`item count changed ${before.items.length}→${items.length}`)
      const beef = items.find((i) => /beef/i.test(i.label))
      if (!beef) return fail('ground beef item missing after edit')
      if (!beef.checked) return fail('ground beef not checked')
      // every OTHER item stays unchecked (only the beef flips)
      const others = items.filter((i) => !/beef/i.test(i.label))
      if (others.some((i) => i.checked)) return fail('a non-target item was checked — collateral change')
      // labels preserved (same multiset, order kept)
      const labels = items.map((i) => i.label.toLowerCase())
      for (const b of before.items) if (!labels.includes(b.label.toLowerCase())) return fail(`item "${b.label}" was dropped/renamed`)
    },
  },

  // 3 — type-morph: tips text section → checklist. edit on tips id, data.type = 'todo'.
  {
    name: 'type-morph: turn the tips section into a checklist',
    ctxData: RECIPE_CTX,
    text: 'turn the tips section into a checklist',
    expectTool: 'propose_changes',
    allowedTouch: ['blk-tips-06'],
    check: ({ changes, fail }) => {
      if (changes.length !== 1) return fail(`expected 1 change, got ${changes.length}`)
      const ch = changes[0]
      if (ch.op !== 'edit' || ch.blockId !== 'blk-tips-06') return fail(`expected edit on blk-tips-06, got ${ch.op} ${'blockId' in ch ? ch.blockId : ''}`)
      if (ch.data.type !== 'todo') return fail(`expected type morph to todo, got ${ch.data.type}`)
      if (!('items' in ch.data) || ch.data.items.length < 1) return fail('checklist has no items')
    },
  },

  // 4 — delete the tips section: remove op with the tips id.
  {
    name: 'delete the tips section',
    ctxData: RECIPE_CTX,
    text: 'delete the tips section',
    expectTool: 'propose_changes',
    allowedTouch: ['blk-tips-06'],
    check: ({ changes, fail }) => {
      if (changes.length !== 1) return fail(`expected 1 change, got ${changes.length}`)
      const ch = changes[0]
      if (ch.op !== 'remove' || ch.blockId !== 'blk-tips-06') return fail(`expected remove of blk-tips-06, got ${ch.op} ${'blockId' in ch ? ch.blockId : ''}`)
    },
  },

  // 5 — multi-op in ONE batch: edit(intro) + create(servings metric), no other ops.
  {
    name: 'multi-op: reword intro AND add a servings metric',
    ctxData: RECIPE_CTX,
    text: 'reword the intro to be punchier, and also add a metric for number of servings (6)',
    expectTool: 'propose_changes',
    allowedTouch: ['blk-intro-01'], // the only existing block that may be edited/removed
    check: ({ changes, fail }) => {
      if (changes.length !== 2) return fail(`expected exactly 2 changes, got ${changes.length}`)
      const edits = changes.filter((c) => c.op === 'edit')
      const creates = changes.filter((c) => c.op === 'create')
      if (edits.length !== 1) return fail(`expected 1 edit, got ${edits.length}`)
      if (creates.length !== 1) return fail(`expected 1 create, got ${creates.length}`)
      if (changes.some((c) => c.op === 'remove')) return fail('unexpected remove op')
      const edit = edits[0] as Extract<ModuleChange, { op: 'edit' }>
      if (edit.blockId !== 'blk-intro-01') return fail(`edit must target intro, got ${edit.blockId}`)
      if (edit.data.type !== 'text') return fail(`intro edit must stay text, got ${edit.data.type}`)
      const create = creates[0] as Extract<ModuleChange, { op: 'create' }>
      if (create.data.type !== 'metric') return fail(`servings should be a metric, got ${create.data.type}`)
      if ('value' in create.data && create.data.value !== 6) return fail(`servings value should be 6, got ${create.data.value}`)
    },
  },

  // 6 — positional reference: "the second checklist" → the steps todo (blk-steps-03).
  {
    name: 'positional reference: add a step to the second checklist',
    ctxData: RECIPE_CTX,
    text: 'add a "Preheat oven to 375°F" step to the top of the second checklist',
    expectTool: 'propose_changes',
    allowedTouch: ['blk-steps-03'],
    check: ({ changes, fail }) => {
      // Adding an item to a todo is an edit of that todo block (items are nested).
      // The reliability point: the SECOND checklist is blk-steps-03, not the first.
      const touched = touchedIds(changes)
      if (!touched.includes('blk-steps-03')) return fail(`did not target the second checklist (blk-steps-03); touched ${touched.join(',') || '(none)'}`)
      const ch = changes.find((c) => c.op === 'edit' && c.blockId === 'blk-steps-03') as Extract<ModuleChange, { op: 'edit' }> | undefined
      if (!ch) return fail('no edit on the second checklist')
      if (ch.data.type !== 'todo') return fail(`second checklist edit must stay todo, got ${ch.data.type}`)
      const labels = ('items' in ch.data ? ch.data.items : []).map((i) => i.label.toLowerCase())
      if (!labels.some((l) => /preheat|375/.test(l))) return fail('preheat step not present after edit')
    },
  },

  // 7 — metric value: "set progress to 60%" → edit the metric-ring id, pct 0.6.
  {
    name: 'metric value: set progress to 60%',
    ctxData: RECIPE_CTX,
    text: 'set the progress to 60%',
    expectTool: 'propose_changes',
    allowedTouch: ['blk-ring-05'],
    check: ({ changes, fail }) => {
      if (changes.length !== 1) return fail(`expected 1 change, got ${changes.length}`)
      const ch = changes[0]
      if (ch.op !== 'edit' || ch.blockId !== 'blk-ring-05') return fail(`expected edit on blk-ring-05, got ${ch.op} ${'blockId' in ch ? ch.blockId : ''}`)
      if (ch.data.type !== 'metric-ring') return fail(`type must stay metric-ring, got ${ch.data.type}`)
      if (!('pct' in ch.data)) return fail('no pct on ring edit')
      if (Math.abs(ch.data.pct - 0.6) > 1e-6) return fail(`pct should be 0.6, got ${ch.data.pct}`)
    },
  },

  // 8 — GENUINE ambiguity: two similarly-titled text sections, vague "that section".
  //     The steward clarify-guard must hold: NO tool call, ask which one.
  {
    name: 'genuine ambiguity: "reword that section" (two overviews)',
    ctxData: AMBIG_CTX,
    text: 'reword that section to be clearer',
    expectTool: null,
    note: 'two similarly-titled Overview blocks — the model must ask which, not guess.',
  },

  // 9 — both tools, one turn: edit the current page AND make a separate new page.
  //     M1 observed the model doing this legally; pin it.
  {
    name: 'both tools one turn: reword intro + make a separate lasagna recipe page',
    ctxData: RECIPE_CTX,
    text: 'reword the intro to be punchier, and also make a separate page for my carbonara recipe',
    expectTool: 'propose_changes',
    allowedTouch: ['blk-intro-01'],
    check: ({ changes, calls, fail }) => {
      // propose_changes side: an edit on the intro (no collateral).
      const editIntro = changes.find((c) => c.op === 'edit' && c.blockId === 'blk-intro-01')
      if (!editIntro) return fail('no edit on the intro in propose_changes')
      // create_page side: must also be present in the same turn.
      const cp = calls.find((c) => c.toolName === 'create_page')
      if (!cp) return fail('create_page was NOT called in the same turn')
      const input = cp.input as { title?: string; blocks?: unknown[] }
      if (!input.title || !/carbonara/i.test(input.title)) return fail(`create_page title should mention carbonara, got "${input.title}"`)
    },
  },

  // ── adversarial ──
  // 10 — names a block that does NOT exist: no invented ids, sensible behavior.
  //      Acceptable: ask a clarifying question (no tool), OR create the block
  //      (create op, no edit/remove against a fabricated id). A fabricated blockId
  //      on an edit/remove is the failure.
  {
    name: 'adversarial: edit a block that does not exist (no invented ids)',
    ctxData: RECIPE_CTX,
    text: 'update the nutrition-facts table with the new sodium numbers',
    expectTool: null, // primary expectation: clarify (there is no such block)
    check: ({ changes, calls, fail }) => {
      // If it DID call propose_changes, it must not reference a fabricated id.
      if (calls.some((c) => c.toolName === 'propose_changes')) {
        const known = new Set(RECIPE_BLOCKS.map((b) => b.id))
        for (const c of changes) {
          if ('blockId' in c && !known.has(c.blockId)) return fail(`invented a block id: ${c.blockId}`)
        }
        // Editing/removing is wrong here (no such block); only a create would be OK.
        if (changes.some((c) => c.op !== 'create')) return fail('edited/removed against a non-existent block')
      }
    },
    note: 'no nutrition-facts block exists. Clarify (preferred) or create — never edit/remove an invented id.',
  },

  // 11 — adversarial: check off ALL steps at once → single edit, every item checked,
  //      no other block touched.
  {
    name: 'adversarial: check off every step at once',
    ctxData: RECIPE_CTX,
    text: 'mark all the steps as done',
    expectTool: 'propose_changes',
    allowedTouch: ['blk-steps-03'],
    check: ({ changes, fail }) => {
      const ch = changes.find((c) => c.op === 'edit' && c.blockId === 'blk-steps-03') as Extract<ModuleChange, { op: 'edit' }> | undefined
      if (!ch) return fail('no edit on the steps checklist')
      if (ch.data.type !== 'todo') return fail(`must stay todo, got ${ch.data.type}`)
      const items = 'items' in ch.data ? ch.data.items : []
      if (!items.every((i) => i.checked)) return fail('not every step is checked')
      if (items.length !== 3) return fail(`step count changed 3→${items.length}`)
    },
  },

  // 12 — adversarial: remove one specific ingredient item (not the whole block).
  //      Correct = edit the ingredients block with that item gone; NOT a remove of
  //      the whole todo, NOT touching any other block.
  {
    name: 'adversarial: remove one ingredient item (not the whole list)',
    ctxData: RECIPE_CTX,
    text: 'take the marinara sauce off the ingredients — I already have some',
    expectTool: 'propose_changes',
    allowedTouch: ['blk-ingredients-02'],
    check: ({ changes, fail }) => {
      if (changes.length !== 1) return fail(`expected 1 change, got ${changes.length}`)
      const ch = changes[0]
      if (ch.op !== 'edit' || ch.blockId !== 'blk-ingredients-02') return fail(`expected edit on ingredients, got ${ch.op} ${'blockId' in ch ? ch.blockId : ''}`)
      if (ch.data.type !== 'todo') return fail(`must stay todo, got ${ch.data.type}`)
      const labels = ('items' in ch.data ? ch.data.items : []).map((i) => i.label.toLowerCase())
      if (labels.some((l) => /marinara|sauce/.test(l))) return fail('marinara still present')
      if (!labels.includes('ground beef')) return fail('collateral: an unrelated item was dropped')
    },
  },
]

// ── Runner ───────────────────────────────────────────────────────────────────

type Result = { scenario: Scenario; actual: string; pass: boolean; detail: string }

async function runOne(s: Scenario): Promise<Result> {
  // EXACT production wrapping: buildSystemPrompt(context) with the real
  // formatNodeContext(includeBlockIds) block (see route.ts + buildChatContext).
  const context = formatNodeContext(s.ctxData, { includeBlockIds: true })
  const system = buildSystemPrompt(context)

  const result = await generateText({
    model: anthropic(MODEL),
    system,
    prompt: s.text,
    tools,
    toolChoice: 'auto',
    // Deliberately narrower than production's stepCountIs(3): every tool under test
    // is client-resolved (no execute), so all calls — including the both-tools case's
    // two calls — land in the FIRST step; production's extra steps only matter for a
    // fetch_context→answer round-trip, which no editing case exercises. The
    // prompt/context wrapping above IS exact; only the step budget is narrowed.
    stopWhen: stepCountIs(1),
  })

  const calls: ToolCall[] = result.toolCalls.map((c) => ({ toolName: c.toolName, input: c.input }))
  const proposeCall = calls.find((c) => c.toolName === 'propose_changes')
  const changes = proposeCall ? ((proposeCall.input as Batch).changes ?? []) : []

  const names = calls.map((c) => c.toolName)
  const actual = names.length ? names.join('+') : '(no tool)'

  const failures: string[] = []
  const fail = (m: string) => failures.push(m)

  // Routing expectation.
  if (s.expectTool === null) {
    if (calls.some((c) => c.toolName === 'propose_changes' || c.toolName === 'create_page')) {
      // A no-tool expectation still lets adversarial checks decide (case 10 tolerates
      // a create); only fail outright if there's no per-case check to adjudicate.
      if (!s.check) fail(`expected NO tool call, got ${actual}`)
    }
  } else {
    if (!calls.some((c) => c.toolName === s.expectTool)) fail(`expected ${s.expectTool} to be called, got ${actual}`)
  }

  // Surgical-batch invariant — touched ids ⊆ allowedTouch (edit/remove only; creates
  // introduce no existing-id collateral). Runs whenever a batch was emitted and the
  // case declares an allow-list.
  if (proposeCall && s.allowedTouch) {
    const allowed = new Set(s.allowedTouch)
    for (const id of touchedIds(changes)) {
      if (!allowed.has(id)) fail(`SURGICAL: batch touched ${id}, not in allow-list [${s.allowedTouch.join(', ')}]`)
    }
  }

  // Per-case deterministic assertions.
  if (s.check) s.check({ changes, calls, fail })

  const pass = failures.length === 0
  const detail = pass
    ? proposeCall
      ? changes.map((c) => `${c.op}${'blockId' in c ? `:${c.blockId}` : ''}${'data' in c ? `→${c.data.type}` : ''}`).join(' ')
      : actual === '(no tool)'
        ? result.text.replace(/\s+/g, ' ').slice(0, 80)
        : actual
    : failures.join(' | ')
  return { scenario: s, actual, pass, detail }
}

function parseRuns(): number {
  const i = process.argv.indexOf('--runs')
  if (i === -1) return 1
  const n = Number(process.argv[i + 1])
  return Number.isInteger(n) && n > 0 ? n : 1
}

async function runSuite(runIdx: number, total: number): Promise<Result[]> {
  const results: Result[] = []
  for (const s of SCENARIOS) {
    process.stdout.write(`  [run ${runIdx}/${total}] ${s.name} … `)
    try {
      const r = await runOne(s)
      results.push(r)
      console.log(r.pass ? 'PASS' : 'FAIL')
      if (!r.pass) console.log(`      ↳ ${r.detail}`)
    } catch (err) {
      results.push({ scenario: s, actual: 'ERROR', pass: false, detail: (err as Error).message.slice(0, 160) })
      console.log('ERROR')
      console.log(`      ↳ ${(err as Error).message.slice(0, 160)}`)
    }
  }
  return results
}

async function run() {
  const runs = parseRuns()
  const allRuns: Result[][] = []
  for (let i = 1; i <= runs; i++) allRuns.push(await runSuite(i, runs))

  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n))
  console.log('\n' + '═'.repeat(104))
  console.log(`EDITING EVAL — model: ${MODEL}${runs > 1 ? ` — ${runs} full runs` : ''}`)
  console.log('═'.repeat(104))
  console.log(`  ${pad('CASE', 54)} ${pad('EXPECT', 20)} ${runs > 1 ? 'PASS RATE  SAW' : `${pad('SAW', 16)} RESULT`}`)
  console.log('  ' + '─'.repeat(100))

  let totalPass = 0
  let totalCells = 0
  for (let s = 0; s < SCENARIOS.length; s++) {
    const perRun = allRuns.map((r) => r[s])
    const passes = perRun.filter((r) => r.pass).length
    totalPass += passes
    totalCells += perRun.length
    const expect = SCENARIOS[s].expectTool ?? '(no tool)'
    if (runs > 1) {
      const saw = [...new Set(perRun.map((r) => r.actual))].join(', ')
      const flaky = passes > 0 && passes < runs ? '  ← FLAKY' : ''
      console.log(`  ${pad(SCENARIOS[s].name, 54)} ${pad(expect, 20)} ${passes}/${runs}        ${saw}${flaky}`)
      // Surface the first failing detail per case so the table is self-explaining.
      const firstFail = perRun.find((r) => !r.pass)
      if (firstFail) console.log(`      ↳ ${firstFail.detail}`)
    } else {
      const r = perRun[0]
      console.log(`  ${pad(SCENARIOS[s].name, 54)} ${pad(expect, 20)} ${pad(r.actual, 16)} ${r.pass ? 'PASS' : 'FAIL'}`)
      console.log(`      ↳ ${r.detail}`)
    }
  }

  console.log('\n' + '═'.repeat(104))
  console.log(`SUMMARY: ${totalPass}/${totalCells} case-executions passed` + (runs > 1 ? ` across ${runs} full runs` : ''))
  console.log('═'.repeat(104) + '\n')
  process.exit(totalPass === totalCells ? 0 : 1)
}

run()
