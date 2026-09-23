// ============================================================================
// Calendar model: the pure date math and layout behind the Calendar views.
// The period each format shows (Day through One Month), period titles, the
// month grids of the date picker and the One Month format, which entries
// fall on a day, how overlapping entries share a time-grid column, how
// all-day entries stack into lanes, and the text the views print for an
// entry. No React and no store access (see calendarModel.test.ts).
// ============================================================================

import type { CalEntryType, CalendarEntry, Recurrence } from "../../data/types";
import type { IconName } from "../../components/Icon";
import { expandEntry } from "../../data/calendarUtil";
import { DAYS, MONTHS, fmtDate, fmtTime, startOfDay } from "../../lib/format";

export const MINUTE = 60000;
export const HOUR = 3600000;
export const DAY = 86400000;

/** The calendar formats and list views, in navigator order. */
export type CalView = "day" | "twodays" | "workweek" | "week" | "twoweeks" | "month" | "all" | "meetings";

/** Formats that show a period of days (the others are Notes views). */
export const isPeriodView = (v: CalView) => v !== "all" && v !== "meetings";

/** 0: weeks start on Sunday (Notes 8, US). 1: Monday (the R5 planner). */
export type WeekStart = 0 | 1;

/** Hours a new timed entry starts at when only a day was picked. */
export const DEFAULT_HOUR = 9;

// ---------------------------------------------------------------------------
// Days, weeks and months
// ---------------------------------------------------------------------------

/** The same wall-clock time n days later (safe across daylight saving). */
export function addDays(ms: number, n: number): number {
  const d = new Date(ms);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + n,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  ).getTime();
}

/** Start of the next day. */
export const nextDay = (ms: number) => addDays(startOfDay(ms), 1);

/** Minutes past local midnight (wall clock). */
export function wallMinutes(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/** A day plus a number of minutes on the wall clock. */
export function atMinutes(dayMs: number, minutes: number): number {
  const d = new Date(startOfDay(dayMs));
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes).getTime();
}

export function startOfWeek(ms: number, weekStart: WeekStart): number {
  const d = new Date(startOfDay(ms));
  const back = (d.getDay() - weekStart + 7) % 7;
  return addDays(d.getTime(), -back);
}

export function startOfMonth(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** Move by whole months, keeping the day of the month where it exists (Jan 31 + 1 = Feb 28). */
export function addMonths(ms: number, n: number): number {
  const d = new Date(ms);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return startOfDay(target.getTime());
}

export function isWeekend(ms: number): boolean {
  const dow = new Date(ms).getDay();
  return dow === 0 || dow === 6;
}

/** ISO-8601 week number (weeks start on Monday; week 1 holds January 4). */
export function isoWeek(ms: number): number {
  const d = new Date(ms);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / DAY + 1) / 7);
}

/** Weeks (rows of 7 day starts) covering the month of `ms`. */
export function monthWeeks(ms: number, weekStart: WeekStart): number[][] {
  const first = startOfMonth(ms);
  const month = new Date(first).getMonth();
  const weeks: number[][] = [];
  let day = startOfWeek(first, weekStart);
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
    day = addDays(day, 7);
  } while (new Date(day).getMonth() === month);
  return weeks;
}

