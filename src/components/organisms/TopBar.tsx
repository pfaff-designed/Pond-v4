'use client'

/**
 * The top-right glass cluster — v85 Clearing chrome, icon-only.
 *
 *   ＋   opens the New page creation flow (ticket-26): a name-first dialog that
 *        defaults the destination to the page in view, then lands in the editor.
 *        (Was a dead end — it instant-created an untitled top-level `area` and
 *        dumped you on an empty overview with no editor and no name prompt.)
 *   ⌘K  focuses the terminal input (the proto's free-text→Pond), also bound
 *        as a global ⌘K/Ctrl-K hotkey
 *
 * The notifications icon (◔) is deliberately omitted — no notifications system
 * exists yet, and a dead icon is worse than none.
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CreatePageModal } from '@/components/organisms/CreatePageModal'
import { requestTerminalFocus } from '@/lib/terminal-focus'

const iconBtn =
  'press-glass rounded-full px-3.5 py-[9px] leading-none text-foreground cursor-pointer hover:text-press-accent transition-colors disabled:opacity-40'

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
        title="Talk to Pond (⌘K)"
        aria-label="Talk to Pond (⌘K)"
        onClick={onCommandK}
      >
        <span className="font-mono text-[11px] px-[7px] py-0.5 rounded-md border border-border bg-press-ink/[0.03] text-press-body">
          ⌘K
        </span>
      </button>
    </div>
  )
}

export function TopBar() {
  const searchParams = useSearchParams()
  // The page in view — the new page nests under it by default (null = Life root
  // → top level). Read fresh each render so ＋ always reflects the current page.
  const currentNodeId = searchParams.get('nodeId')
  const [createOpen, setCreateOpen] = useState(false)

  // Global ⌘K/Ctrl-K → focus the terminal input. Registered in the *capture*
  // phase on the document so it fires before any focused editor/input can
  // swallow the event (the observed "⌘K didn't fire" in ticket-24), and before
  // a browser default binding on ⌘K can claim it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        requestTerminalFocus()
      }
    }
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  return (
    <>
      <TopBarView onCreate={() => setCreateOpen(true)} onCommandK={requestTerminalFocus} />
      <CreatePageModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultParentId={currentNodeId}
      />
    </>
  )
}
