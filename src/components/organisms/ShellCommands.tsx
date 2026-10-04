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
import { useWorkspace } from '@/lib/workspace/context'
import { usePondId } from '@/lib/pond/context'

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
  const workspace = useWorkspace()
  const pondId = usePondId()
  const pondName = usePondName()

  const { data: pages = [] } = useQuery({
    queryKey: pagesKey(workspace, pondId),
    queryFn: () => fetchPages(workspace, pondId),
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
            readRecents().map((r) => r.id)
          )
        : [],
    [pages, paletteOpen]
  )
  const scope = useMemo(() => paletteScope(pages, currentNodeId), [pages, currentNodeId])
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
      const page = pages.find((p) => p.id === item.id)
      if (page) {
        writeRecent({ id: page.id, type: page.type, title: page.title })
        router.push(workspaceUrl({ id: page.id, type: page.type, title: page.title }))
      }
    },
    [closePalette, pages, router]
  )

  return (
    <>
      <CreatePageModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultParentId={parent.id}
        defaultTitle={createTitle}
      />
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
