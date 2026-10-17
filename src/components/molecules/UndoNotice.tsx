'use client'

/**
 * The ⌘Z/⇧⌘Z notice (KAN-139, board `Pond 06.15 Change log.dc.html` s6o5) —
 * the floating glass panel that says which page the step opened and what it
 * undid/redid. Purely presentational: `ShellCommands` owns `useUndoNotice()`
 * and passes the result straight through, the same organism/molecule split
 * as `PageChangesPanel`/`PageChangesSection`.
 */

import { toNoticeLines, type UndoNotice as UndoNoticeData } from '@/lib/terminal-focus'

export interface UndoNoticeProps {
  notice: UndoNoticeData | null
}

// z-[41]: the board draws this as the canvas's topmost layer (z-index 4 over its
// siblings), but `PageChangesSection`'s "changes to this page" panel sits in the
// same stacking context at z-40 — this has to outrank that, not just its drawn
// siblings, so it uses the same "one above the nearest z-40" value `NewPondSheet`
// already does for its own sheet-over-backdrop pair.
const PANEL =
  'absolute right-[28px] top-[28px] z-[41] w-[330px] flex flex-col gap-[10px] rounded-[20px] p-[14px] font-mono [background:var(--mn-panel-bg)] [border:var(--mn-panel-border)] [box-shadow:var(--mn-panel-shadow)] backdrop-blur-[24px] backdrop-saturate-[1.3]'

export function UndoNotice({ notice }: UndoNoticeProps) {
  if (notice === null) return null
  const lines = toNoticeLines(notice)
  return (
    <div role="status" aria-live="polite" className={PANEL}>
      <div className="flex items-baseline justify-between text-[11px]">
        <span>{lines.headLeft}</span>
        {lines.headRight !== null && <span className="text-mn-text-secondary">{lines.headRight}</span>}
      </div>
      <p className="text-[11.5px] leading-[1.5]">{lines.body}</p>
      <div className="flex items-baseline gap-[8px] text-[10.5px] text-mn-text-secondary">
        <span>{lines.footLeft}</span>
        {lines.footRight !== null && (
          <>
            <span>·</span>
            <span>{lines.footRight}</span>
          </>
        )}
      </div>
    </div>
  )
}
