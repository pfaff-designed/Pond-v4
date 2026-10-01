/**
 * The kind label a template applies (issue #154).
 *
 * A page's kind is the human, EDITABLE label under its title, stored in
 * `props.kind` (see `createPageFromProposal`, `src/lib/pages/create-page.ts`).
 * Applying a template writes the template's kind into that same label and
 * nothing else — no new column, no back-reference. Once written it is the
 * person's to change like any other label; it is not provenance (that is the
 * separate, one-way stamp in `provenance.ts`).
 */

import type { PondTemplate } from './types'

/** Pure: returns new props with `kind` set to the template's kind; input untouched. */
export function applyKindLabel(
  props: Record<string, unknown>,
  template: Pick<PondTemplate, 'kind'>
): Record<string, unknown> {
  return { ...props, kind: template.kind }
}
