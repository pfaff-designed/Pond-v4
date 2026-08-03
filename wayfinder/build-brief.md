---
label: pond-v4:build-brief
generated: 2026-08-02
updated: 2026-08-02 (grilling session — all underspecified items resolved)
source: wayfinder tickets 01–10 + grilling session
---

# Pond-v4 Build Brief

Single-user personal productivity app. AI is a steward/collector/presenter — it never initiates production, never replaces the user's thinking. Desktop-primary, mobile-secondary.

---

## 1. Stack and Platform

### Runtime and Framework

| Layer         | Choice                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| Framework     | Next.js (App Router)                                                   |
| Language      | TypeScript, strict mode                                                |
| Styling       | Tailwind CSS + shadcn/ui + Motion + Bklit (`@bklit` — shadcn registry) |
| AI SDK        | Vercel AI SDK (`streamText` server-side, `useChat` client-side)        |
| Database      | Supabase (Postgres + pgvector extension)                               |
| Auth          | Supabase Auth — pre-seeded single account, never exposed in UI         |
| Hosting       | Vercel                                                                 |
| Data fetching | React Query / TanStack Query                                           |
| Embeddings    | OpenAI (`text-embedding-3-small`) — one additional API key             |

### Tooling

| Tool                         | Purpose                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| ESLint                       | Linting                                                        |
| Prettier                     | Formatting                                                     |
| Husky + lint-staged          | Pre-commit: ESLint + Prettier run before every commit          |
| Jest + React Testing Library | Unit and component tests                                       |
| Playwright MCP               | Frontend and functional testing before every PR                |
| Storybook                    | Component development and visual validation                    |
| Zod                          | Schema validation at API boundaries and block type definitions |
| Git worktrees                | Ticket isolation — each ticket gets its own worktree           |

### Architecture Pattern

**Atomic Design**: atoms → molecules → organisms → templates → pages. Components live in Storybook; no organism is built without its atom/molecule dependencies in place first.

**No PWA, no Expo, no Tauri.** Offline is not a requirement. A "decent mobile site" is the acceptable baseline.

**Portability principle**: domain logic (what a node is, AI interaction logic, block serialization) lives in framework-agnostic TypeScript modules — not entangled with Next.js server components or route handlers.

### Agent Workflow Rules

These rules apply to every implementation agent working on this codebase:

1. **TDD** — write the failing test first, make it pass, then refactor. No implementation without a test.
2. **Worktrees** — each ticket is isolated in its own git worktree. Never work on `main` directly.
3. **`/code-review` after every ticket** — run `/code-review` when the ticket is done. Fix all flagged issues before opening a PR.
4. **Playwright MCP before every PR** — use Playwright MCP to exercise any frontend or functional change before committing. A PR without a Playwright run for UI changes is incomplete.
5. **Storybook for every component** — no organism or molecule ships without a Storybook story.

---

## 2. Data Model

### Hierarchy

```
Life (implicit root)
└── Areas[]
    ├── Routines[]
    ├── Projects[]
    └── Actions[] (unowned)
        └── Actions[] (nested sub-tasks)
```

### Table Schema

