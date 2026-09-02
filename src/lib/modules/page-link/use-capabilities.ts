'use client'

/**
 * F27 — builds the card→page link capabilities for a block-authoring surface.
 *
 * Mounted once inside `BlockCanvas` (the shared authoring body), so the editor, the
 * Life home, and area pages all supply the same capabilities with no per-caller
 * wiring — each just passes the `pageId` it already owns as the parent for new child
 * pages. Resolution/search read the already-loaded `['pages', workspace]` cache the
 * rail/overview surfaces populate (no extra fetch); create/rename reuse the same
 * `createPage`/`updateTitle` + optimistic-insert tail `CreatePageModal` uses.
 */

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { createPage, updateTitle } from '@/lib/pages/client'
import { fetchPages, insertPageOptimistic } from '@/lib/pages/tree'
import { workspaceHref } from '@/lib/pages/nav'
import { useWorkspace } from '@/lib/workspace/context'
import { resolvePageFromRows, searchPagesInRows } from './resolve'
import type { PageLinkCapabilities } from './context'

export function usePageLinkCapabilities(containingPageId: string): PageLinkCapabilities {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const workspace = useWorkspace()
  const router = useRouter()
  // Reads the rail/overview cache — this query is already populated, so it's a cache
  // hit, not a second fetch.
  const { data: rows = [] } = useQuery({
    queryKey: ['pages', workspace],
    queryFn: () => fetchPages(workspace),
  })

  return useMemo<PageLinkCapabilities>(
    () => ({
      resolvePage: (pageId) => resolvePageFromRows(rows, pageId),
      searchPages: (query) => searchPagesInRows(rows, query),
      navigateToPage: (ref) => router.push(workspaceHref(ref)),
      createLinkedPage: async (title) => {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Not signed in')
        const created = await createPage(supabase, user.id, {
          parentId: containingPageId,
          type: 'page',
          title: title.trim() || 'Untitled',
          workspace,
        })
        insertPageOptimistic(queryClient, workspace, {
          id: created.id,
          parentId: containingPageId,
          type: created.type,
          title: created.title,
        })
        void queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
        return { id: created.id, title: created.title, type: created.type }
      },
      renamePage: async (pageId, title) => {
        await updateTitle(supabase, pageId, title.trim() || 'Untitled')
        void queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
        void queryClient.invalidateQueries({ queryKey: ['page', pageId] })
      },
    }),
    [rows, containingPageId, supabase, queryClient, workspace, router]
  )
}
