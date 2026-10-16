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
  suggestFollowupsTool,
} from '../src/app/api/chat/tools.ts'
// The SAME heuristics the emit-time gate enforces (ticket-21) — imported, not
// re-implemented, so the eval's tells and the gate can't drift.
import { isMarkdownPipeTable, isTitleEchoHeading } from '../src/lib/modules/authoring-lint.ts'
// The SAME deterministic [Scoping] note the chat route injects — imported, not
// re-implemented, so the eval reproduces production's grill-before-build floor.
import { scopingContextNote } from '../src/app/api/chat/scoping.ts'
// The SAME deterministic [Rejected] note the chat route injects — imported, not
// re-implemented, so the eval reproduces production's no-retry floor (KAN-132).
import { rejectedContextNote } from '../src/app/api/chat/rejected.ts'

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
  // KAN-132: the unclear→chip rule routes through suggest_followups instead of
  // propose_changes, so the eval needs the real chip tool registered to observe it.
  suggest_followups: tool(suggestFollowupsTool),
}

/** Expected outcome: a specific tool name, or null = the model must call NO tool. */
type Expect = keyof typeof tools | null

type Scenario = {
  name: string
  expect: Expect
  ctx: string
  text: string
  note?: string
  /**
   * Multi-turn (grill-before-build): the user's turn-2 answer. When present the
   * scenario is a GRILL case — turn 1 must ask (no tool + a question probing the
   * expected intent gaps), and the `expect`/`expectType`/`expect*` shape checks
   * apply to TURN 2 (after this answer is sent). Mirrors production: the route
   * injects the [Scoping] note on turn 1, so the model grills; the answer then
   * lands the build. Absent → single-turn (assertions apply to turn 1).
   */
  followup?: string
  /**
   * Turn-1 probe (multi-turn only, §6 decision 3): the T1 reply must contain a
   * question ("?") AND at least one of these keywords (case-insensitive) — a
   * lenient OR so a rephrase doesn't flake, while still checking the grill
   * probes the RIGHT intent gaps rather than asking something generic.
   *
   * Each list is the union of two on-topic vocabularies observed in real grills:
   * (a) the scenario's specific intent nouns (servings/tiers/desks/shortcuts) and
   * (b) generic scoping framings the model legitimately opens with — goal,
   * purpose, use, or a restatement of the artifact type ("reference/cheat-sheet
   * grid", "comparison table"). Turn-1 flakes at --runs 5 were all (b)-framings
   * the narrow noun-lists missed; the additions are still on-topic, never filler
   * ("the"/"for"/"you") that would reduce the check to "asked any question."
   */
  turn1Probe?: RegExp
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
  /** Multi-turn only: a genuinely trivial named page (e.g. a blank Scratchpad)
   *  where building immediately on turn 1 — skipping the grill — is ALSO
   *  defensible. When set, T1 may either build (judged directly) or grill-then-
   *  build. Used sparingly for the truly-nothing-to-scope case. */
  grillOptional?: boolean
  /** For no-tool cases carrying a suggest_followups chip (KAN-132 intent
   *  rule): assert at least one chip offered this turn names the edit this
   *  regex describes. A chip is not itself a routing decision — see
   *  `primaryCall` — so this is checked against the turn's pooled chips,
   *  never against `actual`. */
  expectChipNaming?: RegExp
  /** For propose_changes / collection-tool cases (KAN-132 assumption rule):
   *  assert the reply's prose is exactly one sentence stating the assumption
   *  (not merely describing the action). */
  expectOneAssumptionSentence?: boolean
  /** For no-tool cases carrying a [Rejected] note (KAN-132 no-retry rule):
   *  fail if any chip offered this turn names the rejected edit — the edit
   *  must not come back as a suggest_followups chip either. Mirrors
   *  `expectChipNaming`, checked the same way against the pooled chips. */
  forbidChipNaming?: RegExp
}

/** A decisive turn-2/3 answer the harness sends if the model grills a SECOND
 *  round: real users answer once or twice, so the build must land within two
 *  answer rounds (adaptive grill, not an infinite questionnaire). Not the escape
 *  hatch — it answers the follow-up and signals readiness. */
const CLOSER_ANSWER = "That's everything I need — go ahead and build it now."

