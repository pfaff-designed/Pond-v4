# Harness map — Cursor

The shared role files in `REPO/ship-epics/` name no tools. This file is the only place that does. Every `UPPERCASE` name they use is defined below; call what it says and nothing else.

`H=/Users/charlespfaff/Documents/Code/Projects/Pond-v4/ship-epics/heartbeat.sh`

## Agents

| Name             | Call                                                                                                                                                                                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LAUNCH`         | `Task` with `subagent_type: generalPurpose`, `model: claude-opus-5-5-medium`, `run_in_background: true`, prompt = the role file's full text + `ship-epics/failsafe.md` + this file + the inputs it names, including `HB` and `RESULT`. Name the model on every launch **and every resume** — never rely on inheritance for these. |
| `LAUNCH_BROWSER` | `Task` with `subagent_type: browser-use` and **no** `model`: Cursor offers no Sonnet 5 for subagents (its Sonnet is 5.5), so the verifier inherits the orchestrator's Opus.                                                                                                                                                       |
| `NUDGE`          | Resume the agent with `interrupt: true` **and** `run_in_background: true`, so the call returns in seconds and you keep watching.                                                                                                                                                                                                  |
| `STOP`           | `NUDGE` it with "Stop now, as failsafe.md says", wait up to 3 minutes for its heartbeat to read `done`, then `pkill -f <its worktree path>` whether or not it answered.                                                                                                                                                           |

**Record the agent id at launch.** `NUDGE` and `STOP` both need it.

**Launch siblings in one message.** Two reviewers, or three orchestrators, go in a single `Task` message with one call each, or they run one after another.

## Shell

| Name      | Call                                                                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RUN ms`  | A shell call with `block_until_ms: <ms>`, at most 600000, and `timeout 600` inside anything that could hang.                                                                            |
| `BG`      | Its **own** shell call with `block_until_ms: 0`. Never `&`, never `nohup`: the shell tool kills everything a call started with `&` the moment that call returns — tested 2026-10-09.    |
| `POLL HB` | `RUN 600000` with the bounded until-loop below. It returns when the child's state changes, so you wake on the child's change rather than on a timer.                                    |
| `RELAY`   | `RUN 60000` with `$H relay <your HB> <child HB> <role>`: one call that beats your heartbeat with the child's current step and prints the child's state. Never compose a `beat` instead. |

Poll on change, not every 30 seconds: a fixed `sleep 30; check` costs the supervisor one turn per tick, and
over a ten-minute build pass that fills its context with identical lines. Compare state, reapproach count
and step, **never the whole line**: `check` leads with an elapsed-age column that changes every tick, so
comparing the line fires constantly (found in Claude Code, 2026-10-10). Leave the loop with `break`, never
`exit`: Cursor's shell calls share one session, and `exit` ends it.

```sh
key() { $H check HB 2>/dev/null | awk -F'\t' '{print $1, $4, $5}' || echo none; }
prev=$(key); end=$((SECONDS + 530)); changed=
while [ $SECONDS -lt $end ]; do
  [ "$(key)" != "$prev" ] && { changed=1; break; }
  sleep 20
done
if [ -n "$changed" ]; then $H check HB; else echo "timer: $(key)"; fi
```

### `LONG cmd LOG LIMIT`

The gates and the CI wait are the only steps that outlast an ordinary bounded call, and neither may be started and forgotten.

1. `$H beat HB "<step>" LIMIT` — once, before anything. Re-beating the same step does not reset its clock, which is the point.
2. One shell call with `block_until_ms: 1300000`:

   ```sh
   timeout 1200 <cmd> 2>&1 | tee LOG; echo "exit=$?"
   ```

3. Exit 0 is green. Non-zero is red — act on it where the role file says. A command still running when `timeout` fires is a stall: say so and stop.

## The one gate

| Name           | Call                                                        |
| -------------- | ----------------------------------------------------------- |
| `REVIEW_SKILL` | Read `~/.claude/skills/code-review/SKILL.md` and follow it. |

## Jira

Atlassian MCP, every call taking `cloudId: '1535dfd5-6618-4e61-ac79-655c4c329842'`.

| Name                     | Call                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JIRA.get KEY`           | `getJiraIssue { issueIdOrKey: KEY, view: 'full', responseContentFormat: 'markdown' }`. The default `compact` view is for scanning and will not give you the whole description — and the description is the spec.                     |
| `JIRA.jql`               | `searchJiraIssuesUsingJql { jql }`.                                                                                                                                                                                                  |
| `JIRA.comment KEY`       | `addOrEditJiraIssueComment { issueIdOrKey: KEY, commentBody }` (markdown). Omit `commentId` to add.                                                                                                                                  |
| `JIRA.transition KEY ID` | `transitionJiraIssue { issueIdOrKey: KEY, transitionId: '<ID>' }` — flat, not nested. `31` In Review, `41` Done. It returns the status actually reached; trust that over a read-back.                                                |
| `JIRA.labels KEY`        | `editJiraIssue { issueIdOrKey: KEY, fields: { labels: [...] } }`. **Every field is set, not appended**: `JIRA.get` the current labels and send the whole list back with yours added, or you will erase `now`, `size-S` and the rest. |

## The user

| Name  | Call                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ASK` | `AskQuestion` — the conductor's, never an orchestrator's. An orchestrator that needs the user returns `needs-user` and stops; it does not ask. |

## The browser

One shared tab across every orchestrator, which is why `/tmp/pond-browser.lock` is taken before any of it.

| Name     | Tools                                                                                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ACT`    | `browser_click`, `browser_type`, `browser_fill`, `browser_press_key`, `browser_select_option`, `browser_drag`. Real input, delivered to the page.                                                                                             |
| `READ`   | `browser_snapshot`, screenshots, and `browser_cdp` **for reading only** — computed styles, bounding boxes, attributes.                                                                                                                        |
| `BANNED` | `browser_cdp` used to act: no `Runtime.evaluate` that clicks, focuses, dispatches an event, calls an editor API or writes storage. Any media-emulation call to change theme — the mode toggle in the breadcrumb pill is the thing under test. |
| `TAB`    | `browser_lock` after your first navigation; unlock when done.                                                                                                                                                                                 |

The ProseMirror workaround: instead of `browser_press_key` with Enter or `/`, use `browser_type` with `slowly: true`.
