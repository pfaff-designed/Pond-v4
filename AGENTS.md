<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# How a session works

**One session, one landable slice, ending in a merge.** Not a handoff document.

- **Work is tracked in Jira, not GitHub issues.** Project `KAN` on `pfaff-team.atlassian.net`
  (cloudId `1535dfd5-6618-4e61-ac79-655c4c329842`), read and written through the Atlassian MCP.
  The open GitHub backlog was closed as not planned on 2026-10-06 when it restarted; do not open
  new GitHub issues. Put the ticket key in the branch name and PR title (`KAN-123`).
- **Only `size-S` and `size-M` tickets get built.** Size is a Jira label. A `size-L` is not a unit
  of work, it is an unsplit one. Split it into S/M children _before_ starting. On 2026-10-03 there
  were 23 open `size-L` issues and 47 recorded `/handoff` calls; those two numbers are the same fact.
- **Split vertically, never by layer.** Every child ticket ends in something a person can do in the
  running app: a thin path from a control they can see down to the data, not "the engine" now and
  "the entry point" later. On 2026-10-09 three of seven merged tickets were engine-only — the glyph
  library with no picker, an HTML reader nothing called, a change log behind an unlisted shortcut —
  and nobody could use them. A ticket whose path needs a later ticket is mis-split: fold one entry
  point into it, or reorder the Workstream so the entry point lands first.
- **Epics are worked by orchestrators.** `ship-epics/` is the workflow (its role prompts and scripts; `.claude/skills/ship-epics/` and `.cursor/skills/ship-epics/` are the two harness heads): the chat is
  the conductor, one orchestrator subagent per epic builds each ticket in a Ralph loop (a fresh agent
  pass per plan item, progress measured from git: `ralph.sh`) and runs reviewer and live-verifier
  subagents through to a merge, and only production migrations, failed reachability gates and real
  ambiguities come back to the user.
- **The queue is the `now` label.** The JQL
  `project = KAN AND labels = now AND statusCategory != Done ORDER BY rank` is the whole answer to
  "what next" — at most 8 tickets, all S or M. Never re-derive priority by reading the backlog; if
  `now` is empty, refill it deliberately as its own task.
- **The ticket description is the spec.** No build-briefs, no planning docs, no `wayfinder/`
  additions. If a ticket is not specced, spec it _into the ticket_, then build. Grill (`/grill-me`)
  only when the ticket is genuinely ambiguous — not as a gate on every build.
- **One review gate before merge:** `/code-review`. That is the gate that has earned its cost.
- **Sweep in the same session as the merge:** delete the branch, remove the worktree, move the
  ticket to Done (transition `41`; `31` is In Review, for an open PR; `21` is In Progress, set when the build starts). Run `./scripts/sweep.sh`.
  Debris is a tax on every future search — on 2026-10-03 a sweep found 45 dead branches, 3
  abandoned worktrees (one a 55MB duplicate checkout inside the repo) and 112 archived planning
  docs, all of which had been polluting every grep for weeks.
- **Do not write a handoff document.** If you are low on context with work unlanded, the slice was
  mis-scoped: land the smallest honest commit or discard the work, then re-split the ticket and say
  so. A handoff doc moves the cost to the next session instead of removing it.

# If you stall, leave the loop. Do not retry the same approach.

**Two attempts at the same approach is the limit.** If the second fails the same way, stop: the approach is wrong, not unlucky. Diagnose, then take a different route.

This is expensive to get wrong. On 2026-10-02 two builds retried a blocked step **six times each** — ~1.6M tokens, ten hours, nothing produced. The cause was a foreground `npm run dev` that never exits. No number of retries would ever have worked, and the sixth attempt cost exactly as much as the first.

**Ten minutes on one task with one approach is a stall,** whether or not it feels like one. A stuck agent is the one least able to notice, so in a `ship-epics` run the clock is kept from outside: every agent beats a heartbeat before each task, and its supervisor interrupts it at 10 minutes to reapproach, and stops it if the new approach stalls too (`ship-epics/failsafe.md`).

