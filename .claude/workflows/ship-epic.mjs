export const meta = {
  name: 'ship-epic',
  description:
    "Work one epic's Workstream in order: pick its ready tickets, build each in its own worktree (stacked on the one before), review each on two axes, and return a merge plan for the orchestrator.",
  whenToUse:
    "When you want an epic's queue worked for you. Pass the epic key (args: 'KAN-83') or { epic, max, repoPath, baseBranch }. The epic's description must carry a '## Workstream' section (numbered 'KAN-123 · after: KAN-1, KAN-2' lines, plus Owns and Migrations). One run per epic; runs for different epics can go in parallel, because each stream owns its files and its migration numbers. max defaults to 1 (one landable slice per session, AGENTS.md); a higher max stacks each further ticket on the previous branch. The orchestrator still owns live browser-verify and every merge.",
  phases: [
    { title: 'Plan', detail: "read the epic's Workstream, ticket statuses and in-flight branches" },
    { title: 'Setup', detail: 'one worktree per ticket, stacked on the previous one' },
    { title: 'Build', detail: 'Fable builder, TDD, gated on green tsc/jest/lint', model: 'fable' },
    { title: 'Review', detail: 'parallel Standards + Spec review of each ticket diff' },
  ],
}

// ── args ────────────────────────────────────────────────────────────────────
// args may be an epic key ('KAN-83') or { epic, max, repoPath, baseBranch }.
const opts = typeof args === 'object' && args ? args : { epic: args }
const epic = String(opts.epic ?? '').toUpperCase()
if (!/^[A-Z]+-\d+$/.test(epic)) throw new Error("ship-epic: pass an epic key via args (e.g. args: 'KAN-83')")
const MAX = Math.max(1, Number(opts.max ?? 1))
const JIRA_CLOUD_ID = '1535dfd5-6618-4e61-ac79-655c4c329842'
const REPO = opts.repoPath || '/Users/charlespfaff/Documents/Code/Projects/Pond-v4'
const BASE = opts.baseBranch || 'main'
const readIssue = (key) =>
  `Read ${key} with the Atlassian MCP: getJiraIssue { cloudId: '${JIRA_CLOUD_ID}', issueIdOrKey: '${key}', responseContentFormat: 'markdown' }.`
const branchFor = (ticket) => `feat/${ticket.toLowerCase()}`
const worktreeFor = (ticket) => `${REPO}/.claude-worktrees/feat-${ticket.toLowerCase()}`

// ── schemas ───────────────────────────────────────────────────────────────────
const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'notes', 'owns', 'migrations', 'tickets'],
  properties: {
    ok: { type: 'boolean' },
    notes: { type: 'string', description: 'anything odd — no Workstream section, unreadable ticket, dirty repo' },
    owns: { type: 'string', description: "the Workstream's Owns line, verbatim" },
    migrations: { type: 'string', description: "the Workstream's Migrations line, verbatim" },
    tickets: {
      type: 'array',
      description: 'every numbered Workstream line, in list order',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'summary', 'done', 'labelled_now', 'in_flight', 'after'],
        properties: {
          key: { type: 'string' },
          summary: { type: 'string' },
          done: { type: 'boolean', description: 'status category is Done' },
          labelled_now: { type: 'boolean' },
          in_flight: { type: 'boolean', description: 'a local branch feat/<key> or an open PR from it already exists' },
          after: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['key', 'done'],
              properties: { key: { type: 'string' }, done: { type: 'boolean' } },
            },
          },
        },
      },
    },
  },
}
const SETUP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'branch', 'worktree', 'spec_summary', 'notes'],
  properties: {
    ok: { type: 'boolean' },
    branch: { type: 'string' },
    worktree: { type: 'string' },
    spec_summary: {
      type: 'string',
      description: 'restatement of the spec + acceptance criteria from the ticket description, keeping every inline value',
    },
    notes: { type: 'string' },
  },
}
const BUILD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'green',
    'files_changed',
    'tests_added',
    'test_result',
    'typecheck_result',
    'lint_result',
    'commit_status',
    'deviations',
    'outside_stream',
    'manual_verify_notes',
  ],
  properties: {
    green: { type: 'boolean', description: 'tsc, jest and lint all pass and the work is committed' },
    files_changed: { type: 'array', items: { type: 'string' } },
    tests_added: { type: 'array', items: { type: 'string' } },
    test_result: { type: 'string' },
    typecheck_result: { type: 'string' },
    lint_result: { type: 'string' },
    commit_status: { type: 'string' },
    deviations: { type: 'string' },
    outside_stream: {
      type: 'array',
      items: { type: 'string' },
      description: "changed files outside this stream's Owns line, each with why",
    },
    manual_verify_notes: {
      type: 'array',
      items: { type: 'string' },
      description: 'concrete browser steps for the orchestrator to live-verify against the board frames, light and ink',
    },
  },
}
const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['axis', 'verdict', 'blocking', 'non_blocking'],
  properties: {
    axis: { type: 'string', enum: ['standards', 'spec'] },
    verdict: { type: 'string' },
    blocking: { type: 'array', items: { type: 'string' } },
    non_blocking: { type: 'array', items: { type: 'string' } },
  },
}

