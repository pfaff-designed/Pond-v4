'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Caret } from '@/components/atoms/Caret'
import type { ModuleViewProps } from '../types'
import { toggleFieldIds, type ToggleBlock } from './schema'
import { StaticProse } from '../text/static-prose'
import { TextView } from '../text/view'
import type { TextBlock } from '../text/schema'
import { editorForBlock } from '../text/active-editor'
import { BlockRowProvider, useBlockRow, type BlockRowValue } from '../block-row-context'
import { SlashLineContext } from '../text/slash-line'

/**
 * The ▸ button's own width (9px, `Caret.tsx`) plus the gap beside it (6px,
 * `gap-1.5`) — the body sits under the summary's first word, not under the ▸,
 * matching `Rail.tsx`'s own caret/row gap (KAN-480's own app-over-board choice,
 * no board draws a toggle).
 */
const TOGGLE_BODY_INDENT = 15

/**
 * The body's own row (KAN-480, build item 5): `ownEnter` makes its Enter
 * ProseMirror's own (a new paragraph inside the body), never a `stepOut`
 * split — a toggle's body is one field of several lines, not a run of page
 * blocks. `stepOut` is never reached with `ownEnter` set, so it stays a no-op.
 */
const TOGGLE_BODY_ROW: BlockRowValue = { selected: false, stepOut: () => {}, ownEnter: true }

/**
 * `after`, followed by the existing body — the shape a `stepOut` split from
 * the summary leaves behind. Either half absent collapses to the other, so
 * splitting at the summary's own end (`after` is `''`) leaves the body
 * untouched rather than gaining a blank line above it.
 */
const joinBody = (after: string, body: string | undefined): string => {
  const rest = body ?? ''
  if (after === '') return rest
  return rest === '' ? after : `${after}\n\n${rest}`
}

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
  row,
}: {
  block: TextBlock
  onChange: (next: TextBlock) => void
  autofocus?: boolean
  row: BlockRowValue
}) {
  return (
    <SlashLineContext.Provider value={null}>
      <BlockRowProvider value={row}>
        <TextView data={block} editable onChange={onChange} autofocus={autofocus} />
      </BlockRowProvider>
    </SlashLineContext.Provider>
  )
}

/**
 * The toggle block (KAN-480 slice 1). Read-only (`editable` absent/false) is
 * static prose both ways, folded by `data.folded` alone (build item 3). Editable
 * hosts the summary and body as two `TextView`s (build item 4) — their
 * `onChange` maps straight back into this block's `content`/`body`.
 *
 * Enter on the summary (build item 5) splits it through its own `stepOut`:
 * 'below' (the caret anywhere but the start) commits the text before the
 * caret as the summary, joins the text after it onto the body, unfolds, and
 * focuses the body — Notion's own "Enter opens the child line" — while
 * 'above' (nothing before the caret) passes straight to the OUTER row's
 * `stepOut`, the same empty-block-above every other row's Enter makes. The
 * body's own Enter never reaches here at all: `TOGGLE_BODY_ROW`'s `ownEnter`
 * keeps it ProseMirror's, a new line in the one body field.
 */
export function ToggleView({ data, editable, onChange, autofocus }: ModuleViewProps<ToggleBlock>) {
  const folded = data.folded ?? false
  const { stepOut: outerStepOut, commitStep } = useBlockRow()
  // No `BlockRowProvider` above this view (page/view.tsx, a Storybook host) —
  // KAN-355's save-flush has nothing to flush, so the fold falls back to the
  // view's own `onChange` rather than the context's absent default.
  const commit = (patch: ToggleBlock) => (commitStep ?? onChange)?.(patch)
  const [focusBodyToken, setFocusBodyToken] = useState(0)
  const fieldIds = toggleFieldIds(data.id)

  useEffect(() => {
    if (focusBodyToken === 0) return
    editorForBlock(fieldIds.body)?.commands.focus('start')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per token, not per id
  }, [focusBodyToken])

  const summaryRow: BlockRowValue = {
    selected: false,
    stepOut: (patch, content, where = 'below') => {
      if (where === 'above') {
        const summary = patch as TextBlock | undefined
        outerStepOut(summary ? { ...data, content: summary.content } : undefined, content, where)
        return
      }
      const summary = patch as TextBlock
      onChange?.({
        ...data,
        content: summary.content,
        body: joinBody(content ?? '', data.body),
        folded: false,
      })
      setFocusBodyToken((token) => token + 1)
    },
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          aria-expanded={!folded}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => commit({ ...data, folded: !folded })}
          className="mt-[0.3em] grid w-[9px] flex-none place-items-center text-mn-text-secondary"
        >
          <Caret className={cn(!folded && 'rotate-90')} />
        </button>
        <div className="min-w-0 flex-1">
          {editable ? (
            <ToggleField
              block={{ id: fieldIds.summary, type: 'text', content: data.content }}
              onChange={(next) => onChange?.({ ...data, content: next.content })}
              autofocus={autofocus}
              row={summaryRow}
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
              block={{ id: fieldIds.body, type: 'text', content: data.body ?? '' }}
              onChange={(next) => onChange?.({ ...data, body: next.content })}
              autofocus={false}
              row={TOGGLE_BODY_ROW}
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
