#!/usr/bin/env bash
# Re-sync wayfinder/design_handoff_pond/ from the exported design project.
#
#   ./scripts/sync-handoff.sh [source-dir]
#
# The source is the export's ROOT folder. Its own design_handoff_pond/ subfolder
# is an older bundle and must never be the source: on 2026-10-05 the mirror had
# been synced from it and every rail build read boards a revision out of date.
#
# Copies the boards (*.dc.html), the mockup runtime (*.js) and the design system
# (_ds/mn). Leaves the repo-owned docs alone: AUDIT.md (carries the Decided log),
# PROJECT_RULES.md and README.md. Skips the archive and the pre-split backup,
# which are history, not spec. Regenerates board-values so its guard stays green.
#
# _ds/mn is replaced wholesale (rsync --delete): never patch it in the mirror.
set -euo pipefail

SRC="${1:-$HOME/Downloads/UI mockups for Pond}"
[ -d "$SRC" ] || { echo "no such folder: $SRC" >&2; exit 1; }
SRC="$(cd "$SRC" && pwd)"
cd "$(git rev-parse --show-toplevel)"
DEST="wayfinder/design_handoff_pond"

[ -f "$SRC/PondRail.dc.html" ] || { echo "not an export root: $SRC" >&2; exit 1; }
[ -d "$SRC/_ds/mn" ] || { echo "export has no _ds/mn: $SRC" >&2; exit 1; }

shopt -s nullglob
copied=0
for f in "$SRC"/*.dc.html "$SRC"/*.js; do
  name="$(basename "$f")"
  case "$name" in
    "Pond Archive.dc.html" | "Pond Mockups -full backup-.dc.html") continue ;;
  esac
  if ! cmp -s "$f" "$DEST/$name"; then
    cp "$f" "$DEST/$name"
    echo "  updated $name"
    copied=$((copied + 1))
  fi
done

rsync -a --delete "$SRC/_ds/mn/" "$DEST/_ds/mn/"

for f in "$DEST"/*.dc.html; do
  [ -f "$SRC/$(basename "$f")" ] || echo "  WARNING: $(basename "$f") is in the mirror but not the export"
done

npx prettier --write --log-level warn "$DEST/_ds/mn/**/*.{css,json,md}"
npm run --silent board-values
echo "$copied board file(s) updated from $SRC"
