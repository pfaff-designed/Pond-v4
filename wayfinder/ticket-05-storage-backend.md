---
id: 05
label: wayfinder:grilling
status: closed
blocked-by: [01]
---

# Storage and backend

## Question

What handles data persistence, auth, and hosting for Pond-v4?

Questions to resolve:

- Supabase (used in existing projects) vs. something else — does the platform choice change this?
- Solo user only: is full auth needed, or can this be local-first with optional sync?
- If local-first: where does data live on device, and how does sync work across desktop and mobile?
- If cloud: Supabase + Vercel/cloud functions as in previous Pond versions?
- What does the schema look like for Conversations, Documents, Projects (high level)?

## Resolution

- **Backend:** Supabase (Postgres) + Vercel. Familiar stack, relational shape fits the hierarchy, no good reason to deviate.
- **Auth:** Supabase Auth, pre-seeded single account. Never exposed in UI. RLS on every table with `user_id` foreign keys. Login screen never built.
- **Sync:** Cloud-only. Supabase is source of truth. React Query sits in front for in-memory caching and background refetches. No local-first layer — always-connected solo use makes it unnecessary.
- **Schema (high-level):**

```
users (id, email)

areas (id, user_id, name, order)

routines (id, area_id, user_id, name, cadence, order)
projects (id, area_id, user_id, name, status, order)
actions  (id, parent_id, parent_type, user_id, name, status, due_at, order)
  -- parent_type: 'routine' | 'project' | 'action'

documents (id, user_id, node_id, node_type, title, blocks jsonb, updated_at)
  -- node_type: 'area' | 'routine' | 'project' | 'action' | null (free-floating)

conversations (id, user_id, node_id, node_type, transcript jsonb, created_at, dissolved_at)
  -- dissolved_at set on manual dissolve or 24h idle; row kept for history
```