// The 8 original proto cases (two of them — the ambiguous index case and the
// create-project collision — carry the routing verdicts the proto observed), plus
// the bug case, plus adversarial variants that guard the steward persona.
const ALL_SCENARIOS: Scenario[] = [
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
    name: 'GRILL new recipe page, from Home → asks intent, then create_page',
    expect: 'create_page',
    ctx: 'The user is on their Home view. No current page.',
    text: 'make me a recipe page for lasagna',
    followup:
      "It's just for me — a classic meat lasagna, about 4 servings. Standard ingredients are fine.",
    turn1Probe:
      /serving|people|ingredient|dietar|meat|vegetarian|prefer|how many|classic|style|kind|goal|purpose|cook|meal|dish|occasion|use/i,
    note: 'grill-before-build: even a named subject grills one intent question (servings/style/how it will be used) before building on turn 2.',
  },
  {
    name: 'GRILL separate recipe page while ON another page → asks, then create_page',
    expect: 'create_page',
    ctx: 'Current page "Chicken Parmesan". Blocks: [text id=b1 intro], [todo id=b2 ingredients].',
    text: 'create a separate page for my lasagna recipe',
    followup: 'Classic meat lasagna, 4 servings — standard ingredients and steps.',
    turn1Probe:
      /serving|ingredient|dietar|meat|vegetarian|prefer|how many|style|classic|kind|goal|purpose|cook|meal|dish|occasion|use/i,
    note: 'the old #59 BUG case (proto stalled) inverts under grill-first: turn 1 SHOULD ask, turn 2 builds the separate page.',
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
    name: 'GRILL "create a project" → asks intent, then create_page (type=project)',
    expect: 'create_page',
    expectType: 'project',
    ctx: 'The user is on their Home view. No current page.',
    text: 'create a new project called Website Redesign',
    followup:
      'Goal is to modernize our marketing site and lift conversion. Solo, roughly a 6-week timeline.',
    turn1Probe: /goal|scope|why|deadline|timeline|audience|redesign|priorit|who|when|what/i,
    note: 'a named project grills goals/scope first (LIFECYCLE), then scaffolds create_page with type=project on turn 2.',
  },
  {
    name: 'recall from workspace',
    expect: 'fetch_context',
    ctx: 'The user is on their Home view. No current page.',
    text: 'what have I written about my trip to Japan?',
  },

  // ── adversarial variants (steward persona must survive the create fix) ──
  {
    name: 'ADV GRILL explicit "make me a page" mid-conversation → asks, then create_page',
    expect: 'create_page',
    ctx: 'Current page "Reading Log". Blocks: [text id=b1 "Books I finished this year"].',
    text: 'Actually, make me a separate page about my 2026 reading goals.',
    followup: 'Just a place to jot goals — I want to read 30 books, more nonfiction this year.',
    turn1Probe: /goal|book|how many|target|genre|nonfiction|track|why|what|read|kind/i,
    note: 'still an explicit build, still grilled first — turn 1 asks what the goals are, turn 2 mints the page.',
  },
  {
    name: 'ADV musing that MENTIONS creating → must NOT tool-call',
    expect: null,
    ctx: 'Current page "Woodworking". Blocks: [text id=b1 "Bench build notes"].',
    text: 'Hmm, maybe I should make a page for all my jigs someday. Not sure yet.',
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
    text: 'Ugh, today was exhausting. I just need to complain for a second.',
  },
  {
    name: 'ADV GRILL "turn this into a project" → asks, then create_page (type=project)',
    expect: 'create_page',
    expectType: 'project',
    ctx: 'Current page "Kitchen Renovation" (a loose note). Blocks: [text id=b1 "ideas for the reno"].',
    text: 'turn this into a project called Kitchen Renovation',
    followup:
      'Goal is a full reno by spring — budget around 30k, main rooms are the kitchen and dining.',
    turn1Probe: /goal|scope|budget|room|timeline|when|why|priorit|phase|what/i,
    note: '§6 decision 4: an in-place structural conversion grills too — turn 1 asks goals/budget, turn 2 scaffolds type=project.',
  },
  {
    name: 'GRILL placement "make a page for X in my Personal area" → asks, then parentTitle≈Personal',
    expect: 'create_page',
    expectParent: 'personal',
    ctx: 'The user is on their Home view. No current page. Their areas include Personal, Health, and Finances.',
    text: 'make a page for my 2026 reading goals in my Personal area',
    followup: 'Just my reading targets for the year — 30 books, more nonfiction.',
    turn1Probe: /goal|book|how many|target|genre|track|what|read|why|kind/i,
    note: 'placement was named on turn 1, so turn 2 still proposes parentTitle≈Personal after the intent answer.',
  },
  {
    name: 'ADV explicit "add a checklist" → propose_changes',
    expect: 'propose_changes',
    ctx: 'Current page "Camping Trip". Blocks: [text id=b1 "Packing thoughts"].',
    text: 'add a packing checklist',
  },
  {
    name: 'GRILL inference: new page while ON an area → asks, then parentTitle≈current area',
    expect: 'create_page',
    expectParent: 'woodworking',
    ctx: '[Current node]\nArea: Woodworking\nDocuments:\n  - "Woodworking": Shop notes and bench build log.',
    text: 'create an inventory page for my workshop tools',
    followup: 'Hand tools and power tools — track the name, category, and condition of each.',
    turn1Probe: /tool|track|categor|kind|type|condition|what|organi|store|use/i,
    note: 'placement is NOT in the answer, so turn 2 must still infer the current area (Woodworking), not default to top-level.',
  },
  {
    name: 'GRILL inference: on Home, outline names the area → asks, then parentTitle inferred',
    expect: 'create_page',
    expectParent: 'woodworking',
    ctx: 'The user is on their Home view. No current page.\n\n[Workspace outline] (existing pages a new page could live under)\n- Area: Personal\n- Area: Health\n- Area: Creativity\n  - Area: Woodworking',
    text: 'make an inventory page for my woodworking tools',
    followup: 'Hand and power tools — track name, category, and condition.',
    turn1Probe: /tool|track|categor|kind|type|condition|what|organi|store|use/i,
    note: 'from Home the outline is the only placement signal; turn 2 must use it (→ Woodworking) after the intent answer.',
  },
  {
    name: 'GRILL states WHERE: create → turn 1 names the inferred home, then parentTitle',
    expect: 'create_page',
    expectParent: 'personal',
    ctx: 'The user is on their Home view. No current page.\n\n[Workspace outline] (existing pages a new page could live under)\n- Area: Personal\n- Area: Health\n- Area: Finances',
    text: 'create a reading list',
    followup: 'Just books I want to read — keep it simple.',
    // SPEC-grill-asks-where: the T1 grill must RAISE placement — either STATE the inferred
    // home ("I'll put this under Personal…") or ask where — not decide it silently. The
    // probe is placement-only on purpose (the intent "?" is what makes it a question).
    turn1Probe: /personal|where|live|under|area|top.?level|put|place|home|belong/i,
    note: 'SPEC-grill-asks-where: scoping a new page includes its home — turn 1 states the inferred placement (reading list → Personal) or asks when unsure; turn 2 carries it into parentTitle.',
  },
  {
    name: 'GRILL guard: explicit top-level request → asks, then NO parentTitle',
    expect: 'create_page',
    expectNoParent: true,
    ctx: 'The user is on their Home view. No current page.\n\n[Workspace outline] (existing pages a new page could live under)\n- Area: Personal\n- Area: Health\n- Area: Creativity',
    text: 'make a top-level page called Scratchpad',
    followup: 'Just a quick scratch space for random notes — nothing structured.',
    turn1Probe: /for|use|scratch|kind|what|note|structur|jot/i,
    grillOptional: true,
    note: 'a blank Scratchpad has nothing to scope, so building on turn 1 is defensible; either way inference must not override the explicit top-level request (no parentTitle).',
  },
  {
    name: 'GRILL M3 inventory page → asks, then create_page WITH a table block',
    expect: 'create_page',
    expectBlockType: 'table',
    expectNoMdTableInText: true,
    ctx: 'The user is on their Home view. No current page.',
    text: 'make an inventory page for my workshop tools',
    followup: 'Hand tools and power tools — track name, category, and condition for each.',
    turn1Probe: /tool|track|categor|kind|type|condition|what|organi|store|use/i,
    note: 'M3: after the grill, the inventory scaffolds a real table block, never a markdown table faked inside a text block.',
  },

  // ── ticket-21: AI authoring discipline (structure over markdown) ──
  {
    name: 'T21 GRILL reading list (columns given) → asks intent, then real table, no md, no echo',
    expect: 'create_page',
    expectBlockType: 'table',
    expectNoMdTableInText: true,
    expectNoTitleEcho: true,
    ctx: 'The user is on their Home view. No current page.',
    text: 'make me a fall reading list page — a table of books with title, author, and status',
    followup: "Start it empty — I'll add books myself. Sorting by status is fine.",
    turn1Probe: /book|which|start|sort|read|genre|purpose|track|what|add|empty/i,
    note: '§6 decision 1: columns are given, so turn 1 asks the remaining INTENT (which books / how to sort), not "what columns?"; turn 2 builds a real table with no title-echo.',
  },
  {
    name: 'T21 GRILL comparison content → asks, then table module, not a pipe table in text',
    expect: 'create_page',
    expectBlockType: 'table',
    expectNoMdTableInText: true,
    ctx: 'The user is on their Home view. No current page.',
    text: 'create a page comparing three standing desks — name, height range, and price for each',
    followup: "The three I'm comparing are the Uplift V2, Fully Jarvis, and Autonomous SmartDesk.",
    turn1Probe:
      /desk|which|compare|budget|priorit|need|criteria|start|what|model|goal|purpose|use|column|spec|option|feature/i,
    note: 'ticket-21 + grill: turn 1 asks which desks; turn 2 lands the comparison as a table module, never markdown pipes.',
  },
  {
    name: 'T21 GRILL simple note page → asks, then no title-echo heading as first block',
    expect: 'create_page',
    expectNoTitleEcho: true,
    ctx: 'The user is on their Home view. No current page.',
    text: 'make me a page called Japan Trip Ideas for jotting down places to visit',
    followup: 'Tokyo and Kyoto for now — mostly food spots and temples.',
    turn1Probe: /place|visit|when|region|interest|activ|what|trip|kind|cit/i,
    note: 'ticket-21 + grill: turn 1 asks what to jot; turn 2 must not open with a "## Japan Trip Ideas" heading echoing its own title.',
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
    name: '#28 GRILL freeform matrix "compare Free / Pro / Enterprise" → asks, then table',
    expect: 'create_page',
    expectBlockType: 'table',
    expectNoMdTableInText: true,
    grillOptional: true,
    ctx: 'The user is on their Home view. No current page.',
    text: 'make a page comparing Free, Pro, and Enterprise across these features: price, seats, SSO, and support',
    followup: 'Those four features are all I need — just lay the three tiers out side by side.',
    turn1Probe:
      /feature|which|compare|price|priorit|detail|what|across|tier|plan|column|row|dimension|axis|option/i,
    // AMBIGUOUS by design: both axes (3 tiers × 4 features) are fully enumerated, so the
    // don't-re-ask rule makes building on T1 defensible — grillOptional accepts EITHER a
    // T1 build (still shape-checked → table, not collection) OR a T1 grill then T2 table.
    note: '#28 + grill: fully-enumerated matrix may build on T1 or grill first; either way lands a table block, not a collection.',
  },
  {
    name: '#28 GRILL reference grid "keyboard shortcuts cheat sheet" → asks, then table',
    expect: 'create_page',
    expectBlockType: 'table',
    expectNoMdTableInText: true,
    ctx: 'The user is on their Home view. No current page.',
    text: 'make me a keyboard shortcuts cheat sheet for VS Code',
    followup: 'The ones I use most — editing, navigation, and search shortcuts.',
    turn1Probe:
      /shortcut|which|command|frequent|use|categor|action|what|editor|cover|reference|cheat|sheet|grid|platform|app|os|list/i,
    note: '#28 + grill: turn 1 asks which shortcuts; turn 2 lands a reference grid → table block, not a collection.',
  },

  // ── #63: the table Pond says it needs must materialize in THIS turn ──
  // Captured live repro (2026-09-10): both prompts produced a create_page whose
  // prose referenced the table ("Add a row per task…", "one row per exercise")
  // but whose blocks carried NO table — a prose-only shell. define_schema has no
  // target (the page doesn't exist yet) and the turn ends at the client-resolved
  // create_page call, so the structure must be scaffolded NOW as a table block.
  {
    name: '#63 GRILL new tracker from Home → asks, then create_page WITH a table block',
    expect: 'create_page',
    expectBlockType: 'table',
    expectNoMdTableInText: true,
    ctx: 'The user is on their Home view. No current page.\n\n[Workspace outline] (existing pages a new page could live under)\n- [a1] Area: Personal\n- [a2] Area: Health\n- [a3] Area: Finances',
    text: 'set up a tracker for my house maintenance tasks — each one has a status, a cost estimate, and a deadline',
    followup:
      'Things like HVAC service, gutter cleaning, and the water heater — status, cost estimate, and deadline per task is right.',
    turn1Probe: /task|maintenance|home|which|track|priorit|schedule|what|kind|how often/i,
    note: '#63 + grill: no tracker page exists, so after the grill the named fields must land as table columns on turn 2, never a shell promising rows later.',
  },
  {
    name: '#63 GRILL "start a workout log" → asks, then create_page WITH a table block',
    expect: 'create_page',
    expectBlockType: 'table',
    expectNoMdTableInText: true,
    ctx: 'The user is on their Home view. No current page.',
    text: 'start a workout log for me — I want to record date, exercise, sets, and weight',
    followup:
      'Strength training, four days a week — date, exercise, sets, and weight is all I need to record.',
    turn1Probe: /goal|experience|equipment|day|week|exercise|injur|record|track|what|kind/i,
    note: '#63 + grill: after the grill, the brand-new log page is born with its table (date/exercise/sets/weight as columns) on turn 2.',
  },

  // ── KAN-132: unclear → chip (never a card), clear edit → one assumption sentence ──
  {
    name: 'unclear instruction → chip, no card',
    expect: null,
    expectChipNaming: /electrician.*(w\/c )?6 oct|move the electrician/i,
    ctx: 'Current page "Kitchen Renovation". Blocks: [text id=b1 "Electrician visit: w/c 29 Sep. Cabinet measurement: w/c 22 Sep."], [todo id=b2 reno tasks].',
    text: 'the electrician might need to move to w/c 6 oct',
    note: 'STEWARD: a passing remark that merely mentions a possible change is not a request — no clarifying question, no propose_changes; answer in prose, then offer the edit as ONE suggest_followups chip naming it.',
  },
  {
    name: 'clear edit → card plus one assumption sentence',
    expect: 'propose_changes',
    expectOneAssumptionSentence: true,
    ctx: 'Current page "Kitchen Renovation". Blocks: [text id=b1 "Electrician visit: w/c 29 Sep. Cabinet measurement: w/c 22 Sep."], [todo id=b2 reno tasks].',
    text: 'push the electrician out by a week',
    note: 'ROUTING ASSUMPTION: an explicit edit still proposes at once, but is preceded by exactly ONE sentence in the reply stating what the edit assumes (here, which date "a week later" is measured from).',
  },
  {
    name: 'rejected edit → not re-proposed',
    expect: null,
    ctx: [
      'Current page "Kitchen Renovation". Blocks: [text id=b1 "Electrician visit: w/c 29 Sep. Cabinet measurement: w/c 22 Sep."], [todo id=b2 reno tasks].',
      rejectedContextNote([
        { targetTitle: 'Kitchen Renovation', summary: 'push the electrician out by a week' },
      ]),
    ]
      .filter(Boolean)
      .join('\n\n'),
    text: 'ok, anything else on this page?',
    note: 'ROUTING NO RETRY: the route already fed a [Rejected] note for this edit into context (6c f5) — a generic follow-up must not re-propose it.',
  },
  {
    name: 'ask again → re-proposed',
    expect: 'propose_changes',
    expectOneAssumptionSentence: true,
    ctx: [
      'Current page "Kitchen Renovation". Blocks: [text id=b1 "Electrician visit: w/c 29 Sep. Cabinet measurement: w/c 22 Sep."], [todo id=b2 reno tasks].',
      // regenerate() drops the rejected card's message before resending (handleAskAgain),
      // so by the time this turn runs, proposalToolCallIds no longer finds that tool
      // call and rejectedContextNote has no entry left for it — null, same as here.
      rejectedContextNote([]),
    ]
      .filter(Boolean)
      .join('\n\n'),
    text: 'push the electrician out by a week',
    note: 'ROUTING NO RETRY + ASSUMPTION: with the [Rejected] note for this tool call absent, the same edit is free to propose again — and the live miss showed a re-proposal can drop the assumption sentence, so this re-proposal is checked for it too.',
  },
  {
    name: 'ask again in own words → re-proposed with one assumption sentence',
    expect: 'propose_changes',
    expectOneAssumptionSentence: true,
    ctx: [
      'Current page "Kitchen Renovation". Blocks: [text id=b1 "Electrician visit: w/c 29 Sep. Cabinet measurement: w/c 22 Sep."], [todo id=b2 reno tasks].',
      rejectedContextNote([
        { targetTitle: 'Kitchen Renovation', summary: 'move the electrician to w/c 6 oct' },
      ]),
    ]
      .filter(Boolean)
      .join('\n\n'),
    text: 'ask again: move the electrician to w/c 6 oct',
    note: 'ROUTING NO RETRY + ASSUMPTION: the live miss — "ask again: <edit>" in the user\'s own words, with the [Rejected] note for THIS edit still present — must still propose (an explicit "ask again" overrides no-retry) and still carry exactly one assumption sentence.',
  },
  {
    name: 'rejected edit → not re-offered as a chip',
    expect: null,
    forbidChipNaming: /electrician.*6 oct|move the electrician/i,
    ctx: [
      'Current page "Kitchen Renovation". Blocks: [text id=b1 "Electrician visit: w/c 29 Sep. Cabinet measurement: w/c 22 Sep."], [todo id=b2 reno tasks].',
      rejectedContextNote([
        { targetTitle: 'Kitchen Renovation', summary: 'move the electrician to w/c 6 oct' },
      ]),
    ]
      .filter(Boolean)
      .join('\n\n'),
    text: 'ok, anything else on this page?',
    note: 'ROUTING NO RETRY: the live miss — a rejected edit must not come back as a suggest_followups chip either, not just as a propose_changes call.',
  },
]

