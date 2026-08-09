# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary (and currently only) user: **Charles** — a solo power-user who knows the app intimately and needs no discoverability tax. Desktop is the primary editing environment; mobile is for quick capture and reference on the go.

Situation and job: personal knowledge and productivity work — thinking through Areas, Projects, Routines, and Actions, and turning loose thought into durable, organized pages. The audience may expand to a shared or multi-user version later, so avoid decisions that would make that painful — but no multi-user affordances are built for v4.

## Product Purpose

Pond is a personal thinking and productivity environment where an AI acts as **steward, collector, and presenter** of the user's knowledge. It helps the user think and organize _without doing the thinking for them_.

Success: the user thinks more clearly and retains full ownership of judgment and creativity, with their knowledge well-kept and easy to resurface. Failure: the tool creates cognitive dependency, or produces work the user should have owned.

## Positioning

The differentiating mechanism is an AI that **deliberately never initiates production and never replaces thinking**. Where neighboring AI tools race to generate _for_ you, Pond's AI produces only on explicit request — think-together → the user calls the shot → the AI produces. Paired with a unified **"everything is a page"** model (a self-referential page tree where conversations are ephemeral scaffolding that dissolve into durable pages), this is a stance a generation-first assistant could not truthfully copy.

## Operating Context

- **Desktop:** IDE-like three-panel shell — sidebar page tree + center document panel + full-width bottom AI terminal. All document editing happens here.
- **Mobile:** chat-first surface with drawer nav; quick capture and reference only, no document editing. The AI renders relevant content inline on request.
- **One active conversation at a time,** scoped to the currently open node. Navigating to a new node updates the context header and triggers the AI's orienting line.
- **Cloud-only, always connected** (Supabase + Vercel). No offline / local-first layer; React Query handles caching.

## Capabilities and Constraints

- **Unified page tree:** every node is a page and is its own document (its own `blocks` + `embedding`). `type` (`area` / `project` / `routine` / `action` / `page`) is a display tag, not a structural distinction. Conversations are ephemeral rows that dissolve (`dissolved_at`) and leave pages behind.
- **Document blocks — three first-class types:** `text` (user-added, markdown), `todo` (interactive checkboxes; AI- or user-populated; items are document-local snapshots, not live Action references), `metric` (AI-written label/value/unit/trend, read-only). Every block carries a stable UUID so AI diffs target by id, not position.
- **AI edit loop:** the AI proposes changes as diff cards (Accept / Reject / Edit) in the terminal; the user reviews before anything lands in the document. The AI never emits component blocks unprompted — only when the user's request makes a block the clearest answer format.
- **Three AI model tiers:** Quick (Haiku 4.5), Standard (Sonnet 4.6, default), Deep (Opus 4.8). Server-side Route Handler + Vercel AI SDK (`streamText` / `useChat`); stream everything.
- **Context scope:** the opened node + its direct children are injected automatically; cross-space retrieval is user-directed only (`@` mention or natural-language request). Semantic search via embed-on-save.
- **Auth/storage:** a single Supabase account, never exposed in the UI; RLS on all tables.
- **Portability constraint:** keep domain logic in framework-agnostic TypeScript modules — the one deliberate hedge toward a possible future native shell (Next.js web app for v4; no PWA; Tauri and React Native both ruled out).
- **Undecided (do not invent):** sync strategy for any future shared/multi-user version; the specific AI persona voice (see Brand Commitments).

## Brand Commitments

- **Name:** Pond.
- **AI persona is a real product feature, not just a config hook.** A fixed steward/collector/presenter base with swappable persona blocks; the steward is intended to have a _distinct_ persona (not neutral-by-default). The specific voice and character are **not yet defined** — an open decision to be made deliberately, not drifted into.

## Evidence on Hand

Real content lives in the user's own pages; there is no external proof surface. There are **no customers, testimonials, benchmarks, press, pricing, or public deployment claims** — future work must not fabricate any. Prior attempts (`pond`, `pond-v3`) exist as history and failed to concept drift; v4 is a clean start and should not inherit their surfaces.

## Product Principles

1. **The AI never replaces thinking.** It stewards, collects, and presents; the user keeps creativity and judgment. Never create cognitive dependency. _(Inviolable — user-confirmed core.)_
2. **The AI produces only on explicit request.** Think-together → the user calls the shot → the AI produces. No unprompted production, no "write this for me" affordance. _(Inviolable — user-confirmed core.)_
3. **Everything is a page.** One self-referential tree; conversations are ephemeral scaffolding that dissolve into durable pages. Type is a tag, not a structure.
4. **Efficiency over discoverability.** A solo power-user's tool — no onboarding chrome, no discovery tax. The sidebar's structural orientation and the AI's contextual orienting line are enough.
5. **Stay portable.** Domain logic framework-agnostic; don't foreclose a future shared or native version.
