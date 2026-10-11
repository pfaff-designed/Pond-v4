#!/usr/bin/env bash
# A Ralph loop: one fresh headless Claude Code pass per plan item, until every item is ticked and
# the gates pass — or an item misses twice, a pass flags a blocker, or the pass budget runs out.
#
#   ralph.sh LOOP WORKTREE HB RESULT     run the loop
#   ralph.sh add LOOP ITEM               add an unticked item (a fix round's finding), above the
#                                        plan's first heading so it sits with the other items
#
# LOOP holds the loop's state, outside the worktree so it is never committed:
#   PROMPT.md  the role prompt every pass gets, unchanged (required)
#   SPEC.md    what the passes build; PROMPT.md tells them to read it
#   PLAN.md    "- [ ] item" lines. A pass does the first unticked item, commits it and ticks it.
#              With no items yet, the first pass is a planning pass that writes them.
#              "- [!] item — reason" is a blocker: the loop stops and reports it.
#   GATES      optional executable, run from WORKTREE once every item is ticked. Red appends a
#              gates item and the loop goes on.
#   passes/    one log per pass
#
# Progress is measured, never taken from the pass's word: a pass progressed if HEAD moved or the
# plan grew (a planning pass, or an item split into smaller ones). A pass that misses gets a
# reapproach line in HB and a note in PLAN.md, so the next fresh pass knows what failed and takes
# another route; a second miss on the same item stops the loop (AGENTS.md: two attempts). A pass
# ended by Claude Code's usage limit is not a miss: the loop stops at once with `usage limit:`.
#
# Every pass runs under `timeout` (GNU, which kills the pass's whole process group), so no pass
# outlives the failsafe's 10 minutes, and HB is beaten before each one: a supervisor polling HB sees
# `stalled` only if this script itself hangs.
#
# Passes run with default-deny permissions. Only the tools in ALLOWED run; nothing can push, reach
# Supabase, or start a server. `.env.local` points at production.
#
# A supervisor stops the loop with `pkill -f "ralph.sh LOOP"`: the running pass's process group
# (in LOOP/pass.pid) goes with it.
#
# Passes run on Sonnet 5, pinned by full name so an alias moving to a new model cannot change the
# builder under a run. Orchestration and review run on Opus 5.5 (SKILL.md, "Models").
#
# Env: RALPH_PASS_SECONDS (600), RALPH_MAX_PASSES (30), RALPH_MODEL (claude-sonnet-5).
# Exit codes: 0 green, 2 stopped, 64 usage.
set -euo pipefail

add_item() {
  local file=$1 item=$2
  touch "$file"
  awk -v line="- [ ] $item" '
    !done && /^## / { print line; print ""; done = 1 }
    { print }
    END { if (!done) print line }
  ' "$file" >"$file.tmp"
  mv "$file.tmp" "$file"
}

if [ "${1:-}" = add ]; then
  [ -n "${2:-}" ] && [ -n "${3:-}" ] || { echo "usage: ralph.sh add LOOP ITEM" >&2; exit 64; }
  add_item "$2/PLAN.md" "$3"
  exit 0
fi

loop=${1:-}
worktree=${2:-}
hb=${3:-}
result=${4:-}
if [ -z "$loop" ] || [ -z "$worktree" ] || [ -z "$hb" ] || [ -z "$result" ] || [ ! -f "$loop/PROMPT.md" ]; then
  echo "usage: ralph.sh LOOP WORKTREE HB RESULT   (LOOP/PROMPT.md must exist)" >&2
  exit 64
fi

H="$(cd "$(dirname "$0")" && pwd)/heartbeat.sh"
pass_seconds=${RALPH_PASS_SECONDS:-600}
max_passes=${RALPH_MAX_PASSES:-30}
model=${RALPH_MODEL:-claude-sonnet-5}
plan="$loop/PLAN.md"
misses="$loop/misses"
mkdir -p "$loop/passes"
touch "$plan"
: >"$misses"

