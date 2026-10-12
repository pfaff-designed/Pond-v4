/**
 * Proves the ticket's criterion 2: a further attachment kind is a sibling
 * through the registry's own lookups, not a new branch at any of
 * AITerminal.tsx's three call sites (send-time formatContext, pill render,
 * file-matching in handlePickedFiles). Registers a stand-in kind directly in
 * the registry and resolves it through the same generic functions those
 * three sites call — no AITerminal-specific code involved. The stand-in is not
 * `html`: that kind is real now and registered by the registry itself.
 */

import { render, screen } from '@testing-library/react'
import {
  getInlineAttachmentDescriptor,
  getInlineAttachmentDescriptorForFile,
  INLINE_ATTACHMENT_DESCRIPTORS,
  type InlineAttachment,
  type InlineAttachmentDescriptor,
} from '@/lib/attachments/inline-attachment-kinds'

type NotesInlineAttachment = { kind: 'notes'; url: string }

// Not typed as InlineAttachmentDescriptor<NotesInlineAttachment> on purpose: that
// generic requires T extends InlineAttachment, which does not know this kind.
// This shape stands in for a future kind the type system doesn't know about
// yet, cast below where it's pushed into the real registry.
const notesDescriptor = {
  kind: 'notes' as const,
  matchesFile: (file: File) => file.name.toLowerCase().endsWith('.notes'),
  formatContext: (attachment: NotesInlineAttachment) => `imported page: ${attachment.url}`,
  Pill: ({ attachment, onRemove }: { attachment: NotesInlineAttachment; onRemove: () => void }) => (
    <button onClick={onRemove}>{attachment.url}</button>
  ),
}

describe('a further registered kind needs no AITerminal call-site change', () => {
  beforeEach(() => {
    INLINE_ATTACHMENT_DESCRIPTORS.push(
      notesDescriptor as unknown as InlineAttachmentDescriptor<InlineAttachment>
    )
  })

  afterEach(() => {
    const index = INLINE_ATTACHMENT_DESCRIPTORS.indexOf(
      notesDescriptor as unknown as InlineAttachmentDescriptor<InlineAttachment>
    )
    INLINE_ATTACHMENT_DESCRIPTORS.splice(index, 1)
  })

  it('the file-matching site resolves the new kind by extension alone', () => {
    const file = new File(['hi'], 'board.notes', { type: 'text/plain' })

    const descriptor = getInlineAttachmentDescriptorForFile(file)

    expect(descriptor?.kind).toBe('notes')
  })

  it('the send-time formatContext site resolves the new kind by attachment.kind alone', () => {
    const attachment = { kind: 'notes', url: 'https://example.com/board' } as const

    const descriptor = getInlineAttachmentDescriptor(attachment.kind as InlineAttachment['kind'])

    expect(descriptor?.formatContext?.(attachment as never)).toBe(
      'imported page: https://example.com/board'
    )
  })

  it('the pill-render site resolves the new kind\'s Pill by attachment.kind alone', () => {
    const attachment = { kind: 'notes', url: 'https://example.com/board' } as const
    const onRemove = jest.fn()

    const descriptor = getInlineAttachmentDescriptor(attachment.kind as InlineAttachment['kind'])
    render(descriptor ? descriptor.Pill({ attachment: attachment as never, onRemove }) : null)

    expect(screen.getByText('https://example.com/board')).toBeInTheDocument()
  })

  it('the existing csv kind still resolves unchanged alongside the new one', () => {
    const descriptor = getInlineAttachmentDescriptor('csv')

    expect(descriptor?.kind).toBe('csv')
  })
})
