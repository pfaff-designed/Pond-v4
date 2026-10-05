/**
 * web_search (ticket-29) — Anthropic's provider-executed web search tool, exposed
 * through the AI SDK's Anthropic provider. Claude issues the query, Anthropic runs
 * the search server-side, and the results (with citations) come back inside the same
 * turn — no client-side execution, no separate search API to key.
 *
 * We use the `_20260209` dynamic-filtering variant (supported on Sonnet 4.6, our
 * standard model): Claude filters results before they reach the context window,
 * which is more accurate and token-efficient. `maxUses` caps searches per turn so a
 * single question can't run an unbounded (and unbillable-to-the-user) number of
 * searches. The provider streams `source-url` parts for each cited result; the route
 * enables `sendSources` so they reach the terminal, which renders them as a citation
 * row (SourceList).
 *
 * Research is the only thing that reads the web: the route offers the tool only on
 * a question the person asked to research (off by default, spent per question).
 *
 * Kept in its own module (not in tools.ts) so the widely-imported routing-schema
 * module stays free of the `@ai-sdk/anthropic` top-level import — only the Route
 * Handler (a Node/server module) pulls this in.
 */
import { anthropic } from '@ai-sdk/anthropic'

/** Max web searches Claude may run in a single turn (cost control). */
export const WEB_SEARCH_MAX_USES = 5

export const webSearchTool = anthropic.tools.webSearch_20260209({
  maxUses: WEB_SEARCH_MAX_USES,
})