ALLOWED=(
  Read Edit Write Grep Glob
  "Bash(npx tsc:*)" "Bash(npx jest:*)" "Bash(npx eslint:*)" "Bash(npx prettier:*)"
  "Bash(npm run test-storybook:*)" "Bash(npm run test:pglite:*)"
  "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)"
  "Bash(git add:*)" "Bash(git commit:*)" "Bash(git rm:*)" "Bash(git mv:*)" "Bash(git restore:*)"
  "Bash(rg:*)" "Bash(ls:*)" "Bash(wc:*)" "Bash(cd:*)"
)
DENIED=(
  "Bash(supabase:*)" "Bash(npx supabase:*)" "Bash(git push:*)" "Bash(git reset:*)" "Bash(git rebase:*)"
  "Bash(npm run dev:*)" "Bash(npx next:*)" "Bash(npx serve:*)" "Bash(curl:*)" WebFetch WebSearch
  Task Agent
)

if git -C "$worktree" rev-parse -q --verify origin/main >/dev/null; then
  base=$(git -C "$worktree" merge-base HEAD origin/main)
else
  base=$(git -C "$worktree" rev-parse HEAD)
fi

handle_kill() {
  [ -f "$loop/pass.pid" ] && kill -TERM -- -"$(cat "$loop/pass.pid")" 2>/dev/null
  echo "ralph: killed by its supervisor" >&2
  exit 2
}
trap handle_kill TERM INT

count() { rg -c "$1" "$plan" 2>/dev/null || echo 0; }
next_item() { sed -n 's/^- \[ \] //p' "$plan" | head -1; }

finish() {
  local status=$1 reason=$2
  {
    echo "status:  $status"
    [ -n "$reason" ] && echo "reason:  $reason"
    echo "passes:  $pass, on $model"
    echo "commits:"
    git -C "$worktree" log --oneline "$base"..HEAD | sed 's/^/  /'
    echo
    echo "## PLAN.md"
    cat "$plan"
    if [ -f "$loop/passes/gates.log" ]; then
      echo
      echo "## Last gates run"
      cat "$loop/passes/gates.log"
    fi
  } >"$result"
  "$H" beat "$hb" DONE
  echo "ralph: $status${reason:+ — $reason}"
  [ "$status" = green ] && exit 0
  exit 2
}

run_pass() {
  local item=$1 log=$2 brief
  if [ -z "$item" ]; then
    brief="This is the planning pass: PLAN.md has no items yet. Write them, as PROMPT.md says, and commit nothing."
  else
    brief="Your item: $item
Do this item and nothing else, then stop. If PLAN.md's attempts section names this item, an earlier pass failed at it: take a different route."
  fi
  local prompt=${log%.log}.prompt.md
  {
    cat "$loop/PROMPT.md"
    printf '\n## This pass\n\nLoop state: %s (SPEC.md, PLAN.md, passes/). Worktree: %s — your shell starts in it.\nPass %s of at most %s, %s seconds.\n%s\n' \
      "$loop" "$worktree" "$pass" "$max_passes" "$pass_seconds" "$brief"
  } >"$prompt"
  # timeout puts itself at the head of a new process group; killing that group after the pass
  # also takes whatever the pass left running (a jest worker, a stray watcher).
  cd "$worktree"
  timeout -k 30 "$pass_seconds" claude -p --model "$model" \
    --permission-mode dontAsk --permission-prompts none --strict-mcp-config --no-session-persistence \
    --add-dir "$loop" --allowedTools "${ALLOWED[@]}" --disallowedTools "${DENIED[@]}" \
    <"$prompt" >"$log" 2>&1 &
  local pid=$!
  echo "$pid" >"$loop/pass.pid"
  cd - >/dev/null
  # `timeout` has been seen not to fire: on 2026-10-10 a pass was alive at 19:44 with no SIGTERM at
  # 600s and no SIGKILL at 630s, which hung the loop past the failsafe and — because an unkilled pass
  # never returns — silently skipped the miss accounting the two-attempt rule depends on. It is
  # intermittent (four passes in the same run were killed correctly), so the limit cannot rest on it.
  # This watchdog kills the pass's process group itself, a minute after timeout should already have.
  ( sleep $((pass_seconds + 60)); kill -KILL -- -"$pid" 2>/dev/null ) >/dev/null 2>&1 &
  local watchdog=$!
  local code=0
  wait "$pid" || code=$?
  kill "$watchdog" 2>/dev/null || true
  if [ "$code" -eq 124 ] || [ "$code" -eq 137 ]; then
    echo "ralph: pass killed at its ${pass_seconds}s limit" >>"$log"
  elif [ "$code" -ne 0 ]; then
    echo "ralph: pass exited $code" >>"$log"
  fi
  kill -TERM -- -"$pid" 2>/dev/null || true
}

