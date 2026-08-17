/**
 * Tool-call repair — extracted from the chat Route Handler so it can be exercised
 * directly (see `scripts/eval-repair.mts`), not only through the UI.
 *
 * Behavior is identical to the inline `repairToolCall` route.ts used before: on a
 * schema-invalid tool call, re-ask the model (via `generateObject`) to produce
 * arguments that satisfy the tool's JSON schema. The strict `inputSchema` is still
 * the gate; this only widens the model's second chance to hit it. An unknown tool
 * name can't be repaired by fixing arguments, so we give up (return null).
 */
import { anthropic } from '@ai-sdk/anthropic'
import {
  generateObject,
  jsonSchema,
  NoSuchToolError,
  type JSONSchema7,
  type ToolCallRepairFunction,
  type ToolSet,
} from 'ai'
import { AI_MODELS } from '@/lib/ai/models'

/** A schema-invalid tool call plus the machinery to resolve its target schema. */
export interface RepairInput {
  /** The tool name and (invalid) input the model emitted. */
  toolCall: { toolName: string; input: unknown }
  /** The validation error thrown by the strict inputSchema gate. */
  error: { message: string }
  /** Resolves the JSON schema for a given tool name (as the AI SDK provides). */
  inputSchema: (options: { toolName: string }) => PromiseLike<JSONSchema7>
}

/** The repaired tool call: same shape the SDK expects back, with corrected input. */
export interface RepairedToolCall {
  toolName: string
  input: string
}

/**
 * Core repair logic, decoupled from the AI SDK's full `repairToolCall` option
 * surface so it can be called directly in a test with a fabricated tool call.
 * Returns the repaired call (input as a JSON string), or null when unrepairable.
 */
export async function repairToolCallArgs(
  { toolCall, error, inputSchema }: RepairInput,
  isNoSuchTool: (error: unknown) => boolean = NoSuchToolError.isInstance
): Promise<RepairedToolCall | null> {
  // An unknown tool name can't be repaired by fixing arguments — give up.
  if (isNoSuchTool(error)) return null
  const schema = await inputSchema({ toolName: toolCall.toolName })
  const { object: repaired } = await generateObject({
    model: anthropic(AI_MODELS.standard),
    schema: jsonSchema(schema),
    prompt: [
      `The tool "${toolCall.toolName}" was called with arguments that failed validation:`,
      JSON.stringify(toolCall.input),
      `Validation error: ${error.message}`,
      'Return corrected arguments that satisfy the tool schema exactly. Do not invent block ids: omit ids when creating and reference only existing block ids when editing or removing.',
    ].join('\n'),
  })
  return { toolName: toolCall.toolName, input: JSON.stringify(repaired) }
}

/**
 * The `repairToolCall` handler wired into `streamText`. Thin adapter over
 * `repairToolCallArgs` that spreads the corrected input back onto the original
 * tool call — identical to the route's prior inline behavior.
 */
export function makeRepairToolCall<TOOLS extends ToolSet>(): ToolCallRepairFunction<TOOLS> {
  return async ({ toolCall, inputSchema, error }) => {
    const repaired = await repairToolCallArgs({ toolCall, error, inputSchema })
    if (!repaired) return null
    return { ...toolCall, input: repaired.input }
  }
}
