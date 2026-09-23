// ============================================================================
// Calendar helpers shared by the Calendar module, the alarm daemon and the
// Scheduler: recurrence expansion, occurrence ids and day overlap.
// ============================================================================

import type { CalendarEntry, RecurFreq } from "./types";
import { startOfDay } from "../lib/format";

export const DAY_MS = 86400000;
const MAX_OCCURRENCES = 366;

/** Advance an epoch ms by n steps of the given frequency (calendar-aware). */
export function advance(ms: number, freq: RecurFreq, n: number): number {
  const d = new Date(ms);
  if (freq === "daily") d.setDate(d.getDate() + n);
  else if (freq === "weekly") d.setDate(d.getDate() + n * 7);
  else if (freq === "yearly") d.setFullYear(d.getFullYear() + n);
  else d.setMonth(d.getMonth() + n);
  return d.getTime();
}

/** Synthetic occurrence id: `${masterId}__${occStartMs}`. */
export function occurrenceId(masterId: string, occStart: number): string {
  return `${masterId}__${occStart}`;
}

/** Resolve a (possibly synthetic) occurrence id back to the master entry id. */
export function masterIdOf(id: string): string {
  const i = id.indexOf("__");
  return i === -1 ? id : id.slice(0, i);
}

/**
 * Expand a master entry into its concrete occurrences (the master plus any
 * repeats up to `until`). Each repeat carries the master's fields with a
 * shifted start/end and a synthetic id.
 */
export function expandEntry(master: CalendarEntry): CalendarEntry[] {
  const rec = master.recurrence;
  if (!rec) return [master];
  const out: CalendarEntry[] = [];
  const duration = master.end - master.start;
  for (let i = 0; i < MAX_OCCURRENCES; i++) {
    const occStart = i === 0 ? master.start : advance(master.start, rec.freq, i);
    if (occStart > rec.until) break;
    out.push(
      i === 0
        ? master
        : { ...master, id: occurrenceId(master.id, occStart), start: occStart, end: occStart + duration },
    );
  }
  return out;
}

/** Does an entry's [start, end] span touch the given day? */
export function overlapsDay(e: CalendarEntry, dayMs: number): boolean {
  const dayStart = startOfDay(dayMs);
  const dayEnd = dayStart + DAY_MS;
  const s = Math.min(e.start, e.end);
  const en = Math.max(e.start, e.end);
  return s < dayEnd && en >= dayStart;
}

/** Every occurrence of every entry that touches the given day, sorted. */
export function entriesOnDay(entries: CalendarEntry[], dayMs: number): CalendarEntry[] {
  return entries
    .flatMap(expandEntry)
    .filter((e) => overlapsDay(e, dayMs))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
}
