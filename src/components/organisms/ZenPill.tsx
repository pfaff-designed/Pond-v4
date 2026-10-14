'use client'

/**
 * The zen pill (`Pond 02 Component library.dc.html` 2t, "zen pill · organism ·
 * zen only"; `Pond 06.17` 6q frames 3/4/5/8/9) — the one floating control left
 * once zen hides the rail, breadcrumb and composer: ask pond, editor, attach,
 * type, ground, leave. Nothing else (2t).
 *
 * `editor`, `attach`, `type` and `ground` are real, focusable buttons with
 * `aria-disabled` and no `onClick` — never the `disabled` attribute, which
 * would drop them from the tab order — until their own tickets wire them.
 */

import { useZen } from '@/lib/layout/zen'
import { requestComposerToggle, useComposerOpen } from '@/lib/terminal-focus'

type ZenPillItemId = 'ask-pond' | 'editor' | 'attach' | 'type' | 'ground' | 'leave'

interface ZenPillItem {
  id: ZenPillItemId
  /** The item's accessible name. */
  label: string
  enabled: boolean
  dividerAfter?: true
}

/** 2t's own order: ask pond · divider · editor · attach · type · ground · divider · leave. */
const ZEN_PILL_ITEMS: readonly ZenPillItem[] = [
  { id: 'ask-pond', label: 'ask pond', enabled: true, dividerAfter: true },
  { id: 'editor', label: 'editor', enabled: false },
  { id: 'attach', label: 'attach', enabled: false },
  { id: 'type', label: 'type', enabled: false },
  { id: 'ground', label: 'ground', enabled: false, dividerAfter: true },
  { id: 'leave', label: 'leave', enabled: true },
]

/** Each item's mark — the inline svg paths copied from 2t, verbatim. */
const Mark = ({ id }: { id: ZenPillItemId }) => {
  switch (id) {
    case 'ask-pond':
      return (
        <svg width="15" height="15" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
          <path d="M7 7 L12.74 5.25 A6 6 0 1 1 8.75 1.26 Z" />
        </svg>
      )
    case 'editor':
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M10.6 2.6l2.8 2.8-7.6 7.6-3.6.8.8-3.6z" />
          <path d="M9.2 4l2.8 2.8" />
        </svg>
      )
    case 'attach':
      return (
        <svg
          width="15"
          height="15"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M9.8 5.2 5.9 9.1a1.5 1.5 0 0 1-2.1-2.1l4.3-4.3a2.5 2.5 0 0 1 3.5 3.5L7.2 10.6" />
        </svg>
      )
    case 'type':
      return (
        <span className="font-serif text-[17px] leading-none font-extralight" aria-hidden>
          Aa
        </span>
      )
    case 'ground':
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1.6v1.4M8 13v1.4M1.6 8H3M13 8h1.4M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1" />
        </svg>
      )
    case 'leave':
      return (
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
          <span className="ml-[6px] font-mono text-[10.5px] text-mn-text-meta" aria-hidden>
            esc
          </span>
        </>
      )
  }
}

const ITEM_CLASS =
  'box-border inline-flex h-[36px] min-w-[36px] items-center justify-center rounded-full px-[10px]'

/**
 * 2t's own glass: `.92 → .76`, shadow `.16` — the board wins over `--mn-glass-*`
 * (`.86 → .64`, `.14`). Ink ground (6q f10), matching `GLYPH_GLASS_SURFACE`'s own
 * pattern of literal `dark:` overrides rather than the `.mn-glass` tokens:
 * the border is `--mn-glass-border`'s dark value verbatim (`rgba(250,249,239,.09)`)
 * — same value, kept literal so the recipe isn't half-token, half-literal; the
 * background and shadow are the board's own flat values, neither matching
 * `--mn-glass-bg`/`--mn-glass-shadow`'s dark gradient/inset-shadow pair.
 */
const PILL_GLASS =
  'rounded-full border border-white/90 bg-[linear-gradient(160deg,rgba(255,255,255,.92),rgba(255,255,255,.76))] shadow-[inset_0_1px_0_rgba(255,255,255,.7),0_20px_54px_rgba(40,34,24,.16)] backdrop-blur-[24px] backdrop-saturate-[1.3] dark:border-[rgba(250,249,239,.09)] dark:bg-none dark:bg-[rgba(48,49,42,.9)] dark:shadow-[0_20px_54px_rgba(0,0,0,.45)]'

/** Mounted only while zen is on (`WorkspaceShell.tsx`); fixed and centred 30px off the shell's bottom. */
export function ZenPill() {
  const { zen, leaveZen, composerAsked, askComposer, closeComposerAsk } = useZen()
  const composerOpen = useComposerOpen()
  if (!zen) return null

  const handleClick = (id: ZenPillItemId) => {
    if (id === 'leave') leaveZen()
    if (id === 'ask-pond') {
      // The composer's own open/closed state starts open regardless of zen,
      // so the mark only toggles it when that disagrees with the new ask.
      if (composerAsked) {
        closeComposerAsk()
        if (composerOpen) requestComposerToggle()
      } else {
        askComposer()
        if (!composerOpen) requestComposerToggle()
      }
    }
  }

  return (
    <div
      data-part="zen-pill"
      className={`fixed bottom-[30px] left-1/2 z-30 flex w-max -translate-x-1/2 items-center gap-[4px] p-[5px] ${PILL_GLASS}`}
    >
      {ZEN_PILL_ITEMS.flatMap((item) => {
        const active = item.id === 'ask-pond' && composerAsked
        return [
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-pressed={item.id === 'ask-pond' ? composerAsked : undefined}
            aria-disabled={item.enabled ? undefined : true}
            onClick={item.enabled ? () => handleClick(item.id) : undefined}
            className={`${ITEM_CLASS} ${
              active
                ? 'bg-mn-text text-raw-paper dark:text-raw-ink'
                : item.enabled
                  ? 'text-mn-text hover:bg-mn-text/[0.07] active:bg-mn-text/[0.07]'
                  : 'text-mn-text-secondary'
            }`}
          >
            <Mark id={item.id} />
          </button>,
          item.dividerAfter && (
            <span
              key={`${item.id}-divider`}
              aria-hidden
              className="h-[18px] w-px bg-[rgba(27,29,20,.12)] dark:bg-[rgba(250,249,239,.14)]"
            />
          ),
        ]
      })}
    </div>
  )
}
