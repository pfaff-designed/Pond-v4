'use client'

/**
 * A styled, in-app confirm dialog (ticket-27) — the in-app replacement for the
 * native `window.confirm()`. Used for destructive actions that take more
 * than the acting item with them, e.g. deleting a page that has a whole subtree
 * inside it: the dialog states the real blast radius ("Deletes 3 pages inside.")
 * so a subtree delete never reads the same as an empty-page delete.
 *
 * Leaf/block deletes skip this entirely and go straight to the undo toast — this
 * modal is reserved for the irreversible, multi-item case.
 *
 * Built on base-ui's AlertDialog (focus trap, Esc, role="alertdialog", initial
 * focus on the least-destructive action). Controlled: the host owns `open`.
 * Purely presentational — no delete logic lives here.
 */

import { AlertDialog } from '@base-ui/react/alert-dialog'
import { dialogBackdropClass, dialogPopupClass } from '@/components/atoms/dialog-chrome'
import { Button, buttonVariants } from '@/components/ui/button'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Heading, e.g. `Delete "Health"?` */
  title: string
  /** The blast-radius line, e.g. `Deletes 3 pages inside.` Omit for a plain confirm. */
  blastRadius?: string
  /** Label for the confirming (destructive) action. */
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  blastRadius,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
}: ConfirmDialogProps) {
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
                <span className="font-medium text-mn-text">{blastRadius}</span> This can&apos;t
                be undone.
              </>
            ) : (
              <>This can&apos;t be undone.</>
            )}
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Close className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              {cancelLabel}
            </AlertDialog.Close>
            <Button size="sm" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
