import { formatBytes } from '@/components/molecules/HtmlAttachmentPill'

const MB = 1024 * 1024

// formatBytes divides by 1048576 (MiB-units); the mb branch rounds UP to one
// decimal and drops ".0" for an exact whole number (KAN-251 ruling, comment 10091).
describe('formatBytes', () => {
  it('a file of exactly 21.4 * 1048576 bytes reads 21.4 MB', () => {
    expect(formatBytes(21.4 * MB, 'upper')).toBe('21.4 MB')
  })

  it('a 22,440,059-byte file (21.4005 MiB-units) rounds up to 21.5 MB', () => {
    expect(formatBytes(22_440_059, 'upper')).toBe('21.5 MB')
  })

  it('a 21,000,059-byte file (20.03 MiB-units) reads 20.1 MB, never 20.0 or 21', () => {
    expect(formatBytes(21_000_059, 'upper')).toBe('20.1 MB')
  })

  it('exactly 20 MB stays whole: 20 MB, no ".0"', () => {
    expect(formatBytes(20 * MB, 'upper')).toBe('20 MB')
  })

  it('lowercases the unit by default', () => {
    expect(formatBytes(20 * MB)).toBe('20 mb')
  })

  it('a 51 kb file is unchanged, as are bytes', () => {
    expect(formatBytes(51 * 1024)).toBe('51 kb')
    expect(formatBytes(214 * 1024)).toBe('214 kb')
    expect(formatBytes(900)).toBe('900 b')
  })
})
