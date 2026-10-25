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
 * The fold button's own height in px (`--prose-line`'s 28px fallback, read as
 * a number here since `BlockCanvas.tsx`'s `topInsetPx` prop takes one) — the
 * one home both the button's CSS and BlockCanvas's edge-resize-strip clip
 * (KAN-480, bounded round-3 fix) read, so the two can never drift apart.
 */
export const TOGGLE_FOLD_ROW_PX = 28

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
 * splitting at the summary's own end (`after` is `''`) leaves the stored body
 * untouched. CommonMark has no empty-paragraph syntax, so an empty `after`
 * can't be written into the body as a line of its own; the focus effect below
 * opens that line directly in the live editor instead (Notion's own "Enter
 * opens a new empty first child line").
 */
const joinBody = (after: string, body: string | undefined): string => {
  const rest = body ?? ''
  if (after === '') return rest
  return rest === '' ? after : `${after}\n\n${rest}`
}

/** What the focus effect does once the body editor exists. */
interface FocusBody {
  token: number
  /** `after` was empty and the body already held text: open a new, empty first line. */
  insertEmptyLine: boolean
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
  const [focusBody, setFocusBody] = useState<FocusBody | null>(null)
  const fieldIds = toggleFieldIds(data.id)

  useEffect(() => {
    if (!focusBody) return
    const { insertEmptyLine } = focusBody
    // On a FOLDED toggle, this effect fires in the SAME commit the body first
    // mounts in — `immediatelyRender: false` (`editor.tsx`) defers the body's
    // own tiptap editor to a later effect, so it may not be registered yet.
    // One retry on the next frame, as `focusTextBlockSoon` (`BlockCanvas.tsx`).
    const attempt = (): boolean => {
      const editor = editorForBlock(fieldIds.body)
      if (!editor) return false
      if (!insertEmptyLine) return Boolean(editor.commands.focus('start'))
      // A node inserted straight into the live document, never through the
      // markdown round trip: an empty leading paragraph has no markdown
      // spelling, so it only exists here until the person types into it —
      // at which point the next `onUpdate` writes it into `body` for real.
      return editor.chain().insertContentAt(0, { type: 'paragraph' }).focus(1).run()
    }
    if (attempt()) return
    const frame = requestAnimationFrame(attempt)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per token, not per id
  }, [focusBody])

  const summaryRow: BlockRowValue = {
    selected: false,
    stepOut: (patch, content, where = 'below') => {
      if (where === 'above') {
        const summary = patch?.type === 'text' ? patch : undefined
        outerStepOut(summary ? { ...data, content: summary.content } : undefined, content, where)
        return
      }
      if (patch?.type !== 'text') return
      const after = content ?? ''
      const hadBody = Boolean(data.body && data.body.trim() !== '')
      onChange?.({
        ...data,
        content: patch.content,
        body: joinBody(after, data.body),
        folded: false,
      })
      setFocusBody((prev) => ({
        token: (prev?.token ?? 0) + 1,
        insertEmptyLine: after === '' && hadBody,
      }))
    },
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-1.5">
        {/* WCAG 2.5.8: the glyph alone is a 9×9 hit target, grown to 16×28
            (KAN-480, bounded round-3 fix). Growth is asymmetric — 1px left
            (`pl-[1px]`/`-ml-[1px]`), 6px right (`pr-[6px]`/`-mr-[6px]`) —
            because the left side already meets `BlockEdgeHandle`'s edge-resize
            strip (BlockCanvas.tsx) at the 17px gutter's limit, while the 6px
            on the right is the `gap-1.5` flex gap before the summary: blank
            flow space, never the summary's own text, so growing into it can't
            cover a glyph a click should instead place the caret in. Each
            side's margin cancels its own padding (content width 9 + pl 1 +
            pr 6 = 16 border-box; 16 + -1 + -6 = 9 margin-box), so the 9px flow
            footprint (`TOGGLE_BODY_INDENT`'s own sum) and the summary's
            position are both unchanged. `relative z-[2]` lifts this border
            box, where it overlaps that gutter, above the edge-resize strip's
            `z-[1]` (BlockCanvas clips the strip's own top 28px for a toggle's
            left handle so the rest of the edge still starts a resize).
            Height still matches the first line's own `--prose-line` box
            (28px), so the glyph centres on the line itself. */}
        <button
          type="button"
          aria-expanded={!folded}
          aria-label={folded ? 'unfold' : 'fold'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => commit({ ...data, folded: !folded })}
          className="relative z-[2] -ml-[1px] -mr-[6px] grid h-[var(--prose-line,calc(17.5px*1.6))] flex-none place-items-center pl-[1px] pr-[6px] text-mn-text-secondary"
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
