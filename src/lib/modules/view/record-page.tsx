'use client'

/**
 * The calendar event is the record's own page, opened in the window.
 * The fields above this are the page's properties. This is the page body:
 * the same block editor a page has, so a person can write and add blocks
 * here, and the expand control opens that same page.
 */

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import type { Block } from '@/lib/documents/types'
import { getPage, type PondPage } from '@/lib/pages/client'
import { flushPendingPageSave } from '@/lib/pages/page-flush'
import { usePageDraft } from '@/lib/pages/use-page-draft'
import { usePondId } from '@/lib/pond/context'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { rowsKey } from './rows-key'

export function RecordPage({
  pageId,
  collectionId,
  title,
}: {
  pageId: string
  collectionId: string
  /** The record's title, as the calendar already shows it. Block saves keep it. */
  title: string
}) {
  const getSupabase = useLazySupabase()
  const queryClient = useQueryClient()
  const pondId = usePondId()
  const { data: page } = useQuery({
    queryKey: ['page', pageId],
    queryFn: () => getPage(getSupabase(), pageId),
    placeholderData: () =>
      queryClient.getQueryData<PondPage[]>(rowsKey(collectionId))?.find((row) => row.id === pageId),
  })
  const { viewTitle, viewBlocks, onTitle, commitLocalEdit, undoRemove, writeStructural } =
    usePageDraft({
      page: page ?? null,
      pageId,
      pondId,
      getSupabase,
    })
  const [blankId] = useState(() => crypto.randomUUID())

  useEffect(() => {
    return () => {
      void flushPendingPageSave(pageId)
    }
  }, [pageId])

  useEffect(() => {
    if (viewTitle === title) return
    onTitle(title)
  }, [onTitle, title, viewTitle])

  if (!page) return null

  const blocks: Block[] =
    viewBlocks.length > 0 ? viewBlocks : [{ id: blankId, type: 'text', content: '' }]
  const blank =
    blocks.length === 1 && blocks[0].type === 'text' && blocks[0].content === '' && title === ''

  return (
    <div data-part="record-page" className="mt-2 border-t border-mn-text/10 pt-3">
      <BlockCanvas
        blocks={blocks}
        pageId={pageId}
        pageTitle={title || 'untitled'}
        onChange={commitLocalEdit}
        onStructuralWrite={writeStructural}
        onUndoRemove={undoRemove}
        untouched={blank}
      />
    </div>
  )
}
