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
 * ConfirmDialog — Press paper popup, ink backdrop. Split like Rail/TopBar:
 * <CreatePageModalView> is presentational (all state raised as props) for
 * Storybook; <CreatePageModal> wires Supabase + React Query + navigation.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@base-ui/react/dialog'
import { createClient } from '@/lib/supabase/client'
import { createPage } from '@/lib/pages/client'
import { fetchPages } from '@/lib/pages/tree'
import { toParentOptions, type ParentPageRow } from '@/lib/pages/parent-options'
import type { NodeType } from '@/lib/supabase/types'
import { Button, buttonVariants } from '@/components/ui/button'

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
  busy,
  error,
  onCreate,
}: CreatePageModalViewProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus + select the title on open (name-first: the caret is where you type).
  useEffect(() => {
    if (open) {
      // next tick — the popup mounts through the portal
      const t = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
      return () => clearTimeout(t)
    }
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-press-ink/25 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-press-line bg-press-paper p-6 shadow-2xl outline-none transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          <Dialog.Title className="text-base font-semibold text-foreground">New page</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-press-muted">
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
              className="w-full text-lg font-semibold text-foreground outline-none bg-transparent border-b border-press-line pb-1.5 placeholder:text-press-faint focus:border-press-accent transition-colors"
            />

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-press-faint">
                Save to
              </span>
              <select
                value={parentValue}
                onChange={(e) => onParentChange(e.target.value)}
                aria-label="Destination"
                className="w-full rounded-lg border border-press-line bg-press-paper px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-press-accent transition-colors"
              >
                <option value={TOP_LEVEL_VALUE}>Life · top level</option>
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultParentId: string | null
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [parentValue, setParentValue] = useState<string>(TOP_LEVEL_VALUE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: rows = [] } = useQuery({ queryKey: ['pages'], queryFn: fetchPages })

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
      setTitle('')
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
        title: title.trim(),
      })
      await queryClient.invalidateQueries({ queryKey: ['pages'] })
      onOpenChange(false)

      // Land in the editor. Empty `page` → DocumentPanel renders the editor
      // (ticket-22), with the title pre-filled (or the "Untitled" placeholder).
      const params = new URLSearchParams({
        nodeType: created.type,
        nodeId: created.id,
        nodeName: created.title,
      })
      router.push(`/workspace?${params.toString()}`)
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
      busy={busy}
      error={error}
      onCreate={handleCreate}
    />
  )
}
