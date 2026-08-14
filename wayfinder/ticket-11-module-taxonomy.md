---
id: 11
label: wayfinder:grilling
status: resolved
blocked-by: []
blocks: [12, 13]
---

# Module taxonomy: module vs. page vs. block vs. chrome

## Question

We committed to a **unified registry** — app chrome and content are all "modules." Before the registry contract (t12) or atomic layering (t13) can be designed, the vocabulary must be pinned:

- What exactly is a **module**? Identical to today's `Block` (text/todo/metric), a superset, or a different concept that blocks are one kind of?
- How does a module relate to a **page** (the data-model unit — a self-referential node in the tree holding `blocks` + `embedding`)? Does a page render as a composition of modules? Is a page itself a module?
- Is app **chrome** (sidebar page-tree, document panel, AI terminal, diff card) genuinely a registered module, or a module _host_? Where is the line between "a module" and "the frame that lays modules out"?
- Do modules nest/compose (a module containing modules), and if so how deep — is "module" both the leaf (a todo) and the container (a page section)?
- Reconcile the existing law "everything is a page" (data) with the new "everything is a module" (UI): same tree viewed twice, or two trees?

Resolve with /domain-modeling. Output: a crisp glossary (module, page, block, chrome, host, slot) that t12/t13 build on. Uses the data model (ticket-02) and block schema (ticket-09) as incumbent authority.

## Answer

Resolved via /domain-modeling (2026-08-09). Full glossary written to `CONTEXT.md` (repo root). Summary:

**A module is a (schema + renderer) pair** registered under a type string — a self-contained functional UI unit. "Everything the AI composes is a module."

- **Module ↔ block.** "Everything is a module"; blocks are just modules living in a page's content array. Simple blocks = `text`/`todo`/`metric` (incumbent ticket-09); complex blocks = chart/calendar/gantt/kanban. Complexity is a spectrum, not two categories — `todo` is a (simple) module.
- **Module ↔ page.** **Pages are also modules** — a page is a *container module* holding an ordered list of block-modules plus child pages. One tree viewed twice: `pages` is the data structure ("everything is a page"), rendering it is module composition. Resolves the "same tree or two trees" question: **same tree, viewed twice.**
- **Registry floor = the whole module.** The AI composes (arranges + configures) *whole* modules; it never assembles one from smaller parts. A complex module's internals (a kanban's cards/columns) are **private** data in its own schema — not separately registered. Chosen so "the registry of what the AI can build shouldn't require complex decisions."
- **Chrome is a HOST, not a module.** ⚠️ This *revises* the region's locked framing ("everything is a registered module"). The sidebar / document panel / AI terminal / app shell are the fixed **host** frame that lays modules into **slots**. They share the atoms + tokens (so "composed from the same atoms" holds) but are *not* registry entries and are never AI-composed. Corrected law: **"everything the AI composes / all content is a module; chrome is the host."**
- **Nesting.** A module spans leaf (`todo`) ↔ container (page). Registry-level nesting = page → block-modules (flat array) and page → child pages (tree). No mid-tier **section** for now (deferred — fog). Grouping within a page = child pages; a real in-page container graduates only if the visual track (t14/t15) needs columns/layout.

**Two capabilities, sequenced:** *Composition* (arrange built modules — this region specs the contract in t16; the AI tooling that does it is the *next* effort) vs *Authoring* (AI creates new module *types* — deferred fog, a later effort). Modules are defined as copyable templates (schema + renderer + logic) to keep authoring open.

Feeds t12 (registry contract = the `type → {schema, view, editor, differ, ai, layout}` map) and t13 (atomic layering — where modules vs hosts sit in atoms/molecules/organisms). Note for both: chrome is a **host**, not a module.
