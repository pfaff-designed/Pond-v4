/**
 * Year span. The grid is January–December of the focused year. Stepping
 * moves a whole year and keeps the month and day, clamping a day the
 * destination month does not have (29 Feb → 28 Feb).
 */

export function yearPeriodLabel(focusIso: string): string {
  return focusIso.slice(0, 4)
}

export function stepYear(focusIso: string, direction: -1 | 1): string {
  const year = Number(focusIso.slice(0, 4)) + direction
  const month = focusIso.slice(5, 7)
  const day = Number(focusIso.slice(8, 10))
  const monthIndex = Number(month)
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()
  const clamped = Math.min(day, daysInMonth)
  return `${year}-${month}-${String(clamped).padStart(2, '0')}`
}
