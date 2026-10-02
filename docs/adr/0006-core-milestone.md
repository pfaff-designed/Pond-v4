# ADR 0006 — M0: blocks, templates, and Pond designing pages

> **Naming, settled 2026-10-02.** This milestone is **M0**. It sits _before_ M1, which ADR 0002 defines as
> the entire single-user product (phases 1–6 and 8). The full ladder:
>
> |        |                                                                                                                                                              |
> | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
> | **M0** | the usable spine — component library, block library, templates, Pond designing pages                                                                         |
> | **M1** | the whole single-user product — onboarding, settings and themes, sources, zen, freeform, comments, reminders, trash, deep research, agents and skills, tasks |
> | **M2** | multi-user — sharing, roles, presence, the human↔human diff path                                                                                             |
> | **M3** | multiple ponds and organizations                                                                                                                             |
>
> M0 was previously called "the Core milestone", which caused a real confusion in conversation: "milestone 1"
> read as _this_ milestone when ADR 0002 already meant something several times larger. M0 is roughly 20
> slices; M1's remainder is roughly 70.

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** the user
- **Refines:** ADR 0002 (single-user → multi-user → multi-pond)
- **Related:** ADR 0005 (content is blocks, templates are data)

## The decision

M1 was organised by **subsystem** — phases 1 through 8. That tells you what exists, not when the app is usable. This milestone is organised by **what it takes to use Pond at all**:

> **A page is made of correct blocks. Pond can read the data that is there, and create and design new pages. Templates exist so common cases are not built from scratch.**

Everything else cascades on top of that and is deferred until it holds.

## In scope

**The chrome that makes the app navigable and askable** — the rail, the composer, the breadcrumb, the `/` menu and ⌘K palette, and the controls they need.

**The block layer, end to end:**

- the token layer, so everything is built on legal values (#220)
- `PondBlock`'s shell — the frame every block renders in, all eight states (#222)
- the seven missing block kinds: `highlight`, `props`, `entries`, `bars`, `heat`, `gallery`, `gantt` (#228)
- `PondControl`'s five kinds, since blocks need fields, toggles and checkboxes (#221)
- the check row (#219), the chart card (#227)

**Templates as data** — the twelve premade shapes authored to their boards (#228).

**Pond designing pages:**

- Pond can **read** what is there — the context assembly and workspace outline already do this
- Pond can **create** a page — shipped in #97
- Pond can **design** a page: this requires the AI's emit vocabulary in `ai-composition.ts` to carry **every** block kind. Adding blocks without adding them there leaves Pond unable to use them. **This is a named work item, not an assumption.**
- Pond proposes a template (#168), and a person saves one (#157)

**Life as a page** (#234) — the root stops being a bespoke surface.

**The product-law guards** (#215–#218) — cheap, and they stop the whole class of drift this project spent a day removing.

## Deferred — not blockers to using the app

Onboarding (#169–#178) · zen (#183–#186) · freeform (#189–#191) · comments (#188) · reminders (#197–#198) · trash (#199–#201) · deep research (#179–#182) · agents and skills (#192–#196) · external sources (#161–#167) · tasks (#232–#233).

Each of these sits **on top of** blocks and templates rather than under them. Tasks is the clearest case: a task is a record in a database shown through views, so it needs the block and view layer to be right first — building it sooner would mean building it twice.

**Exception:** the databases root (#160) stays in scope. It is structural — `Pond 03` 3c makes databases one of the two roots, and list-to-table (#101) already files databases under it.

## Why this ordering is cheaper

Every flow slice built on a wrong block is built twice. Today's audit found the divergence concentrated in the component layer while flows over a correct engine held up — so the component layer is the thing that makes or costs everything after it. Finishing it first converts the remaining ~70 flow issues from "build and then reconcile" into "build".

It also produces something usable at the end, which the phase ordering never did: phase 5 could have been complete with a product nobody could open a page in.

## How we know it is done

- A page renders as blocks in the board's frame, in all eight states.
- All twelve premade templates are built from blocks alone, with **zero bespoke template code**. A template needing special code means a block is missing (ADR 0005).
- Pond can compose a page using any block in the vocabulary, through the diff path.
- Life, an area and an ordinary page are all the same thing: a page.
