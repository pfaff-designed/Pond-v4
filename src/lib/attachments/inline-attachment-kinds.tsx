'use client'

/**
 * Kind-keyed descriptor registry for inline attachments (the seam
 * useInlineAttachment holds). A new kind (e.g. HTML, #7k) adds one entry
 * here instead of a second branch at every AITerminal.tsx call site.
 */

import type { ReactElement } from 'react'
import { CsvAttachmentPill } from '@/components/molecules/CsvAttachmentPill'
import { HtmlAttachmentPill } from '@/components/molecules/HtmlAttachmentPill'
import { isHtmlAttachment } from '@/lib/attachments/html'
import { formatCsvContext, type CsvParseOk } from '@/lib/csv/parse-csv'

export type CsvInlineAttachment = { kind: 'csv'; filename: string; parsed: CsvParseOk }

export type HtmlInlineAttachment = { kind: 'html'; filename: string; size: number }

export type InlineAttachment = CsvInlineAttachment | HtmlInlineAttachment

export interface InlineAttachmentPillProps<T extends InlineAttachment> {
  attachment: T
  onRemove: () => void
}

export interface InlineAttachmentDescriptor<T extends InlineAttachment> {
  kind: T['kind']
  matchesFile: (file: File) => boolean
  /** Absent for kinds that send no file context: html is read locally and
   *  nothing is sent until the person asks. Method syntax, not a property:
   *  the registry holds descriptors of different T in one array, which needs
   *  bivariant parameters. */
  formatContext?(attachment: T): string
  Pill(props: InlineAttachmentPillProps<T>): ReactElement
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

const htmlDescriptor: InlineAttachmentDescriptor<HtmlInlineAttachment> = {
  kind: 'html',
  matchesFile: isHtmlAttachment,
  Pill: ({ attachment, onRemove }) => (
    <HtmlAttachmentPill filename={attachment.filename} onRemove={onRemove} />
  ),
}

export const INLINE_ATTACHMENT_DESCRIPTORS: InlineAttachmentDescriptor<InlineAttachment>[] = [
  csvDescriptor,
  htmlDescriptor,
]

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
