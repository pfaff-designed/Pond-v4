'use client'

/**
 * The "New page" creation flow (ticket-26) — the calm replacement for the old
 * ＋ dead end, which instant-created an "Untitled" node typed `area` at the root
 * and dumped the user on an empty overview with no editor and no name prompt.
 *
 * Name-first: a single small dialog gathers the two things the AI create_page
 * card also gathers — a title and a destination — then hands off to the editor.
 * Chosen over name-inline because the destination picker (which reuses the AI
 * save-path's 3-tier `toParentOptions` labels) has a natural home in a create
 * form, and doing it here avoids a separate reparent write path. The created
 * page is typed `page` (never `area`) with no blocks, so per the ticket-22
 * type-switch it lands straight in the editor with "+ Add text" available — a
 * real place to type, not the dead overview.
 *
 * Built on base-ui's Dialog (focus trap, Esc, initial focus) and styled to match
 * ConfirmDialog — a paper popup over an ink backdrop. Split like Rail:
 * <CreatePageModalView> is presentational (all state raised as props) for
 * Storybook; <CreatePageModal> wires Supabase + React Query + navigation.
 */

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@base-ui/react/dialog'
import { dialogBackdropClass, dialogPopupClass } from '@/components/atoms/dialog-chrome'
import { createClient } from '@/lib/supabase/client'
import { createPage } from '@/lib/pages/client'
import { fetchPages, insertPageOptimistic } from '@/lib/pages/tree'
import { pagesKey } from '@/lib/pages/keys'
import { useWorkspace } from '@/lib/workspace/context'
import { usePondId } from '@/lib/pond/context'
import { usePondName } from '@/lib/pond/name'
import { toParentOptions, type ParentPageRow } from '@/lib/pages/parent-options'
import { workspaceHref } from '@/lib/pages/nav'
import type { NodeType } from '@/lib/supabase/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { pageEyebrowClass } from '@/components/atoms/kicker'

/** Sentinel select value for the top-level (no parent) destination. */
export const TOP_LEVEL_VALUE = '__top_level__'

export interface CreatePageParentOption {
  /** Page id. */
  id: string
  /** Disambiguated display label from toParentOptions. */
  title: string
}

// ── Presentational view ──────────────────────────────────────────────────────

export interface CreatePageModalViewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  onTitleChange: (title: string) => void
  /** Selected destination — a page id, or TOP_LEVEL_VALUE for top-level. */
  parentValue: string
  onParentChange: (value: string) => void
  parentOptions: CreatePageParentOption[]
  /** The pond's name — the top-level place (AUDIT W9: never an assumed "Life"). */
  pondName: string
  busy: boolean
  error?: string | null
  onCreate: () => void
}

export function CreatePageModalView({
  open,
  onOpenChange,
  title,
  onTitleChange,
  parentValue,
  onParentChange,
  parentOptions,
  pondName,
  busy,
  error,
  onCreate,
}: CreatePageModalViewProps) {
  // Name-first: the caret lands in the title field the moment the dialog opens
  // (base-ui's initialFocus, no focus timing of our own).
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdropClass} />
        <Dialog.Popup
          initialFocus={inputRef}
          className={`${dialogPopupClass} w-[min(26rem,calc(100vw-2rem))]`}
        >
          <Dialog.Title className="text-base font-semibold text-foreground">New page</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-mn-text-secondary">
            Give it a name and choose where it lives.
          </Dialog.Description>

          <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!busy) onCreate()
            }}
          >
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Untitled"
              aria-label="Page title"
              className="w-full text-lg font-semibold text-foreground outline-none bg-transparent border-b border-mn-line pb-1.5 placeholder:text-mn-text-secondary focus:border-mn-text transition-colors"
            />

            <label className="flex flex-col gap-1.5">
              <span className={pageEyebrowClass}>Save to</span>
              <select
                value={parentValue}
                onChange={(e) => onParentChange(e.target.value)}
                aria-label="Destination"
                className="w-full rounded-lg border border-mn-line bg-mn-surface px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-mn-text transition-colors"
              >
                <option value={TOP_LEVEL_VALUE}>{pondName} · top level</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="mt-1 flex justify-end gap-2">
              <Dialog.Close className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                Cancel
              </Dialog.Close>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? 'Creating…' : 'Create page'}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ── Container ────────────────────────────────────────────────────────────────

export function CreatePageModal({
  open,
  onOpenChange,
  /** The page currently in view — the new page nests under it by default; null = Life root → top level. */
  defaultParentId,
  /** A name already typed — the palette's `new page “q”` row (#279). */
  defaultTitle = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultParentId: string | null
  defaultTitle?: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const workspace = useWorkspace()
  const pondId = usePondId()
  const pondName = usePondName()
  const [title, setTitle] = useState('')
  const [parentValue, setParentValue] = useState<string>(TOP_LEVEL_VALUE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: rows = [] } = useQuery({
    queryKey: pagesKey(workspace, pondId),
    queryFn: () => fetchPages(workspace, pondId),
  })

  const parentOptions: CreatePageParentOption[] = useMemo(() => {
    const pages: ParentPageRow[] = rows.map((r) => ({
      id: r.id,
      parentId: r.parent_id,
      type: r.type as NodeType,
      title: r.title,
    }))
    return toParentOptions(pages)
  }, [rows])

  // On each open *transition*, reset the form and default the destination to the
  // current context (the viewed page), falling back to top-level at the Life
  // root. React's "adjust state while rendering" pattern (a prev-value in state,
  // compared during render) — so the fresh state paints on the first open frame
  // (no flash of the last session's title) with no cascading-render effect.
  const [prevOpen, setPrevOpen] = useState(false)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setTitle(defaultTitle)
      setError(null)
      setBusy(false)
      setParentValue(defaultParentId ?? TOP_LEVEL_VALUE)
    }
  }

  async function handleCreate() {
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      const parentId = parentValue === TOP_LEVEL_VALUE ? null : parentValue
      const created = await createPage(supabase, user.id, {
        parentId,
        type: 'page',
        // Never write an empty title — 'Untitled' in the DB, matching what the
        // rail/editor display anyway (the fallback shouldn't mask an empty row).
        title: title.trim() || 'Untitled',
        workspace,
      })
      // F26: seed the cache with the new row (correct parent_id) before navigating,
      // so the rail nests it immediately; reconcile in the background.
      insertPageOptimistic(queryClient, workspace, {
        id: created.id,
        parentId,
        type: created.type,
        title: created.title,
      })
      onOpenChange(false)

      // Land in the editor. A blocks-less `page` → DocumentPanel renders the
      // editor (ticket-22), with the title pre-filled.
      router.push(workspaceHref(created))
      void queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create page')
      setBusy(false)
    }
  }

  return (
    <CreatePageModalView
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      onTitleChange={setTitle}
      parentValue={parentValue}
      onParentChange={setParentValue}
      parentOptions={parentOptions}
      pondName={pondName}
      busy={busy}
      error={error}
      onCreate={handleCreate}
    />
  )
}
