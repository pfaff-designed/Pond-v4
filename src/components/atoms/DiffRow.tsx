'use client'

/**
 * One line of a diff on the machine surface (#98, board 6c frame 2 and
 * PondMolecule `diff-line`): a `−` or `+` glyph column and the content, mono
 * 11px / 1.75, on a faint ground.
 *
 * Red is spent here and nowhere else: a removal's glyph, strike and ground are
 * the removal role (`#C55347`); an addition is ink on the ink .07 wash. The
 * removed content itself stays ink (.8 meta tier) struck through — the board
 * strikes with the red decoration, it does not paint the words red. Every
 * removal row carries `data-part="removal"` so a test can assert that no red
 * class sits outside one.
 */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function DiffRow({
  kind,
  children,
  className,
}: {
  kind: 'remove' | 'add'
  children: ReactNode
  className?: string
}) {
  const removal = kind === 'remove'
  return (
    <div
      data-part={removal ? 'removal' : 'addition'}
      className={cn(
        'flex gap-[10px] rounded-mn-hair px-2 py-[2px] font-mono text-[11px] leading-[1.75]',
        removal ? 'bg-mn-signal-removal/[0.12]' : 'bg-mn-text/[0.07]',
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          'w-2.5 flex-none font-medium',
          removal ? 'text-mn-signal-removal' : 'text-mn-text'
        )}
      >
        {removal ? '−' : '+'}
      </span>
      <div
        className={cn(
          'min-w-0 flex-1',
          removal && 'text-mn-text-meta line-through decoration-mn-signal-removal/60'
        )}
      >
        {children}
      </div>
    </div>
  )
}
