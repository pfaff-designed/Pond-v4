---
id: 33
label: cycle-2:second-brain
status: resolved
blocked-by: []
blocks: []
---

# Counts speak math, not human

## Problem

Audit finding 10: after creating one page, Life home reads
"1 — 0 pages · 1 nested across your life." Technically honest (t25's
reconciliation rule), humanly confusing — a big 1 beside "0 pages."

## Direction

Keep t25's counting RULE (content pages only; focal = top-level + Σ cards),
change the VOICE: captions read like a person — "1 page, tucked in
Creativity." / "Nothing here yet." / "4 pages across your life, 3 of them in
Health." Small phrasing engine over the existing counts (direct, nested,
dominant-area) with jest table tests; focal numeral stays the TOTAL (not
top-level-only) so the big number matches intuition, with the caption carrying
the breakdown. Update overview-model tests accordingly.

## Rules (cycle 2)

Front-end copy → impeccable pass on the phrasing; story tests updated;
Playwright screenshot verify on the three states (empty, one page, many).
/code-review.

## Origin

Cycle-2 audit finding 10.

## Resolution (2026-08-28)

Kept t25's counting RULE unchanged (content pages only; `type !== 'area'`), swapped
the VOICE of the focal caption. The whole change lives in one small, pure phrasing
engine — `phraseFocalCaption()` in `src/lib/pages/overview.ts` — that never touches
rows, only the resolved numbers/names, so the entire copy matrix is a jest table.

**Focal semantics (documented in t25 too).** The focal numeral is the intuitive
TOTAL content pages; the caption carries the human breakdown. For Life this was
already the total; for an area it was already "content within" — so the numbers
didn't move, only the words beside them did. The old math-y captions
("0 pages · 1 nested across your life.", "pages within, at a glance.") are gone.

**The phrasing matrix** (engine inputs → sentence):

| scope | total | direct | dominant                 | caption                                          |
| ----- | ----- | ------ | ------------------------ | ------------------------------------------------ |
| life  | 0     | 0      | —                        | `Nothing here yet.`                              |
| area  | 0     | 0      | —                        | `Nothing here yet.`                              |
| life  | 1     | 1      | none (top-level)         | `1 page, right at the top.`                      |
| life  | 1     | 0      | Creativity               | `1 page, tucked in Creativity.`                  |
| life  | 4     | 1      | Health (3)               | `4 pages across your life, 3 of them in Health.` |
| life  | 6     | 2      | none (even spread / tie) | `6 pages across your life.`                      |
| area  | 1     | 1      | —                        | `1 page within.`                                 |
| area  | 3     | 3      | —                        | `3 pages within.`                                |
| area  | 2     | 1      | —                        | `2 pages within, 1 tucked deeper.`               |
| area  | 5     | 2      | —                        | `5 pages within, 3 tucked deeper.`               |

**Dominant-area rule (Life only).** `dominantAreaForLife()` picks the single
top-level area holding the strict-max content, when it's a real concentration
(≥ 2 pages, no tie). A lone page (total === 1) names its area regardless of count
so it can read "tucked in …". A tie, an even spread, a single-page lead over
several top-level pages, or a workspace with no areas all fall back to the plain
total. Deep nesting is handled by the `direct`/`total` split: an area caption
names what's "tucked deeper" (`total - direct`).

**Card sub-labels** kept their honest phrasing ("N pages inside", "N pages · M
nested") — they read fine and reconcile with the new focal (total = top-level
content pages + Σ card stats; asserted by the reconciliation test).

**Voice pass.** Copy is calm/zen/human in the Press register — sentence-case,
final full stops, no imperative clutter ("Nothing here yet." rather than
"nothing inside yet — add a page, or ask Pond.").

**Tests.** `overview-model.test.ts` gained the `phraseFocalCaption` table (one row
per phrasing) + dominant-area resolution cases (tie → no leader, single-page lead
not crowned, clear leader named); the t25 reconciliation test kept its math and
its comment now documents the focal-semantics move. FocalNumeral + OverviewSurface
stories/story-tests updated to the new voice.

**Validation.** `npm run typecheck` clean; `npx jest` 379 passed (35 suites);
`npm run test-storybook` 82 passed (20 files); eslint clean on all 4 touched files.

**Live Playwright verify (own dev server :3033).** Screenshotted the three real
states against the actual DB:

- `~/t33-verify-life-one-page.png` — Life home, focal **1**, caption
  **"1 page, tucked in Creativity."** (the exact audit-finding-10 case, now human).
- `~/t33-verify-area-creativity.png` — Creativity area overview, focal **1**,
  caption **"1 page within."**
- `~/t33-verify-life-many-pages.png` — after creating temp pages via the rail,
  Life read focal **5**, **"5 pages across your life, 4 of them in Health."**
  (the dominant-area voice). Temp pages then removed; DB confirmed restored to its
  original state (5 areas + Ceramics Studio Plan).
