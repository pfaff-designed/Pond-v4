'use client'

import type { ModuleViewProps } from '../types'
import type { Block } from '../content'
import type { PageModule } from './schema'
import { ModuleView } from '../renderers'
import { SiblingBlocksProvider } from '../sibling-context'
import { blockDomId, scrollToBlock } from '../block-dom'

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
    // Sibling state so a bound metric derives from its checklist/table (ticket-23);
    // re-derives whenever `data.blocks` changes (e.g. a child checkbox toggles).
    // `data.id` is this page's own id — a cross-page rollup uses it to find children
    // (ticket-38).
    <SiblingBlocksProvider value={{ blocks: data.blocks, scrollToBlock, pageId: data.id }}>
      <div className="space-y-4">
        {data.title && (
          <h1 className="font-sans text-xl font-semibold tracking-tight text-mn-text">
            {data.title}
          </h1>
        )}
        {data.blocks.map((block, i) => (
          <div key={block.id} id={blockDomId(block.id)}>
            <ModuleView
              type={block.type}
              data={block}
              editable={editable}
              // Rule 1 (KAN-345): a nested page's own blocks arrive with the
              // page, never with a person's click — none of them may grab the
              // caret on load.
              autofocus={false}
              onChange={(next) => replaceBlockAt(i, next as Block)}
            />
          </div>
        ))}
      </div>
    </SiblingBlocksProvider>
  )
}
