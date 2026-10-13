'use client'

import { lazy, Suspense, useRef, type MouseEvent } from 'react'
import type { ModuleViewProps } from '../types'
import type { TextBlock } from './schema'
import { StaticProse } from './static-prose'
import type { Press } from './editor'

const loadEditor = () => import('./editor')
// Fetched as soon as text blocks can appear in this browser, not when the first
// editable one renders: until it lands, what a person types has nowhere to go.
if (typeof window !== 'undefined') void loadEditor()
const TextEditor = lazy(loadEditor)

/**
 * The text block: its markdown `content` as a typeset document. Read-only is a
 * static render of the parsed document — no editor, so it renders on the server
 * and paints at once. Editable loads the editor on demand, with that same render
 * standing in until it is ready; a press on the stand-in is where the caret lands.
 */
export const TextView = ({ data, editable = false, onChange }: ModuleViewProps<TextBlock>) => {
  const pressRef = useRef<Press | null>(null)
  if (!editable) return <StaticProse content={data.content} />

  const handleStandInMouseDown = (event: MouseEvent) => {
    pressRef.current = { left: event.clientX, top: event.clientY }
  }
  const standIn = (
    <StaticProse
      content={data.content}
      showPlaceholder
      placeholder={data.placeholder}
      onMouseDown={handleStandInMouseDown}
    />
  )
  return (
    <Suspense fallback={standIn}>
      <TextEditor data={data} onChange={onChange} standIn={standIn} pressRef={pressRef} />
    </Suspense>
  )
}
