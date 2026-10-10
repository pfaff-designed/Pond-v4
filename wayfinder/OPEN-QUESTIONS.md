# Open questions — M1 is CLOSED. Do not mine this file for questions.

> **Status, 2026-10-01: every M1 question in this file is ruled.** See `docs/adr/0003-build-m1-autonomously-from-the-design-handoff.md`.
>
> §2 (type and spacing) — ruled: UI scale is 11 / 13 / 16 / 18 / 22 / 28 / 36 / 46; 12px resolves to **11** on the machine surface and small meta, **13** everywhere else; spacing is **px** (4/8/12/16/24/32 components, 48/80/120/160/240/320 layouts).
> §4 (area hue) — ruled: **assigned by the user, ink is the default**. `PROJECT_RULES.md` already said so.
> §7 (process) — ruled: full autonomy. Worktree → build → two-axis review → live-verify against the mockup → merge, no per-issue gate. All of M1's issues are filed up front.
> §1 — already answered 2026-09-30 (ADR 0002).
>
> **The handoff is the spec.** `wayfinder/design_handoff_pond/` is complete and high-fidelity. Before writing a question here, check `PROJECT_RULES.md`, `AUDIT.md`'s "Decided, 26 sep" log, the inline values in the `.dc.html` markup, and `docs/adr/`. A value written in the markup is not an open question. Three sessions were lost to re-asking things the handoff had already answered.
>
> What may still legitimately land here: **M2 and M3 questions only** — collaboration, roles, multi-pond — and only once the handoff is genuinely silent on them.

---

_Created 2026-09-30, when `wayfinder/` was flattened into `_archive/`. This file holds
**intent and unanswered questions only.** It is not a status board: shipped state lives in
`git log` and Done Jira tickets (`AGENTS.md`). Delete an entry when it becomes a Jira ticket
or an answered decision — do not let it accumulate._

## 1. ~~Scope: is Phase 7 in the product?~~ ANSWERED 2026-09-30

**Nothing is cut; the work is ordered.** Single-user complete → multi-user → multiple ponds and
organizations, each finished before the next begins. Recorded in
`docs/adr/0002-ship-single-user-first-then-multi-user-then-multi-pond.md`, which also resolves #112
and lists the four surfaces that must be trimmed back to M1 (#96 ships a pond name not a switcher;
presence/access, rail roles state and human↔human diffs all defer).

**Still open, inherited from that decision:** comment cards are specced with an **@pond reply**. A
comment you leave and Pond answers is single-user; the same card with @mentions of other people is
multi-user. Does the single-user half of comments pull forward into M1?

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

- **Autonomy:** merge to `main` after review + live-verify, or park PRs for the user? _Proposed
  default, not yet confirmed: merge mechanical and single-surface slices after review +
  browser-verify; park anything touching a migration, the data model, or a locked spec decision._
- **Task store:** file all the decomposed issues up front, or stay one wave ahead? _Proposed
  default, not yet confirmed: file one phase at a time — enough to see a phase's shape without
  writing acceptance criteria against code that will have changed by the time it is built.
  (`.cursor/skills/ship-epics/` works from Jira ticket keys, so tickets must exist either way.)_
- **Board sync:** the Pond page `Creativity › Pond` holds 34 cards (collection page
  `e023a498-a711-4133-8b7f-afca1c00ddbd`; rows are child pages of `type='row'`, status value
  is the option **id**). Shipped work has not been moved to Done.

## Standing constraint

Every `supabase db push` to prod needs **explicit per-migration go-ahead from the user.**
Migrations on `main` run to `0015`; which of them are applied to prod is not recorded
anywhere and must be confirmed with the user, not assumed. The free-tier project auto-pauses
after ~1 week idle (restore takes ~4 min).
