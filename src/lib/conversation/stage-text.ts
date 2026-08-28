/**
 * Streaming stage text (ticket-32, audit finding 11) — turns the tool-call events
 * already visible in the message stream into a single line of human progress copy,
 * so a 25–30s generation reads as "reading Ceramics Studio Plan…" instead of a bare
 * "…".
 *
 * Pure and data-only (no React), so the mapping is jest-pinned and the terminal
 * organism just renders whatever `stageTextForParts` returns. The terminal owns the
 * decision of WHEN to show this (only while streaming, only when the latest assistant
 * message has no visible text yet); this module owns only WHAT to say.
 *
 * The copy is deliberately quiet and lower-case — a whispered status under the
 * letterpress conversation, never a shouty spinner label.
 */

/** The minimal shape of a streamed message part we key on — its `type`, plus the
 *  tool inputs we can lift a name out of. Kept structural (not the SDK's part union)
 *  so this stays a plain data mapping the tests can call with literals. */
export interface StagePart {
  type: string
  /** Present on a `tool-*` part; the SDK marks a call in flight as `input-*` and a
   *  finished one as `output-*`/`input-available`. We treat any tool part whose call
   *  has begun as "this stage is happening now". */
  state?: string
  input?: {
    /** create_page: the proposed page title → "drafting <title>…". */
    title?: string
    /** read_page: the target page id (a title is nicer — the caller may supply a
     *  resolver via `resolvePageName`). */
    pageId?: string
  }
}

/** A tool part is "active" once its call has started streaming — at that point the
 *  human stage line is the right thing to show, even before the arguments finish. */
function isActiveTool(part: StagePart): boolean {
  return part.type.startsWith('tool-') && typeof part.state === 'string'
}

export interface StageTextOptions {
  /** Resolve a page id to its human title (read_page), so the stage reads
   *  "reading Ceramics Studio Plan…" rather than a raw id. Returns undefined when the
   *  id isn't known yet — the copy then falls back to the generic phrasing. */
  resolvePageName?: (pageId: string) => string | undefined
}

/**
 * The human stage line for a single tool part, or null if it isn't a tool part we
 * narrate. Exported so the mapping can be exercised one part at a time.
 */
export function stageTextForPart(part: StagePart, options: StageTextOptions = {}): string | null {
  if (!isActiveTool(part)) return null
  switch (part.type) {
    case 'tool-web_search':
      return 'searching the web…'
    case 'tool-fetch_context':
      return 'searching your workspace…'
    case 'tool-read_page': {
      const id = part.input?.pageId
      const name = id ? options.resolvePageName?.(id) : undefined
      return name ? `reading ${name}…` : 'reading your page…'
    }
    case 'tool-create_page': {
      const title = part.input?.title?.trim()
      return title ? `drafting ${title}…` : 'drafting your page…'
    }
    case 'tool-propose_changes':
      return 'proposing changes…'
    default:
      return null
  }
}

/**
 * The single active stage line for a message's parts, or null when nothing is
 * narratable (the terminal then shows its calm resting ellipsis). The LAST active
 * tool part wins — a turn that searches then drafts should read "drafting…" once the
 * draft begins, not stay stuck on the earlier search.
 */
export function stageTextForParts(
  parts: readonly StagePart[],
  options: StageTextOptions = {}
): string | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const line = stageTextForPart(parts[i], options)
    if (line) return line
  }
  return null
}