```sql
-- Auth
users (id uuid, email text)

-- Hierarchy
areas (
  id uuid PK,
  user_id uuid FK users,
  name text,
  "order" int
)

routines (
  id uuid PK,
  area_id uuid FK areas,
  user_id uuid FK users,
  name text,
  cadence jsonb,   -- { frequency: 'daily'|'weekdays'|'weekly'|'monthly', days?: string[] }
  "order" int
)

projects (
  id uuid PK,
  area_id uuid FK areas,
  user_id uuid FK users,
  title text,
  description text,
  status text CHECK (status IN ('active','paused','completed')),
  due_date date,
  "order" int
)

actions (
  id uuid PK,
  parent_id uuid,                               -- nullable; points to routine|project|action
  parent_type text CHECK (parent_type IN ('routine','project','action')),
  user_id uuid FK users,
  title text,
  type text CHECK (type IN ('task','event')),
  area_id uuid FK areas,                        -- optional; for unowned actions
  project_id uuid FK projects,                  -- optional; for project-owned actions
  status text CHECK (status IN ('open','done')),
  due_at timestamptz,                           -- tasks
  scheduled_at timestamptz,                     -- events
  duration_minutes int,                         -- events
  resource_tags text[],                         -- 'time'|'money'|'energy' as tags only
  "order" int
)

documents (
  id uuid PK,
  user_id uuid FK users,
  node_id uuid,                                 -- nullable = free-floating
  node_type text CHECK (node_type IN ('area','routine','project','action')),
  title text,
  blocks jsonb NOT NULL DEFAULT '[]',
  embedding vector(1536),                       -- OpenAI text-embedding-3-small dimension
  updated_at timestamptz
)

conversations (
  id uuid PK,
  user_id uuid FK users,
  transcript jsonb NOT NULL DEFAULT '[]',       -- array of { role, content, created_at, event? }
  created_at timestamptz,
  dissolved_at timestamptz                      -- NULL = active; set on /handoff or 48h idle auto-dissolve
)
```

**Note**: `conversations` has no `node_id`. A conversation is a session, not a node attachment. Context switches are recorded as events in the transcript (see Section 9).

RLS on every table: `user_id = auth.uid()`.

### Seed data

Five default Areas on first login: Personal, Professional, Health, Financial, Creativity. Names are user-editable — not enums.

---

## 3. AI Integration

### Model Tiers

```ts
// lib/ai/models.ts — change model IDs here when Sonnet 5 / Opus 5 land
export const AI_MODELS = {
  quick: 'claude-haiku-4-5', // $1/$5 MTok — entity extraction, background dissolve
  standard: 'claude-sonnet-4-6', // $3/$15 MTok — default for all conversations
  deep: 'claude-opus-4-8', // $5/$25 MTok — manual escalation, heavy reasoning
} as const
```

Default: `standard`. User can switch manually; takes effect on next message, same transcript. No Fable 5 in v4.

### API Surface

All AI calls server-side. Anthropic API key never reaches the client.

- **User-facing conversations**: Next.js Route Handler + `streamText`; client uses `useChat` from `ai/react`
- **Background tasks** (dissolve → entity extraction, embedding generation): `streamText` consumed via `.finalMessage()` — no client pipe

### Context Scoping

Context is a snapshot injected at conversation open and on each context-switch event — not live-updated between events.

**What gets injected on open or context switch:**

| Opened from / switched to | Injected                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| Life (root)               | Nothing beyond system prompt                                                             |
| Area                      | Area name + Routines, Projects, unowned Actions (titles + status)                        |
| Project                   | Project metadata + Actions (title, status, due_at) + attached Documents (title + blocks) |
| Routine                   | Routine metadata + step Actions                                                          |
| Action                    | Action metadata only                                                                     |
| Free-floating             | Nothing                                                                                  |

**Cross-space context — user-directed only, two surfaces:**

1. `@mention` — inline picker on `@` keystroke, fuzzy search across all node types (Areas, Projects, Routines, Actions, Documents). Selected node resolves to a pill token in the input. On send, client fetches node data and prepends it as structured JSON to the message — invisible to user, visible to AI.
2. Natural language ("bring in context from X", "what have I written about budgets?") — AI calls `fetch_context` tool (see below).

AI never fetches cross-space context autonomously.

### `fetch_context` Tool Schema

```ts
fetch_context({
  query: string,          // natural language query OR resolved @mention label
  mode: 'node' | 'semantic',
  node_type?: 'area' | 'routine' | 'project' | 'action' | 'document',
  node_id?: string        // provided when @mention resolves to a specific node
})
// returns: { node?: NodeMetadata, children?: ChildSummary[], documents?: Block[][] }
// semantic mode: vector similarity search against documents.embedding; returns matching blocks + parent node context
```