**The signature of a stall is repetition without a new error.** "No progress for N seconds", the same failure text twice, a command that has not returned. That is a blocked process or a wrong premise — never something to wait out.

When you see it:

1. **Stop immediately.** Do not retry.
2. **Look for a hung process first** — `ps aux | grep -E "next dev|serve|watch"`. A long-running command is the most common cause, and a leftover dev server also holds its worktree directory open against `rm -rf`.
3. **Check whether the work actually finished.** `git log main..<branch>` — twice now a build had completed and committed before the hang, and was reported as a failure.
4. **Then change the approach**, not the parameters. Smaller slice, different tool, do it in-session instead of delegating, or ask what the real obstacle is.

The same rule applies to a fix that does not take, a test that will not go green, and a rule that keeps condemning correct values: **the second identical failure is the signal to change tactic.**

# Refactoring means gut and replace, not patch toward.

When a surface diverges from its board, **delete the implementation and build the board's version.** Do not migrate it, do not patch it value by value, do not keep its shape and retint it.

Patching preserves the original's structure, and the structure is usually what is wrong. The check row kept a delete `×` nobody designed because five passes patched _around_ it. `mentioned` rendered as 17.5px serif body prose because it was a markdown block being nudged toward a card. Both needed deleting, not adjusting.

So: read the board, list its states, delete the old component, write the new one, and let the call sites break — then fix them to the new shape. **A surface whose lineage is a superseded aesthetic (Press, v85 Clearing, any pre-handoff ticket) has no shape worth preserving at all.**

What survives a gut is **engine logic the boards assume but do not draw**: the field engine, the diff path, persistence, ARIA trees, data derivation. Lift that out first, then gut the surface around it.

# Build like a pragmatic programmer.

These rules come from _The Pragmatic Programmer_ (Hunt and Thomas; the user asked for them on 2026-10-17). Each one below is tied to a failure this repo has actually had. This section is their home: the role files in `ship-epics/` turn them into checks for each role and point back here.

