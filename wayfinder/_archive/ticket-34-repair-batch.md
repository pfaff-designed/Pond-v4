---
id: 34
label: cycle-3:repair-batch
status: resolved
blocked-by: []
blocks: []
---

# Wave-1 repair batch — trust & surface fixes (findings F1a/F5/F7/F8/F10/F12/F15/F18a)

One batch ticket, one builder, one branch. User findings from live dogfooding
(full detail: scratchpad cycle3-user-findings.md; distilled here).

1. **Honest accepts + toast receipts (F1a+F12).** A Gantt proposal was accepted
   and silently landed nothing (block failed validation → skipped without a
   word). Rules: (a) any accept that skips changes must SAY SO on the card —
   what didn't land and why ("couldn't place: no timeline module"); (b) on
   apply, a toast receipt via the existing DeletionUndoProvider/notify system:
   "Added 2 items to <page> ✓" + open-page action. Receipt reports applied AND
   skipped counts honestly.
2. **User messages left-aligned (F5).** Kill the right-anchoring from t32; user
   asides sit on the shared left reading edge, keep the quiet sage-rule
   treatment (flip rule to left).
3. **Visible resize handle + composer growth (F7).** The t24 drawer handle is
   invisible — add a visible centered grip (Press language) + verify the drag
   still works post-t32. Composer textarea auto-grows with content (cap ~6
   lines).
4. **Markdown leak sweep (F8).** No human-read surface shows raw markdown:
   inline-markdown rendering (bold/italic/code/links only) for todo ITEM text
   and table CELLS; proposal diff cards render typeset with change highlight
   instead of raw source (keep a peek-at-source affordance if cheap).
5. **Stage indicator widening (F10).** StageText currently hides once any reply
   text streamed — show a quiet stage line at the transcript tail whenever a
   tool part is pending, even after text (same mapping, wider gate).
6. **Metric-ring layout collapse + double arrow (F15).** Ring view stacks
   title/ring/caption at editor width (screenshot evidence) — give it a real
   composed card layout at column width, long-title handling. Fix the
   duplicated → arrow on plain metrics.
7. **⌘K regression fix ONLY (F18a).** Verify/repair the capture-phase listener
   - focus path post-t26/t32 merges, and make the focus VISIBLE (scroll/uncollapse
   - perceptible focus cue). The command palette is a separate later ticket.

## Rules (cycle-3 token regime)

Jest + story tests are the proof — NO dev server, NO live verify (orchestrator
does one live pass per wave on merged main). No mobbin research (patterns
established; follow Press conventions in the codebase). Keep changes surgical;
all existing tests stay green. Resolution section + status: resolved when done.

## Resolution

All 7 fixes shipped on `ticket-34` (5 commits). Proof per the token regime:
typecheck clean, jest 44 suites / 539 tests green, test-storybook 24 files /
117 stories green, every touched file eslint-clean.

1. **Honest accepts + toast receipts (F1a+F12)** — `applyProposedChanges` /
   `writeAcceptedChanges` now return `{ applied, skipped, skippedReasons,
targetId }`; ProposalGroup renders "couldn't place — <reason>" per skip
   (generic notice fallback when reasons are gone post-reload; jest-pinned in
   accept-changes + page-edits, story `SkippedWithReasons`). On apply the
   terminal fires a receipt toast — "Added N blocks to <page> ✓" with an Open
   action, or "Nothing added…" when zero landed — via a new `NotifyBridge`
   (window-event relay, mirrors FOCUS_TERMINAL_EVENT) because the terminal
   mounts outside the DeletionUndoProvider; `UndoToast` gained an optional
   labeled action button. Wiring jest-tested end-to-end.
2. **User messages left-aligned (F5)** — the quiet sage rule flipped to a left
   border on the shared reading edge (`border-l-2`, no `justify-end`/
   `text-right`/max-width); same wash + serif treatment.
3. **Visible grip + composer growth (F7)** — the resize handle's grip is now
   `h-1 w-10 bg-press-muted/40` (accent on hover/focus); drag mechanics
   untouched (KeyboardResize story still green). Composer textarea auto-grows
   with newlines, capped at 6 rows. Story `GripVisible` added.
4. **Markdown leak sweep (F8)** — new `MarkdownInline` atom (bold/italic/code/
   links only; block elements stripped to text) renders todo item labels and
   table cell display; raw string stays in the inputs while editing. TextDiffer
   renders both sides typeset via the Markdown atom with strike/ins change
   highlighting instead of raw source. Stories pin inline rendering + block
   stripping.
5. **Stage indicator widening (F10)** — `hasActiveTool(parts)` added to
   stage-text (jest-pinned); the terminal's gate is now `isStreaming &&
hasActiveTool(latest assistant parts)` so the stage line stays while any
   tool part is pending, even after reply text streamed — and yields once the
   tools settle.
6. **Metric-ring layout + double arrow (F15)** — MetricRingView is a composed
   centred card at column width: wrapping title, ring (focal numeral = the
   percentage), "N% complete" caption; long titles wrap instead of collapsing
   the ring (story `LongTitle`). The double `→` on plain metric rows was the
   `flat` trend glyph colliding with the go-to-source link — flat is now `—`.
7. **⌘K regression (F18a)** — traced TopBar capture-phase listener →
   FOCUS_TERMINAL_EVENT → AITerminal pending-focus path: intact post-t26/t32.
   Made focus perceptible: uncollapse (existing) + `scrollIntoView` + an 800ms
   sage ring flash on the input, on both the immediate and pending-focus
   paths. Event-name contract jest-pinned (terminal-focus.test.ts).

Deferred/notes: skip _reasons_ are session-scoped (counts persist via the
resolutions envelope; reasons degrade to the generic notice after reload).
The peek-at-source affordance on diff cards (ticket's "if cheap") was skipped —
not cheap with the differ's current shape. Command palette remains a later
ticket per the spec.