type Result = {
  scenario: Scenario
  actual: string // tool name or '(no tool)'
  pass: boolean
  detail: string
}

type ToolCall = { toolName: string; input?: unknown }
type CreateInput = {
  type?: string
  title?: string
  parentTitle?: string
  blocks?: Array<{ type?: string; content?: string }>
  suggestions?: string[]
}

/** Rough sentence count — splits on terminal punctuation. Good enough to assert
 *  "exactly one sentence" without parsing prose. */
function sentenceCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return (trimmed.match(/[^.!?]+(?:[.!?]+|$)/g) ?? []).filter((m) => m.trim().length > 0).length
}

/** KAN-132 live miss: the model can emit exactly one sentence that only
 *  describes the action ("Updating the electrician date.") rather than
 *  naming an assumption. `expectOneAssumptionSentence` must fail that case,
 *  so it also requires one of these assumption words/phrases. */
const ASSUMPTION_WORD_RE = /assum|taking|taken|reading|measured from|counted from|presum/i

/** `expectOneAssumptionSentence`: the reply is exactly one non-empty sentence
 *  AND that sentence names an assumption, not just the action taken. */
function isOneAssumptionSentence(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.length > 0 && sentenceCount(trimmed) === 1 && ASSUMPTION_WORD_RE.test(trimmed)
}

