#!/usr/bin/env bash
# M0 status at a glance. Run: npm run m0   (or bash scripts/m0-status.sh)
cd "$(git rev-parse --show-toplevel)" || exit 1
B=/private/tmp/claude-501/-Users-charlespfaff/82bbdec6-bb80-45d8-8e3e-063cffcc92ad/scratchpad/CORE-MILESTONE.md

printf '\n\033[1mM0 — components · blocks · templates\033[0m\n\n'

done=0; left=0
# #228 is an umbrella; its children are the real slices (see its body). 228f folded into #261.
for n in 220:"token layer" 237:"block frame" 238:"block states" 239:"empty state" 240:"tombstone" \
         249:"highlight block" 234:"Life is a page" \
         250:"entries block" 258:"labels on blocks" 219:"check row + list block" \
         259:"bars + heat (228c)" 260:"map gallery/gantt/number/props (228d)" \
         261:"twelve templates (228e)" \
         221:"PondControl" 226:"PondPicker" 227:"chart card" 229:"PondRail" 230:"PondComposer"; do
  num=${n%%:*}; name=${n#*:}
  st=$(gh issue view "$num" --json state --jq .state 2>/dev/null)
  if [ "$st" = "CLOSED" ]; then printf '  \033[32m✓\033[0m  #%-4s %s\n' "$num" "$name"; done=$((done+1))
  elif [ -z "$st" ]; then printf '     #%-4s %s \033[2m(no issue)\033[0m\n' "$num" "$name"
  else printf '  \033[2m○\033[0m  #%-4s %s\n' "$num" "$name"; left=$((left+1)); fi
done
printf '\n  \033[1m%s done · %s to go\033[0m\n' "$done" "$left"

printf '\n\033[1min flight\033[0m\n'
wt=$(git worktree list | grep claude-worktrees | awk '{print $1}' | xargs -n1 basename 2>/dev/null)
[ -n "$wt" ] && echo "$wt" | sed 's/^/  building: /' || echo "  nothing building"
pr=$(gh pr list --state open --json number,title --jq '.[] | "  PR #\(.number) \(.title[:52])"' 2>/dev/null)
[ -n "$pr" ] && echo "$pr" || echo "  no open PRs"

printf '\n\033[1mlast 5 merged\033[0m\n'
git log --oneline -5 --grep='(#' | sed 's/^/  /'

printf '\n\033[1mhygiene\033[0m\n'
printf '  stray dev servers: %s\n' "$(ps aux | grep 'next dev' | grep -v grep | wc -l | tr -d ' ')"
printf '  migrations: local %s · prod in sync at 0017\n' "$(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"
[ -f "$B" ] && printf '\n\033[2mfull log: tail -40 %s\033[0m\n\n' "$B" || printf '\n'
