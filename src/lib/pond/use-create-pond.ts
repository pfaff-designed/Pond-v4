'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { pondHref } from './active'
import { createPond, type CreatePondOptions } from './client'
import { usePond } from './context'

/**
 * Making a pond from the New pond sheet — shared by the rail's switcher and the
 * palette's `new pond “q”`, so the two cannot disagree about what creating does.
 * Resolves `true` once the pond exists and the shell is on its way into it.
 *
 * In flight is a ref, not state: a second Enter or click lands before the re-render
 * that would show `pending`, and a closure over state would let both through
 * (AUDIT G9).
 */
export function useCreatePond() {
  const router = useRouter()
  const { addPond } = usePond()
  const inFlight = useRef(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const create = async (name: string, options?: CreatePondOptions): Promise<boolean> => {
    if (inFlight.current) return false
    inFlight.current = true
    setPending(true)
    setFailure(null)
    try {
      const pond = await createPond(name, options)
      // Into the list BEFORE the navigation, so the shell can resolve the pond the
      // URL is about to name.
      addPond(pond)
      router.push(pondHref(pond.id))
      return true
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Could not create the pond')
      return false
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return { create, pending, failure }
}
