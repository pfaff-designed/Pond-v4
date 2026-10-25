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

/**
 * Heading 1–3's chord, Notion's own (⌘⌥1–3 on a Mac — shown because the editor
 * really binds it, AGENTS.md "shown, not invented"). The one home for the
 * string: `extensions.ts` binds Heading's shortcuts from this same table, and
 * the block menu's hint reads it too, so the two can never drift apart.
 */
export const HEADING_CHORDS = {
  1: 'mod+alt+1',
  2: 'mod+alt+2',
  3: 'mod+alt+3',
} as const satisfies Record<1 | 2 | 3, string>