- `node` mode: lookup by title (fuzzy) or by `node_id` when pre-resolved via `@mention`
- `semantic` mode: OpenAI embedding of `query` → pgvector similarity search against `documents.embedding`; returns matching document blocks + their parent node context

Embeddings are generated on document save via a background route, using `text-embedding-3-small`.

### System Prompt Architecture

```
[FIXED BASE — always present]
You are Pond, a thinking partner for [user]. Your role is steward, collector, and presenter.
You surface and organise the user's thinking — you do not replace it.
You never initiate production of documents, plans, or action lists.
You think together with the user until the user explicitly requests an artifact.
When you hear something worth capturing, offer a short candidate and wait for confirmation.
Any mutation (create, delete, rename a node or document) requires explicit user confirmation
before you execute it. Always surface an action card; never act silently.

[CONTEXT BLOCK — injected at open and on each context switch]
Current context: [node title, type, children summary as structured JSON]

[PERSONA BLOCK — swapped per session]
// Default: Thinking Partner
// Inference promotes away from Thinking Partner only when first message is clearly
// in Teacher or Practical Guide territory. Ambiguous → stay Thinking Partner.
// Manual picker always available.
```

---

## 4. Storage and Auth

- Supabase Auth, pre-seeded account. No login screen. App boots directly into authenticated state; minimal magic-link screen as fallback.
- React Query wraps all Supabase reads. Short TTLs (30s conversations, 5m documents). No pessimistic updates needed.
- `documents.blocks` is `jsonb` storing `Block[]`. Entire array written on save — no partial block updates.
- `documents.embedding` is `vector(1536)` (OpenAI `text-embedding-3-small` output dimension). Generated on save via background route.
- `conversations.transcript` is `jsonb` storing `TranscriptEntry[]` (see Section 9). Full transcript re-fed to model on resumption.

---

## 5. AI Behavior Rules

Enforced in system prompt **and** UI affordance decisions — not just guidelines.

| Rule                                                 | Implementation                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| AI never initiates production                        | No "generate document" / "write this for me" buttons anywhere. Production starts with user natural language in the AI terminal. |
| Think together first                                 | AI asks questions, surfaces options, reflects back — until user explicitly requests an artifact.                                |
| Extraction candidates offered, not silently absorbed | AI offers: "I heard: Action → [title] — save this?" User confirms.                                                              |
| All mutations require explicit confirmation          | AI surfaces an action card for every create/delete/rename. User approves or rejects.                                            |
| Session-level approval grants                        | User can check "Always approve [action type] this session" on any action card. Scoped per action type — not a blanket grant.    |
| Resumption: orient then wait                         | One factual summary of current context state on open. No suggested next steps unless asked.                                     |
| Context switch: one orienting line on first message  | After a context switch, AI offers one orienting line about the new node on the user's first message. Silent until then.         |
| Presenter activates on explicit request only         | Summaries/views only when asked. No background analysis pushed to user.                                                         |
| Cross-space retrieval: user-directed only            | `@mention` or natural language. Never autonomous background RAG.                                                                |
| 48h idle nudge                                       | After 48h of inactivity, surface: "This session has been idle — dissolve it?" above the chat input.                             |

---

## 6. Navigation Shell

### Desktop — IDE Three-Panel

```
┌─────────────┬───────────────────────────────────┐
│  Sidebar    │  Document Panel                    │
│  [+] [tree] │  (current node's document)         │
│             │                                    │
├─────────────┴──────────────────────────────────┤
│  ↕ drag handle                                  │
│  AI Terminal  Context: [node name]              │
│  [chat history + diff cards + action cards]     │
│  [input — natural language only]                │
└─────────────────────────────────────────────────┘
```

**Sidebar:**

- Persistent, left. Collapsible file tree: Life → Areas → Routines/Projects/Actions. Documents attached to nodes appear as children. Free-floating documents under a "Documents" root section.
- `[+]` button at sidebar top → creation modal (AI prompt flow, see below). Node creation is AI-mediated, not a raw form.
- Right-click on any node → context menu: Rename, Delete. Both trigger action cards in the AI terminal for confirmation.
- Clicking a node: updates the document panel + injects a context-switch event into the AI terminal transcript.

