/**
 * `proseExtensions` binds Heading's shortcuts from `HEADING_CHORDS`
 * (`extensions.ts`), not from `@tiptap/starter-kit`'s own default — so a
 * real ⌘⌥2 keydown is proof the table, not a coincidence, is what fires the
 * command.
 */

import type { Editor as EditorType } from '@tiptap/core'
import type { proseExtensions as proseExtensionsType } from './extensions'

describe('Heading shortcuts bound from HEADING_CHORDS', () => {
  const platform = Object.getOwnPropertyDescriptor(window.navigator, 'platform')

  afterEach(() => {
    if (platform) Object.defineProperty(window.navigator, 'platform', platform)
    else delete (window.navigator as { platform?: string }).platform
  })

  /**
   * `@tiptap/pm`'s keymap resolves `Mod` against `navigator.platform` once, at
   * the keymap module's first import — so the platform is pinned before that
   * happens, behind a fresh module registry so the resolution re-runs (AGENTS.md
   * "tests are orthogonal to the machine": CI runs on Linux, not a Mac).
   */
  const mountPinnedToMac = (content: string): EditorType => {
    jest.resetModules()
    Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true })
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Editor } = require('@tiptap/core') as typeof import('@tiptap/core')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { proseExtensions } = require('./extensions') as {
      proseExtensions: typeof proseExtensionsType
    }
    const element = document.createElement('div')
    return new Editor({ element, extensions: proseExtensions, content })
  }

  it('⌘⌥2, pinned to Mac, turns the line into a heading 2', () => {
    const editor = mountPinnedToMac('<p>hello</p>')

    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '2',
        altKey: true,
        metaKey: true,
        bubbles: true,
        cancelable: true,
      })
    )

    expect(editor.isActive('heading', { level: 2 })).toBe(true)
    editor.destroy()
  })

  it('⌘⌥5, pinned to Mac, still turns the line into a heading 5 (StarterKit default, not in HEADING_CHORDS)', () => {
    const editor = mountPinnedToMac('<p>hello</p>')

    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '5',
        altKey: true,
        metaKey: true,
        bubbles: true,
        cancelable: true,
      })
    )

    expect(editor.isActive('heading', { level: 5 })).toBe(true)
    editor.destroy()
  })
})
