/**
 * Routing eval — PERMANENT, repeatable. (M0; grew out of scripts/proto-routing.mts.)
 *
 * Asserts that Pond's chat routing does what production actually runs: it imports
 * the REAL system prompt (`buildSystemPrompt`) and the REAL tool descriptions +
 * input schemas from the app source (src/app/api/chat/{prompt,tools}.ts), so a
 * prompt or schema change is tested here without duplication.
 *
 * As of M1 the real `create_page` tool + its production routing guidance live in the
 * app source, so this eval imports both — no simulated tool, no eval-only prompt line.
 *
 * Each case has a deterministic assertion — which tool the model must call, or that
 * it must call NO tool. The steward persona is under test as much as the create fix:
 * over-eager tool-calling on non-explicit ("musing") language is a FAILURE.
 *
 * Run:        node --env-file=.env.local scripts/eval-routing.mts
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
  configureViewTool,
  defineSchemaTool,
  addRowTool,
} from '../src/app/api/chat/tools.ts'
// The SAME heuristics the emit-time gate enforces (ticket-21) — imported, not
// re-implemented, so the eval's tells and the gate can't drift.
import { isMarkdownPipeTable, isTitleEchoHeading } from '../src/lib/modules/authoring-lint.ts'

const MODEL = AI_MODELS.standard // the app default (claude-sonnet-4-6)

const tools = {
  create_page: tool(createPageTool),
  propose_changes: tool(proposeChangesTool),
  fetch_context: tool(fetchContextTool),
  configure_view: tool(configureViewTool),
  // #28: the record-vs-matrix routing split needs define_schema / add_row on the
  // table so a record-like ask can resolve to a collection (production registers
  // every tool; this eval previously simulated only four).
  define_schema: tool(defineSchemaTool),
  add_row: tool(addRowTool),
}

/** Expected outcome: a specific tool name, or null = the model must call NO tool. */
type Expect = keyof typeof tools | null

type Scenario = {
  name: string
  expect: Expect
  ctx: string
  text: string
  note?: string
  /** For create_page cases: assert the emitted `type` field (e.g. 'project'). */
  expectType?: string
  /** For create_page cases: assert `parentTitle` contains this (case-insensitive). */
  expectParent?: string
  /** For create_page cases: assert `parentTitle` is ABSENT (explicit top-level). */
  expectNoParent?: boolean
  /** For create_page cases: assert at least one proposed block of this type (M3). */
  expectBlockType?: string
  /** For create_page cases: assert NO text block smuggles a markdown table (M3). */
  expectNoMdTableInText?: boolean
  /** For create_page cases: assert the FIRST block is not a heading echoing the
   *  page title (ticket-21 — AI authoring discipline). */
  expectNoTitleEcho?: boolean
}

