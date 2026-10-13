import { Extension, type CommandProps } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ReplaceStep } from '@tiptap/pm/transform'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Transaction } from '@tiptap/pm/state'
import { reanchorRange, type TextEdit, type TextRange } from '@/lib/references/reference'

/**
 * A reference's current range inside one block, keyed so the caller (today,
 * AITerminal) can match a drop back to the reference it came from.
 */
export interface ReferenceHighlightEntry {
  key: string
  range: TextRange
}

type DroppedListener = (blockId: string, keys: string[]) => void
const droppedListeners = new Set<DroppedListener>()

/**
 * Fires when an edit destroys a reference's anchored text in some block —
 * `reanchorRange` returned null. Whoever owns that reference's state removes
 * it; the extension itself only knows positions, not references.
 */
export const onReferenceRangeDropped = (listener: DroppedListener): (() => void) => {
  droppedListeners.add(listener)
  return () => droppedListeners.delete(listener)
}

interface PluginState {
  entries: ReferenceHighlightEntry[]
  justDropped: string[]
}

const pluginKey = new PluginKey<PluginState>('referenceHighlight')

/**
 * `reanchorRange` only reads `insertedText.length`, so a step's inserted
 * content is stood in for by its size, never its text — ProseMirror's own
 * step objects don't expose the inserted string as flat text.
 */
const textEditFor = (step: unknown): TextEdit | null =>
  step instanceof ReplaceStep
    ? { from: step.from, deleteCount: step.to - step.from, insertedText: ' '.repeat(step.slice.size) }
    : null

/** Re-anchors `range` across every step of `tr`, in the order they applied. */
const reanchorAcross = (range: TextRange, tr: Transaction): TextRange | null =>
  tr.steps.reduce<TextRange | null>((current, step) => {
    if (current === null) return null
    const edit = textEditFor(step)
    return edit ? reanchorRange(current, edit) : current
  }, range)

/**
 * Decorates each active reference's current range in its own block (wheat
 * highlight, #98) and keeps it anchored as the block is edited around it,
 * dropping a reference whose own text is edited away.
 */
export const ReferenceHighlight = Extension.create<{ blockId: string }>({
  name: 'referenceHighlight',

  addOptions() {
    return { blockId: '' }
  },

  addProseMirrorPlugins() {
    const { blockId } = this.options
    return [
      new Plugin<PluginState>({
        key: pluginKey,
        state: {
          init: () => ({ entries: [], justDropped: [] }),
          apply(tr, { entries }) {
            const next = tr.getMeta(pluginKey) as ReferenceHighlightEntry[] | undefined
            if (next) return { entries: next, justDropped: [] }
            if (!tr.docChanged) return { entries, justDropped: [] }

            const dropped: string[] = []
            const reanchored = entries.flatMap(({ key, range }) => {
              const next = reanchorAcross(range, tr)
              if (next === null) {
                dropped.push(key)
                return []
              }
              return [{ key, range: next }]
            })
            return { entries: reanchored, justDropped: dropped }
          },
        },
        props: {
          decorations(state) {
            const { entries } = pluginKey.getState(state) ?? { entries: [] }
            if (entries.length === 0) return DecorationSet.empty
            return DecorationSet.create(
              state.doc,
              entries.map(({ range }) =>
                Decoration.inline(range.from, range.to, { class: 'mn-reference-highlight' })
              )
            )
          },
        },
        view: () => ({
          update(view) {
            const dropped = pluginKey.getState(view.state)?.justDropped
            if (dropped && dropped.length > 0) droppedListeners.forEach((listener) => listener(blockId, dropped))
          },
        }),
      }),
    ]
  },

  addCommands() {
    return {
      setReferenceHighlights:
        (entries: ReferenceHighlightEntry[]) =>
        ({ tr, dispatch }: CommandProps) => {
          if (dispatch) dispatch(tr.setMeta(pluginKey, entries))
          return true
        },
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    referenceHighlight: {
      setReferenceHighlights: (entries: ReferenceHighlightEntry[]) => ReturnType
    }
  }
}
