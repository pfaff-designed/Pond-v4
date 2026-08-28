---
id: 30
label: cycle-2:second-brain
status: resolved
blocked-by: []
blocks: []
---

# Retrieve: AI reads any page but can only edit the open one

## Problem

Audit finding 2 (major): from Life home, "mark the pottery wheel purchased"
→ refusal: "Open that page and ask again." Yet the same context answered a
detailed READ query about that page perfectly. The read/write asymmetry breaks
"just tell it what to change."

Also finding 8 (minor): an edit proposal silently bundled an INFERRED change
(checking "first class booked") with the requested one under a single
accept/reject — inferred scope-creep must be a separate decision.

## Direction

1. **Cross-page edit targeting**: propose_changes can target any page the
   model can name (it already receives the workspace outline; ticket-19's
   target stamping + c191051's commit-to-stamped-target laid the rails).
   Proposal cards already show "→ Page Name"; accepting must commit to that
   page without it being open, and offer "open page" as a secondary action.
   Guard: target resolution by id from injected context, never by fuzzy title
   alone.
2. **Split inferred changes**: prompt + card grouping so requested vs inferred
   edits arrive as separate decisions (or distinctly labeled sub-cards).

## Rules (cycle 2)

Functionality → live Playwright verify (from Life home: ask for an edit to a
non-open page, accept, navigate there, see it applied). /code-review.

## Origin

Cycle-2 audit findings 2 + 8.

## Resolution

Cross-page edits now work: from anywhere (including the Life home with no page
open), Pond can read and edit any page the user names, and inferred side-effects
arrive as their own decisions.

### Read-context mechanism chosen — `read_page` server tool (on-demand, not bulk inject)

The model gets a titles+ids workspace outline on every turn (as before); page
BODIES are never bulk-injected. To edit a page that is NOT open, the model calls a
new **`read_page(pageId)`** tool — server-executed in the chat route (its closure
captures the per-request supabase client + user), returning that page's title,
type, and blocks WITH ids via the same `formatNodeContext(..., includeBlockIds)`
the open node uses. So the model gets exact block ids to reference, and the prompt
stays lean. `formatWorkspaceOutline` now prefixes every entry with its `[id]` so
the model has an id to pass to `read_page` and to `targetPageId` — resolution is
BY ID from the outline only, never fuzzy title (the ticket guard).

### The full chain (all four sub-parts)

- **(a) Prompt stops refusing.** `NO_OPEN_PAGE_STEERING` is gone; `propose_changes`
  and `read_page` are now offered every turn (even with no open node). The prompt
  teaches the cross-page flow: find the page in the outline → `read_page` its id →
  emit `propose_changes` with `targetPageId` set to that id and block refs from the
  read. The `targetPageId` requirement is stated emphatically ("the edit is written
  to the wrong place or dropped without it") — this emphasis was load-bearing:
  during verify, a softer instruction led the model to read the page and use its
  block ids but OMIT `targetPageId`, so the stamp fell back to "Life" and the edit
  would have been skipped. Sharpening the clause fixed adherence (confirmed: the
  streamed `targetPageId` then matched the `read_page` id exactly).
- **(b) read_page tool** — see mechanism above (`src/app/api/chat/tools.ts`
  `readPageTool` + route execute).
- **(c) Accept commits to the stamped target when target ≠ open.** c191051's rails
  already committed to the stamped target; ticket-30 makes the STAMP itself
  cross-page: `resolveStampTarget` (pure, in resolutions.ts) resolves
  `input.targetPageId` against the pages list BY ID and stamps `{ nodeId,
nodeName }` from that; a batch with no `targetPageId` stamps the open page as
  before. Review hardening (must-fix 1): the stamp is write-once and persisted,
  so it never guesses — while the `['pages']` list is still in-flight stamping
  is DEFERRED (re-runs when it resolves), and an id absent from the loaded list
  stamps `missing: true` instead of falling back to the open page (a fallback
  would have appended the batch's create ops to whatever page was open).
  `resolveAcceptTarget` returns null for a missing stamp → every change skips,
  nothing is written. Block-id refs resolve against the TARGET page's blocks
  (accept reads the target fresh), sibling bindings and `['page', targetId]`
  invalidation ride the existing accept path. Jest pins: cross-page edit
  resolves target-page block ids (applied + committed to target + target cache
  invalidated); a ref absent on the target is skipped; a missing-target create
  op is skipped, never applied to the open page; stamping defers while pages
  load; and a t31 bindKey→metric binding inside a cross-page batch binds to the
  minted id on the stamped target. Cross-page diff PREVIEWS fetch the target's
  blocks (`useQueries` on `['page', id]`) so the "before" side shows the right
  page.
- **(d) Card.** The `→ Page Name` label stays; when the target ≠ open page a small
  "open page" secondary action navigates there. A missing target renders
  "Target page not found — this proposal can't be applied." in the label's place
  (no open-page action — there is no page).

### Split inferred changes

`changeSchema` gains an optional `inferred: boolean` on every op (authoring
annotation only — never persisted; t16 shape preserved, create/edit/remove unions
intact). The prompt instructs the model to emit a requested change and any inferred
side-effect as SEPARATE changes, marking the inferred one. `ModuleDiffCard` renders
a distinct "Inferred" badge (structure only — ticket-32 reskins next). Review
hardening (must-fix 3): the group accept acts on pending REQUESTED changes only —
its copy relabels to "Accept requested" when inferred changes are in the batch,
a batch whose only pending changes are inferred offers no group accept at all,
and each inferred card resolves via its own footer (stories: `InferredMarker`,
`OnlyInferredPending`). Reject-all still sweeps everything pending (bulk-refusing
scope-creep is the safe direction). The flag rides `ChangePreview.inferred`
(folded in per review — no third parallel array).

### Depth parity (review must-fix 2)

`formatWorkspaceOutline` now recurses ALL depths (each entry `[id]`-prefixed,
titles only), and `formatRetrievedPages` carries each match's `[id]` — a page
surfaced by search or nested at depth 3+ is exactly as editable as it is
readable. Jest pins depth-3/4 outline entries and retrieved-page ids.

### Verify (live Playwright, own server :3030)

From Life home (no page open): "add a checklist item … to my Ceramics Studio Plan".
Pond called `read_page` then `propose_changes` with `targetPageId` = the read id;
card stamped **→ Ceramics Studio Plan** + "open page"; Accept → no skip; opened the
page and saw the item live (cache fresh via `['page', targetId]` invalidation).
Then UNDID it (a removal proposal, accepted) so the page ends unchanged — reload
confirmed the test item gone from the document body. 0 console errors.
Screenshots: `~/t30-verify-{1-proposal-crosspage,2-applied-on-target,3-page-restored}.png`.

### Validation

After review fixes: `tsc --noEmit` clean · `jest` 42 suites / 516 tests pass ·
`test-storybook` 105 pass (ProposalGroup `CrossPageOpenAction`, `InferredMarker`,
`OnlyInferredPending`, `TargetMissing` stories) · lint: every touched file clean,
repo-wide problems all pre-existing in `src/components/charts/` +
`src/app/proto/` (at/below the ~80 baseline).

### Deferred / risky

- **`targetPageId` adherence is prompt-driven**, not structurally enforced. The
  emphatic clause held across verify, but a future model change could regress it.
  Since the review fixes, non-adherence is SAFE (an omitted id stamps the open
  page as an ordinary same-page edit whose block refs then skip; a bad id stamps
  missing and skips) — the failure mode is a skipped edit, never a wrong-page
  write. If it bites, the deterministic upgrade is to resolve the target from the
  block ids the batch references (which page owns them) — still id-based, no
  fuzzy title — but that needs the target's blocks loaded, so it was left as
  prompt-only for now.
- Cross-page preview fetches each stamped target's blocks (`useQueries`); a large
  cross-page batch to many distinct pages means one page-fetch each. Fine at
  personal scale.
- The routing eval (`scripts/eval-routing.mts`) wasn't re-run here; the prompt is
  now longer (cross-page + inferred teaching) — worth a pass in a routing-tuning
  session.
