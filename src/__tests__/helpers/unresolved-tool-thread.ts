import type { UIMessage } from 'ai'

/**
 * Structural shape of the Life 2 thread KAN-284 investigates — role + one
 * descriptor string per part, copied from the loop's `thread-shape.json`
 * (`"tool-<name>:<state>"`, `"text"`, `"text:done"`, `"step-start"`). No real
 * question/answer text, ids or tool input ever lived here —
 * `buildUnresolvedToolThreadFixture` fills every part with neutral
 * placeholders.
 */
export const UNRESOLVED_TOOL_THREAD_SHAPE: ReadonlyArray<{
  role: 'user' | 'assistant'
  parts: readonly string[]
}> = [
  { role: 'user', parts: ['text'] },
  { role: 'assistant', parts: ['step-start', 'text:done', 'tool-suggest_followups:input-available'] },
  { role: 'user', parts: ['text'] },
  {
    role: 'assistant',
    parts: [
      'step-start',
      'text:done',
      'tool-create_page:input-available',
      'tool-create_page:input-available',
      'tool-create_page:input-available',
      'tool-create_page:input-available',
    ],
  },
  { role: 'user', parts: ['text'] },
  { role: 'assistant', parts: ['step-start', 'text:done', 'tool-suggest_followups:input-available'] },
  { role: 'user', parts: ['text'] },
  { role: 'assistant', parts: ['step-start', 'text:done', 'tool-propose_changes:input-available'] },
  { role: 'user', parts: ['text'] },
  {
    role: 'assistant',
    parts: [
      'step-start',
      'text:done',
      'tool-read_page:output-available',
      'step-start',
      'text:done',
      'tool-propose_changes:input-available',
    ],
  },
  { role: 'user', parts: ['text'] },
  { role: 'assistant', parts: ['step-start', 'text:done', 'tool-suggest_followups:input-available'] },
  { role: 'user', parts: ['text'] },
  { role: 'assistant', parts: ['step-start', 'text:done', 'tool-suggest_followups:input-available'] },
  { role: 'user', parts: ['text'] },
  { role: 'assistant', parts: ['step-start', 'text:done', 'tool-suggest_followups:input-available'] },
  { role: 'user', parts: ['text'] },
  {
    role: 'assistant',
    parts: [
      'step-start',
      'text:done',
      'tool-read_page:output-available',
      'step-start',
      'text:done',
      'tool-propose_changes:input-available',
    ],
  },
  { role: 'user', parts: ['text'] },
  {
    role: 'assistant',
    parts: ['step-start', 'tool-read_page:output-available', 'step-start', 'tool-propose_changes:input-available'],
  },
  { role: 'user', parts: ['text'] },
  {
    role: 'assistant',
    parts: [
      'step-start',
      'text:done',
      'tool-read_page:output-available',
      'step-start',
      'text:done',
      'tool-propose_changes:input-available',
    ],
  },
  { role: 'user', parts: ['text'] },
  {
    role: 'assistant',
    parts: [
      'step-start',
      'text:done',
      'tool-read_page:output-available',
      'step-start',
      'tool-propose_changes:input-available',
    ],
  },
  { role: 'user', parts: ['text'] },
  {
    role: 'assistant',
    parts: [
      'step-start',
      'text:done',
      'tool-read_page:output-available',
      'step-start',
      'tool-propose_changes:input-available',
    ],
  },
  { role: 'user', parts: ['text'] },
  {
    role: 'assistant',
    parts: [
      'step-start',
      'text:done',
      'tool-read_page:output-available',
      'step-start',
      'tool-propose_changes:input-available',
    ],
  },
  { role: 'user', parts: ['text'] },
  {
    role: 'assistant',
    parts: ['step-start', 'tool-read_page:output-available', 'step-start', 'tool-propose_changes:input-available'],
  },
  { role: 'user', parts: ['text'] },
  { role: 'assistant', parts: ['step-start', 'text:done', 'tool-suggest_followups:input-available'] },
  { role: 'user', parts: ['text'] },
  {
    role: 'assistant',
    parts: ['step-start', 'tool-read_page:output-available', 'step-start', 'tool-propose_changes:input-available'],
  },
  { role: 'user', parts: ['text'] },
  { role: 'assistant', parts: ['step-start', 'text:done', 'tool-suggest_followups:input-available'] },
  { role: 'user', parts: ['text'] },
  { role: 'assistant', parts: ['step-start', 'text:done', 'tool-create_page:input-available'] },
  { role: 'user', parts: ['text'] },
  {
    role: 'assistant',
    parts: [
      'step-start',
      'text:done',
      'tool-read_page:output-available',
      'step-start',
      'tool-propose_changes:input-available',
    ],
  },
  { role: 'user', parts: ['text'] },
  {
    role: 'assistant',
    parts: ['step-start', 'tool-read_page:output-available', 'step-start', 'tool-propose_changes:input-available'],
  },
]

/** Builds one neutral part from its descriptor string. `messageIndex`/`partIndex` only
 *  make ids/placeholder text distinct — they carry no meaning from the source thread. */
function buildPart(descriptor: string, messageIndex: number, partIndex: number): UIMessage['parts'][number] {
  if (descriptor === 'step-start') {
    return { type: 'step-start' } as UIMessage['parts'][number]
  }
  if (descriptor === 'text') {
    return { type: 'text', text: `placeholder question ${messageIndex}` } as UIMessage['parts'][number]
  }
  if (descriptor === 'text:done') {
    return {
      type: 'text',
      text: `placeholder answer ${messageIndex}.${partIndex}`,
      state: 'done',
    } as UIMessage['parts'][number]
  }

  const [toolSegment, state] = descriptor.split(':')
  const toolName = toolSegment.replace(/^tool-/, '')
  const part: Record<string, unknown> = {
    type: `tool-${toolName}`,
    toolCallId: `unresolved-thread-call-${messageIndex}-${partIndex}`,
    state,
    input: {},
  }
  if (state === 'output-available') part.output = {}
  return part as unknown as UIMessage['parts'][number]
}

/** Builds a synthetic `UIMessage[]` of the KAN-284 Life 2 thread's shape — same
 *  role sequence and tool-part states, neutral placeholder content throughout. */
export function buildUnresolvedToolThreadFixture(): UIMessage[] {
  return UNRESOLVED_TOOL_THREAD_SHAPE.map((message, messageIndex) => ({
    id: `unresolved-thread-m${messageIndex}`,
    role: message.role,
    parts: message.parts.map((descriptor, partIndex) => buildPart(descriptor, messageIndex, partIndex)),
  })) as UIMessage[]
}
