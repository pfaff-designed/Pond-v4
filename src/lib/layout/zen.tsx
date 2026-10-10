'use client'

/**
 * Zen — a mode of the page in view, not a copy or a separate editor (`Pond 06.17`
 * 6q, `Pond 07.07` 7g). The shell owns it: in zen the rail, the breadcrumb and the
 * composer go and the page is left; esc, or ⌘K › leave zen, puts every one of them
 * back where it was, the page's scroll included (frame 11).
 *
 * `zen, on ink` (frame 10) is the same page on the ink ground: it holds the theme's
 * ink ground (`lib/theme/mode`) for as long as zen lasts, which never touches the
 * person's own mode.
 *
 * The chrome stays MOUNTED while hidden — the rail's tree, the composer's thread
 * and draft survive zen because nothing is torn down.
 *
 * Zen belongs to the page it was entered on: opening another page ends it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { useSearchParams } from 'next/navigation'

import { PAGE_COLUMN_PAD_PX, TEXT_BLOCK_INSET_PX } from '@/lib/layout/surface-column'
import { holdInkGround } from '@/lib/theme/mode'

export interface Zen {
  /** `zen, on ink` (frame 10): the page on the ink ground, whatever the theme. */
  onInk: boolean
}

interface ZenValue {
  zen: Zen | null
  /** True once zen has been entered this session — the chrome fades back only after it. */
  hasEntered: boolean
  enterZen: (zen: Zen) => void
  leaveZen: () => void
}

const ZenContext = createContext<ZenValue>({
  zen: null,
  hasEntered: false,
  enterZen: () => {},
  leaveZen: () => {},
})

export const useZen = (): ZenValue => useContext(ZenContext)

/** 6q frame 3: the text column. */
export const ZEN_TEXT_PX = 600
export const ZEN_COLUMN_PX = ZEN_TEXT_PX + 2 * (PAGE_COLUMN_PAD_PX + TEXT_BLOCK_INSET_PX)
/** 6q frame 3: the column's top, from the top of the screen. */
export const ZEN_TOP_PX = 96
/** 6q frame 3: `gap 22` between everything in the column — paragraphs and blocks alike. */
export const ZEN_GAP_PX = 22
/** 6q frame 3: the body. */
export const ZEN_BODY_PX = 21

/**
 * `PondAtom.dc.html`'s page type, desktop — what `TEXT_PROSE_CLASS` sets; a test
 * holds the two together. Zen scales all of it by one factor, so the body lands
 * on frame 3's 21 and every other role keeps its relation to the body.
 */
export const POND_ATOM_PAGE_TYPE_PX = {
  prose: 17.5,
  h1: 38,
  h2: 22,
  h3: 18,
  h4: 16,
  h5: 13.5,
  h6: 11,
  quote: 19,
} as const
export const ZEN_TYPE_SCALE = ZEN_BODY_PX / POND_ATOM_PAGE_TYPE_PX.prose

/** A page size as zen sets it: the one factor, to two places. */
export const zenPx = (pagePx: number): number => Number((pagePx * ZEN_TYPE_SCALE).toFixed(2))

type CSSVars = CSSProperties & Record<`--${string}`, string>

/** The type and the gap, as variables on the zen column that its classes read. */
const ZEN_VARS: CSSVars = Object.fromEntries([
  ['--zen-gap', `${ZEN_GAP_PX}px`],
  ...Object.entries(POND_ATOM_PAGE_TYPE_PX).map(([role, px]) => [
    `--zen-${role}`,
    `${zenPx(px)}px`,
  ]),
])

/** 6q frame 3: the title — PP Editorial New 200, 44 / 1.05, −.01em. */
export const ZEN_TITLE_CLASS =
  'font-serif font-extralight text-[44px] leading-[1.05] tracking-[-0.01em]'

/**
 * Zen's type, set on the zen column and reached into both renders of a text block
 * (the editor and the static prose), so the page's text block keeps `PondAtom`'s
 * values everywhere else. Code keeps its own mono size.
 */
export const ZEN_PROSE_CLASS = [
  '[&_:is([data-text-prose],.ProseMirror)]:text-[length:var(--zen-prose)]',
  '[&_:is([data-text-prose],.ProseMirror)]:leading-[1.7]',
  '[&_:is([data-text-prose],.ProseMirror)>*+*]:mt-[var(--zen-gap)]',
  '[&_:is([data-text-prose],.ProseMirror)_h1]:text-[length:var(--zen-h1)]',
  '[&_:is([data-text-prose],.ProseMirror)_h2]:text-[length:var(--zen-h2)]',
  '[&_:is([data-text-prose],.ProseMirror)_h3]:text-[length:var(--zen-h3)]',
  '[&_:is([data-text-prose],.ProseMirror)_h4]:text-[length:var(--zen-h4)]',
  '[&_:is([data-text-prose],.ProseMirror)_h5]:text-[length:var(--zen-h5)]',
  '[&_:is([data-text-prose],.ProseMirror)_h6]:text-[length:var(--zen-h6)]',
  '[&_:is([data-text-prose],.ProseMirror)_blockquote]:text-[length:var(--zen-quote)]',
].join(' ')

