export const meta = {
  name: 'ship-issue',
  description: 'Build a GitHub issue in an isolated worktree (Fable builder), then run two-axis code review — returns a report + verify checklist for the orchestrator to live-verify and ship.',
  whenToUse:
    'When an issue has a resolved/executable spec in its body and you want the build→green-bar→review pipeline run for you. Pass the issue number as args (e.g. args: 40). The orchestrator still owns live browser-verify and the merge, because a headless agent cannot drive Playwright and should not silently push to main.',
  phases: [
    { title: 'Setup', detail: 'read issue spec + create worktree' },
    { title: 'Build', detail: 'Fable builder, TDD, gated on green tsc/jest/lint', model: 'fable' },
    { title: 'Review', detail: 'parallel Standards + Spec review of the diff' },
  ],
}

// ── args ────────────────────────────────────────────────────────────────────
// args may be a number (issue #) or { issue, repoPath, baseBranch }.
const issue = typeof args === 'object' && args ? args.issue : args
if (!issue) throw new Error('ship-issue: pass an issue number via args (e.g. args: 40)')
const REPO = (typeof args === 'object' && args?.repoPath) || '/Users/charlespfaff/Documents/Code/Projects/Pond-v4'
const BASE = (typeof args === 'object' && args?.baseBranch) || 'main'
const SLUG = `issue-${issue}`
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
    spec_summary: { type: 'string', description: 'one-paragraph restatement of the resolved spec + acceptance criteria from the issue body' },
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
  `Set up an isolated build for GitHub issue #${issue} in repo ${REPO}.
Steps (use absolute paths; run git worktree ops from ${REPO}, never from inside a worktree):
1. Read the issue: \`gh issue view ${issue} --json title,body\`. The build-ready spec is usually under a "## Resolved Spec" section. Do NOT re-design; restate it.
2. Verify ${REPO} is on ${BASE}, clean, in sync (\`git -C ${REPO} status -sb\`). If dirty, report it in notes and still proceed off ${BASE}.
3. Create the worktree: \`git -C ${REPO} worktree add ${WORKTREE} -b ${BRANCH} ${BASE}\`.
4. Wire deps so tests/build work: symlink node_modules and env files from the primary checkout:
   \`ln -s ../../node_modules ${WORKTREE}/node_modules\` and, for each of .env .env.local .env.development .env.development.local that exists in ${REPO}, \`ln -sf ../../<file> ${WORKTREE}/<file>\`.
Return the branch, worktree path, a one-paragraph spec_summary (incl. acceptance criteria), and notes.`,
  { phase: 'Setup', label: `setup:#${issue}`, schema: SETUP_SCHEMA },
)
if (!setup?.ok) {
  log(`Setup failed for #${issue}: ${setup?.notes ?? 'no result'}`)
  return { ok: false, stage: 'setup', setup }
}
log(`Worktree ready: ${setup.worktree} on ${setup.branch}`)

// ── phase 2: build (Fable, TDD) ───────────────────────────────────────────────
phase('Build')
const build = await agent(
  `You are a builder working ONLY in the git worktree at ${setup.worktree} (branch ${setup.branch}). Use absolute paths. Do NOT touch the primary checkout at ${REPO}. Do NOT push or open a PR.

Build issue #${issue} TEST-FIRST (red-green-refactor) to its resolved spec:
${setup.spec_summary}

Read the sibling/reference code the spec points to BEFORE writing — match house style, reuse shared helpers instead of duplicating, keep the change minimal and focused. Cover every acceptance criterion with unit + integration tests.

Before finishing, run FROM ${setup.worktree} and make all green:
- typecheck (check package.json, e.g. \`npx tsc --noEmit\`) → 0 errors
- the jest suite (note: if the repo's jest config ignores /.claude-worktrees/, run \`npx jest --testPathIgnorePatterns "/node_modules/" "/\\.claude/"\` so the worktree's own tests run) → all green
- lint if present → clean (explain any residual warnings)

Commit once green: \`feat: <summary> (#${issue})\` (conventional). Return the structured build report, including concrete browser steps the orchestrator should live-verify.`,
  { phase: 'Build', label: `build:#${issue}`, model: 'fable', schema: BUILD_SCHEMA },
)
log(`Build: ${build?.test_result ?? 'no result'} · tsc ${build?.typecheck_result ?? '?'}`)

// ── phase 3: two-axis review (parallel) ───────────────────────────────────────
phase('Review')
const diffCmd = `cd ${REPO} && git diff ${BASE}...${BRANCH}`
const [standards, spec] = await parallel([
  () =>
    agent(
      `STANDARDS review of the diff for issue #${issue}. Judge ONLY against this repo's own house style/conventions (read AGENTS.md/CLAUDE.md/docs and a couple of sibling files the diff touches), not the feature spec.
Diff: \`${diffCmd}\`. Look for: real bugs, unsafe casts/any, duplicated logic that should reuse a shared helper, missing cache invalidation, dead code/debug leftovers, and whether new files mirror their siblings.
Return axis "standards", a verdict (ship | fix-then-ship | needs-work), blocking[] (must-fix), non_blocking[] (nits). Don't invent nits.`,
      { phase: 'Review', label: `review:standards #${issue}`, schema: REVIEW_SCHEMA },
    ),
  () =>
    agent(
      `SPEC review of the diff for issue #${issue}. Judge ONLY whether the code implements what the issue asked — every acceptance criterion — and nothing out of scope. Ignore style.
Read the spec: \`gh issue view ${issue} --json body\`. Diff: \`${diffCmd}\`.
For each acceptance criterion cite the file:function that satisfies it (or mark it missing/partial). Flag any out-of-scope work and any criterion not backed by a test. If a criterion is only provable by live browser behavior, say so.
Return axis "spec", a verdict (spec-complete | gaps | off-spec), blocking[] (missing/broken criteria), non_blocking[] (notes).`,
      { phase: 'Review', label: `review:spec #${issue}`, schema: REVIEW_SCHEMA },
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
  issue,
  branch: setup.branch,
  worktree: setup.worktree,
  base: BASE,
  build,
  review: { standards, spec, blockers },
  ship_ready: shipReady,
  next_for_orchestrator: shipReady
    ? [
        `Live-verify in the browser against a dev server on the worktree (PORT=<free> npm run dev from ${setup.worktree}); run the build.manual_verify_notes steps.`,
        `If verify passes: git -C ${setup.worktree} push -u origin ${setup.branch}; gh pr create --title "…" --body "Closes #${issue}\\n…"; wait for CI; gh pr merge <#> --squash --delete-branch.`,
        `Cleanup: stop the dev server; git -C ${REPO} worktree remove --force ${setup.worktree}; git -C ${REPO} branch -D ${setup.branch}; git -C ${REPO} fetch origin --prune; git -C ${REPO} merge --ff-only origin/${BASE}.`,
      ]
    : [`Blockers must be fixed before shipping:`, ...blockers],
}
