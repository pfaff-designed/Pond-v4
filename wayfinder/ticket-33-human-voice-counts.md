---
id: 33
label: cycle-2:second-brain
status: open
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