**Document panel:** center. Current node's document. AI proposals rendered in the AI terminal, not here.

**AI terminal:** full-width bottom panel.

- Drag handle on top edge — drag-to-resize. Minimum collapsed height shows context header + input. Never fully hidden.
- `Context: [node name]` header always visible.
- One active session — no switcher.
- Terminal is a readable conversation; diff cards and action cards appear inline.

**No conversation switcher UI. One session at a time.**

### Mobile — Chat-First

- No document panel. No persistent sidebar.
- Primary surface: conversation + chat input.
- Navigation: drawer (swipe or hamburger). Areas only — no drill-down. Tapping an Area injects a context-switch event.
- AI always mediates content reference. No browse path.
- Orienting line fires on **first message after context switch** — not on drawer tap.
- Capture = chat input. No FAB.
- Layout: same React components, different breakpoints.

### Node Creation Modal

Triggered by sidebar `[+]` or natural language ("Hey Pond, create a project for X").

- Opens a focused chat modal
- AI runs a structured prompt flow: what is this? which area? any initial actions?
- User confirms before entity is written
- On completion, modal closes, new node appears in sidebar, document panel opens it

---

## 7. Document Block Types, Serialization, and Interactivity

### Block Schema

```ts
// lib/documents/types.ts

type Block = TextBlock | TodoBlock | MetricBlock

interface TextBlock {
  id: string // stable UUID — never changes, used for diff targeting
  type: 'text'
  content: string // markdown string
}

interface TodoBlock {
  id: string
  type: 'todo'
  items: TodoItem[]
}

interface TodoItem {
  id: string // stable UUID per item
  label: string
  checked: boolean
}

interface MetricBlock {
  id: string
  type: 'metric'
  label: string
  value: number
  unit?: string
  trend?: 'up' | 'down' | 'flat'
}
```

`Document.blocks` is `Block[]`. Entire array written on any change — no partial updates.

### Block Interactivity

| Block type | User interaction                | AI-writeable  | Deletable by user       |
| ---------- | ------------------------------- | ------------- | ----------------------- |
| `text`     | Click-to-edit (inline markdown) | Via diff card | Yes — hover reveals `×` |
| `todo`     | Checkbox toggle                 | Via diff card | Yes — hover reveals `×` |
| `metric`   | Read-only                       | Via diff card | Yes — hover reveals `×` |

**Block creation:**

- `text`: user adds via `+` control between blocks or at document bottom.
- `todo`, `metric`: AI-initiated only via diff card. No direct creation affordance.

**Block deletion:** hover any block → `×` appears. Click to delete. No confirmation for `text` blocks. Single confirmation prompt for `todo`/`metric` ("Remove this block?"). No AI involvement in deletion.

### Document Structure

Documents have an inline-editable `title` at the top and a `blocks: Block[]` body. A document with no blocks is valid. Auto-saved on blur or `Cmd+Enter`.

---

## 8. Document Editor UX

### Diff Cards

AI block proposals appear as diff cards **in the AI terminal**, inline with the conversation.

```
┌─────────────────────────────────────────┐
│ [block type]  [block title / preview]   │
│ [diff visualization — type-specific]    │
│ [Accept]  [Reject]  [Edit]              │
└─────────────────────────────────────────┘
```

- **Accept**: proposed state written to `Document.blocks` at the target block UUID. Card dismissed.
- **Reject**: proposal discarded. Card dismissed.
- **Edit**: accepted and target block dropped into editable state in document panel. Document panel is the single authoring surface.

### Action Cards

All AI-proposed mutations (create node, delete node, rename) appear as action cards — same visual pattern as diff cards.

```
┌─────────────────────────────────────────┐
│ [action type]  [target]                 │
│ [description of what will happen]       │
│ [Approve]  [Reject]                     │
│ ☐ Always approve [action type] this session │
└─────────────────────────────────────────┘
```