/** The block list in zen: no chrome between blocks, frame 3's gap instead. */
export const ZEN_BLOCK_LIST_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  rowGap: ZEN_GAP_PX,
}

interface ColumnProps {
  className: string
  style: CSSProperties
}

/** The page column in zen: zen's width and top, its type, settling in as it opens. */
export const zenColumn = ({ className, style }: ColumnProps) => ({
  'data-zen': '',
  className: `${className} motion-settle-in ${ZEN_PROSE_CLASS}`,
  style: { ...style, ...ZEN_VARS, maxWidth: ZEN_COLUMN_PX, paddingTop: ZEN_TOP_PX },
})

/** Coming back, the chrome fades in on the settle tier; going, it is gone at once so the page does not reflow under a fade. */
export const ZEN_CHROME_RETURN =
  'transition-opacity duration-[var(--motion-settle)] ease-[var(--ease-mn)] starting:opacity-0 motion-reduce:transition-none'

const isTextField = (el: HTMLElement) => el.matches('input, textarea, [contenteditable="true"]')

/**
 * Whether an esc leaves zen. The contract: an esc you consumed, you
 * `preventDefault` — the palette, a menu, the record peek, the changes panel all
 * do — and such an esc leaves nothing else. One exception: a text field that
 * blurs on esc (the text block's editor does) lets that same esc leave zen, so
 * one press both steps out of the text and out of zen.
 */
export const escLeavesZen = (e: KeyboardEvent): boolean => {
  if (e.key !== 'Escape' || e.isComposing) return false
  if (!e.defaultPrevented) return true
  const target = e.target
  return (
    target instanceof HTMLElement &&
    target.isConnected &&
    isTextField(target) &&
    document.activeElement !== target
  )
}

/** The element the page scrolls in: its canvas once a page is drawn, else the shell's content column. */
const pageScroller = (root: HTMLElement): HTMLElement =>
  root.querySelector<HTMLElement>('[data-part="page-canvas"]') ?? root

const pageScrollTop = (root: RefObject<HTMLElement | null>): number =>
  root.current ? pageScroller(root.current).scrollTop : 0

interface Session extends Zen {
  pageId: string | null
  scrollTop: number
}

export const ZenProvider = ({
  scrollRoot,
  children,
}: {
  /** The shell's content column; the page's scroll is read and restored beneath it. */
  scrollRoot: RefObject<HTMLElement | null>
  children: ReactNode
}) => {
  const pageId = useSearchParams().get('nodeId')
  const [session, setSession] = useState<Session | null>(null)
  const [hasEntered, setHasEntered] = useState(false)
  const restoreTo = useRef<number | null>(null)

  if (session && session.pageId !== pageId) setSession(null)

  const enterZen = useCallback(
    ({ onInk }: Zen) => {
      setSession({ onInk, pageId, scrollTop: pageScrollTop(scrollRoot) })
      setHasEntered(true)
    },
    [pageId, scrollRoot]
  )

  const leaveZen = useCallback(() => {
    if (!session) return
    restoreTo.current = session.scrollTop
    setSession(null)
  }, [session])

  // After the chrome and the page's own type are back, so the offset lands on the page as it was.
  useLayoutEffect(() => {
    const root = scrollRoot.current
    if (session || restoreTo.current === null || !root) return
    pageScroller(root).scrollTop = restoreTo.current
    restoreTo.current = null
  }, [session, scrollRoot])

  const onInk = session?.onInk ?? false
  useLayoutEffect(() => (onInk ? holdInkGround() : undefined), [onInk])

  // Bubble phase on the window: every other esc owner has had the press first.
  useEffect(() => {
    if (!session) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (escLeavesZen(e)) leaveZen()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [session, leaveZen])

  const zen = useMemo<Zen | null>(() => (session ? { onInk: session.onInk } : null), [session])
  const value = useMemo(
    () => ({ zen, hasEntered, enterZen, leaveZen }),
    [zen, hasEntered, enterZen, leaveZen]
  )
  return <ZenContext.Provider value={value}>{children}</ZenContext.Provider>
}

/** Shell chrome zen hides: the rail, the composer. `className` is its layout while shown. */
export const ZenChrome = ({
  className = '',
  children,
}: {
  className?: string
  children: ReactNode
}) => {
  const { zen, hasEntered } = useZen()
  const shown = `${className} ${hasEntered ? ZEN_CHROME_RETURN : ''}`
  return (
    <div data-part="zen-chrome" className={zen ? 'hidden' : shown}>
      {children}
    </div>
  )
}