record_miss() {
  local item=$1 log=$2
  "$H" reapproach "$hb" "ralph: $item" "pass $pass made no commit (passes/$(basename "$log")); next pass is told to take another route"
  rg -q '^## Attempts' "$plan" || printf '\n## Attempts\n' >>"$plan"
  {
    echo "- $item — pass $pass made no commit. Its last words:"
    tail -6 "$log" | sed 's/^/    /'
  } >>"$plan"
  echo "$item" >>"$misses"
}

# Claude Code's account limit ends a pass with no commit, which reads exactly like a miss. It is not
# one: the item was never attempted. On 2026-10-11 two loops counted the limit twice and stopped on a
# false "missed twice", with the limit's message written into PLAN.md as the item's failed attempt.
# Waiting it out is no better: the reset is hours away, and a loop asleep that long reads as stalled.
usage_limit() {
  tail -20 "$1" | rg -m1 -i "hit your (session|usage|weekly) limit|usage limit reached|error type rate_limit" || return 1
}

pass=0
while :; do
  blocker=$(sed -n 's/^- \[!\] //p' "$plan" | head -1)
  [ -n "$blocker" ] && finish stopped "blocked: $blocker"

  item=$(next_item)
  if [ -z "$item" ] && [ "$(count '^- \[x\] ')" -gt 0 ]; then
    if [ -x "$loop/GATES" ]; then
      "$H" beat "$hb" "ralph: gates" 1500
      if (cd "$worktree" && "$loop/GATES") >"$loop/passes/gates.log" 2>&1; then
        finish green ""
      fi
      add_item "$plan" "gates: make every gate green — the failure is in $loop/passes/gates.log"
      continue
    fi
    finish green ""
  fi

  pass=$((pass + 1))
  [ "$pass" -gt "$max_passes" ] && { pass=$max_passes; finish stopped "pass budget ($max_passes) spent with items left"; }

  step=${item:-planning}
  "$H" beat "$hb" "ralph: ${step:0:100}" $((pass_seconds + 120))
  head_before=$(git -C "$worktree" rev-parse HEAD)
  items_before=$(count '^- \[[ x!]\] ')
  log="$loop/passes/$(printf '%02d' "$pass").log"

  run_pass "$item" "$log"

  head_after=$(git -C "$worktree" rev-parse HEAD)
  items_after=$(count '^- \[[ x!]\] ')
  if [ "$head_after" != "$head_before" ] || [ "$items_after" -gt "$items_before" ]; then
    grep -vxF -- "$step" "$misses" >"$misses.tmp" || true
    mv "$misses.tmp" "$misses"
    continue
  fi
  if limit=$(usage_limit "$log"); then
    finish stopped "usage limit: $limit — not a miss; once it resets, run the loop again on the same LOOP (the worktree may hold this pass's uncommitted edits)"
  fi
  rg -qxF -- "$step" "$misses" && finish stopped "'$step' missed twice — see the attempts in PLAN.md"
  record_miss "$step" "$log"
done
