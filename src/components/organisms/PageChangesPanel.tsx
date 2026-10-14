'use client'

/**
 * The connected "changes to this page" panel (board `Pond 06.15 Change log`,
 * frame `s6o8`) — the one fetch boundary for a page's change-log records.
 *
 * Mirrors `BacklinksPanel`: this organism touches data, the `PageChangesSection`
 * molecule stays presentational. The board draws no buttons in the panel — a
 * row only opens its record page, where it is answered (KAN-152); this surface
 * answers nothing itself.
 *
 * CRITICAL: the Supabase client is built lazily INSIDE each `queryFn` (never at
 * render), so an envless mount (Storybook, CI) never constructs a real client and
 * throws — the convention `use-backlinks` and `DocumentPanel` already follow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { usePondId } from '@/lib/pond/context'
import { getPage } from '@/lib/pages/client'
import { listRecords } from '@/lib/change-log/store'
import { buildPageChangeRows } from '@/lib/change-log/page-change-rows'
import { platformShortcutLabel } from '@/lib/change-log/page-changes'
import { isApplePlatform } from '@/lib/platform'
import { changeLogKey } from '@/lib/change-log/keys'
import { changeLogPageFilterUrl, changeLogRecordUrl } from '@/lib/change-log/record-page'
import { PageChangesSection } from '@/components/molecules/PageChangesSection'
import type { ChangeLogRecord } from '@/lib/change-log/types'

export interface PageChangesPanelProps {
  /** The open page. Undefined disables the query entirely. */
  pageId: string | undefined
  className?: string
}

/** The query key for one page's log. Exported so a write path can invalidate it. */
export function pageChangesKey(pondId: string | null, pageId: string | undefined) {
  return [...changeLogKey(), pondId, 'page', pageId] as const
}

export function PageChangesPanel({ pageId, className }: PageChangesPanelProps) {
  const getSupabase = useLazySupabase()
  const router = useRouter()
  const pondId = usePondId()

  const { data, isLoading } = useQuery({
    queryKey: pageChangesKey(pondId, pageId),
    enabled: pageId !== undefined,
    // The panel unmounts on close (`usePageChangesPanel`), not merely hides, so
    // the app-wide 30s `staleTime` (`providers.tsx`) otherwise skips the refetch
    // a reopen needs — another tab's edit would sit unseen until a full reload.
    refetchOnMount: 'always',
    queryFn: async (): Promise<ChangeLogRecord[]> => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return []
      // #312: the change log is per pond (`s6m5`).
      return listRecords(supabase, { userId: user.id, pondId, targetPageId: pageId })
    },
  })

  const { data: page } = useQuery({
    // The same `['page', id]` key `ChangeLogRecordPage` uses for a record's
    // target page — a row's label reads the page's own current blocks.
    queryKey: ['page', pageId],
    enabled: pageId !== undefined,
    queryFn: () => getPage(getSupabase(), pageId as string),
  })

  const records = useMemo(() => data ?? [], [data])
  const rows = useMemo(() => buildPageChangeRows(records, page?.blocks ?? []), [records, page])

  return (
    <PageChangesSection
      rows={rows}
      loading={isLoading}
      onOpenRecord={(recordId) => router.push(changeLogRecordUrl(recordId))}
      onOpenChangeLog={() => {
        if (pageId !== undefined) router.push(changeLogPageFilterUrl(pageId))
      }}
      shortcutLabel={platformShortcutLabel(isApplePlatform())}
      className={className}
    />
  )
}

/**
 * The panel's open state, its ⌥⌘H shortcut, and the floating surface it renders.
 *
 * Lives here rather than in `DocumentPanel` so the editor does not gain a third
 * reason to change — the design's frame 8 makes this one feature (a view of the
 * log, a shortcut, and a way in), and it belongs in one place.
 *
 * The open state is the PAGE the panel is open for, not a boolean, so navigating
 * away closes it by derivation. Holding a boolean and clearing it in an effect on
 * `pageId` is the same behaviour one render later — and one cascading render that
 * `react-hooks/set-state-in-effect` rightly rejects.
 */
export function usePageChangesPanel(pageId: string | null) {
  const [openFor, setOpenFor] = useState<string | null>(null)
  const open = openFor !== null && openFor === pageId

  const toggle = useCallback(() => {
    setOpenFor((current) => (current === pageId ? null : pageId))
  }, [pageId])

  // On the document, so it runs before anything listening on the window (zen); an
  // esc closes only an open panel, and is marked taken when it does.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // `e.code`, not `e.key`: on macOS Option+H emits '˙', so a key check would
      // never match. Only one chord is ever live per platform (same split as
      // `isComposerToggleKey`), so a platform where both could theoretically
      // hold never double-fires.
      const isToggleChord =
        e.altKey &&
        e.code === 'KeyH' &&
        (isApplePlatform() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)
      if (isToggleChord) {
        e.preventDefault()
        setOpenFor((current) => (current === pageId ? null : pageId))
        return
      }
      if (e.key !== 'Escape' || !open || e.defaultPrevented) return
      e.preventDefault()
      setOpenFor(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [pageId, open])

  // The floating chrome, geometry, and the one `aside` landmark all live on
  // `PageChangesSection` itself (board `s6o8`) — no wrapper box or label here.
  const overlay = open && pageId !== null ? <PageChangesPanel pageId={pageId} /> : null

  return { open, toggle, overlay }
}
