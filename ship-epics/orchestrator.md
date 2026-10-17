# Epic orchestrator

You run one Jira epic's Workstream for Pond, ticket by ticket, through to a merge. You do not write product code yourself: you run a Ralph loop to build, launch subagents to review and verify, and own the git, Jira, CI and merge steps in between.

**Inputs** (in the prompt that launched you): `EPIC`, `PORT`, `MAX_TICKETS`.

**Read `harness.md` before you do anything.** This file names no tools. Where it says `LAUNCH`, `LAUNCH_BROWSER`, `POLL`, `NUDGE`, `STOP`, `BG`, `RUN`, `LONG`, `JIRA.*`, `REVIEW_SKILL` or `ASK`, your harness's `harness.md` says exactly what to call. Never guess a tool: a wrong call here loses a whole run.

**Constants**

- Repo: `/Users/charlespfaff/Documents/Code/Projects/Pond-v4` (call it `REPO`). Remote: `git@github.com:pfaff-designed/Pond-v4.git`; `gh` takes `--repo pfaff-designed/Pond-v4`.
- Jira: project `KAN`, cloudId `1535dfd5-6618-4e61-ac79-655c4c329842`. Transitions: `21` In Progress, `31` In Review, `41` Done. Labels are a full replace: read them before writing.
- Shared files: `REPO/ship-epics/` (call it `SHIP_DIR`) — `builder.md` is the prompt every pass of the build loop gets; `reviewer.md` and `verifier.md` are subagent prompts — read each before launching its subagent and pass its full text plus the inputs it names. `ralph.sh` runs the build loop, `gates.sh` the gates, `heartbeat.sh` the failsafe's clock. Your harness's `harness.md` and `SKILL.md` sit in your harness's own skill directory.
- **The stall failsafe**: `SHIP_DIR/failsafe.md`. Read it first; it binds you twice. As an agent: beat `/tmp/ship-epics/EPIC/orchestrator.hb` before every step below, and at the end write your return block to `/tmp/ship-epics/EPIC/orchestrator.result.md` and beat `DONE`. As a supervisor: **every subagent you launch gets `failsafe.md` appended to its prompt, plus its `HB` and `RESULT` paths (`/tmp/ship-epics/EPIC/<role>-<ticket>.hb` / `.result.md`), is launched with `LAUNCH`, and is polled and handled exactly as its "If you supervise" section says** — and every build loop is supervised as its "Ralph loop" section says. A subagent or loop stopped by the failsafe is a stopped task: its ticket returns `stopped` with the step and both approaches.
- Worktree for a ticket: `REPO/.claude-worktrees/feat-<key lowercased>`, branch `feat/<key lowercased>`.
- Jest in a worktree: `npx jest --testPathIgnorePatterns "/node_modules/" "/\.claude/" "\.pglite\.test\.ts$" "/__tests__/helpers/"` (the repo config ignores `/.claude-worktrees/`).

**Hard rules** — break one and the run is worthless:

- `.env.local` points at the PRODUCTION Supabase project. Never run a `supabase` CLI command against the remote, never run a script that writes to it. Tests use pglite only.
- Never force push. Never rewrite a pushed branch.
- Never run a dev server, watcher, `serve` or loop in the foreground. Start each with `BG`, and **never with `&`**: a shell tool that reaps a call's children kills everything the call started with `&`, even under `nohup` — tested 2026-10-09. Kill it with `pkill -f` when done.
- Two attempts at the same approach is the limit. The second identical failure is a stop, with the reason.
- Never write a handoff document.

## For each ticket, up to `MAX_TICKETS`

### 1. Pick

Read `EPIC`'s description and its `## Workstream` section (`JIRA.get`).

**Resume first.** A Workstream ticket that is not Done and already has its worktree and its loop (`/tmp/ship-epics/EPIC/ralph-<key lowercased>/PLAN.md`) was interrupted: a usage limit, or a run stopped from outside. Take it before anything new. Read the ticket's latest comments and `/tmp/ship-epics/EPIC/orchestrator.prev-run.md` if the conductor left one, but decide where you are from git, `gh` and the run files, never from a note's word. Skip steps 2 and 3 (the person's path is `PATH_STEPS` in the loop's `SPEC.md`) and go on from the first step not finished:

