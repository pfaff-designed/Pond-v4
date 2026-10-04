'use client'

/**
 * The shell's command owner (#96; was `TopBar`). Renders NO chrome of its own.
 *
 * The Make Noise shell has no top-right cluster: the ⌘K affordance sits in the
 * breadcrumb pill (`Pond 02` 2t) and "＋ new page" in the rail foot
 * (`PondRail`). Both surfaces raise a decoupled request (`lib/shell-commands`)
 * and this organism answers it, owning the two surfaces once:
 *
 *   ⌘K   the palette (#279): pages, records and actions in one list. What it
 *        lists is `lib/pages/palette-items` over the shared `['pages']` cache;
 *        the rows it mints from the query (`ask pond about “q”`, `new page “q”`)
 *        land here as the composer prefilled, or the New page dialog named.
 *        ⌘K is Ctrl+K off a Mac (AUDIT K3's Ctrl substitution, for this key).
 *   ＋    the New page creation flow (ticket-26): a name-first dialog that
 *        defaults the destination to the page in view, then lands in the editor.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CreatePageModal } from '@/components/organisms/CreatePageModal'
import { CommandPalette, type PaletteItem } from '@/components/molecules/CommandPalette'
import { requestTerminalFocus } from '@/lib/terminal-focus'
import { CREATE_PAGE_EVENT, OPEN_PALETTE_EVENT } from '@/lib/shell-commands'
import { workspaceUrl } from '@/lib/pages/nav'
import { newPageParent, paletteItems, paletteScope } from '@/lib/pages/palette-items'
import { fetchPages } from '@/lib/pages/tree'
import { pagesKey } from '@/lib/pages/keys'
import { usePondName } from '@/lib/pond/name'
import { usePondId } from '@/lib/pond/context'
import { SaveAsTemplateSheet } from '@/components/organisms/SaveAsTemplateSheet'
import { getPage } from '@/lib/pages/client'
import { createTemplate } from '@/lib/templates/client'
import { templateBlocksFrom } from '@/lib/templates/from-page'
import { createClient } from '@/lib/supabase/client'

const RECENT_PAGES_KEY = 'pond:recent-pages'
/** `Pond 02` 2g: "before anything is typed: the last three pages". */
const RECENT_MAX = 3

interface RecentEntry {
  id: string
  type: string
  title: string
}

function readRecents(): RecentEntry[] {
  try {
    // Capped on read as well as on write: a list written under an older, larger cap
    // would otherwise list whole until the next page is opened from the palette.
    const stored: RecentEntry[] = JSON.parse(window.localStorage.getItem(RECENT_PAGES_KEY) ?? '[]')
    return stored.slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

function writeRecent(entry: RecentEntry) {
  try {
    const prev = readRecents().filter((r) => r.id !== entry.id)
    window.localStorage.setItem(
      RECENT_PAGES_KEY,
      JSON.stringify([entry, ...prev].slice(0, RECENT_MAX))
    )
  } catch {
    /* ignore */
  }
}

export function ShellCommands() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const currentNodeId = searchParams.get('nodeId')
  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const pondId = usePondId()
  const pondName = usePondName()

  const { data: pages = [] } = useQuery({
    queryKey: pagesKey(pondId),
    queryFn: () => fetchPages(pondId),
  })

  const closePalette = useCallback(() => setPaletteOpen(false), [])

  // Global ⌘K / Ctrl+K → toggle the palette. Registered in the *capture* phase on
  // the document so it fires before any focused editor/input can swallow it.
  // The decoupled requests (breadcrumb ⌘K chip, rail ＋) arrive as window events.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setPaletteOpen((prev) => !prev)
      }
    }
    const openPalette = () => setPaletteOpen(true)
    const openCreate = () => {
      setCreateTitle('')
      setCreateOpen(true)
    }
    document.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener(OPEN_PALETTE_EVENT, openPalette)
    window.addEventListener(CREATE_PAGE_EVENT, openCreate)
    return () => {
      document.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener(OPEN_PALETTE_EVENT, openPalette)
      window.removeEventListener(CREATE_PAGE_EVENT, openCreate)
    }
  }, [])

  // Recents are read as the palette opens, so a page opened from it lists next time.
  const items = useMemo(
    () =>
      paletteOpen
        ? paletteItems(
            pages,
            readRecents().map((r) => r.id),
            currentNodeId
          )
        : [],
    [pages, paletteOpen, currentNodeId]
  )
  const scope = useMemo(() => paletteScope(pages, currentNodeId), [pages, currentNodeId])
  // `6i` frame 3: saving is a page action, so the sheet opens on the page in view.
  const [saveTemplateFor, setSaveTemplateFor] = useState<{ id: string; title: string } | null>(null)
  // One owner for where a new page files: the palette's row names `parent.title`
  // and the dialog opens on `parent.id` — never derived twice.
  const parent = useMemo(
    () => newPageParent(pages, currentNodeId, pondName),
    [pages, currentNodeId, pondName]
  )

  const handlePaletteSelect = useCallback(
    (item: PaletteItem) => {
      closePalette()
      if (item.action === 'new-page') {
        setCreateTitle(item.query ?? '')
        setCreateOpen(true)
        return
      }
      if (item.action === 'ask-pond') {
        requestTerminalFocus(item.query)
        return
      }
      if (item.action === 'save-as-template') {
        // The row lists only with a page open, so `currentNodeId` is set here.
        const open = pages.find((p) => p.id === currentNodeId)
        if (currentNodeId) {
          setSaveTemplateFor({ id: currentNodeId, title: open?.title || 'Untitled' })
        }
        return
      }
      const page = pages.find((p) => p.id === item.id)
      if (page) {
        writeRecent({ id: page.id, type: page.type, title: page.title })
        router.push(workspaceUrl({ id: page.id, type: page.type, title: page.title }))
      }
    },
    [closePalette, pages, router, currentNodeId]
  )

  /**
   * Save the page in view as a template (KAN-10 / #157, board `6i`).
   *
   * The page's BLOCKS are fetched here rather than held in state: the palette
   * reads `fetchPages`, a lean projection with no `blocks` at all, and the open
   * page's own cache belongs to `DocumentPanel`. One read at save time is both
   * simpler and certain to be current.
   *
   * `templateBlocksFrom` is what decides what the template carries — by default
   * the stack, the labels and the placeholders, never the content (`6i` frame 4).
   */
  const saveAsTemplate = useCallback(
    async ({ name, keepContent }: { name: string; keepContent: boolean }) => {
      const target = saveTemplateFor
      if (!target) return
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const page = await getPage(supabase, target.id)
      if (!page) throw new Error('That page no longer exists')
      await createTemplate(supabase, user.id, {
        name,
        // Saved shapes are the generic `page` kind; the twelve specific kinds
        // belong to the premades (#155), which are code constants, not rows.
        kind: 'page',
        blocks: templateBlocksFrom(page.blocks, () => crypto.randomUUID(), { keepContent }),
        // `listTemplates` filters on the pond, so an unstamped template would be
        // invisible in every pond including this one.
        pondId,
      })
    },
    [saveTemplateFor, pondId]
  )

  return (
    <>
      <CreatePageModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultParentId={parent.id}
        defaultTitle={createTitle}
      />
      {saveTemplateFor && (
        <SaveAsTemplateSheet
          pageTitle={saveTemplateFor.title}
          onSave={saveAsTemplate}
          onClose={() => setSaveTemplateFor(null)}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          items={items}
          scope={scope}
          pondName={pondName}
          parentTitle={parent.title}
          onSelect={handlePaletteSelect}
          onClose={closePalette}
        />
      )}
    </>
  )
}
