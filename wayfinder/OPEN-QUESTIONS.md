# Open questions — decisions that need the user, tracked nowhere else

_Created 2026-09-30, when `wayfinder/` was flattened into `_archive/`. This file holds
**intent and unanswered questions only.** It is not a status board: shipped state lives in
`git log` and closed issues (`AGENTS.md`). Delete an entry when it becomes a GitHub issue
or an answered decision — do not let it accumulate._

## 1. Scope: is Phase 7 (and Phase 6) in the product?

`#120` Collaboration & multi-pond — roles, sharing, invites, comments, @mentions, presence,
human↔human diffs. `#119` External sources (OAuth connectors) is the secondary half.
Both are **placeholder epics with zero filed issues.**

The stated goal is "a second brain, a thinking partner that can collaborate with the user
and manipulate the data on the user's behalf." One reading: **the AI is the collaborator,
not other people** — which closes `#120` and defers `#119`, and moves the finish line from
roughly a third done to roughly half. **Not yet accepted by the user.**

This gates the decomposition run: it is the difference between ~150–220 issues and
materially fewer. `#112` (workspace column overload vs a real multi-pond model) is the same
question wearing a different hat.

## 2. Type and spacing scale rulings (left open by `#139`)

`#139` shipped only the 63 byte-identical token swaps. What remains are rulings, not work:

- `text-xs` (113 sites) and `text-sm` (77 sites) are **off the MN scale**. Does 12px round
  to 11 or to 13?
- `spacing-mn-*` has **zero** clean candidates: all 22 arbitrary px values are
  2/3/5/7/9/11/14/18/22/26/252 — none land on 4/8/12/16/24/32. Needs a **rem-vs-px ruling**
  before any of them can move.
- 28 distinct font sizes currently sit against an 8-step scale.

## 3. The control layer is unsettled (left open by `#128`)

`AGENTS.md` fixes the layers as atoms/molecules/organisms, and no `controls/` layer exists.
`ProposalActions` and probably `VoiceInputButton` will move a second time when `PondControl`
lands. Either add the layer to the law or accept the second move.

## 4. Area hue and glyph: hashed or assigned?

`#135` and `#134` both turn on one question — does an area's hue/glyph stay **hashed off the
page id**, or become an **explicit per-area assignment**? `#134` shipped the per-page mark
picker (`b49bd36`); `#135` (converge the three 7px marks on `KindDot`, retire the Press
`pageAccent` palette) is still open and still waits on this.

## 5. Unverified claims inherited from the wave-A handoff

Recorded as **unverified**, not as fact. Confirm against the code or the browser before
acting on any of them:

- **`#108` AC8 was never verified in-browser** (the Playwright browser was held by a
  concurrent session). The MN reskin's live visual verify is the same blocker and is still
  the reskin's only unproven axis.
- **`#111` removed single figures from freeform pages.** Retiring the `metric` block means a
  figure is only ever a view of a database, so a non-collection page can no longer show one
  figure at all. This follows from the locked decision but is a real behaviour loss.
  `bindKey`/`ref` plumbing was left with zero consumers, deliberately.
- **`#108` changed what counts as content.** `isContent = !hasChildren`, so an empty
  top-level page intended as an area counts as content until it gains a child. Overview
  numbers move.

## 6. Deferred: staleness re-confirm on accepting a stale `edit`

From `ticket-19` (resolved; now in `_archive/`). Accepting a wholesale `edit` proposal whose
`before` no longer matches the current block still clobbers newer content with no diff
against current state. The persisted-resolution fix made historical cards inert, which
closes the common path; this second layer — re-confirm when `before` has drifted — was
deferred and is filed nowhere.

## 7. Process questions still unanswered

- **Autonomy:** merge to `main` after review + live-verify, or park PRs for the user?
- **Task store:** file all the decomposed issues up front, or stay one wave ahead?
  (`.claude/workflows/ship-issue.mjs` takes an issue number, so issues must exist either way.)
- **Board sync:** the Pond page `Creativity › Pond` holds 34 cards (collection page
  `e023a498-a711-4133-8b7f-afca1c00ddbd`; rows are child pages of `type='row'`, status value
  is the option **id**). Shipped work has not been moved to Done.

## Standing constraint

Every `supabase db push` to prod needs **explicit per-migration go-ahead from the user.**
Migrations on `main` run to `0015`; which of them are applied to prod is not recorded
anywhere and must be confirmed with the user, not assumed. The free-tier project auto-pauses
after ~1 week idle (restore takes ~4 min).