- **DRY means one home for each piece of knowledge, not just no repeated lines.** A rule, a value, a chord or a path lives in exactly one place, and everything else reads it. On 2026-10-17 the ⌘K/⌘J/⌘. hints were spelled out separately across components and drifted (KAN-396). The same day, the run monitor read a session folder written into its source and went silently stale. Text that only looks the same but means different things stays separate. **A board value is not a duplicate:** `13.5px` stays `13.5px` even if a token is close (see above).
- **Make state explicit. Never encode two facts in one field.** Rows were inferred from widths alone, so a block left at ½ silently re-packed every row below it, and side-by-side stopped working (Jira KAN-440). If behaviour depends on a fact, store that fact.
- **Orthogonality.** One change touches one concern. A ticket that has to edit several unrelated modules points to coupling: say so in the PR rather than threading through it. Tests are orthogonal to their environment too. Storybook stories that asserted `⌘K` failed on CI's Linux runner (KAN-396).
- **Program deliberately, not by coincidence.** Know why the code works before you call it done, and know why it fails before you change it. A comment that claims behaviour is a claim, so test it: "a drag closes the menu its press opened" sat in `BlockCanvas.tsx` while the menu stayed open through every drag. A fix you cannot explain is not a fix.
- **Crash early. Use assertions for the impossible.** In development, an impossible state throws (`if (process.env.NODE_ENV !== 'production') throw …`) rather than defaulting quietly. In production, it logs and falls back to the safest state. Catch an error only where you handle it: a swallowed error turns a bug into a mystery.
- **Design by contract at the engine's seams.** The field engine, coercion, rollups, layout and the diff path state what they accept and what they promise, in their types and in a zod parse at the boundary. Callers don't pass what the contract refuses.
- **Finish what you start.** Whoever acquires a listener, timer, subscription, lock or server releases it, in the same scope. Leftover dev servers and browser locks have stalled whole runs.
- **Reversibility.** Prefer decisions you can undo. A new persisted field is optional, and absent means today's behaviour, so old pages read unchanged and the change can be rolled back. Persisted data is engine, not surface: an optional field is not the shim that "Stale goes" forbids, though a code path kept only for a superseded surface is. Production migrations and data deletes are one-way doors, so they go to the user.
- **Tracer bullets, not prototypes.** Every slice is a thin, working path from a control a person can see down to the data ("Split vertically", above). Code nobody can reach is not a tracer; it is a guess.
- **Don't outrun your headlights.** Take small steps, each proven by a command, before taking the next. That is why build items are sized at about six minutes.
- **Find bugs once.** Every behaviour bug a review, a verifier or the user finds gets a test that fails without the fix. A visual-value finding (a colour, a size) is proven by the verifier re-measuring it, not by a jest assertion on a class name. Test the states, not the coverage number. Pure engine code (layout, rollups, date math) gets a table of cases or property-style tests over its whole input space: three scenarios in a table would have shown the KAN-440 re-pack bug at once.
- **"select" isn't broken. Debug with a hypothesis.** When something fails, suspect our own code first, then the test, then the tool. Say out loud (rubber-duck it) what you assumed, what happened instead, and the smallest check that would disprove the assumption, then run that check. That is the same procedure as "If you stall", above.
- **Take responsibility: give options, not excuses.** A stopped ticket, a failed check or a refusal names its cause and offers at least one way forward (a smaller slice, a different route, the decision the user needs to make). "It didn't work" is not a report.
- **Fix broken windows.** Rot you see in lines you touch, you fix in the same change. Rot you only see nearby is written down for the conductor to ticket, so it doesn't spread. Never leave a window you broke.
- **Least privilege.** A policy, role check or key grants the least that works. A migration that widens access (RLS, a grant, a `security definer`) says who can now read or write what, and why. Private means private, admins included.
- **Good-enough software, with the user setting "enough".** Ship the slice the ticket describes, at the board's quality, and stop. Polish beyond the spec is scope; anything short of the spec is not done.

# There are exactly two kinds of component. Everything else is deleted.

1. **The component library** — what Pond itself is built from. `Pond 02 Component library` and its child DCs define it: `PondAtom`, `PondControl`, `PondMolecule`, `PondPicker`, `PondRail`, `PondComposer`, `PondChart`, `PondTemplate`. This is the chrome.
2. **Blocks** — everything a person or Pond can put **on a page**. `PondBlock` defines the family and its states; the module registry is its engine.

That is the whole taxonomy. A component that is neither is **stale, a duplicate, or was never specified** — and it gets deleted, not relocated.

**Duplicates go.** Where two things do one job, the one the boards describe survives and the other is deleted along with its call sites and tests. A shadcn primitive sitting beside its `PondControl` equivalent is a duplicate. A chart kind that is also a block type is a duplicate. A component absorbed into a `Pond*` family whose remnant still exists is a duplicate.

**Stale goes.** Anything superseded by the handoff, or left behind by a ticket that predates it, is deleted outright. Do not keep it working, do not migrate it, do not leave a shim.

**Both kinds are built on shadcn and Bklit.** That is the intended foundation, not a legacy to migrate off:

- **shadcn** is the primitive layer — accessibility, focus management, keyboard handling, state machines (dialog, popover, menu, switch, checkbox, segmented control).
- **Bklit** is the chart layer. `src/components/charts/` is its registry.
- The `Pond*` library **wraps** those and applies the boards' values, states and vocabulary.

So a shadcn primitive sitting under its `Pond*` wrapper is the architecture working, **not** a duplicate. A duplicate is **two Pond-level components doing one job**. When a board specifies something we lack a primitive for, install it from shadcn rather than hand-rolling it — the audit found no field, toggle, styled checkbox, menu row or segmented control in the product, and all five exist upstream.

What is wrong with the primitives we do have is their **values and variant axes**, not their existence: wrap and retint them, and drop variants no board describes.

