import { anthropic } from '@ai-sdk/anthropic'
import { streamText, tool, stepCountIs } from 'ai'
import type { UIMessage } from 'ai'
import { AI_MODELS } from '@/lib/ai/models'
import { createClient } from '@/lib/supabase/server'
import { toModelMessages, withoutWebSearch } from '@/lib/conversation/transcript'
import { applyResolutions } from '@/lib/conversation/resolutions'
import { buildChatContext } from '@/lib/context/assemble'
import { retrievePages, formatRetrievedPages } from '@/lib/embeddings/retrieve'
import { buildSystemPrompt } from './prompt'
import {
  createPageTool,
  defineSchemaTool,
  addRowTool,
  promoteTableTool,
  configureViewTool,
  linkRecordsTool,
  proposeChangesTool,
  fetchContextTool,
  readPageTool,
  askQuestionTool,
  suggestFollowupsTool,
  openChangeLogTool,
} from './tools'
import { stepBudgetForPhase } from './step-budget'
import { scopingContextNote } from './scoping'
import { lifecycleContextNote } from '@/lib/conversation/lifecycle'
import { webSearchTool } from './web-search'
import { makeRepairToolCall } from '@/lib/ai/repair'
import { fetchLinkContext } from '@/lib/context/paste-link'
import { fetchNodeContext, formatNodeContext } from '@/lib/context/assemble'
import { recordProposedToolCalls } from '@/lib/change-log/propose'
import { resolveChangeLogRecord } from '@/lib/change-log/resolve'
import { requestChangesContextNote } from './request-changes'
import { referencesContextNote, wholePageReferenceNote } from './references'
import { parseChatBody } from './body'
import { isWholePageReference } from '@/lib/references/reference'
import { mentionPillRuns } from '@/lib/references/mention-pill'

/**
 * Remove each `@<title>` run matching a whole-page reference's title (the same
 * runs the composer's mention pill paints, KAN-99) before the text reaches
 * parseMentions, so a picked page is never resolved twice — once as a
 * structured reference, once again as a legacy KAN-19 @mention.
 */
function stripWholePageMentions(text: string, titles: readonly string[]): string {
  const runs = mentionPillRuns(text, titles)
  if (runs.length === 0) return text
  let result = ''
  let last = 0
  for (const run of runs) {
    result += text.slice(last, run.start)
    last = run.end
  }
  return result + text.slice(last)
}

/** Plain text of the most recent user message, for @mention parsing. */
function latestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    return m.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { type: 'text'; text: string }).text)
      .join(' ')
  }
  return ''
}

