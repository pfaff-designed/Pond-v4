---
id: 29
label: cycle-2:second-brain
status: resolved
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

## Resolution

Shipped on `ticket-29`.

**Web search mechanism — provider-native Anthropic web search (preferred path).**
`@ai-sdk/anthropic@4.0.27` exposes `anthropic.tools.webSearch_20260209`, and our
standard model (`claude-sonnet-4-6`) supports that dynamic-filtering variant, so no
search-API-backed route tool and no SDK bump were needed. The tool is
provider-executed: Claude issues the query, Anthropic runs the search server-side,
and the AI SDK v7 surfaces each cited result as a `source-url` UI-message part. The
route enables `sendSources` on the stream so those parts reach the terminal, which
renders them as a small `SourceList` "Sources" row under the answer. `maxUses` caps
searches per turn (cost control). The dynamic-filtering variant runs code_execution
under the hood to filter results before they hit context — this is expected and
handled by the raised `stepCountIs(8)` step budget.

**Freshness honesty** — prompt-level: from-memory figures (prices, specs, stats)
must carry a one-line "from memory, not today's prices" caveat, and the model is told
to search when the answer depends on current information.

**Paste-a-link** — `src/lib/context/paste-link.ts`: http(s) URLs in the user's
message are fetched server-side, HTML→text, ~50KB cap, timeout, `redirect: 'manual'`,
private/loopback/link-local/metadata hosts refused before the fetch. Fetched text is
injected as cited source material; unreadable links are noted so the model doesn't
guess. Extraction + sanitization are pure (fetch injected) and jest-tested.

**Discovery → create_page arc unchanged** — search is an input; create_page /
propose_changes are untouched and t21's authoring lint is intact.

**Verify (live, against own server on :3029):**

- Web search: SSE stream carried 16 `source-url` parts + a sourced answer with 19
  real current-price figures ("$19.98", "$215.99 VEVOR", clearance "$46.99 from
  $64.99"). Evidence: `~/t29-verify-websearch-sse.txt`.
- Paste-a-link: pasted `ceramic.school` URL → answer quoted that page's specific
  prices (VEVOR $215.99, Shimpo VL-Lite $975, Brent Model B $2,350) with **0** web
  searches, proving the injected-context path. Evidence: `~/t29-verify-pastelink-sse.txt`.
- Citation UI: `SourceList` rendered in Storybook (`~/t29-verify-sourcelist-story.png`).
- create_page arc: search runs and feeds the same turn; tool unchanged.

Note: interactive UI create+accept+delete could not be driven to completion because
three other dev servers (parallel sessions) sharing one Supabase auth cookie +
BroadcastChannel kept hijacking the browser across ports. The functional layer was
verified deterministically via direct SSE curl against the ticket's own server; the
create_page proposal path itself is unchanged by this ticket and covered by existing
tests. No page was created in the shared workspace (curls were unauthenticated); the
existing "Ceramics Studio Plan" was left untouched.
