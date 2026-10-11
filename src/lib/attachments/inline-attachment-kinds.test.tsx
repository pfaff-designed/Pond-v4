/**
 * Proves the registry is actually keyed by kind: the csv entry resolves
 * both by kind and by filename, and its formatContext/Pill delegate to the
 * real parseCsv / formatCsvContext / CsvAttachmentPill rather than
 * reimplementing them.
 */

import { render, screen } from '@testing-library/react'
import {
  getInlineAttachmentDescriptor,
  getInlineAttachmentDescriptorForFile,
  type CsvInlineAttachment,
} from '@/lib/attachments/inline-attachment-kinds'
import { parseCsv, formatCsvContext } from '@/lib/csv/parse-csv'

function makeFile(name: string): File {
  return new File(['a,b\n1,2'], name, { type: 'text/csv' })
}

describe('inline attachment kinds registry', () => {
  it('resolves the csv entry by kind', () => {
    const descriptor = getInlineAttachmentDescriptor('csv')
    expect(descriptor?.kind).toBe('csv')
  })

  it('resolves the csv entry by filename', () => {
    const descriptor = getInlineAttachmentDescriptorForFile(makeFile('board.csv'))
    expect(descriptor?.kind).toBe('csv')
  })

  it('does not resolve a file of an unregistered kind', () => {
    const descriptor = getInlineAttachmentDescriptorForFile(makeFile('board.html'))
    expect(descriptor).toBeUndefined()
  })

  it('formatContext delegates to the real formatCsvContext', () => {
    const parsed = parseCsv('a,b\n1,2')
    if (!parsed.ok) throw new Error('fixture CSV failed to parse')
    const attachment: CsvInlineAttachment = { kind: 'csv', filename: 'board.csv', parsed }

    const descriptor = getInlineAttachmentDescriptor('csv')
    expect(descriptor?.formatContext(attachment)).toBe(formatCsvContext(parsed, 'board.csv'))
  })

  it('Pill renders the real CsvAttachmentPill with the attachment fields', () => {
    const parsed = parseCsv('a,b\n1,2')
    if (!parsed.ok) throw new Error('fixture CSV failed to parse')
    const attachment: CsvInlineAttachment = { kind: 'csv', filename: 'board.csv', parsed }

    const descriptor = getInlineAttachmentDescriptor('csv')
    const onRemove = jest.fn()
    render(descriptor ? descriptor.Pill({ attachment, onRemove }) : null)

    expect(screen.getByText('board.csv')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove board\.csv/i })).toBeInTheDocument()
  })
})
