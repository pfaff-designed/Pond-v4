'use client'

/**
 * The connected "changes to this page" panel (issue #103) — the one fetch/write
 * boundary for a page's change-log records, and the surface #103's third bullet
 * asks for ("reachable from the change-log surface").
 *
 * Mirrors `BacklinksPanel`: this organism touches data, the `PageChangesSection`
 * molecule stays presentational.
 *
 * WHAT EACH CONTROL DOES, AND WHY IT RE-READS FIRST.
 *
 *   - **Revert** raises a NEW `proposed` record linked back to the accepted one.
 *     The page is re-read immediately before planning, because the plan is a diff
 *     against the page as it stands — and if the blocks the original touched have
 *     moved on, the revert is born `outdated` instead ("Pond offers a revision").
 *   - **Accept** re-reads the page and commits the record's own `after` verbatim,
 *     advancing both records in one transaction (migration 0013). It does NOT
 *     re-plan: a revert writes exactly what it says it writes. If the page moved
 *     since the revert was raised, nothing is written and the revert goes
 *     `outdated` — raising it again re-plans against the page as it then stands.
 *   - **Reject** is a plain status advance. The original stays `accepted` — a
 *     rejected revert takes nothing back.
 *
 * Every write invalidates BOTH the log query and the page caches, because
 * accepting a revert writes `pages.blocks` underneath an editor that is holding
 * its own copy.
 *
 * CRITICAL: the Supabase client is built lazily INSIDE each callback (never at
 * render), so an envless mount (Storybook, CI) never constructs a real client and
 * throws — the convention `use-backlinks` and `DocumentPanel` already follow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { usePondId } from '@/lib/pond/context'
import { getPage } from '@/lib/pages/client'
import { pagesKey } from '@/lib/pages/keys'
import { listRecords, advanceStatus } from '@/lib/change-log/store'
import { acceptRevert, proposeRevert } from '@/lib/change-log/revert'
import { buildPageChanges } from '@/lib/change-log/page-changes'
import { changeLogKey } from '@/lib/change-log/keys'
import { personFacingMessage } from '@/lib/change-log/errors'
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
  const pondId = usePondId()
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: pageChangesKey(pondId, pageId),
    enabled: pageId !== undefined,
    // The panel unmounts on close (`usePageChangesPanel`), not merely hides, so
    // the app-wide 30s `staleTime` (`providers.tsx`) otherwise skips the refetch
    // a reopen needs — a second tab's accept/revert would sit unseen until a
    // full page reload.
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

  const records = useMemo(() => data ?? [], [data])
  const rows = useMemo(() => buildPageChanges(records), [records])

  /** Everything a write needs, or null when there is no session / no page. */
  const loadWriteContext = useCallback(async () => {
    if (pageId === undefined) return null
    const supabase = getSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null
    // Re-read rather than trusting the editor's copy: a revert is planned against
    // the page as it actually stands, and the open panel may be holding blocks
    // that a debounced save has already moved past.
    const page = await getPage(supabase, pageId)
    if (!page) return null
    return { supabase, userId: user.id, page }
  }, [getSupabase, pageId])

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: pageChangesKey(pondId, pageId) })
  }, [queryClient, pondId, pageId])

  /** Also pull the editor and the rail back in step — accept wrote pages.blocks. */
  const refreshPage = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['page', pageId] }),
      queryClient.invalidateQueries({ queryKey: pagesKey() }),
    ])
  }, [queryClient, pageId])

  /** One place for the busy flag, the error line and the refresh. */
  const run = useCallback(
    async (recordId: string, work: () => Promise<void>) => {
      setBusyId(recordId)
      setError(null)
      try {
        await work()
      } catch (err) {
        // Surfaced, not swallowed: unlike the log writes that ride along with an
        // accepted proposal, every write here IS what the person just asked for.
        // The raw error (which may carry developer text, e.g. `change log: …`)
        // goes to the console only — `personFacingMessage` is the one mapping
        // to what the person sees.
        console.error('[change-log] page changes panel', err)
        setError(personFacingMessage(err))
      } finally {
        setBusyId(null)
        await refresh()
      }
    },
    [refresh]
  )

  const onRevert = useCallback(
    (recordId: string) =>
      void run(recordId, async () => {
        const ctx = await loadWriteContext()
        if (!ctx) return
        const record = records.find((r) => r.id === recordId)
        if (!record) return
        await proposeRevert(ctx.supabase, {
          userId: ctx.userId,
          // #312: without this the revert record is invisible in every pond and
          // the page becomes permanently unrevertable.
          pondId,
          record,
          current: ctx.page.blocks,
        })
      }),
    [run, loadWriteContext, records, pondId]
  )

  const onAccept = useCallback(
    (recordId: string) =>
      void run(recordId, async () => {
        const ctx = await loadWriteContext()
        if (!ctx) return
        const revert = records.find((r) => r.id === recordId)
        if (!revert) return
        // The record it reverts is resolved inside the transaction, from
        // `links.revertOf` — the panel does not need to find it, and could not
        // vouch for it if it did.
        const result = await acceptRevert(ctx.supabase, {
          userId: ctx.userId,
          pondId,
          revert,
          current: ctx.page.blocks,
        })
        if (result.kind === 'outdated') {
          setError('this page changed since — revert the change again')
          return
        }
        await refreshPage()
      }),
    [run, loadWriteContext, records, pondId, refreshPage]
  )

  const onReject = useCallback(
    (recordId: string) =>
      void run(recordId, async () => {
        const ctx = await loadWriteContext()
        if (!ctx) return
        // A rejected revert leaves the original `accepted` — nothing was taken back.
        await advanceStatus(ctx.supabase, recordId, 'rejected')
      }),
    [run, loadWriteContext]
  )

  return (
    <PageChangesSection
      rows={rows}
      loading={isLoading}
      onRevert={onRevert}
      onAccept={onAccept}
      onReject={onReject}
      busyId={busyId}
      error={error}
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
      // never match.
      if (e.altKey && e.metaKey && e.code === 'KeyH') {
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

  // Paper, not frames (AGENTS.md): it floats over the canvas on shadow alone.
  const overlay =
    open && pageId !== null ? (
      <aside
        className="fixed right-6 top-6 bottom-6 z-40 w-[320px] overflow-y-auto rounded-mn-card bg-mn-surface p-4 shadow-mn-lg"
        aria-label="Changes to this page"
      >
        <PageChangesPanel pageId={pageId} />
      </aside>
    ) : null

  return { open, toggle, overlay }
}
