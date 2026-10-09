# Pond — project notes

## Files

Mockups are split by section, one file each: `Pond 00 Roadmap`, `Pond 01 Design system`, `Pond 02 Component library` (how Pond is built; real child DCs `PondAtom`, `PondControl`, `PondMolecule`, `PondBlock`, `PondChart` (plots in `pond-charts.js`), `PondPicker` (/ menu, source picker, palette), `PondMenu` (the row menu and who can see, board 2v), `PondRail` (the side panel), `PondComposer`), `Pond 03 Concepts` (Pond’s own words, databases, relations), `Pond 04 Onboarding`, `Pond 05 Shell` (cover, a new pond's empty states, the twelve premade templates via `PondTemplate`, machine surface, settings, mobile, dark), `Pond 06.01`–`06.25` (one storyboard per file, with a second nav row listing all of them), `Pond 07.01`–`07.11` Features (the storyboards regrouped as eleven features, one spec per file: what it does, states and rules pulled from the storyboard captions, three key frames copied from the storyboards and linked back; ids 7a–7k; 07.11 html into a page has no storyboard yet, its frames are drawn for it), `Pond 08 Edges`, `Pond 09 Sources`, `Pond 10 Examples` (one person's filled-in pond; illustrations, not specs), `Pond Archive` (all `.dc.html`). Board ids were renumbered on 26 sep 2026 to match the files; `_idmap.json` maps old ids to new, and `_pre-split-26sep/` holds the files as they were. On 6 oct 2026 Features took 07 and Edges, Sources and Examples moved to 08–10 (ids 8a–8h, 9a, 10a–10aa and d10); `_idmap-features-oct.json` maps those, and `_pre-features/` holds the files before. When a storyboard changes, update its feature file's frames and rules. Board ids are unique across files; links between files use `File.dc.html#id`. New sections get their own file and a row in the roadmap and in every file's top nav. `Pond Mockups -full backup-.dc.html` is the older pre-split snapshot; don't edit it.

Premade templates are generic shapes: page, notes, list, project, tracker, journal, collection, database, dashboard, meeting notes, reading list, habit. Anything specific (a recipe, a kitchen renovation) is an example of use or a user's own template, never premade.

## Intelligence layer

Agents are roles the user makes (health coach, financial advisor, assistant); Pond itself is not an agent and built-in jobs stay "pond". Skills are recipes an agent follows (trigger, steps, tools, output), drafted by Pond when asked and accepted by the user. Tools are what Pond and agents can use: actions on the pond and outside connections. Every agent works like Pond: you ask, it proposes a diff, you accept, and only then is the change made. All three live per pond and are visible and named wherever they act. Skills run when asked, from / or ⌘K, on a schedule, or when something happens. See 6t.

## Decided in the audit

Undo covers the session: everything since Pond was opened, until the tab or app closes. After that, go back by reverting from the change log. An answer becomes a page through a proposal card first (name, place, kind; make page, change place, cancel). There is no "keep as note". Areas picked at setup are in the rail from the start. The rail header is the pond's name, and it opens the switcher. Every page has a kind, a label you can edit, with no tie to a template. A thread (Pond's or an agent's) runs until it fills the context; Pond warns before it does, and you compact or clear. A diff whose target is edited after it was made goes outdated. Deep research reads the web, and so can any agent given the web tool. / opens skills in the composer and blocks on a page. The only notifications are the invite email and reminders you set.

## Two vocabularies

The component library speaks atomic design: atoms, molecules, organisms, layouts, screens. Those are build terms and stay in 02. Concepts and every product surface (menus, settings, help) use Pond's own words: pond, page, area, block, text, database, source, record, field, view, relation, template, card layout, section, reminder, comment, zen, agent, skill, tool, freeform page, ink, diff, change log, undo, thread, memory, share (3a defines each and maps it to its parts). A pond is a workspace; there are no spaces. A shared pond is a pond many people belong to (admins, moderators, members, guests; moderators and admins can accept diffs on any page shared with them at edit, authors on their own pages, and the change log’s proposed view lists every diff you can see across the pond; moderators can accept their own diffs; admins can open every page in a shared pond except private ones (private means private, admins included); role names are the pond’s own, with admin, moderator, member and guest as defaults; when someone leaves, an admin becomes author of their pages and their private pages are deleted; threads stay private, admins included, and never feed the pond’s memory); the pond owns its pages, each page has an author who reviews diffs, as do moderators, a new page is only its author’s until shared, and each person sees only what’s shared with them. There is no separate word for an organization. The buttons on a diff are accept, reject and request changes. Atomic design's "templates" are called layouts so they don't collide with Pond's templates.

