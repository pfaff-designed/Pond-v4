import type { Block } from '@/lib/documents/types'
import { splitStoredText } from '@/lib/modules/text/split-stored'

/** Blocks are stored as jsonb; coerce anything non-array to [], and split multi-paragraph text blocks (KAN-552). */
export function toBlocks(value: unknown): Block[] {
  return Array.isArray(value) ? splitStoredText(value as Block[]) : []
}
