'use client'

/**
 * The pond switcher in the rail head (#319, `Pond 06.13` `s6m1`).
 *
 * The board: "The pond's name sits at the top of the rail. Clicking it lists every
 * pond, with ⌘1, ⌘2 and ⌘3 to jump straight to one." And: "the switcher IS the
 * rail header. Nothing else in the rail changes until you pick."
 *
 * The head is the pond's 13px glyph, its name at 13.5 / 500 in full ink and a 9px
 * chevron, padded `0 16px 12px`.
 *
 * ⌘1–⌘3 and their hints bind only in a desktop app: the browser keeps them for tab
 * switching (AUDIT K1, decided 8 oct). Deliberately not here yet, each recorded as
 * fog on #312: `manage ponds` (settings has no route yet), archive, and the two
 * shared-pond sections (M2). A dead affordance is worse than none — the same rule
 * that kept `import from notes` out of #177.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePond } from '@/lib/pond/context'
import { Caret } from '@/components/atoms/Caret'
import { PondMark } from '@/components/atoms/PondMark'
import { NewPondFlow } from './NewPondFlow'
import { pondHref } from '@/lib/pond/active'
import { usePondGlyph } from '@/lib/pond/glyph'
import { useRenamePond } from '@/lib/pond/use-rename-pond'
import { GLYPHS, GlyphRow } from '@/components/molecules/GlyphRow'

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
  /** Sits at the right of the pond name — the rail's minimize button. */
  trailing?: ReactNode
}

export function PondSwitcher({ fallbackName, trailing }: PondSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const { pond: active, ponds } = usePond()
  const pondGlyph = usePondGlyph()
  const { rename } = useRenamePond()

  // The rename editor's draft — local until Enter commits it via `rename` (KAN-492).
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftGlyph, setDraftGlyph] = useState<string>(GLYPHS[0])
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }, [editing])

  const handleRenameStart = () => {
    setDraftName(active?.name ?? '')
    setDraftGlyph(active?.glyph ?? GLYPHS[0])
    setEditing(true)
  }

  const handleSave = () => {
    const trimmed = draftName.trim()
    if (!trimmed || !active) return
    setEditing(false)
    setOpen(false)
    rename(active.id, { name: trimmed, glyph: draftGlyph })
  }

  const handleCancel = () => {
    setEditing(false)
  }

  // Esc is handled on `document` rather than the field's own `onKeyDown` so a
  // second Esc — now that `editing` is false — still reaches this listener and
  // closes the popover (AUDIT, "no Escape handling in PondSwitcher").
  useEffect(() => {
    if (!open) return
    const handleDocumentKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (editing) handleCancel()
      else setOpen(false)
    }
    document.addEventListener('keydown', handleDocumentKeyDown)
    return () => document.removeEventListener('keydown', handleDocumentKeyDown)
  }, [open, editing])

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
    <div data-part="rail-head" className="flex items-center justify-between gap-2 px-4 pb-3">
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
              setEditing(false)
            }}
          />
          {/* The board's `top: 44` is from the rail CARD's top edge, so the menu
              positions against the card (the nearest positioned ancestor — the head
              is deliberately not one) and the card lets it overflow while open. */}
          <div
            role="menu"
            aria-label="Ponds"
            className="absolute top-[44px] right-[10px] left-[10px] z-[5] flex flex-col gap-[1px] rounded-[16px] p-[6px] font-sans text-mn-text [background:var(--mn-menu-bg)] [backdrop-filter:blur(24px)_saturate(1.3)] [border:var(--mn-menu-border)] [box-shadow:var(--mn-menu-shadow)]"
          >
            {!editing && (
              <>
                <div className="px-[10px] pt-[6px] pb-[4px] font-sans text-[10.5px] leading-[normal] font-medium tracking-[0.1em] text-mn-text-secondary uppercase">
                  ponds
                </div>

                {ponds.map((p) => (
                  <a
                    key={p.id}
                    role="menuitem"
                    href={pondHref(p.id, p.lastPageId)}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-[9px] rounded-[10px] px-[10px] py-[7px] text-[13px] leading-[normal] ${
                      p.id === active?.id ? 'bg-mn-text/[0.07] font-medium' : 'font-normal'
                    }`}
                  >
                    {p.glyph && <PondMark glyph={p.glyph} />}
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {p.id === active?.id && (
                      <span className="font-mono text-[10.5px] text-mn-text">✓</span>
                    )}
                  </a>
                ))}

                {/* Rename + glyph for the active pond (KAN-492): its own row, not a
                    second affordance on the active pond's row above. */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleRenameStart}
                  className="flex items-center gap-[9px] rounded-[10px] px-[10px] py-[7px] text-[13px] leading-[normal] font-normal text-mn-text-meta"
                >
                  <span className="min-w-0 flex-1 truncate text-left">rename & icon</span>
                </button>

                <div className="mx-[8px] my-[4px] h-px bg-mn-text/[0.09]" />

                {/* `s6m2`: the board draws a three-step SHEET over a paper scrim, not a
                    field in the menu. This row opens it (#316). */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setNaming(true)
                    setOpen(false)
                  }}
                  className="flex items-center gap-[9px] rounded-[10px] px-[10px] py-[7px] text-[13px] leading-[normal] font-normal text-mn-text-meta"
                >
                  <Plus />
                  <span className="min-w-0 flex-1 truncate text-left">new pond</span>
                </button>
              </>
            )}

            {editing && (
              <div className="flex flex-col gap-[10px] px-[10px] py-[7px]">
                <input
                  ref={nameInputRef}
                  type="text"
                  aria-label="pond name"
                  value={draftName}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave()
                    else if (e.key === 'Escape') handleCancel()
                  }}
                  className="min-w-0 rounded-[10px] bg-mn-text/[0.04] px-[10px] py-[7px] text-[13px] leading-[normal] text-mn-text caret-mn-text outline-none"
                />
                <GlyphRow value={draftGlyph} onChange={setDraftGlyph} />
              </div>
            )}
          </div>
        </>
      )}

      {naming && <NewPondFlow onClose={() => setNaming(false)} />}
    </div>
  )
}
