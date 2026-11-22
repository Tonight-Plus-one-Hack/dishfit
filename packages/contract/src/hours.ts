import type { OpeningHours } from "./model";

export const APP_TIME_ZONE = "Europe/Berlin";

const WEEK_MINUTES = 7 * 24 * 60;
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Minutes since Sunday 00:00 in the given time zone. */
export function minuteOfWeek(at: Date, timeZone = APP_TIME_ZONE): number {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" });
    formatters.set(timeZone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(at).map((p) => [p.type, p.value]));
  return (WEEKDAYS[parts.weekday ?? ""] ?? 0) * 1440 + Number(parts.hour) * 60 + Number(parts.minute);
}

/**
 * Whether a place is open at a moment, from its opening hours (periods as in OpeningHours).
 * Periods may run past midnight and past Saturday into Sunday.
 * Returns null when the hours are unknown.
 */
export function isOpenAt(hours: OpeningHours | null, at: Date, timeZone = APP_TIME_ZONE): boolean | null {
  if (!hours || hours.periods.length === 0) return null;
  const now = minuteOfWeek(at, timeZone);
  return hours.periods.some(({ open, close }) => {
    if (!close) return true;
    const start = open.day * 1440 + open.hour * 60 + open.minute;
    let end = close.day * 1440 + close.hour * 60 + close.minute;
    if (end <= start) end += WEEK_MINUTES;
    return (now >= start && now < end) || (now + WEEK_MINUTES >= start && now + WEEK_MINUTES < end);
  });
}
