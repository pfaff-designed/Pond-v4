---
id: 11
label: wayfinder:grilling
status: open
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