// ── phase 1: plan ─────────────────────────────────────────────────────────────
phase('Plan')
const plan = await agent(
  `Plan a run of epic ${epic}'s workstream in repo ${REPO}. Read only: change nothing.
1. ${readIssue(epic)} Find its "## Workstream" section. Each numbered line reads "KAN-123 · after: KAN-1, KAN-2" (or "after: none"). Copy its "Owns:" and "Migrations:" lines verbatim. If there is no Workstream section, return ok: false and say so.
2. For every ticket in the list AND every key named in an "after", read it (getJiraIssue) for its summary, whether its status category is Done, and whether its labels include "now".
3. For every ticket in the list, check for work already in flight, with the branch named feat/<key lowercased> (e.g. feat/kan-43): \`git -C ${REPO} branch --list feat/kan-43\` and \`gh pr list --repo pfaff-designed/Pond-v4 --head feat/kan-43 --state open\`. Either one means in_flight.
4. Note in notes whether ${REPO} is on ${BASE}, clean and in sync (\`git -C ${REPO} status -sb\`).
Return the tickets in list order.`,
  { phase: 'Plan', label: `plan:${epic}`, schema: PLAN_SCHEMA },
)
if (!plan?.ok) {
  log(`Plan failed for ${epic}: ${plan?.notes ?? 'no result'}`)
  return { ok: false, stage: 'plan', epic, plan }
}

// Pick the run: list order; a ticket is ready when every "after" is Done or was
// built earlier in this run. The first pick must already be in `now`; later
// picks are the stream's own next tickets, which the merge plan queues.
const picks = []
const waiting = []
for (const t of plan.tickets) {
  if (picks.length >= MAX) break
  if (t.done || t.in_flight) continue
  const builtHere = new Set(picks.map((p) => p.key))
  const blockedBy = t.after.filter((d) => !d.done && !builtHere.has(d.key)).map((d) => d.key)
  if (blockedBy.length > 0) {
    waiting.push({ ticket: t.key, waiting_on: blockedBy })
    continue
  }
  if (picks.length === 0 && !t.labelled_now) {
    waiting.push({ ticket: t.key, waiting_on: ['the now label'] })
    continue
  }
  picks.push(t)
}
log(`Plan — picked ${picks.map((p) => p.key).join(', ') || 'nothing'}; waiting ${waiting.length}`)
if (picks.length === 0) {
  return { ok: true, epic, built: [], waiting, next_for_orchestrator: ['Nothing in this stream is ready. See waiting.'] }
}

// ── per ticket: setup → build → review ────────────────────────────────────────
const setUp = (ticket, base) =>
  agent(
    `Set up an isolated build for Jira ticket ${ticket} in repo ${REPO}.
Use absolute paths; run git worktree ops from ${REPO}, never from inside a worktree.
1. ${readIssue(ticket)} Its description is the spec. Do NOT re-design; restate it, keeping every inline value (px, colours, copy). If the ticket can't be read, return ok: false.
2. Create the worktree off ${base}: \`git -C ${REPO} worktree add ${worktreeFor(ticket)} -b ${branchFor(ticket)} ${base}\`.
3. Wire deps: \`ln -s ../../node_modules ${worktreeFor(ticket)}/node_modules\`, and for each of .env .env.local .env.development .env.development.local that exists in ${REPO}, \`ln -sf ../../<file> ${worktreeFor(ticket)}/<file>\`.
Return the branch, worktree path, spec_summary and notes.`,
    { phase: 'Setup', label: `setup:${ticket}`, schema: SETUP_SCHEMA },
  )