/** Day-of-week letters in column order ("S M T W T F S"). */
export function weekdayOrder(weekStart: WeekStart): number[] {
  return Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

/** The days a format shows around `anchor` (empty for the list views). */
export function periodDays(view: CalView, anchor: number, weekStart: WeekStart): number[] {
  const day = startOfDay(anchor);
  const run = (from: number, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
  switch (view) {
    case "day":
      return [day];
    case "twodays":
      return run(day, 2);
    case "workweek": {
      const ws = startOfWeek(day, weekStart);
      return run(weekStart === 0 ? addDays(ws, 1) : ws, 5);
    }
    case "week":
      return run(startOfWeek(day, weekStart), 7);
    case "twoweeks":
      return run(startOfWeek(day, weekStart), 14);
    case "month": {
      const first = startOfMonth(day);
      const count = new Date(new Date(first).getFullYear(), new Date(first).getMonth() + 1, 0).getDate();
      return run(first, count);
    }
    default:
      return [];
  }
}

/** Previous / next period. */
export function stepAnchor(view: CalView, anchor: number, dir: 1 | -1): number {
  switch (view) {
    case "day":
      return addDays(anchor, dir);
    case "twodays":
      return addDays(anchor, 2 * dir);
    case "workweek":
    case "week":
      return addDays(anchor, 7 * dir);
    case "twoweeks":
      return addDays(anchor, 14 * dir);
    case "month":
      return addMonths(anchor, dir);
    default:
      return anchor;
  }
}

/** "September 21 - 27, 2026", "September 30 - October 1, 2026", "December 31, 2026 - January 1, 2027". */
export function rangeTitle(first: number, last: number): string {
  const a = new Date(first);
  const b = new Date(last);
  if (startOfDay(first) === startOfDay(last)) return `${MONTHS[a.getMonth()]} ${a.getDate()}, ${a.getFullYear()}`;
  if (a.getFullYear() !== b.getFullYear()) {
    return `${MONTHS[a.getMonth()]} ${a.getDate()}, ${a.getFullYear()} - ${MONTHS[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
  }
  if (a.getMonth() !== b.getMonth()) {
    return `${MONTHS[a.getMonth()]} ${a.getDate()} - ${MONTHS[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
  }
  return `${MONTHS[a.getMonth()]} ${a.getDate()} - ${b.getDate()}, ${b.getFullYear()}`;
}

/** The title over the calendar for a format. */
export function periodTitle(view: CalView, anchor: number, weekStart: WeekStart): string {
  if (view === "month") {
    const d = new Date(anchor);
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  if (view === "day") {
    const d = new Date(anchor);
    return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }
  const days = periodDays(view, anchor, weekStart);
  if (!days.length) return "";
  return rangeTitle(days[0], days[days.length - 1]);
}

// ---------------------------------------------------------------------------
// Which entries fall on a day
// ---------------------------------------------------------------------------

/** The last moment an entry covers (an all-day end at midnight belongs to the day before). */
function lastMoment(e: CalendarEntry): number {
  const end = Math.max(e.start, e.end);
  if (e.allDay && end > e.start && end === startOfDay(end)) return end - 1;
  return end;
}

/** Does an occurrence show on the day starting at `dayStart`? */
export function occursOn(e: CalendarEntry, dayStart: number): boolean {
  const day = startOfDay(dayStart);
  const dayEnd = nextDay(day);
  if (e.allDay) return startOfDay(e.start) <= day && day <= startOfDay(lastMoment(e));
  if (e.end <= e.start) return e.start >= day && e.start < dayEnd;
  return e.start < dayEnd && e.end > day;
}

/** Every occurrence (repeating entries expanded) that shows on a day in [from, to). */
export function occurrencesBetween(entries: CalendarEntry[], from: number, to: number): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  for (const master of entries) {
    for (const occ of expandEntry(master)) {
      const first = startOfDay(occ.start);
      const last = startOfDay(lastMoment(occ));
      if (last >= startOfDay(from) && first < to) out.push(occ);
    }
  }
  return out;
}

/** Display order within a day: all-day entries first, then by start, longer first. */
export function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  return (
    Number(b.allDay) - Number(a.allDay) ||
    a.start - b.start ||
    b.end - b.start - (a.end - a.start) ||
    a.subject.localeCompare(b.subject)
  );
}

/** The occurrences that show on one day, in display order. */
export function entriesForDay(occurrences: CalendarEntry[], dayStart: number): CalendarEntry[] {
  return occurrences.filter((e) => occursOn(e, dayStart)).sort(compareEntries);
}

// ---------------------------------------------------------------------------
// Time grid layout
// ---------------------------------------------------------------------------

export interface Placed {
  entry: CalendarEntry;
  /** Minutes from midnight to the top of the block. */
  top: number;
  /** Block height in minutes (never below the minimum). */
  height: number;
  /** Column within its cluster of overlapping entries, how many columns it spans, and the cluster width. */
  col: number;
  span: number;
  cols: number;
  /** The entry started the day before / goes on past midnight. */
  fromBefore: boolean;
  goesOn: boolean;
}

/**
 * Lay out one day's timed entries: every block gets its time position, and
 * entries that overlap share the width side by side. A block may widen into
 * the columns to its right that are free for its whole height.
 */
export function layoutDay(entries: CalendarEntry[], dayStart: number, minMinutes = 30): Placed[] {
  const day = startOfDay(dayStart);
  const dayEnd = nextDay(day);
  const items: Placed[] = entries
    .filter((e) => !e.allDay && occursOn(e, day))
    .map((e) => {
      const fromBefore = e.start < day;
      const goesOn = e.end > dayEnd;
      const top = fromBefore ? 0 : wallMinutes(e.start);
      const bottom = goesOn ? 1440 : e.end <= e.start ? top : e.end >= dayEnd ? 1440 : wallMinutes(e.end);
      const height = Math.max(bottom - top, minMinutes);
      return { entry: e, top: Math.min(top, 1440 - height), height, col: 0, span: 1, cols: 1, fromBefore, goesOn };
    })
    .sort((a, b) => a.top - b.top || b.height - a.height || a.entry.subject.localeCompare(b.entry.subject));

  const bottomOf = (p: Placed) => p.top + p.height;
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const finish = () => {
    const columns: Placed[][] = [];
    for (const p of cluster) {
      let c = columns.findIndex((col) => bottomOf(col[col.length - 1]) <= p.top);
      if (c === -1) {
        c = columns.length;
        columns.push([]);
      }
      columns[c].push(p);
      p.col = c;
    }
    for (const p of cluster) {
      p.cols = columns.length;
      let span = 1;
      while (
        p.col + span < columns.length &&
        !columns[p.col + span].some((q) => q.top < bottomOf(p) && bottomOf(q) > p.top)
      ) {
        span++;
      }
      p.span = span;
    }
  };
  for (const p of items) {
    if (cluster.length && p.top >= clusterEnd) {
      finish();
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, bottomOf(p));
  }
  if (cluster.length) finish();
  return items;
}

export interface Lane {
  entry: CalendarEntry;
  /** First and last day index (inclusive) the bar covers in the period. */
  from: number;
  to: number;
  lane: number;
  /** The entry began before / goes on after the days shown. */
  before: boolean;
  after: boolean;
}

/** Stack all-day entries into lanes so each one is a single bar across the days it covers. */
export function allDayLanes(entries: CalendarEntry[], days: number[]): Lane[] {
  const bars: Lane[] = [];
  for (const e of entries) {
    if (!e.allDay) continue;
    const hits = days.map((d, i) => (occursOn(e, d) ? i : -1)).filter((i) => i >= 0);
    if (!hits.length) continue;
    const from = hits[0];
    const to = hits[hits.length - 1];
    bars.push({
      entry: e,
      from,
      to,
      lane: 0,
      before: startOfDay(e.start) < startOfDay(days[0]),
      after: startOfDay(lastMoment(e)) > startOfDay(days[days.length - 1]),
    });
  }
  bars.sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from) || a.entry.subject.localeCompare(b.entry.subject));
  const laneEnds: number[] = [];
  for (const b of bars) {
    let lane = laneEnds.findIndex((end) => end < b.from);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b.to);
    } else laneEnds[lane] = b.to;
    b.lane = lane;
  }
  return bars;
}

