/**
 * The flat page rows behind the ['pages'] tree — shared by the rail and the
 * overview surfaces so both read (and invalidate) the same React Query cache.
 */

import { createClient } from '@/lib/supabase/client'
import type { WorkspaceScope } from '@/lib/workspace/context'

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
    .order('order')

  if (error) throw error
  return (data ?? []) as PageRow[]
}
