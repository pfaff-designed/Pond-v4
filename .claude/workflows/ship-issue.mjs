export const meta = {
  name: 'ship-issue',
  description: 'Build a Jira ticket in an isolated worktree (Fable builder), then run two-axis code review — returns a report + verify checklist for the orchestrator to live-verify and ship.',
  whenToUse:
    "When a ticket has a resolved/executable spec in its description and you want the build→green-bar→review pipeline run for you. Pass the ticket key as args (e.g. args: 'KAN-123'). The orchestrator still owns live browser-verify and the merge, because a headless agent cannot drive Playwright and should not silently push to main.",
  phases: [
    { title: 'Setup', detail: 'read ticket spec + create worktree' },
    { title: 'Build', detail: 'Fable builder, TDD, gated on green tsc/jest/lint', model: 'fable' },
    { title: 'Review', detail: 'parallel Standards + Spec review of the diff' },
  ],
}

// ── args ────────────────────────────────────────────────────────────────────
// args may be a Jira key ('KAN-123') or { ticket, repoPath, baseBranch }.
const ticket = String((typeof args === 'object' && args ? args.ticket : args) ?? '').toUpperCase()
if (!/^[A-Z]+-\d+$/.test(ticket)) throw new Error("ship-issue: pass a Jira ticket key via args (e.g. args: 'KAN-123')")
const JIRA_CLOUD_ID = '1535dfd5-6618-4e61-ac79-655c4c329842'
const readTicket = `Read the ticket with the Atlassian MCP: getJiraIssue { cloudId: '${JIRA_CLOUD_ID}', issueIdOrKey: '${ticket}' }. Its description is the spec.`
const REPO = (typeof args === 'object' && args?.repoPath) || '/Users/charlespfaff/Documents/Code/Projects/Pond-v4'
const BASE = (typeof args === 'object' && args?.baseBranch) || 'main'
const SLUG = ticket.toLowerCase()
const BRANCH = `feat/${SLUG}`
const WORKTREE = `${REPO}/.claude-worktrees/feat-${SLUG}`

