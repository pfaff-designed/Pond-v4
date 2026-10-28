'use client'

/**
 * HeaderMenu (KAN-380, #521) — the rename/delete menu shared by the table's
 * field header and the board's column (lane) header: a `PondMenu` (`kind:
 * 'block'`) whose first group is the name row and whose second ("delete
 * <entityLabel>") is drawn only when `canDelete`. `entityLabel` ("field" /
 * "column") words every copy-bearing bit — the aria labels, the collision
 * note, the delete row — so the one menu serves both headers without either
 * host repeating its validation or its keyboard handling.
 *
 * Validation (empty/whitespace, a collision per the caller's own `clash`) is
 * owned here, not by the caller: an invalid commit shows a one-line note and
 * keeps the menu open, writing nothing. A valid, changed commit calls
 * `onRename` and — only when it came from Enter — closes the menu; the
 * wiring host owns the actual schema write. `lastCommitBlockedRef` is read by
 * the wrapper's own Enter handler, which runs AFTER `DraftInput`'s own
 * keydown → blur → onCommit chain (same native event, still synchronous, so
 * the ref is never stale by the time Enter decides whether to close).
 */

import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import type { Menu } from '@base-ui/react/menu'
import { DraftInput } from '@/components/atoms/draft-input'
import { PondMenu, type PondMenuGroup, type PondMenuPlacement } from '@/components/molecules/PondMenu'

type HeaderMenuAction = { type: 'delete' }

export interface HeaderMenuProps {
  /** The current name/label being edited. */
  name: string
  /** What this entity is called in copy — "field" for a table column header,
   *  "column" for a board lane header. Words the aria labels, the delete
   *  row, and the collision note. */
  entityLabel: string
  /** The rename row's collision guard: the existing name/label `candidate`
   *  collides with, or `null` when it's free — `fieldNameClash`/
   *  `optionNameClash`, already scoped to the right sibling set by the
   *  caller. */
  clash: (candidate: string) => string | null
  /** Hidden for the title column / the "No <name>" lane — neither is a real
   *  field/option the caller owns deleting. */
  canDelete: boolean
  onRename: (name: string) => void
  onDelete: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactElement
  placement: PondMenuPlacement
  container?: Menu.Portal.Props['container']
}

