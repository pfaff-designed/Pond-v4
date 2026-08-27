'use client'

/**
 * The top-right glass cluster — v85 Clearing chrome, icon-only.
 *
 *   ＋   the existing new-page flow (create an untitled top-level area, open it)
 *   ⌘K  focuses the terminal input (the proto's free-text→Pond), also bound
 *        as a global ⌘K/Ctrl-K hotkey
 *
 * The notifications icon (◔) is deliberately omitted — no notifications system
 * exists yet, and a dead icon is worse than none.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { createTopLevelPage } from '@/lib/pages/create-top'
import { requestTerminalFocus } from '@/lib/terminal-focus'

const iconBtn =
  'press-glass rounded-full px-3.5 py-[9px] leading-none text-foreground cursor-pointer hover:text-press-accent transition-colors disabled:opacity-40'

export function TopBarView({
  onCreate,
  onCommandK,
  busy,
}: {
  onCreate: () => void
  onCommandK: () => void
  busy: boolean
}) {
  return (
    <div className="fixed top-[22px] right-[26px] z-40 flex gap-2.5 font-sans">
      <button
        className={`${iconBtn} text-[15px]`}
        title="New page"
        aria-label="New page"
        disabled={busy}
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
  const router = useRouter()
  const queryClient = useQueryClient()
  const supabase = useMemo(() => createClient(), [])
  const [busy, setBusy] = useState(false)

  async function handleCreate() {
    setBusy(true)
    try {
      const created = await createTopLevelPage(supabase, queryClient)
      if (created) {
        const params = new URLSearchParams({
          nodeType: created.type,
          nodeId: created.id,
          nodeName: created.title,
        })
        router.push(`/workspace?${params.toString()}`)
      }
    } finally {
      setBusy(false)
    }
  }

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

  return <TopBarView onCreate={handleCreate} onCommandK={requestTerminalFocus} busy={busy} />
}
