'use client'

/**
 * Done-ness for the views that tick (the list, the board's record peek): one rule,
 * one write. A record is done when its status/select reads as the option labelled
 * `done`; ticking writes that option through `onEdit` — the person's own edit — and
 * unticking puts the record back where it was.
 *
 * "Where it was" is remembered for the session: the option a record held when it was
 * ticked. A record that was ticked before this session has no memory, so it returns to
 * the first option that is not `done`.
 */

import { useMemo } from 'react'
import type { PropertySchema, PropertyValue } from '@/lib/properties/schema'
import { coerceValue, optionForValue } from '@/lib/properties/schema'
import type { CollectionRow } from './apply'
import { isRowDone, pickDoneState } from './due-buckets'

const priorOption = new Map<string, string>()

export function useDoneToggle({
  schema,
  groupBy,
  editable,
  onEdit,
}: {
  schema: PropertySchema
  groupBy?: string
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
}) {
  const state = useMemo(() => pickDoneState(schema, groupBy), [schema, groupBy])

  const isDone = (row: CollectionRow) => isRowDone(row, state)

  const toggle =
    state && editable && onEdit
      ? (row: CollectionRow) => {
          const memory = `${state.def.id}/${row.id}`
          if (isRowDone(row, state)) {
            const prior = priorOption.get(memory)
            const restorable = state.def.options?.some(
              (o) => o.id === prior && o.id !== state.doneId
            )
            onEdit(row.id, state.def.id, restorable && prior ? prior : state.openId)
            return
          }
          const current = optionForValue(
            state.def,
            coerceValue(state.def, row.values[state.def.id])
          )
          if (current) priorOption.set(memory, current.id)
          onEdit(row.id, state.def.id, state.doneId)
        }
      : undefined

  return { state, isDone, toggle }
}
