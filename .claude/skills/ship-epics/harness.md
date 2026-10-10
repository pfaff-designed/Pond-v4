# Harness map — Claude Code

The shared role files in `REPO/ship-epics/` name no tools. This file is the only place that does. Every `UPPERCASE` name they use is defined below; call what it says and nothing else.

`H=/Users/charlespfaff/Documents/Code/Projects/Pond-v4/ship-epics/heartbeat.sh`

## Agents

| Name             | Call                                                                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LAUNCH`         | `Agent` with `subagent_type: "general-purpose"`, `model: "opus"`, `description` = three to five words naming the role and ticket (`"review standards KAN-123"`), `prompt` = the role file's full text + `ship-epics/failsafe.md` + the inputs it names, including `HB` and `RESULT`. |
| `LAUNCH_BROWSER` | The same, with `subagent_type: "claude"` — it needs the Playwright tools, which that type carries.                                                                                                                                                                                   |
| `NUDGE`          | `SendMessage` with `to` = the child's recorded handle and `message` = the text.                                                                                                                                                                                                      |
| `STOP`           | `TaskStop` with `task_id` = the child's recorded handle.                                                                                                                                                                                                                             |

**Subagents here are already background.** `Agent` returns the child's id at once and the child runs on its own; there is no `run_in_background` to pass and no `interrupt` to set. You are notified when a child completes — when that happens, read its `RESULT` instead of polling a heartbeat that already says `done`.

**Record the handle at launch.** The agent id `Agent` returns **is** the handle — keep it. `NUDGE` and `STOP` both accept it, and it survives the child completing. `ListAgents` also prints a name, but it is not in every agent's tool list — a subagent supervising its own children usually lacks it, confirmed 2026-10-10 — so never depend on it: the id is always enough. A child whose handle you did not record is a child you cannot stop.

**Launch siblings in one message.** Two reviewers, or three orchestrators, go in a single assistant turn with one `Agent` call each, or they run one after another.

**`NUDGE` lands between the child's tool calls, not inside one.** There is no mid-call interrupt. That is exactly why `failsafe.md` bounds every command: the bound is how soon a child can hear "reapproach" or "stop". A child ignoring a nudge for more than one bound is not deliberating — `STOP` it.

## Shell

| Name      | Call                                                                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RUN ms`  | `Bash` with `timeout: <ms>`. **The tool caps `timeout` at 600000**, so no single call can outlast the failsafe's ten minutes. Nothing to remember and nothing to get wrong. |
| `BG`      | `Bash` with `run_in_background: true`. Never `&`, never `nohup`. The call returns at once and you are re-invoked when the process exits.                                    |
| `POLL HB` | `Bash` with `run_in_background: true` and the bounded until-loop below. You are re-invoked when it exits, so you wake on the child's change rather than on a timer.         |

**Never poll with a foreground `sleep`.** This harness recognises a sleep-based polling loop and refuses
the call — _"Foreground `sleep` is blocked; use Monitor with an until-loop"_ — and the refusal explicitly
forbids chaining shorter sleeps to get around it. A single foreground `sleep` may succeed, which is the
trap: it works once and then blocks exactly when supervision needs it. Found on the first real run,
2026-10-10. Poll like this instead:

```sh
# Compare state + reapproach count + step, NEVER the whole line: `check` leads with an
# elapsed-age column that changes every tick, so comparing the line fires constantly.
key() { $H check HB 2>/dev/null | awk -F'\t' '{print $1, $4, $5}' || echo none; }
prev=$(key); end=$((SECONDS + 530))
while [ $SECONDS -lt $end ]; do
  cur=$(key)
  [ "$cur" != "$prev" ] && { $H check HB; exit 0; }
  sleep 20
done
echo "timer: $(key)"
```

### `LONG cmd LOG LIMIT`

The gates and the CI wait are the only steps that outlast a 600000ms call, and neither may be started and forgotten. Run them like this:

