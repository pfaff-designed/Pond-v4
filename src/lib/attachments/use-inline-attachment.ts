'use client'

/**
 * useInlineAttachment — a single-slot attachment held in state and parsed
 * inline (never uploaded), keyed by `kind` so a new attachment kind (e.g.
 * HTML, #7k) is a sibling through this same API, not a new state + guard
 * chain. Distinct from useAttachments (#61), which owns the upload path.
 */

import { useCallback, useState } from 'react'

export function useInlineAttachment<T extends { kind: string }>() {
  const [attachment, setAttachment] = useState<T | null>(null)

  const clear = useCallback(() => setAttachment(null), [])

  return { attachment, setAttachment, clear }
}