export function HeaderMenu({
  name,
  entityLabel,
  clash,
  canDelete,
  onRename,
  onDelete,
  open,
  onOpenChange,
  trigger,
  placement,
  container,
}: HeaderMenuProps) {
  const [note, setNote] = useState<string | null>(null)
  const lastCommitBlockedRef = useRef(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const stopFocusStealRef = useRef<(() => void) | null>(null)

  // A fresh name input mounts on every open (Base UI unmounts the closed
  // popup), but this component itself stays mounted across the toggle — so
  // its own note/ref state needs its own reset. Reset from the open-change
  // handler itself, not an effect keyed on `open`: a ref can't be read or
  // written during render (react-hooks/refs), and this way the reset lands
  // in the same event as the open, not a cascading render.
  const handleOpenChange = (next: boolean) => {
    stopFocusStealRef.current?.()
    stopFocusStealRef.current = null
    if (next) {
      setNote(null)
      lastCommitBlockedRef.current = false
      // Base UI's own composite-list navigation focuses the menu's first
      // item ("delete <entityLabel>") whenever the menu opens from a key
      // press on the trigger, overriding this row's own autofocus into the
      // name input — right for an all-items menu, wrong here, where the
      // first row is text, not an item. The steal itself runs from a Base UI
      // effect whose timing (this render vs. a later one, once the popup
      // actually mounts) isn't something to guess at: listen for the real
      // focus move and redirect it, once, back to the input. Attached here
      // — synchronously, in the same event that flips `open` — so it is in
      // place before any of Base UI's own effects for the resulting render
      // can run.
      const stealFocusBack = (e: FocusEvent) => {
        const input = wrapperRef.current?.querySelector('input')
        if (!input) return
        document.removeEventListener('focusin', stealFocusBack)
        stopFocusStealRef.current = null
        if (e.target === input) return
        input.focus()
        input.select()
      }
      document.addEventListener('focusin', stealFocusBack)
      stopFocusStealRef.current = () => document.removeEventListener('focusin', stealFocusBack)
    }
    onOpenChange(next)
  }

  // The listener above is removed as soon as it fires or the menu closes —
  // this only catches the case where the component itself unmounts while
  // still open (e.g. the field/column it belongs to is deleted mid-menu).
  useEffect(() => () => stopFocusStealRef.current?.(), [])

  const handleCommit = (raw: string) => {
    const trimmed = raw.trim()
    // An empty/whitespace-only name reverts exactly like Esc — no note, no
    // write, menu closes — rather than being refused like a name collision.
    if (trimmed === '') {
      lastCommitBlockedRef.current = false
      setNote(null)
      return
    }
    const clashed = clash(trimmed)
    lastCommitBlockedRef.current = clashed !== null
    if (clashed) {
      // The note names the EXISTING field/option's own-cased name, not the
      // candidate's casing — a collision is case-insensitive, but the note
      // should read like a fact about the schema, not an echo of the typo.
      setNote(`a ${entityLabel} is already called ${clashed}`)
      // DraftInput's own Enter handler already blurred the input to reach
      // this commit; a refusal shouldn't also cost the person their place in
      // the field/column — refocus it (the input's own `onFocus` reselects).
      wrapperRef.current?.querySelector('input')?.focus()
      return
    }
    setNote(null)
    if (trimmed !== name) onRename(trimmed)
  }

  const handleWrapperKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Base UI's own typeahead/composite-nav keydown lives on `Menu.Popup`
    // itself (PondMenu's `stopPropagation` runs too late to beat it) and
    // calls `preventDefault` on every single-character key, which blocks the
    // browser's native text insertion into this row's input. Stop the event
    // here, before it ever reaches the popup, so typing a name works at all.
    e.stopPropagation()
    if (e.key === 'Escape') {
      handleOpenChange(false)
    } else if (e.key === 'Enter') {
      if (!lastCommitBlockedRef.current) handleOpenChange(false)
    } else {
      // A refusal describes the text it was refused for; the moment the
      // person edits it, that refusal is stale and must not keep a later
      // Enter from closing the menu.
      lastCommitBlockedRef.current = false
    }
  }

  const groups: PondMenuGroup<HeaderMenuAction>[] = [
    {
      id: 'name',
      label: 'name',
      content: (
        // `px-[10px] py-[7px]` / the input's `text-[13px]` match PondMenu's own
        // `block`/`desktop` item recipe (`SIZES.block.desktop.item`) exactly —
        // this row draws no new chrome, just a different row content.
        <div ref={wrapperRef} onKeyDown={handleWrapperKeyDown} className="px-[10px] py-[7px]">
          <DraftInput
            value={name}
            onCommit={handleCommit}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            aria-label={`${entityLabel} name`}
            className="w-full rounded-[8px] bg-transparent text-[13px] text-mn-text outline-none"
          />
          {note && (
            <p className="pt-[4px] text-[11px] leading-[1.4] text-mn-text-secondary">{note}</p>
          )}
        </div>
      ),
    },
    {
      id: 'delete',
      label: entityLabel,
      items: canDelete
        ? [
            {
              id: `delete-${entityLabel}`,
              label: `delete ${entityLabel}`,
              action: { type: 'delete' },
            },
          ]
        : [],
    },
  ]

  return (
    <PondMenu
      kind="block"
      label={`${name} ${entityLabel} menu`}
      groups={groups}
      open={open}
      onOpenChange={handleOpenChange}
      onSelect={(action) => {
        if (action.type === 'delete') onDelete()
      }}
      trigger={trigger}
      placement={placement}
      container={container}
    />
  )
}
