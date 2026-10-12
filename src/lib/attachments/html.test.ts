import {
  checkHtmlFileSize,
  describeFoundCounts,
  isHtmlAttachment,
  isHtmlSendBlockedOffline,
  readHtmlFile,
  readHtmlFileWithTimeout,
  startStoppableHtmlRead,
} from '@/lib/attachments/html'
import { MAX_HTML_BYTES } from '@/lib/import/limits'
import type { Counts } from '@/lib/import/types'

const ZERO_COUNTS: Counts = { headings: 0, text: 0, tables: 0, charts: 0, images: 0 }

describe('isHtmlAttachment', () => {
  it.each([
    ['running-log.html', undefined],
    ['running-log.htm', undefined],
    ['running-log', 'text/html'],
  ])('true for %s (type: %s)', (name, type) => {
    expect(isHtmlAttachment({ name, type })).toBe(true)
  })

  it.each([
    ['data.csv', undefined],
    ['photo.png', 'image/png'],
    ['notes.txt', 'text/plain'],
  ])('false for %s (type: %s)', (name, type) => {
    expect(isHtmlAttachment({ name, type })).toBe(false)
  })
})

describe('checkHtmlFileSize', () => {
  it('refuses a file whose size alone exceeds the limit, before any decode', () => {
    const size = MAX_HTML_BYTES + 1024 * 1024
    expect(checkHtmlFileSize({ size })).toEqual({ kind: 'too-large', size, limit: MAX_HTML_BYTES })
  })

  it('passes a file under the limit', () => {
    const size = MAX_HTML_BYTES - 1024 * 1024
    expect(checkHtmlFileSize({ size })).toBeNull()
  })
})

describe('readHtmlFile', () => {
  it('resolves ok for a small valid html file', async () => {
    const file = new File(['<html><body><p>hello world</p></body></html>'], 'running-log.html', {
      type: 'text/html',
    })
    const result = await readHtmlFile(file)
    expect(result.ok).toBe(true)
  })

  it('refuses an oversized file without reading it', async () => {
    const readAsText = jest.spyOn(FileReader.prototype, 'readAsText')
    const size = MAX_HTML_BYTES + 1024 * 1024
    const file = { name: 'running-log.html', type: 'text/html', size } as unknown as File

    const result = await readHtmlFile(file)

    expect(result).toEqual({ ok: false, error: { kind: 'too-large', size, limit: MAX_HTML_BYTES } })
    expect(readAsText).not.toHaveBeenCalled()
    readAsText.mockRestore()
  })
})

describe('readHtmlFileWithTimeout', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('resolves to unreadable if the read has not settled within the window', async () => {
    const readAsText = jest.spyOn(FileReader.prototype, 'readAsText').mockImplementation(() => {})
    const file = new File(['<html><body><p>hello</p></body></html>'], 'running-log.html', {
      type: 'text/html',
    })

    const resultPromise = readHtmlFileWithTimeout(file, 1000)
    jest.advanceTimersByTime(1000)
    const result = await resultPromise

    expect(result).toEqual({ ok: false, error: { kind: 'unreadable' } })
    readAsText.mockRestore()
  })
})

describe('describeFoundCounts', () => {
  it('lists every nonzero count, pluralized, joined with "and" before the last', () => {
    const found: Counts = { headings: 4, text: 1, tables: 2, charts: 1, images: 2 }
    expect(describeFoundCounts(found)).toBe(
      '4 headings, 1 text block, 2 tables, 1 chart and 2 images'
    )
  })

  it('omits zero counts', () => {
    const found: Counts = { ...ZERO_COUNTS, headings: 3, images: 1 }
    expect(describeFoundCounts(found)).toBe('3 headings and 1 image')
  })

  it('singularizes a count of one', () => {
    const found: Counts = { ...ZERO_COUNTS, tables: 1 }
    expect(describeFoundCounts(found)).toBe('1 table')
  })

  it('falls back to a holding phrase when nothing was found', () => {
    expect(describeFoundCounts(ZERO_COUNTS)).toBe('nothing found yet')
  })
})

describe('isHtmlSendBlockedOffline', () => {
  it('blocks a send when an html ask is pending and the connection is down', () => {
    expect(isHtmlSendBlockedOffline(true, false)).toBe(true)
  })

  it('allows a send when an html ask is pending and the connection is up', () => {
    expect(isHtmlSendBlockedOffline(true, true)).toBe(false)
  })

  it('allows a send when no html ask is pending (no attachment, or its read has settled), online or not', () => {
    expect(isHtmlSendBlockedOffline(false, false)).toBe(false)
    expect(isHtmlSendBlockedOffline(false, true)).toBe(false)
  })
})

describe('startStoppableHtmlRead', () => {
  it('never calls the callback once stopped, even after the read settles', async () => {
    const file = new File(['<html><body><p>hello</p></body></html>'], 'running-log.html', {
      type: 'text/html',
    })
    const onSettled = jest.fn()

    const { stop } = startStoppableHtmlRead(file, onSettled)
    stop()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(onSettled).not.toHaveBeenCalled()
  })

  it('calls the callback with the result when not stopped', async () => {
    const file = new File(['<html><body><p>hello</p></body></html>'], 'running-log.html', {
      type: 'text/html',
    })
    const onSettled = jest.fn()

    startStoppableHtmlRead(file, onSettled)
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ ok: true }))
  })

  it('clears the timeout timer and aborts the in-flight reader on stop', () => {
    jest.useFakeTimers()
    const readAsText = jest.spyOn(FileReader.prototype, 'readAsText').mockImplementation(() => {})
    const abort = jest.spyOn(FileReader.prototype, 'abort').mockImplementation(() => {})
    const file = new File(['<html><body><p>hello</p></body></html>'], 'running-log.html', {
      type: 'text/html',
    })
    const onSettled = jest.fn()

    const { stop } = startStoppableHtmlRead(file, onSettled, 1000)
    stop()

    expect(abort).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)

    jest.advanceTimersByTime(1000)
    expect(onSettled).not.toHaveBeenCalled()

    readAsText.mockRestore()
    abort.mockRestore()
    jest.useRealTimers()
  })
})
