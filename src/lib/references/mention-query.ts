/**
 * Finds the `@`-token the caret sits inside, if any (KAN-99's `@`-picker).
 * The `@` must be preceded by start-of-string or whitespace, and nothing
 * between the `@` and the caret may be whitespace.
 */
export function activeMentionQuery(
  value: string,
  caretIndex: number
): { start: number; query: string } | null {
  let i = caretIndex - 1
  while (i >= 0 && value[i] !== '@' && !/\s/.test(value[i])) {
    i -= 1
  }

  if (i < 0 || value[i] !== '@') return null
  if (i > 0 && !/\s/.test(value[i - 1])) return null

  return { start: i, query: value.slice(i + 1, caretIndex) }
}
