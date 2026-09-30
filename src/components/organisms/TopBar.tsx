'use client'

/**
 * The top-right glass cluster — v85 Clearing chrome, icon-only.
 *
 *   ＋   opens the New page creation flow (ticket-26): a name-first dialog that
 *        defaults the destination to the page in view, then lands in the editor.
 *   ⌘K  opens the command palette (ticket-40): search pages, quick actions, recents.
 *        '/' stays local in the composer (F22 division). The old "focus terminal"
 *        behaviour is preserved as the "Ask Pond" quick action inside the palette.
 *
 * The notifications icon (◔) is deliberately omitted — no notifications system
 * exists yet, and a dead icon is worse than none.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CreatePageModal } from '@/components/organisms/CreatePageModal'
import { CommandPalette, type PaletteItem } from '@/components/molecules/CommandPalette'
import { requestTerminalFocus } from '@/lib/terminal-focus'
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

export function writeRecent(entry: RecentEntry) {
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

const iconBtn =
  'mn-glass rounded-mn-pill px-3.5 py-[9px] leading-none text-foreground cursor-pointer hover:text-mn-text transition-colors disabled:opacity-40'

export function TopBarView({
  onCreate,
  onCommandK,
}: {
  onCreate: () => void
  onCommandK: () => void
}) {
  return (
    <div className="fixed top-[22px] right-[26px] z-40 flex gap-2.5 font-sans">
      <button
        className={`${iconBtn} text-[15px]`}
        title="New page"
        aria-label="New page"
        onClick={onCreate}
      >
        ＋
      </button>
      <button
        className={iconBtn}
        title="Command palette (⌘K)"
        aria-label="Command palette (⌘K)"
        onClick={onCommandK}
      >
        <span className="font-mono lowercase tracking-wider text-mn-11 px-[7px] py-0.5 rounded-mn-hair bg-mn-text/[0.03] text-mn-text-meta">
          ⌘k
        </span>
      </button>
    </div>
  )
}

export function TopBar() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const currentNodeId = searchParams.get('nodeId')
  const [createOpen, setCreateOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const workspace = useWorkspace()

  // Pages for palette search.
  const { data: pages = [] } = useQuery({ queryKey: ['pages', workspace], queryFn: () => fetchPages(workspace) })

  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const closePalette = useCallback(() => setPaletteOpen(false), [])

  // Global ⌘K/Ctrl-K → open the palette. Registered in the *capture*
  // phase on the document so it fires before any focused editor/input can
  // swallow the event.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setPaletteOpen((prev) => !prev) // toggle
      }
    }
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true })
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
      <TopBarView onCreate={() => setCreateOpen(true)} onCommandK={openPalette} />
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
