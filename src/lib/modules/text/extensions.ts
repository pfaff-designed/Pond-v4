import { Extension, type Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Heading } from '@tiptap/extension-heading'
import { Strike } from '@tiptap/extension-strike'
import { HEADING_CHORDS } from './markup'

/** What the autolinker may turn into a link — the same shapes the markdown parser links. */
const AUTOLINKABLE = /^https?:\/\/|^[^\s@]+@[^\s@]+\.[^\s@]+$/i

/** `'mod+alt+1'` (this module's and the menu's chord spelling) as prosemirror-keymap
 * reads it (`'Mod-Alt-1'`). */
const toKeymapName = (chord: string) =>
  chord
    .split('+')
    .map((token) => token[0].toUpperCase() + token.slice(1))
    .join('-')

/**
 * Heading 1–3 bound from `HEADING_CHORDS`, not StarterKit's own default
 * (which happens to use the same `Mod-Alt-N` shape) — so the chord the block
 * menu shows as a hint is the same string that actually fires the command,
 * never two copies that could drift apart.
 */
const HeadingWithChords = Heading.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      ...Object.fromEntries(
        (Object.entries(HEADING_CHORDS) as [`${1 | 2 | 3}`, string][]).map(([level, chord]) => [
          toKeymapName(chord),
          () => this.editor.commands.toggleHeading({ level: Number(level) as 1 | 2 | 3 }),
        ])
      ),
    }
  },
})

/**
 * List markup the editor has no visible use for but markdown does: whether a list
 * is tight (no blank line between items) and which bullet it was written with.
 * Kept on the node so an edit elsewhere in the block doesn't rewrite the list.
 */
/**
 * Strike bound to ⌘⇧X (the spec's chord) only — StarterKit's own default
 * (`Mod-Shift-s`) is dropped outright, not kept alongside it.
 */
const StrikeWithChord = Strike.extend({
  addKeyboardShortcuts() {
    return { 'Mod-Shift-x': () => this.editor.commands.toggleStrike() }
  },
})

const MarkdownListAttributes = Extension.create({
  name: 'markdownListAttributes',
  addGlobalAttributes: () => [
    {
      types: ['bulletList', 'orderedList'],
      attributes: { tight: { default: true, rendered: false, keepOnSplit: true } },
    },
    {
      types: ['bulletList'],
      attributes: { bullet: { default: '-', rendered: false, keepOnSplit: true } },
    },
  ],
})

/**
 * The text block's editor: exactly the structure its markdown `content` can
 * carry (`document.ts` declares the same schema without the editor). Underline
 * has no markdown, and a trailing empty paragraph would be written back as
 * content the person never typed, so both are left out. Link clicks are the
 * view's: the link extension's own opener keeps `window.opener`.
 */
export const proseExtensions: Extensions = [
  StarterKit.configure({
    heading: false,
    strike: false,
    underline: false,
    trailingNode: false,
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      shouldAutoLink: (value) => AUTOLINKABLE.test(value),
      HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer', class: null },
    },
  }),
  HeadingWithChords,
  StrikeWithChord,
  MarkdownListAttributes,
]
