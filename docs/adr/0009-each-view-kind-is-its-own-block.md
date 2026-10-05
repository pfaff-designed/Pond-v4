# ADR 0009 — Each view kind is its own block and `/` command, over one shared no-copy view engine

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** the user (product/design owner), with the agent
- **Related:** KAN-44; ADR 0005 (content is blocks; templates are data; "if a template needs special code, a block is missing"); #111 (chart/big-number are _modes_ of the view block; no block holds a copy of the data); `PondTemplate.dc.html` (the `T` table's per-kind vocabulary); `PondPicker.dc.html` (the `/` menu rows); `src/lib/modules/view/` (the engine); `src/lib/templates/premade.ts`

## Context

Today a single `view` block carries a `mode` (`table` / `board` / `calendar` / `gallery` / `gantt` / `chart` / `big-number`). The `/` menu surfaces some modes as rows, but the stored block is one type whose mode is switched after insertion, and `premade.ts` has to **translate** the template board's per-kind vocabulary into `{ type: 'view', mode: … }`.

Two authoritative sources already express these as **per-kind**, not as one mode-switched block:

- **`PondTemplate.dc.html`**'s `T` table authors template blocks as `kanban`, `gantt`, `number`, `bars`, `heat`, `gallery`, `table` — distinct kinds, not a `view` with a `mode`.
- **`PondPicker.dc.html`**'s `/` menu lists `table`, `gallery`, `chart`, `big number` as **separate block rows**, each routing to its own follow-on (`/table` → a database source picker; `/chart › calories` → a chart-type picker).
- **ADR 0005**'s missing-block check explicitly names `gallery` — _"exists only as a view mode, not a block"_ — as a defect against the block set.

The user's ruling (2026-10-04): **to create a calendar you type `/calendar`, not `/board` then switch.** Every view kind is its own component.

The apparent conflict with **#111** is only apparent. #111's actual law is **"no block holds a _copy_ of the data"** — a chart, a board and a headline figure are _aggregated from the records at read time_ (`view/aggregate.ts`); nothing stores a second copy. That law is **separable** from "there is exactly one `view` type." One is about where the data lives; the other is about how the authoring surface is keyed.

## The ruling

**Each view kind is its own registered block type with its own `/` command** — `/table`, `/board`, `/calendar`, `/gallery`, `/gantt`, `/chart`, `/big-number` — matching `PondTemplate.dc.html` and `PondPicker.dc.html`. The in-place "pick a mode after inserting a generic `view`" model is retired as the authoring surface.

**They share one view engine.** The per-kind types are **thin registrations over the existing config-only, read-from-records, aggregate-at-read-time engine** in `src/lib/modules/view/`. The kind is the **authoring / registration seam**, not a new data store: **no per-kind type holds a copy of the data**, so #111's law stands unbroken.

This is **option (a)** from KAN-44. **Option (b)** — N independent, data-holding modules — is **rejected**: it would reintroduce exactly the per-kind data copies #111 deleted (the old `metric*` / `chart-*` / `stat` / `heatmap` / `timeline` blocks).

## Carve-outs and boundaries

- **A freeform `table` block ≠ a database table-view.** The static `table` block (`tableSchema`, author-typed cells) stays a distinct thing from a database _view_ in table mode. `/table` on the board opens a database source picker (a view); the command → type mapping is settled in KAN-44, but this ADR does **not** merge the two.
- **This does not revert #111** and does **not** resurrect the deleted data-holding display blocks. Those held copies; per-kind view blocks do not.
- **Representation is a build detail, the law is not.** Whether the persisted shape is a distinct `type` per kind or a retained `view` carrier keyed by kind is for KAN-44 to choose; what is fixed here is "per-kind authoring + one no-copy engine," and that **existing `{ type: 'view', mode }` blocks must still read** (back-compat, no destructive migration — `pages.blocks` is jsonb).

## Consequences

- **KAN-44 is unblocked** and should be built as per-kind registrations over the shared engine, with a back-compat read of existing `view` blocks.
- **ADR 0005's "missing blocks" check is satisfied by registration, not new engines:** `gallery` / `gantt` / `chart` (`bars`, `heat`) / `big-number` (`number`) become first-class `/` blocks without any block holding its own data.
- **Template definitions (`src/lib/templates/premade.ts`) are authored in the final per-kind vocabulary**, removing the board→`view` translation layer — so the twelve are written **once**, not rewritten after KAN-44. This is why this ADR **precedes template completion**.
- **ADR 0008** (blocks fill the content column) is unaffected: per-kind view blocks fill the column like every other block.
- **KAN-43** (fractional multi-column layout) is independent and **not** gated by this decision.
