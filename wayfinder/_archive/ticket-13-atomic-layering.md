---
id: 13
label: wayfinder:grilling
status: open
blocked-by: [11]
blocks: []
---

# Atomic layering & Shadcn/Bklit integration

## Question

We build with atomic design (atoms → molecules → organisms) and keep no stray components outside those layers. Given the taxonomy (t11) and the unified registry, decide:

- Where do **Shadcn** and **Bklit** components sit — are they the atoms, or wrapped into Pond atoms (the make-noise "shadcn wrappers" pattern)?
- How do registry **modules** map onto atomic layers — is a `todo` module a molecule composed of atoms, and a page/section an organism?
- Where does **chrome** fall in the hierarchy? Per t11 chrome is a **host** (app shell, sidebar, document panel, AI terminal) — _not_ a registry module. It's built from the same atoms/tokens, so where do hosts sit as organisms vs. where content modules sit?
- Directory/Storybook structure: how do `atoms/molecules/organisms/` relate to a `lib/modules/` registry so a module's story renders through the same components the app uses?
- The guardrail rule for adding a new component or module so the system stays coherent ("no stray components").

Uses the existing Storybook setup (Slice 0) and the current `src/components/{molecules,organisms}` layout as incumbent authority.
