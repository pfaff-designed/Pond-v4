/**
 * The "new page" flow shared by the top bar's ＋ (and anything else that
 * creates a top-level page): create an untitled area at the root, refresh the
 * ['pages'] tree, and hand the caller the created page for navigation.
 */

import type { QueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { createPage, type PondPage } from '@/lib/pages/client'

export async function createTopLevelPage(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient
): Promise<PondPage | undefined> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return undefined

  const created = await createPage(supabase, user.id, {
    parentId: null,
    type: 'area',
    title: 'Untitled',
  })
  await queryClient.invalidateQueries({ queryKey: ['pages'] })
  return created
}
