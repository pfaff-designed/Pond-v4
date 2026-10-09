'use client'

import { lazy, Suspense } from 'react'
import type { ModuleViewProps } from '../types'
import { TEXT_PLACEHOLDER } from './prose'
import type { TextBlock } from './schema'
import { StaticProse } from './static-prose'

const TextEditor = lazy(() => import('./editor'))

/**
 * The text block: its markdown `content` as a typeset document. Read-only is a
 * static render of the parsed document — no editor, so it renders on the server
 * and paints at once. Editable loads the editor on demand, with that same render
 * standing in until it is ready.
 */
export const TextView = ({ data, editable = false, onChange }: ModuleViewProps<TextBlock>) => {
  if (!editable) return <StaticProse content={data.content} />
  return (
    <Suspense fallback={<StaticProse content={data.content} placeholder={TEXT_PLACEHOLDER} />}>
      <TextEditor data={data} onChange={onChange} />
    </Suspense>
  )
}