Atomic-design words (`atoms`, `molecules`, `organisms`, `layouts`, `screens`) are **build vocabulary**: they may describe directories and live in section 02, and they must never reach product copy.

# THE DESIGN IS THE SOURCE OF TRUTH. EXISTING CODE HAS NO STANDING.

`wayfinder/design_handoff_pond/` defines what Pond looks like and what it does. **Shipped code is not evidence of anything.** Most of this app was built before the handoff existed, from internal tickets, and has never been reconciled with it.

So, when code and a board disagree:

- **The board wins. Every time.** Do not look for a reading that preserves what is there.
- **Delete what no board describes.** An affordance with no board behind it is not a feature to protect — it is a defect. The row-delete `×` is the type case: invented by an old ticket, drawn in no board, and it survived five careful review passes because everyone treated existing code as the baseline.
- **Build what the boards draw and the code lacks.** Missing is as much a divergence as wrong. A component with four of its five kinds unbuilt is not "partial", it is absent.
- **Do not preserve behaviour because it works.** Working is not the bar. Matching the design is the bar.

The one thing that must survive is **engine logic the boards assume but do not draw** — the 8-type field engine's relations, rollups and coercion, the diff accept path, persistence, the rail's keyboard tree. Boards specify appearance and states; they do not specify that a rollup recomputes. Keep the engine, replace the surface.

**A value written in a board is final.** Do not round it to a scale, snap it to a token, or reconcile it with prose elsewhere. `13.5px` means 13.5px.

## Flows are benchmarked against Notion, Linear and Asana (decided 2026-10-17)

The boards look right, but they under-cover flows and details. The user has decided: **the boards govern how Pond looks; Notion, Linear and Asana govern how its flows work.**

- **Visual values stay with the board:** type, colour, spacing, radii, components (`Pond 02` still wins among boards).
- **A flow follows the reference apps:** how you create, open, move, edit, undo, and find your way, and what each click and key does.
  - Where a board is silent on a flow, do what the reference apps do.
  - Where a board and the reference apps conflict on a flow, **the app wins**. Do not ask; say in the PR which app you followed, with a Mobbin/Refero screen or flow id.
- An explicit user ruling on a ticket beats both. Example: the calendar day click opens the day view, KAN-453/455.
- Flow work is done journey by journey. A journey review maps the reference app stage by stage, ranks the gaps that hurt intuitiveness, and tickets them as vertical S/M slices. The calendar review (KAN-453–460) is the template.

# The design handoff is the spec. Build from it; do not re-litigate it.

**Sync before you build.** `wayfinder/design_handoff_pond/` is a mirror of the design export. Run
`./scripts/sync-handoff.sh` before any parity slice; it reads the export's root, never its own
`design_handoff_pond/` subfolder, which is an older bundle. On 2026-10-05 every rail build had been
reading boards a revision out of date. Within the boards, the `Pond 02` component DC is the
component's spec and a storyboard only places it (ADR 0011).

`wayfinder/design_handoff_pond/` is a complete, high-fidelity specification of the whole product, and `docs/adr/` holds the decisions made since. Together they are the plan. **Read them and build.**

**Never ask the user to re-decide something already settled.** Before raising any question, check all four: `PROJECT_RULES.md`, `AUDIT.md`'s "Decided, 26 sep" log, the inline values in the `.dc.html` mockups, and `docs/adr/`. A value written in the markup is not an open question. A behaviour in the Decided log is not an open question. If the spec is silent on something small, **pick the option most consistent with `PROJECT_RULES.md`, state the choice in the PR or ticket description, and keep going.**

**Grill only when all three are true:** the handoff and the ADRs are genuinely silent; the choice would produce a materially different product; and getting it wrong would waste real work. That is rare. When it happens, ask once, in one batch, alongside delivered work — never as a gate that stops the build.

**Spec when scope outlives the session** — multiple surfaces, or a decision reached by reasoning that the next agent would otherwise have to redo. Write it into the Jira ticket description, not a new `wayfinder/` doc.

