/**
 * The flat page rows behind the ['pages'] tree — shared by the rail and the
 * overview surfaces so both read (and invalidate) the same React Query cache.
 *
 * The Life home row (ticket-44, `type='home'`) is stripped here — this is the ONE
 * boundary where it's excluded, so every UI-tree consumer (rail, overview counts
 * and cards, breadcrumb) never sees it: it can't become a rail child or inflate
 * the areas overview. Its blocks are reached only via lib/pages/home.ts.
 */

import type { QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { WorkspaceScope } from '@/lib/workspace/context'
import { HOME_TYPE } from '@/lib/pages/home'

export interface PageRow {
  id: string
  parent_id: string | null
  type: string
  title: string
  order: number
  updated_at: string
}

export async function fetchPages(workspace: WorkspaceScope = 'main'): Promise<PageRow[]> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('pages')
    .select('id, parent_id, type, title, "order", updated_at')
    .eq('user_id', user.id)
    .eq('workspace', workspace)
    // ticket-44: the reserved Life home row never enters the ['pages'] cache
    // (rail / overview counts / breadcrumb) — home blocks are read separately.
    .neq('type', HOME_TYPE)
    .order('order')

  if (error) throw error
  return (data ?? []) as PageRow[]
}

/**
 * Optimistically insert a just-created page into the ['pages', workspace] cache so
 * the rail sees it synchronously — before the navigate — instead of waiting on the
 * invalidate refetch. Fixes F26 (a new page shows at ROOT until a manual refresh):
 * the rail's reveal effect bailed because the new node wasn't in the stale cache
 * yet, and its once-per-selection guard then blocked a retry when the refetch
 * landed. Idempotent (dedupes by id); the subsequent invalidate reconciles the
 * placeholder `order`/`updated_at` with server truth.
 */
export function insertPageOptimistic(
  queryClient: QueryClient,
  workspace: WorkspaceScope,
  page: { id: string; parentId: string | null; type: string; title: string }
): void {
  queryClient.setQueryData<PageRow[]>(['pages', workspace], (rows) => {
    const existing = rows ?? []
    if (existing.some((r) => r.id === page.id)) return existing
    return [
      ...existing,
      {
        id: page.id,
        parent_id: page.parentId,
        type: page.type,
        title: page.title,
        order: 0,
        updated_at: new Date().toISOString(),
      },
    ]
  })
}