// The 8 original proto cases (two of them — the ambiguous index case and the
// create-project collision — carry the routing verdicts the proto observed), plus
// the bug case, plus adversarial variants that guard the steward persona.
const SCENARIOS: Scenario[] = [
  // ── proto's 8 ──
  {
    name: 'pure chat (no tool)',
    expect: null,
    ctx: 'The user is on their Home view. No current page.',
    text: "I've been meaning to cook more Italian food lately.",
  },
  {
    name: 'edit current page (reword)',
    expect: 'propose_changes',
    ctx: 'Current page "Chicken Parmesan". Blocks: [text id=b1 "# Chicken Parmesan\\nA classic..."], [todo id=b2 ingredients].',
    text: 'reword the intro to sound more casual',
  },
  {
    name: 'add content to current page',
    expect: 'propose_changes',
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
    name: 'new page while ON another page (explicit "separate") [the BUG case]',
    expect: 'create_page',
    ctx: 'Current page "Chicken Parmesan". Blocks: [text id=b1 intro], [todo id=b2 ingredients].',
    text: 'create a separate page for my lasagna recipe',
    note: 'proto stalled here with a clarifying question. Must now produce create_page.',
  },
  {
    name: '"add a recipe" while on an index page → AMBIGUOUS (edit index vs new page)',
    // Genuinely ambiguous: append to the index in place (propose_changes) OR mint a
    // Lasagna recipe page under Recipes (create_page) are BOTH defensible. M1-era runs
    // resolved it propose_changes 10/10 and it was pinned to that; as of #28 (claude-
    // sonnet-4-6, full tool table incl. define_schema/add_row) it resolves create_page
    // 3/3. Rather than re-pin a moving target on an inherently ambiguous case, accept
    // any defensible resolution — this is what the AMBIGUOUS mode exists for.
    expect: 'AMBIGUOUS' as unknown as Expect,
    ctx: 'Current page "Recipes" (a text index of recipe links). Blocks: [text id=b1 "# My Recipes\\n- Chicken Parm\\n- Carbonara"].',
    text: 'add a recipe for lasagna',
  },
  {
    name: 'MERGED "create a project" → create_page (type=project)',
    expect: 'create_page',
    expectType: 'project',
    ctx: 'The user is on their Home view. No current page.',
    text: 'create a new project called Website Redesign',
    note: 'M1: one merged create tool — structural creation now goes through create_page and gets scaffolded content too.',
  },
  {
    name: 'recall from workspace',
    expect: 'fetch_context',
    ctx: 'The user is on their Home view. No current page.',
    text: 'what have I written about my trip to Japan?',
  },

  // ── adversarial variants (steward persona must survive the create fix) ──
  {
    name: 'ADV explicit "make me a page" mid-conversation → must act',
    expect: 'create_page',
    ctx: 'Current page "Reading Log". Blocks: [text id=b1 "Books I finished this year"].',
    text: 'Actually, make me a separate page about my 2026 reading goals.',
  },
  {
    name: 'ADV musing that MENTIONS creating → must NOT tool-call',
    expect: null,
    ctx: 'Current page "Woodworking". Blocks: [text id=b1 "Bench build notes"].',
    text: "Hmm, maybe I should make a page for all my jigs someday. Not sure yet.",
    note: 'passing mention, not a request. Steward stays in conversation.',
  },
  {
    name: 'ADV explicit edit request → must route to propose_changes',
    expect: 'propose_changes',
    ctx: 'Current page "Sourdough". Blocks: [text id=b1 intro], [metric id=b2 "hydration" 72 "%"].',
    text: 'bump the hydration metric to 78%',
  },
  {
    name: 'ADV pure venting/chat → must stay chat',
    expect: null,
    ctx: 'The user is on their Home view. No current page.',
    text: "Ugh, today was exhausting. I just need to complain for a second.",
  },
  {
    name: 'ADV explicit "make this a project" → create_page (type=project)',
    expect: 'create_page',
    expectType: 'project',
    ctx: 'Current page "Kitchen Renovation" (a loose note). Blocks: [text id=b1 "ideas for the reno"].',
    text: 'turn this into a project called Kitchen Renovation',
    note: 'M1: structural creation → create_page with type=project (merged create tool).',
  },
  {
    name: 'NEW placement "make a page for X in my Personal area" → parentTitle≈Personal',
    expect: 'create_page',
    expectParent: 'personal',
    ctx: 'The user is on their Home view. No current page. Their areas include Personal, Health, and Finances.',
    text: 'make a page for my 2026 reading goals in my Personal area',
    note: 'M1: the model should propose parentTitle matching the named area.',
  },
  {
    name: 'ADV explicit "add a checklist" → propose_changes',
    expect: 'propose_changes',
    ctx: 'Current page "Camping Trip". Blocks: [text id=b1 "Packing thoughts"].',
    text: 'add a packing checklist',
  },
  {
    name: 'NEW inference: new page while ON an area → parentTitle≈current area',
    expect: 'create_page',
    expectParent: 'woodworking',
    ctx: '[Current node]\nArea: Woodworking\nDocuments:\n  - "Woodworking": Shop notes and bench build log.',
    text: 'create an inventory page for my workshop tools',
    note: 'lesser-finding 1: no destination named — the model must infer the current area, not default to top-level.',
  },
  {
    name: 'NEW inference: on Home, outline names the area → parentTitle inferred',
    expect: 'create_page',
    expectParent: 'woodworking',
    ctx: 'The user is on their Home view. No current page.\n\n[Workspace outline] (existing pages a new page could live under)\n- Area: Personal\n- Area: Health\n- Area: Creativity\n  - Area: Woodworking',
    text: 'make an inventory page for my woodworking tools',
    note: 'lesser-finding 1: from Home the outline is the only placement signal; the model must use it.',
  },
  {
    name: 'NEW guard: explicit top-level request → NO parentTitle',
    expect: 'create_page',
    expectNoParent: true,
    ctx: 'The user is on their Home view. No current page.\n\n[Workspace outline] (existing pages a new page could live under)\n- Area: Personal\n- Area: Health\n- Area: Creativity',
    text: 'make a top-level page called Scratchpad',
    note: 'inference must not override an explicit top-level request.',
  },
  {
    name: 'NEW M3 inventory page → create_page WITH a table block',
    expect: 'create_page',
    expectBlockType: 'table',
    expectNoMdTableInText: true,
    ctx: 'The user is on their Home view. No current page.',
    text: 'make an inventory page for my workshop tools',
    note: 'M3: inventories must scaffold a real table block, never a markdown table faked inside a text block.',
  },

  // ── ticket-21: AI authoring discipline (structure over markdown) ──
  {
    name: 'T21 reading list → real table, no md table, no title echo',
    expect: 'create_page',
    expectBlockType: 'table',
    expectNoMdTableInText: true,
    expectNoTitleEcho: true,
    ctx: 'The user is on their Home view. No current page.',
    text: 'make me a fall reading list page — a table of books with title, author, and status',
    note: 'ticket-21: tabular data → table module; the first block must not echo the "Fall Reading List" title as a heading.',
  },
  {
    name: 'T21 comparison content → table module, not a pipe table in text',
    expect: 'create_page',
    expectBlockType: 'table',
    expectNoMdTableInText: true,
    ctx: 'The user is on their Home view. No current page.',
    text: 'create a page comparing three standing desks — name, height range, and price for each',
    note: 'ticket-21: a comparison is tabular; it must land as a table module, never markdown pipes inside a text block.',
  },
  {
    name: 'T21 simple note page → no title-echo heading as first block',
    expect: 'create_page',
    expectNoTitleEcho: true,
    ctx: 'The user is on their Home view. No current page.',
    text: 'make me a page called Japan Trip Ideas for jotting down places to visit',
    note: 'ticket-21: even a plain note page must not open with a "## Japan Trip Ideas" heading echoing its own title.',
  },
  {
    name: '#19 slice 5: show a collection as a board → configure_view (not add_row / propose_changes)',
    expect: 'configure_view',
    ctx: 'The user is on their Tasks page — a collection.\nProperties: Status (status: To do | Doing | Done) · Due (date)\n[Workspace outline]\n- [coll-tasks] Page: Tasks',
    text: 'show my tasks as a board grouped by status',
    note: '#19: selecting a layout for an existing collection is configure_view — not add_row (adds an item), define_schema (defines columns), or propose_changes (edits blocks).',
  },

  // ── #28: routing demotion — record-like tabular defaults to a collection,
  //         freeform matrix / explicit "table" stays the table block ──
  {
    name: '#28 record-like "track my reading list with status and rating" → define_schema',
    expect: 'define_schema',
    ctx: 'Current page "Reading List". Blocks: [text id=b1 "- Dune\\n- The Hobbit\\n- Project Hail Mary"].',
    text: 'track my reading list with status and rating',
    note: '#28: a list of records to track defaults to a collection (define_schema), not a freeform table — even without the word "database".',
  },
  {
    name: '#28 record-like "track my workouts here — date, exercise, weight" → define_schema',
    expect: 'define_schema',
    ctx: 'Current page "Workout Log". Blocks: [text id=b1 "training notes"].',
    text: 'track my workouts here — date, exercise, sets, and weight for each',
    note: '#28: a log the user tracks is record-like → collection, not a table block appended via propose_changes.',
  },
  {
    name: '#28 freeform matrix "compare Free / Pro / Enterprise across features" → table',
    expect: 'create_page',
    expectBlockType: 'table',
    expectNoMdTableInText: true,
    ctx: 'The user is on their Home view. No current page.',
    text: 'make a page comparing Free, Pro, and Enterprise across these features: price, seats, SSO, and support',
    note: '#28: a comparison across options is a freeform matrix → table block (the escape hatch), not a collection.',
  },
  {
    name: '#28 reference grid "keyboard shortcuts cheat sheet" → table',
    expect: 'create_page',
    expectBlockType: 'table',
    expectNoMdTableInText: true,
    ctx: 'The user is on their Home view. No current page.',
    text: 'make me a keyboard shortcuts cheat sheet for VS Code',
    note: '#28: a reference / cheat-sheet grid is freeform → table block, not a collection.',
  },
]

