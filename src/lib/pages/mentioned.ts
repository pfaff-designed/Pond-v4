/**
 * The "mentioned" list a made page is born with (issue #97, `Pond 06.01` 6a
 * frame 5: "the prose moves across word for word; pond adds only a list of what
 * it mentioned").
 *
 * It lives in `pages.props` as `props.mentioned = [{ pageId, title, note? }]` —
 * a SIBLING of the reserved `_schema`, of the made-from stamp and of the template
 * stamp, with the same one-way, advisory posture: nothing reads it to CHANGE a
 * page. Titles are snapshots of the moment the page was made, like the made-from
 * question is, so the list stays a record of what the answer said rather than a
 * live index.
 *
 * `note` is Pond characterising WHY a page is mentioned ("the one everything waits
 * on"). That is model work, tracked separately — this module and the card simply
 * carry a note when there is one and read correctly when there is not.
 *
 * Framework-agnostic: pure functions, no React, no Supabase.
 */

/** The `props` key that holds the list. Sibling of `_schema`, never inside it. */
export const MENTIONED_KEY = 'mentioned' as const

export interface MentionedPage {
  /** The page the answer mentioned. */
  pageId: string
  /** Its title as it read when this page was made. */
  title: string
  /** Why it is mentioned — absent until Pond writes one. */
  note?: string
}

type Props = Record<string, unknown>

/** Stamp a page's props with what the answer mentioned. Pure; an empty list is
 *  not written at all, so a page that mentioned nothing carries no key. */
export function stampMentioned(props: Props, mentioned: MentionedPage[]): Props {
  if (mentioned.length === 0) return props
  return {
    ...props,
    [MENTIONED_KEY]: mentioned.map((m) => ({
      pageId: m.pageId,
      title: m.title,
      ...(m.note?.trim() ? { note: m.note.trim() } : {}),
    })),
  }
}

/**
 * Read the list off a page's props, or null when absent or empty. Tolerant —
 * drops any malformed entry rather than throwing, so a hand-edited row degrades
 * to a shorter list (or no card) instead of a crash on read.
 */
export function readMentioned(props: Props | null | undefined): MentionedPage[] | null {
  const value = props?.[MENTIONED_KEY]
  if (!Array.isArray(value)) return null
  const out: MentionedPage[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue
    const r = raw as Record<string, unknown>
    if (typeof r.pageId !== 'string' || !r.pageId) continue
    if (typeof r.title !== 'string' || !r.title.trim()) continue
    out.push({
      pageId: r.pageId,
      title: r.title,
      ...(typeof r.note === 'string' && r.note.trim() ? { note: r.note } : {}),
    })
  }
  return out.length > 0 ? out : null
}
