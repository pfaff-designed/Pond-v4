'use client'

import { useContext } from 'react'
import { QueryClientContext, type QueryClient } from '@tanstack/react-query'
import type { ModuleViewProps } from '../types'
import { usePageLinks } from './context'
import { useBlockCount } from './use-block-count'
import { useBlockRow } from '../block-row-context'
import type { PageLinkBlock } from './schema'
import type { PageRow } from '@/lib/pages/tree'
import { pagesKey } from '@/lib/pages/keys'
import { usePagePrefetchHandlers } from '@/lib/pages/use-page-prefetch'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { cn } from '@/lib/utils'
import { POND_BLOCK_SELECTED_RING } from '@/components/organisms/PondBlock'

/**
 * The page-link row (6k frame 2), inline values: `display:flex;align-items:
 * center;gap:10px;padding:10px 4px;border-bottom:1px solid rgba(27,29,20,.09);
 * font-size:14px`. One focusable row, no card.
 *
 * `N blocks` is the linked page's live block count (`use-block-count.ts`),
 * re-read on demand — never stored.
 */
const ROW =
  'flex items-center gap-[10px] border-b border-mn-text/[0.09] px-1 py-[10px] text-[14px]'

function PageIcon() {
  return (
    <span aria-hidden className="flex flex-none text-mn-text-meta">
      <svg
        width="13"
        height="13"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.5 2h5l2.5 2.5V12h-7.5zM8.5 2v2.5H11" />
      </svg>
    </span>
  )
}

/** A live page row from the `['pages']` cache whose id matches, or null if none is cached. */
function findCachedPageRow(queryClient: QueryClient, pageId: string): PageRow | null {
  const matches = queryClient.getQueriesData<PageRow[]>({ queryKey: pagesKey() })
  for (const [, rows] of matches) {
    const row = rows?.find((row) => row.id === pageId)
    if (row) return row
  }
  return null
}

export function PageLinkView({ data }: ModuleViewProps<PageLinkBlock>) {
  const pageLinks = usePageLinks()
  const ref = pageLinks?.resolvePage(data.pageId) ?? null
  // Read via the raw context (not `useQueryClient()`, which throws without a
  // provider) — a host with no `PageLinkProvider` (the change-log diff card)
  // may still have a `QueryClientProvider` above it, whose `['pages']` cache
  // tells a live page from a deleted one.
  const queryClient = useContext(QueryClientContext)
  const cachedRow =
    !pageLinks && queryClient ? findCachedPageRow(queryClient, data.pageId) : null
  const blocks = useBlockCount(ref || cachedRow ? data.pageId : undefined)
  // The canvas's own selection (⇧Tab / keyboard, ⌘⌫ target) reaches this row
  // through `BlockRowContext` rather than `PondBlock` (07.05) — `block-frame.ts`
  // draws no card around a page-link, same bridge KAN-344's chart card uses.
  const { selected } = useBlockRow()
  const selectedRing = selected && POND_BLOCK_SELECTED_RING
  const getSupabase = useLazySupabase()
  const pagePrefetch = usePagePrefetchHandlers(data.pageId, getSupabase)

  if (!ref && !cachedRow) {
    return (
      <div className={cn(ROW, selectedRing)}>
        <PageIcon />
        <span className="flex-1 text-mn-text-secondary">page in trash</span>
      </div>
    )
  }

  // No `PageLinkProvider`, but the page is still live in the pages-list
  // cache: draw the normal row, minus anything that needs capabilities this
  // host doesn't have — there is nothing to navigate with.
  if (!ref) {
    return (
      <div className={cn(ROW, selectedRing)}>
        <PageIcon />
        <span className="flex-1 font-medium text-mn-text">{cachedRow!.title}</span>
        <span className="text-[12.5px] text-mn-text-secondary">
          {blocks} {blocks === 1 ? 'block' : 'blocks'}
        </span>
        <span aria-hidden className="text-mn-text-meta">
          ›
        </span>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${ref.title}`}
      className={cn(
        ROW,
        'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-mn-text',
        selectedRing
      )}
      onClick={() => pageLinks!.navigateToPage(ref)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        pageLinks!.navigateToPage(ref)
      }}
      onPointerEnter={pagePrefetch.onPointerEnter}
      onPointerLeave={pagePrefetch.onPointerLeave}
    >
      <PageIcon />
      <span className="flex-1 font-medium text-mn-text">{ref.title}</span>
      {ref.isNew && (
        <span className="font-mono text-[10.5px] lowercase text-mn-text-meta">
          new
        </span>
      )}
      <span className="text-[12.5px] text-mn-text-secondary">
        {blocks} {blocks === 1 ? 'block' : 'blocks'}
      </span>
      <span aria-hidden className="text-mn-text-meta">
        ›
      </span>
    </div>
  )
}
