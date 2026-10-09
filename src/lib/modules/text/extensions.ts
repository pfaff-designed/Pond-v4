import { Extension, type Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

/** What the autolinker may turn into a link — the same shapes the markdown parser links. */
const AUTOLINKABLE = /^https?:\/\/|^[^\s@]+@[^\s@]+\.[^\s@]+$/i

/**
 * List markup the editor has no visible use for but markdown does: whether a list
 * is tight (no blank line between items) and which bullet it was written with.
 * Kept on the node so an edit elsewhere in the block doesn't rewrite the list.
 */
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
  MarkdownListAttributes,
]
