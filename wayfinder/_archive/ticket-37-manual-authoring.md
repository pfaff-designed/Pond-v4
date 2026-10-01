---
id: 37
label: cycle-3:vocabulary
status: resolved
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

## Resolution (2026-08-29, branch ticket-37)

All four parts shipped:

1. **SlashMenu molecule** (`src/components/molecules/SlashMenu.tsx`): paper
   panel (press tokens, press-arrive), filter-as-you-type input, ↑/↓ + Enter,
   Escape, item = name + muted when-to-use, max-h scroll, "No blocks match"
   empty line. Stories carry play tests for nav/filter/select/empty
   (`SlashMenu.stories.tsx`, storybook/test).
2. **Page surface** (DocumentPanel): palette derived at load from
   `Object.values(moduleDescriptors)` minus `page` — registry read-only, so
   t35/t36 modules appear at merge with zero edits. '/' typed into an EMPTY
   text block opens the palette (the slash never persists); picking replaces
   the block with that module's empty state via `emptyBlockForType` (todo: 1
   blank item; table: 2×2; metric: manual 0; metric-ring: 0%; unknown type →
   null → graceful no-op). `InsertBetween` hover-reveal + at every seam
   (before-first included) inserts THERE via the same palette.
3. **Block reorder**: ⠿ drag handle in the left gutter (hover-reveal);
   `draggable` armed only while the pointer is down on the handle so text
   selection inside module inputs never starts a block drag; drop splices
   (not swaps); dragend clears the ghost. Keyboard alternative ⌥↑/⌥↓ on the
   focused block. Both persist via the normal debounced save.
4. **Chat surface** (AITerminal): '/' at composer start opens the same
   SlashMenu with clear/handoff/save, each wired to the existing handlers
   (`handleClear`, `handleHandoff`, `setIsSavePickerOpen`) — selection
   executes immediately.

Proof: tsc 0 errors; jest 567/567 (28 new across slash-menu / block-palette /
chat-command-menu suites); test-storybook 121/121; touched files eslint-clean.
No dev server run, registry/ai-composition untouched.
