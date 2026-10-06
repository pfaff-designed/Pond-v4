import { PondAtom } from '@/components/atoms/PondAtom'
import type { DueAtom } from './due'

/**
 * A record's due date as text: `wed 23`, or `today`. Today is the orange pill only
 * when `orange` — the screen's single claim — and a plain word otherwise.
 */
export function DueMark({
  due,
  orange,
  part,
}: {
  due: DueAtom | null
  orange: boolean
  /** The `data-part` of the plain text. */
  part: string
}) {
  if (!due) return null
  if (due.kind === 'today' && orange) return <PondAtom kind="date" due="today" />
  return <span data-part={part}>{due.kind === 'today' ? 'today' : due.label}</span>
}
