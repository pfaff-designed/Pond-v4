---
id: 06
label: wayfinder:grilling
status: resolved
blocked-by: [04]
---

# AI behavior model: enforcing steward/collector/presenter

## Question

The core philosophy is that the AI does not replace thinking — it stewards, collects, and presents. How is this implemented beyond a system prompt?

Questions to resolve:

- What does the AI do vs. not do in each of the four session shapes? (ephemeral chat, escalated conversation, intentional project creation, resumption)
- Does the AI proactively surface relevant documents/projects when a new conversation starts, or only when asked?
- How does the AI present collected information — summaries? verbatim? structured views?
- Are there explicit UI constraints to prevent the AI from generating content the user should be writing? (e.g., no "write this document for me" affordance)
- How does the AI know what's in the user's projects/documents — is there a retrieval layer (RAG)?

## Resolution

### Core loop (all session shapes)

**Think together → user calls the shot → AI produces on request.**

The AI is a thinking partner during exploration: it surfaces options, asks questions, offers tradeoffs, and reflects back what it hears. It never initiates production. The user decides when they have enough information and explicitly requests the artifact (project, document, action list). This applies to ephemeral chat, escalated conversations, and intentional project creation alike.

Escalation vs. intentional creation differ only in entry point, not AI behavior. Escalation has a recognition moment the AI surfaces ("this has legs — want to formalize it?"), then the same loop applies.

**Extraction candidates are allowed.** When the AI hears something worth capturing, it may offer a short candidate: "I heard: Action → send invoice to client — save this?" The user confirms. The AI does not silently absorb and decide.

### Resumption

Automatic orientation on resumption: one brief factual summary of where things were left (last focus, unresolved threads, open actions), then the AI waits. No re-analysis, no suggested next steps unless asked.

### Proactive surfacing

**Silent unless scoped to a node.** If a conversation is attached to a specific node (project, routine, area), the AI offers one orienting line about that node's current state. Free-floating conversations: AI says nothing until the user speaks. No fishing across the user's life space unprompted.

### Presentation of collected information

The presenter role activates on explicit request only. When the user asks for a view ("show me open actions for this area," "summarize where this project stands"), the AI renders it. Otherwise it stays quiet. Summaries are factual and scoped — the AI does not editorialize or prioritize on the user's behalf.

### Retrieval (RAG)

**Hybrid-lean.** Inject the current node + direct children as structured JSON (title, status, open actions) automatically into context on conversation open. RAG is available for explicit cross-space queries only — triggered by @-mention or natural language ("what have I written about this?"). No background retrieval running unprompted.

### UI constraints

No "write this for me" affordance in the UI. The production path is always: user explicitly asks in conversation → AI produces. There is no button or shortcut that bypasses the thinking phase.
