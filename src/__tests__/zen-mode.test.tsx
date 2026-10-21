/**
 * KAN-91 — zen, entered and left from ⌘K (`Pond 06.17` 6q frames 1, 3, 11;
 * `Pond 07.07` 7g rules).
 *
 *   frame 1   ⌘K, type zen: a `mode` group — `zen · this page, everything else
 *             hidden · ⌘.` and `zen, on ink · same, on the ink ground`
 *   frame 3   the rail, the breadcrumb and the composer go; the page's text in a
 *             600 column 96 from the top, title PP Editorial New 200 44 / 1.05,
 *             body 21 / 1.7, 22 between paragraphs
 *   frame 10  the same page on the ink ground
 *   frame 11  esc, or ⌘K › leave zen, brings everything back where you left it
 */

import fs from 'fs'
import path from 'path'
import React, { useRef } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let mockNodeId: string | null = 'journal'

jest.mock('next/navigation', () => ({
  usePathname: () => '/workspace',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? mockNodeId : null) }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  }),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn(() =>
    Promise.resolve([
      {
        id: 'journal',
        parent_id: null,
        type: 'page',
        title: 'sunday, 21 sep',
        order: 0,
        updated_at: '2026-09-21T09:00:00Z',
      },
      {
        id: 'other',
        parent_id: null,
        type: 'page',
        title: 'kitchen',
        order: 1,
        updated_at: '2026-09-21T09:00:00Z',
      },
    ])
  ),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'life', blocks: [] }),
}))
jest.mock('@/lib/pages/commit', () => jest.requireActual('./helpers/page-commit-mock').pageCommitMock())
jest.mock('@/lib/pages/client', () => ({
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  deletePage: jest.fn(),
  movePage: jest.fn(),
  getPage: jest.fn((_client: unknown, id: string) =>
    Promise.resolve({
      id,
      parentId: null,
      type: 'page',
      title: id === 'journal' ? 'sunday, 21 sep' : 'kitchen',
      blocks: [{ id: 'b1', type: 'text', content: 'the morning was grey' }],
      // A collection, so the page draws its properties inspector.
      props: { _schema: [] },
    })
  ),
  setProperty: jest.fn(),
}))
jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  listRecords: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/components/organisms/AITerminal', () => ({
  AITerminal: () => <section aria-label="composer" />,
}))

import { WorkspaceShell } from '@/components/organisms/WorkspaceShell'
import { paletteEntries, type PaletteEntry } from '@/components/molecules/palette-entries'
import { modeItems, paletteItems } from '@/lib/pages/palette-items'
import { isZenChord } from '@/lib/shell-commands'
import {
  escLeavesZen,
  POND_ATOM_PAGE_TYPE_PX,
  useZen,
  ZEN_CHROME_RETURN,
  ZEN_COLUMN_PX,
  ZEN_PROSE_CLASS,
  ZEN_TYPE_SCALE,
  ZenComposerChrome,
  ZenProvider,
  zenPx,
} from '@/lib/layout/zen'
import { notifyComposerOpenChange, TOGGLE_COMPOSER_EVENT } from '@/lib/terminal-focus'
import { TEXT_PROSE_CLASS } from '@/lib/modules/text/prose'
import { useRecordSelection } from '@/lib/modules/view/use-record-selection'
import { TerminalDrawer } from '@/components/molecules/TerminalDrawer'
import { COMPOSER_CLEARANCE_VAR, composerFootprintPx } from '@/lib/layout/composer-clearance'
import { getPage } from '@/lib/pages/client'

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

const key = (init: KeyboardEventInit & { key: string }) => new KeyboardEvent('keydown', init)

afterEach(() => {
  jest.restoreAllMocks()
  mockNodeId = 'journal'
})

