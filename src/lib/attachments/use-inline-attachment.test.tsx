/**
 * Proves the ticket's criterion 2: a second attachment kind is a sibling
 * through the registry's own lookups, not a new branch at any of
 * AITerminal.tsx's three call sites (send-time formatContext, pill render,
 * file-matching in handlePickedFiles). Registers a second kind directly in
 * the registry and resolves it through the same generic functions those
 * three sites call — no AITerminal-specific code involved.
 */

import { render, screen } from '@testing-library/react'
import {
  getInlineAttachmentDescriptor,
  getInlineAttachmentDescriptorForFile,
  INLINE_ATTACHMENT_DESCRIPTORS,
  type InlineAttachment,
  type InlineAttachmentDescriptor,
} from '@/lib/attachments/inline-attachment-kinds'

type HtmlInlineAttachment = { kind: 'html'; url: string }

// Not typed as InlineAttachmentDescriptor<HtmlInlineAttachment> on purpose: that
// generic requires T extends InlineAttachment, which today has only one member
// (csv). This shape stands in for a future kind the type system doesn't know
// about yet, cast below where it's pushed into the real registry.
const htmlDescriptor = {
  kind: 'html' as const,
  matchesFile: (file: File) => file.name.toLowerCase().endsWith('.html'),
  formatContext: (attachment: HtmlInlineAttachment) => `imported page: ${attachment.url}`,
  Pill: ({ attachment, onRemove }: { attachment: HtmlInlineAttachment; onRemove: () => void }) => (
    <button onClick={onRemove}>{attachment.url}</button>
  ),
}

describe('a second registered kind needs no AITerminal call-site change', () => {
  beforeEach(() => {
    INLINE_ATTACHMENT_DESCRIPTORS.push(
      htmlDescriptor as unknown as InlineAttachmentDescriptor<InlineAttachment>
    )
  })

  afterEach(() => {
    const index = INLINE_ATTACHMENT_DESCRIPTORS.indexOf(
      htmlDescriptor as unknown as InlineAttachmentDescriptor<InlineAttachment>
    )
    INLINE_ATTACHMENT_DESCRIPTORS.splice(index, 1)
  })

  it('the file-matching site resolves the new kind by extension alone', () => {
    const file = new File(['<p>hi</p>'], 'board.html', { type: 'text/html' })

    const descriptor = getInlineAttachmentDescriptorForFile(file)

    expect(descriptor?.kind).toBe('html')
  })

  it('the send-time formatContext site resolves the new kind by attachment.kind alone', () => {
    const attachment = { kind: 'html', url: 'https://example.com/board' } as const

    const descriptor = getInlineAttachmentDescriptor(attachment.kind as InlineAttachment['kind'])

    expect(descriptor?.formatContext(attachment as never)).toBe(
      'imported page: https://example.com/board'
    )
  })

  it('the pill-render site resolves the new kind\'s Pill by attachment.kind alone', () => {
    const attachment = { kind: 'html', url: 'https://example.com/board' } as const
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
