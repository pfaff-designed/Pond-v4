---
id: 09
label: wayfinder:grilling
status: closed
blocked-by: [02, 07]
blocks: [10]
---

# Document component library

## Question

Documents are JSON block arrays. Beyond prose text, what structured component types exist? What data does each expect? How does the AI select them? Are they interactive?

Questions to resolve:

- What component types exist in v4?
- What data does each component expect from the data model?
- How does the AI decide which component to use?
- Are components read-only or interactive?
- How is a component block serialized in the JSON content array?

## Resolution

### Component types

Three first-class block types:

- `text` — prose + markdown. Handles ordered and unordered lists inline via markdown formatting. No separate list block types.
- `todo` — checkbox list. Stateful (checked/unchecked per item). Items are document-local — not live references to Actions.
- `metric` — a single KPI display (label, value, unit, trend). Rendering library deferred to implementation; schema defined here.

### Data expectations

- `text`: self-contained markdown string. No data model dependencies.
- `todo`: items are document-local snapshots. The AI may populate them by inspecting the current node's Actions, but what it writes is a snapshot — no bidirectional sync.
- `metric`: the AI writes the display values directly (label, value, unit, trend). No computed fields, no live data binding.

### AI component selection

User-directed. The AI never emits component blocks unprompted — doing so would violate the "AI never initiates production" rule from ticket-06.

Exception: when the user requests a response and a component block is the clearest representation (e.g., "what's left on this project?" → AI emits a todo block), the AI may choose the component format. The request is still user-initiated; the AI is choosing the format of its answer.

Rule-based selection (emit components based on node type) is explicitly rejected — too brittle.

### Interactivity

- `todo` checkboxes: interactive. User can check/uncheck items directly in the document panel.
- `text` blocks: read-only in the document panel. Editable only via AI diff (ticket-10).
- `metric` blocks: read-only in the document panel. Editable only via AI diff (ticket-10).

### Serialization schema

```ts
type Block =
  | { id: string; type: 'text'; content: string }
  | { id: string; type: 'todo'; items: TodoItem[] }
  | {
      id: string
      type: 'metric'
      label: string
      value: number
      unit?: string
      trend?: 'up' | 'down' | 'flat'
    }

type TodoItem = { id: string; label: string; checked: boolean }
```

Each block carries a stable UUID `id` so the diff mechanic (ticket-10) can target blocks by ID rather than by position.
