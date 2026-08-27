# Build brief: propose_changes target stamping

Fixes BUG 1 + BUG 2 from `wayfinder/FINDINGS-blank-slate-ai-test.md`: accepted change-proposals commit to the currently-open `nodeId`, not the page the proposal was made against — silent drop from Life root, wrong-page write after navigation, and a t19 success stamp that makes the model claim the dropped change landed.

## Decisions (grilled 2026-08-27)

1. **Stamp at proposal time.** The client records `toolCallId → {nodeId, nodeName}` the moment a `propose_changes` part streams in; Accept commits to the stamped id regardless of where the user is. No tool-schema change.
2. **No node open → no tool.** The route omits `propose_changes` from the toolset when the request carries no `nodeId`, plus a steering line so the model tells the user to open the page (never fakes the edit via `create_page`).
3. **Missing target at accept → all changes counted skipped.** Reuses the existing `skipped`/`skippedOnApply` machinery and the "couldn't apply" card notice; stamp note wording updated so the model reads skipped as NOT applied.
4. **Back-compat: no stamp → today's behavior** (commit to the open node). Old pending cards keep working; nothing bricked.
5. **UX: diff-card header shows the target page name** ("→ Garage → Woodworking Shop Renovation") so accepts are auditable before they land.

## Slices

### 1. `targets` map in the resolutions envelope

`ConversationResolutions` (src/lib/conversation/resolutions.ts) gains `targets: Record<string /* toolCallId */, { nodeId: string; nodeName: string }>`. `parseResolutions` tolerant-parses it (malformed entries dropped); `emptyResolutions` includes it. Rides the existing `{messages, resolutions}` transcript envelope and chat-body plumbing untouched — the server simply ignores it. Add a pure helper here for testability:
`resolveAcceptTarget(resolutions, toolCallId, openNodeId): string | null` — stamped id, else `openNodeId`, else null.

### 2. Stamp on stream (AITerminal)

Effect over `messages`: any `tool-propose_changes` part in `input-available` state with no recorded target gets stamped with the current `nodeId`/`nodeName` (skip when `nodeId` is null — can't occur once slice 4 lands, but guard). Persist via the existing envelope save path.

### 3. Accept commits to the stamped target (AITerminal)

`writeAcceptedChanges(toolCallId, changes)`:

- `target = resolveAcceptTarget(...)`; `null` → return `changes.length` (all skipped — fires the existing notice + stamp).
- `getPage(target)` null (page deleted) → return `changes.length`.
- Otherwise apply + `commitBlocks` against `target`, invalidate `['page', target]` (not the open page's key).

### 4. Route omission + prompt steering

`route.ts`: build the `tools` object conditionally — no `propose_changes` when `!nodeId`. Append a steering line to the system prompt in that case: asks to change existing content must be answered with "open that page and ask again", never routed to `create_page`.

### 5. Honest stamp wording

`resolvePart` in resolutions.ts: when `skippedOnApply > 0`, the note states those changes were NOT applied and must not be claimed as done; offer to re-propose when the user is on the right page.

### 6. Card target label

`ProposalGroup` (and/or `ModuleDiffCard` header) renders "→ {nodeName}" from the stamped target, passed down from AITerminal; falls back to the current context label for unstamped (legacy) cards.

### 7. Tests

- resolutions: `parseResolutions` targets round-trip + tolerance; `resolveAcceptTarget` matrix (stamped / unstamped+open / unstamped+none).
- Accept path: missing-target and deleted-page → `changes.length` skipped (extract or test through the component per existing patterns).
- Route: toolset excludes `propose_changes` when `nodeId` absent (existing route test file pattern).
- Story test: diff card shows the target label.

## Out of scope

Cross-page targeting from Life root (targetTitle resolution), gantt/timeline module, markdown-table-vs-table-module composition consistency, `dashboard` type coercion — all recorded in the findings doc as separate candidates.
