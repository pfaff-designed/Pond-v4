'use client'

/**
 * FirstRunHints (`Pond 06.04` 6d frame 2) — the empty shell's heading, line and
 * three suggestion cards, over the frame's own 4-line ASCII pond (`opacity`
 * `.14`, `AsciiPondBackground`'s shared timings), filling and centered within
 * `DocumentPanel`'s content pane with the frame's own `56px 0 150px` padding —
 * the same box the ASCII layer and the centered content both draw against in
 * 6d f2. This component draws the frame and wires a card's own copy into the
 * composer; `DocumentPanel` only owns the mount condition (root, flag null).
 *
 * Values read straight off the frame: heading `PP Editorial New` italic 200,
 * 54px/1.12, `-.03em` tracking, `max-width:20ch`; line 15px/1.6 ink .68,
 * `max-width:46ch`; column gap 30px; cards row gap 12px (padding-top 6px),
 * each card 210px, `bg-mn-card`/`rounded-mn-card`/`shadow-mn-card` (the board's
 * `#FAF9EF` paper + `0 1px 2px …, 0 8px 24px …` pair are already the exact
 * tokens — `MentionedCard`'s comment works through the same match), padding
 * 16px 18px, column gap 8; card title 15px/500 with a 14px glyph at gap 9;
 * card line 13px/1.45 ink .68.
 *
 * The frame names each card's title and line but no separate "prompt" copy, so
 * choosing a card reads the two as one sentence into `requestTerminalFocus` —
 * the same focus signal the cover's carried `?ask=` and the palette's "ask pond
 * about" both use — and creates nothing: no page, record or change-log row.
 */

import { Icon } from '@/components/atoms/Icon'
import { AsciiPondBackground } from '@/components/molecules/AsciiPondBackground'
import { requestTerminalFocus } from '@/lib/terminal-focus'
import { cn } from '@/lib/utils'

interface FirstRunCard {
  readonly title: string
  readonly line: string
  readonly glyph: string
}

const FIRST_RUN_CARDS: readonly FirstRunCard[] = [
  { title: 'a project', line: 'something with a finish line', glyph: 'star-01' },
  { title: 'a collection', line: 'a list that keeps growing', glyph: 'ring' },
  { title: 'a journal', line: 'one entry at a time', glyph: 'house' },
]

/** The empty shell's own 4-line ASCII block (6d f2) — shorter than the cover's 5. */
const EMPTY_SHELL_ASCII_LINES: readonly string[] = [
  ' ·≈∾-···  ···~≈∾·                  ··~≈∾-·   ····~·  ',
  '~≈∾··  ··∿··~·                  ·∿··~≈·   ·—·∿··   ··',
  '  ·—·∿···   ··~≈∾·                 ····~≈∾-·  ·∿··~·  ',
  '·∿··~≈·   ·—·∿···                  ·—·∿···   ·≈∾-··  ',
]

export const FIRST_RUN_HEADING = 'What are you thinking about?'
export const FIRST_RUN_LINE =
  'Say it in a sentence. Pond makes a page out of the answer, and everything after that is editing.'

export interface FirstRunHintsProps {
  className?: string
}

export function FirstRunHints({ className }: FirstRunHintsProps) {
  const handleCard = (card: FirstRunCard) => {
    requestTerminalFocus(`${card.title}, ${card.line}`)
  }

  return (
    <div
      data-part="first-run-hints"
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center gap-[30px] pb-[150px] pt-[56px] text-center',
        className
      )}
    >
      <AsciiPondBackground lines={EMPTY_SHELL_ASCII_LINES} opacity={0.14} className="-z-10" />
      <h1 className="m-0 max-w-[20ch] font-serif text-[54px] font-extralight italic leading-[1.12] tracking-[-0.03em] text-mn-text">
        {FIRST_RUN_HEADING}
      </h1>
      <p className="m-0 max-w-[46ch] text-[15px] leading-[1.6] text-mn-text-secondary">
        {FIRST_RUN_LINE}
      </p>
      <div className="flex flex-wrap justify-center gap-3 pt-1.5">
        {FIRST_RUN_CARDS.map((card) => (
          <button
            key={card.title}
            type="button"
            onClick={() => handleCard(card)}
            className="bg-mn-card shadow-mn-card rounded-mn-card flex w-[210px] flex-col gap-2 px-[18px] py-4 text-left"
          >
            <span className="flex items-center gap-[9px] text-[15px] font-medium text-mn-text">
              <Icon name={card.glyph} size={14} />
              {card.title}
            </span>
            <span className="text-[13px] leading-[1.45] text-mn-text-secondary">{card.line}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