/** The first tool call that is a routing decision. KAN-132: production lets the
 *  model offer a suggest_followups chip alongside grilling or a chat answer, so
 *  a chip is not itself a route — skip it when picking the turn's outcome, or
 *  every grill/chat case that also offers a chip reads as that chip's name
 *  instead of `(no tool)`. */
function primaryCall(toolCalls: ToolCall[]): ToolCall | undefined {
  return toolCalls.find((c) => c.toolName !== 'suggest_followups')
}

/** Every chip offered this turn, pooled across all suggest_followups calls —
 *  collected separately from `primaryCall` since a chip offer never counts as
 *  the turn's routing outcome. */
function collectChips(toolCalls: ToolCall[]): string[] {
  return toolCalls
    .filter((c) => c.toolName === 'suggest_followups')
    .flatMap((c) => (c.input as CreateInput | undefined)?.suggestions ?? [])
}

/** The create_page shape assertions the milestones require. Only meaningful once
 *  the tool name already matched. Factored out so single-turn and turn-2 share it. */
function checkShape(
  call: ToolCall | undefined,
  s: Scenario,
  text: string,
  chips: string[]
): boolean {
  const input = (call?.input ?? {}) as CreateInput
  let pass = true
  if (s.expectType) pass = input.type === s.expectType
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
    const first = (input.blocks ?? [])[0]
    pass = !(first?.type === 'text' && isTitleEchoHeading(first.content ?? '', input.title ?? ''))
  }
  if (pass && s.expectChipNaming) {
    pass = chips.some((sugg) => s.expectChipNaming!.test(sugg))
  }
  if (pass && s.forbidChipNaming) {
    pass = !chips.some((sugg) => s.forbidChipNaming!.test(sugg))
  }
  if (pass && s.expectOneAssumptionSentence) {
    pass = isOneAssumptionSentence(text)
  }
  return pass
}

