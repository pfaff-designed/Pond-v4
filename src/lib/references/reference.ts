/**
 * A reference is a page plus a range of text, not a pasted quote (#98, board
 * 6e). `reanchorRange` is the "survives edits around it" half: given an edit
 * made elsewhere in the same block, it relocates the range so a reference
 * keeps pointing at the same words. A `range` of `null` means "the whole
 * page" (KAN-99's `@`-picker chip) and never needs re-anchoring.
 */

export interface PageReference {
  /** Stable across re-renders, so a drop/removal/re-anchor report can key by it instead of array position. */
  id: string
  pageId: string
  blockId: string
  range: TextRange | null
  quotedText: string
}

export interface TextRange {
  from: number
  to: number
}

/** A single contiguous edit: `deleteCount` characters removed at `from`, then `insertedText` inserted in their place. */
export interface TextEdit {
  from: number
  deleteCount: number
  insertedText: string
}

/**
 * Relocates `range` across `edit`. Returns `null` when the edit deletes into
 * the range (a reference whose anchored text was itself edited away), since
 * there is no longer a "same passage" to point at.
 */
export function reanchorRange(range: TextRange, edit: TextEdit): TextRange | null {
  const insertedLength = edit.insertedText.length
  const shift = insertedLength - edit.deleteCount

  // A pure insertion (nothing deleted) either lands before the range and
  // shifts it, inside it and grows it, or after it and leaves it alone.
  if (edit.deleteCount === 0) {
    if (edit.from <= range.from) {
      return { from: range.from + insertedLength, to: range.to + insertedLength }
    }
    if (edit.from < range.to) {
      return { from: range.from, to: range.to + insertedLength }
    }
    return range
  }

  const deleteEnd = edit.from + edit.deleteCount

  // Deletes (and optionally re-inserts) entirely before the range: shifts it
  // without touching its contents.
  if (deleteEnd <= range.from) {
    return { from: range.from + shift, to: range.to + shift }
  }

  // Entirely after the range: no effect.
  if (edit.from >= range.to) {
    return range
  }

  // Overlaps the range (fully inside, straddling an edge, or covering it
  // entirely) — the anchored text was itself edited, so drop the reference.
  return null
}
