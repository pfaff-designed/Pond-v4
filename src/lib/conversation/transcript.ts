import { convertToModelMessages } from 'ai'
import type { ModelMessage, UIMessage } from 'ai'

/**
 * Convert a persisted UI transcript into model messages for replay.
 *
 * A transcript can carry a *dangling* client-tool call — e.g. a `create_node`
 * invocation left in the `input-available` state because the user aborted the
 * NodeCreationModal without ever producing a tool result. Replaying that
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