export async function POST(req: Request) {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = parseChatBody(rawBody)
  if (!parsed) {
    return Response.json({ error: 'Request body must include a messages array' }, { status: 400 })
  }
  const { messages, nodeId, nodeType, resolutions, requestChanges, research, references, openPageContext } =
    parsed
  const pondId = parsed.pondId ?? null

  // Assemble node context (current node + @mentions) to inject into the prompt.
  const userText = latestUserText(messages)
  let system = buildSystemPrompt(null, { research })
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Paste-a-link (ticket-29): any http(s) URL in the latest user message is fetched
  // server-side (sanitized, size-capped, no redirects into private ranges) and
  // injected as source material the model can cite. Gated on an authenticated
  // user: in production the proxy already redirects unauthenticated requests, but
  // the dev auto-login bypass (DEV_AUTOLOGIN) lets cookie-less calls through, and
  // an SSRF-adjacent fetch surface must never run for anonymous callers.
  const contextBlocks: string[] = []
  if (user) {
    const linkContext = await fetchLinkContext(userText)
    if (linkContext) contextBlocks.push(linkContext)

    // A whole-page reference (KAN-99's `@`-picker chip) inserts `@<title>` into
    // the input as plain text, which the legacy KAN-19 @mention path below would
    // otherwise resolve a SECOND time — and for a multi-word title, parseMentions'
    // bare-word grammar only reads the first word, which can resolve a different
    // page entirely. Fetch these pages once, up front, both to strip their
    // mention text before it reaches buildChatContext/parseMentions and to reuse
    // for the whole-page note below (no second fetch per page).
    const wholePageRefs = references.filter(isWholePageReference)
    const wholePageData = new Map<string, Awaited<ReturnType<typeof fetchNodeContext>>>()
    await Promise.all(
      [...new Set(wholePageRefs.map((r) => r.pageId))].map(async (pageId) => {
        wholePageData.set(pageId, await fetchNodeContext(supabase, user.id, pageId))
      })
    )
    const wholePageTitles = [...wholePageData.values()].flatMap((data) => (data ? [data.title] : []))
    const userTextForMentions =
      wholePageTitles.length > 0 ? stripWholePageMentions(userText, wholePageTitles) : userText

    const context = await buildChatContext(supabase, user.id, {
      nodeId,
      nodeType,
      latestUserText: userTextForMentions,
      // #312: the composer reads only this pond (`s6m5`).
      pondId,
      // KAN-99: `nodeId` still rides every other use (propose_changes targets
      // it) — only its content block is withheld once its chip is dismissed.
      skipNodeContext: !openPageContext,
    })
    if (context) contextBlocks.push(context)

    // Highlight-to-ask references (KAN-98, board 6e): resolve each distinct
    // referenced page's current title (a rename since the chip was made must
    // still read right) and quote the passage back labelled with title +
    // block id — never interpolated into the prompt as instructions (KAN-309).
    // A whole-page reference (KAN-99's `@`-picker chip, `blockId: null`) has no
    // passage to quote, so it routes separately: its page's full content goes
    // through fetchNodeContext/formatNodeContext instead, unless it points at
    // the open node, whose content the auto-injected block above already carries.
    if (references.length > 0) {
      const passageRefs = references.filter((r) => !isWholePageReference(r))

      if (passageRefs.length > 0) {
        const titles = new Map<string, string>()
        await Promise.all(
          [...new Set(passageRefs.map((r) => r.pageId))].map(async (pageId) => {
            const data = await fetchNodeContext(supabase, user.id, pageId)
            if (data) titles.set(pageId, data.title)
          })
        )
        const note = referencesContextNote(
          passageRefs.map((r) => ({
            pageTitle: titles.get(r.pageId) ?? r.pageId,
            blockId: r.blockId ?? '',
            quotedText: r.quotedText,
          }))
        )
        if (note) contextBlocks.push(note)
      }

      const otherPageIds = [...new Set(wholePageRefs.map((r) => r.pageId))].filter(
        (pageId) => pageId !== nodeId
      )
      if (otherPageIds.length > 0) {
        const note = wholePageReferenceNote(
          otherPageIds.flatMap((pageId) => {
            const data = wholePageData.get(pageId)
            return data ? [{ pageTitle: data.title, context: formatNodeContext(data) }] : []
          })
        )
        if (note) contextBlocks.push(note)
      }
    }

    // Request changes (#98, 6c frame 3): the note is the person's decision on
    // the original card, so the record leaves `proposed` here — the browser
    // advances it too, and both are idempotent against each other through the
    // store's `isOpen` check. Never throws.
    if (requestChanges && requestChanges.reason === 'note') {
      await resolveChangeLogRecord(supabase, {
        userId: user.id,
        pondId,
        toolCallId: requestChanges.toolCallId,
        decision: 'changes_requested',
      })
    }
  }
  // #98 — tell the model this turn answers a request-changes note (or revises an
  // outdated card) and must come back as a REVISED propose_changes. Deterministic.
  if (requestChanges) contextBlocks.push(requestChangesContextNote(requestChanges))
  // Stuck-in-grill guard (ticket-39 review): once the grill has run
  // GRILL_NUDGE_THRESHOLD turns, inject the [Lifecycle] note that forces an
  // advance chip into this reply's suggest_followups (the CORRESPONDENCE
  // section teaches the model to obey it). Deterministic — the grillTurns
  // counter rides the envelope, so this fires regardless of model mood.
  const lifecycleNote = resolutions.lifecycle ? lifecycleContextNote(resolutions.lifecycle) : null
  if (lifecycleNote) contextBlocks.push(lifecycleNote)
  // Scope-before-build gate (#59): a BARE structural-creation request ("create
  // a project" with no subject) must draw scoping questions, never an invented
  // project filled in blind. Deterministic — the detector reads the latest user
  // text, so this fires regardless of model mood; the prompt's SCOPING section
  // handles the paraphrases the heuristic can't see.
  const scopingNote = scopingContextNote(userText)
  if (scopingNote) contextBlocks.push(scopingNote)
  if (contextBlocks.length > 0) {
    system = buildSystemPrompt(contextBlocks.join('\n\n'), { research })
  }

  // Step budget by lifecycle phase (ticket-39 §4). A BUILD-OUT turn lands the
  // structure as several separate tool batches and so needs more round-trips
  // than a chat turn; grill/wayfinding/idle keep the incumbent cap. The phase
  // rides the resolutions envelope (parsed above), defaulting to idle chat.
  const phase = resolutions.lifecycle?.phase ?? 'idle'

  // Prompt caching: one ephemeral breakpoint on the final transcript message
  // caches the whole prefix up to it (tools + system + prior turns). Next turn
  // that block sits mid-history, so system+tools+transcript read from cache at
  // ~0.1x and don't count against rate limits. system carries per-node context,
  // so a node switch rewrites the cache; within a node's thread every turn after
  // the first is a hit. Verify via usage.cacheReadInputTokens > 0 on turn 2.
  const resolved = applyResolutions(messages, resolutions)
  const modelMessages = await toModelMessages(research ? resolved : withoutWebSearch(resolved))
  // @ai-sdk/anthropic reads cacheControl from part.providerOptions (part-level),
  // NOT message-level — so the breakpoint must go on the last content PART of the
  // last message. That caches the whole prefix up to it (tools + system + prior
  // turns); next turn it reads back at ~0.1x and skips rate-limit accounting.
  const lastMessage = modelMessages.at(-1) as
    { content: unknown; providerOptions?: Record<string, unknown> } | undefined
  if (lastMessage) {
    const cc = { anthropic: { cacheControl: { type: 'ephemeral' as const } } }
    // convertToModelMessages collapses a single-text message to a STRING content;
    // @ai-sdk/anthropic reads cacheControl at the part level, so normalize to a
    // parts array first, then tag the last part. Either way a real content part
    // carries the breakpoint, caching tools + system + prior turns up to here.
    if (typeof lastMessage.content === 'string') {
      lastMessage.content = [{ type: 'text', text: lastMessage.content, providerOptions: cc }]
    } else if (Array.isArray(lastMessage.content)) {
      const parts = lastMessage.content as Array<{ providerOptions?: Record<string, unknown> }>
      const lastPart = parts.at(-1)
      if (lastPart) lastPart.providerOptions = { ...(lastPart.providerOptions ?? {}), ...cc }
    }
  }

  // Client-resolved tools have no `execute`: the call renders a proposal card and the
  // person's accept or reject rides the resolutions envelope. The web is not here —
  // `web_search` joins only on a question research was turned on for.
  const chatTools = {
    create_page: tool(createPageTool),
    define_schema: tool(defineSchemaTool),
    add_row: tool(addRowTool),
    promote_table: tool(promoteTableTool),
    configure_view: tool(configureViewTool),
    link_records: tool(linkRecordsTool),
    propose_changes: tool(proposeChangesTool),
    // `execute` closes over the per-request client and user.
    read_page: tool({
      ...readPageTool,
      execute: async ({ pageId }) => {
        if (!user) return 'No user session; cannot read that page.'
        const data = await fetchNodeContext(supabase, user.id, pageId)
        if (!data) return `No page found with id ${pageId} (it may not exist or is not yours).`
        return formatNodeContext(data, { label: `Read: ${data.title}`, includeBlockIds: true })
      },
    }),
    fetch_context: tool({
      ...fetchContextTool,
      execute: async ({ query }) => {
        if (!user) return 'No user session; cannot retrieve workspace context.'
        const pages = await retrievePages(supabase, user.id, pondId, query, { matchCount: 5 })
        return formatRetrievedPages(pages)
      },
    }),
    ask_question: tool(askQuestionTool),
    suggest_followups: tool(suggestFollowupsTool),
    open_change_log: tool(openChangeLogTool),
  }

  const result = streamText({
    model: anthropic(AI_MODELS.standard),
    system,
    // Resolved proposal cards are stamped with their user decision as a synthetic
    // tool result (ticket-19) so the model sees what was actioned and stops
    // re-proposing; unresolved calls are still dropped by toModelMessages.
    messages: modelMessages,
    // Allow several round-trips: the model can call fetch_context or run one or more
    // web searches (ticket-29), read the results, and answer in the same turn.
    // create_page stays client-side (no execute) and still ends the turn as before.
    // The web_search tool caps its own uses per turn (WEB_SEARCH_MAX_USES); this
    // outer bound covers the read-then-answer round-trips around those searches.
    // Build-out turns get more head-room (ticket-39 §4 — see step-budget.ts).
    stopWhen: stepCountIs(stepBudgetForPhase(phase)),
    // Self-correction on top of the strict inputSchema gate (t16 branch 7): if the
    // model emits a tool call whose arguments fail schema validation — most likely a
    // slightly-off propose_changes batch against the closed discriminated union —
    // re-ask it to produce valid arguments rather than dropping the turn. The strict
    // schema is still the gate; this only widens the model's second chance to hit it.
    // Logic lives in @/lib/ai/repair so it can be exercised directly (eval-repair.mts).
    repairToolCall: makeRepairToolCall(),
    tools: research ? { ...chatTools, web_search: webSearchTool } : chatTools,
    // Spec #110 criterion 2: a proposal becomes a durable change-log record the
    // moment it is PROPOSED, carrying the before/after snapshot — not a decision
    // recorded after the fact. Every proposal tool is client-resolved (no
    // `execute`), so there is no tool body to log from; this is the one
    // server-side point that sees each call as it is emitted, and it logs whether
    // or not the browser ever renders the card.
    //
    // `recordProposedToolCalls` never throws: the log is a side-record of the
    // turn, not a precondition for the reply.
    onStepFinish: async ({ toolCalls }) => {
      if (!user || toolCalls.length === 0) return
      await recordProposedToolCalls(supabase, {
        userId: user.id,
        // #312: the change log is per pond (`s6m5`).
        pondId,
        openPageId: nodeId ?? null,
        // #98 — a propose_changes emitted in answer to a request-changes note is
        // the revision of that card's record, linked through links.revisedFrom.
        revisesToolCallId: requestChanges?.toolCallId ?? null,
        toolCalls: toolCalls.map((c) => ({
          toolCallId: c.toolCallId,
          toolName: c.toolName as string,
          input: (c as { input?: unknown }).input,
        })),
      })
    },
  })

  // sendSources streams the web_search citations (source-url parts) to the client so
  // the terminal can render them as a SourceList under the sourced answer (ticket-29).
  return result.toUIMessageStreamResponse({ sendSources: true })
}