## Stance

Pond is a thinking partner: it enhances your thinking, it does not replace it. It is meant as an example of convivial design in AI, after Ivan Illich — a tool used on the person’s own terms. In practice: pages change only through accepted diffs answers are drafts until kept, sources are shown, choices that belong to the user are offered rather than made, nothing is locked in, and there are no nudges or engagement prompts. Memory notes are written only when you ask Pond to remember something, and every note is visible, sourced, logged and deletable.

## Design language

Paper, not frames. The wall and the modules are the same paper (`#FAF9EF`), separated by shadow rather than by borders or a page frame. The rail, the breadcrumb and the composer are floating objects over the canvas, not furniture docked to an edge. Dark theme flips the ground to ink (`#1B1D14`) with cards one ramp step up (`#30312A`); raw values never move, only roles reassign.

Two registers, split by **medium rather than by author**:

- **Prose is prose.** Anything that lives on a page — page descriptions, journal entries, book highlights, and Pond's own updates — is set in the editorial serif. Answers in the composer are not prose; they are set in the sans at reading scale, generous leading, real measure. A `pond — update` label and a timestamp mark what the machine wrote; the type does not change.
- **The machine surface is mono.** The composer, command palette, @-mention picker, diff cards and provenance chips use PP Neue Montreal Mono, lowercase, tight letterspacing. Mono means an interface you talk to, not text a machine produced.

Everything else — titles, labels, rail, tables, numbers — is PP Neue Montreal. Data pages lead with one oversized figure rather than a chart.

## Where answers live

Questions are answered in the composer, never in the page. The composer grows upward into a thread (question in mono, answer in PP Neue Montreal; the serif is for the page only) and the page underneath stays as it was. A page changes only through an accepted diff or `make this a page`. `pond — update` blocks on a page are the page's own notes, written by Pond, not replies to a question. Like every other change they arrive as a proposed diff, the morning briefing and capture filing included, and are on the page only once accepted.

## Colors

All values are raw palette values from the Make Noise system (`_ds/mn/tokens/colors.css`), written inline. Never invent colors.

Ink and paper carry the whole product in the default theme. Three ink tiers only — full, 68%, 80% for small meta — and beyond them exactly three signal colors, each with one job. These are the defaults; a theme (see `Pond 01 Design system` 1g) may reassign any palette color to any role, including the signals, as long as each job keeps exactly one color and no signal shares the ground:

- **burnt orange** `#D96629` — the one thing with a date on it. Never more than one per screen.
- **wheat** `#FFEFAE` — highlighted passages, and only those. Always carries ink text explicitly, so it survives the dark flip.
- **red** `#C55347` — removals in a diff. Nothing else.

Sage `#648F7B`, mist `#A5C8D1` and navy `#12354E` are **area colours**: a user can colour-code an area, and the colour applies to marks only — the area glyph and the kind dots of pages inside it. Ink is the default (no colour). Never text, grounds, cards or buttons. Navy becomes mist on the dark ground. Beyond that, if a screen seems to need another color, the layout is wrong.

## Icons

Two registers, and they don't mix. Area and page marks come from the design system's glyph library, rendered through `_ds/mn/assets/icons/icon-mask.js` over `currentColor`. Functional marks (send, search, mode, chevrons, plus, close) are drawn by hand at `stroke-width="1.4"`, round caps, on small viewBoxes — the library has no functional icons and pressing an expressive glyph into that job is a mistake.

## Type

PP Editorial New is the serif for every display and prose moment. It ships in two weights only: Ultralight 200 (prose, page titles in serif, the wordmark) and Ultrabold 800 (rare display punches), each with an italic. There is no 400; never set the serif at 400 or rely on the browser to pick.
