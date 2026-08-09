---
id: 07
label: wayfinder:grilling
status: resolved
blocked-by: []
---

# Navigation Shell: sidebar vs. command palette vs. other

## Question

Now that the platform is locked as a responsive Next.js web app, what should the primary navigation shell look like? Options include a persistent sidebar, a command palette (keyboard-first), a bottom nav bar (mobile-primary), or a hybrid. The answer affects both desktop and mobile UX and should be consistent with Pond's philosophy of AI as steward — the navigation surface is where the user orients themselves in the app.

Key factors: desktop vs. mobile consistency, AI-assisted wayfinding vs. manual navigation, solo user who knows the app well (no discoverability tax needed long-term).

## Decision

**Desktop and mobile use fundamentally different shells.** The right call for each surface is different enough that a single responsive layout would be a compromise on both.

### Desktop — IDE three-panel layout

```
[sidebar / file tree] [document panel]
                      [AI panel — bottom, full-width]
```

- **Sidebar**: persistent file tree on the left. The **unified page tree** (see ticket-02 "Superseded") renders as a collapsible tree, same spatial metaphor as VS Code. Since every node is a page and a page is its own document, there is no separate "documents" section — sub-pages are simply children. `type` (`area`/`project`/`routine`/`action`/`page`) is a display tag, not a structural distinction.
- **Document panel**: center, primary content surface. This is where the current node's document lives and is edited. Equivalent to the code editor pane.
- **AI panel**: full-width bottom panel, spanning sidebar + document columns. Equivalent to the VS Code terminal. Collapsible. Always shows the current node name as a header above the input so context is never ambiguous. The AI previews changes inline in the chat (like Cursor diffs) before they are applied to the document panel.

No conversation management UI. One active conversation at a time, scoped to the current node. Navigating to a new node updates the context header and triggers the AI's orienting line (per ticket-06).

### Mobile — chat-first surface

- No document panel. No persistent sidebar.
- Primary surface is the conversation.
- Navigation is minimal — access to the file tree via a drawer or gesture when needed.
- Use case: quick capture and reference only. Not document editing.
- AI renders relevant content inline on request: "What's my workout today?" → AI reads the node and surfaces it in the conversation.
- Mental model: Ghostty / terminal chat. Clean, fast, text-first.

### Discoverability vs. efficiency

Solo power user — efficiency wins. No onboarding chrome, no persistent hints, no discovery affordances needed long-term. The sidebar file tree provides enough structural orientation; the AI's orienting line provides contextual orientation.

## Implications for future tickets

- **ticket-08 (mobile UX)**: mobile shell is chat-first with drawer navigation, capture + reference only. No document editor. AI renders content inline.
- **ticket-09 (document components)**: component blocks render in the document panel on desktop. On mobile, the AI renders a read-friendly version inline in the chat when queried.
- Document editor UX ticket (not yet filed): the document panel is the editing surface on desktop. AI proposes changes as a diff in the chat panel — user approves, rejects, or edits before the change lands in the document. Same mental model as Cursor inline diffs or a git diff review. This is the primary human-AI collaboration loop.
