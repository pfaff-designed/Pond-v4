---
id: 04
label: wayfinder:grilling
status: closed
blocked-by: [01]
blocks: [06]
---

# AI integration model

## Question

Pond-v4 uses Claude as the AI backend. What does the integration architecture look like?

Questions to resolve:

- Which Claude model(s)? (Sonnet for everyday, Opus for heavy thinking, Haiku for lightweight tasks?)
- How is context scoped — per conversation? per project? does the AI see the whole project when inside one?
- Streaming: is every response streamed, or only some?
- How are system prompts structured to enforce the steward/collector/presenter philosophy?
- Is there a dedicated AI backend route (server-side) or does the client hit the API directly?
- How are conversation histories stored and re-fed to the model on resumption?

## Resolution

### Models — 3 tiers

- **Quick** — `claude-haiku-4-5` ($1/$5/MTok): fast entity extraction, background dissolve tasks
- **Standard** — `claude-sonnet-4-6` ($3/$15/MTok): default for all conversations
- **Deep** — `claude-opus-4-8` ($5/$25/MTok): manual escalation for heavy reasoning sessions
- No Fable 5 (different API behavior + cost not warranted for personal app); no Opus 4.7 (redundant with 4.8)
- Model identifiers live in a named config constant — swapping when Sonnet 5/Opus 5 land is a one-line change

### Context scoping — node-scoped, hierarchy-aware

- Conversations can be opened from any node: Life, Area, or Project
- Context injected at open = the node's own metadata + direct children (summaries for Area/Life, documents + actions for Project)
- Snapshot at conversation open — not live-updated mid-conversation
- **Cross-space context is user-directed only**, two surfaces:
  - `@` mention — client resolves the reference to content before the message is sent
  - Natural language request ("bring in context from X") — triggers a `fetch_context` tool call; AI retrieves and injects
  - AI never fetches cross-space context autonomously

### Streaming — everything streamed

- All responses use `streamText` in a Next.js Route Handler; client uses `useChat` from Vercel AI SDK
- Background tasks (conversation dissolve → entity extraction) call `streamText` server-side and consume via `.finalMessage()` — same code path, no client pipe
- No two-path split between "long" and "short" responses

### System prompt structure — fixed base + swappable persona blocks

- **Fixed base**: steward/collector/presenter philosophy always present; AI's job is to surface and organise the user's thinking, not replace it
- **Swappable persona block**: injected based on conversation mode (e.g. Thinking Partner, Teacher, Practical Guide)
- Persona selection: inference from first message is the default; manual picker always available; mid-conversation switching supported
- No named character/voice for v4 — neutral and tool-like

### API surface — server-side

- Client never hits Anthropic API directly; all calls go through a Next.js Route Handler
- `streamText` (Vercel AI SDK) server-side; `useChat` client-side
- API key stays server-side

### Conversation history + running memory

- Full transcript re-fed when a conversation is resumed — no summarization (context windows large enough for any realistic conversation)
- Conversations dissolve **manually**; after 24h of inactivity Pond surfaces a nudge: "This conversation has been idle — dissolve it into your project?"
- Running memory is **implicit in accumulated entities** (documents, actions) produced by dissolved conversations — no separate memory store
- Entities attach to whichever node the conversation was opened from