describe('the palette’s mode group (6q frame 1)', () => {
  const rows = (inZen: boolean, query: string) =>
    paletteEntries([...paletteItems([], [], 'journal'), ...modeItems(inZen)], query)

  it('typing zen lists `mode`: zen and zen, on ink, as the board writes them', () => {
    onPlatform('MacIntel')
    const entries = rows(false, 'zen')
    expect(entries[0]).toEqual({ kind: 'group', label: 'mode' })
    const mode = entries.slice(1, 3)
    expect(mode.map((e) => (e.kind === 'row' ? [e.item.label, e.sub, e.item.key] : e))).toEqual([
      ['zen', 'this page, everything else hidden', '⌘.'],
      ['zen, on ink', 'same, on the ink ground', undefined],
    ])
    // The mode rows are not `actions`: that group still holds only ask pond.
    const actionsAt = entries.findIndex((e) => e.kind === 'group' && e.label === 'actions')
    expect(actionsAt).toBe(3)
  })

  it('in zen the one mode row is leave zen', () => {
    const labels = rows(true, 'zen').flatMap((e) => (e.kind === 'row' ? [e.item.label] : []))
    expect(labels).toContain('leave zen')
    expect(labels).not.toContain('zen')
    expect(labels).not.toContain('zen, on ink')
  })

  it('nothing typed lists no mode rows', () => {
    expect(rows(false, '').some((e) => e.kind === 'group' && e.label === 'mode')).toBe(false)
  })
})

describe('ask pond, while the composer is hidden', () => {
  const items = [...paletteItems([], [], 'journal'), ...modeItems(true)]
  const asks = (entries: PaletteEntry[]) =>
    entries.some((e) => e.kind === 'row' && e.item.action === 'ask-pond')
  const groups = (entries: PaletteEntry[]) =>
    entries.flatMap((e) => (e.kind === 'group' ? [e.label] : []))

  it('is minted for a typed query by default', () => {
    expect(asks(paletteEntries(items, 'zen'))).toBe(true)
    expect(asks(paletteEntries(items, 'nothing like it'))).toBe(true)
  })

  it('is not minted when the host says it cannot ask — and no empty actions group stands in', () => {
    const typing = paletteEntries(items, 'zen', { ask: false })
    expect(asks(typing)).toBe(false)
    expect(groups(typing)).toEqual(['mode'])
    expect(asks(paletteEntries(items, 'nothing like it', { ask: false }))).toBe(false)
  })
})

describe('⌘. — ⌘ on a Mac, Ctrl elsewhere, never both (AUDIT K3)', () => {
  it('a Mac: ⌘. only', () => {
    onPlatform('MacIntel')
    expect(isZenChord(key({ key: '.', metaKey: true }))).toBe(true)
    expect(isZenChord(key({ key: '.', ctrlKey: true }))).toBe(false)
    expect(isZenChord(key({ key: '.', metaKey: true, altKey: true }))).toBe(false)
    expect(isZenChord(key({ key: '.', metaKey: true, shiftKey: true }))).toBe(false)
  })

  it('elsewhere: Ctrl+. only', () => {
    onPlatform('Win32')
    expect(isZenChord(key({ key: '.', ctrlKey: true }))).toBe(true)
    expect(isZenChord(key({ key: '.', metaKey: true }))).toBe(false)
  })

  it('leaves an IME composition its ⌘. (macOS cancels the composition with it)', () => {
    onPlatform('MacIntel')
    expect(isZenChord(key({ key: '.', metaKey: true, isComposing: true }))).toBe(false)
  })
})

