'use client'

/**
 * The shell's command owner (#96; was `TopBar`). Renders NO chrome of its own.
 *
 * The Make Noise shell has no top-right cluster: the ⌘K affordance sits in the
 * breadcrumb pill (`Pond 02` 2t) and "＋ new page" in the rail foot
 * (`PondRail`). Both surfaces raise a decoupled request (`lib/shell-commands`)
 * and this organism answers it, owning the two dialogs once:
 *
 *   ⌘K   the command palette (ticket-40): search pages, quick actions, recents.
 *        '/' stays local in the composer (F22 division). The old "focus
 *        terminal" behaviour survives as the "Ask Pond" quick action.
 *   ＋    the New page creation flow (ticket-26): a name-first dialog that
 *        defaults the destination to the page in view, then lands in the editor.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CreatePageModal } from '@/components/organisms/CreatePageModal'
import { CommandPalette, type PaletteItem } from '@/components/molecules/CommandPalette'
import { requestTerminalFocus } from '@/lib/terminal-focus'
import { CREATE_PAGE_EVENT, OPEN_PALETTE_EVENT } from '@/lib/shell-commands'
import { workspaceUrl } from '@/lib/pages/nav'
import { fetchPages } from '@/lib/pages/tree'
import { useWorkspace } from '@/lib/workspace/context'

const RECENT_PAGES_KEY = 'pond:recent-pages'
const RECENT_MAX = 5

interface RecentEntry {
  id: string
  type: string
  title: string
}

function readRecents(): RecentEntry[] {
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_PAGES_KEY) ?? '[]')
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
  const [paletteOpen, setPaletteOpen] = useState(false)
  const workspace = useWorkspace()

  // Pages for palette search.
  const { data: pages = [] } = useQuery({
    queryKey: ['pages', workspace],
    queryFn: () => fetchPages(workspace),
  })

  const closePalette = useCallback(() => setPaletteOpen(false), [])

  // Global ⌘K/Ctrl-K → toggle the palette. Registered in the *capture* phase on
  // the document so it fires before any focused editor/input can swallow it.
  // The decoupled requests (breadcrumb ⌘K chip, rail ＋) arrive as window events.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setPaletteOpen((prev) => !prev) // toggle
      }
    }
    const openPalette = () => setPaletteOpen(true)
    const openCreate = () => setCreateOpen(true)
    document.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener(OPEN_PALETTE_EVENT, openPalette)
    window.addEventListener(CREATE_PAGE_EVENT, openCreate)
    return () => {
      document.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener(OPEN_PALETTE_EVENT, openPalette)
      window.removeEventListener(CREATE_PAGE_EVENT, openCreate)
    }
  }, [])

  // Build palette items: quick actions first, then recents, then all pages.
  const paletteItems = useCallback((): PaletteItem[] => {
    const actions: PaletteItem[] = [
      { id: '__new_page', label: 'New page', subtitle: 'Create a new page', group: 'action' },
      {
        id: '__ask_pond',
        label: 'Ask Pond',
        subtitle: 'Focus the composer',
        group: 'action',
      },
    ]

    const recents = readRecents().map((r): PaletteItem => ({
      id: `rec:${r.id}`,
      label: r.title || 'Untitled',
      subtitle: `Recent · ${r.type}`,
      group: 'recent',
    }))

    const pageItems = pages.map((p): PaletteItem => ({
      id: `pg:${p.id}`,
      label: p.title || 'Untitled',
      subtitle: p.type,
      group: 'page',
    }))

    return [...actions, ...recents, ...pageItems]
  }, [pages])

  const handlePaletteSelect = useCallback(
    (item: PaletteItem) => {
      closePalette()
      if (item.id === '__new_page') {
        setCreateOpen(true)
        return
      }
      if (item.id === '__ask_pond') {
        requestTerminalFocus()
        return
      }
      // Recent or page — navigate.
      const rawId = item.id.replace(/^(rec:|pg:)/, '')
      const page = pages.find((p) => p.id === rawId)
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
        defaultParentId={currentNodeId}
      />
      {paletteOpen && (
        <CommandPalette
          items={paletteItems()}
          onSelect={handlePaletteSelect}
          onClose={closePalette}
        />
      )}
    </>
  )
}
