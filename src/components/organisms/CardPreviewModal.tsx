'use client'

/**
 * Kanban card → page preview modal (#64).
 *
 * A board card is a collection row, and a row IS a page (F27's "view over
 * pages" world) — so clicking a card opens this Press modal previewing that
 * page's blocks read-only, with an "Open page ↗" expand that navigates to the
 * full page (through the F27 PageLink capability seam, the same navigation the
 * linked kanban cards use) and closes the modal.
 *
 * Built on base-ui's Dialog (focus trap, `aria-modal`, Esc + backdrop dismiss,
 * focus restoration) with the shared Press dialog chrome — the same base
 * ConfirmDialog and CreatePageModal ride. Split like CreatePageModal:
 * <CardPreviewModalView> is presentational (all state raised as props) for
 * Storybook; <CardPreviewModal> wires the page fetch + navigation.
 *
 * Graceful degrades (AC 4): a row whose page is gone (deleted between render
 * and click) previews as a calm notice with no dead "Open page" button; a host
 * without the PageLink seam (Storybook, the AI-terminal reference render)
 * previews without the navigation affordance.
 */

import { useQuery } from '@tanstack/react-query'
import { Dialog } from '@base-ui/react/dialog'
import { dialogBackdropClass, dialogPopupClass } from '@/components/atoms/dialog-chrome'
import { kickerClass } from '@/components/atoms/kicker'
import { Button, buttonVariants } from '@/components/ui/button'
import { ModuleView } from '@/lib/modules/renderers'
import { usePageLinks } from '@/lib/modules/page-link/context'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { getPage } from '@/lib/pages/client'
import type { Block } from '@/lib/documents/types'

// ── Presentational view ──────────────────────────────────────────────────────

export interface CardPreviewModalViewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The previewed page's title (falls back to the card's cached title). */
  title: string
  /** The page's blocks — null while loading or when the page is missing. */
  blocks: Block[] | null
  isLoading?: boolean
  /** True when the row's page could not be resolved — the calm degrade (AC 4). */
  missing?: boolean
  /** Present when the host can navigate — absent hides the expand affordance. */
  onOpenPage?: () => void
}

export function CardPreviewModalView({
  open,
  onOpenChange,
  title,
  blocks,
  isLoading,
  missing,
  onOpenPage,
}: CardPreviewModalViewProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdropClass} data-testid="card-preview-backdrop" />
        {/* base-ui traps focus + inerts the background; the explicit aria-modal
            keeps the popup announced as modal even where inert isn't understood. */}
        <Dialog.Popup
          aria-modal="true"
          className={`${dialogPopupClass} w-[min(34rem,calc(100vw-2rem))]`}
        >
          <span className={kickerClass}>Card preview</span>
          <Dialog.Title className="mt-1 text-base font-semibold text-foreground">
            {title || 'Untitled'}
          </Dialog.Title>

          <div className="mt-4">
            {isLoading ? (
              <p className="text-sm text-mn-text-secondary">Loading preview…</p>
            ) : missing ? (
              <p className="text-sm text-mn-text-secondary">This card doesn’t have a page to preview.</p>
            ) : blocks && blocks.length === 0 ? (
              <p className="text-sm text-mn-text-secondary">This page has no content yet.</p>
            ) : blocks ? (
              // Read-preview of the page's blocks through the registry — the same
              // read-only dispatch the diff cards and the page module use. No
              // `editable`/`onChange`, so every module renders its quiet view.
              <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
                {blocks.map((block) => (
                  <ModuleView key={block.id} type={block.type} data={block} />
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Close
            </Dialog.Close>
            {onOpenPage && (
              <Button type="button" size="sm" onClick={onOpenPage}>
                Open page ↗
              </Button>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ── Container ────────────────────────────────────────────────────────────────

export function CardPreviewModal({
  rowId,
  fallbackTitle,
  open,
  onOpenChange,
}: {
  /** The clicked card's row id — a row IS a page, so this is the page to preview. */
  rowId: string | null
  /** The card's cached title, shown while the page loads (or when it's gone). */
  fallbackTitle?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const getSupabase = useLazySupabase()
  const links = usePageLinks()

  // The same ['page', rowId] key the collection's optimistic writes patch, so a
  // just-renamed card previews its fresh title. Fetches only while open.
  const { data: page, isPending } = useQuery({
    queryKey: ['page', rowId],
    queryFn: () => (rowId ? getPage(getSupabase(), rowId) : Promise.resolve(null)),
    enabled: open && !!rowId,
  })

  // Navigate through the F27 seam (same-panel push, like a linked kanban card),
  // then close — the modal is a hallway, not a destination.
  const onOpenPage =
    page && links
      ? () => {
          links.navigateToPage({ id: page.id, title: page.title || 'Untitled', type: page.type })
          onOpenChange(false)
        }
      : undefined

  return (
    <CardPreviewModalView
      open={open}
      onOpenChange={onOpenChange}
      title={page?.title ?? fallbackTitle ?? ''}
      blocks={page ? page.blocks : null}
      isLoading={isPending}
      missing={!isPending && !page}
      onOpenPage={onOpenPage}
    />
  )
}
