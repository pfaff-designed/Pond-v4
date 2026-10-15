/**
 * The composer's one close mark (`PondComposer.dc.html`'s `iconBtnSm` ×, used by
 * both the thread head and a one-turn answer's actions row) — kept in one place
 * so the mark exists once rather than twice per card.
 */

import { cn } from '@/lib/utils'

export interface ComposerCloseButtonProps {
  onClick: () => void
  className?: string
}

export function ComposerCloseButton({ onClick, className }: ComposerCloseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close composer"
      className={cn(
        'flex size-8 cursor-pointer items-center justify-center hover:text-mn-text md:size-[18px]',
        className
      )}
    >
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
        <path d="M3 3l6 6M9 3l-6 6" />
      </svg>
    </button>
  )
}