const buildIt = (ticket, setup) =>
  agent(
    `You are a builder working ONLY in the git worktree at ${setup.worktree} (branch ${setup.branch}). Use absolute paths. Do NOT touch the primary checkout at ${REPO}. Do NOT push or open a PR.

Build ticket ${ticket} TEST-FIRST (red-green-refactor) to its spec:
${setup.spec_summary}

This ticket is part of epic ${epic}'s workstream, which runs in parallel with other epics' streams.
- ${plan.owns} Stay inside those paths. If the spec needs a file outside them, change it minimally and list it in outside_stream with why.
- ${plan.migrations} Use only that migration number; never take the next free one.

Read AGENTS.md, then the board files and component DCs the spec names under wayfinder/design_handoff_pond/ (values are inline in the markup; a value in a board is final). Read the sibling code the spec points to BEFORE writing — match house style, reuse shared helpers, keep the change focused. Gut and replace where the spec says gut; no shims. Cover every acceptance criterion with tests.

Before finishing, run FROM ${setup.worktree} and make all green:
- \`npx tsc --noEmit\` → 0 errors
- \`npx jest --testPathIgnorePatterns "/node_modules/" "/\\.claude/" "\\.pglite\\.test\\.ts$" "/__tests__/helpers/"\` → all green (the repo config ignores /.claude-worktrees/, so pass the rest of its patterns explicitly)
- if you touched a migration or the schema: \`npm run test:pglite\` → all green
- if you changed a component, a story, or any copy a story asserts: \`npm run test-storybook\` → all green (a one-shot vitest run that exits in ~30s — the one Playwright use allowed below)
- \`npx eslint\` on the changed files → clean

NEVER START A DEV SERVER OR ANY LONG-RUNNING PROCESS. No \`npm run dev\`, no \`next dev\`, no watch mode, no Playwright, no \`serve\`. They do not exit and the run stalls until killed (~1.6M tokens lost on 2026-10-02). The "matches the board" check is the ORCHESTRATOR's: put the steps in manual_verify_notes, naming the board file, frame numbers and both themes.

If the same approach fails twice, stop and report it in deviations with green: false — do not retry a third time.

Commit once green: \`feat: <summary> (${ticket})\`. Return the structured build report.`,
    { phase: 'Build', label: `build:${ticket}`, model: 'fable', schema: BUILD_SCHEMA },
  )

const review = (ticket, setup) => {
  const diffCmd = `git -C ${REPO} diff ${setup.base}...${setup.branch}`
  return parallel([
    () =>
      agent(
        `STANDARDS review of the diff for ticket ${ticket}. Judge ONLY against this repo's conventions (AGENTS.md, and a couple of sibling files the diff touches), not the feature spec.
Diff: \`${diffCmd}\`. Look for: real bugs, unsafe casts/any, duplicated logic that should reuse a shared helper, missing cache invalidation, dead code/debug leftovers, shims left behind after a gut, comments that narrate instead of stating a constraint, and changes outside this stream's paths (${plan.owns}).
Return axis "standards", a verdict (ship | fix-then-ship | needs-work), blocking[] (must-fix), non_blocking[] (nits). Don't invent nits.`,
        { phase: 'Review', label: `review:standards ${ticket}`, schema: REVIEW_SCHEMA },
      ),
    () =>
      agent(
        `SPEC review of the diff for ticket ${ticket}. Judge ONLY whether the code implements what the ticket asked — every acceptance criterion and every inline value — and nothing out of scope. Ignore style.
${readIssue(ticket)} Diff: \`${diffCmd}\`.
For each acceptance criterion cite the file:function that satisfies it, or mark it missing/partial. Flag out-of-scope work and any criterion not backed by a test. If a criterion is only provable in the browser against the board, say so.
Return axis "spec", a verdict (spec-complete | gaps | off-spec), blocking[] (missing/broken criteria), non_blocking[] (notes).`,
        { phase: 'Review', label: `review:spec ${ticket}`, schema: REVIEW_SCHEMA },
      ),
  ])
}

