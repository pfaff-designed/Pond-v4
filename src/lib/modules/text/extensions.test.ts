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

describe('Strike bound to ⌘⇧X, not StarterKit\'s own default', () => {
  const platform = Object.getOwnPropertyDescriptor(window.navigator, 'platform')

  afterEach(() => {
    if (platform) Object.defineProperty(window.navigator, 'platform', platform)
    else delete (window.navigator as { platform?: string }).platform
  })

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

  const selectAll = (editor: EditorType) => editor.commands.selectAll()

  /**
   * On Mac, `metaKey + shiftKey` makes prosemirror-keymap's `w3c-keyname`
   * ignore `event.key` and resolve the chord from `event.keyCode` instead
   * (mac ignores `.key`'s shift effect for Cmd+Shift combos) — jsdom's
   * `KeyboardEvent` constructor doesn't accept `keyCode`, so it has to be
   * defined on the dispatched event directly, the way a real browser event
   * carries it.
   */
  const dispatchChord = (editor: EditorType, key: string, keyCode: number) => {
    const event = new KeyboardEvent('keydown', {
      key,
      shiftKey: true,
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'keyCode', { get: () => keyCode })
    editor.view.dom.dispatchEvent(event)
  }

  it('⌘⇧X, pinned to Mac, toggles strike on the selection', () => {
    const editor = mountPinnedToMac('<p>hello</p>')
    selectAll(editor)

    dispatchChord(editor, 'X', 88)

    expect(editor.isActive('strike')).toBe(true)
    editor.destroy()
  })

  it("⌘⇧S, pinned to Mac, does not toggle strike (StarterKit's old default is dropped)", () => {
    const editor = mountPinnedToMac('<p>hello</p>')
    selectAll(editor)

    dispatchChord(editor, 'S', 83)

    expect(editor.isActive('strike')).toBe(false)
    editor.destroy()
  })
})
