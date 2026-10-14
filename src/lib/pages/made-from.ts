/**
 * The made-from chip's data (issue #97, `Pond 06.01` 6a frame 5).
 *
 * A page made from a streamed answer carries ONE stamp in its `props` —
 * `props.madeFromThread = { threadId, messageId, question, askedAt, hidden }` —
 * written once on make page. It is the provenance chip that links back to the
 * moment in the thread, and the design is explicit: **it can be hidden, not
 * removed.** So the only write after birth is the `hidden` flag; there is no
 * clear verb in this module and nothing deletes the key.
 *
 * It lives in `pages.props` as a SIBLING of the reserved `_schema` and of the
 * template stamp (`madeFromTemplate`, lib/templates/provenance.ts) — the same
 * home, the same one-way, advisory posture: nothing reads it to CHANGE a page.
 *
 * Framework-agnostic — pure functions plus one Supabase write, no React.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

/** The `props` key that holds the stamp. Sibling of `_schema`, never inside it. */
export const MADE_FROM_THREAD_KEY = 'madeFromThread' as const

export interface MadeFromThread {
  /** The conversation the answer came from, when known. */
  threadId: string | null
  /** The assistant message the page was made from. */
  messageId: string
  /** The question that answer replied to, and when it was asked (ISO, if known). */
  question: string
  askedAt: string | null
  /** When the page itself was made (ISO), stamped once alongside the rest. */
  madeAt: string
  /** Hidden from the page head by the person. Never removed. */
  hidden?: boolean
}

type Props = Record<string, unknown>

/** Stamp a page's props with the thread it was made from. Pure; written ONCE —
 *  props that already carry a stamp are returned as they are. */
export function stampMadeFrom(props: Props, stamp: Omit<MadeFromThread, 'hidden'>): Props {
  if (readMadeFrom(props)) return props
  return { ...props, [MADE_FROM_THREAD_KEY]: { ...stamp } }
}

/** Read the stamp off a page's props, or null when absent or malformed. */
export function readMadeFrom(props: Props | null | undefined): MadeFromThread | null {
  const value = props?.[MADE_FROM_THREAD_KEY]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (typeof v.messageId !== 'string' || !v.messageId) return null
  return {
    threadId: typeof v.threadId === 'string' ? v.threadId : null,
    messageId: v.messageId,
    question: typeof v.question === 'string' ? v.question : '',
    askedAt: typeof v.askedAt === 'string' ? v.askedAt : null,
    madeAt: typeof v.madeAt === 'string' ? v.madeAt : '',
    ...(v.hidden === true ? { hidden: true } : {}),
  }
}

/** The ONLY post-birth edit: show or hide the chip. Pure; everything else on
 *  the stamp is kept exactly as it was. A page with no stamp is left alone. */
export function withMadeFromHidden(props: Props, hidden: boolean): Props {
  const stamp = readMadeFrom(props)
  if (!stamp) return props
  const { hidden: _drop, ...rest } = stamp
  void _drop
  return { ...props, [MADE_FROM_THREAD_KEY]: hidden ? { ...rest, hidden: true } : rest }
}

/** Persist the hide/show toggle. Read-merge-write on `props`, so the schema
 *  and every other prop are untouched. No-op for a page without a stamp. */
export async function setMadeFromHidden(
  supabase: SupabaseClient<Database>,
  pageId: string,
  hidden: boolean
): Promise<void> {
  const { data } = await supabase.from('pages').select('props').eq('id', pageId).maybeSingle()
  const current = (data as { props?: unknown } | null)?.props
  const props: Props =
    current && typeof current === 'object' && !Array.isArray(current) ? (current as Props) : {}
  if (!readMadeFrom(props)) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('pages')
    .update({ props: withMadeFromHidden(props, hidden), updated_at: new Date().toISOString() })
    .eq('id', pageId)
  if (error) throw new Error(error.message)
}
