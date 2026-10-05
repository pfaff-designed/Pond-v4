'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { pondHref } from './active'
import { createPond } from './client'
import { usePond } from './context'

/**
 * Making a pond from the New pond sheet — shared by the rail's switcher and the
 * palette's `new pond “q”`, so the two cannot disagree about what creating does.
 * Resolves `true` once the pond exists and the shell is on its way into it.
 */
export function useCreatePond() {
  const router = useRouter()
  const { addPond } = usePond()
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const create = async (name: string): Promise<boolean> => {
    if (pending) return false
    setPending(true)
    setFailure(null)
    try {
      const pond = await createPond(name)
      // Into the list BEFORE the navigation, so the shell can resolve the pond the
      // URL is about to name.
      addPond(pond)
      router.push(pondHref(pond.id))
      return true
    } catch (err) {
      setFailure((err as Error).message)
      return false
    } finally {
      setPending(false)
    }
  }

  return { create, pending, failure, clearFailure: () => setFailure(null) }
}
