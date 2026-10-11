import { act } from '@testing-library/react'

/**
 * A drag-select puts focus in the editor, and ProseMirror only mirrors the DOM
 * selection into its own state while its view is focused — jsdom does neither.
 */
function focusEditableAround(el: HTMLElement): void {
  const editable = el.closest<HTMLElement>('[contenteditable="true"]')
  if (!editable) return
  act(() => editable.focus())
}

/** Selects `el`'s own text as a real `Range`/`Selection`, then fires `selectionchange` — jsdom never fires it itself. */
export function selectText(el: HTMLElement): void {
  focusEditableAround(el)
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  act(() => {
    document.dispatchEvent(new Event('selectionchange'))
  })
}

/** Collapses the selection and fires `selectionchange`, as clicking away or arrowing off a selection would. */
export function clearSelection(): void {
  window.getSelection()?.removeAllRanges()
  act(() => {
    document.dispatchEvent(new Event('selectionchange'))
  })
}

/** Selects just `word` within `el`'s rendered text as a real `Range`/`Selection`, then fires `selectionchange`. */
export function selectWord(el: HTMLElement, word: string): void {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const index = node.textContent?.indexOf(word) ?? -1
    if (index === -1) continue
    focusEditableAround(el)
    const range = document.createRange()
    range.setStart(node, index)
    range.setEnd(node, index + word.length)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    act(() => {
      document.dispatchEvent(new Event('selectionchange'))
    })
    return
  }
  throw new Error(`"${word}" not found in element's text`)
}