1. `$H beat HB "<step>" LIMIT` — once, before anything. Re-beating the same step does not reset its clock, which is the point.
2. `BG`: `{ <cmd> ; echo "EXIT=$?"; } > LOG 2>&1`
3. Poll until the sentinel lands, each poll its own `RUN 560000`:

   ```sh
   end=$((SECONDS + 540)); while [ $SECONDS -lt $end ] && ! rg -q '^EXIT=' LOG; do sleep 10; done
   tail -40 LOG; rg -o '^EXIT=\d+' LOG || echo "still running"
   ```

4. `EXIT=0` is green. A non-zero `EXIT=` is red — act on it where the role file says. `still running` after `LIMIT` seconds of the same step is a stall: `pkill -f` the command, say so, and stop.

`gh pr checks --watch` resumes cleanly if a poll ends mid-flight; `gates.sh` does not, which is why it runs under `BG` once rather than in restarted chunks.

## The one gate

| Name           | Call                                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REVIEW_SKILL` | The `code-review` skill: `Skill` with `skill: "code-review"`. If it is not offered to you, read `~/.claude/skills/code-review/SKILL.md` and follow it directly. |

## Jira

Every call is `mcp__plugin_atlassian_atlassian__<name>` and every call takes `cloudId: "1535dfd5-6618-4e61-ac79-655c4c329842"`.

| Name                     | Call                                                                                                                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JIRA.get KEY`           | `getJiraIssue` with `issueIdOrKey: KEY`, **`view: "full"`** and `responseContentFormat: "markdown"`. The default `compact` view is for scanning and will not give you the whole description — and the description is the spec.               |
| `JIRA.jql`               | `searchJiraIssuesUsingJql` with `jql`.                                                                                                                                                                                                       |
| `JIRA.comment KEY`       | `addOrEditJiraIssueComment` with `issueIdOrKey: KEY` and `commentBody` (markdown). Omit `commentId` to add.                                                                                                                                  |
| `JIRA.transition KEY ID` | `transitionJiraIssue` with `issueIdOrKey: KEY` and `transitionId: "<ID>"` — flat, not nested. `31` In Review, `41` Done. It returns the status actually reached; trust that over a read-back.                                                |
| `JIRA.labels KEY`        | `editJiraIssue` with `issueIdOrKey: KEY` and `fields: { labels: [...] }`. **Every field is set, not appended**: `JIRA.get` the current labels and send the whole list back with yours added, or you will erase `now`, `size-S` and the rest. |

## The user

| Name  | Call                                                                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ASK` | `AskUserQuestion` — the conductor's, never an orchestrator's. An orchestrator that needs the user returns `needs-user` and stops; it does not ask. |

## The browser

One Playwright browser is shared by this whole session, orchestrators and verifiers alike, which is why `/tmp/pond-browser.lock` is taken before any of it. Tools are `mcp__playwright__<name>`.

| Name     | Tools                                                                                                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ACT`    | `browser_click`, `browser_type`, `browser_press_key`, `browser_select_option`, `browser_drag`, `browser_hover`, `browser_fill_form`, `browser_file_upload`, `browser_handle_dialog`. Real input, delivered to the page.                                        |
| `READ`   | `browser_snapshot`, `browser_take_screenshot`, `browser_find`, `browser_console_messages`, `browser_network_requests`, and `browser_evaluate` **for reading only** — `getComputedStyle`, `getBoundingClientRect`, attributes.                                  |
| `BANNED` | `browser_run_code_unsafe`, at all. `browser_evaluate` used to click, focus, dispatch an event, call an editor API or write storage. `browser_emulate_media` to change theme — the mode toggle in the breadcrumb pill is the thing under test.                  |
| `TAB`    | There is no tab lock. `browser_navigate` after taking `/tmp/pond-browser.lock`, work in that one tab, and `browser_tabs` only to return to it. Do not `browser_close` the browser — the next orchestrator needs it; close just your own tab if you opened one. |

The ProseMirror workaround: instead of `browser_press_key` with Enter or `/`, use `browser_type` with `slowly: true` (it types one character at a time, which fires the page's key handlers) and `submit: true` where a return is wanted.
