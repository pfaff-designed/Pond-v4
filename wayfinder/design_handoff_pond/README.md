# Handoff: Pond

## Overview

Pond is a personal thinking environment. Each pond is a workspace: pages, areas, blocks, databases, sources. There's an AI composer you ask questions in. It's built on convivial-design principles: a page changes only through the person's own edits or through a proposed diff they accept. Answers are drafts. Sources are shown. Choices that belong to the user are offered to them, never made for them. There are no nudges.

This package covers the whole product: design system, component library, concepts, onboarding, shell, twenty storyboards, edge cases, sources, and one filled-in example pond.

## About the design files

The files here are **design references built in HTML**. They show intended look and behaviour; they are not production code. Recreate them in the target codebase using its own patterns and libraries. If no codebase exists yet, pick the framework that fits best (a React + TypeScript web app with a shared design-token layer is the natural fit) and build there.

Each `.dc.html` opens directly in a browser. Serve the folder over a local static server (for example `npx serve .`) so the fonts, icons and child components load. `support.js` is the runtime that renders them. Don't port it; it only exists for the mockups.

## Fidelity

**High fidelity.** Colours, type, spacing, radii, shadows and copy are final. Match them exactly. Every value is written inline in the HTML, so you can read the value straight from the markup.

Two exceptions:

- **`Pond 10 Examples`** is an illustration of use, not a spec.
- Numbers on screens are fixtures (see 8h). They are not real data rules.

## Read these first

1. **`PROJECT_RULES.md`** holds the product rules: vocabulary, the diff model, roles, the colour roles, the type registers and the icon rules. It overrides anything in a mockup that disagrees with it. In your repo, put its contents into your own `CLAUDE.md`.
2. **`AUDIT.md`** is a flow-by-flow audit. The **"Decided, 26 sep"** section at the top lists every behavioural decision made since the mockups were drawn. Where a frame and a decision disagree, the decision wins. The p1 items are all closed. About 100 p2 items (missing states, small inconsistencies) and about 30 p3 items (craft) remain open. Resolve them during the build using the rules.
3. **`Pond 03 Concepts`** (3a) defines each Pond word and maps it to the parts that build it.

## Files, in build order

- **`Pond 00 Roadmap`:** contents, and what is deliberately not being built now.
- **`Pond 01 Design system`:**
  - 1a colour
  - 1g themes (eight presets; each reassigns roles and never changes raw values)
  - 1b type
  - 1c space and surfaces
  - 1d icons and motion
  - 1e voice
  - 1f do and don't
- **`Pond 02 Component library`:**
  - Atomic-design ladder (2o).
  - The real child components, each with its props and states:
    - `PondAtom`
    - `PondControl`
    - `PondMolecule`
    - `PondBlock`
    - `PondChart` (plots in `pond-charts.js`)
    - `PondPicker` (the / menu, source picker and ⌘K palette)
    - `PondRail` (side panel)
    - `PondComposer`
    - `PondTemplate` (the twelve premade templates)
  - 2t: the selection bar, the zen pill, the comment card, the review list and the breadcrumb.
- **`Pond 03 Concepts`:**
  - 3a vocabulary
  - 3b containers and card layouts
  - 3c the two roots (life, databases)
  - 3d relations
  - 3e record pages
- **`Pond 04 Onboarding`:** desktop (4a) and mobile (4b). An account is required; sign-in uses an email link.
- **`Pond 05 Shell`:**
  - The cover, and a new pond's empty states.
  - The twelve templates.
  - The machine surface, settings, mobile and dark.
- **`Pond 06.01`–`06.25`:** one storyboard per file (6a–6z). Frames read left to right. Under each frame is what happens and the rule it commits to.

  | File  | Storyboard               |
  | ----- | ------------------------ |
  | 06.01 | ask → answer → page      |
  | 06.02 | capture → filing         |
  | 06.03 | propose → accept         |
  | 06.04 | first run                |
  | 06.05 | reference → new page     |
  | 06.06 | blank page → recipe      |
  | 06.07 | add a block mid-page     |
  | 06.08 | Pond proposes a template |
  | 06.09 | save as a template       |
  | 06.10 | list into table          |
  | 06.11 | nest a page from a block |
  | 06.12 | edit a template          |
  | 06.13 | create a pond            |
  | 06.14 | share and invite         |
  | 06.15 | change log               |
  | 06.16 | working together         |
  | 06.17 | writing and zen          |
  | 06.18 | deep research            |
  | 06.19 | freeform page            |
  | 06.20 | agents and skills        |
  | 06.21 | tasks                    |
  | 06.22 | visibility and presence  |

- **`Pond 07.01`–`07.11` Features:** the storyboards regrouped as eleven features (7a–7k), one spec per file: what it does, its states and rules from the storyboard captions, and key frames linked back. Ask and answer, diffs and change log, capture uploads and filing, pages and nesting, blocks, templates, writing and freeform, ponds and sharing, agents skills and tools, tasks, html into a page.
- **`Pond 08 Edges`:**
  - 8a–8b: deletion tombstones and frozen links.
  - 8d reminders
  - 8e undo
  - 8f the rail
  - 8g mobile insert
  - 8h the fixtures ledger
- **`Pond 09 Sources`:** connecting a Google Sheet, and what happens when the connection breaks.
- **`Pond 10 Examples`:** one person's pond a few months in (illustration only).

Board ids are unique across files, and links between files use `File.dc.html#id`.

## Core behaviour (summary; full rules in PROJECT_RULES.md and AUDIT.md)

