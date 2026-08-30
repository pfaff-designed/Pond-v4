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
      className="flex items-center justify-between px-3 py-1.5 text-xs bg-amber-50 border-b border-amber-200 text-amber-700"
    >
      <span className="font-medium tracking-wide uppercase text-[10px]">Sandbox</span>
      <button
        onClick={handleReset}
        disabled={resetting}
        className="text-amber-600 hover:text-amber-800 disabled:opacity-50 transition-colors"
        aria-label="Reset sandbox workspace"
      >
        {resetting ? 'Resetting…' : 'Reset sandbox'}
      </button>
    </div>
  )
}
