# Cycle-3 Wave-2 shared design brief (read before building; do NOT re-research)

Base: the locked Press aesthetic — warm paper, Fraunces serif body, Instrument-Serif
display, press-* tokens + pressKickerClass + PROSE_BASE_CLASS, hairline rules
(press-hair/press-line), sage accent, rust for warnings. Motion: one calm authored
moment per surface (--ease-press; .press-arrive/.press-rise precedents), always
prefers-reduced-motion guarded. Established component patterns: dialog-chrome.ts
consts, TreeRow/ChildrenGrid/SourceList molecules, module views as composed cards
at the ~65ch editor column width (metric/table/metric-ring after t31/t34).

**Kanban (from prior Mobbin work — Linear/Notion/Trello boards):** columns as quiet
paper wells separated by hairlines (not heavy gray slabs); cards = small Press cards
(title + optional one-line note), generous row rhythm; column header = kicker voice
(small-caps, muted) + count; drag = card lifts with soft shadow + slight tilt,
target column wash brightens; add-card = quiet + at column foot. At editor column
width, 2-3 visible columns with horizontal scroll (overflow-x-auto, like tables).

**Charts (Bklit promotion):** Bklit visuals already match the R6 Ledger aesthetic —
keep their look, wrap each in the standard module-card chrome (kicker title, caption
line). Axis/label type in the mono-kicker voice, small and muted. Colors from the
press palette only.

**Slash menus (Notion/Linear precedent):** anchored at caret, small paper panel
(dialog-chrome), filter-as-you-type, arrow-key nav + Enter, item = name + one-line
when-to-use in muted caption; max ~8 visible, scroll beyond. One shared SlashMenu
molecule for both chat commands and block palette.

**Cross-page metric rollups:** same instrument language as t31 metrics; a bound
rollup shows its scope quietly in the caption ("across 3 milestone pages"); stale
falls back per t23 pattern with "source missing" note.