/** One model call, built exactly as the chat route builds a turn: the real
 *  system prompt + the workspace context + the deterministic [Scoping] note for
 *  the LATEST user message (scopingText). `messages` carries multi-turn history;
 *  `prompt` is the single-turn shorthand. */
async function generateTurn(
  ctx: string,
  scopingText: string,
  body: { prompt: string } | { messages: Array<{ role: 'user' | 'assistant'; content: string }> }
) {
  const note = scopingContextNote(scopingText)
  const contextBlock = [ctx, note].filter(Boolean).join('\n\n')
  return generateText({
    model: anthropic(MODEL),
    system: buildSystemPrompt(contextBlock, { research: false }),
    ...body,
    tools,
    toolChoice: 'auto',
    stopWhen: stepCountIs(1),
  })
}

/** Assert a single tool outcome against a scenario's `expect` + shape. `text` is
 *  the reply's prose for that turn (KAN-132: the one-assumption-sentence check);
 *  `chips` is the turn's pooled suggest_followups suggestions (KAN-132: the
 *  chip-naming check) — `actual` is already `primaryCall`'s outcome, so a
 *  no-tool turn that only offered a chip still checks `expectChipNaming` here. */
function judge(
  actual: string,
  call: ToolCall | undefined,
  s: Scenario,
  text: string,
  chips: string[]
): boolean {
  if ((s.expect as unknown as string) === 'AMBIGUOUS') {
    return actual === 'create_page' || actual === 'propose_changes' || actual === '(no tool)'
  }
  if (s.expect === null) return actual === '(no tool)' && checkShape(call, s, text, chips)
  return actual === s.expect && checkShape(call, s, text, chips)
}

