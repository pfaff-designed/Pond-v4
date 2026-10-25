#!/usr/bin/env bash
# Post-merge sweep. Run after a PR lands: closes the loop so nothing accumulates.
# Never checks out a branch in the main checkout — a dirty non-main checkout must survive untouched.
set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"

if git fetch -q origin main; then
  :
else
  echo "— fetch failed, continuing offline —"
fi

echo "— worktrees —"
if [ "$DRY_RUN" = "1" ]; then
  git worktree prune --dry-run -v
else
  git worktree prune -v
fi
git worktree list

# Branches checked out anywhere (main checkout or any worktree) are never touched.
checked_out_branches="$(git worktree list --porcelain | awk '/^branch /{sub("refs/heads/", "", $2); print $2}')"

echo "— branches compared against origin/main —"
gone=0
for b in $(git branch --format='%(refname:short)'); do
  if [ "$b" = "main" ] || grep -qxF "$b" <<<"$checked_out_branches"; then
    echo "  KEPT (checked out): $b"
    continue
  fi

  ahead="$(git rev-list --count origin/main.."$b" 2>/dev/null || echo "")"
  if [ "$ahead" = "0" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      echo "  would delete (merged into origin/main): $b"
      gone=$((gone+1))
    else
      git branch -d "$b" && gone=$((gone+1))
    fi
    continue
  fi

  pr=$(gh pr list --state merged --head "$b" --json number --jq '.[0].number' 2>/dev/null || true)
  if [ -n "$pr" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      echo "  would delete (squash-merged as PR #$pr): $b"
      gone=$((gone+1))
    else
      echo "  $b -> squash-merged as PR #$pr"
      git branch -D "$b" && gone=$((gone+1))
    fi
  else
    echo "  KEPT (unmerged, no PR): $b"
  fi
done
if [ "$DRY_RUN" = "1" ]; then
  echo "would delete $gone branch(es)"
else
  echo "deleted $gone branch(es)"
fi

echo "— main checkout —"
main_worktree="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
main_dirty="$(git -C "$main_worktree" status --porcelain)"
main_head="$(git -C "$main_worktree" rev-parse --abbrev-ref HEAD)"
main_behind="$(git -C "$main_worktree" rev-list --count HEAD..origin/main 2>/dev/null || echo "")"

if [ -z "$main_dirty" ] && [ "$main_head" = "main" ] && [ -n "$main_behind" ] && [ "$main_behind" != "0" ]; then
  if [ "$DRY_RUN" = "1" ]; then
    echo "  would fast-forward main checkout to origin/main"
  else
    git -C "$main_worktree" merge --ff-only origin/main
  fi
else
  echo "  left alone (dirty, not on main, or already up to date)"
fi

echo "— queue (Jira) —"
echo "  move the merged ticket to Done, then read what's next with:"
echo "  project = KAN AND labels = now AND statusCategory != Done ORDER BY rank"
echo "  https://pfaff-team.atlassian.net/issues/?jql=project%20%3D%20KAN%20AND%20labels%20%3D%20now%20AND%20statusCategory%20!%3D%20Done%20ORDER%20BY%20rank"