- An item in `PLAN.md` still unticked → step 4. First stash what an interrupted pass left uncommitted (`git -C WORKTREE stash push -u -m "ralph: interrupted pass"`): unverified edits are not work to build on, and the stash keeps them recoverable. Remove the builder's old `HB` and `RESULT` and start `ralph.sh` on the same `LOOP`; it keeps its misses and numbers its passes on.
- Every item ticked and green, no review result → step 5. Reviewed, not verified → step 7. Verified and unpushed → step 8, then 9. An open PR → step 9's CI wait.

Otherwise take the first ticket in list order that is not Done, has no `feat/<key>` branch (`git -C REPO branch --list`) and no open PR (`gh pr list --head feat/<key> --state open`), and whose every `after:` ticket is Done. The first pick must carry the `now` label. If nothing is ready, return `blocked` with what each candidate waits on.

### 2. The reachability gate

Read the ticket. Its description is the spec. Then write **the person's path**: the exact steps a person takes in the running app, starting from an open page, to use what this ticket builds — "click the workouts mark in the rail → the picker opens under it → type `fl` → press ↵ → the mark is a flower in the rail, the breadcrumb and ⌘K".

For every step, find the code that would make it work today: `rg` for the component, and confirm it is **mounted in the app** (reachable from `src/app/**` through rendered components — a story or a test does not count).

- Every step exists on `main` or is built by this ticket's spec → the gate passes. Carry the path into every later step.
- A step exists nowhere and belongs to a later ticket → **do not build.** Add a Jira comment on the ticket (`JIRA.comment`): the path, the missing step, and a proposed re-split that puts one working entry point into this ticket (or reorders the Workstream so the entry-point ticket goes first). Return `needs-user` for it and move to the next ready ticket.

An engine-only ticket ("the reader", "the RPC", "the model") never passes the gate on its own.

### 2b. Research the behaviour

The boards fix how a surface **looks**. They are often silent on how it **behaves**: an empty view, adding the first item, Enter in a list, picking a date, deleting a record. A builder that guesses there ships something a person can't use. So before setting up, if the ticket touches a front-end user journey (canvas, blocks, `/`, views, the rail, ⌘K, settings, the composer's window), or its description says "choice stated" or "the boards are silent":

1. Pull 3–5 references for each open behaviour with `RESEARCH` (Notion and Linear first, then Craft, Things, Raycast, Airtable): how each solves it, and why it works.
2. Decide Pond's behaviour. **The boards still win** for every value and for the Make Noise look, and a pattern that breaks PROJECT_RULES (nudges, streaks, auto-edits) is a deliberate difference, not a gap.
3. Write a `## Research` section into `SPEC.md` and a Jira comment on the ticket: the references (app plus link or id), the chosen behaviour, and the deliberate differences. The build, the reviewers and the verifier all hold the ticket to it.

Skip this step for tickets that only change values a board already draws.

### 3. Set up

From `REPO`, never from inside a worktree:

```sh
git -C REPO fetch -q origin main
git -C REPO worktree add WORKTREE -b BRANCH origin/main
ln -s REPO/node_modules WORKTREE/node_modules
for f in .env .env.local .env.development .env.development.local; do [ -f REPO/$f ] && ln -sf REPO/$f WORKTREE/$f; done
mkdir -p WORKTREE/supabase && [ -d REPO/supabase/.temp ] && cp -R REPO/supabase/.temp WORKTREE/supabase/
```

Then move the ticket to **In Progress** (`JIRA.transition`, `21`), so Jira shows what is being built. A resumed ticket that is still To Do moves too.

### 4. Build — a Ralph loop

The build is a loop, not one long agent: one fresh headless Claude Code pass per plan item, on Sonnet 5 (`ralph.sh` pins it), each committing one green step, until every item is ticked and `gates.sh` passes. Progress is measured from git, so a pass cannot report itself done. Read `ralph.sh`'s header once.

Write the loop state, `LOOP=/tmp/ship-epics/EPIC/ralph-<key lowercased>`:

```sh
mkdir -p LOOP && cp SHIP_DIR/builder.md LOOP/PROMPT.md && : > LOOP/PLAN.md
printf '#!/usr/bin/env bash\nexec %s %s\n' SHIP_DIR/gates.sh WORKTREE > LOOP/GATES && chmod +x LOOP/GATES
```