async function runOne(s: Scenario): Promise<Result> {
  // ── GRILL case (multi-turn): turn 1 must ASK, then the build lands within two
  //    answer rounds (the grill is adaptive — small asks converge in one, a big
  //    project may take two; a real user answers once or twice, never forever) ──
  if (s.followup) {
    const t1 = await generateTurn(s.ctx, s.text, { prompt: s.text })
    const t1calls = t1.toolCalls as ToolCall[]
    const t1call = primaryCall(t1calls)
    const t1actual = t1call ? t1call.toolName : '(no tool)'
    const t1chips = collectChips(t1calls)

    // A genuinely trivial named page may just build on turn 1 — accept it.
    if (s.grillOptional && t1actual !== '(no tool)') {
      const pass = judge(t1actual, t1call, s, t1.text, t1chips)
      const detail = t1call ? JSON.stringify(t1call.input).slice(0, 120) : t1.text.slice(0, 90)
      return { scenario: s, actual: `${t1actual} (T1, no grill)`, pass, detail }
    }

    // Otherwise turn 1 MUST grill: no tool + a question probing the right intent.
    const askedQuestion = t1.text.includes('?')
    const probeOk = s.turn1Probe ? s.turn1Probe.test(t1.text) : true
    if (!(t1actual === '(no tool)' && askedQuestion && probeOk)) {
      const why =
        t1actual !== '(no tool)'
          ? `T1 called ${t1actual} instead of grilling`
          : !askedQuestion
            ? 'T1 reply asked no question'
            : 'T1 question did not probe the expected intent'
      return {
        scenario: s,
        actual: `${t1actual} (T1)`,
        pass: false,
        detail: `${why} — ${t1.text.replace(/\s+/g, ' ').slice(0, 90)}`,
      }
    }

    // Answer, and if the model opens a SECOND round, answer once more (a closer).
    // The build must land by the second answer.
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: s.text },
      { role: 'assistant', content: t1.text },
    ]
    const answers = [s.followup, CLOSER_ANSWER]
    let last = t1
    for (let i = 0; i < answers.length; i++) {
      history.push({ role: 'user', content: answers[i] })
      last = await generateTurn(s.ctx, answers[i], { messages: [...history] })
      const calls = last.toolCalls as ToolCall[]
      const call = primaryCall(calls)
      const actual = call ? call.toolName : '(no tool)'
      const chips = collectChips(calls)
      if (actual !== '(no tool)') {
        const pass = judge(actual, call, s, last.text, chips)
        const detail = call
          ? JSON.stringify(call.input).slice(0, 120)
          : last.text.replace(/\s+/g, ' ').slice(0, 90)
        return {
          scenario: s,
          actual: `ask→${actual}`,
          pass,
          detail: pass ? detail : `T2: ${detail}`,
        }
      }
      history.push({ role: 'assistant', content: last.text })
    }
    return {
      scenario: s,
      actual: 'ask→(no tool)',
      pass: false,
      detail: `still grilling after ${answers.length} answers — ${last.text.replace(/\s+/g, ' ').slice(0, 80)}`,
    }
  }

  // ── single-turn case (unchanged): the assertion applies to turn 1 ──
  const result = await generateTurn(s.ctx, s.text, { prompt: s.text })
  const calls = result.toolCalls as ToolCall[]
  const call = primaryCall(calls)
  const actual = call ? call.toolName : '(no tool)'
  const chips = collectChips(calls)
  const detail = call
    ? JSON.stringify(call.input).slice(0, 120)
    : result.text.replace(/\s+/g, ' ').slice(0, 90)
  return { scenario: s, actual, pass: judge(actual, call, s, result.text, chips), detail }
}

