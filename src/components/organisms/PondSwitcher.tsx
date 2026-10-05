'use client'

/**
 * The pond switcher in the rail head (#319, `Pond 06.13` `s6m1`).
 *
 * The board: "The pond's name sits at the top of the rail. Clicking it lists every
 * pond, with ⌘1, ⌘2 and ⌘3 to jump straight to one." And: "the switcher IS the
 * rail header. Nothing else in the rail changes until you pick."
 *
 * The head is the pond's 13px glyph, its name at 13.5 / 500 in full ink and a 9px
 * chevron, padded `0 16px 12px`, with `trailing` (the reminders bell) at the far end.
 *
 * Deliberately not here, each recorded as fog on #312: ⌘1–⌘3 (the shortcut
 * collides with browser tab switching, AUDIT K1), `manage ponds` (settings has no
 * route yet), archive, and the two shared-pond sections (M2). A dead affordance
 * is worse than none — the same rule that kept `import from notes` out of #177.
 */

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createPond } from '@/lib/pond/client'
import { usePond } from '@/lib/pond/context'
import { AreaMark } from '@/components/atoms/AreaMark'
import { Caret } from '@/components/atoms/Caret'
import { PondMark } from '@/components/atoms/PondMark'
import { NewPondSheet } from './NewPondSheet'
import { pondHref } from '@/lib/pond/active'
import { usePondGlyph } from '@/lib/pond/glyph'

/** The board's `menuRow` plus a 12×12 stroked plus. */
function Plus() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden
      className="flex-none"
    >
      <path d="M6 2.4v7.2M2.4 6h7.2" />
    </svg>
  )
}

interface PondSwitcherProps {
  fallbackName: string
  /** The head's right-hand end (the rail's reminders bell). */
  trailing?: ReactNode
}

export function PondSwitcher({ fallbackName, trailing }: PondSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const router = useRouter()

  // ONE source of truth. The switcher used to run its own `listPonds`, which is
  // how a created pond could be in the URL while the shell's list still lacked it
  // — the shell then resolved back to the first pond and the new pond showed its
  // pages. Both now read the same provider.
  const { pond: active, ponds, addPond } = usePond()
  const pondGlyph = usePondGlyph()

  async function create(name: string) {
    if (pending) return
    setPending(true)
    setFailure(null)
    try {
      const pond = await createPond(name)
      setNaming(false)
      setOpen(false)
      // Into the list BEFORE the navigation, so the shell can resolve the pond the
      // URL is about to name.
      addPond(pond)
      router.push(pondHref(pond.id))
    } catch (err) {
      setFailure((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  // Before migration 0018 is applied the table does not exist and `listPonds`
  // returns []. The head then renders the glyph and name without the chevron —
  // rather than offering a switcher that cannot list anything.
  const hasPonds = ponds.length > 0

  const switcherClass =
    'flex min-w-0 items-center gap-[7px] rounded-[8px] px-[6px] py-[4px] -mx-[6px] -my-[4px] select-none'
  const label = (
    <>
      <PondMark glyph={pondGlyph} />
      <span
        data-part="pond-name"
        className="min-w-0 truncate font-sans text-[13.5px] leading-[normal] font-medium text-mn-text"
      >
        {active?.name ?? fallbackName}
      </span>
      {hasPonds && (
        <Caret className={`text-mn-text-secondary ${open ? '-rotate-90' : 'rotate-90'}`} />
      )}
    </>
  )

  return (
    <div
      data-part="rail-head"
      className="relative flex items-center justify-between gap-2 px-4 pb-3"
    >
      {hasPonds ? (
        <button
          type="button"
          data-part="pond-switcher"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v)
            setNaming(false)
          }}
          className={`${switcherClass} ${open ? 'bg-mn-text/[0.07]' : 'bg-transparent'}`}
        >
          {label}
        </button>
      ) : (
        <span className={switcherClass}>{label}</span>
      )}

      {trailing}

      {open && hasPonds && (
        <>
          {/* Click-away. No scrim: the board draws none over the rail. */}
          <div
            className="fixed inset-0 z-[4]"
            aria-hidden
            onClick={() => {
              setOpen(false)
              setNaming(false)
            }}
          />
          {/* The board's `top: 44` is from the rail's top edge; the head starts 18px down. */}
          <div
            role="menu"
            aria-label="Ponds"
            className="mn-glass absolute top-[26px] right-[10px] left-[10px] z-[5] flex flex-col gap-[1px] rounded-[16px] p-[6px] text-mn-text"
          >
            <div className="px-[10px] pt-[6px] pb-[4px] font-mono text-[10.5px] leading-[normal] font-medium tracking-[0.1em] text-mn-text-secondary uppercase">
              ponds
            </div>

            {ponds.map((p) => (
              <a
                key={p.id}
                role="menuitem"
                href={pondHref(p.id)}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-[9px] rounded-[10px] px-[10px] py-[7px] text-[13px] leading-[normal] ${
                  p.id === active?.id ? 'bg-mn-text/[0.07] font-medium' : 'font-normal'
                }`}
              >
                {p.glyph && <AreaMark glyph={p.glyph} color="var(--mn-text)" />}
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.id === active?.id && (
                  <span className="font-mono text-[10.5px] text-mn-text">✓</span>
                )}
              </a>
            ))}

            <div className="mx-[8px] my-[4px] h-px bg-mn-text/[0.09]" />

            {/* `s6m2`: the board draws a three-step SHEET over a paper scrim, not a
                field in the menu. This row opens it (#316). */}
            <button
              type="button"
              role="menuitem"
              onClick={() => setNaming(true)}
              className="flex items-center gap-[9px] rounded-[10px] px-[10px] py-[7px] text-[13px] leading-[normal] text-mn-text-meta"
            >
              <Plus />
              <span className="min-w-0 flex-1 truncate text-left">new pond</span>
            </button>
          </div>
        </>
      )}

      {naming && (
        <NewPondSheet
          onCreate={(name) => void create(name)}
          onCancel={() => {
            setNaming(false)
            setFailure(null)
          }}
          pending={pending}
          failure={failure}
        />
      )}
    </div>
  )
}
