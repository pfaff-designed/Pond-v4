import type { UIMessage } from 'ai'
import {
  isProposeChangesPart,
  isDefineSchemaPart,
  isAddRowPart,
  isConfigureViewPart,
  isPromoteTablePart,
  isLinkRecordsPart,
  type ProposeChangesPart,
  type DefineSchemaPart,
  type AddRowPart,
  type ConfigureViewPart,
  type PromoteTablePart,
  type LinkRecordsPart,
} from '@/lib/conversation/tool-parts'

type AssistantPart = UIMessage['parts'][number]

type QualifyingProposalPart =
  | ProposeChangesPart
  | DefineSchemaPart
  | AddRowPart
  | ConfigureViewPart
  | PromoteTablePart
  | LinkRecordsPart

/** The six proposal kinds that render a diff card and carry `assumption`
 *  (KAN-334). `create_page` is excluded on purpose: it's the make-this-a-page
 *  card, not an edit, and never carries an assumption. Parameter typed loosely
 *  (matching every other `is*Part` guard in `tool-parts.ts`): the simplified
 *  `*Part` shapes here aren't structural subtypes of the real `ai` SDK union,
 *  so a predicate declared against that union can't narrow to them. */
export function isQualifyingProposalPart(part: { type: string }): part is QualifyingProposalPart {
  return (
    isProposeChangesPart(part) ||
    isDefineSchemaPart(part) ||
    isAddRowPart(part) ||
    isConfigureViewPart(part) ||
    isPromoteTablePart(part) ||
    isLinkRecordsPart(part)
  )
}

/**
 * The turn's answer prose shown above a proposal card (KAN-334): the first
 * non-streaming qualifying proposal part carries the edit's `assumption` —
 * exactly one sentence naming what the edit assumes, not a restatement of
 * the action. The model's other free prose in that turn is not this
 * function's concern — callers show nothing else above the card.
 */
export function answerAboveCard(parts: AssistantPart[]): string | undefined {
  const part = (parts as Array<{ type: string }>).find(
    (p): p is QualifyingProposalPart => isQualifyingProposalPart(p) && p.state !== 'input-streaming'
  )
  if (!part) return undefined
  const trimmed = part.input?.assumption?.trim()
  return trimmed ? trimmed : undefined
}

/** Rough sentence count — splits on terminal punctuation. Good enough to
 *  assert "exactly one sentence" without parsing prose. Ported from
 *  `scripts/eval-routing.impl.mts` at `489a8f5`. */
function sentenceCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return (trimmed.match(/[^.!?]+(?:[.!?]+|$)/g) ?? []).filter((m) => m.trim().length > 0).length
}

/** KAN-132 live miss: the model can emit exactly one sentence that only
 *  describes the action ("Updating the electrician date.") rather than
 *  naming an assumption. `isOneAssumptionSentence` must fail that case, so
 *  it also requires one of these assumption words/phrases. */
export const ASSUMPTION_WORD_RE = /assum|taking|taken|reading|measured from|counted from|presum/i

/** Exactly one non-empty sentence AND that sentence names an assumption, not
 *  just the action taken. */
export function isOneAssumptionSentence(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.length > 0 && sentenceCount(trimmed) === 1 && ASSUMPTION_WORD_RE.test(trimmed)
}
