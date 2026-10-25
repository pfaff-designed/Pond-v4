/**
 * What a `/` row types for you, as the one home for that fact (AGENTS.md
 * Orthogonality) — the text engine (`editor.tsx`) needs these strings and must not
 * import the `/` menu (`palette.ts`) to get them, since the menu pulls in the
 * registry, slash-entries and the view schema just for this.
 */
export const TEXT_MARKUP = {
  heading: '## ',
  'numbered-list': '1. ',
  quote: '> ',
  code: '```\n\n```',
  divider: '---',
} as const

export type TextMarkupId = keyof typeof TEXT_MARKUP

export const isTextMarkupId = (value: string): value is TextMarkupId =>
  Object.hasOwn(TEXT_MARKUP, value)

/** `/heading` types the second markdown level, with its trailing space, so the
 * caret lands on the words. Exported bare for readers that only ever care about
 * this one row. */
export const HEADING_PREFIX = TEXT_MARKUP.heading
