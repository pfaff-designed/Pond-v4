/**
 * The "mentioned" list a made page is born with (issue #97, `Pond 06.01` 6a
 * frame 5: "the prose moves across word for word; pond adds only a list of what
 * it mentioned").
 *
 * It lives in `pages.props` as `props.mentioned = [{ title, ref, note }]` — a
 * SIBLING of the reserved `_schema`, of the made-from stamp and of the template
 * stamp, with the same one-way, advisory posture: nothing reads it to CHANGE a
 * page. It is the proposal's own `PageProposalMention` shape (KAN-172,
 * `src/lib/conversation/page-proposals.ts`), carried verbatim into the made
 * page rather than re-derived from the prose: a record of what the answer
 * said, not a live index.
 *
 * Framework-agnostic: pure functions, no React, no Supabase.
 */

/** The `props` key that holds the list. Sibling of `_schema`, never inside it. */
export const MENTIONED_KEY = 'mentioned' as const

export interface MentionedPage {
  /** Its title as it read when this page was made. */
  title: string
  /** The page or record it resolves to, or null when it resolves to nothing. */
  ref: string | null
  /** Pond characterising why it is mentioned ("the one everything waits on"). */
  note: string
}

type Props = Record<string, unknown>

/** Stamp a page's props with what the answer mentioned, verbatim. Pure; an
 *  empty list is not written at all, so a page that mentioned nothing carries
 *  no key. */
export function stampMentioned(props: Props, mentioned: MentionedPage[]): Props {
  if (mentioned.length === 0) return props
  return {
    ...props,
    [MENTIONED_KEY]: mentioned.map((m) => ({ title: m.title, ref: m.ref, note: m.note })),
  }
}

/**
 * Read the list off a page's props, or null when absent or empty. Tolerant —
 * drops any malformed entry rather than throwing, so a hand-edited row degrades
 * to a shorter list (or no card) instead of a crash on read. Only a missing or
 * blank title drops a row; a missing or non-string `note` defaults to `''`
 * rather than dropping it.
 */
export function readMentioned(props: Props | null | undefined): MentionedPage[] | null {
  const value = props?.[MENTIONED_KEY]
  if (!Array.isArray(value)) return null
  const out: MentionedPage[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue
    const r = raw as Record<string, unknown>
    if (typeof r.title !== 'string' || !r.title.trim()) continue
    out.push({
      title: r.title,
      ref: typeof r.ref === 'string' || r.ref === null ? r.ref : null,
      note: typeof r.note === 'string' ? r.note : '',
    })
  }
  return out.length > 0 ? out : null
}
