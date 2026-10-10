#!/usr/bin/env bash
# The gates a branch must pass before it is pushed, chosen from what the branch changed.
#
#   gates.sh WORKTREE [BASE]     BASE defaults to origin/main
#
# Prints one line per gate. On the first red gate, prints the tail of its output and exits 1.
# Run from anywhere; every command runs inside WORKTREE.
set -euo pipefail

worktree=${1:?usage: gates.sh WORKTREE [BASE]}
base=${2:-origin/main}
cd "$worktree"

changed=$(git diff --name-only "$base"...HEAD; git diff --name-only HEAD; git ls-files --others --exclude-standard)
log=$(mktemp -t gates)

run_gate() {
  local name=$1
  shift
  if timeout 1200 "$@" >"$log" 2>&1; then
    echo "$name: green"
    return
  fi
  echo "$name: RED"
  tail -60 "$log"
  exit 1
}

run_gate tsc npx tsc --noEmit
run_gate jest npx jest --testPathIgnorePatterns "/node_modules/" "/\.claude/" "\.pglite\.test\.ts$" "/__tests__/helpers/"

lint_targets=$(printf '%s\n' "$changed" | sort -u | rg '\.(ts|tsx|mjs)$' | while read -r f; do [ -f "$f" ] && echo "$f"; done || true)
if [ -n "$lint_targets" ]; then
  # shellcheck disable=SC2086
  run_gate eslint npx eslint $lint_targets
else
  echo "eslint: n/a"
fi

if printf '%s\n' "$changed" | rg -q '^(src/components/|src/stories/|.*\.stories\.tsx$|\.storybook/)'; then
  run_gate storybook npm run test-storybook
else
  echo "storybook: n/a"
fi

if printf '%s\n' "$changed" | rg -q '^supabase/migrations/'; then
  run_gate pglite npm run test:pglite
else
  echo "pglite: n/a"
fi
