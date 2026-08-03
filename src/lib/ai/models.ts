// Update model IDs here when Sonnet 5 / Opus 5 land
export const AI_MODELS = {
  quick: 'claude-haiku-4-5', // entity extraction, background tasks
  standard: 'claude-sonnet-4-6', // default for all conversations
  deep: 'claude-opus-4-8', // manual escalation, heavy reasoning
} as const

export type ModelTier = keyof typeof AI_MODELS
export type ModelId = (typeof AI_MODELS)[ModelTier]
