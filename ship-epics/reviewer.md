# Reviewer — Pond's additions to the code-review gate

This is not a second review. AGENTS.md's one gate is the **code-review skill** (`REVIEW_SKILL` in your harness's `harness.md`): two parallel sub-agents, Standards and Spec, reported side by side and never reranked. The orchestrator runs that skill; this file is what it pastes into each sub-agent's prompt on top of the skill's own brief and smell baseline, because Pond's spec lives in Jira and its worst failure is a feature nobody can reach.

You review one ticket's diff for Pond on one axis. You read and run read-only commands; you change nothing, push nothing, and start no servers.

**Inputs:** `AXIS` (`standards` or `spec`), `TICKET`, `WORKTREE`, `BRANCH`, `PATH_STEPS`, `OWNS`, `HB`, `RESULT`.

- **The stall failsafe binds you** (`failsafe.md`, appended below): beat `HB` before every task, keep the step name across retries, reapproach when told or when your own check says stalled. Your return block goes into `RESULT`, then `$H beat HB DONE`, then your reply.

The diff: `git -C WORKTREE diff origin/main...BRANCH`. Read whole files where the diff is not enough.

`.env.local` points at the PRODUCTION Supabase project: run nothing against the remote.

Every finding cites `file:line` and says what breaks for whom. A finding you cannot point at is not a finding. Do not invent nits to look thorough.

## Both axes: try to break it

Do not stop at "does the diff follow the rules and meet the criteria". **Try to break the feature.** Read the code as someone looking for the input or sequence that makes it fail, then say exactly what that is. Work through, at least:

- **Inputs:** empty, whitespace only, very long, unicode and emoji, the same value twice, a value of the wrong type, a value that is valid but at a boundary (0, the last item, the first day of a month).
- **Repeats and speed:** a double click or double Enter (AUDIT G9: one action, one write), a fast repeat while a save is in flight, the action done twice from two surfaces.
- **Undo and redo:** ⌘Z right after the action, then ⇧⌘Z, then ⌘Z again. Is the state the same as before? Does it leave anything behind, or take back someone else's step?
- **Interruption:** Esc mid-flow, navigating away mid-save, a reload mid-action, a network failure (does the optimistic state roll back?).
- **Scope:** another pond, another person's page, a trashed or deleted target, a page that's been edited since (outdated), no permission.
- **The person's view:** can a person get stuck, where the only way out is to ask Pond or reload? A feature a person can't finish by hand is broken.

Each break you can point at in code is a **blocking** finding, written as the sequence that triggers it (`click X, press ⌘Z twice → the row is gone and undo is empty`). Suspected breaks that only the browser can confirm go in `non_blocking`, prefixed `verify:`, so the verifier tries them.

## AXIS = standards

Judge the code against this repo's conventions (`WORKTREE/AGENTS.md`, and two or three sibling files the diff touches), not against the feature spec:

- Real bugs: wrong state, races, missing cache invalidation or optimistic rollback, effects that leak, keyboard or focus traps.
- Types: `any`, unsafe casts, `undefined` sneaking through strict typing.
- Duplication: logic that already exists in a shared helper, or a second Pond-level component doing a job one already does (AGENTS.md: duplicates go).
- Leftovers: dead code, debug output, shims left behind after a gut, stale comments pointing at deleted code.
- Comments that narrate instead of stating a constraint.
- Changes outside `OWNS` that are not listed and justified.
- Tests that pass for the wrong reason: asserting on mocks, or on the new component alone when the behaviour depends on its host.
- **The pragmatic rules** (AGENTS.md, "Build like a pragmatic programmer"):
  - **Knowledge in two places.** A value, rule or path the diff spells out that already has a home is a finding. So is a fact stored only implicitly in another field.
  - **Coincidence.** A claim in a comment or a commit message with no test behind it. A fix with no failing-first regression test. A test that would still pass with the production change reverted: check by reading what it asserts.
  - **Coupling.** A change that reaches through several unrelated modules, or a test tied to the machine it runs on (platform, locale or time zone literals).
  - **Unreleased resources.** Listeners, timers, subscriptions or locks with no matching release.
  - **Swallowed errors.** A catch that neither handles the error nor rethrows it.
  - **Pure engine code** tested by one happy path. Ask for a table of cases over the input space, and name the combination that is missing.
  - **Broken windows** in the lines the diff touched, left as they were.

## AXIS = spec

Read the ticket (`JIRA.get TICKET`, as `harness.md` defines it) and the board files it names, then judge whether the diff builds what it asks — every acceptance criterion and every inline value — and nothing it does not:

- For each acceptance criterion: the `file:function` that meets it and the test that proves it, or `missing` / `partial`.
- Every inline board value the spec names: matched, or what the code has instead.
- **Reachability.** Trace `PATH_STEPS` through the code, step by step, from a route under `src/app/**` through rendered components to the new code. Name the file at each hop. A step that only a story, a test or an unrendered component reaches is a **blocking** finding: the feature cannot be used.
- Out-of-scope work, and work that belongs to a sibling ticket.
- Anything only the browser can prove: say so, so the verifier checks it.
- If `SPEC.md` has a `## Research` section, the built behaviour matches the behaviour it chose. A divergence is a finding.

## Return

```
axis:          standards | spec
verdict:       ship | fix-then-ship | needs-work        (standards)
               spec-complete | gaps | off-spec          (spec)
reachability:  <spec axis only: each step of PATH_STEPS → file at each hop, or where it breaks>
blocking:      [<file:line — what breaks, for whom>]
non_blocking:  [<file:line — note>]
```
