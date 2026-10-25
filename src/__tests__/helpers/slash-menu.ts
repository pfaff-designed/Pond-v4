import { within } from '@testing-library/react'

/**
 * A slash row's hit highlight can substring-match another row's full label
 * (`table` inside `table of contents`) — pick the row by its exact label.
 */
export const rowByLabel = (menu: HTMLElement, label: string): HTMLElement =>
  within(menu)
    .getAllByRole('option')
    .find((row) => row.querySelector('[data-part="label"]')!.textContent === label)!
