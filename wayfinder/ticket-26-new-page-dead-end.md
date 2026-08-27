---
id: 26
label: ux-audit:finding
status: open
blocked-by: []
blocks: []
---

# ＋ New page is a dead end

## Problem

Clicking the top-right ＋ instantly creates an "Untitled" node at the root —
no name prompt, no destination choice — and it lands typed as an **area**, so
the user gets the empty overview surface ("0 — nothing inside yet — add a
page, or ask Pond") with **no editor to type into and no rename affordance**
(`~/ux-07-new-page.png`). The very first creation act a new user tries stalls
completely; the only way forward is the delete ×.

Notes for the fix: a `NodeCreationModal` organism already exists in
`src/components/organisms/` — reconcile why ＋ bypasses it (or retire one of
the two paths). The overview-not-editor half of this is the same type-switch
question as ticket-22.

## Direction (not yet designed)

- ＋ opens a blank **page** editor with the title field focused (name-first or
  name-inline — decide), defaulting the parent to the current context with an
  easy override (the SavePicker's 3-tier labels already solved destination
  disambiguation for the AI path — reuse).
- Rename must be possible from every surface a page can render as (the
  overview header currently shows the title as a static label).

## Origin

Hands-on UX audit, 2026-08-27. Reproduce: click ＋ from any leaf page.