const built = []
let stopped = null
for (const pick of picks) {
  const ticket = pick.key
  const base = built.length > 0 ? built[built.length - 1].branch : BASE

  phase('Setup')
  const setup = await setUp(ticket, base)
  if (!setup?.ok) {
    stopped = `setup failed for ${ticket}: ${setup?.notes ?? 'no result'}`
    break
  }
  setup.base = base
  log(`${ticket}: worktree ${setup.worktree} on ${setup.branch}, off ${base}`)

  phase('Build')
  const build = await buildIt(ticket, setup)
  log(`${ticket}: build ${build?.green ? 'green' : 'NOT green'} · ${build?.test_result ?? '?'}`)

  let standards = null
  let spec = null
  if (build?.green) {
    phase('Review')
    ;[standards, spec] = await review(ticket, setup)
  }
  const blockers = [...(standards?.blocking ?? []), ...(spec?.blocking ?? [])]
  const shipReady =
    !!build?.green &&
    blockers.length === 0 &&
    (standards?.verdict ?? '').includes('ship') &&
    (spec?.verdict ?? '') === 'spec-complete'
  built.push({
    ticket,
    summary: pick.summary,
    branch: setup.branch,
    worktree: setup.worktree,
    base,
    build,
    review: { standards, spec, blockers },
    ship_ready: shipReady,
  })
  log(`${ticket}: standards ${standards?.verdict ?? '-'} · spec ${spec?.verdict ?? '-'} · blockers ${blockers.length}`)

  // Never stack on a ticket that isn't ship-ready: the next one would inherit its defects.
  if (!shipReady) {
    stopped = `${ticket} is not ship-ready; later tickets were not started`
    break
  }
}

// ── merge plan for the orchestrator (it owns live-verify + every merge) ──────
const builtKeys = new Set(built.map((b) => b.ticket))
const refilled = new Set()
const refillStep = (ticket) => {
  const i = plan.tickets.findIndex((t) => t.key === ticket)
  const rest = plan.tickets.slice(i + 1).filter((t) => !t.done && !builtKeys.has(t.key))
  if (rest.length === 0)
    return `  4. Stream list finished: add the next ${epic} ticket by rank to its Workstream section and label it now.`
  const unqueued = rest.filter((t) => !t.labelled_now && !refilled.has(t.key))
  const isReady = (t) => t.after.every((d) => d.done || builtKeys.has(d.key))
  const next = unqueued.find(isReady) ?? unqueued[0]
  if (next) refilled.add(next.key)
  if (!next) return `  4. Refill: the rest of this stream is already in now; refill the freed slot by rank.`
  return `  4. Refill: add the label now to ${next.key} (labels are a full replace; read them first).`
}
const steps = []
built.forEach((b, i) => {
  if (!b.ship_ready) {
    steps.push(`${b.ticket}: NOT ship-ready. Fix first: ${b.review.blockers.join(' | ') || b.build?.deviations || 'see build'}`)
    return
  }
  const prev = i > 0 ? built[i - 1].branch : null
  steps.push(
    [
      `${b.ticket} (${b.summary}):`,
      prev
        ? `  0. After ${built[i - 1].ticket} is squash-merged: git -C ${b.worktree} fetch origin && git -C ${b.worktree} rebase --onto origin/${BASE} ${prev} && re-run tsc/jest.`
        : null,
      `  1. Live-verify against the board: PORT=<free> npm run dev from ${b.worktree}; ${b.build.manual_verify_notes.join('; ')}. Stop the dev server after.`,
      `  2. git -C ${b.worktree} push -u git@github.com:pfaff-designed/Pond-v4.git ${b.branch}; gh pr create --head ${b.branch} --title "${b.summary} (${b.ticket})" --body "${b.ticket}"; move ${b.ticket} to In Review (transition 31).`,
      `  3. Wait for CI; gh pr merge <#> --squash --delete-branch; move ${b.ticket} to Done (transition 41).`,
      refillStep(b.ticket),
      `  5. git -C ${REPO} worktree remove --force ${b.worktree}; ./scripts/sweep.sh.`,
    ]
      .filter(Boolean)
      .join('\n'),
  )
})

return {
  ok: true,
  epic,
  built,
  waiting,
  stopped,
  next_for_orchestrator: steps,
}