/** Round minutes to a step (15 by default) within the day. */
export function snapMinutes(minutes: number, step = 15): number {
  return Math.max(0, Math.min(1440, Math.round(minutes / step) * step));
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export const TYPE_LABEL: Record<CalEntryType, string> = {
  appointment: "Appointment",
  meeting: "Meeting",
  reminder: "Reminder",
  event: "Event",
  anniversary: "Anniversary",
};

export const TYPE_ICON: Record<CalEntryType, IconName> = {
  appointment: "appointment",
  meeting: "meeting",
  reminder: "reminder",
  event: "event",
  anniversary: "anniversary",
};

/** Entry colors (the marks in the planner, the legend and the list icons). */
export const TYPE_COLOR: Record<CalEntryType, string> = {
  appointment: "#2f6fb5",
  meeting: "#8a3fb8",
  reminder: "#c07618",
  event: "#2e8b57",
  anniversary: "#c01457",
};

/** "8 AM", "12 PM" */
export function hourLabel(h: number): string {
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${h < 12 || h === 24 ? "AM" : "PM"}`;
}

/** "9:00 AM": fmtTime without the leading zero, for tight spaces. */
export function shortTime(ms: number): string {
  return fmtTime(ms).replace(/^0/, "");
}

/** Block and chip times: "9:00 AM - 10:30 AM", or a reminder's single time. */
export function shortRange(e: CalendarEntry): string {
  if (e.allDay) return "All day";
  if (e.end <= e.start) return shortTime(e.start);
  return `${shortTime(e.start)} - ${shortTime(e.end)}`;
}

/** The ISO week label of a period: "Week 39", or "Weeks 39 - 40" for two weeks. */
export function weekLabel(days: number[]): string {
  if (!days.length) return "";
  if (days.length > 7) return `Weeks ${isoWeek(days[3])} - ${isoWeek(days[days.length - 4])}`;
  return `Week ${isoWeek(days[Math.floor((days.length - 1) / 2)])}`;
}

/** The time column: "10:00 AM - 11:00 AM", "All day", or a reminder's single time. */
export function timeRangeText(e: CalendarEntry): string {
  if (e.allDay) return "All day";
  if (e.end <= e.start) return fmtTime(e.start);
  if (startOfDay(e.start) !== startOfDay(e.end - 1)) return `${fmtTime(e.start)} - ${fmtDate(e.end)} ${fmtTime(e.end)}`;
  return `${fmtTime(e.start)} - ${fmtTime(e.end)}`;
}

/** "Thursday, September 24, 2026" */
export function longDate(ms: number): string {
  const d = new Date(ms);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** The When line of a document in read mode. */
export function whenText(e: CalendarEntry): string {
  const oneDay = startOfDay(e.start) === startOfDay(lastMoment(e));
  if (e.allDay) {
    return oneDay ? `${longDate(e.start)} (all day)` : `${fmtDate(e.start)} - ${fmtDate(lastMoment(e))} (all day)`;
  }
  if (e.end <= e.start) return `${longDate(e.start)} at ${fmtTime(e.start)}`;
  if (oneDay) return `${longDate(e.start)}, ${fmtTime(e.start)} - ${fmtTime(e.end)}`;
  return `${fmtDate(e.start)} ${fmtTime(e.start)} - ${fmtDate(e.end)} ${fmtTime(e.end)}`;
}

export function repeatText(r: Recurrence | undefined): string {
  if (!r) return "Does not repeat";
  const unit = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" }[r.freq];
  return `${unit} until ${fmtDate(r.until)}`;
}

/** "15 minutes before", "At the start time", "1 day before" */
export function alarmLeadText(minutes: number): string {
  if (minutes <= 0) return "At the start time";
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"} before`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"} before`;
  return `${minutes} minute${minutes === 1 ? "" : "s"} before`;
}

/** View category for an entry: "September 2026". */
export function monthCategory(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Chronological order for month categories. */
export function compareMonthCategory(a: string, b: string): number {
  const key = (label: string) => {
    const [month, year] = label.split(" ");
    const m = MONTHS.indexOf(month);
    return m === -1 ? Number.MAX_SAFE_INTEGER : Number(year) * 12 + m;
  };
  return key(a) - key(b) || a.localeCompare(b);
}

/** Search bar match: subject, location, description, category and people. */
export function matchesQuery(e: CalendarEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    e.subject,
    e.location,
    e.description,
    e.category,
    e.chair?.name ?? "",
    ...e.invitees.map((p) => `${p.name} ${p.email}`),
  ]
    .join("\n")
    .toLowerCase();
  return hay.includes(q);
}

// ---------------------------------------------------------------------------
// Date and time fields
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** yyyy-mm-dd for <input type="date">. */
export function dateValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** HH:MM for <input type="time">. */
export function timeValue(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Replace the date part of `ms` (yyyy-mm-dd), keeping the time. NaN when invalid. */
export function withDate(ms: number, value: string): number {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  const d = new Date(ms);
  // setFullYear, not the Date constructor, which reads years 0-99 as 19xx.
  const out = new Date(2000, 0, 1, d.getHours(), d.getMinutes());
  out.setFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return out.getTime();
}

/** Replace the time part of `ms` (HH:MM), keeping the date. NaN when invalid. */
export function withTime(ms: number, value: string): number {
  const m = value.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return NaN;
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(m[1]), Number(m[2])).getTime();
}

/**
 * The date typed into Go To: "09/24/2026", "9/24" (this year), "2026-09-24",
 * "today", "tomorrow" or "yesterday". Null when it is not a date.
 */
export function parseGoTo(text: string, now = Date.now()): number | null {
  const t = text.trim().toLowerCase();
  const today = startOfDay(now);
  if (t === "today") return today;
  if (t === "tomorrow") return addDays(today, 1);
  if (t === "yesterday") return addDays(today, -1);
  let y: number;
  let m: number;
  let d: number;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (us) {
    m = Number(us[1]);
    d = Number(us[2]);
    y = us[3] ? Number(us[3]) : new Date(now).getFullYear();
    if (y < 100) y += y < 70 ? 2000 : 1900;
  } else return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date.getTime();
}
