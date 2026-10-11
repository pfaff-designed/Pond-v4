---
name: ship-epics
description: Work Pond's Jira epics with a conductor and one orchestrator subagent per epic, each building in a Ralph loop and running reviewer and live-verifier subagents through to a merge. Use when the user asks to work the epics, work the queue, run the orchestrators, run a Ralph loop, or ship what is in `now`.
---

# Ship epics

You are the **conductor**. You do not build, review or verify anything yourself. You read the queue, launch one **epic orchestrator** per epic, collect what they return, and bring the user only the decisions that are theirs.

```
conductor (this chat)
 └─ epic orchestrator (one per epic, in parallel)        ship-epics/orchestrator.md   opus
     ├─ build loop         ralph.sh: a fresh pass per item  ship-epics/builder.md      claude-sonnet-5
     ├─ reviewer × 2       standards + spec, in parallel    ship-epics/reviewer.md     opus
     └─ live verifier      Playwright, one at a time        ship-epics/verifier.md     opus
```

**One source, two heads.** Every role prompt and every script lives once, in `REPO/ship-epics/`, and names no tools. This directory is the Claude Code head: this file and `harness.md`, which is the only place a tool is named. `.cursor/skills/ship-epics/` is the Cursor head. **Read `harness.md` before you call anything**, and pass it to every orchestrator you launch.

