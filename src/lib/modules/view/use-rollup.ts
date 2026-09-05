'use client'

/**
 * Client compute seam for a rollup value (#20). A rollup lives on a row alongside a
 * relation and aggregates one property across the rows THAT relation links to. Given
 * the rollup def, the sibling relation's def, and that relation's stored value on
 * this row (the linked ids), it fetches the target collection's rows and schema and
 * runs the pure `computeRollup`.
 *
 * The fetches reuse the exact caches the rest of the app already primes + invalidates,
 * so a rollup stays live as links and target rows change with no extra wiring:
 *   - `['rows', targetId]` — the target collection's rows (shared with the relation
 *     field + inline views); the values `computeRollup` aggregates.
 *   - `['page', targetId]` — the target collection page, for its `_schema` (needed to
 *     find the rolled property and check its type).
 *
 * `count` is the one aggregate that ignores rows + schema entirely (it is just the
 * number of linked pages), so it computes with no fetch. A rollup whose relation is
 * unresolvable (`relationDef` absent) can compute nothing → `empty` ("—"), never a
 * misleading 0.
 *
 * CRITICAL: the Supabase client is constructed lazily INSIDE the queryFn (never at
 * render) so seeded/disabled queries (Storybook, envless CI) never build a real
 * client and throw — mirroring `use-relation-titles`.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getCollectionRows, getPage, type PondPage } from '@/lib/pages/client'
import { useWorkspace } from '@/lib/workspace/context'
import { readSchema, type PropertyDef } from '@/lib/properties/schema'
import { computeRollup, type RollupResult } from '@/lib/modules/view/compute-rollup'

const EMPTY: RollupResult = { kind: 'empty' }

export interface UseRollup {
  /** The computed value, ready to format. */
  result: RollupResult
  /** True while the target rows/schema a value aggregate needs are still loading. */
  loading: boolean
}

export function useRollup(
  def: PropertyDef,
  relationValue: unknown,
  relationDef?: PropertyDef
): UseRollup {
  const workspace = useWorkspace()
  // Lazily created on first fetch, not at render — so seeded/disabled queries never
  // construct a real client and throw (envless CI/Storybook).
  const getSupabase = useMemo(() => {
    let client: ReturnType<typeof createClient> | null = null
    return () => (client ??= createClient())
  }, [])

  const linkedIds = Array.isArray(relationValue) ? (relationValue as string[]) : []
  const targetId = relationDef?.target
  // `count` ignores rows + schema, and an untargeted relation has nothing to read —
  // only a value aggregate over a targeted relation needs the fetch.
  const needsRows = def.aggregate !== 'count' && !!targetId

  const { data: rows, isLoading: rowsLoading } = useQuery({
    queryKey: targetId ? (['rows', targetId] as const) : (['rows', 'none'] as const),
    queryFn: async () => {
      if (!targetId) return [] as PondPage[]
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return [] as PondPage[]
      return getCollectionRows(supabase, user.id, targetId, workspace)
    },
    enabled: needsRows,
  })

  const { data: targetPage, isLoading: pageLoading } = useQuery({
    queryKey: targetId ? (['page', targetId] as const) : (['page', 'none'] as const),
    queryFn: () => (targetId ? getPage(getSupabase(), targetId) : null),
    enabled: needsRows,
  })

  return useMemo<UseRollup>(() => {
    // No resolvable relation → nothing to aggregate over (D7): render "—", not 0.
    if (!relationDef) return { result: EMPTY, loading: false }
    const loading = needsRows && (rowsLoading || pageLoading)
    const targetSchema = targetPage ? readSchema(targetPage.props) : null
    const result = computeRollup(def, linkedIds, rows ?? [], targetSchema)
    return { result, loading }
  }, [def, relationDef, linkedIds, rows, targetPage, needsRows, rowsLoading, pageLoading])
}
