/**
 * The composer's three window controls — close · minimize · maximize, left to
 * right, at the top left of the card (`TerminalDrawer`'s window bar). One set
 * per composer. They replace `ComposerCloseButton`'s lone ×.
 *
 * The board (`PondComposer.dc.html`) draws only the grip and the single close
 * ×; it has no minimize/maximize marks, so these two are hand-drawn to match
 * the close mark's own box and stroke (PROJECT_RULES § Icons: functional
 * marks are inline SVG, stroke-width 1.4, round caps) rather than borrowed
 * from an icon library.
 */

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface ComposerWindowControlsProps {
  /** Swaps the last control's label/icon between maximize and restore. */
  maximized: boolean
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
  className?: string
}

const buttonClass =
  'flex size-8 cursor-pointer items-center justify-center hover:text-mn-text md:size-[18px]'

function WindowControlIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export function ComposerWindowControls({
  maximized,
  onMinimize,
  onMaximize,
  onClose,
  className,
}: ComposerWindowControlsProps) {
  return (
    <div data-part="composer-window-controls" className={cn('flex items-center', className)}>
      <button
        type="button"
        onClick={onClose}
        aria-label="close"
        title="close"
        className={buttonClass}
      >
        <WindowControlIcon>
          <path d="M3 3l6 6M9 3l-6 6" />
        </WindowControlIcon>
      </button>
      <button
        type="button"
        onClick={onMinimize}
        aria-label="minimize"
        title="minimize"
        className={buttonClass}
      >
        <WindowControlIcon>
          <path d="M3 9h8" />
        </WindowControlIcon>
      </button>
      <button
        type="button"
        onClick={onMaximize}
        aria-label={maximized ? 'restore' : 'maximize'}
        title={maximized ? 'restore' : 'maximize'}
        className={buttonClass}
      >
        <WindowControlIcon>
          {maximized ? (
            <>
              <path d="M5.5 3H11v5.5" />
              <rect x="3" y="5.5" width="5.5" height="5.5" rx="0.6" />
            </>
          ) : (
            <rect x="3" y="3" width="8" height="8" rx="0.6" />
          )}
        </WindowControlIcon>
      </button>
    </div>
  )
}
