'use client'

/**
 * A styled, in-app confirm dialog (ticket-27) — the in-app replacement for the
 * native `window.confirm()`. Used for destructive actions that take more
 * than the acting item with them, e.g. deleting a page that has a whole subtree
 * inside it: the dialog states the real blast radius ("Deletes 3 pages inside.")
 * so a subtree delete never reads the same as an empty-page delete.
 *
 * A block that already holds something confirms here before the undo-toast
 * delete. An empty block, and a page delete that takes only itself, skip this
 * and go straight to the toast. A page that has other pages inside it uses
 * this dialog for that blast radius.
 *
 * Built on base-ui's AlertDialog (focus trap, Esc, role="alertdialog", initial
 * focus on the least-destructive action). Controlled: the host owns `open`.
 * Purely presentational — no delete logic lives here.
 */

import { useState } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { dialogBackdropClass, dialogPopupClass } from '@/components/atoms/dialog-chrome'
import { Button, buttonVariants } from '@/components/ui/button'
import { PondControl } from '@/components/atoms/PondControl'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Heading, e.g. `Delete "Health"?` */
  title: string
  /** The blast-radius line, e.g. `Deletes 3 pages inside.` Omit for a plain confirm. */
  blastRadius?: string
  /** The line after `blastRadius` (or alone, with no `blastRadius`) stating what the
   * action means. Defaults to the irreversible-delete copy; override it for an action
   * with a different consequence, e.g. a delete that goes to trash instead. */
  consequence?: string
  /** Label for the confirming (destructive) action. */
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  /**
   * The exact text the person must type (trimmed, case-sensitive) before
   * `confirmLabel` enables, e.g. a pond's name (KAN-493). Omit for today's
   * dialog, which enables immediately.
   */
  requiredText?: string
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  blastRadius,
  consequence = "This can't be undone.",
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  requiredText,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('')
  // Adjusted during render (not an effect) per the "reset state on prop
  // change" pattern — a reopened dialog starts from a blank field rather
  // than the last attempt.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setTyped('')
  }
  const confirmDisabled = requiredText !== undefined && typed.trim() !== requiredText
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={dialogBackdropClass} />
        <AlertDialog.Popup className={`${dialogPopupClass} w-[min(24rem,calc(100vw-2rem))]`}>
          <AlertDialog.Title className="text-base font-semibold text-foreground">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-mn-text-secondary">
            {blastRadius ? (
              <>
                <span className="font-medium text-mn-text">{blastRadius}</span> {consequence}
              </>
            ) : (
              <>{consequence}</>
            )}
          </AlertDialog.Description>
          {requiredText !== undefined && (
            <PondControl
              kind="field"
              label={`Type "${requiredText}" to confirm`}
              value={typed}
              onValueChange={setTyped}
              fullWidth
              autoFocus
              className="mt-3"
            />
          )}
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Close className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              {cancelLabel}
            </AlertDialog.Close>
            <Button size="sm" disabled={confirmDisabled} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
