'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { resetSandbox } from '@/lib/sandbox/reset'

interface SandboxBannerProps {
  /** Called after a successful reset so the parent can refresh the workspace. */
  onReset?: () => void
}

export function SandboxBanner({ onReset }: SandboxBannerProps = {}) {
  const queryClient = useQueryClient()
  const [resetting, setResetting] = useState(false)

  async function handleReset() {
    if (resetting) return
    setResetting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      await resetSandbox(supabase, user.id)
      await queryClient.invalidateQueries({ queryKey: ['pages', 'sandbox'] })
      onReset?.()
    } finally {
      setResetting(false)
    }
  }

  return (
    <div
      role="status"
      aria-label="Sandbox workspace"
      className="flex items-center justify-between px-3 py-1.5 bg-raw-wheat text-raw-ink"
    >
      <span className="font-mono lowercase tracking-[0.14em] text-[10px]">sandbox</span>
      <button
        onClick={handleReset}
        disabled={resetting}
        className="font-mono lowercase tracking-wider text-xs text-raw-ink/80 hover:text-raw-ink disabled:opacity-50 transition-colors"
        aria-label="Reset sandbox workspace"
      >
        {resetting ? 'resetting…' : 'reset sandbox'}
      </button>
    </div>
  )
}