type Result = {
  scenario: Scenario
  actual: string // tool name or '(no tool)'
  pass: boolean
  detail: string
}

async function runOne(s: Scenario): Promise<Result> {
  const result = await generateText({
    model: anthropic(MODEL),
    system: `${buildSystemPrompt()}\n\nUse the following context about the user's workspace when relevant.\n\n${s.ctx}`,
    prompt: s.text,
    tools,
    toolChoice: 'auto',
    stopWhen: stepCountIs(1),
  })
  const call = result.toolCalls[0]
  const actual = call ? call.toolName : '(no tool)'
  const detail = call
    ? JSON.stringify(call.input).slice(0, 120)
    : result.text.replace(/\s+/g, ' ').slice(0, 90)

  let pass: boolean
  if ((s.expect as unknown as string) === 'AMBIGUOUS') {
    // Any defensible resolution: a new page, an edit, or a clarifying no-tool turn.
    pass = actual === 'create_page' || actual === 'propose_changes' || actual === '(no tool)'
  } else if (s.expect === null) {
    pass = actual === '(no tool)'
  } else {
    pass = actual === s.expect
    // For create_page cases, also assert the shape the milestone requires.
    const input = (call?.input ?? {}) as {
      type?: string
      title?: string
      parentTitle?: string
      blocks?: Array<{ type?: string; content?: string }>
    }
    if (pass && s.expectType) pass = input.type === s.expectType
    if (pass && s.expectParent) {
      pass = (input.parentTitle ?? '').toLowerCase().includes(s.expectParent.toLowerCase())
    }
    if (pass && s.expectNoParent) pass = !input.parentTitle
    if (pass && s.expectBlockType) {
      pass = (input.blocks ?? []).some((b) => b.type === s.expectBlockType)
    }
    if (pass && s.expectNoMdTableInText) {
      pass = !(input.blocks ?? []).some(
        (b) => b.type === 'text' && isMarkdownPipeTable(b.content ?? '')
      )
    }
    if (pass && s.expectNoTitleEcho) {
      // The first block must not be a heading echoing the page title (ticket-21).
      const first = (input.blocks ?? [])[0]
      pass = !(
        first?.type === 'text' &&
        isTitleEchoHeading(first.content ?? '', input.title ?? '')
      )
    }
  }
  return { scenario: s, actual, pass, detail }
}

