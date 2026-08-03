---
id: 10
label: wayfinder:grilling
status: resolved
blocked-by: [07, 09]
---

# Document Editor UX — AI diff mechanic and editing surface

## Decisions

### Diff card shape

AI proposals appear as annotated block cards in the AI terminal chat — not raw +/- line diffs. Each card shows the block type, the proposed change, and three actions: **Accept**, **Reject**, **Edit**. Cards are compact and scannable; the chat remains readable as a conversation.

### Accept-then-edit

The user cannot edit the AI's proposal inline in the chat card. "Edit" accepts the proposed content and drops it into the document panel in an editable state. The document panel is the single authoring surface; the chat terminal is a read-only audit trail of AI interaction.

### Diff visualization by block type

- **Text block**: before/after split — old text struck through, new text alongside.
- **Todo block**: full proposed list state — added items green, removed items struck through, reordered items indicated with an arrow. The whole list is the unit, not individual lines.
- **Metric block**: new label/value/unit/trend shown as a read-only preview card. No before/after — metrics are fully replaced, never partially diffed.

All three card types use the same underlying mechanic: the card references the block's stable UUID, and accepting writes the proposed state to that block ID in the document.

### Direct prose authoring

Text blocks in the document panel are **click-to-edit** — clicking activates an inline markdown editor (no mode switch, no toolbar). Save on blur or `Cmd+Enter`. New text blocks are added via a `+` control between blocks or at the document bottom.

**Block creation rules:**

- Text blocks: user can add directly.
- Todo and metric blocks: AI-initiated only. Their structure is AI-meaningful; manual construction would be brittle and weird.

### AI trigger

**Natural language in the AI terminal is the only trigger.** No slash commands, no right-click menus, no "ask AI" buttons in the document panel. The user describes the change they want ("rewrite the second paragraph", "turn this into a todo list") and the AI resolves the target block from the injected node context using block UUIDs. If the target is ambiguous, the AI asks a clarifying question before proposing a diff.

This preserves the IDE mental model (all AI interaction in the terminal) and enforces the behavior rule from ticket-06 (no "write this for me" affordance in the UI).
