---
label: wayfinder:map
---

# Pond-v4 Wayfinder Map

## Destination

Architecture, stack, and scope decisions locked down so building can start with confidence — no concept drift, no legacy baggage. The map is done when every key decision is resolved and an agent session can be handed a clear brief and build.

## Notes

- Domain: personal productivity app, solo user (Charles), desktop + mobile target
- Core philosophy: AI as steward/collector/presenter — user handles creativity and judgment. The AI must not replace thinking or cause cognitive dependency.
- Previous attempts (pond, pond-v3) failed due to concept drift and AI agents struggling with the surface. Start clean.
- Skills to consult each session: /grilling, /domain-modeling
- Stack context: Charles is comfortable with React/TypeScript/Next.js/Supabase from existing projects

## Decisions so far

- [Platform: web/PWA vs. Tauri vs. React Native](ticket-01-platform.md) — Next.js web app, responsive, no PWA for v4. Expo and Tauri both ruled out. Keep domain logic in framework-agnostic TS modules as the one hedge toward a future native shell.
- [Data model: Conversations, Documents, Projects](ticket-02-data-model.md) — Hierarchy is Life → Areas → (Routines | Projects | Actions). Documents are JSON block arrays (text + AI-populated component blocks) attached to any node or free-floating. Conversations are ephemeral scaffolding that produce entities and dissolve. Resources (Time/Money/Energy) are tags only for v4.
- [AI integration model](ticket-04-ai-integration.md) — 3 model tiers: Quick (Haiku 4.5), Standard (Sonnet 4.6, default), Deep (Opus 4.8). Server-side Route Handler + Vercel AI SDK (`streamText` / `useChat`). Context scoped to the opened node + direct children; cross-space context user-directed only (`@` mention or natural language request). Fixed steward/collector/presenter system prompt base + swappable persona blocks; inference default with manual override and mid-conversation switching. Stream everything. Full transcript re-fed on resumption; manual dissolve with 24h idle nudge; running memory implicit in accumulated entities.
- [Storage and backend](ticket-05-storage-backend.md) — Supabase + Vercel. Supabase Auth pre-seeded, single account, never exposed in UI, RLS on all tables. Cloud-only with React Query caching — no local-first layer. Schema: `areas`, `routines`, `projects`, `actions` (polymorphic parent), `documents` (blocks as JSONB, attached to any node or free-floating), `conversations` (ephemeral rows, `dissolved_at` set on close).
- [AI behavior model](ticket-06-ai-behavior.md) — Think-together → user calls the shot → AI produces on request. AI never initiates production. Resumption: automatic orientation then wait. Proactive surfacing: silent unless scoped to a node (one orienting line). Presenter activates on explicit request only. Retrieval: inject current node context automatically; RAG on explicit cross-space query only. No "write this for me" UI affordance.

- [Navigation shell](ticket-07-navigation-shell.md) — Desktop: IDE three-panel (sidebar file tree + document panel + full-width bottom AI terminal). Mobile: chat-first, drawer nav, capture + reference only, AI renders content inline.
- [Mobile UX](ticket-08-mobile-ux.md) — Flex layout (no hard-coded viewport units). Chat input is the only capture surface. AI always mediates content reference (no browse path). Drawer nav shows Areas only. AI orienting line fires on first message after context switch, not on drawer tap.
- [Document editor UX](ticket-10-document-editor-ux.md) — Diff cards in AI terminal (Accept/Reject/Edit); accept-then-edit flow; type-specific diff viz (before/after prose, full-state todo, preview-only metric); click-to-edit text blocks; text blocks user-added, todo/metric AI-only; natural language in terminal is the sole AI trigger.

## Not yet specified

- [Document component library](ticket-09-document-component-library.md) — three block types: `text` (markdown), `todo` (interactive checkboxes, document-local items), `metric` (AI-written values, read-only). User-directed selection. Stable UUID per block for diff targeting.
- Sync behavior — offline not required (always connected); sync strategy depends on storage/backend decision

## Out of scope

- Multi-user or sharing features
- Third-party integrations beyond AI (calendar sync, email, etc.) — may revisit after v4 is stable
