---
id: 37
label: cycle-3:vocabulary
status: open
blocked-by: []
blocks: []
---

# Manual block authoring + '/' menus, both surfaces (findings F21+F22)

Repeal t10's "todo/metric AI-only" law: user and AI become equal authors.

1. **SlashMenu molecule** (shared): caret-anchored paper panel per
   w2-design-brief.md; filter-as-you-type, ↑/↓ + Enter, Escape closes; item =
   name + muted when-to-use line. Story tests for nav/filter/select.
2. **Page surface**: typing '/' in an EMPTY text block opens the block palette
   (module names + when-to-use from the registry — one vocabulary with the AI's
   catalog; picking replaces the text block with that module's empty state);
   a quiet + affordance between blocks (hover-reveal) opens the same palette
   and inserts THERE (insert-between, not append). Empty states per module:
   define emptyState() per registry entry or a defaults map (todo: 1 blank
   item; table: 2x2; metric: manual 0; kanban: from t35 if merged — else skip
   kanban gracefully by reading the registry, don't hardcode the list).
3. **Block reorder**: per-block drag handle (hover-reveal, left gutter) to
   reorder within the page; persist via the normal debounced save. Keyboard
   alternative (⌥↑/⌥↓ on focused block) for a11y.
4. **Chat surface**: '/' at empty-composer start opens the same SlashMenu with
   chat commands (clear, handoff, save — wire to existing handlers; they're
   currently placeholder-text lore only).

Touches DocumentPanel + AITerminal composer + new molecule; do NOT touch
ai-composition/registry contracts beyond reading them (t35/t36 are editing
those files in parallel — read-only access keeps your merge clean).
Token regime: jest+story proof, no dev server. Resolution + status: resolved.
