/**
 * ReadChips (#97, S8) — the "read" row under every composer answer: what Pond
 * read before it answered, as quiet mono chips. Always present; the page the
 * question was asked from always leads (6a frame 1: the page you are on goes
 * with the question).
 *
 * Values read inline from `Pond 06.01` 6a frames 2–3 and PondComposer's
 * `readRow` / `readChip`: mono 10.5px at ink .68; each chip 2px 7px, radius 6,
 * an inset ring at ink .14, text at ink .8. A machine surface, so lowercase.
 */

export interface ReadChipsProps {
  read: string[]
  className?: string
}

export function ReadChips({ read, className = '' }: ReadChipsProps) {
  return (
    <div
      data-testid="read-chips"
      className={`flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] lowercase tracking-[0.02em] text-mn-text-secondary ${className}`}
    >
      <span>read</span>
      {read.map((label) => (
        <span
          key={label}
          data-testid="read-chip"
          className="rounded-[6px] px-[7px] py-[2px] text-mn-text-meta ring-1 ring-inset ring-mn-text/[0.14]"
        >
          {label}
        </span>
      ))}
    </div>
  )
}
