'use client'

/**
 * The rail's minimize control. One button, two places: in the rail head while
 * the rail is open, and in the rail's corner once it is hidden. ⌘\ and the
 * palette call the same store.
 */

import { ariaKeyshortcuts, useApplePlatform } from '@/lib/shell-commands'

function RailIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="flex-none"
    >
      <rect x="1.6" y="2.2" width="10.8" height="9.6" rx="1.4" />
      <path d="M5.4 2.2v9.6" />
    </svg>
  )
}

export function RailToggle({
  minimized,
  onClick,
}: {
  minimized: boolean
  onClick: () => void
}) {
  const apple = useApplePlatform()
  const label = minimized ? 'show rail' : 'minimize rail'
  return (
    <button
      type="button"
      data-part="rail-toggle"
      aria-label={label}
      aria-keyshortcuts={ariaKeyshortcuts('mod+\\', apple)}
      onClick={onClick}
      className="inline-flex size-11 flex-none items-center justify-center rounded-[8px] text-mn-text-secondary outline-none hover:bg-mn-text/[0.07] hover:text-mn-text focus-visible:ring-[1.4px] focus-visible:ring-inset focus-visible:ring-mn-text/50"
    >
      <RailIcon />
    </button>
  )
}
