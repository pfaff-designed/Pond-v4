'use client'

/**
 * The pond switcher in the rail head (#319, `Pond 06.13` `s6m1`).
 *
 * The board: "The pond's name sits at the top of the rail. Clicking it lists every
 * pond, with ⌘1, ⌘2 and ⌘3 to jump straight to one." And: "the switcher IS the
 * rail header. Nothing else in the rail changes until you pick."
 *
 * Head treatment follows `Pond 05 Shell`, which renders the head identically in
 * all 18 of its frames — sans 500 / 11, uppercase, .14em, no mark. `PondRail`
 * disagrees (mask glyph + lowercase 13.5); that conflict is recorded on #319 and
 * is NOT settled here, so this keeps what ships and adds only the chevron, which
 * BOTH boards draw. Changing the type treatment would break three assertions in
 * `shell-reskin.test.tsx` that encode ADR 0002's M1 trim, and that is its own
 * slice.
 *
 * Deliberately not here, each recorded as fog on #312: ⌘1–⌘3 (the shortcut
 * collides with browser tab switching, AUDIT K1), `manage ponds` (settings has no
 * route yet), archive, and the two shared-pond sections (M2). A dead affordance
 * is worse than none — the same rule that kept `import from notes` out of #177.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPond, listPonds, type Pond } from '@/lib/pond/client'
import { pondHref, resolveActivePond, useActivePondId } from '@/lib/pond/active'

/** The board's 9×9 chevron: `margin-left:6px`, `opacity:.8`, rotates when open. */
function SwitcherChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 9 9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`ml-[6px] flex-none opacity-80 transition-transform duration-[var(--motion-settle)] ease-[var(--ease-mn)] ${
        open ? 'rotate-180' : ''
      }`}
    >
      <path d="M2 3.5 L4.5 6 L7 3.5" />
    </svg>
  )
}

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

export function PondSwitcher({ fallbackName }: { fallbackName: string }) {
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [ponds, setPonds] = useState<Pond[]>([])
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const router = useRouter()
  const activeId = useActivePondId()
  const active = resolveActivePond(ponds, activeId)

  // Deliberately NOT react-query. The rail head had no QueryClientProvider
  // requirement before this component, and four suites plus several stories render
  // the rail without one — imposing a provider here would be a wide change for one
  // small list. The switcher owns its own fetch instead.
  const load = useCallback(() => {
    listPonds()
      .then(setPonds)
      .catch(() => setPonds([]))
  }, [])

  useEffect(load, [load])

  async function submit() {
    if (pending) return
    setPending(true)
    setFailure(null)
    try {
      const pond = await createPond(draft)
      setNaming(false)
      setDraft('')
      setOpen(false)
      load()
      router.push(pondHref(pond.id))
    } catch (err) {
      setFailure((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  // Before migration 0018 is applied the table does not exist and `listPonds`
  // returns []. The head then renders exactly as it did before — a name, no
  // chevron — rather than offering a switcher that cannot list anything.
  const hasPonds = ponds.length > 0

  return (
    <div data-part="rail-head" className="relative flex items-center px-4 pb-3">
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
          className={`-mx-[6px] -my-[4px] flex min-w-0 items-center rounded-[8px] px-[6px] py-[4px] select-none ${
            open ? 'bg-mn-text/[0.07]' : 'bg-transparent'
          }`}
        >
          <span
            data-part="pond-name"
            className="text-mn-11 text-foreground min-w-0 truncate font-sans leading-[normal] font-medium tracking-[0.14em] uppercase"
          >
            {active?.name ?? fallbackName}
          </span>
          <SwitcherChevron open={open} />
        </button>
      ) : (
        <span
          data-part="pond-name"
          className="text-mn-11 text-foreground min-w-0 truncate font-sans leading-[normal] font-medium tracking-[0.14em] uppercase select-none"
        >
          {fallbackName}
        </span>
      )}

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
          <div
            role="menu"
            aria-label="Ponds"
            className="mn-glass absolute top-[30px] right-[10px] left-[10px] z-[5] flex flex-col gap-[1px] rounded-[16px] p-[6px] text-mn-text"
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
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.id === active?.id && (
                  <span className="font-mono text-[10.5px] text-mn-text">✓</span>
                )}
              </a>
            ))}

            <div className="mx-[8px] my-[4px] h-px bg-mn-text/[0.09]" />

            {naming ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void submit()
                }}
                className="px-[10px] py-[4px]"
              >
                {/* `s6m2`: the name is typed, and skipping gives "untitled pond" —
                    so an empty submit is legal and the column default supplies it. */}
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setNaming(false)
                  }}
                  placeholder="name it, or ↵ for untitled pond"
                  aria-label="New pond name"
                  disabled={pending}
                  className="w-full bg-transparent font-mono text-[12.5px] leading-[normal] text-mn-text placeholder:text-mn-text-secondary focus:outline-none"
                />
              </form>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => setNaming(true)}
                className="flex items-center gap-[9px] rounded-[10px] px-[10px] py-[7px] text-[13px] leading-[normal] text-mn-text-meta"
              >
                <Plus />
                <span className="min-w-0 flex-1 truncate text-left">new pond</span>
              </button>
            )}

            {failure && (
              <div className="px-[10px] pt-[2px] pb-[6px] font-mono text-[10.5px] leading-[normal] text-mn-signal-removed">
                could not make it. {failure}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