describe('which esc leaves zen', () => {
  const pressOn = (target: HTMLElement, handle?: (e: KeyboardEvent) => void) => {
    let seen: KeyboardEvent | null = null
    const listen = (e: Event) => {
      seen = e as KeyboardEvent
    }
    if (handle) target.addEventListener('keydown', handle as EventListener)
    window.addEventListener('keydown', listen)
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    window.removeEventListener('keydown', listen)
    return seen as unknown as KeyboardEvent
  }

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('an esc nothing else took', () => {
    expect(escLeavesZen(pressOn(document.body))).toBe(true)
  })

  it('not an esc that closed something first', () => {
    const menu = document.body.appendChild(document.createElement('div'))
    const e = pressOn(menu, (ev) => ev.preventDefault())
    expect(escLeavesZen(e)).toBe(false)
  })

  it('one esc both leaves the text block’s editor and leaves zen', () => {
    const editor = document.body.appendChild(document.createElement('div'))
    editor.setAttribute('contenteditable', 'true')
    editor.tabIndex = 0
    editor.focus()
    const e = pressOn(editor, (ev) => {
      editor.blur()
      ev.preventDefault()
    })
    expect(escLeavesZen(e)).toBe(true)
  })

  it('not while an IME is composing', () => {
    expect(escLeavesZen(key({ key: 'Escape', isComposing: true }))).toBe(false)
  })

  it('no other key', () => {
    expect(escLeavesZen(key({ key: 'Enter' }))).toBe(false)
  })
})

describe('zen’s type: the page’s own, scaled by one factor (6q frame 3)', () => {
  it('the factor is frame 3’s body over PondAtom’s: 21 / 17.5', () => {
    expect(ZEN_TYPE_SCALE).toBeCloseTo(1.2)
  })

  it('every role keeps its relation to the body', () => {
    const zen = Object.entries(POND_ATOM_PAGE_TYPE_PX).map(([role, px]) => [role, zenPx(px)])
    expect(Object.fromEntries(zen)).toEqual({
      prose: 21,
      h1: 45.6,
      h2: 26.4,
      h3: 21.6,
      h4: 19.2,
      h5: 16.2,
      h6: 13.2,
      quote: 22.8,
    })
  })

  it('scales from the sizes the page’s text block actually sets', () => {
    const { prose, quote, ...headings } = POND_ATOM_PAGE_TYPE_PX
    expect(TEXT_PROSE_CLASS).toContain(` text-[${prose}px] `)
    expect(TEXT_PROSE_CLASS).toContain(`[&_blockquote]:text-[${quote}px]`)
    for (const [h, px] of Object.entries(headings)) {
      expect(TEXT_PROSE_CLASS).toContain(`[&_${h}]:text-[${px}px]`)
    }
  })

  it('code keeps its own mono size', () => {
    expect(ZEN_PROSE_CLASS).not.toContain('code')
  })
})

describe('reduced motion', () => {
  it('the column’s settle-in is one of the animations reduced motion turns off', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    const block = reduced.slice(0, reduced.indexOf('}') + 1)
    expect(block).toContain('.motion-settle-in')
    expect(block).toContain('animation: none')
  })

  it('the chrome’s return fades on the settle tier, and not at all under reduced motion', () => {
    const c = ZEN_CHROME_RETURN.split(' ')
    expect(c).toEqual(
      expect.arrayContaining([
        'duration-[var(--motion-settle)]',
        'ease-[var(--ease-mn)]',
        'motion-reduce:transition-none',
      ])
    )
  })
})

describe('an esc taken by something open in zen leaves zen be', () => {
  const ZenProbe = () => {
    const { zen, enterZen } = useZen()
    return (
      <>
        <button onClick={() => enterZen({ onInk: false })}>enter</button>
        <output aria-label="zen">{zen ? 'in' : 'out'}</output>
      </>
    )
  }
  const Peek = () => {
    const { select, selection } = useRecordSelection([{ id: 'r1' }], 'view')
    return (
      <>
        <button onClick={() => select({ id: 'r1', via: 'pointer' })}>peek</button>
        {selection && <div data-part="record-peek">r1</div>}
      </>
    )
  }
  const Host = () => {
    const root = useRef<HTMLDivElement>(null)
    return (
      <div ref={root}>
        <ZenProvider scrollRoot={root}>
          <ZenProbe />
          <Peek />
        </ZenProvider>
      </div>
    )
  }

  it('the record peek: one esc closes it, the next leaves zen', () => {
    const { container } = render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))
    fireEvent.click(screen.getByRole('button', { name: 'peek' }))
    expect(container.querySelector('[data-part="record-peek"]')).not.toBeNull()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(container.querySelector('[data-part="record-peek"]')).toBeNull()
    expect(screen.getByRole('status', { name: 'zen' }).textContent).toBe('in')

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('status', { name: 'zen' }).textContent).toBe('out')
  })
})

