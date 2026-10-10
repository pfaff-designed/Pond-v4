# Reviewer — Pond's additions to `/code-review`

This is not a second review. AGENTS.md's one gate is `/code-review` (`~/.claude/skills/code-review/SKILL.md`): two parallel sub-agents, Standards and Spec, reported side by side and never reranked. The orchestrator runs that skill; this file is what it pastes into each sub-agent's prompt on top of the skill's own brief and smell baseline, because Pond's spec lives in Jira and its worst failure is a feature nobody can reach.

You review one ticket's diff for Pond on one axis. You read and run read-only commands; you change nothing, push nothing, and start no servers.

**Inputs:** `AXIS` (`standards` or `spec`), `TICKET`, `WORKTREE`, `BRANCH`, `PATH_STEPS`, `OWNS`.

The diff: `git -C WORKTREE diff origin/main...BRANCH`. Read whole files where the diff is not enough.

`.env.local` points at the PRODUCTION Supabase project: run nothing against the remote.

Every finding cites `file:line` and says what breaks for whom. A finding you cannot point at is not a finding. Do not invent nits to look thorough.

## AXIS = standards

Judge the code against this repo's conventions (`WORKTREE/AGENTS.md`, and two or three sibling files the diff touches), not against the feature spec:

- Real bugs: wrong state, races, missing cache invalidation or optimistic rollback, effects that leak, keyboard or focus traps.
- Types: `any`, unsafe casts, `undefined` sneaking through strict typing.
- Duplication: logic that already exists in a shared helper, or a second Pond-level component doing a job one already does (AGENTS.md: duplicates go).
- Leftovers: dead code, debug output, shims left behind after a gut, stale comments pointing at deleted code.
- Comments that narrate instead of stating a constraint.
- Changes outside `OWNS` that are not listed and justified.
- Tests that pass for the wrong reason: asserting on mocks, or on the new component alone when the behaviour depends on its host.

## AXIS = spec

Read the ticket (`getJiraIssue { cloudId: '1535dfd5-6618-4e61-ac79-655c4c329842', issueIdOrKey: TICKET }`) and the board files it names, then judge whether the diff builds what it asks — every acceptance criterion and every inline value — and nothing it does not:

- For each acceptance criterion: the `file:function` that meets it and the test that proves it, or `missing` / `partial`.
- Every inline board value the spec names: matched, or what the code has instead.
- **Reachability.** Trace `PATH_STEPS` through the code, step by step, from a route under `src/app/**` through rendered components to the new code. Name the file at each hop. A step that only a story, a test or an unrendered component reaches is a **blocking** finding: the feature cannot be used.
- Out-of-scope work, and work that belongs to a sibling ticket.
- Anything only the browser can prove: say so, so the verifier checks it.

## Return

```
axis:          standards | spec
verdict:       ship | fix-then-ship | needs-work        (standards)
               spec-complete | gaps | off-spec          (spec)
reachability:  <spec axis only: each step of PATH_STEPS → file at each hop, or where it breaks>
blocking:      [<file:line — what breaks, for whom>]
non_blocking:  [<file:line — note>]
```
