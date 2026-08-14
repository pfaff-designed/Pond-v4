---
id: 18
label: wayfinder:grilling
status: open
blocked-by: [12, 14]
blocks: []
---

# In-page `section` container & layout grammar

## Question

Graduated from fog by [The module registry contract](ticket-12-module-registry-contract.md) (2026-08-09). t12 locked **recursive composition** (a container module's view renders its child modules via the registry — already exercised by `page`) but deliberately deferred the layout *vocabulary*, because designing it before the visual track produces real requirements would repeat the ops-grammar mistake.

Decide the in-page `section` container — the mid-tier grouping of blocks *below* the page level (the deferred t11 `section`), driven by the visual track's layout direction (t14):

- **Layout schema** — the set of layout primitives the contract carries. Two-column? N-column? Arbitrary grid with spans? Nesting? Keep it to what the aesthetic direction (t14) actually calls for — resist a general grid engine if the design only needs columns.
- **Section as a module** — confirm it slots into t12's registry as a container module: its own Zod schema (`{ layout, children }`), a `view` that arranges children via the recursive-render seam, editability via the host-passed prop. No new contract mechanism — it reuses t12.
- **Data shape** — how does a section nest inside a page's `blocks` array? (A `section` block whose data holds child blocks, vs. per-block layout metadata.) Reconcile with the "everything is a page; grouping is via child pages" law from t11 — when is a `section` warranted vs. promoting to a child page?
- **AI composition hook** — what the AI needs to place blocks *into* a section (feeds/coordinates with t16). The AI must "make layout decisions or execute the user's vision with little friction."

Blocked by t14 (visual language must define the layout direction) and t12 (the recursive-composition seam it drops into).
