import { fireEvent, screen } from '@testing-library/react'

/**
 * The composer starts closed. A test that types into it opens the tab first.
 * A card already open (a pending proposal holds it open) is left alone.
 */
export function openComposerIfClosed(): void {
  const card = document.querySelector('[data-part="composer-card"]')
  if (!card?.hasAttribute('data-collapsed')) return
  const opener = screen.queryByRole('button', { name: /^Open composer/ })
  if (opener) fireEvent.click(opener)
}