// ── schemas ───────────────────────────────────────────────────────────────────
const SETUP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'branch', 'worktree', 'spec_summary', 'notes'],
  properties: {
    ok: { type: 'boolean' },
    branch: { type: 'string' },
    worktree: { type: 'string' },
    spec_summary: { type: 'string', description: 'one-paragraph restatement of the resolved spec + acceptance criteria from the ticket description' },
    notes: { type: 'string', description: 'anything odd — missing spec, dirty tree, existing worktree, etc.' },
  },
}
const BUILD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['files_changed', 'tests_added', 'test_result', 'typecheck_result', 'lint_result', 'commit_status', 'deviations', 'manual_verify_notes'],
  properties: {
    files_changed: { type: 'array', items: { type: 'string' } },
    tests_added: { type: 'array', items: { type: 'string' } },
    test_result: { type: 'string' },
    typecheck_result: { type: 'string' },
    lint_result: { type: 'string' },
    commit_status: { type: 'string' },
    deviations: { type: 'string' },
    manual_verify_notes: { type: 'array', items: { type: 'string' }, description: 'concrete browser steps for the orchestrator to live-verify' },
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

// ── phase 1: setup ────────────────────────────────────────────────────────────
phase('Setup')
const setup = await agent(
  `Set up an isolated build for Jira ticket ${ticket} in repo ${REPO}.
Steps (use absolute paths; run git worktree ops from ${REPO}, never from inside a worktree):
1. ${readTicket} The build-ready spec is usually under a "Resolved Spec" heading. Do NOT re-design; restate it. If the ticket can't be read, return ok: false and say so in notes.
2. Verify ${REPO} is on ${BASE}, clean, in sync (\`git -C ${REPO} status -sb\`). If dirty, report it in notes and still proceed off ${BASE}.
3. Create the worktree: \`git -C ${REPO} worktree add ${WORKTREE} -b ${BRANCH} ${BASE}\`.
4. Wire deps so tests/build work: symlink node_modules and env files from the primary checkout:
   \`ln -s ../../node_modules ${WORKTREE}/node_modules\` and, for each of .env .env.local .env.development .env.development.local that exists in ${REPO}, \`ln -sf ../../<file> ${WORKTREE}/<file>\`.
Return the branch, worktree path, a one-paragraph spec_summary (incl. acceptance criteria), and notes.`,
  { phase: 'Setup', label: `setup:${ticket}`, schema: SETUP_SCHEMA },
)
if (!setup?.ok) {
  log(`Setup failed for ${ticket}: ${setup?.notes ?? 'no result'}`)
  return { ok: false, stage: 'setup', setup }
}
log(`Worktree ready: ${setup.worktree} on ${setup.branch}`)

// ── phase 2: build (Fable, TDD) ───────────────────────────────────────────────
phase('Build')
const build = await agent(
  `You are a builder working ONLY in the git worktree at ${setup.worktree} (branch ${setup.branch}). Use absolute paths. Do NOT touch the primary checkout at ${REPO}. Do NOT push or open a PR.

Build ticket ${ticket} TEST-FIRST (red-green-refactor) to its resolved spec:
${setup.spec_summary}

Read the sibling/reference code the spec points to BEFORE writing — match house style, reuse shared helpers instead of duplicating, keep the change minimal and focused. Cover every acceptance criterion with unit + integration tests.

Before finishing, run FROM ${setup.worktree} and make all green:
- typecheck (check package.json, e.g. \`npx tsc --noEmit\`) → 0 errors
- the jest suite (note: if the repo's jest config ignores /.claude-worktrees/, run \`npx jest --testPathIgnorePatterns "/node_modules/" "/\\.claude/" "\\.pglite\\.test\\.ts$" "/__tests__/helpers/"\` so the worktree's own tests run and the pglite suite and helpers stay out) → all green
- if you changed a component, a story, or any copy a story asserts: \`npm run test-storybook\` → all green (a one-shot vitest run that exits in ~30s — the one Playwright use allowed below)
- lint if present → clean (explain any residual warnings)

NEVER START A DEV SERVER OR ANY LONG-RUNNING PROCESS. No \`npm run dev\`, no \`next dev\`, no watch mode, no Playwright, no \`serve\`. They do not exit, and the run stalls until it is killed — this cost ~1.6M tokens across two abandoned builds on 2026-10-02. Many ticket descriptions carry a "browser-verified against the board" criterion: that one is the ORCHESTRATOR's, not yours. Leave it unticked and put the steps in manual_verify_notes.

Commit once green: \`feat: <summary> (${ticket})\` (conventional). Return the structured build report, including concrete browser steps the orchestrator should live-verify.`,
  { phase: 'Build', label: `build:${ticket}`, model: 'fable', schema: BUILD_SCHEMA },
)
log(`Build: ${build?.test_result ?? 'no result'} · tsc ${build?.typecheck_result ?? '?'}`)

// ── phase 3: two-axis review (parallel) ───────────────────────────────────────
phase('Review')
const diffCmd = `cd ${REPO} && git diff ${BASE}...${BRANCH}`
const [standards, spec] = await parallel([
  () =>
    agent(
      `STANDARDS review of the diff for ticket ${ticket}. Judge ONLY against this repo's own house style/conventions (read AGENTS.md/CLAUDE.md/docs and a couple of sibling files the diff touches), not the feature spec.
Diff: \`${diffCmd}\`. Look for: real bugs, unsafe casts/any, duplicated logic that should reuse a shared helper, missing cache invalidation, dead code/debug leftovers, and whether new files mirror their siblings.
Return axis "standards", a verdict (ship | fix-then-ship | needs-work), blocking[] (must-fix), non_blocking[] (nits). Don't invent nits.`,
      { phase: 'Review', label: `review:standards ${ticket}`, schema: REVIEW_SCHEMA },
    ),
  () =>
    agent(
      `SPEC review of the diff for ticket ${ticket}. Judge ONLY whether the code implements what the ticket asked — every acceptance criterion — and nothing out of scope. Ignore style.
${readTicket} Diff: \`${diffCmd}\`.
For each acceptance criterion cite the file:function that satisfies it (or mark it missing/partial). Flag any out-of-scope work and any criterion not backed by a test. If a criterion is only provable by live browser behavior, say so.
Return axis "spec", a verdict (spec-complete | gaps | off-spec), blocking[] (missing/broken criteria), non_blocking[] (notes).`,
      { phase: 'Review', label: `review:spec ${ticket}`, schema: REVIEW_SCHEMA },
    ),
])

const blockers = [
  ...(standards?.blocking ?? []),
  ...(spec?.blocking ?? []),
]
const shipReady =
  blockers.length === 0 &&
  (standards?.verdict ?? '').includes('ship') &&
  (spec?.verdict ?? '') === 'spec-complete'

log(`Review — standards: ${standards?.verdict ?? '?'} · spec: ${spec?.verdict ?? '?'} · blockers: ${blockers.length}`)

// ── report back to the orchestrator (it owns live-verify + ship) ──────────────
return {
  ok: true,
  ticket,
  branch: setup.branch,
  worktree: setup.worktree,
  base: BASE,
  build,
  review: { standards, spec, blockers },
  ship_ready: shipReady,
  next_for_orchestrator: shipReady
    ? [
        `Live-verify in the browser against a dev server on the worktree (PORT=<free> npm run dev from ${setup.worktree}); run the build.manual_verify_notes steps.`,
        `If verify passes: git -C ${setup.worktree} push -u origin ${setup.branch}; gh pr create --title "… (${ticket})" --body "${ticket}\\n…"; move ${ticket} to In Review (transition 31); wait for CI; gh pr merge <#> --squash --delete-branch; move ${ticket} to Done (transition 41).`,
        `Cleanup: stop the dev server; git -C ${REPO} worktree remove --force ${setup.worktree}; git -C ${REPO} branch -D ${setup.branch}; git -C ${REPO} fetch origin --prune; git -C ${REPO} merge --ff-only origin/${BASE}.`,
      ]
    : [`Blockers must be fixed before shipping:`, ...blockers],
}
