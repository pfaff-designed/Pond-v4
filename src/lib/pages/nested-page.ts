/**
 * The nested-page stamp (`Pond 06.11 Nest a page from a block.dc.html` frames 2–3,
 * KAN-122).
 *
 * A page made by `/ nested page` carries TWO stamps in its `props`, written at
 * two different moments:
 *
 * - `props.kind = 'nested page'` and `props.nestedFrom = <parent page id>`,
 *   written ONCE at create.
 * - `props.openedAt`, written ONCE the first time the page is opened for
 *   reading — the caller elsewhere does that write; this module only reads it
 *   to decide whether the page still counts as `new`.
 *
 * It lives in `pages.props` as a SIBLING of the reserved `_schema`, the same
 * home and the same write-once posture as `made-from.ts`'s `madeFromThread`.
 *
 * Pure — no React, no Supabase, except {@link markOpened} — the first-open
 * write, read-merge-write on `props` exactly like `made-from.ts`'s
 * `setMadeFromHidden`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

export const NESTED_PAGE_KIND = 'nested page' as const

type Props = Record<string, unknown>

/** Stamp a page's props as nested under `parentPageId`. Pure; written ONCE —
 *  props that already carry a `nestedFrom` are returned as they are. */
export function stampNestedPage(props: Props, parentPageId: string): Props {
  if (readNestedFrom(props)) return props
  return { ...props, kind: NESTED_PAGE_KIND, nestedFrom: parentPageId }
}

/** Read the parent page id off a page's props, or null when absent or malformed. */
export function readNestedFrom(props: Props | null | undefined): string | null {
  const value = props?.nestedFrom
  return typeof value === 'string' && value ? value : null
}

/** True iff the page was made by `/ nested page` and has not yet been opened. */
export function isNewNestedPage(props: Props | null | undefined): boolean {
  if (!readNestedFrom(props)) return false
  return typeof props?.openedAt !== 'string'
}

/**
 * Stamp `openedAt` the first time a nested page is opened. Read-merge-write on
 * `props`, so the schema and every other prop are untouched. No-op for a page
 * that isn't a nested page, or one already opened.
 */
export async function markOpened(
  supabase: SupabaseClient<Database>,
  pageId: string
): Promise<void> {
  const { data } = await supabase.from('pages').select('props').eq('id', pageId).maybeSingle()
  const current = (data as { props?: unknown } | null)?.props
  const props: Props =
    current && typeof current === 'object' && !Array.isArray(current) ? (current as Props) : {}
  if (!isNewNestedPage(props)) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('pages')
    .update({
      props: { ...props, openedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq('id', pageId)
  if (error) throw new Error(error.message)
}
