---
id: 40
label: cycle-3:w4
status: resolved
blocked-by: []
blocks: []
---

# W4 interaction batch: ⌘K palette · highlight-to-ask · voice input · CSV (F18b/F20/F6/F16)

One builder, one branch. Design: w2-design-brief.md conventions (dialog-chrome,
pressKickerClass, SlashMenu precedent).

1. **⌘K command palette (F18b)**: ⌘K opens a centered palette (dialog-chrome)
   instead of just focusing the input — search pages by title (from ['pages'],
   Enter jumps via workspaceUrl), quick actions (New page → CreatePageModal,
   Ask Pond → focuses composer with typed text carried over, Collapse/expand
   terminal), recent pages (last ~5 visited, localStorage). Filter-as-you-type,
   ↑/↓/Enter/Escape (reuse SlashMenu internals where sane). ⌘K with the
   palette open closes it. '/' stays local (F22 division).
2. **Highlight-to-ask (F20)**: REMOVE the "ask Pond →" header affordance (all
   overview surfaces). Selecting text on a page shows ONE quiet floating
   "Ask Pond" affordance near the selection (Notion-style, no toolbar circus);
   clicking focuses the composer with the selection attached as quoted context
   (a small quote chip above the input, removable; the sent message carries
   the quote + the containing blockId so propose_changes can scope). Quote
   renders in the user's aside as a pull-quote (Press language).
3. **Voice input (F6, input-only)**: mic button at the threshold (right of the
   input, quiet icon). Web Speech API (webkitSpeechRecognition, Chrome-fine
   for personal app): press to talk, live interim transcript into the
   composer, press again/silence to stop, REVIEW-before-send (never
   auto-send). Graceful absence (no API → no mic button). Note in Resolution:
   audio goes to the browser's cloud STT.
4. **CSV upload (F16, scoped)**: drag-drop onto the composer + a paperclip
   affordance → parse client-side (delimiter/quote/header detection; cap
   ~200KB / ~500 rows — bigger → honest "too big for now" toast, deferred);
   preview first rows in a quote-chip-like attachment; sending injects the
   parsed structure + sample rows as turn context (like paste-link, single
   turn) so Pond can propose a table/chart via the normal gate. Jest the
   parser hard (quotes, commas-in-cells, CRLF, BOM, ragged rows).

5. **Inline composer ghost-suggestion (from user's wireframe)**: when the
   composer is empty (or on a lull), show a single quiet greyed ghost-completion
   INSIDE the input — a model/context-suggested next thing to say (e.g. the top
   follow-up chip's text, or a phase-appropriate prompt) — with Tab/→ to accept
   (fills the input, doesn't send) and a small caret to cycle alternatives.
   Source the suggestions from the SAME set as the chip row (reuse t39
   suggest_followups; don't add a second suggestion channel). Never obstruct
   typing — vanishes the instant the user types. Quiet Press styling
   (press-faint), reduced-motion safe. Keep it OFF when the model has no
   suggestion. Story-test the accept + vanish-on-type + empty-source paths.

Token regime: jest+story proof (palette nav, selection-affordance logic as
testable units, CSV parser matrix, ghost accept/vanish); NO dev server;
touched-files lint clean.
Preserve all shipped machinery (t39 chips/cards/lifecycle untouched).
Resolution + status: resolved.
