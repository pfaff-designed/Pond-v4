import { Schema } from '@tiptap/pm/model'

/**
 * The text block's document: the editor's schema (`proseExtensions`), declared
 * without the editor so a block can be read — on the page, in a diff card, on the
 * server — without loading it. Order is meaningful (the first block is the default
 * one, and marks nest in this order). A test holds it equal to the editor's.
 */
export const proseSchema = new Schema({
  nodes: {
    paragraph: { content: 'inline*', group: 'block' },
    blockquote: { content: 'block+', group: 'block', defining: true },
    bulletList: {
      content: 'listItem+',
      group: 'block list',
      attrs: { tight: { default: true }, bullet: { default: '-' } },
    },
    codeBlock: {
      content: 'text*',
      marks: '',
      group: 'block',
      code: true,
      defining: true,
      attrs: { language: { default: null } },
    },
    doc: { content: 'block+' },
    hardBreak: {
      group: 'inline',
      inline: true,
      selectable: false,
      linebreakReplacement: true,
      leafText: () => '\n',
    },
    heading: {
      content: 'inline*',
      group: 'block',
      defining: true,
      attrs: { level: { default: 1 } },
    },
    horizontalRule: { group: 'block' },
    listItem: { content: 'paragraph block*', defining: true },
    orderedList: {
      content: 'listItem+',
      group: 'block list',
      attrs: { tight: { default: true }, start: { default: 1 }, type: { default: null } },
    },
    text: { group: 'inline' },
  },
  marks: {
    link: {
      inclusive: true,
      attrs: {
        href: { default: null },
        target: { default: '_blank' },
        rel: { default: 'noopener noreferrer' },
        class: { default: null },
        title: { default: null },
      },
    },
    bold: {},
    code: { excludes: '_', code: true },
    italic: {},
    strike: {},
  },
  topNode: 'doc',
})