describe('the composer’s clearance while zen hides it', () => {
  // TerminalDrawer watches the card with two ResizeObservers (one per
  // effect, KAN-400's scroll-clearance var alongside the content-padding
  // one) — a real resize fires both, so the mock must track every instance
  // rather than the single latest one.
  let observed: Array<() => void> = []
  const observe = () => observed.forEach((fn) => fn())
  const setupObserver = window.ResizeObserver
  beforeEach(() => {
    window.ResizeObserver = class {
      constructor(callback: () => void) {
        observed.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })
  afterEach(() => {
    observed = []
    window.ResizeObserver = setupObserver
  })

  const sized = (card: HTMLElement, height: number) => {
    Object.defineProperty(card, 'offsetHeight', { configurable: true, value: height })
    jest
      .spyOn(card, 'getClientRects')
      .mockReturnValue({ length: height ? 1 : 0 } as unknown as DOMRectList)
  }

  it('keeps the footprint it last had, so the page is not re-padded beneath a hidden card', () => {
    const { container } = render(
      <div data-part="shell">
        <TerminalDrawer collapsed={false} onExpand={() => {}} footer={null}>
          thread
        </TerminalDrawer>
      </div>
    )
    const shell = container.querySelector<HTMLElement>('[data-part="shell"]')!
    const card = container.querySelector<HTMLElement>('[data-part="composer-card"]')!
    const clearance = () => shell.style.getPropertyValue(COMPOSER_CLEARANCE_VAR)

    sized(card, 240)
    act(observe)
    expect(clearance()).toBe(`${composerFootprintPx(240)}px`)

    sized(card, 0)
    act(observe)
    expect(clearance()).toBe(`${composerFootprintPx(240)}px`)
  })
})

describe('ZenComposerChrome — the composer’s card, shown only once asked', () => {
  const Probe = () => {
    const { enterZen, askComposer, closeComposerAsk } = useZen()
    return (
      <>
        <button onClick={() => enterZen({ onInk: false })}>enter</button>
        <button onClick={askComposer}>ask</button>
        <button onClick={closeComposerAsk}>ask-close</button>
        <div data-testid="page-text">the page’s own text</div>
        <ZenComposerChrome>
          <div data-part="composer-card">card</div>
        </ZenComposerChrome>
      </>
    )
  }
  const Host = () => {
    const root = useRef<HTMLDivElement>(null)
    return (
      <div ref={root}>
        <ZenProvider scrollRoot={root}>
          <Probe />
        </ZenProvider>
      </div>
    )
  }
  const chrome = () => screen.getByText('card').closest('[data-part="zen-chrome"]')!

  it('stays hidden in zen with the composer already open (its default, and held open by a proposal) — only the ask shows it, at 6q f8’s placement; closing the ask hides it again, the page text untouched throughout', () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))
    // The composer's own open/closed state starts open regardless of zen —
    // that alone must not show the card.
    act(() => notifyComposerOpenChange(true))
    expect(chrome().className.split(' ')).toContain('hidden')

    fireEvent.click(screen.getByRole('button', { name: 'ask' }))
    const classes = chrome().className.split(' ')
    expect(classes).not.toContain('hidden')
    expect(classes).toEqual(
      expect.arrayContaining([
        '[&_[data-part="composer-card"]]:w-[560px]!',
        '[&_[data-part="composer-card"]]:left-1/2!',
        '[&_[data-part="composer-card"]]:[--composer-card-bottom:92px]!',
        '[&_[data-part="composer-card"]]:gap-[12px]!',
        '[&_[data-part="composer-card"]]:[--mn-glass-bg:linear-gradient(160deg,rgba(255,255,255,.92),rgba(255,255,255,.76))]!',
        '[&_[data-part="composer-card"]]:[--mn-glass-border:1px_solid_rgba(255,255,255,.9)]!',
        '[&_[data-part="composer-card"]]:[--mn-glass-shadow:inset_0_1px_0_rgba(255,255,255,.7),0_20px_54px_rgba(40,34,24,.16)]!',
        'dark:[&_[data-part="composer-card"]]:[--mn-glass-bg:rgba(48,49,42,.9)]!',
        'dark:[&_[data-part="composer-card"]]:[--mn-glass-border:1px_solid_rgba(250,249,239,.09)]!',
        'dark:[&_[data-part="composer-card"]]:[--mn-glass-shadow:0_20px_54px_rgba(0,0,0,.45)]!',
      ])
    )
    expect(screen.getByTestId('page-text').textContent).toBe('the page’s own text')

    fireEvent.click(screen.getByRole('button', { name: 'ask-close' }))
    expect(chrome().className.split(' ')).toContain('hidden')
    expect(screen.getByTestId('page-text').textContent).toBe('the page’s own text')
  })
})

