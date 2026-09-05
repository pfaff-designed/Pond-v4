'use client'

/**
 * The connected relation field (#20 slice 6) — the one fetch boundary for a
 * relation value. It reads id→title + picker candidates from `useRelationTitles`
 * (targeted → the shared `['rows', target]` cache; untargeted → per-id `['page',
 * id]` + the workspace list) and derives `onOpen` from the router, then hands it
 * all to the presentational `RelationValue` molecule. This is the ONLY relation
 * piece that touches data — the view `Cell` and `PropertyInspector` render it in
 * their relation branch and otherwise stay presentational.
 */

import { useRouter } from 'next/navigation'
import { RelationValue } from '@/components/molecules/RelationValue'
import { useRelationTitles } from '@/lib/modules/view/use-relation-titles'
import { useWorkspace } from '@/lib/workspace/context'
import { workspaceHref, workspaceBasePath } from '@/lib/pages/nav'
import type { PropertyDef } from '@/lib/properties/schema'

export interface RelationValueFieldProps {
  def: PropertyDef
  value: unknown
  editable: boolean
  /** The next `string[]` after an add/remove — the host persists it. */
  onChange: (next: string[]) => void
}

export function RelationValueField({ def, value, editable, onChange }: RelationValueFieldProps) {
  const ids = Array.isArray(value) ? (value as string[]) : []
  const { titles, candidates } = useRelationTitles(ids, def.target)
  const router = useRouter()
  const workspace = useWorkspace()

  // A relation only links pages; the workspace panel loads content purely from
  // ?nodeId, so a `type: 'page'` hint in the href is harmless (rail/breadcrumb
  // only). Title falls back to the id when unresolved.
  function onOpen(id: string) {
    router.push(
      workspaceHref({ id, type: 'page', title: titles.get(id) ?? id }, workspaceBasePath(workspace))
    )
  }

  return (
    <RelationValue
      value={ids}
      titles={titles}
      candidates={candidates}
      single={def.single}
      editable={editable}
      onChange={onChange}
      onOpen={onOpen}
    />
  )
}
