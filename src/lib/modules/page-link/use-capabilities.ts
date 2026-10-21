'use client'

/**
 * F27 — builds the card→page link capabilities for a block-authoring surface.
 *
 * Mounted once inside `BlockCanvas` (the shared authoring body), so the editor, the
 * Life home, and area pages all supply the same capabilities with no per-caller
 * wiring — each just passes the `pageId` it already owns as the parent for new child
 * pages. Resolution/search read the already-loaded `pagesKey()` cache the
 * rail/page surfaces populate (no extra fetch); create/rename reuse the same
 * `createPage`/`updateTitle` + optimistic-insert tail the rail's new-page
 * menu uses.
 */

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { createPage, updateTitle } from '@/lib/pages/client'
import { insertPageOptimistic } from '@/lib/pages/tree'
import { pagesKey } from '@/lib/pages/keys'
import { usePagesRows } from '@/lib/pages/use-pages'
import { workspaceHref, openWorkspaceUrl } from '@/lib/pages/nav'
import { usePondId } from '@/lib/pond/context'
import { resolvePageFromRows, searchPagesInRows } from './resolve'
import type { PageLinkCapabilities } from './context'

export function usePageLinkCapabilities(containingPageId: string): PageLinkCapabilities {
  // Lazily created on first use, not at render — so an envless mount (Storybook,
  // CI) never constructs a real client and throws (#38); only the create/rename
  // handlers below actually talk to Supabase.
  const getSupabase = useLazySupabase()
  const queryClient = useQueryClient()
  const pondId = usePondId()
  const router = useRouter()
  // Reads the rail/page cache — this query is already populated, so it's a cache
  // hit, not a second fetch.
  const { data: rows } = usePagesRows(pondId)

  return useMemo<PageLinkCapabilities>(
    () => ({
      resolvePage: (pageId) => resolvePageFromRows(rows, pageId),
      searchPages: (query) => searchPagesInRows(rows, query),
      navigateToPage: (ref) => openWorkspaceUrl(workspaceHref(ref), router),
      createLinkedPage: async (title) => {
        const supabase = getSupabase()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Not signed in')
        const created = await createPage(supabase, user.id, {
          parentId: containingPageId,
          type: 'page',
          title: title.trim() || 'Untitled',
          pondId,
        })
        insertPageOptimistic(
          queryClient,
          {
            id: created.id,
            parentId: containingPageId,
            type: created.type,
            title: created.title,
          },
          pondId
        )
        void queryClient.invalidateQueries({ queryKey: pagesKey() })
        return { id: created.id, title: created.title, type: created.type, isNew: false }
      },
      renamePage: async (pageId, title) => {
        await updateTitle(getSupabase(), pageId, title.trim() || 'Untitled')
        void queryClient.invalidateQueries({ queryKey: pagesKey() })
        void queryClient.invalidateQueries({ queryKey: ['page', pageId] })
      },
    }),
    [rows, containingPageId, getSupabase, queryClient, pondId, router]
  )
}
