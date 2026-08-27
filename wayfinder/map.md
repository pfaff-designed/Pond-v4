---
label: wayfinder:map
---

# Pond-v4 Wayfinder Map

## Destination

Architecture, stack, and scope decisions locked down so building can start with confidence — no concept drift, no legacy baggage. The map is done when every key decision is resolved and an agent session can be handed a clear brief and build.

## Build status (2026-08-08)

The decision phase is **closed** — every ticket resolved and the build unlocked. Progress since:

- **Functional backlog A–D complete** and verified (118 tests, browser end-to-end): A (doc/page persistence), B (`/handoff`), C (node-context + `@mention`), D (semantic retrieval — embed-on-save + cross-space `fetch_context` tool).
- **Data model re-based** onto the unified page tree (post-map; ticket-02 superseded).
- **Next: front-end phase** — nav shell (ticket-07), mobile UX (ticket-08), document/page editor UX (ticket-10). All three speced; UX assumed clear (reconciled to pages).
- **Front-end progress (2026-08-09):** Storybook (Slice 0), streaming fix (Slice 1), and the diff-card edit loop (ticket-10 / Slice 2) are merged. The map now expands into a **UI System region** (below) to build the component system and the AI's ability to compose with it.

## UI System region (opened 2026-08-09)

**Region destination:** a premium, atomic-design UI system (React · Tailwind · Shadcn · Bklit) that both gives Pond's own chrome its visual language and component library AND drives a flexible, data-driven renderer for modules/pages the AI can compose. Done when the visual language, the atomic component architecture, and the AI-facing composition contract are decided and specced — ready to hand to build. Bar: a daily-driver premium productivity app.

**Framing decisions (locked while charting, 2026-08-09):**

- **Unified registry** — content is composed from a shared atom set + a module registry (`type → schema+renderer`). ⚠️ **Revised by [Module taxonomy](ticket-11-module-taxonomy.md) (2026-08-09):** the original "everything is a registered module" was narrowed — **only content the AI composes is a module; app chrome is a *host*, not a module.** Hosts share the atoms/tokens but aren't registry entries. Corrected law: *"everything is a page (data); everything the AI composes is a module (UI); chrome is the host."*
- **Parallel tracks, architecture-first** — the architecture track (taxonomy → registry contract) and the visual track (aesthetic → tokens) advance in parallel; architecture leads. They reconcile where tokens ↔ contract lock (ticket-17).

**Toolkit (method, not tickets):** Mobbin MCP (flow/screen references), 60fps MCP (motion references), impeccable (design-system + craft floor), Figma MCP, Storybook/Playwright for verify. Atomic design throughout.

**Frontier tickets** (open child issues; those with no blockers are takeable now):

- [Atomic layering & Shadcn/Bklit integration](ticket-13-atomic-layering.md) — **takeable** (unblocked by t11)
- [Visual language & premium aesthetic direction](ticket-14-visual-language.md) — **takeable** (visual-track entry)
- [Design token architecture](ticket-15-design-tokens.md) — blocked by 14
- [In-page `section` container & layout grammar](ticket-18-section-container.md) — blocked by 14 (graduated from fog by t12; drops into t12's recursive-composition seam; AI composes it via t16's contract)
- [Lock tokens ↔ registry contract](ticket-17-token-contract-reconciliation.md) — blocked by 15 (region closing gate; t12 & t16 sides now resolved)
- ~~[Module taxonomy](ticket-11-module-taxonomy.md)~~ — ✅ resolved (see Decisions so far)
- ~~[The module registry contract](ticket-12-module-registry-contract.md)~~ — ✅ resolved (see Decisions so far)
- ~~[AI module-composition contract](ticket-16-ai-composition-contract.md)~~ — ✅ resolved (see Decisions so far)

## UX hardening region (opened 2026-08-27)

**Region destination:** close the gap between the shipped shell/AI arc and the daily-driver premium bar. Sourced from a hands-on UX audit of the live app (this date; screenshots `~/ux-01…07-*.png`): the AI loop works — creation, parent inference, proposal→accept — but the *reading*, *orientation*, and *trust* layers undercut it. Done when a first-run user can create, read, navigate, and delete without hitting a raw-markdown wall, a hidden page, or an unrecoverable action.

**Build rule for every ticket in this region:** atomic design per [ticket-13](ticket-13-atomic-layering.md) — components land in `atoms/`/`molecules/`/`organisms/` with a Storybook story + story test; no stray components outside the hierarchy. Housekeeping while in there: `src/components/shimmering-text.tsx` sits outside the hierarchy, and `AITerminal`, `DocumentPanel`, `SavePickerModal` have no stories.

