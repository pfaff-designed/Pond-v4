import { addons } from 'storybook/manager-api'

import { isPaletteChord } from '../src/lib/shell-commands'

/**
 * ⌘K (Ctrl+K off Apple) is Pond's palette chord, so inside Storybook the story owns
 * it. Storybook's own search moves to `/`; otherwise a chord pressed in a story is
 * forwarded up and the search field takes focus from the palette's input.
 */
addons.register('pond/palette-chord', (api) => {
  api.setShortcut('search', ['/'])

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isPaletteChord(e)) return
    const preview = document.querySelector<HTMLIFrameElement>('#storybook-preview-iframe')
      ?.contentWindow as (Window & typeof globalThis) | null | undefined
    if (!preview) return
    e.preventDefault()
    e.stopPropagation()
    preview.focus()
    preview.document.dispatchEvent(
      new preview.KeyboardEvent('keydown', {
        key: e.key,
        code: e.code,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        bubbles: true,
      })
    )
  }
  document.addEventListener('keydown', handleKeyDown, { capture: true })
})
