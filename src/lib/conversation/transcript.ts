import { convertToModelMessages } from 'ai'
import type { ModelMessage, UIMessage } from 'ai'

/**
 * Convert a persisted UI transcript into model messages for replay.
 *
 * A transcript can carry a *dangling* client-tool call — e.g. a client-tool
 * invocation left in the `input-available` state because the user aborted the
 * flow without ever producing a tool result. Replaying that
 * transcript as-is makes the model prompt throw `AI_MissingToolResultsError`
 * (an assistant tool-call with no matching tool-result), so the next assistant
 * reply never streams.
 *
 * `ignoreIncompleteToolCalls` drops tool parts still in the `input-streaming`
 * or `input-available` state before conversion, letting the conversation
 * continue. Completed tool calls (`output-available` / `output-error`) are
 * preserved untouched.
 */
export async function toModelMessages(messages: UIMessage[]): Promise<ModelMessage[]> {
  return convertToModelMessages(messages, { ignoreIncompleteToolCalls: true })
}

const isWebSearchPart = (part: UIMessage['parts'][number]): boolean =>
  part.type === 'tool-web_search' ||
  (part.type === 'dynamic-tool' && (part as { toolName?: string }).toolName === 'web_search')

/**
 * Drop provider-run `web_search` calls and results from a transcript, keeping the
 * text and citations around them. Replaying them with `web_search` absent from the
 * request's tools sends the provider server-tool blocks for a tool it was not
 * given; a message left with nothing is dropped.
 */
export function withoutWebSearch(messages: UIMessage[]): UIMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== 'assistant' || !message.parts.some(isWebSearchPart)) return [message]
    const parts = message.parts.filter((part) => !isWebSearchPart(part))
    const hasContent = parts.some((part) => part.type !== 'step-start')
    return hasContent ? [{ ...message, parts }] : []
  })
}
