#!/usr/bin/env bash
# Post-merge sweep. Run after a PR lands: closes the loop so nothing accumulates.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git checkout main -q && git pull -q --ff-only 2>/dev/null || true

echo "— worktrees —"
git worktree prune -v
git worktree list

echo "— branches fully merged into main —"
gone=0
for b in $(git branch --format='%(refname:short)' | grep -v '^main$' || true); do
  if [ "$(git rev-list --count main.."$b")" = "0" ]; then
    git branch -d "$b" && gone=$((gone+1))
  else
    pr=$(gh pr list --state merged --head "$b" --json number --jq '.[0].number' 2>/dev/null || true)
    if [ -n "$pr" ]; then
      echo "  $b -> squash-merged as PR #$pr"
      git branch -D "$b" && gone=$((gone+1))
    else
      echo "  KEPT (unmerged, no PR): $b"
    fi
  fi
done
echo "deleted $gone branch(es)"

echo "— dirty state check —"
if [ -n "$(git status --porcelain)" ]; then
  echo "  WARNING: working tree dirty — land it or discard it before ending the session"
  git status --short
else
  echo "  clean"
fi

echo "— queue —"
gh issue list --label now --limit 10 2>/dev/null || echo "  (no 'now' label yet)"
