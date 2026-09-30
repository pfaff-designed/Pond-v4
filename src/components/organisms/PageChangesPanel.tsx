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
 *   - **Accept** re-reads the page again and re-plans, so unrelated edits made
 *     between raising the revert and answering it are not dropped, then commits
 *     the page and advances both records in one transaction (migration 0013).
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
import { useWorkspace } from '@/lib/workspace/context'
import { getPage } from '@/lib/pages/client'
import { listRecords, advanceStatus } from '@/lib/change-log/store'
import { acceptRevert, proposeRevert } from '@/lib/change-log/revert'
import { buildPageChanges } from '@/lib/change-log/page-changes'
import { PageChangesSection } from '@/components/molecules/PageChangesSection'
import type { ChangeLogRecord } from '@/lib/change-log/types'

export interface PageChangesPanelProps {
  /** The open page. Undefined disables the query entirely. */
  pageId: string | undefined
  className?: string
}

/** The query key for one page's log. Exported so a write path can invalidate it. */
export function pageChangesKey(workspace: string, pageId: string | undefined) {
  return ['change-log', workspace, 'page', pageId] as const
}

export function PageChangesPanel({ pageId, className }: PageChangesPanelProps) {
  const getSupabase = useLazySupabase()
  const workspace = useWorkspace()
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: pageChangesKey(workspace, pageId),
    enabled: pageId !== undefined,
    queryFn: async (): Promise<ChangeLogRecord[]> => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return []
      return listRecords(supabase, { userId: user.id, workspace, targetPageId: pageId })
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
    await queryClient.invalidateQueries({ queryKey: pageChangesKey(workspace, pageId) })
  }, [queryClient, workspace, pageId])

  /** Also pull the editor and the rail back in step — accept wrote pages.blocks. */
  const refreshPage = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['page', pageId] }),
      queryClient.invalidateQueries({ queryKey: ['pages', workspace] }),
    ])
  }, [queryClient, workspace, pageId])

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
        console.error('[change-log] page changes panel', err)
        setError(err instanceof Error ? err.message : 'that did not work')
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
          workspace,
          record,
          current: ctx.page.blocks,
        })
      }),
    [run, loadWriteContext, records, workspace]
  )

  const onAccept = useCallback(
    (recordId: string) =>
      void run(recordId, async () => {
        const ctx = await loadWriteContext()
        if (!ctx) return
        const revert = records.find((r) => r.id === recordId)
        if (!revert) return
        const originalId = revert.links.revertOf
        // The record a revert sets back need not be on this page's list — it is,
        // in practice, since both carry the same target — so this is read through
        // the list first and falls back to saying so rather than guessing.
        const original = originalId ? records.find((r) => r.id === originalId) : undefined
        if (!original) {
          setError('the change this reverts is not on this page')
          return
        }
        const result = await acceptRevert(ctx.supabase, {
          userId: ctx.userId,
          workspace,
          revert,
          original,
          current: ctx.page.blocks,
        })
        if (result.kind === 'outdated') {
          setError('those blocks have changed since — ask Pond to revise this revert')
          return
        }
        await refreshPage()
      }),
    [run, loadWriteContext, records, workspace, refreshPage]
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // `e.code`, not `e.key`: on macOS Option+H emits '˙', so a key check would
      // never match.
      if (e.altKey && e.metaKey && e.code === 'KeyH') {
        e.preventDefault()
        setOpenFor((current) => (current === pageId ? null : pageId))
        return
      }
      if (e.key === 'Escape') setOpenFor(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pageId])

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
