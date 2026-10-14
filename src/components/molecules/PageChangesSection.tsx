'use client'

/**
 * "Changes to this page" (board `Pond 06.15 Change log.dc.html`, frame
 * `s6o8`) — the log filtered to the open page, newest first, floating over
 * the canvas. Purely presentational: `rows` are derived by
 * `buildPageChangeRows` and the intents are raised to the connected
 * `PageChangesPanel`.
 *
 * The board draws no buttons on a row — a proposed or outdated diff is
 * answered on its own record page, not duplicated here. A row only opens
 * that record. This is a view of the log, not a second history.
 */

import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'
import { cn } from '@/lib/utils'
import type { PageChangeRow } from '@/lib/change-log/page-change-rows'
import { labelForStatus } from '@/lib/change-log/status'

export interface PageChangesSectionProps {
  rows: PageChangeRow[]
  loading?: boolean
  /** Open the record's own page (KAN-152). */
  onOpenRecord: (recordId: string) => void
  /** Open the change log filtered to this page. */
  onOpenChangeLog: () => void
  /** "⌥⌘H" on a Mac, "Ctrl+Alt+H" elsewhere — `platformShortcutLabel`. */
  shortcutLabel: string
  className?: string
}

const PANEL =
  'flex flex-col gap-[10px] rounded-[20px] p-[16px_12px] [background:var(--mn-panel-bg)] [border:var(--mn-panel-border)] [box-shadow:var(--mn-panel-shadow)] backdrop-blur-[24px] backdrop-saturate-[1.3]'

const ROW =
  'grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-[10px] rounded-[8px] px-2 py-[7px] text-left text-[12.5px] transition-colors hover:bg-mn-hover-fill'

const META = 'font-mono text-[10.5px] text-mn-text-secondary'

const PILL =
  'justify-self-start rounded-full px-2 py-0.5 ring-1 ring-inset ring-mn-mark-faint font-mono text-[10.5px] text-mn-text'

export function PageChangesSection({
  rows,
  loading = false,
  onOpenRecord,
  onOpenChangeLog,
  shortcutLabel,
  className,
}: PageChangesSectionProps) {
  return (
    <aside
      aria-label="Changes to this page"
      className={cn('fixed top-6 right-6 bottom-6 z-40 flex w-[300px] flex-col', PANEL, className)}
    >
      <div className="flex items-baseline justify-between px-2">
        <span className="text-[15px] font-medium">changes to this page</span>
        <span className={META}>{shortcutLabel}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!loading && rows.length === 0 && (
          <p className="px-2 font-mono text-[11px] text-mn-text-secondary">
            no changes to this page yet
          </p>
        )}

        {rows.map(({ record, time, label, fullLabel, status }) => (
          <button
            key={record.id}
            type="button"
            className={cn(ROW, FOCUS_VISIBLE_RING)}
            onClick={() => onOpenRecord(record.id)}
          >
            <span className={META}>{time}</span>
            <span className="truncate" title={fullLabel}>
              {label}
            </span>
            {status.kind === 'pill' ? (
              <span className={PILL}>{labelForStatus(status.text)}</span>
            ) : (
              <span className={META}>{labelForStatus(status.text)}</span>
            )}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onOpenChangeLog}
        className={cn(
          'self-start px-2 font-mono text-[11px] underline decoration-mn-mark-faint underline-offset-[3px]',
          FOCUS_VISIBLE_RING
        )}
      >
        open in change log
      </button>
    </aside>
  )
}
