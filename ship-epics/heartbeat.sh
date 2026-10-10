#!/usr/bin/env bash
# Heartbeats for ship-epics agents: how a supervisor tells a working agent from a stuck one.
#
#   heartbeat.sh beat       FILE STEP [LIMIT]   record that the agent is on STEP (LIMIT seconds, default 600)
#   heartbeat.sh reapproach FILE STEP NOTE      record that STEP stalled and is being taken a different way
#   heartbeat.sh check      FILE                ok | stalled | done | none, with the step and how long it has run
#
# The agent beats DONE as its very last action, after writing its result file.
#
# A step's clock runs from the first of its consecutive beats, so beating the same STEP again does
# not reset it: an agent stuck in a retry loop that keeps beating still reads as stalled. A
# reapproach line breaks the run, so the new approach gets a fresh LIMIT. `check` counts the
# reapproaches already made for the current step; the supervisor stops an agent whose step stalls
# again after one.
#
# Exit codes for `check`: 0 ok, 3 stalled, 4 no heartbeat yet, 5 done.
set -euo pipefail

DEFAULT_LIMIT=600
cmd="${1:-}"
file="${2:-}"
[ -n "$cmd" ] && [ -n "$file" ] || { echo "usage: heartbeat.sh beat|reapproach|check FILE ..." >&2; exit 2; }

case "$cmd" in
  beat)
    step="${3:?beat needs a STEP}"
    limit="${4:-$DEFAULT_LIMIT}"
    mkdir -p "$(dirname "$file")"
    printf '%s\t%s\t%s\n' "$(date +%s)" "$limit" "$step" >>"$file"
    ;;
  reapproach)
    step="${3:?reapproach needs a STEP}"
    note="${4:?reapproach needs a NOTE: what was tried, and what is next}"
    mkdir -p "$(dirname "$file")"
    printf '%s\t%s\tREAPPROACH %s — %s\n' "$(date +%s)" "$DEFAULT_LIMIT" "$step" "$note" >>"$file"
    ;;
  check)
    [ -s "$file" ] || { echo "none"; exit 4; }
    # A reapproach line belongs to the step it names and starts that step's run afresh; its limit
    # is the step's own, from the step's last ordinary beat.
    awk -F'\t' -v now="$(date +%s)" '
      {
        at[NR] = $1; lim[NR] = $2; key[NR] = $3; fresh[NR] = 0
        if (index($3, "REAPPROACH ") == 1) {
          rest = substr($3, 12); cut = index(rest, " — ")
          key[NR] = cut ? substr(rest, 1, cut - 1) : rest
          fresh[NR] = 1; re[key[NR]]++
        } else limitOf[$3] = $2
      }
      END {
        last = NR; step = key[last]
        if (step == "DONE") { printf "done\t%ds\t\t\tDONE\n", now - at[last]; exit 5 }
        first = last
        while (first > 1 && !fresh[first] && key[first - 1] == step) first--
        age = now - at[first]
        limit = (step in limitOf) ? limitOf[step] : lim[last]
        state = (age > limit) ? "stalled" : "ok"
        printf "%s\t%ds\tlimit %ds\treapproached %d\t%s\n", state, age, limit, re[step] + 0, step
        exit (state == "stalled") ? 3 : 0
      }' "$file"
    ;;
  *)
    echo "unknown command: $cmd" >&2
    exit 2
    ;;
esac