"Always approve" is session-scoped per action type. Approving "delete" actions doesn't grant "create" actions.

### Diff Visualization by Block Type

| Block type | Diff display                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `text`     | Before/after split — old text struck through, new text alongside                                          |
| `todo`     | Full proposed list — added items green, removed struck through, reordered with arrow                      |
| `metric`   | New label/value/unit/trend as read-only preview card. Metrics are fully replaced, never partially diffed. |

All cards reference the target block's stable UUID.

### Direct Prose Authoring

Text blocks: click-to-edit → inline markdown editor, no mode switch, no toolbar. Save on blur or `Cmd+Enter`. New text blocks: `+` control between blocks or at document bottom.

### AI Trigger

**Natural language in the AI terminal is the only AI trigger.** No slash commands, no "ask AI" buttons in the document panel. AI resolves the target block from injected context using block UUIDs. If target is ambiguous, AI asks before proposing.

---

## 9. Conversation Lifecycle

### Session Model

One conversation per session (Claude Code model). No per-node conversations. Navigation injects context-switch events into the continuous transcript.

### Transcript Schema

```ts
type TranscriptEntry =
  | { role: 'user' | 'assistant'; content: string; created_at: string }
  | {
      role: 'system'
      event: 'context_switch'
      node_id: string | null
      node_type: string | null
      node_title: string
      context_snapshot: object
      created_at: string
    }
```

On node navigation, a `context_switch` event is appended to the transcript before the next message is sent. The AI receives the full transcript including switch events on every call.

### Lifecycle

```
new session → active (accumulating transcript)
                ↓ context switches inject events
                ↓ 48h idle → nudge above input
              /clear → transcript wiped, new session row
              /handoff → entity extraction (Quick model) → transcript wiped, new session row
              /save → escalation picker → entity written → conversation continues
```

- **`/save`**: opens "Save as..." picker (Document | Project | Actions). AI pre-populates from transcript. User confirms before entity is written. Conversation continues — `/save` is not a dissolve.
- **`/handoff`**: Quick model extracts entities from transcript → writes them → `dissolved_at = now()` → new session begins. Same as manual dissolve but user-initiated mid-session.
- **`/clear`**: `dissolved_at = now()` on current row, no entity extraction, new session begins.
- **48h idle**: nudge shown; if confirmed, same path as `/handoff`. If ignored, conversation remains active.

Old conversation rows are kept for history (`dissolved_at` is set, row stays).

### Escalation

Two parallel paths for saving conversation output to entities:

1. **AI-surfaced**: AI recognizes something worth formalizing and offers it conversationally — "This looks like it could become a project — want to formalize it?" User can accept (→ `/save` flow) or ignore.
2. **User-triggered**: `/save` command in the AI terminal at any point.

AI may offer extraction candidates for individual items too: "I heard: Action → send invoice to client — save this?" User confirms per-item.

### Resumption

Full transcript re-fed to the model on session open. AI produces one factual orienting summary (current context state, last focus, open threads) then waits. No suggested next steps unless asked.

---

## 10. `@mention` UX

- Typing `@` in the AI terminal input opens an inline picker (popover above input)
- Fuzzy search across **all node types**: Areas, Projects, Routines, Actions, Documents
- Selecting resolves to a pill token in the input (e.g. `@Kitchen Renovation`)
- On send: client fetches that node's data, prepends it as structured JSON to the message body — invisible in the UI, visible to the AI as context
- Multiple `@mentions` per message are supported

---

## 11. Semantic Search

- pgvector extension enabled in Supabase
- OpenAI `text-embedding-3-small` generates embeddings (1024 dimensions)
- Embedding generated on every document save via a background Next.js route
- Stored in `documents.embedding vector(1536)`
- `fetch_context` in `semantic` mode: embed the query → cosine similarity search → return top-N matching document blocks + parent node metadata
- Used when user queries content, not node titles ("what have I written about budgets?" vs. "bring in the Kitchen Renovation project")
