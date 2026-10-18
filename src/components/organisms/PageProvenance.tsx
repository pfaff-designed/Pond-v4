'use client'

/**
 * The connected provenance of a page made from a streamed answer (#97,
 * `Pond 06.01` 6a frame 5) — the one fetch/write boundary for what that page
 * carries in its `props`, mirroring how BacklinksPanel and PageChangesPanel wrap
 * their presentational sections. Two surfaces, both read from the same props and
 * both born on make page: the made-from row above the prose ({@link PageProvenance})
 * and the "mentioned" card below it ({@link PageMentioned}).
 *
 * A page made from a streamed answer carries `props.madeFromThread`; this
 * organism reads it off the page the DocumentPanel already holds, renders the
 * MadeFromChip, opens the thread at the message on click, and owns the ONLY
 * post-birth write: the hide/show flag — reflected in the ['page'] cache at once
 * and persisted by a read-merge-write that leaves every other prop (the schema
 * included) alone. A failed write rolls that cache back and invalidates it, so the
 * chip never shows a state the row does not hold. It can be hidden, not removed:
 * nothing here deletes the stamp.
 *
 * The Supabase client is built lazily inside the handler (never at render), so
 * an envless mount (Storybook, CI) never constructs a real client.
 */

import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { MadeFromChip } from '@/components/molecules/MadeFromChip'
import { MentionedCard } from '@/components/molecules/MentionedCard'
import { readMadeFrom, setMadeFromHidden, withMadeFromHidden } from '@/lib/pages/made-from'
import { readMentioned } from '@/lib/pages/mentioned'
import { openWorkspaceUrl, workspaceUrl } from '@/lib/pages/nav'
import { requestThreadMessage } from '@/lib/terminal-focus'

export interface PageProvenanceProps {
  pageId: string
  props: Record<string, unknown>
  className?: string
}

export function PageProvenance({ pageId, props, className }: PageProvenanceProps) {
  const queryClient = useQueryClient()
  const getSupabase = useLazySupabase()
  const stamp = readMadeFrom(props)
  if (!stamp) return null

  function toggleHidden(hidden: boolean) {
    const key = ['page', pageId]
    // Optimistic, with a way back: the cache must never keep asserting a flag the
    // row does not carry. Snapshot first, restore on failure, then invalidate so
    // the next read comes from the row itself rather than from our guess.
    const snapshot = queryClient.getQueryData(key)
    queryClient.setQueryData(key, (prev: { props?: Record<string, unknown> } | null | undefined) =>
      prev ? { ...prev, props: withMadeFromHidden(prev.props ?? {}, hidden) } : prev
    )
    void setMadeFromHidden(getSupabase(), pageId, hidden).catch((err) => {
      console.error(err)
      queryClient.setQueryData(key, snapshot)
      void queryClient.invalidateQueries({ queryKey: key })
    })
  }

  return (
    <MadeFromChip
      stamp={stamp}
      onOpen={() => requestThreadMessage(stamp.messageId)}
      onToggleHidden={toggleHidden}
      className={className}
    />
  )
}

/**
 * The "mentioned" card (6a frame 5) — the one thing Pond adds to a made page,
 * under its prose. Read-only: the list is written once on make page and nothing
 * here edits it, so this is a read of `props` and nothing more. Absent on every
 * page that was not made from an answer.
 */
export function PageMentioned({
  props,
  className,
}: {
  props: Record<string, unknown>
  className?: string
}) {
  const router = useRouter()
  const mentioned = readMentioned(props)
  if (!mentioned) return null
  return (
    <MentionedCard
      mentioned={mentioned}
      onOpenMention={(ref, title) =>
        openWorkspaceUrl(workspaceUrl({ id: ref, type: 'page', title }), router)
      }
      className={className}
    />
  )
}
