import { act } from '@testing-library/react'

/** Selects `el`'s own text as a real `Range`/`Selection`, then fires `selectionchange` — jsdom never fires it itself. */
export function selectText(el: HTMLElement): void {
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
