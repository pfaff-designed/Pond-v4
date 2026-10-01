---
id: 02
label: wayfinder:grilling
status: closed
blocked-by: [01]
blocks: [03, 06]
---

# Data model: Conversations, Documents, Projects

## Question

Three primitives have emerged: Conversation (ephemeral exchange), Document (structured record of a thought), and Project (goal + tasks). What is the canonical data model?

Questions to resolve:

- Can a Conversation belong to a Project, or are they always siblings at the top level?
- Can a Document belong to a Project? (e.g., a "contractor quotes" doc inside "Kitchen Renovation")
- What is the lifecycle of a Conversation — when does it get persisted, and as what?
- What fields does a Project carry beyond tasks? (status? due date? tags?)
- Is there a hierarchy or is everything flat with relationships?

## Resolution

The original three primitives (Conversation, Document, Project) were replaced by a richer model:

**Hierarchy:** Life → Areas → (Routines | Projects | Actions)

**Areas** — stored as data, seeded with 5 defaults (Personal, Professional, Health, Financial, Creativity), flexible to rename/add. Not an enum.

**Projects** — bounded goals with an end state. Fields: `title`, `description`, `area_id`, `status` (active/paused/completed), `due_date`.

**Routines** — recurring, ordered checklist of steps. No step locking — display order only. Recurrence stored as `{ frequency: 'daily'|'weekdays'|'weekly'|'monthly', days?: string[] }`.

**Actions** — universal entity for tasks and events. Fields: `title`, `type` (task|event), `area_id` (optional), `project_id` (optional), `due_date` (tasks), `scheduled_at` + `duration` (events), `status`, `resource_tags`. One table; presence of `scheduled_at` determines rendering.

**Documents** — prose + AI-rendered component blocks. Content stored as JSON block array with two block types: `text` (markdown prose) and `component` (pre-defined template + AI-populated data). Can attach to any node (area_id or project_id) or float free.

**Conversations** — ephemeral. Not persisted. They produce Actions, Projects, or Documents and dissolve.

**Resources** (Time, Money, Energy) — lenses only for v4. Implemented as optional tags on Actions and Projects. No tracked quantities, no pools, no aggregation.

## Superseded (2026-08-08) — unified page tree

The multi-table hierarchy above shipped, then was collapsed into **one self-referential `pages` table** (`supabase/migrations/0003_unified_pages.sql`, merged `1c94a06`). The reasoning above still explains _what the entities mean_; this is how they're now _stored_.

**"Everything is a page; type is just a tag."**

- **One table, `pages`** — `parent_id` self-reference gives an arbitrary-depth tree with subtree cascade-delete via the FK. Top-level = `parent_id null`.
- **`type`** is a tag (`area | project | routine | action | page`), not a table. A CHECK constraint guards it for now (AI tools / `formatNodeContext` switch on it); can loosen to free-form later.
- **A page IS its own document.** Content `blocks` (JSONB) and the `embedding` (vector 1536) live on the row — the old `documents` table is gone. Attached docs became child pages; free-floating docs became top-level pages.
- **`props` (JSONB)** carries type-specific extras: `due_date`, `description`, `cadence`, `scheduled_at`, `resource_tags`, etc. `status` is a nullable column.
- RLS `own rows` policy, `ivfflat` embedding index, `match_pages` RPC (replaced `match_documents`), and `seed_default_pages` (the 5 default Areas as top-level `area` pages).
- Existing UUIDs were **preserved** so transcript `node_id`s, open URLs, and embeddings kept working. Legacy tables left intact as a rollback valve; `0005_drop_legacy_tables.sql` removes them post-cutover.
