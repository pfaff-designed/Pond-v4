<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Plan before building: grill, then spec

For any non-trivial change (new behavior, new module, a refactor — anything beyond a mechanical edit), before writing code:

1. **Grill first.** Run the `/grill-me` skill (or, if it's unavailable, emulate it): state the plan step by step, hunt for holes — unverified assumptions, edge cases, seams with existing code (registry, chat route, persistence envelope) — and interrogate the user about every unresolved branch of the decision tree. Do not silently pick between interpretations that would produce different products. Keep going until there are no open questions.
2. **Spec if it's needed.** When the grilling reveals real scope — multiple components touched, behavior that had to be resolved through questioning, or work that will outlive the session — turn the resolved answers into a written spec before implementing (use the `/spec` skill if available, otherwise a short document the user signs off on). A grill that resolves quickly with no surprises can skip straight to building.

A clear, small, fully-specified request needs neither — act on it directly.

# Pond product rules (Make Noise)

**Authoritative sources, in order.** These win over anything else, including older `wayfinder/` notes and any shipped code they contradict:

1. `wayfinder/design_handoff_pond/PROJECT_RULES.md` — the product law (vocabulary, diff model, roles, colour/type/icon rules, stance).
2. `wayfinder/design_handoff_pond/AUDIT.md` — flow-by-flow spec; its **"Decided, 26 sep"** section is the authoritative decision log. **Where a mockup frame and a decision disagree, the decision wins.**
3. The `.dc.html` mockups — high-fidelity (final colours/type/spacing/copy, read inline). Exceptions: `Pond 09 Examples` is illustration only; on-screen numbers are fixtures (7h).
4. `wayfinder/GAP-ANALYSIS.md` — the spec-to-code map. **Use it for orientation, not as truth about what exists.** A 2026-09-29 adversarial pass found it inaccurate on 9 surfaces, and every error was _pessimistic about existing code_ (the palette, ink tiers, signals, area colours, type and the dark theme were labelled net-new or partial but are done). Those 9 were corrected on 2026-09-30 and everything shipped since is marked, but it will go stale again: verify against the code before believing any row.
5. `wayfinder/OPEN-QUESTIONS.md` — the questions that need the user and are tracked nowhere else (Phase 6/7 scope, the type/spacing rulings, the control layer, area hue, three unverified behaviour claims). **Intent only, never status.** An entry leaves this file by becoming a GitHub issue or an answered decision.

**Rebuild is settled: do not re-litigate it.** `docs/adr/0001-continue-the-codebase-do-not-rebuild.md` is the decision; `wayfinder/BUILD-VS-REBUILD-EVAL.md` (2026-09-29, 15-agent run with an adversarial pass) is its evidence. It returned **CONTINUE, high confidence** — ~50 surfaces scored, zero full-rebuild verdicts, continue ~104 eng-days vs rebuild ~136. Keep: the unified pages tree, the 8-type field engine (relations/rollups/coerce), the streaming composer + tool-calling route, the module registry + serialization facets, the change-log store, the ARIA rail tree, the `.dark` role architecture, the OTP auth spine. Where a surface genuinely needs replacing, replace that layer and keep the engine under it.

**Shipped state lives in `git log` and closed GitHub issues — never in a `wayfinder/` doc.** Those docs went stale twice in four days. Before planning against "what exists", read the code. Everything under `wayfinder/_archive/` is superseded history: do not treat it as current.

**Supersession (decided 2026-09-26).** The **Make Noise** design language is the single source of visual truth and **supersedes the "R6 Press / v85 Clearing" aesthetic** and the in-flight shell-harvest. When old wayfinder decisions conflict with this handoff, **the new decisions win.** The `press-*` → `color-*` migration is complete (#92): the only surviving references are test guards that assert their absence. Do not reintroduce Press/Clearing tokens, fonts or naming.

**Carry the audit with the slice.** `AUDIT.md`'s p1 items are all closed, but ~100 p2 (missing states, inconsistencies) and ~30 p3 (craft) remain open and are tracked nowhere else. When you build a surface, resolve that surface's p2/p3 items inside the slice, or say in the PR which you deferred and why. The recurring ones: empty and loading states (G6), volume and virtualisation (G7), double-submit idempotency (G9), system-database governance (G10), shortcut collisions with browser keys and the missing Windows/Linux mapping (K1–K4), and the 44px mobile minimum (X1).

## Vocabulary — two registers, never mixed

- **Product surfaces** (menus, settings, help, all copy) use Pond's own words: pond, page, area, block, text, database, source, record, field, view, relation, template, card layout, section, reminder, comment, zen, agent, skill, tool, freeform page, ink, diff, change log, undo, thread, memory, share. A **pond** is a workspace (there are no "spaces"). `Pond 03 Concepts` 3a defines each word.
- **Build/component terms** (atoms, molecules, organisms, layouts, screens) stay in section 02 only. Atomic-design "templates" are called **layouts** so they don't collide with Pond templates.
- Diff buttons are **accept, reject, request changes**. The review surface is the **proposed** view. Deleted things go to **trash**. A page part is a **block** (never "module"). Roles default to admin/moderator/member/guest (a pond may rename them).

## Stance — convivial design (Ivan Illich)

Pond enhances thinking, it does not replace it. Pages change **only** through the person's own edits or an accepted diff. Answers are drafts until kept. Sources are always shown. Choices that belong to the user are offered, never made. Nothing is locked in. **No nudges, streaks-as-engagement, badges, or pings.** Memory is auto-recorded but every note is visible, sourced, logged, and deletable.

## The diff model & where answers live

- Anything Pond, an agent, or another person wants to change arrives as a **proposed diff** (a record in the change log: before/after + status). The person's own edits apply as they type. Pond's own updates, the morning briefing, and capture filing are all diffs too.
- Statuses: **proposed, accepted, rejected, changes requested, outdated, withdrawn, undone, reverted.** A diff whose target is edited after it was made goes **outdated** (accept removed, revise offered). Request-changes opens a note to the proposer, who returns a revised diff. Accept/reject take the whole diff. Revert is a new diff; the change log only grows.
- **Answers live in the composer thread, never on the page.** Every answer shows read chips. An answer becomes a page only through a **make-this-a-page proposal card** (name, place, kind → make page / change place / cancel). There is **no "keep as note."**
- **Undo** covers the session until the tab/app closes; after that, revert from the change log.
- **Threads** run until the context fills; Pond warns, then you compact or clear.

## Roles (shared ponds)

Authors review diffs on their own pages; moderators and admins review any page shared with them at edit. Admins can open every page (so anything private lives in the person's own pond). Threads stay private, admins included, and never feed memory. A new page/template is its author's until shared. Anyone can make agents; only an admin or a database's creator can delete that database. **Only two notifications exist: the invite email and reminders you set** — everything else lands in the proposed view.

## Design language (Make Noise)

- **Paper, not frames.** Wall and modules are the same paper `#FAF9EF`, separated by shadow, not borders. Rail, breadcrumb, composer float over the canvas. Dark: ground `#1B1D14`, cards `#30312A`. Raw palette values never move — only roles reassign (8 themes, 1g).
- **Colour roles (one job each), all from `_ds/mn/tokens/`; never invent a colour:** ink (3 tiers only: 100 / 80 meta / 68) + paper carry everything. Signals: burnt-orange `#D96629` = the one dated thing per screen; wheat `#FFEFAE` = highlighted passages only (always carries ink text); red `#C55347` = diff removals only. Area colours (marks only — area glyph + page-kind dots): sage `#648F7B`, mist `#A5C8D1`, navy `#12354E` (navy→mist on dark). If a screen seems to need another colour, the layout is wrong.
- **Type — split by medium, not author:** prose on a page (incl. Pond's own updates) = **PP Editorial New** serif, weights **200/800 only, never 400**. Composer answers = **PP Neue Montreal** sans at reading scale. The **machine surface** (composer, palette, @-picker, diff cards, provenance chips) = **PP Neue Montreal Mono**, lowercase, tight tracking. Everything else (titles, labels, rail, tables, numbers) = PP Neue Montreal. Data pages lead with one oversized figure, not a chart.
- **Icons — two registers, never mixed:** area/page marks = glyph library via CSS mask over `currentColor`. Functional marks (send, search, chevrons, plus, close) = hand-drawn inline SVG, `stroke-width 1.4`, round caps. **No icon library** — lucide is already retired (#92); do not reintroduce it.
- **Motion:** durations 90/150/280/460/560ms; easing `cubic-bezier(.22,.8,.2,1)`; nothing overshoots; honour `prefers-reduced-motion`. (Current tokens already match.)

## Intelligence layer

Agents are roles the user makes (health coach, advisor); **Pond itself is not an agent** — built-in jobs stay "pond". Skills are recipes an agent follows (trigger, steps, tools, output). Tools are what Pond/agents can use. Every agent works like Pond: you ask → it proposes a diff → you accept. All three live per pond, are visible and named wherever they act. Deep research is the only thing that reads the web (off by default, per question); any agent can be given the web tool. `/` opens skills in the composer and blocks on a page.

## Premade templates are generic shapes

The twelve: page, notes, list, project, tracker, journal, collection, database, dashboard, meeting notes, reading list, habit. Anything specific (a recipe, a renovation) is an example of use or a user's own template — **never premade.**
