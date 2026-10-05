/**
 * The 15px checkbox of a record (`Pond 02` 2u): an inset 1.4px ring at the faint mark
 * tint when open, filled ink with a tick when done. Drawn by the list's rows and the
 * record peek's head. Without `onToggle` it is inert.
 */
export function RecordCheck({
  done,
  label,
  onToggle,
}: {
  done: boolean
  label: string
  onToggle?: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      data-done={done || undefined}
      disabled={!onToggle}
      onClick={onToggle}
      className={[
        'flex size-[15px] flex-none items-center justify-center rounded-[4px] outline-offset-2 focus-visible:outline-[1.5px] focus-visible:outline-mn-text/50 focus-visible:outline-solid',
        done
          ? 'bg-mn-text text-raw-paper dark:text-raw-ink'
          : 'ring-[1.4px] ring-mn-mark-faint ring-inset',
        onToggle ? 'cursor-pointer' : 'cursor-default',
      ].join(' ')}
    >
      {done && (
        <svg
          width="9"
          height="9"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2 5.2 4.2 7.4 8 2.8" />
        </svg>
      )}
    </button>
  )
}
