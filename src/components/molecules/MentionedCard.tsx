/**
 * MentionedCard (#97, `Pond 06.01` 6a frame 5) — the one thing Pond adds to a page
 * made from a streamed answer: a card listing the pages that answer mentioned.
 * The prose moves across word for word; this sits under it.
 *
 * It is a CARD, not prose and not a bullet list: paper separated by shadow, with
 * its own eyebrow and a row per mention (a `ref: null` mention is a plain-text
 * row). Read inline from the frame's markup:
 * card `#FAF9EF` paper (`bg-mn-card` — the same sheet as the ground in light,
 * the lifted card on dark), radius 20 (`rounded-mn-card`), padding 16px 18px,
 * column gap 11, the standard card shadow (`shadow-mn-card` =
 * `0 1px 2px rgba(40,34,24,.04), 0 8px 24px rgba(40,34,24,.06)`) and **no border**
 * — paper-not-frames, PROJECT_RULES § Design language.
 *
 * Each row is three parts on one baseline: the page-kind dot (7px, 2px radius,
 * ink .5 — the frame's value, and `KindDot`'s default, so this is the existing
 * mark and not a fourth copy of it), the title at 14px in full ink, and the note
 * at 12.5px ink .68. Rows carry a hairline rule (`border-mn-hair` = ink .055) and
 * 9px of space under the text, exactly as the frame does — including the last row.
 *
 * The eyebrow is the PAGE eyebrow (sans), because the card lives on a page and not
 * in the composer — PROJECT_RULES § two registers, split by medium.
 *
 * A note is Pond saying WHY a page is mentioned ("the one everything waits on").
 * Notes arrive with the proposal (KAN-172); this renders a note when there is
 * one and lays out correctly when there is not, so no row is ever half-drawn.
 */

import { KindDot } from '@/components/atoms/PondAtom'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import type { MentionedPage } from '@/lib/pages/mentioned'
import { cn } from '@/lib/utils'

/** The card's own eyebrow (Pond's word for the list — `Pond 06.01` 6a frame 5). */
export const MENTIONED_LABEL = 'mentioned'

export interface MentionedCardProps {
  mentioned: MentionedPage[]
  /** Open the row's own page — only called for a row whose `ref` resolves. */
  onOpenMention?: (ref: string, title: string) => void
  className?: string
}

export function MentionedCard({ mentioned, onOpenMention, className }: MentionedCardProps) {
  if (mentioned.length === 0) return null

  return (
    <section
      data-part="mentioned"
      aria-label={MENTIONED_LABEL}
      className={cn(
        'bg-mn-card shadow-mn-card rounded-mn-card flex flex-col gap-[11px] px-[18px] py-4 font-sans',
        className
      )}
    >
      <span className={pageEyebrowClass}>{MENTIONED_LABEL}</span>
      {mentioned.map((m, i) => {
        const ref = m.ref
        return (
          <div
            key={`${ref ?? m.title}-${i}`}
            data-part="mentioned-row"
            className="border-mn-hair flex items-baseline gap-3 border-b pb-[9px] text-[14px]"
          >
            <KindDot />
            <span data-part="mentioned-title" className="min-w-0 flex-1 text-foreground">
              {ref ? (
                <button
                  type="button"
                  onClick={() => onOpenMention?.(ref, m.title)}
                  className="underline-offset-2 transition-colors hover:text-mn-text-secondary hover:underline"
                >
                  {m.title}
                </button>
              ) : (
                m.title
              )}
            </span>
            {m.note && (
              <span data-part="mentioned-note" className="text-mn-text-secondary text-[12.5px]">
                {m.note}
              </span>
            )}
          </div>
        )
      })}
    </section>
  )
}