**Models** (the user's call, 2026-10-09): orchestration and code review on Opus, execution on Sonnet 5.

- Orchestrators, both reviewers and the verifier: `Agent` with `model: "opus"`. Name it on every launch — do not rely on inheritance.
- The build loop's passes: `claude-sonnet-5`, pinned in `ralph.sh` by full name, not by the `sonnet` alias, so a new release cannot change the builder mid-run.

Pass each subagent its role file's contents plus the inputs it names; never paraphrase a role from memory. **Every** subagent prompt, at every level, also carries `ship-epics/failsafe.md` — the 10-minute stall rule — and `harness.md`. The build loop enforces the rule itself.

**A picture of all this:** [`ship-epics/README.md`](../../../ship-epics/README.md) draws the agent tree, the nine steps with every exit back to you, and the inside of the build loop.

## Why it is shaped like this

On 2026-10-09 seven tickets merged in a day and three of them could not be used by anyone: the glyph library had no picker, the HTML reader had no way in, the change log opened only on an unlisted shortcut. Every review checked that the code was correct; none asked whether a person could reach it. Two rules here exist because of that day:

1. **The reachability gate.** Before a ticket is built, its orchestrator writes the person's path: the exact clicks and keys from an open page to the feature. Every step must exist on `main` or be built by this ticket. If a step belongs to a later ticket, the ticket is not built — it is sent back for a vertical re-split.
2. **The verifier only clicks.** Live verification walks the person's path with real clicks and typing. A verifier that evaluates script in the page to act can make an unreachable feature look finished.

And one because a green PR sat unmerged for fifteen minutes: **CI is awaited and acted on**, never started in the background and forgotten.

And the failsafe, because on 2026-10-02 two builds retried one blocked step six times each over ten hours: **no agent spends more than 10 minutes on a task with one approach.** Each agent beats a heartbeat file before every task; its supervisor checks it, nudges the agent past 10 minutes to take a different approach, and stops it if the new approach stalls too (`ship-epics/failsafe.md`, `heartbeat.sh`). Here the `Bash` tool caps a single call at ten minutes, so the bound is enforced by the tool and not only by the prompt.

## Ralph loops: where they are used, and where not

A Ralph loop (Geoffrey Huntley's name for it) is a dumb loop around a fresh agent: the same prompt every pass, no memory between passes, all state in files and git. `ralph.sh` is Pond's: one headless Claude Code pass per `PLAN.md` item, each committing one green step, until every item is ticked and `gates.sh` passes. A long-running builder accumulates context and, when stuck, retries inside it; a fresh pass reads the plan and the failed attempt and takes another route, and the loop measures progress from git rather than taking the pass's word for it. Its passes run with default-deny permissions — nothing in them can push, reach Supabase or start a server — enforced by the tool, not by the prompt.

**Use a loop when all four hold:** the work is a list of items; each item is proven by a command (a test, `tsc`, the gates), not by judgement; the state survives in git and a plan file; and nothing in it needs the user, the shared browser, or a one-way door.

- **Loops:** a ticket's build, and every fix round (confirmed review findings, a failed live verification, red CI), each as `fix:` items on the same plan. Also a mechanical queue the user hands over — one surface's AUDIT p2/p3 items, a deletion sweep — with the same script and its own `PROMPT.md` and `SPEC.md`.
- **Not loops:** picking and the reachability gate (judgement against the queue and the app); review (independent eyes — a loop would mark its own work); live verification (one shared browser, judged against a board); migrations, pushes, merges and Jira (one-way doors and the user's decisions). These stay with subagents or the orchestrator itself.

## The run

0. **Sync the boards once.** In a worktree off `origin/main`, run `./scripts/sync-handoff.sh`. If it changed anything, land it first as its own `chore: sync design handoff` PR (CI, squash-merge) so every orchestrator builds from the same boards. Orchestrators never sync: parallel syncs would put the same board changes into every PR.
1. **Read the queue.** `JIRA.jql` with `project = KAN AND labels = now AND statusCategory != Done ORDER BY rank`. Group the tickets by parent epic. Read each epic with `JIRA.get` and its `## Workstream` section (numbered `KAN-123 · after: …` lines, `Owns:`, `Migrations:`). An epic with no Workstream section gets one written into its description before it is run.
2. **Pick the epics.** An epic runs when its next Workstream ticket is ready: every `after:` is Done and no `feat/<key>` branch or open PR exists. At most **3** orchestrators at once — each runs jest, Storybook and a dev server.
3. **Launch** every picked orchestrator with `LAUNCH`, all in **one message** so they run at once. Each prompt is `ship-epics/orchestrator.md` + `ship-epics/failsafe.md` + `harness.md` plus its inputs, and first `rm -rf /tmp/ship-epics/<EPIC> && mkdir -p /tmp/ship-epics/<EPIC>` for each:
   - `EPIC` — the epic key
   - `PORT` — 3101, 3102, 3103 (one each; the user's own dev server is on 3000/3001)
   - `MAX_TICKETS` — 2 unless the user says otherwise
   - `HB=/tmp/ship-epics/<EPIC>/orchestrator.hb`, `RESULT=/tmp/ship-epics/<EPIC>/orchestrator.result.md`

   Then record every handle, as `harness.md` says: the id each `Agent` call returned, and the name `ListAgents` prints for it.

4. **Supervise** them, as `failsafe.md`'s "If you supervise" says, with one poll for all of them (`RUN 90000`):

   ```sh
   H=/Users/charlespfaff/Documents/Code/Projects/Pond-v4/ship-epics/heartbeat.sh
   sleep 60; for f in /tmp/ship-epics/*/orchestrator.hb; do printf '%s\t' "$(basename "$(dirname "$f")")"; $H check "$f"; done
   ```

   An orchestrator's heartbeat follows its child's (`supervise build: <step> #<reapproaches>`), so a stall anywhere under it shows here within 10 minutes even if the orchestrator itself failed to act on it. `NUDGE` and `STOP` exactly as `failsafe.md` says. When you stop an orchestrator, also free what it held: if `/tmp/pond-browser.lock/owner` names its epic, remove the lock; `pkill -f "ralph.sh /tmp/ship-epics/<EPIC>/"`; `pkill -f "next dev -p <its PORT>"`; `pkill -f "<its worktree path>"`. An orchestrator is finished when it notifies you it has completed or its heartbeat reads `done`; its return is its `RESULT` file, not its reply.

5. **Act on each return:**
   - `merged` — record the PRs and each ticket's person's path. If the epic has a next ready ticket and the user asked for the run to continue, launch a fresh orchestrator for it.
   - `needs-user` — collect it. Three kinds: a migration waiting for production (ADR 0003: never push without the user's explicit "push NNNN"), a ticket that failed the reachability gate (the proposed re-split is on the ticket as a comment), and a genuine spec ambiguity.
   - `stopped` — a stall or a failure after two fix rounds. Read the reason; do not relaunch the same thing.
6. **Bring the user one batch**, once every orchestrator has returned: what merged and what a person can now do (the path, not the ticket title), then every `needs-user` item in one `ASK`.

## Rules every role carries

These are restated in each role file; they are not optional for any of them.

- `.env.local` points at the **production** Supabase project. No `supabase` CLI command against the remote, no script that writes to it, from any role. `supabase db push` happens only in this chat, after the user says "push NNNN".
- No force push, no history rewrite on a pushed branch.
- No dev server, watcher, `serve` or loop in the foreground. Each starts with `BG` — never with `&`, which a shell tool reaping a call's children will kill — and is killed with `pkill -f` when done.
- Two attempts at the same approach is the limit (AGENTS.md). The third is a stop with a reason.
- No task runs more than 10 minutes on one approach (`failsafe.md`): beat before every task; reapproach when told or when your own check says stalled; stop when a reapproach stalls too.
- Building is a Ralph loop; judging is not. A loop's items are proven by commands; the reachability gate, review, live verification and every one-way door stay with an agent.
- No handoff documents. A ticket that cannot land in its run is reported as stopped and re-split.
- The board is the spec (AGENTS.md, ADR 0011). Shipped code has no standing.
