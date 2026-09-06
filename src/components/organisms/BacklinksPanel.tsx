'use client'

/**
 * The connected "Linked from" section (#39) — the one fetch boundary for a page's
 * backlinks. It computes the derived groups via `useBacklinks` (which reuses the shared
 * `['pages']` + `['rows']` caches, so the reverse stays live as forward links change),
 * derives `onOpen` from the router, and hands the rest to the presentational
 * `BacklinksSection`. Mirrors `RelationValueField` — the only backlink piece that
 * touches data; the section molecule stays presentational.
 */

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { BacklinksSection } from '@/components/molecules/BacklinksSection'
import { useBacklinks } from '@/lib/modules/view/use-backlinks'
import { useWorkspace } from '@/lib/workspace/context'
import { workspaceHref, workspaceBasePath } from '@/lib/pages/nav'

export interface BacklinksPanelProps {
  /** The open page (backlink target). Undefined disables the hook. */
  targetId: string | undefined
  /** The target's parent collection id (null for a plain page). */
  targetCollectionId: string | null | undefined
  className?: string
}

export function BacklinksPanel({ targetId, targetCollectionId, className }: BacklinksPanelProps) {
  const { groups } = useBacklinks(targetId, targetCollectionId)
  const router = useRouter()
  const workspace = useWorkspace()

  // id→title over every chip, so the click-through href carries the real title for the
  // rail/breadcrumb hint (the workspace panel itself loads purely from ?nodeId).
  const titleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const group of groups) for (const row of group.rows) map.set(row.id, row.title)
    return map
  }, [groups])

  function onOpen(id: string) {
    router.push(
      workspaceHref(
        { id, type: 'page', title: titleById.get(id) ?? id },
        workspaceBasePath(workspace)
      )
    )
  }

  return <BacklinksSection groups={groups} onOpen={onOpen} className={className} />
}
