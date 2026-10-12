/**
 * HTML attachment recognition (KAN-251) — the composer's html entry points
 * (＋, drop, ⌘K) all route a file through this check before `handleHtmlFile`.
 */
import { readHtml } from '@/lib/import/html'
import { MAX_HTML_BYTES } from '@/lib/import/limits'
import type { Counts, ReadHtmlError, ReadHtmlResult } from '@/lib/import/types'

const HTML_EXTENSIONS = new Set(['html', 'htm'])

/** True for a file whose name or declared type marks it as html. */
export function isHtmlAttachment(file: { name: string; type?: string }): boolean {
  const ext = file.name.toLowerCase().split('.').pop()
  if (ext && HTML_EXTENSIONS.has(ext)) return true
  return (file.type ?? '').toLowerCase() === 'text/html'
}

/**
 * Size check order (KAN-35's inherited comment): refuse on the file's own
 * `size` before it is ever read into a string, so a 21 MB file is never decoded.
 */
export function checkHtmlFileSize(file: { size: number }): ReadHtmlError | null {
  if (file.size > MAX_HTML_BYTES) {
    return { kind: 'too-large', size: file.size, limit: MAX_HTML_BYTES }
  }
  return null
}

/**
 * Shared by `readHtmlFile` and `startStoppableHtmlRead`: builds the read promise and
 * hands back the live `FileReader` (null for the pre-decode too-large short-circuit,
 * which never creates one) so a caller can `.abort()` it mid-flight.
 */
function startHtmlFileRead(file: File): {
  promise: Promise<ReadHtmlResult>
  reader: FileReader | null
} {
  const oversized = checkHtmlFileSize(file)
  if (oversized) return { promise: Promise.resolve({ ok: false, error: oversized }), reader: null }

  const reader = new FileReader()
  const promise = new Promise<ReadHtmlResult>((resolve) => {
    reader.onload = () => {
      const raw = reader.result
      resolve(readHtml(typeof raw === 'string' ? raw : ''))
    }
    reader.onerror = () => resolve({ ok: false, error: { kind: 'unreadable' } })
    reader.readAsText(file)
  })
  return { promise, reader }
}

/**
 * Reads and parses an attached html file. The size check runs on `file.size`
 * before `readAsText` is ever called, so an oversized file is refused without
 * being decoded (the ticket's "Size check order").
 */
export function readHtmlFile(file: File): Promise<ReadHtmlResult> {
  return startHtmlFileRead(file).promise
}

/**
 * The reader's own worst case (KAN-35's inherited comment: ~30s for a 20 MB file of
 * tiny paragraphs). 35s gives that case room to land before the timeout preempts it.
 */
export const HTML_READ_TIMEOUT_MS = 35_000

/**
 * Shared by `readHtmlFileWithTimeout` and `startStoppableHtmlRead`: races the read
 * against the timeout and hands back both the timer and the reader so a caller can
 * cancel either mid-flight.
 */
function startHtmlFileReadWithTimeout(
  file: File,
  timeoutMs: number
): {
  promise: Promise<ReadHtmlResult>
  reader: FileReader | null
  timer: ReturnType<typeof setTimeout>
} {
  const { promise: readPromise, reader } = startHtmlFileRead(file)
  let timer!: ReturnType<typeof setTimeout>
  const promise = new Promise<ReadHtmlResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: { kind: 'unreadable' } }), timeoutMs)
    readPromise.then((result) => {
      clearTimeout(timer)
      resolve(result)
    })
  })
  return { promise, reader, timer }
}

/**
 * `readHtmlFile` is synchronous once `readAsText` fires its `onload` — nothing can
 * interrupt `readHtml` mid-parse. This races it against a timer instead, so a read
 * that never settles lands on the frame 6 `unreadable` failure rather than hanging
 * the composer forever.
 */
export function readHtmlFileWithTimeout(
  file: File,
  timeoutMs: number = HTML_READ_TIMEOUT_MS
): Promise<ReadHtmlResult> {
  return startHtmlFileReadWithTimeout(file, timeoutMs).promise
}

/**
 * `unified().parse()` inside `readHtml` can't be aborted mid-call, so a stop
 * can't kill the read — it can only make its eventual settlement a no-op.
 * That is Esc's "nothing has been made, so there is nothing to undo": no
 * callback fires, so the caller never sees a result to record or revert.
 * `.stop()` also clears the timeout timer and aborts the in-flight `FileReader`,
 * so Esc doesn't leave either running for up to `HTML_READ_TIMEOUT_MS`.
 */
export function startStoppableHtmlRead(
  file: File,
  onSettled: (result: ReadHtmlResult) => void,
  timeoutMs: number = HTML_READ_TIMEOUT_MS
): { stop: () => void } {
  let stopped = false
  const { promise, reader, timer } = startHtmlFileReadWithTimeout(file, timeoutMs)

  promise.then((result) => {
    if (!stopped) onSettled(result)
  })

  return {
    stop: () => {
      stopped = true
      clearTimeout(timer)
      reader?.abort()
    },
  }
}

/**
 * Frame 6's offline failure: asking Pond about an attached html file is a
 * network call, so a chip pick or a typed reply while offline must not send —
 * the file stays attached and nothing goes out until the connection is back.
 * `isHtmlAskPending` is an attachment with no read running or settled: once a
 * read has started or settled (ok or failed) there is no ask about the file
 * left to block, and a send is an ordinary one. Takes `isOnline` as a
 * parameter (rather than reading `navigator.onLine` itself) so the branch is a
 * plain, synchronously testable predicate.
 */
export function isHtmlSendBlockedOffline(isHtmlAskPending: boolean, isOnline: boolean): boolean {
  return isHtmlAskPending && !isOnline
}

const COUNT_ORDER: readonly (keyof Counts)[] = ['headings', 'text', 'tables', 'charts', 'images']

const COUNT_LABELS: Record<keyof Counts, [singular: string, plural: string]> = {
  headings: ['heading', 'headings'],
  text: ['text block', 'text blocks'],
  tables: ['table', 'tables'],
  charts: ['chart', 'charts'],
  images: ['image', 'images'],
}

/**
 * The frame-2 counts line (KAN-251): what reading has found so far, from `found`.
 * A zero count is omitted rather than read as "0 tables"; an empty `found` falls
 * back to a holding phrase rather than rendering nothing.
 */
export function describeFoundCounts(found: Counts): string {
  const parts = COUNT_ORDER.filter((key) => found[key] > 0).map((key) => {
    const count = found[key]
    const [singular, plural] = COUNT_LABELS[key]
    return `${count} ${count === 1 ? singular : plural}`
  })

  if (parts.length === 0) return 'nothing found yet'
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
