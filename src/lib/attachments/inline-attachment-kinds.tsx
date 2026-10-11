'use client'

/**
 * Kind-keyed descriptor registry for inline attachments (the seam
 * useInlineAttachment holds). A new kind (e.g. HTML, #7k) adds one entry
 * here instead of a second branch at every AITerminal.tsx call site.
 */

import type { ReactElement } from 'react'
import { CsvAttachmentPill } from '@/components/molecules/CsvAttachmentPill'
import { formatCsvContext, type CsvParseOk } from '@/lib/csv/parse-csv'

export type CsvInlineAttachment = { kind: 'csv'; filename: string; parsed: CsvParseOk }

export type InlineAttachment = CsvInlineAttachment

export interface InlineAttachmentPillProps<T extends InlineAttachment> {
  attachment: T
  onRemove: () => void
}

export interface InlineAttachmentDescriptor<T extends InlineAttachment> {
  kind: T['kind']
  matchesFile: (file: File) => boolean
  formatContext: (attachment: T) => string
  Pill: (props: InlineAttachmentPillProps<T>) => ReactElement
}

const csvDescriptor: InlineAttachmentDescriptor<CsvInlineAttachment> = {
  kind: 'csv',
  matchesFile: (file) => file.name.toLowerCase().endsWith('.csv'),
  formatContext: (attachment) => formatCsvContext(attachment.parsed, attachment.filename),
  Pill: ({ attachment, onRemove }) => (
    <CsvAttachmentPill
      filename={attachment.filename}
      rowCount={attachment.parsed.totalRows}
      onRemove={onRemove}
    />
  ),
}

const INLINE_ATTACHMENT_DESCRIPTORS: InlineAttachmentDescriptor<InlineAttachment>[] = [csvDescriptor]

export function getInlineAttachmentDescriptor(
  kind: InlineAttachment['kind']
): InlineAttachmentDescriptor<InlineAttachment> | undefined {
  return INLINE_ATTACHMENT_DESCRIPTORS.find((descriptor) => descriptor.kind === kind)
}

export function getInlineAttachmentDescriptorForFile(
  file: File
): InlineAttachmentDescriptor<InlineAttachment> | undefined {
  return INLINE_ATTACHMENT_DESCRIPTORS.find((descriptor) => descriptor.matchesFile(file))
}
