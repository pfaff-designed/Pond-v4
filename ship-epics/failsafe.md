# Stall failsafe

Every agent in a ship-epics run gets this file with its role prompt. **No task runs longer than 10 minutes on one approach.** An agent past that is taken a different way; an agent that stalls again on the same task is stopped.

The two-attempt rule (AGENTS.md) depends on the agent noticing it is stuck, and a stuck agent is the one least able to notice — on 2026-10-02 two builds retried a blocked step six times each over ten hours. So the clock is kept outside the agent, by its supervisor, from a heartbeat file the agent writes.

```
H=/Users/charlespfaff/Documents/Code/Projects/Pond-v4/ship-epics/heartbeat.sh
$H beat       HB STEP [LIMIT]   I am on STEP (LIMIT seconds, default 600)
$H reapproach HB STEP NOTE      STEP stalled; NOTE says what I tried and what I do instead
$H check      HB                ok | stalled | done | none — the step, how long it has run, reapproaches so far
```

Paths, given to every agent at launch: `HB=/tmp/ship-epics/<EPIC>/<role>[-<ticket>].hb` and `RESULT=/tmp/ship-epics/<EPIC>/<role>[-<ticket>].result.md`. The conductor's orchestrator for an epic uses `orchestrator.hb` / `orchestrator.result.md`.

**This file names no tools.** Where it says `LAUNCH`, `POLL`, `NUDGE`, `STOP`, `RUN` or `LONG`, your harness's `harness.md` says what to call — read it before you act on anything here.

## If you are the agent

- **Beat before every task**, naming it specifically: `build: red — picker opens under the mark`, `gate: storybook`, `fix: reviewer finding 2`, `verify: path step 3`. A task is the size of one test, one file, one gate, one finding, one path step — never "build the ticket".
- **Retrying the same task keeps the same step name.** The clock runs from the first beat of a run of identical steps, so re-beating does not reset it. That is the point: a retry loop reads as stalled.
- **One shell call at a time while you beat.** Do not batch a beat with the work it announces; the beat must land before the work starts.
- **Bound every command**: use `RUN` with at most 600 seconds, and `timeout 600` inside anything that could hang. The one exception is the orchestrator's CI wait, which uses `LONG`. A command that comes back still running is a stall, not something to wait out.
- **Check yourself before any retry**: run `$H check HB`. If it says `stalled`, reapproach without being told.
- **A message from your supervisor arrives between tool calls, not inside one.** That is why every command is bounded: the bound is how soon you can hear "reapproach" or "stop". Read every incoming message before your next command.
- **When told to reapproach** (or when you see `stalled` yourself):
  1. Stop. Kill every process you started (`pkill -f` on its command line or worktree path).
  2. `$H reapproach HB "<the same step>" "<what you tried> → <why it did not converge> → <what you will do instead>"`. Instead means a different approach — a smaller slice, a different tool, a different layer — never the same command with different parameters.
  3. `$H beat HB "<the same step>"` and continue the new way.
- **When told to stop**: kill your processes, write `RESULT` with `status: stopped`, the step, both approaches and why each failed; then `$H beat HB DONE`; then reply.
- **When you finish**: write your full return block to `RESULT`, then `$H beat HB DONE` as your very last action, then reply with the same block. Your supervisor reads the file — it cannot receive your reply while it is still working.

## If you supervise

The orchestrator supervises its build loop, reviewers and verifier; the conductor supervises the orchestrators.

1. `mkdir -p /tmp/ship-epics/<EPIC>` and remove the child's old `HB` and `RESULT`. `LAUNCH` the child with its `HB` and `RESULT` paths. **Record the handle `LAUNCH` gives you** — `NUDGE` and `STOP` need it, and a child you cannot address is a child you cannot stop.
2. **Poll**: `POLL HB`. Between polls, keep your own heartbeat alive with **`relay`**, never a hand-composed `beat`:

   ```
   $H relay <your HB> <the child's HB> <role>
   ```

   `relay` reads the child's current step, reapproach count and limit, and beats your heartbeat with them in the same breath — so your clock moves when the child's work does, stalls when it stalls, and never fires before the child's own does. It also prints the child's `check` line, so one call both beats and polls.

   **Use it rather than composing the beat yourself.** A supervisor that reads the child's step once and then re-beats that same string never resets its own clock, because `check` runs a step's clock from the first of a run of _identical_ beats. It then reads `stalled` while its child is perfectly healthy and moving — which invites killing a working loop, the exact opposite of what this file is for. That false positive cost three diagnoses on 2026-10-10: once from beating a constant (`supervise builder: ralph kan-43`), and twice from copying a real child step and letting it go stale while the child moved on two items.

3. **Act on what `check` says:**
   - `ok` — poll again.
   - `none` for more than 3 minutes after launch — the child is not beating: `NUDGE` it with "You have not written your heartbeat. Beat HB before every task, as failsafe.md says, starting now."
   - `stalled`, `reapproached 0` — `NUDGE` it with "Failsafe: '<step>' has run <age> on one approach. Reapproach now, as failsafe.md says." Poll on.
   - `stalled`, `reapproached 1` or more — the second approach stalled too. `NUDGE` it with "Failsafe: '<step>' stalled again after a reapproach. Stop now, as failsafe.md says." Wait up to 3 minutes for `done`; then `STOP` it and kill anything still running in its worktree (`pkill -f <worktree path>`), whether or not it answered. Treat the task as **stopped**, with the step and both approaches as the reason — never relaunch it unchanged.
   - `done` — read `RESULT`. That is the child's return.
4. A child that is resumed with work (a fix round) gets a fresh `HB` run: its next beat starts the new step's clock.
5. **A child may finish while you are between polls.** If your harness tells you a child has completed, read its `RESULT` — do not keep polling a heartbeat that already says `done`.

### A Ralph loop

A build loop (`ralph.sh`) keeps its own clock, so you do not interrupt it. Every pass runs under `timeout` at 10 minutes; the script beats `HB` before each pass, writes the `reapproach` line itself when a pass misses, tells the next pass what failed, and stops on the second miss. Poll it exactly as above. Only two readings need you:

- `done` — read `RESULT`.
- `stalled` — the script itself has hung: its beats carry the pass limit plus two minutes (25 minutes for the gates), so a stall means no pass ran. `pkill -f "ralph.sh <LOOP>"` (the running pass's process group goes with it), and treat the task as **stopped**.

The conductor, polling every orchestrator at once, run as `POLL` runs: it returns as soon as any orchestrator's state, reapproach count or step changes, or after about nine minutes, then prints every orchestrator's `check` line. Compare those three fields, never the line: its age column changes every tick.

```sh
key() { for f in /tmp/ship-epics/*/orchestrator.hb; do printf '%s ' "$f"; $H check "$f" | awk -F'\t' '{print $1, $4, $5}'; done; }
prev=$(key); end=$((SECONDS + 530))
while [ $SECONDS -lt $end ]; do
  [ "$(key)" != "$prev" ] && break
  sleep 20
done
for f in /tmp/ship-epics/*/orchestrator.hb; do printf '%s\t' "$(basename "$(dirname "$f")")"; $H check "$f"; done
```
