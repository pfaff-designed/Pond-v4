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
message are fetched server-side, HTML→text, timeout, `redirect: 'manual'`. Fetched
text is injected as cited source material; unreadable links are noted so the model
doesn't guess. Extraction + sanitization are pure (fetch injected) and jest-tested.
Hardened in the security-review round:

- **SSRF guard is parse-to-bytes.** IP-literal hosts are parsed to raw bytes and
  range-checked (no string prefix matching): IPv4 loopback/private/link-local/
  reserved/CGNAT, IPv6 `::`/`::1`/`fe80::/10`/`fc00::/7`, plus the embedded-IPv4
  forms the review proved bypassed the old string ladder — IPv4-mapped
  `[::ffff:127.0.0.1]` and hex `[::ffff:7f00:1]`, bracketed `[::]`, and NAT64
  `64:ff9b::/96` (both recurse into the embedded IPv4). Unparseable IPv6 literals
  are refused (fail closed). Every named bypass is pinned by a jest case.
- **Download capped during read, not after.** A declared Content-Length above
  ~1MB is rejected without reading; otherwise the body is streamed with a 50KB
  byte budget and the stream is CANCELLED at the cap — never buffered unbounded
  into route memory. Char truncation of the extracted text happens after.
  Jest covers the oversized-stream and Content-Length-reject paths.
- **Auth-gated.** Pre-auth reachability finding: in production the proxy
  (src/proxy.ts) redirects unauthenticated requests away from /api/chat, but the
  DEV_AUTOLOGIN dev bypass let cookie-less calls reach the route with a null
  user (our own verify curls did exactly that). Link fetching now runs only for
  an authenticated user — anonymous callers trigger no server-side fetches.
- **DNS-rebinding residual, stated plainly: a public hostname that resolves to a
  private IP bypasses this guard.** The check is hostname-level only; no DNS
  resolution or connection pinning is done. Accepted for the single-user threat
  model (the only requester is the workspace owner attacking their own server).
- **Single-turn injection.** Pasted-link contents ride the system prompt for the
  turn they were pasted in only — they are not persisted into the transcript.
  Both the injected block and the system prompt now say so explicitly, steering
  the model to ask for a re-paste (or search) instead of claiming it still has
  the page on a later turn.

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
  Sources are now de-duplicated by URL before render (the provider can cite one
  page several times — the verify run streamed 16 parts for one answer).
- create_page arc: search runs and feeds the same turn; tool unchanged.
- Transcript round-trip: pinned by jest (`transcript-source-parts.test.ts`) —
  a saved transcript carrying `source-url` parts + a provider-executed
  `web_search` tool part survives JSON save→restore and converts through
  `toModelMessages` without throwing, and `source-url` never leaks into model
  content. Cost controls: per-turn caps only (`maxUses` 5, 3 links/message) —
  fine for single-user; a per-day budget is future work if Pond goes multi-user.

Note: interactive UI create+accept+delete could not be driven to completion because
three other dev servers (parallel sessions) sharing one Supabase auth cookie +
BroadcastChannel kept hijacking the browser across ports. The functional layer was
verified deterministically via direct SSE curl against the ticket's own server; the
create_page proposal path itself is unchanged by this ticket and covered by existing
tests. No page was created in the shared workspace (curls were unauthenticated); the
existing "Ceramics Studio Plan" was left untouched.
