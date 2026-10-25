'use client'

import { cn } from '@/lib/utils'
import { Caret } from '@/components/atoms/Caret'
import type { ModuleViewProps } from '../types'
import type { ToggleBlock } from './schema'
import { StaticProse } from '../text/static-prose'
import { TextView } from '../text/view'
import type { TextBlock } from '../text/schema'
import { BlockRowProvider, type BlockRowValue } from '../block-row-context'
import { SlashLineContext } from '../text/slash-line'

/**
 * The ▸ button's own width (9px, `Caret.tsx`) plus the gap beside it (6px,
 * `gap-1.5`) — the body sits under the summary's first word, not under the ▸,
 * matching `Rail.tsx`'s own caret/row gap (KAN-480's own app-over-board choice,
 * no board draws a toggle).
 */
const TOGGLE_BODY_INDENT = 15

/**
 * The summary and body editors' own row context (KAN-480, build item 4 of 7):
 * every `stepOut` call from a `TextEditor`'s Enter key stops HERE, not at the
 * outer canvas row it is nested inside — `/toggle`'s summary/body are the
 * block's own content, not two more page blocks. Enter's real behaviour
 * (split the summary into the body, add a body line) is build item 5's job;
 * until then it is simply absorbed.
 */
const TOGGLE_FIELD_ROW: BlockRowValue = { selected: false, stepOut: () => {} }

/**
 * A hosted `TextView`, isolated from the page's own row/slash plumbing: its own
 * `BlockRowProvider` (so its `stepOut` never reaches the canvas row this toggle
 * is a row of) and `SlashLineContext.Provider value={null}` (so `/` inside the
 * summary or body opens no menu — a toggle's own content is plain text, never
 * another block-minting surface).
 */
function ToggleField({
  block,
  onChange,
  autofocus,
}: {
  block: TextBlock
  onChange: (next: TextBlock) => void
  autofocus?: boolean
}) {
  return (
    <SlashLineContext.Provider value={null}>
      <BlockRowProvider value={TOGGLE_FIELD_ROW}>
        <TextView data={block} editable onChange={onChange} autofocus={autofocus} />
      </BlockRowProvider>
    </SlashLineContext.Provider>
  )
}

/**
 * The toggle block (KAN-480 slice 1). Read-only (`editable` absent/false) is
 * static prose both ways, folded by `data.folded` alone (build item 3). Editable
 * hosts the summary and body as two `TextView`s (build item 4) — their
 * `onChange` maps straight back into this block's `content`/`body`; the ▸ click
 * and Enter's split/continue behaviour land in later items of this ticket.
 */
export function ToggleView({ data, editable, onChange, autofocus }: ModuleViewProps<ToggleBlock>) {
  const folded = data.folded ?? false
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          aria-expanded={!folded}
          className="mt-[0.3em] grid w-[9px] flex-none place-items-center text-mn-text-secondary"
        >
          <Caret className={cn(!folded && 'rotate-90')} />
        </button>
        <div className="min-w-0 flex-1">
          {editable ? (
            <ToggleField
              block={{ id: `${data.id}-summary`, type: 'text', content: data.content }}
              onChange={(next) => onChange?.({ ...data, content: next.content })}
              autofocus={autofocus}
            />
          ) : (
            <StaticProse content={data.content} />
          )}
        </div>
      </div>
      {!folded &&
        (editable ? (
          <div style={{ paddingLeft: TOGGLE_BODY_INDENT }}>
            <ToggleField
              block={{ id: `${data.id}-body`, type: 'text', content: data.body ?? '' }}
              onChange={(next) => onChange?.({ ...data, body: next.content })}
              autofocus={false}
            />
          </div>
        ) : (
          <div style={{ paddingLeft: TOGGLE_BODY_INDENT }}>
            <StaticProse content={data.body ?? ''} />
          </div>
        ))}
    </div>
  )
}