**Frontier tickets** (all takeable; 20+21 pair, 22+26 share the type-switch seam, 23 grill-first):

- [Rendered reading layer for text blocks](ticket-20-rendered-reading-layer.md) — raw markdown shown as plain text; #1 quality gap
- [AI authoring discipline: structure over markdown](ticket-21-ai-authoring-discipline.md) — tables/headings as modules, no title-echo
- [Page-with-children hides its own content](ticket-22-page-with-children-content-unreachable.md) — data-invisibility path
- [Connected data: bind metric ↔ checklist ↔ table](ticket-23-connected-data.md) — the "live data" promise; **/grill-me before build**
- [Terminal drawer ergonomics](ticket-24-terminal-drawer-ergonomics.md) — clipped proposals, stale transcript, ⌘K
- [Wayfinding: breadcrumb, rail path, honest counts](ticket-25-wayfinding.md)
- [＋ New page dead end](ticket-26-new-page-dead-end.md)
- [Deletion safety: trash, undo, blast radius](ticket-27-deletion-safety.md)

## Notes

- Domain: personal productivity app, solo user (Charles), desktop + mobile target
- Core philosophy: AI as steward/collector/presenter — user handles creativity and judgment. The AI must not replace thinking or cause cognitive dependency.
- Previous attempts (pond, pond-v3) failed due to concept drift and AI agents struggling with the surface. Start clean.
- Skills to consult each session: /grilling, /domain-modeling
- Stack context: Charles is comfortable with React/TypeScript/Next.js/Supabase from existing projects

## Decisions so far

- [Platform: web/PWA vs. Tauri vs. React Native](ticket-01-platform.md) — Next.js web app, responsive, no PWA for v4. Expo and Tauri both ruled out. Keep domain logic in framework-agnostic TS modules as the one hedge toward a future native shell.
- [Data model: Conversations, Documents, Projects](ticket-02-data-model.md) — **⚠️ superseded 2026-08-08.** Originally Life → Areas → (Routines | Projects | Actions) with a separate `documents` table. Now collapsed into **one self-referential `pages` tree** ("everything is a page; type is just a tag" — a page IS its own document, holding its own `blocks` + `embedding`). Conversations remain ephemeral scaffolding that produce pages and dissolve. Resources (Time/Money/Energy) are tags only for v4. See ticket-02 "Superseded" for the shipped schema.
- [AI integration model](ticket-04-ai-integration.md) — 3 model tiers: Quick (Haiku 4.5), Standard (Sonnet 4.6, default), Deep (Opus 4.8). Server-side Route Handler + Vercel AI SDK (`streamText` / `useChat`). Context scoped to the opened node + direct children; cross-space context user-directed only (`@` mention or natural language request). Fixed steward/collector/presenter system prompt base + swappable persona blocks; inference default with manual override and mid-conversation switching. Stream everything. Full transcript re-fed on resumption; manual dissolve with 24h idle nudge; running memory implicit in accumulated entities.
- [Storage and backend](ticket-05-storage-backend.md) — Supabase + Vercel. Supabase Auth pre-seeded, single account, never exposed in UI, RLS on all tables. Cloud-only with React Query caching — no local-first layer. Schema: `areas`, `routines`, `projects`, `actions` (polymorphic parent), `documents` (blocks as JSONB, attached to any node or free-floating), `conversations` (ephemeral rows, `dissolved_at` set on close).
- [AI behavior model](ticket-06-ai-behavior.md) — Think-together → user calls the shot → AI produces on request. AI never initiates production. Resumption: automatic orientation then wait. Proactive surfacing: silent unless scoped to a node (one orienting line). Presenter activates on explicit request only. Retrieval: inject current node context automatically; RAG on explicit cross-space query only. No "write this for me" UI affordance.

- [Navigation shell](ticket-07-navigation-shell.md) — Desktop: IDE three-panel (sidebar file tree + document panel + full-width bottom AI terminal). Mobile: chat-first, drawer nav, capture + reference only, AI renders content inline.
- [Mobile UX](ticket-08-mobile-ux.md) — Flex layout (no hard-coded viewport units). Chat input is the only capture surface. AI always mediates content reference (no browse path). Drawer nav shows Areas only. AI orienting line fires on first message after context switch, not on drawer tap.
- [Document editor UX](ticket-10-document-editor-ux.md) — Diff cards in AI terminal (Accept/Reject/Edit); accept-then-edit flow; type-specific diff viz (before/after prose, full-state todo, preview-only metric); click-to-edit text blocks; text blocks user-added, todo/metric AI-only; natural language in terminal is the sole AI trigger.

