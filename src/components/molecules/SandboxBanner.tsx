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
      // Wheat is highlighted passages only (PROJECT_RULES § Colors), so the banner
      // is the ink wash — the quiet ground chips and code share — carrying ink (#220).
      className="flex items-center justify-between px-3 py-1.5 bg-mn-wash text-mn-text"
    >
      <span className="font-mono lowercase text-[10.5px]">sandbox</span>
      <button
        onClick={handleReset}
        disabled={resetting}
        className="font-mono lowercase text-[10.5px] text-mn-text-meta hover:text-mn-text disabled:opacity-50 transition-colors"
        aria-label="Reset sandbox workspace"
      >
        {resetting ? 'resetting…' : 'reset sandbox'}
      </button>
    </div>
  )
}
