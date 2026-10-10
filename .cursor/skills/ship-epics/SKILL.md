---
name: ship-epics
description: Work Pond's Jira epics with a conductor and one orchestrator subagent per epic, each running builder, reviewer and live-verifier subagents through to a merge. Use when the user asks to work the epics, work the queue, run the orchestrators, or ship what is in `now`.
---

# Ship epics

You are the **conductor**. You do not build, review or verify anything yourself. You read the queue, launch one **epic orchestrator** per epic, collect what they return, and bring the user only the decisions that are theirs.

```
conductor (this chat)
 └─ epic orchestrator (one per epic, in parallel)        orchestrator.md
     ├─ builder            one per ticket, in its worktree builder.md
     ├─ reviewer × 2       standards + spec, in parallel   reviewer.md
     └─ live verifier      browser-use, one at a time      verifier.md
```

The role prompts live next to this file. Pass each subagent its file's contents plus the inputs it names; never paraphrase a role from memory. **Every** prompt, at every level, also carries `failsafe.md` — the 10-minute stall rule and how it is enforced.

## Why it is shaped like this

On 2026-10-09 seven tickets merged in a day and three of them could not be used by anyone: the glyph library had no picker, the HTML reader had no way in, the change log opened only on an unlisted shortcut. Every review checked that the code was correct; none asked whether a person could reach it. Two rules here exist because of that day:

1. **The reachability gate.** Before a ticket is built, its orchestrator writes the person's path: the exact clicks and keys from an open page to the feature. Every step must exist on `main` or be built by this ticket. If a step belongs to a later ticket, the ticket is not built — it is sent back for a vertical re-split.
2. **The verifier only clicks.** Live verification walks the person's path with real clicks and typing. A verifier that calls the editor API or dispatches DOM events can make an unreachable feature look finished.

And one because a green PR sat unmerged for fifteen minutes: **CI is awaited in the foreground and acted on**, never watched in the background and forgotten.

And the failsafe, because on 2026-10-02 two builds retried one blocked step six times each over ten hours: **no agent spends more than 10 minutes on a task with one approach.** Each agent beats a heartbeat file before every task; its supervisor checks it, interrupts the agent past 10 minutes to take a different approach, and stops it if the new approach stalls too (`failsafe.md`, `heartbeat.sh`). Tested on 2026-10-09: a stall is seen within one poll, the interrupt returns in about two seconds, and the stuck agent is cut off mid-command.

## The run

0. **Sync the boards once.** In a worktree off `origin/main`, run `./scripts/sync-handoff.sh`. If it changed anything, land it first as its own `chore: sync design handoff` PR (CI, squash-merge) so every orchestrator builds from the same boards. Orchestrators never sync: parallel syncs would put the same board changes into every PR.
1. **Read the queue.** `project = KAN AND labels = now AND statusCategory != Done ORDER BY rank` (cloudId `1535dfd5-6618-4e61-ac79-655c4c329842`). Group the tickets by parent epic. Read each epic's `## Workstream` section (numbered `KAN-123 · after: …` lines, `Owns:`, `Migrations:`). An epic with no Workstream section gets one written into its description before it is run.
2. **Pick the epics.** An epic runs when its next Workstream ticket is ready: every `after:` is Done and no `feat/<key>` branch or open PR exists. At most **3** orchestrators at once — each runs jest, Storybook and a dev server.
3. **Launch** every picked orchestrator in **one message**, `subagent_type: generalPurpose`, `run_in_background: true`, prompt = `orchestrator.md` + `failsafe.md` plus its inputs (first `rm -rf /tmp/ship-epics/<EPIC> && mkdir -p /tmp/ship-epics/<EPIC>` for each):
   - `EPIC` — the epic key
   - `PORT` — 3101, 3102, 3103 (one each; the user's own dev server is on 3000/3001)
   - `MAX_TICKETS` — 2 unless the user says otherwise
   - `HB=/tmp/ship-epics/<EPIC>/orchestrator.hb`, `RESULT=/tmp/ship-epics/<EPIC>/orchestrator.result.md`
4. **Supervise** them, as `failsafe.md`'s "If you supervise" says, with one poll for all of them:

   ```sh
   H=/Users/charlespfaff/Documents/Code/Projects/Pond-v4/.cursor/skills/ship-epics/heartbeat.sh
   sleep 60; for f in /tmp/ship-epics/*/orchestrator.hb; do printf '%s\t' "$(basename "$(dirname "$f")")"; $H check "$f"; done
   ```

   An orchestrator's heartbeat follows its child's (`supervise builder: <step>`), so a stall anywhere under it shows here within 10 minutes even if the orchestrator itself failed to act on it. Interrupt and stop exactly as `failsafe.md` says. When you stop an orchestrator, also free what it held: if `/tmp/pond-browser.lock/owner` names its epic, remove the lock; `pkill -f "next dev -p <its PORT>"`; `pkill -f "<its worktree path>"`. Each orchestrator is finished when its heartbeat reads `done`; its return is its `RESULT` file.

5. **Act on each return:**
   - `merged` — record the PRs and each ticket's person's path. If the epic has a next ready ticket and the user asked for the run to continue, launch a fresh orchestrator for it.
   - `needs-user` — collect it. Three kinds: a migration waiting for production (ADR 0003: never push without the user's explicit "push NNNN"), a ticket that failed the reachability gate (the proposed re-split is on the ticket as a comment), and a genuine spec ambiguity.
   - `stopped` — a stall or a failure after two fix rounds. Read the reason; do not relaunch the same thing.
6. **Bring the user one batch**, once every orchestrator has returned: what merged and what a person can now do (the path, not the ticket title), then every `needs-user` item in one `AskQuestion`.

## Rules every role carries

These are restated in each role file; they are not optional for any of them.

- `.env.local` points at the **production** Supabase project. No `supabase` CLI command against the remote, no script that writes to it, from any role. `supabase db push` happens only in this chat, after the user says "push NNNN".
- No force push, no history rewrite on a pushed branch.
- No dev server, watcher or `serve` in the foreground. The orchestrator starts them with `&` and kills them by PID.
- Two attempts at the same approach is the limit (AGENTS.md). The third is a stop with a reason.
- No task runs more than 10 minutes on one approach (`failsafe.md`): beat before every task; reapproach when told or when your own check says stalled; stop when a reapproach stalls too.
- No handoff documents. A ticket that cannot land in its run is reported as stopped and re-split.
- The board is the spec (AGENTS.md, ADR 0011). Shipped code has no standing.