describe('WorkspaceShell — zen from ⌘K, and back with esc', () => {
  const renderShell = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = () => (
      <QueryClientProvider client={client}>
        <WorkspaceShell>{null}</WorkspaceShell>
      </QueryClientProvider>
    )
    const view = render(tree())
    return { ...view, rerenderShell: () => view.rerender(tree()) }
  }

  const chromeOf = (el: Element) => el.closest('[data-part="zen-chrome"]')
  const commandPlacement = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[data-part="command"]')!.parentElement!
  const zenOf = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[data-part="zen-ground"]')!.dataset.zen

  const palette = async (query: string) => {
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    fireEvent.change(input, { target: { value: query } })
    return input
  }

  const pick = async (name: RegExp) => {
    fireEvent.click(await screen.findByRole('option', { name }))
  }

  const esc = (target: Element = document.body) =>
    act(() => {
      fireEvent.keyDown(target, { key: 'Escape' })
    })

  const ready = async () => {
    await screen.findByRole('textbox', { name: 'Page title' })
  }

  beforeEach(() => onPlatform('MacIntel'))

  it('⌘K › zen hides the rail, the breadcrumb and the composer, leaving the page', async () => {
    const { container } = renderShell()
    await ready()
    const rail = await screen.findByRole('complementary')
    const composer = screen.getByRole('region', { name: 'composer' })
    expect(zenOf(container)).toBeUndefined()

    await palette('zen')
    await pick(/this page, everything else hidden/)

    await waitFor(() => expect(zenOf(container)).toBe('page'))
    expect(chromeOf(rail)!.className.split(' ')).toContain('hidden')
    expect(chromeOf(composer)!.className.split(' ')).toContain('hidden')
    expect(commandPlacement(container).className.split(' ')).toContain('invisible')
    expect(
      container.querySelector('main')!.contains(screen.getByRole('textbox', { name: 'Page title' }))
    ).toBe(true)
  })

  it('sets the page in zen’s column and type: 600 of text, 96 down, title 44 serif 200, body 21 / 1.7', async () => {
    const { container } = renderShell()
    await ready()
    await palette('zen')
    await pick(/this page, everything else hidden/)

    const column = await screen.findByTestId('page-column')
    await waitFor(() => expect(column.dataset.zen).toBeDefined())
    // 600 of text inside the column's 32px padding and a text block's 4px inset, each side.
    expect(ZEN_COLUMN_PX).toBe(672)
    expect(column.style.maxWidth).toBe('672px')
    expect(column.style.paddingTop).toBe('96px')
    expect(column.style.getPropertyValue('--zen-prose')).toBe('21px')
    expect(column.style.getPropertyValue('--zen-h1')).toBe('45.6px')
    expect(column.style.getPropertyValue('--zen-quote')).toBe('22.8px')
    expect(column.style.getPropertyValue('--zen-gap')).toBe('22px')
    const zenClasses = column.className.split(' ')
    expect(zenClasses).toEqual(
      expect.arrayContaining([
        '[&_:is([data-text-prose],.ProseMirror)]:text-[length:var(--zen-prose)]',
        '[&_:is([data-text-prose],.ProseMirror)]:leading-[1.7]',
        '[&_:is([data-text-prose],.ProseMirror)>*+*]:mt-[var(--zen-gap)]',
        '[&_:is([data-text-prose],.ProseMirror)_h1]:text-[length:var(--zen-h1)]',
        '[&_:is([data-text-prose],.ProseMirror)_blockquote]:text-[length:var(--zen-quote)]',
        'motion-settle-in',
      ])
    )

    const title = screen.getByRole('textbox', { name: 'Page title' })
    const t = title.className.split(' ')
    expect(t).toEqual(
      expect.arrayContaining([
        'font-serif',
        'font-extralight',
        'text-[44px]',
        'leading-[1.05]',
        'tracking-[-0.01em]',
      ])
    )
    expect(t).not.toContain('uppercase')
    expect(t).not.toContain('font-bold')
    expect(container.querySelector<HTMLElement>('[data-part="title-eyebrow"]')!.hidden).toBe(true)
    expect(container.querySelector('[data-testid="content-width-handle"]')).toBeNull()
  })

  it('what is left is the page’s own text: no properties, no handles, 22 between blocks', async () => {
    // A second block, so the gap between rows is actually observable: KAN-440
    // moved it off the list's own `rowGap` (now fixed at 0, so two rows don't
    // double it) onto each row's own `marginTop`.
    ;(getPage as jest.Mock).mockResolvedValueOnce({
      id: 'journal',
      parentId: null,
      type: 'page',
      title: 'sunday, 21 sep',
      blocks: [
        { id: 'b1', type: 'text', content: 'the morning was grey' },
        { id: 'b2', type: 'text', content: 'then it cleared' },
      ],
      props: { _schema: [] },
    })
    const { container } = renderShell()
    await ready()
    const properties = container.querySelector('[data-block-kind="properties"]')!
    const handles = Array.from(container.querySelectorAll<HTMLElement>('[data-part="handle"]'))
    expect(handles.length).toBeGreaterThan(0)
    expect(properties.closest('.hidden')).toBeNull()

    await palette('zen')
    await pick(/this page, everything else hidden/)
    await waitFor(() => expect(zenOf(container)).toBe('page'))

    expect(properties.isConnected).toBe(true)
    expect(properties.closest('.hidden')).not.toBeNull()
    expect(handles.every((h) => h.hidden)).toBe(true)
    // KAN-345: the trailing gap only mounts while `chrome` is true, same as
    // the foot add it replaced — zen's `chrome={false}` unmounts it outright.
    expect(screen.queryByTestId('trailing-block-gap')).not.toBeInTheDocument()
    // handle -> BlockEditor root -> per-block sizing div -> list (no row div).
    const sizingDivs = handles.map((h) => h.parentElement!.parentElement!)
    const list = sizingDivs[0].parentElement!
    expect(getComputedStyle(list).display).toBe('flex')
    expect(sizingDivs[1].style.marginTop).toBe('22px')

    await esc()
    expect(properties.closest('.hidden')).toBeNull()
    expect(handles.some((h) => h.hidden)).toBe(false)
    expect(screen.getByTestId('trailing-block-gap')).toBeInTheDocument()
    expect(sizingDivs[1].style.marginTop).toBe('16px')
  })

  it('esc leaves, and puts everything back — the rail, the breadcrumb, the composer and the scroll', async () => {
    const { container } = renderShell()
    await ready()
    const canvas = container.querySelector<HTMLElement>('[data-part="page-canvas"]')!
    canvas.scrollTop = 300

    await palette('zen')
    await pick(/this page, everything else hidden/)
    await waitFor(() => expect(zenOf(container)).toBe('page'))
    canvas.scrollTop = 40

    await esc()

    expect(zenOf(container)).toBeUndefined()
    const rail = screen.getByRole('complementary')
    expect(chromeOf(rail)!.className.split(' ')).not.toContain('hidden')
    expect(
      chromeOf(screen.getByRole('region', { name: 'composer' }))!.className.split(' ')
    ).not.toContain('hidden')
    expect(commandPlacement(container).className.split(' ')).not.toContain('invisible')
    expect(canvas.scrollTop).toBe(300)
    const title = screen.getByRole('textbox', { name: 'Page title' })
    expect(title.className.split(' ')).toContain('text-[38px]')
    const column = screen.getByTestId('page-column')
    expect(column.dataset.zen).toBeUndefined()
    expect(column.style.paddingTop).toBe('')
    expect(column.className).not.toContain('--zen-prose')
    expect(column.style.getPropertyValue('--zen-prose')).toBe('')
    // The chrome fades back, unless motion is reduced.
    expect(chromeOf(rail)!.className.split(' ')).toContain('motion-reduce:transition-none')
    expect(commandPlacement(container).className.split(' ')).toContain(
      'motion-reduce:transition-none'
    )
  })

  it('the scroll comes back once the chrome is back, so a page at its foot lands at its foot', async () => {
    const { container } = renderShell()
    await ready()
    const canvas = container.querySelector<HTMLElement>('[data-part="page-canvas"]')!
    canvas.scrollTop = 900
    await palette('zen')
    await pick(/this page, everything else hidden/)
    await waitFor(() => expect(zenOf(container)).toBe('page'))

    const composer = screen.getByRole('region', { name: 'composer' })
    const chromeHiddenAtRestore: boolean[] = []
    let top = canvas.scrollTop
    Object.defineProperty(canvas, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        chromeHiddenAtRestore.push(chromeOf(composer)!.classList.contains('hidden'))
        top = value
      },
    })

    await esc()
    expect(top).toBe(900)
    expect(chromeHiddenAtRestore).toEqual([false])
  })

  it('the changes panel: one esc closes it, the next leaves zen', async () => {
    const { container } = renderShell()
    await ready()
    await palette('zen')
    await pick(/this page, everything else hidden/)
    await waitFor(() => expect(zenOf(container)).toBe('page'))

    act(() => {
      fireEvent.keyDown(document, { code: 'KeyH', key: '˙', altKey: true, metaKey: true })
    })
    await screen.findByRole('complementary', { name: 'Changes to this page' })

    await esc()
    expect(screen.queryByRole('complementary', { name: 'Changes to this page' })).toBeNull()
    expect(zenOf(container)).toBe('page')

    await esc()
    expect(zenOf(container)).toBeUndefined()
  })

  it('esc that closes the palette in zen only closes the palette', async () => {
    const { container } = renderShell()
    await ready()
    await palette('zen')
    await pick(/this page, everything else hidden/)
    await waitFor(() => expect(zenOf(container)).toBe('page'))

    const input = await palette('')
    expect(commandPlacement(container).className.split(' ')).not.toContain('invisible')
    await esc(input)

    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'command palette' })).toBeNull()
    )
    expect(zenOf(container)).toBe('page')
  })

  it('in zen the palette offers no ask row, since the composer it would fill is hidden', async () => {
    const { container } = renderShell()
    await ready()
    await palette('kitchen')
    expect(await screen.findByRole('option', { name: /ask pond about/ })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'command palette' })).toBeNull()
    )

    await palette('zen')
    await pick(/this page, everything else hidden/)
    await waitFor(() => expect(zenOf(container)).toBe('page'))

    await palette('kitchen')
    await screen.findByRole('option', { name: /kitchen/ })
    expect(screen.queryByRole('option', { name: /ask pond about/ })).toBeNull()
  })

  it('⌘K › leave zen leaves; while in zen it is the one mode row', async () => {
    const { container } = renderShell()
    await ready()
    await palette('zen')
    await pick(/this page, everything else hidden/)
    await waitFor(() => expect(zenOf(container)).toBe('page'))

    await palette('zen')
    expect(screen.queryByRole('option', { name: /this page, everything else hidden/ })).toBeNull()
    await pick(/leave zen/)

    await waitFor(() => expect(zenOf(container)).toBeUndefined())
  })

  describe('zen, on ink', () => {
    const html = document.documentElement
    afterEach(() => {
      html.classList.remove('dark')
      window.localStorage.clear()
    })

    const enterOnInk = async (container: HTMLElement) => {
      await ready()
      await palette('zen')
      await pick(/same, on the ink ground/)
      await waitFor(() => expect(zenOf(container)).toBe('ink'))
    }
    const modeSwitch = () => screen.getByRole('button', { name: 'dark mode', hidden: true })

    it('holds the whole document on ink without touching the person’s mode, and gives paper back', async () => {
      const { container } = renderShell()
      await enterOnInk(container)
      expect(html.classList.contains('dark')).toBe(true)
      expect(window.localStorage.getItem('pond:mode')).toBeNull()
      expect(modeSwitch().getAttribute('aria-pressed')).toBe('false')

      await esc()
      expect(html.classList.contains('dark')).toBe(false)
    })

    it('leaves a dark pond dark', async () => {
      html.classList.add('dark')
      const { container } = renderShell()
      await enterOnInk(container)
      await esc()
      expect(html.classList.contains('dark')).toBe(true)
    })

    it('a mode switched while in zen is stored at once, kept off the ground, and applied on the way out', async () => {
      const { container } = renderShell()
      await enterOnInk(container)

      fireEvent.click(modeSwitch())
      expect(window.localStorage.getItem('pond:mode')).toBe('dark')
      await waitFor(() => expect(modeSwitch().getAttribute('aria-pressed')).toBe('true'))
      expect(html.classList.contains('dark')).toBe(true)

      fireEvent.click(modeSwitch())
      expect(window.localStorage.getItem('pond:mode')).toBe('light')
      await waitFor(() => expect(modeSwitch().getAttribute('aria-pressed')).toBe('false'))
      expect(html.classList.contains('dark')).toBe(true)

      fireEvent.click(modeSwitch())
      await esc()
      expect(window.localStorage.getItem('pond:mode')).toBe('dark')
      expect(html.classList.contains('dark')).toBe(true)
    })
  })

  it('⌘. enters zen; ⌘J still reaches the composer (this harness’s AITerminal is a stub — the ask routing is AITerminal.test.tsx’s)', async () => {
    const { container } = renderShell()
    await ready()
    const toggles = jest.fn()
    window.addEventListener(TOGGLE_COMPOSER_EVENT, toggles)

    act(() => {
      fireEvent.keyDown(document, { key: '.', metaKey: true })
    })
    await waitFor(() => expect(zenOf(container)).toBe('page'))

    act(() => {
      fireEvent.keyDown(document, { key: 'j', metaKey: true })
    })
    expect(toggles).toHaveBeenCalledTimes(1)
    window.removeEventListener(TOGGLE_COMPOSER_EVENT, toggles)
  })

  it('zen is this page: opening another page ends it', async () => {
    const { container, rerenderShell } = renderShell()
    await ready()
    await palette('zen')
    await pick(/this page, everything else hidden/)
    await waitFor(() => expect(zenOf(container)).toBe('page'))

    mockNodeId = 'other'
    rerenderShell()

    await waitFor(() => expect(zenOf(container)).toBeUndefined())
  })
})
