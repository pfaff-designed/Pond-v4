---
id: 29
label: cycle-2:second-brain
status: open
blocked-by: []
blocks: []
---

# Discover: Pond can't research the web

## Problem

Second-brain audit (2026-08-28, finding 4): asked to "research beginner pottery
wheels," Pond honestly said it can't browse the web, then produced an excellent
from-knowledge answer. For the Discover workflow (research → plan → page) a
creative user needs real research: fresh prices, real product pages, links they
already have.

## Direction

1. **Web search tool in the chat route** — add a search tool the model can call
   during a turn (Anthropic server-side web search tool via the SDK if
   available on the current @ai-sdk/anthropic version, else a search-API-backed
   route tool). Results feed the answer; answers citing the web carry sources.
2. **Freshness honesty**: from-knowledge prices/models get a one-line caveat
   ("from memory, not today's prices") — prompt-level.
3. **Paste-a-link escape hatch**: a URL in the user's message gets fetched
   (server-side, sanitized, size-capped) and injected as context.
4. Discovery output must still land as pages via the existing create_page /
   propose_changes arc — search is an input, the page is the product.

## Rules (cycle 2)
Functionality ticket → live Playwright verify pass required (ask a research
question, see sourced answer; paste a URL, see it used; create the plan page).
/code-review before merge.

## Origin
Cycle-2 user-agent audit, finding 4 + user's Discover workflow brief.
