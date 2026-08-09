import type { Block } from '@/lib/documents/types'

/**
 * Apply an AI-proposed edit to a block array (ticket-10 Accept path).
 *
 * Replaces the content of the text block whose id matches `blockId`, returning a
 * new array (the input is never mutated). Text-only this slice: if the target is
 * missing or not a text block, the array is returned unchanged — accepting is a
 * safe no-op rather than a corrupting write.
 */
export function applyProposedEdit(blocks: Block[], blockId: string, newContent: string): Block[] {
  return blocks.map((block) =>
    block.id === blockId && block.type === 'text' ? { ...block, content: newContent } : block
  )
}