- **Diffs.**
  - Anything Pond, an agent or another person wants to change arrives as a proposed diff. A person's own edits apply as they type.
  - A diff is answered with **accept**, **reject** or **request changes**. Accept and reject take the whole diff; to keep only part of it, request changes. Request changes opens a note under the card, sent to whoever proposed the diff, who sends back a revised one.
  - A diff whose target is edited after it was made goes **outdated**: accept is removed and revise is offered.
  - Statuses: proposed, accepted, rejected, changes requested, outdated, withdrawn, undone, reverted.
- **Answers.**
  - Answers live in the composer thread, never on the page, and every answer shows read chips (what it read).
  - An answer becomes a page through a proposal card (name, place, kind → make page / change place / cancel). If Pond closes with a proposal open, it stays pending.
- **Undo** covers the session, until the tab or app closes. After that, revert from the change log, which only ever grows.
- **Threads** run until the context fills. Pond warns first, and the person compacts or clears.
- **Mobile does everything.** Captures are filed when they arrive, on any device. Offline edits and captures queue on the device and sync when it reconnects. Asking needs a connection, and the composer says so.
- **Databases.**
  - A table is always a view of a database, so turning a list into a table creates one.
  - A page made under a collection backed by a database becomes a record in it.
- **Shared ponds.**
  - Default roles are admin, moderator, member and guest; a pond can rename them.
  - Authors review diffs on their own pages. Moderators and admins review on any page shared with them at edit.
  - Admins can open every page except private ones: private means private, admins included. Threads stay private, admins included.
  - A new page or template is only its author's until it's shared.
  - Only the author, moderators and admins can reshare a page.
  - When someone leaves, their pages go to the admin who removed them, or to the longest-standing admin if they left on their own, and their private pages are deleted. Any admin can hand the pages on.
  - Anyone can make an agent. Only an admin or a database's creator can delete that database.
  - Hovering a block shows who last edited it, and a source shows who connected it.
- **Notifications.** There are only two: the invite email and reminders the person sets. @-mentions and everything else land in the proposed view.
- **Intelligence.**
  - Agents are roles the user makes; Pond itself is not an agent. Skills are recipes an agent follows. Tools are what Pond and agents can use.
  - Deep research reads the web, and so can any agent given the web tool.
  - / opens skills in the composer and blocks on a page.

## Design tokens

All values come from `_ds/mn/tokens/`. Only raw palette values are used; never invent a colour.

**Colour (light theme)**

- `#FAF9EF` paper: the ground and the cards (one sheet, separated by shadow).
- `#1B1D14` ink: text and the primary button.
- Ink at 100%, 80% (small meta) and 68%: the only three text tiers.
- **Signals, one job each:**
  - `#D96629` burnt orange: the one dated thing per screen.
  - `#FFEFAE` wheat: highlighted passages only, always carrying ink text.
  - `#C55347` red: removals in a diff.
- **Area colours**, for marks only (the area glyph and page kind dots): `#648F7B` sage, `#A5C8D1` mist, `#12354E` navy (navy becomes mist on the dark ground).
- **Dark theme:** ground `#1B1D14`, cards `#30312A`. Roles move between themes; raw values never change.
- **Hairlines:** ink at 9% (line) and 5.5% (hair). Hover fill: ink at 7%.

**Type**

- **PP Editorial New** is the serif for prose and display. It ships in only two weights, Ultralight 200 and Ultrabold 800, each with an italic. Never set it at 400. Page prose is 17.5px / 1.75, max-width 58ch.
- **PP Neue Montreal** is the sans for titles, labels, the rail, tables and numbers. Composer answers are 13.5px / 1.55. Page titles are 38px, 700, uppercase, −.01em tracking.
- **PP Neue Montreal Mono** is used for the machine surface: the composer, the palette, the @-picker, diff cards and provenance chips. It is set lowercase with tight letterspacing, usually 10.5–12.5px.
- UI type sizes step through 11 / 13 / 16 / 18 / 22 / 28 / 36 / 46.

**Surfaces**

- **Cards:** radius 20px, shadow `0 1px 2px rgba(40,34,24,.04), 0 8px 24px rgba(40,34,24,.06)`.
- **Floating glass** (the rail cluster, breadcrumb, composer and selection bar):
  - background `linear-gradient(160deg, rgba(255,255,255,.86), rgba(255,255,255,.64))`
  - `backdrop-filter: blur(24px) saturate(1.3)`
  - border `1px solid rgba(255,255,255,.9)`
  - shadow `inset 0 1px 0 rgba(255,255,255,.7), 0 20px 54px rgba(40,34,24,.14)`
- **Radii:** pills 999px; composer 20px; inner cards 14px; rows 10px.
- **Spacing:** components use 4 / 8 / 12 / 16 / 24 / 32; layouts use 48 / 80 / 120 / 160 / 240 / 320.

**Motion**

- Durations: instant 90ms, quick 150ms, settle 280ms, calm 460ms, slow 560ms.
- Easing: `cubic-bezier(.22,.8,.2,1)`. Nothing overshoots.
- Honour `prefers-reduced-motion`.

## Assets

- **Fonts** are in `_ds/mn/assets/fonts/`: PP Neue Montreal, PP Neue Montreal Mono, and PP Editorial New (200, 800 and the italics). They're licensed; check the licence for production use.
- **Glyphs:** 182 solid marks in `_ds/mn/assets/icons/`, used only for areas and pages. They render as a CSS mask over `currentColor` (see `icon-mask.js`).
- **Functional icons** (send, search, chevrons, plus, close) are drawn by hand as inline SVG: `stroke-width 1.4`, round caps, small viewBoxes. Lift the paths from the mockups. Don't substitute an icon library.
- **No photography.** Image blocks in the mockups are placeholders.
