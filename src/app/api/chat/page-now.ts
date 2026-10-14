import type { ModelMessage, TextPart } from 'ai'
import type { NodeContextData } from '@/lib/context/assemble'
import { resolveDescriptor } from '@/lib/modules/registry'

/**
 * Render the open page's current state: title + one `[blockId] (type) preview`
 * line per editable block, labelled so the model reads it as what the page
 * holds RIGHT NOW — distinct from an earlier `propose_changes` call still in
 * the message history, which only shows what the page held at the time that
 * proposal was made (KAN-309: the model was trusting its own stale tool-call
 * input over a distant system-prompt block).
 */
export function formatOpenPageNow(data: NodeContextData): string {
  const lines: string[] = [
    "[Open page now] This is exactly how the page reads RIGHT NOW. An earlier propose_changes call in this thread shows only what the page read AT THE TIME it was proposed — that text may be stale. Quote and target the text below, not an earlier proposal's.",
    `Title: ${data.title}`,
  ]
  for (const doc of data.documents) {
    for (const block of doc.blocks) {
      const preview = resolveDescriptor(block.type).preview(block, doc.blocks)
      lines.push(`  - [${block.id}] (${block.type})${preview ? ` ${preview}` : ''}`)
    }
  }
  return lines.join('\n')
}

/**
 * Attach the open page's current state as a text part on the LAST user model
 * message, so "change X to Y" targets what the page holds now rather than an
 * earlier accepted proposal still sitting in the message history. A no-op
 * when there is no open-page data, or no user message to attach to.
 */
export function withOpenPageNow(
  modelMessages: ModelMessage[],
  nodeData: NodeContextData | null
): ModelMessage[] {
  if (!nodeData) return modelMessages

  for (let i = modelMessages.length - 1; i >= 0; i--) {
    const message = modelMessages[i]
    if (message.role !== 'user') continue

    const part: TextPart = { type: 'text', text: formatOpenPageNow(nodeData) }
    const content =
      typeof message.content === 'string'
        ? [{ type: 'text' as const, text: message.content }, part]
        : [...message.content, part]

    const updated = [...modelMessages]
    updated[i] = { ...message, content }
    return updated
  }

  return modelMessages
}
