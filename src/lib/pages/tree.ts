/**
 * The flat page rows behind the ['pages'] tree — shared by the rail and the
 * overview surfaces so both read (and invalidate) the same React Query cache.
 *
 * The Life home row (ticket-44, `type='home'`) is stripped here — this is the ONE
 * boundary where it's excluded, so every UI-tree consumer (rail, overview counts
 * and cards, breadcrumb) never sees it: it can't become a rail child or inflate
 * the areas overview. Its blocks are reached only via lib/pages/home.ts.
 */

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
