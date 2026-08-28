---
id: 30
label: cycle-2:second-brain
status: open
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