A clear, small, fully-specified request needs neither — act on it directly.

## Definition of done: it looks like the mockup, or it is not done

A slice is finished when the built surface **matches the mockup it came from** — layout, colour, type, spacing, radii, shadow, copy — and the features that storyboard commits to actually work. Rendering without errors is not done. Passing tests is not done. **Code nobody can reach is not done**: write the person's path (the clicks and keys from an open page to the feature) before building, and walk it with real input before the PR. A path that only works through the console, the editor API or a dispatched event does not work.

How to check, every time, before opening a PR. The one exception is a `light` ticket (`ship-epics/orchestrator.md`, step 2c): tests, docs, copy, or a small fix with a known cause and no visual, persistence or control change. Its proof is CI plus its regression test, and it has no live walk.

1. Serve the handoff: `npx serve wayfinder/design_handoff_pond` (the fonts, glyphs and child components need a static server; `support.js` is the mockup runtime — never port it).
2. Open the mockup board and the built surface side by side at the same viewport, and screenshot both.
3. Compare against the inline values in the markup. Every colour, size and spacing value is written there; read it rather than eyeballing.
4. Check both themes. Light is **one** paper (`#FAF9EF` ground _and_ cards); dark is two (`#1B1D14` ground, `#30312A` cards).
5. Walk the storyboard's frames in the real app and confirm each caption's rule holds.

If it doesn't match, fix it and look again. Do not open a PR, and do not report the slice as shipped, on a surface that doesn't match its board. Exceptions, and only these: `Pond 10 Examples` is illustration, not spec, and on-screen numbers are fixtures (8h).

# Pond product rules (Make Noise)

**Authoritative sources, in order.** These win over anything else, including older `wayfinder/` notes and any shipped code they contradict:

1. `wayfinder/design_handoff_pond/PROJECT_RULES.md` — the product law (vocabulary, diff model, roles, colour/type/icon rules, stance).
2. `wayfinder/design_handoff_pond/AUDIT.md` — flow-by-flow spec; its **"Decided, 26 sep"** section is the authoritative decision log. **Where a mockup frame and a decision disagree, the decision wins.**
3. The `.dc.html` mockups — high-fidelity (final colours/type/spacing/copy, read inline). `Pond 07.01`–`07.11` are the eleven features (boards 7a–7k): each gathers its storyboards' rules and states into one spec and links back to their frames. Exceptions: `Pond 10 Examples` is illustration only; on-screen numbers are fixtures (8h).
4. `wayfinder/GAP-ANALYSIS.md` — the spec-to-code map. **Use it for orientation, not as truth about what exists.** A 2026-09-29 adversarial pass found it inaccurate on 9 surfaces, and every error was _pessimistic about existing code_ (the palette, ink tiers, signals, area colours, type and the dark theme were labelled net-new or partial but are done). Those 9 were corrected on 2026-09-30 and everything shipped since is marked, but it will go stale again: verify against the code before believing any row.
5. `wayfinder/OPEN-QUESTIONS.md` — the questions that need the user and are tracked nowhere else (Phase 6/7 scope, the type/spacing rulings, the control layer, area hue, three unverified behaviour claims). **Intent only, never status.** An entry leaves this file by becoming a Jira ticket or an answered decision.

**Rebuild is settled: do not re-litigate it.** `docs/adr/0001-continue-the-codebase-do-not-rebuild.md` is the decision; `wayfinder/BUILD-VS-REBUILD-EVAL.md` (2026-09-29, 15-agent run with an adversarial pass) is its evidence. It returned **CONTINUE, high confidence** — ~50 surfaces scored, zero full-rebuild verdicts, continue ~104 eng-days vs rebuild ~136. Keep: the unified pages tree, the 8-type field engine (relations/rollups/coerce), the streaming composer + tool-calling route, the module registry + serialization facets, the change-log store, the ARIA rail tree, the `.dark` role architecture, the OTP auth spine. Where a surface genuinely needs replacing, replace that layer and keep the engine under it.