function fmtExpect(e: Expect): string {
  if ((e as unknown as string) === 'AMBIGUOUS') return 'create_page|propose_changes|no-tool'
  return e === null ? '(no tool)' : e
}

/** `--runs N` → run the FULL suite N times (honest flake measurement). Default 1. */
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
    } catch (err) {
      results.push({
        scenario: s,
        actual: 'ERROR',
        pass: false,
        detail: (err as Error).message.slice(0, 120),
      })
      console.log('ERROR')
    }
  }
  return results
}

async function run() {
  const runs = parseRuns()
  const allRuns: Result[][] = []
  for (let i = 1; i <= runs; i++) {
    allRuns.push(await runSuite(i, runs))
  }

  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n))
  console.log('\n' + '═'.repeat(100))
  console.log(`ROUTING EVAL — model: ${MODEL}${runs > 1 ? ` — ${runs} full runs` : ''}`)
  console.log('═'.repeat(100))
  console.log(
    `  ${pad('CASE', 52)} ${pad('EXPECT', 26)} ${runs > 1 ? 'PASS RATE  SAW' : `${pad('ACTUAL', 16)} RESULT`}`,
  )
  console.log('  ' + '─'.repeat(96))

  let totalPass = 0
  let totalCells = 0
  for (let s = 0; s < SCENARIOS.length; s++) {
    const perRun = allRuns.map((r) => r[s])
    const passes = perRun.filter((r) => r.pass).length
    totalPass += passes
    totalCells += perRun.length
    if (runs > 1) {
      const saw = [...new Set(perRun.map((r) => r.actual))].join(', ')
      const flaky = passes > 0 && passes < runs ? '  ← FLAKY' : ''
      console.log(
        `  ${pad(SCENARIOS[s].name, 52)} ${pad(fmtExpect(SCENARIOS[s].expect), 26)} ${passes}/${runs}        ${saw}${flaky}`,
      )
    } else {
      const r = perRun[0]
      console.log(
        `  ${pad(SCENARIOS[s].name, 52)} ${pad(fmtExpect(SCENARIOS[s].expect), 26)} ${pad(r.actual, 16)} ${r.pass ? 'PASS' : 'FAIL'}`,
      )
      if (!r.pass) console.log(`      ↳ ${r.detail}`)
    }
  }

  console.log('\n' + '═'.repeat(100))
  console.log(
    `SUMMARY: ${totalPass}/${totalCells} case-executions passed` +
      (runs > 1 ? ` across ${runs} full runs` : ''),
  )
  console.log('═'.repeat(100) + '\n')

  process.exit(totalPass === totalCells ? 0 : 1)
}

run()
