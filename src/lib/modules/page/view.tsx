'use client'

import type { ModuleViewProps } from '../types'
import type { Block } from '../content'
import type { PageModule } from './schema'
import { ModuleView } from '../renderers'

/**
 * Page container view — the recursive-composition seam (t12 §6). It renders each
 * child block by dispatching through the registry (`ModuleView`), never by
 * hard-coding block types. This is the drop-in point for in-page layout later
 * (t18 `section`); today it stacks children vertically.
 *
 * The `ModuleView` import forms a deliberate cycle with `renderers.ts` (the map
 * holds this component). It is safe: `ModuleView` is only *invoked* at React render
 * time, by which point the ESM live binding is populated — never at module eval.
 */
export function PageView({ data, editable, onChange }: ModuleViewProps<PageModule>) {
  function replaceBlockAt(index: number, next: Block) {
    onChange?.({ ...data, blocks: data.blocks.map((b, k) => (k === index ? next : b)) })
  }

  return (
    <div className="space-y-4">
      {data.title && <h1 className="text-xl font-semibold text-zinc-900">{data.title}</h1>}
      {data.blocks.map((block, i) => (
        <ModuleView
          key={block.id}
          type={block.type}
          data={block}
          editable={editable}
          onChange={(next) => replaceBlockAt(i, next as Block)}
        />
      ))}
    </div>
  )
}
