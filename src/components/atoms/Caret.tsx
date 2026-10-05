import { cn } from '@/lib/utils'

export interface CaretProps {
  /** Rotation and colour live with the caller: `rotate-90` points it down. */
  className?: string
}

/** The rail's 9×9 caret, pointing right at rest; the tree rows and the pond switcher share it. */
export function Caret({ className }: CaretProps) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 9 9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn(
        'flex-none transition-transform duration-[var(--motion-settle)] ease-[var(--ease-mn)]',
        className
      )}
    >
      <path d="M3.5 2 L7 5 L3.5 8" />
    </svg>
  )
}