- [The module registry contract](ticket-12-module-registry-contract.md) — Plain keyed object-literal registry, **AI-first**, homed at `src/lib/modules/<type>/`. **Two maps joined by `type`:** `moduleDescriptors` (server-safe: Zod schema + NL `description`) and `moduleRenderers` (client: `view` required, `editor?`/`differ?` optional). **Zod = single source of truth** (→ TS type via infer, runtime validation, AI tool schema); validate AI output server-side, not on read. **Editability = host-passed `editable` prop on the view**, not a descriptor flag; user-edit + AI-accepted-edit share one "new module state → persist" path; `differ` is a type-specific body in the shared DiffCard shell. **AI edits full-state** (no ops/patch, no `editMode` toggle — flat-then-refactor by user's call; patch protocol → fog for t16). **Recursive composition locked** (container views render children via the registry, already used by `page`); the layout *grammar* deferred to new t18 `section`, driven by the visual track. `Block` union absorbed into Zod-derived types; view/editor atomic placement delegated to t13. Unblocks t16 & t17.
- [AI module-composition contract](ticket-16-ai-composition-contract.md) — The AI *creates/composes* modules via **one generalized tool emitting a targeted `changes[]` list** — each `{ op: create|edit|remove, blockId?, type?, data }`. **AI never mints IDs** (client mints on accept; edit/remove reference injected IDs); **`edit` may type-morph** on the same ID. **Anchor-relative** ordering (`after?: blockId`, array order sequences the batch; no move op); composition stays **flat + layout-agnostic** until t18. **Catalog auto-teaches:** `data` is a **Zod discriminated union** built from `moduleDescriptors` (→ tool schema) + a generated system-prompt catalog — new module type teaches the AI with zero edits. **Gating:** prompt-only for *proposing*, **Accept is the sole write gate** ("a proposal is never a write"). **Diff/review:** stack of typed DiffCards (per-module `differ`), per-card + group Accept-all; partial accept; `applyProposedChanges` → shared `commitBlocks`. **Validation:** emit-time discriminated-union check (server, in the Route Handler) + accept-time client re-validate before write; **no new write handler** (t05 single-user) — a **conscious, documented divergence** from t12's literal "server-side write boundary" (the emit-time check *is* the server-side gate). Chosen **"for now"**; patch/ops stays fog. Leaf on the arch track — reconciles at t17, coordinates with t18.
- [Module taxonomy](ticket-11-module-taxonomy.md) — Glossary in `CONTEXT.md`. A **module** = a registered `schema+renderer` pair; the floor of AI composition (AI arranges whole modules, never their private internals). **Blocks are modules** (simple = text/todo/metric; complex = chart/kanban); **pages are container modules** (one tree viewed twice — "everything is a page" is the data, module composition is the view). **Chrome is a *host*, not a module** (revises the region framing) — hosts lay modules into *slots*, share atoms/tokens, aren't registry entries. No mid-tier *section* (fog). Composition contract is in scope (t16); AI-*authoring* of new module types is fog.

## Not yet specified

- **UI System region fog** (within the region above; graduates as the frontier advances): motion & interaction language (waits on visual language, ticket-14), responsive module adaptation desktop↔mobile, theming / dark-mode. The former "document component library" fog (ticket-09) has graduated into the region's tickets 11–17.
- **Patch/ops emit protocol for large modules** (surfaced by t12, sharpened by t16 — kept as fog, *not* graduated): now **two layers**. (a) *Within-module* ops — the AI editing a big module (e.g. a 40-card kanban) by emitting a targeted operation (`{move: card→bucket}`) instead of full state. (b) *Page-level* — t16 chose a targeted `changes[]` list "for now"; the alternative full-page-state emit (re-emit the whole `blocks` array, differ diffs old vs new) was set aside for clobber/token risk. Both stay deferred by the same deliberate choice — ship flat now, refactor when a real kanban-scale page makes the flat targeted list hurt.
<!-- graduated: In-page *section* container → ticket-18 (blocked by t14), by t12 locking recursive composition -->
<!-- graduated: former "document component library" fog (ticket-09) → region tickets 11–17 -->
- **AI *authoring* of new module types** (surfaced by t11): the AI creating brand-new modules (a filtered todo app, a heatmap) from building blocks + copyable logic — beyond *composing* existing ones. A later effort ("first build the design system, then the AI tooling to use it"); modules are defined as copyable templates to keep the door open.
- Sync behavior — offline not required (always connected); sync strategy depends on storage/backend decision. Relevant only if a future shared/multi-user version is pursued.

## Out of scope

- Multi-user or sharing features
- Third-party integrations beyond AI (calendar sync, email, etc.) — may revisit after v4 is stable
