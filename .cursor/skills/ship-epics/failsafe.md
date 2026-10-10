# Stall failsafe

Every agent in a ship-epics run gets this file with its role prompt. **No task runs longer than 10 minutes on one approach.** An agent past that is taken a different way; an agent that stalls again on the same task is stopped.

The two-attempt rule (AGENTS.md) depends on the agent noticing it is stuck, and a stuck agent is the one least able to notice — on 2026-10-02 two builds retried a blocked step six times each over ten hours. So the clock is kept outside the agent, by its supervisor, from a heartbeat file the agent writes.

```
H=/Users/charlespfaff/Documents/Code/Projects/Pond-v4/.cursor/skills/ship-epics/heartbeat.sh
$H beat       HB STEP [LIMIT]   I am on STEP (LIMIT seconds, default 600)
$H reapproach HB STEP NOTE      STEP stalled; NOTE says what I tried and what I do instead
$H check      HB                ok | stalled | done | none — the step, how long it has run, reapproaches so far
```

Paths, given to every agent at launch: `HB=/tmp/ship-epics/<EPIC>/<role>[-<ticket>].hb` and `RESULT=/tmp/ship-epics/<EPIC>/<role>[-<ticket>].result.md`. The conductor's orchestrator for an epic uses `orchestrator.hb` / `orchestrator.result.md`.

## If you are the agent

- **Beat before every task**, naming it specifically: `build: red — picker opens under the mark`, `gate: storybook`, `fix: reviewer finding 2`, `verify: path step 3`. A task is the size of one test, one file, one gate, one finding, one path step — never "build the ticket".
- **Retrying the same task keeps the same step name.** The clock runs from the first beat of a run of identical steps, so re-beating does not reset it. That is the point: a retry loop reads as stalled.
- **One shell call at a time while you beat.** Do not batch a beat with the work it announces; the beat must land before the work starts.
- **Bound every command**: `block_until_ms` at most 600000, and `timeout 600` on anything that could hang. The one exception is the orchestrator's CI wait: `timeout 1200`, `block_until_ms` 1300000, beaten with `LIMIT` 1500. A command that comes back still running is a stall, not something to wait out.
- **Check yourself before any retry**: run `$H check HB`. If it says `stalled`, reapproach without being told.
- **When told to reapproach** (or when you see `stalled` yourself):
  1. Stop. Kill every process you started (`pkill -f` on its command line or worktree path).
  2. `$H reapproach HB "<the same step>" "<what you tried> → <why it did not converge> → <what you will do instead>"`. Instead means a different approach — a smaller slice, a different tool, a different layer — never the same command with different parameters.
  3. `$H beat HB "<the same step>"` and continue the new way.
- **When told to stop**: kill your processes, write `RESULT` with `status: stopped`, the step, both approaches and why each failed; then `$H beat HB DONE`; then reply.
- **When you finish**: write your full return block to `RESULT`, then `$H beat HB DONE` as your very last action, then reply with the same block. Your supervisor reads the file — it cannot receive your reply while it is still working.

## If you supervise

The orchestrator supervises its builder, reviewers and verifier; the conductor supervises the orchestrators.

1. `mkdir -p /tmp/ship-epics/<EPIC>` and remove the child's old `HB` and `RESULT`. Launch the child with `run_in_background: true`, passing its `HB` and `RESULT`. Keep its agent id.
2. **Poll**: `sleep 30; $H check HB` (`block_until_ms` 60000). While you poll, beat your own heartbeat with the child's current step (`supervise builder: <its step>`), so your clock moves when the child's work does and stalls when it stalls.
3. **Act on what `check` says:**
   - `ok` — poll again.
   - `none` for more than 3 minutes after launch — the child is not beating: resume it (`interrupt: true`, `run_in_background: true`): "You have not written your heartbeat. Beat HB before every task, as failsafe.md says, starting now."
   - `stalled`, `reapproached 0` — resume it with `interrupt: true` **and** `run_in_background: true` (so the call returns in seconds and you keep watching): "Failsafe: '<step>' has run <age> on one approach. Reapproach now, as failsafe.md says." Poll on.
   - `stalled`, `reapproached 1` or more — the second approach stalled too. Resume it the same way with: "Failsafe: '<step>' stalled again after a reapproach. Stop now, as failsafe.md says." Wait up to 3 minutes for `done`; then kill anything still running in its worktree (`pkill -f <worktree path>`), whether or not it answered. Treat the task as **stopped**, with the step and both approaches as the reason — never relaunch it unchanged.
   - `done` — read `RESULT`. That is the child's return.
4. A child that is resumed with work (a fix round) gets a fresh `HB` run: its next beat starts the new step's clock.

The conductor, polling every orchestrator at once:

```sh
sleep 60; for f in /tmp/ship-epics/*/orchestrator.hb; do printf '%s\t' "$(basename "$(dirname "$f")")"; $H check "$f"; done
```
