#!/usr/bin/env bash
# The gates a branch must pass before it is pushed, chosen from what the branch changed.
#
#   gates.sh WORKTREE [BASE] [SCOPE]     BASE defaults to origin/main; SCOPE is all (default), related or everything
#
# Local gates prove the change; CI proves the whole suite. CI runs every test and every story on
# every PR in ~3 minutes, in parallel. So locally:
#   related     tsc + eslint (changed files) + jest on tests related to the changed files. No Storybook.
#   all         related, plus Storybook for the stories the change touches: changed *.stories.tsx files,
#               and the sibling X.stories.tsx of every changed X.tsx.
#   everything  the whole jest suite and the whole Storybook suite. For a run that needs it on purpose.
# pglite runs whenever a migration changed. tsc, eslint and jest run in parallel.
#
# Prints one line per gate. If any gate is red, prints the tail of each red gate's output and exits 1.
# Run from anywhere; every command runs inside WORKTREE.
set -euo pipefail

worktree=${1:?usage: gates.sh WORKTREE [BASE] [all|related|everything]}
base=${2:-origin/main}
scope=${3:-all}
case $scope in all | related | everything) ;; *) echo "gates.sh: SCOPE must be all, related or everything, got '$scope'" >&2; exit 2 ;; esac
cd "$worktree"

changed=$(git diff --name-only "$base"...HEAD; git diff --name-only HEAD; git ls-files --others --exclude-standard)
changed=$(printf '%s\n' "$changed" | sort -u)
# A gate past 5 minutes is a problem, not something to wait out (the user, 2026-10-17). `everything` runs whole suites on purpose.
gate_timeout=300
[ "$scope" = everything ] && gate_timeout=1200
logdir=$(mktemp -d -t gates)
trap 'rm -rf "$logdir"' EXIT

ts_files=()
while IFS= read -r f; do [ -f "$f" ] && ts_files+=("$f"); done < <(printf '%s\n' "$changed" | rg '\.(ts|tsx)$' || true)
lint_files=()
while IFS= read -r f; do [ -f "$f" ] && lint_files+=("$f"); done < <(printf '%s\n' "$changed" | rg '\.(ts|tsx|mjs)$' || true)

jest_ignore=(--testPathIgnorePatterns "/node_modules/" "/\.claude/" "\.pglite\.test\.ts$" "/__tests__/helpers/")

# Each gate writes its output to $logdir/<name>.log and its exit code to $logdir/<name>.rc.
start_gate() {
  local name=$1
  shift
  ( timeout "$gate_timeout" "$@" >"$logdir/$name.log" 2>&1; echo $? >"$logdir/$name.rc" ) &
}

order=(tsc)
start_gate tsc npx tsc --noEmit

if [ "${#lint_files[@]}" -gt 0 ]; then
  order+=(eslint)
  start_gate eslint npx eslint "${lint_files[@]}"
else
  echo "eslint: n/a"
fi

if [ "$scope" = everything ]; then
  order+=(jest)
  start_gate jest npx jest "${jest_ignore[@]}"
elif [ "${#ts_files[@]}" -gt 0 ]; then
  order+=(jest)
  start_gate jest npx jest "${jest_ignore[@]}" --passWithNoTests --findRelatedTests "${ts_files[@]}"
else
  echo "jest: n/a"
fi

wait

red=0
for name in "${order[@]}"; do
  if [ "$(cat "$logdir/$name.rc")" = 0 ]; then
    echo "$name: green"
  else
    echo "$name: RED"
    tail -60 "$logdir/$name.log"
    red=1
  fi
done
[ "$red" = 0 ] || exit 1

# Storybook launches browsers, so it runs after the parallel gates rather than beside them.
run_gate() {
  local name=$1
  shift
  if timeout "$gate_timeout" "$@" >"$logdir/$name.log" 2>&1; then
    echo "$name: green"
    return
  fi
  echo "$name: RED"
  tail -60 "$logdir/$name.log"
  exit 1
}

if [ "$scope" = everything ]; then
  if printf '%s\n' "$changed" | rg -q '^(src/components/|src/stories/|.*\.stories\.tsx$|\.storybook/)'; then
    run_gate storybook npm run test-storybook
  else
    echo "storybook: n/a"
  fi
elif [ "$scope" = all ]; then
  stories=()
  while IFS= read -r f; do
    case $f in
      *.stories.tsx) [ -f "$f" ] && stories+=("$f") ;;
      *.tsx) sib="${f%.tsx}.stories.tsx"; [ -f "$sib" ] && stories+=("$sib") ;;
    esac
  done < <(printf '%s\n' "$changed")
  if [ "${#stories[@]}" -gt 0 ]; then
    unique=()
    while IFS= read -r s; do unique+=("$s"); done < <(printf '%s\n' "${stories[@]}" | sort -u)
    run_gate storybook npx vitest --project=storybook run "${unique[@]}"
  else
    echo "storybook: n/a"
  fi
else
  echo "storybook: n/a"
fi

if printf '%s\n' "$changed" | rg -q '^supabase/migrations/'; then
  run_gate pglite npm run test:pglite
else
  echo "pglite: n/a"
fi
