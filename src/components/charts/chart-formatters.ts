export const shortDateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

export const weekdayDateFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

export const hmsTimeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

// `Intl.NumberFormat.prototype.format` is a bound getter — safe to extract.
export const intFmt = new Intl.NumberFormat("en-US").format;

/** True for a Date that holds a real instant (Invalid Date fails this). */
export function isValidDate(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * `shortDateFmt.format` that never throws: `Intl.DateTimeFormat#format` raises a
 * RangeError on an Invalid Date, which took a whole page down when a categorical
 * x value reached the time-series shell (#94). The data layer now keeps non-dates
 * off this path; this is the belt to that brace — an invalid date reads as "".
 */
export function safeShortDate(d: Date): string {
  return isValidDate(d) ? shortDateFmt.format(d) : "";
}

export function safeWeekdayDate(d: Date): string {
  return isValidDate(d) ? weekdayDateFmt.format(d) : "";
}