function fmtExpect(e: Expect): string {
  if ((e as unknown as string) === 'AMBIGUOUS') return 'create_page|propose_changes|no-tool'
  return e === null ? '(no tool)' : e
}

/** The expected outcome string for the table — GRILL cases show the two-turn
 *  shape ("ask→create_page") so the display matches `actual`. */
function fmtExpectFor(s: Scenario): string {
  return (s.followup ? 'ask→' : '') + fmtExpect(s.expect)
}

/** `--grep <substr>` → run only scenarios whose name contains <substr> (case-insensitive). Dev-only; omit for full suite. */
const SCENARIOS: Scenario[] = (() => {
  const i = process.argv.indexOf('--grep')
  if (i === -1) return ALL_SCENARIOS
  const needle = (process.argv[i + 1] ?? '').toLowerCase()
  return ALL_SCENARIOS.filter((s) => s.name.toLowerCase().includes(needle))
})()

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
    `  ${pad('CASE', 52)} ${pad('EXPECT', 26)} ${runs > 1 ? 'PASS RATE  SAW' : `${pad('ACTUAL', 16)} RESULT`}`
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
        `  ${pad(SCENARIOS[s].name, 52)} ${pad(fmtExpectFor(SCENARIOS[s]), 26)} ${passes}/${runs}        ${saw}${flaky}`
      )
    } else {
      const r = perRun[0]
      console.log(
        `  ${pad(SCENARIOS[s].name, 52)} ${pad(fmtExpectFor(SCENARIOS[s]), 26)} ${pad(r.actual, 16)} ${r.pass ? 'PASS' : 'FAIL'}`
      )
      if (!r.pass) console.log(`      ↳ ${r.detail}`)
    }
  }

  console.log('\n' + '═'.repeat(100))
  console.log(
    `SUMMARY: ${totalPass}/${totalCells} case-executions passed` +
      (runs > 1 ? ` across ${runs} full runs` : '')
  )
  console.log('═'.repeat(100) + '\n')

  process.exit(totalPass === totalCells ? 0 : 1)
}

run()
