---
id: 21
label: ux-audit:finding
status: open
blocked-by: []
blocks: []
---

# AI authors markdown prose where structured modules exist

## Problem

The AI is inconsistent about using the module catalog it's taught (t16):

- On the workout page it wrote **pipe-syntax markdown tables inside text
  blocks** — while on Fall Reading List (created the same day via `create_page`)
  it correctly used the real table module, which renders beautifully.
- Section headings are markdown `###` inside text blocks rather than any
  structured form.
- The first block of AI-created pages **repeats the page title** as a `##`
  heading (`## 📚 Fall Reading List` under the title "Fall Reading List").

Result: whether a page looks premium is a coin flip on which shape the model
happened to emit. Ticket-20 makes markdown render; this ticket makes the AI
prefer structure so tables/headings land as modules the registry can render,
diff, and edit.

## Direction (not yet designed)

- Sharpen the t16 system-prompt catalog / tool descriptions: tables → table
  module, never pipe syntax in text; no title-echo heading block.
- Consider an emit-time lint (server, in the Route Handler, where t16's
  discriminated-union check already runs): reject/flag text-module payloads
  that are clearly a markdown table.
- Add gauntlet cases to the ai-page-creation evals so regressions get caught
  (JUDGEMENTS-ai-page-creation.md harness).

## Origin

Hands-on UX audit, 2026-08-27 — same session that created Fall Reading List
(`~/ux-05-create-proposal.png`, `~/ux-06-created-page.png`).