**Shipped state lives in `git log` and Done Jira tickets — never in a `wayfinder/` doc.** Those docs went stale twice in four days. Before planning against "what exists", read the code. GitHub issues are history only: the ones closed as not planned on 2026-10-06 were cleared, not shipped. Everything under `wayfinder/_archive/` is superseded history: do not treat it as current.

**Supersession (decided 2026-09-26).** The **Make Noise** design language is the single source of visual truth and **supersedes the "R6 Press / v85 Clearing" aesthetic** and the in-flight shell-harvest. When old wayfinder decisions conflict with this handoff, **the new decisions win.** The `press-*` → `color-*` migration is complete (#92): the only surviving references are test guards that assert their absence. Do not reintroduce Press/Clearing tokens, fonts or naming.

**Carry the audit with the slice.** `AUDIT.md`'s p1 items are all closed, but ~100 p2 (missing states, inconsistencies) and ~30 p3 (craft) remain open and are tracked nowhere else. When you build a surface, resolve that surface's p2/p3 items inside the slice, or say in the PR which you deferred and why. The recurring ones: empty and loading states (G6), volume and virtualisation (G7), double-submit idempotency (G9), system-database governance (G10), shortcut collisions with browser keys and the missing Windows/Linux mapping (K1–K4), and the 44px mobile minimum (X1).

## Vocabulary — two registers, never mixed

- **Product surfaces** (menus, settings, help, all copy) use Pond's own words: pond, page, area, block, text, database, source, record, field, view, relation, template, card layout, section, reminder, comment, zen, agent, skill, tool, freeform page, ink, diff, change log, undo, thread, memory, share. A **pond** is a workspace (there are no "spaces"). `Pond 03 Concepts` 3a defines each word.
- **Build/component terms** (atoms, molecules, organisms, layouts, screens) stay in section 02 only. Atomic-design "templates" are called **layouts** so they don't collide with Pond templates.
- Diff buttons are **accept, reject, request changes**. The review surface is the **proposed** view. Deleted things go to **trash**. A page part is a **block** (never "module"). Roles default to admin/moderator/member/guest (a pond may rename them).

## Stance — convivial design (Ivan Illich)

Pond enhances thinking, it does not replace it. Pages change **only** through the person's own edits or an accepted diff. Answers are drafts until kept. Sources are always shown. Choices that belong to the user are offered, never made. Nothing is locked in. **No nudges, streaks-as-engagement, badges, or pings.** Memory notes are written only when the person asks Pond to remember something; every note is visible, sourced, logged, and deletable.

## The diff model & where answers live

- Anything Pond, an agent, or another person wants to change arrives as a **proposed diff** (a record in the change log: before/after + status). The person's own edits apply as they type. Pond's own updates, the morning briefing, and capture filing are all diffs too.
- Statuses: **proposed, accepted, rejected, changes requested, outdated, withdrawn, undone, reverted.** A diff whose target is edited after it was made goes **outdated** (accept removed, revise offered). Request-changes opens a note to the proposer, who returns a revised diff. Accept/reject take the whole diff. Revert is a new diff; the change log only grows.
- **Answers live in the composer thread, never on the page.** Every answer shows read chips. An answer becomes a page only through a **make-this-a-page proposal card** (name, place, kind → make page / change place / cancel). There is **no "keep as note."**
- **Undo** covers the session until the tab/app closes; after that, revert from the change log.
- **Threads** run until the context fills; Pond warns, then you compact or clear.

## Roles (shared ponds)

Authors review diffs on their own pages; moderators and admins review any page shared with them at edit. Admins can open every page except private ones: private means private, admins included (6w frame 6). When someone leaves, an admin becomes author of their pages and their private pages are deleted. Threads stay private, admins included, and never feed memory. A new page/template is its author's until shared. Anyone can make agents; only an admin or a database's creator can delete that database. **Only two notifications exist: the invite email and reminders you set** — everything else lands in the proposed view.

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
