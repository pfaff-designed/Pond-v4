'use client'

/**
 * A child-page card on an overview surface — the whole card is one calm click
 * target: muted area dot + title, a display-face stat, a quiet mono caption.
 */

export function OverviewCard({
  title,
  stat,
  sub,
  accent,
  onOpen,
}: {
  title: string
  stat: string
  sub: string
  accent: string
  onOpen: () => void
}) {
  return (
    <button
      onClick={onOpen}
      className="group w-full text-left bg-card border border-border rounded-[20px] px-[18px] py-4 cursor-pointer transition-all duration-200 shadow-[0_1px_2px_rgba(40,34,24,0.04),0_8px_24px_rgba(40,34,24,0.06)] hover:-translate-y-px hover:shadow-[0_2px_4px_rgba(40,34,24,0.05),0_12px_30px_rgba(40,34,24,0.09)]"
    >
      <span className="flex flex-col gap-2.5">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="w-[7px] h-[7px] rounded-[2px] flex-shrink-0"
            style={{ background: accent }}
          />
          <span className="text-[13.5px] font-semibold text-foreground truncate">{title}</span>
          <span
            aria-hidden
            className="ml-auto text-[15px] text-press-faint group-hover:text-press-accent transition-colors duration-200"
          >
            ›
          </span>
        </span>
        <span className="font-display text-[30px] leading-none text-foreground tracking-[-0.01em]">
          {stat}
        </span>
        <span className="font-mono text-[11.5px] text-press-muted">{sub}</span>
      </span>
    </button>
  )
}