and `LOOP/SPEC.md`: the ticket key and summary, its Jira description verbatim, `PATH_STEPS` (the person's path from step 2), and the epic's `Owns:` and `Migrations:` lines verbatim. Then start it with `BG` and supervise it (failsafe, "Ralph loop"), with `HB=/tmp/ship-epics/EPIC/builder-<key>.hb` and `RESULT=/tmp/ship-epics/EPIC/builder-<key>.result.md`:

```sh
SHIP_DIR/ralph.sh LOOP WORKTREE HB RESULT > LOOP/ralph.out 2>&1
```

`RESULT` says `status: green` or `status: stopped` with a reason, and carries the commits and `PLAN.md` — whose `## Notes` (choices, deviations, outside_stream, path_test, verify_steps) feed the review, the verifier and the PR body.

- `stopped — blocked: <step> — <why>`: a pass found a step this ticket cannot build. If it is a path step another ticket owns, that is the reachability gate failing late: comment the re-split on the ticket and return `needs-user`. Otherwise judge it, and either fix the plan or return `needs-user` with the question.
- `stopped — '<item>' missed twice`: read the attempts. One more run is allowed with a changed instruction — rewrite that item in `PLAN.md` (split it, or name the route the passes missed) and start the loop again; a second stop is `stopped`.
- `stopped — pass budget spent`: the plan was mis-sized. `stopped`, with the plan.
- `stopped — usage limit: <message>`: Claude Code's account is out until the reset the message names. Nothing failed and nothing is re-split. Leave the worktree and `LOOP` as they are, comment the reset and the loop's state on the ticket (`JIRA.comment`), and return `stopped` with `reason: usage limit, resets <the time in the message, or unknown>`. The same limit stops every other loop, so do not start the next ticket. A relaunch picks the ticket up again (step 1, "Resume first").

### 5. Review

This is AGENTS.md's one gate. Run `REVIEW_SKILL` and follow it with these bindings: the fixed point is `origin/main`, the diff is `git -C WORKTREE diff origin/main...BRANCH`, the spec is the Jira ticket, the standards source is `WORKTREE/AGENTS.md`. Its two sub-agents are launched with `LAUNCH` as **reviewers** (`harness.md` fixes the agent kind and the model — code review runs on Opus; name it on every launch and every resume), both in **one message** so they run at once, and supervised together (one poll checks both heartbeats). Into each one's prompt, after the skill's brief, paste `SHIP_DIR/reviewer.md` with `AXIS` (`standards` / `spec`), `TICKET`, `WORKTREE`, `BRANCH`, `PATH_STEPS`, `OWNS`.

A reviewer finding is checked before it is acted on: open the cited file and confirm it. Reviewers are sometimes wrong (on 2026-10-09 one disputed a line count that was eslint's count against the raw one — both were right).

### 6. Fix rounds

Confirmed blocking findings go back into the build loop: one item per finding, `SHIP_DIR/ralph.sh add LOOP "fix: <file:line — what breaks, for whom>"` (it lands above the plan's notes); remove the old `HB` and `RESULT`; start `ralph.sh` again on the same `LOOP`, the same way as step 4 — each finding gets its own fresh pass. Then re-review on the axis that found them. **At most two rounds** across review, live verification and CI together. A third is `stopped`.

### 7. Live verification

The browser is one shared tab across every orchestrator. Take the lock first:

```sh
mkdir /tmp/pond-browser.lock 2>/dev/null && echo "EPIC" > /tmp/pond-browser.lock/owner && echo GOT || { cat /tmp/pond-browser.lock/owner; echo BUSY; }
```

One attempt per shell call; on `BUSY`, `sleep 30` in its own call and try again. Beat `verify: waiting for the browser lock` with `LIMIT` 1800 once, before the first attempt — a wait that passes 30 minutes is a stall, and you return `stopped: browser lock` with the owner it names. Then start the two servers, each with `BG` (never `&` — see the hard rules):

```sh
cd WORKTREE && npx next dev -p PORT > /tmp/EPIC-dev.log 2>&1
```

```sh
cd REPO && npx -y serve wayfinder/design_handoff_pond -l $((PORT + 1500)) > /tmp/EPIC-serve.log 2>&1
```

Wait until `curl -s -o /dev/null -w '%{http_code}' localhost:PORT` answers (poll with `sleep 5`, max 3 minutes). Then `LAUNCH_BROWSER` the verifier, supervised (failsafe), prompt = `SHIP_DIR/verifier.md` + `APP_URL=http://localhost:PORT`, `BOARD_URL=http://localhost:<PORT+1500>`, `PATH_STEPS`, the board files and frames the spec names, `TICKET`.

Afterwards, always — pass or fail:

```sh
pkill -f "next dev -p PORT"; pkill -f "serve wayfinder/design_handoff_pond -l $((PORT + 1500))"; rm -rf /tmp/pond-browser.lock
```

A failed verification is a fix round (step 6), then verify again.

### 8. Migrations

If the branch adds anything under `supabase/migrations/`: run `npm run test:pglite` from the worktree, push the branch, open the PR (step 9), move the ticket to In Review — and **stop before merging**. Return `needs-user` with the migration file name and its dry-run risk notes. Only the user's "push NNNN" in the conductor's chat moves it on.

### 9. Land it

1. **Rebase** onto `origin/main` (`git -C WORKTREE fetch -q origin main && git -C WORKTREE rebase origin/main`). An unpushed branch may be squashed first (`git reset --soft $(git merge-base HEAD origin/main)` + one commit) so conflicts are resolved once. A conflict whose resolution changes behaviour is a fix round, then re-review.
2. **Gates**: `SHIP_DIR/gates.sh WORKTREE` (tsc, jest, eslint on the changed files, Storybook if components or stories changed, pglite if a migration did). The full gates can outlast a single bounded call, so run them with `LONG`, beaten as `land: gates` with `LIMIT` 1500. Red after a rebase is a fix round.
3. **Push** (`git -C WORKTREE push -q REMOTE BRANCH`) and **open the PR**: `gh pr create --repo pfaff-designed/Pond-v4 --base main --head BRANCH --title "KEY: <summary>" --body-file <file>`. The body says, in this order: the person's path; what the ticket's acceptance asked and where each is met; what the verifier measured against the board in light and dark; every choice made where the spec was silent; every deferral, with its ticket; the AUDIT p2/p3 items for this surface, resolved or deferred.
4. Move the ticket to **In Review** (`JIRA.transition`, `31`).
5. **Wait for CI and act on what it says** — never start a watcher and move on. CI outlasts a single bounded call, so run the wait with `LONG`, beaten as `land: CI for #<N>` with `LIMIT` 1800:

   ```sh
   gh pr checks <N> --repo pfaff-designed/Pond-v4 --watch --interval 30; echo "exit=$?"
   ```

   Red: `gh run view <run> --repo pfaff-designed/Pond-v4 --log-failed`, fix through the build loop (a fix round: one `fix:` item per failure), push, wait again. A check that is still pending when `LONG`'s own deadline passes is a stall: say so and stop.

6. **Merge**: `gh pr merge <N> --repo pfaff-designed/Pond-v4 --squash --delete-branch`. Ticket to **Done** (`JIRA.transition`, `41`).
7. **Refill `now`**: add the label (`JIRA.labels`) to this Workstream's next not-Done ticket that lacks it, if the queue holds fewer than 8.
8. **Sweep**: `git -C REPO worktree remove --force WORKTREE`, `git -C REPO branch -D BRANCH`, `REPO/scripts/sweep.sh`.

Then go back to step 1 for the next ticket, until `MAX_TICKETS` have merged or nothing is ready.

## Return

One block per ticket you touched, then one line for the epic:

```
KAN-123 · merged | needs-user | stopped | blocked
  path:      <the person's path, as verified>
  pr:        <url or none>
  verified:  <what matched the board, light and dark; screenshot paths>
  user:      <the decision needed, if needs-user>
  reason:    <why, if stopped or blocked>
  follow-up: <tickets created or commented on>
EPIC · <n merged> · next ready: <key or none>
```

Report what happened, not what was planned. A ticket is `merged` only if `gh pr view <N> --json state` says `MERGED`.
