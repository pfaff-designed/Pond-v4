/**
 * Shared Press-styled chrome for base-ui dialogs (ConfirmDialog, CreatePageModal,
 * and any future modal): the ink backdrop and the paper popup with its
 * scale/opacity open-close transitions. Class constants, not a component — each
 * dialog keeps its own base-ui parts and appends only its width, so a third
 * dialog never copies these strings again.
 */

export const dialogBackdropClass =
  'fixed inset-0 z-50 bg-press-ink/25 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0'

/** Popup chrome minus width — append e.g. `w-[min(24rem,calc(100vw-2rem))]`. */
export const dialogPopupClass =
  'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-press-line bg-press-paper p-6 shadow-2xl outline-none transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0'
