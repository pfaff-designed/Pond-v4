'use client'

/**
 * The connected made-from row for a page (#97, `Pond 06.01` 6a frame 5) — the
 * one fetch/write boundary for the made-from stamp, mirroring how BacklinksPanel
 * and PageChangesPanel wrap their presentational sections.
 *
 * A page made from a streamed answer carries `props.madeFromThread`; this
 * organism reads it off the page the DocumentPanel already holds, renders the
 * MadeFromChip, opens the thread at the message on click, and owns the ONLY
 * post-birth write: the hide/show flag — reflected in the ['page'] cache at once
 * and persisted by a read-merge-write that leaves every other prop (the schema
 * included) alone. It can be hidden, not removed: nothing here deletes the stamp.
 *
 * The Supabase client is built lazily inside the handler (never at render), so
 * an envless mount (Storybook, CI) never constructs a real client.
 */

import { useQueryClient } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { MadeFromChip } from '@/components/molecules/MadeFromChip'
import { readMadeFrom, setMadeFromHidden, withMadeFromHidden } from '@/lib/pages/made-from'
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
    queryClient.setQueryData(
      ['page', pageId],
      (prev: { props?: Record<string, unknown> } | null | undefined) =>
        prev ? { ...prev, props: withMadeFromHidden(prev.props ?? {}, hidden) } : prev
    )
    void setMadeFromHidden(getSupabase(), pageId, hidden).catch(console.error)
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
