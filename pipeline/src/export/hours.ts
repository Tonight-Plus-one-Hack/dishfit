// OSM opening_hours -> the web contract's OpeningHours (Google-Places-like periods), same subset and
// semantics as apps/web/src/data/hours.ts: "Mo-Fr 11:00-21:30; Sa,Su 12:30-21:30", "Mo off", past midnight.

export interface OpeningPeriod { open: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }
export interface OpeningHours { periods: OpeningPeriod[]; weekdayText: string[] }

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
const ORDER = [1, 2, 3, 4, 5, 6, 0];

function dayIndex(token: string): number {
  const i = DAYS.indexOf(token.trim().slice(0, 2) as (typeof DAYS)[number]);
  if (i < 0) throw new Error(`unknown day ${token}`);
  return i;
}

function expandDays(spec: string): number[] {
  const days: number[] = [];
  for (const part of spec.split(',')) {
    const [from, to] = part.split('-').map((s) => s.trim());
    if (!to) { days.push(dayIndex(from!)); continue; }
    const a = ORDER.indexOf(dayIndex(from!));
    const b = ORDER.indexOf(dayIndex(to));
    for (let k = a; ; k = (k + 1) % 7) {
      days.push(ORDER[k]!);
      if (k === b) break;
    }
  }
  return days;
}

/** Returns null when nothing in the string could be understood ("open now" then treats it as unknown). */
export function parseOsmHours(input: string | null): OpeningHours | null {
  if (!input) return null;
  if (input.trim() === '24/7') return { periods: [{ open: { day: 0, hour: 0, minute: 0 } }], weekdayText: ['24/7'] };
  const byDay = new Map<number, OpeningPeriod[]>();
  for (const rule of input.split(';').map((r) => r.trim()).filter(Boolean)) {
    const m = /^([A-Za-z ,-]+?)\s+(off|closed|[\d:, +-]+)$/.exec(rule);
    if (!m) continue;
    let days: number[];
    try { days = expandDays(m[1]!.replace(/\s+/g, '')); } catch { continue; }
    if (/^(off|closed)$/.test(m[2]!)) { days.forEach((d) => byDay.set(d, [])); continue; }
    const spans = m[2]!.split(',').map((s) => s.trim().replace(/\+$/, '').split('-'));
    if (spans.some((s) => s.length !== 2 || !/^\d{1,2}:\d{2}$/.test(s[0]!) || !/^\d{1,2}:\d{2}$/.test(s[1]!))) continue;
    for (const d of days) {
      byDay.set(d, spans.map(([open, close]) => {
        const [oh, om] = open!.split(':').map(Number) as [number, number];
        const [ch, cm] = close!.split(':').map(Number) as [number, number];
        const overnight = ch * 60 + cm <= oh * 60 + om || ch >= 24;
        return { open: { day: d, hour: oh, minute: om }, close: { day: overnight ? (d + 1) % 7 : d, hour: ch % 24, minute: cm } };
      }));
    }
  }
  if (!byDay.size) return null;
  const periods = ORDER.flatMap((d) => byDay.get(d) ?? []);
  return { periods, weekdayText: input.split(';').map((r) => r.trim()).filter(Boolean) };
}
