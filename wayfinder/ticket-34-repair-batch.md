---
id: 34
label: cycle-3:repair-batch
status: open
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
   + focus path post-t26/t32 merges, and make the focus VISIBLE (scroll/uncollapse
   + perceptible focus cue). The command palette is a separate later ticket.

## Rules (cycle-3 token regime)
Jest + story tests are the proof — NO dev server, NO live verify (orchestrator
does one live pass per wave on merged main). No mobbin research (patterns
established; follow Press conventions in the codebase). Keep changes surgical;
all existing tests stay green. Resolution section + status: resolved when done.
