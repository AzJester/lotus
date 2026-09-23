// ============================================================================
// Calendar model tests: periods and titles for each format, month grids,
// which entries fall on a day, the time-grid layout of overlapping entries,
// all-day lanes, entry text and the Go To date parser.
// ============================================================================

import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "../../data/types";
import {
  addDays,
  addMonths,
  allDayLanes,
  compareMonthCategory,
  entriesForDay,
  hourLabel,
  isoWeek,
  layoutDay,
  matchesQuery,
  monthCategory,
  monthWeeks,
  occurrencesBetween,
  occursOn,
  parseGoTo,
  periodDays,
  periodTitle,
  rangeTitle,
  repeatText,
  snapMinutes,
  startOfWeek,
  stepAnchor,
  timeRangeText,
  whenText,
  withDate,
  withTime,
  alarmLeadText,
  shortRange,
  shortTime,
  weekLabel,
} from "./calendarModel";

// All dates are local; months are 0-based (8 = September). 09/23/2026 is a Wednesday.
const day = (m: number, d: number, y = 2026) => new Date(y, m, d).getTime();
const at = (m: number, d: number, h: number, min = 0) => new Date(2026, m, d, h, min).getTime();

function entry(e: Partial<CalendarEntry> & Pick<CalendarEntry, "id" | "start" | "end">): CalendarEntry {
  return {
    type: "appointment",
    subject: e.id,
    location: "",
    allDay: false,
    description: "",
    invitees: [],
    category: "",
    alarm: false,
    ...e,
  };
}

describe("weeks and months", () => {
  it("finds the start of the week for Sunday and Monday weeks", () => {
    expect(startOfWeek(at(8, 23, 15), 0)).toBe(day(8, 20));
    expect(startOfWeek(at(8, 23, 15), 1)).toBe(day(8, 21));
    // A Sunday belongs to the week that began the Monday before.
    expect(startOfWeek(day(8, 27), 1)).toBe(day(8, 21));
    expect(startOfWeek(day(8, 27), 0)).toBe(day(8, 27));
  });

  it("moves by months and keeps the day where it exists", () => {
    expect(addMonths(day(0, 31), 1)).toBe(day(1, 28));
    expect(addMonths(day(8, 30), 1)).toBe(day(9, 30));
    expect(addMonths(day(0, 15), -1)).toBe(day(11, 15, 2025));
  });

  it("keeps the wall-clock time when adding days", () => {
    const d = new Date(addDays(at(2, 7, 10, 30), 2));
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([9, 10, 30]);
  });

  it("builds whole weeks covering a month", () => {
    const weeks = monthWeeks(day(8, 10), 0);
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe(day(7, 30)); // Sunday August 30
    expect(weeks[4][6]).toBe(day(9, 3)); // Saturday October 3
    const monday = monthWeeks(day(1, 1), 1); // February 2026 starts on a Sunday
    expect(monday[0][0]).toBe(day(0, 26));
    expect(monday.every((w) => w.length === 7)).toBe(true);
  });

  it("numbers ISO weeks", () => {
    expect(isoWeek(day(8, 23))).toBe(39);
    expect(isoWeek(day(0, 1))).toBe(1);
    expect(isoWeek(day(11, 31, 2024))).toBe(1);
  });
});

describe("periods", () => {
  const wed = at(8, 23, 11);

  it("lists the days each format shows", () => {
    expect(periodDays("day", wed, 0)).toEqual([day(8, 23)]);
    expect(periodDays("twodays", wed, 0)).toEqual([day(8, 23), day(8, 24)]);
    expect(periodDays("workweek", wed, 0)).toEqual([21, 22, 23, 24, 25].map((d) => day(8, d)));
    expect(periodDays("workweek", wed, 1)).toEqual([21, 22, 23, 24, 25].map((d) => day(8, d)));
    expect(periodDays("week", wed, 0)[0]).toBe(day(8, 20));
    expect(periodDays("week", wed, 1)[6]).toBe(day(8, 27));
    expect(periodDays("twoweeks", wed, 1)).toHaveLength(14);
    expect(periodDays("month", wed, 0)).toHaveLength(30);
    expect(periodDays("all", wed, 0)).toEqual([]);
  });

  it("steps to the previous and next period", () => {
    expect(stepAnchor("day", day(8, 23), 1)).toBe(day(8, 24));
    expect(stepAnchor("twodays", day(8, 23), -1)).toBe(day(8, 21));
    expect(stepAnchor("week", day(8, 23), 1)).toBe(day(8, 30));
    expect(stepAnchor("twoweeks", day(8, 23), 1)).toBe(day(9, 7));
    expect(stepAnchor("month", day(8, 23), 1)).toBe(day(9, 23));
  });

  it("titles a period", () => {
    expect(periodTitle("day", wed, 0)).toBe("Wednesday, September 23, 2026");
    expect(periodTitle("month", wed, 0)).toBe("September 2026");
    expect(periodTitle("week", wed, 0)).toBe("September 20 - 26, 2026");
    expect(rangeTitle(day(8, 30), day(9, 1))).toBe("September 30 - October 1, 2026");
    expect(rangeTitle(day(11, 31, 2026), day(0, 1, 2027))).toBe("December 31, 2026 - January 1, 2027");
  });
});

describe("entries on a day", () => {
  const dentist = entry({ id: "dentist", start: at(8, 23, 9), end: at(8, 23, 10) });
  const overnight = entry({ id: "overnight", start: at(8, 23, 22), end: at(8, 24, 2) });
  const toMidnight = entry({ id: "late", start: at(8, 23, 23), end: day(8, 24) });
  const reminder = entry({ id: "rem", type: "reminder", start: at(8, 23, 16), end: at(8, 23, 16) });
  const closeOut = entry({ id: "close", type: "event", allDay: true, start: day(8, 23), end: at(8, 25, 23, 59) });

  it("shows timed, overnight, reminder and all-day entries on the right days", () => {
    expect(occursOn(dentist, day(8, 23))).toBe(true);
    expect(occursOn(dentist, day(8, 24))).toBe(false);
    expect(occursOn(overnight, day(8, 24))).toBe(true);
    // An entry that ends at midnight does not spill into the next day.
    expect(occursOn(toMidnight, day(8, 24))).toBe(false);
    expect(occursOn(reminder, day(8, 23))).toBe(true);
    expect([22, 23, 24, 25, 26].map((d) => occursOn(closeOut, day(8, d)))).toEqual([false, true, true, true, false]);
  });

  it("treats an all-day end at midnight as the day before", () => {
    const e = entry({ id: "x", allDay: true, start: day(8, 23), end: day(8, 24) });
    expect(occursOn(e, day(8, 24))).toBe(false);
  });

  it("expands repeating entries into the range and sorts all-day entries first", () => {
    const weekly = entry({
      id: "staff",
      start: at(8, 2, 10),
      end: at(8, 2, 11),
      recurrence: { freq: "weekly", until: at(8, 30, 23, 59) },
    });
    const occ = occurrencesBetween([weekly, closeOut, dentist], day(8, 21), day(8, 28));
    expect(occ.map((e) => e.id).sort()).toEqual(["close", "dentist", `staff__${at(8, 23, 10)}`]);
    expect(entriesForDay(occ, day(8, 23)).map((e) => e.id)).toEqual(["close", "dentist", `staff__${at(8, 23, 10)}`]);
  });
});

describe("time grid layout", () => {
  const d = day(8, 23);

  it("places a single entry at its time", () => {
    const [p] = layoutDay([entry({ id: "a", start: at(8, 23, 9, 30), end: at(8, 23, 11) })], d);
    expect(p).toMatchObject({ top: 570, height: 90, col: 0, span: 1, cols: 1 });
  });

  it("puts overlapping entries side by side", () => {
    const placed = layoutDay(
      [
        entry({ id: "a", start: at(8, 23, 9), end: at(8, 23, 11) }),
        entry({ id: "b", start: at(8, 23, 10), end: at(8, 23, 12) }),
        entry({ id: "c", start: at(8, 23, 10, 30), end: at(8, 23, 11, 30) }),
        entry({ id: "d", start: at(8, 23, 14), end: at(8, 23, 15) }),
      ],
      d,
    );
    const by = Object.fromEntries(placed.map((p) => [p.entry.id, p]));
    expect([by.a.col, by.b.col, by.c.col]).toEqual([0, 1, 2]);
    expect([by.a.cols, by.b.cols, by.c.cols]).toEqual([3, 3, 3]);
    // A separate cluster later in the day gets the full width again.
    expect(by.d).toMatchObject({ col: 0, cols: 1, span: 1 });
  });

  it("reuses a column once it is free and widens into free columns", () => {
    const placed = layoutDay(
      [
        entry({ id: "long", start: at(8, 23, 9), end: at(8, 23, 12) }),
        entry({ id: "early", start: at(8, 23, 9), end: at(8, 23, 10) }),
        entry({ id: "later", start: at(8, 23, 10), end: at(8, 23, 11) }),
        entry({ id: "third", start: at(8, 23, 9, 30), end: at(8, 23, 10) }),
      ],
      d,
    );
    const by = Object.fromEntries(placed.map((p) => [p.entry.id, p]));
    expect(by.long.col).toBe(0);
    expect(by.early.col).toBe(1);
    expect(by.third.col).toBe(2);
    // "later" takes column 1 again once "early" ended, and nothing blocks column 2 then.
    expect(by.later).toMatchObject({ col: 1, span: 2, cols: 3 });
  });

  it("gives short entries and reminders a minimum height and clips overnight entries", () => {
    const placed = layoutDay(
      [
        entry({ id: "rem", type: "reminder", start: at(8, 23, 16), end: at(8, 23, 16) }),
        entry({ id: "night", start: at(8, 22, 22), end: at(8, 23, 1) }),
        entry({ id: "eve", start: at(8, 23, 23), end: at(8, 24, 3) }),
      ],
      d,
    );
    const by = Object.fromEntries(placed.map((p) => [p.entry.id, p]));
    expect(by.rem).toMatchObject({ top: 960, height: 30 });
    expect(by.night).toMatchObject({ top: 0, height: 60, fromBefore: true, goesOn: false });
    expect(by.eve).toMatchObject({ top: 1380, height: 60, goesOn: true });
  });

  it("stacks all-day entries into lanes across the days they cover", () => {
    const days = [21, 22, 23, 24, 25].map((n) => day(8, n));
    const lanes = allDayLanes(
      [
        entry({ id: "trip", allDay: true, start: day(8, 20), end: at(8, 22, 23, 59) }),
        entry({ id: "close", allDay: true, start: day(8, 22), end: at(8, 24, 23, 59) }),
        entry({ id: "bday", allDay: true, start: day(8, 24), end: at(8, 24, 23, 59) }),
        entry({ id: "timed", start: at(8, 23, 9), end: at(8, 23, 10) }),
      ],
      days,
    );
    const by = Object.fromEntries(lanes.map((l) => [l.entry.id, l]));
    expect(lanes).toHaveLength(3);
    expect(by.trip).toMatchObject({ from: 0, to: 1, lane: 0, before: true, after: false });
    expect(by.close).toMatchObject({ from: 1, to: 3, lane: 1 });
    expect(by.bday).toMatchObject({ from: 3, to: 3, lane: 0 });
  });

  it("snaps minutes to quarter hours inside the day", () => {
    expect(snapMinutes(607)).toBe(600);
    expect(snapMinutes(608)).toBe(615);
    expect(snapMinutes(-20)).toBe(0);
    expect(snapMinutes(1500)).toBe(1440);
  });
});

describe("text", () => {
  it("prints times, spans and repeats", () => {
    expect(hourLabel(0)).toBe("12 AM");
    expect(hourLabel(8)).toBe("8 AM");
    expect(hourLabel(12)).toBe("12 PM");
    expect(hourLabel(18)).toBe("6 PM");
    const e = entry({ id: "a", start: at(8, 24, 10), end: at(8, 24, 11, 30) });
    expect(timeRangeText(e)).toBe("10:00 AM - 11:30 AM");
    expect(whenText(e)).toBe("Thursday, September 24, 2026, 10:00 AM - 11:30 AM");
    expect(timeRangeText({ ...e, allDay: true })).toBe("All day");
    expect(whenText({ ...e, allDay: true, start: day(8, 24), end: at(8, 26, 23, 59) })).toBe(
      "09/24/2026 - 09/26/2026 (all day)",
    );
    expect(whenText({ ...e, type: "reminder", end: e.start })).toBe("Thursday, September 24, 2026 at 10:00 AM");
    expect(repeatText({ freq: "weekly", until: day(9, 31) })).toBe("Weekly until 10/31/2026");
    expect(repeatText(undefined)).toBe("Does not repeat");
    expect(alarmLeadText(15)).toBe("15 minutes before");
    expect(alarmLeadText(60)).toBe("1 hour before");
    expect(alarmLeadText(1440)).toBe("1 day before");
    expect(alarmLeadText(0)).toBe("At the start time");
  });

  it("prints short times and week labels", () => {
    expect(shortTime(at(8, 24, 9, 5))).toBe("9:05 AM");
    expect(shortTime(at(8, 24, 12, 0))).toBe("12:00 PM");
    expect(shortRange(entry({ id: "a", start: at(8, 24, 9), end: at(8, 24, 10, 30) }))).toBe("9:00 AM - 10:30 AM");
    expect(shortRange(entry({ id: "r", type: "reminder", start: at(8, 24, 16), end: at(8, 24, 16) }))).toBe("4:00 PM");
    // A Sunday-first week is named after its working days.
    expect(weekLabel(periodDays("week", day(8, 23), 0))).toBe("Week 39");
    expect(weekLabel(periodDays("twoweeks", day(8, 23), 1))).toBe("Weeks 39 - 40");
    expect(weekLabel([])).toBe("");
  });

  it("categorizes by month in date order", () => {
    expect(monthCategory(day(8, 23))).toBe("September 2026");
    const labels = ["October 2026", "January 2027", "September 2026", "December 2025"];
    expect([...labels].sort(compareMonthCategory)).toEqual([
      "December 2025",
      "September 2026",
      "October 2026",
      "January 2027",
    ]);
  });

  it("matches the search bar against subject, location and people", () => {
    const e = entry({
      id: "a",
      start: 0,
      end: 1,
      subject: "Budget review",
      location: "Birch Room",
      invitees: [{ name: "Priya Nair", email: "priya.nair@acme.example.com" }],
    });
    expect(matchesQuery(e, "budget")).toBe(true);
    expect(matchesQuery(e, "birch")).toBe(true);
    expect(matchesQuery(e, "priya")).toBe(true);
    expect(matchesQuery(e, "northwind")).toBe(false);
    expect(matchesQuery(e, "  ")).toBe(true);
  });
});

describe("date fields", () => {
  it("replaces the date or the time of a value", () => {
    const t = at(8, 23, 14, 30);
    expect(withDate(t, "2026-10-02")).toBe(at(9, 2, 14, 30));
    expect(withTime(t, "09:15")).toBe(at(8, 23, 9, 15));
    expect(withDate(t, "")).toBeNaN();
    expect(withTime(t, "later")).toBeNaN();
  });

  it("parses Go To dates", () => {
    const now = at(8, 23, 12);
    expect(parseGoTo("09/24/2026", now)).toBe(day(8, 24));
    expect(parseGoTo("10/1", now)).toBe(day(9, 1));
    expect(parseGoTo("2027-01-05", now)).toBe(day(0, 5, 2027));
    expect(parseGoTo("1/2/27", now)).toBe(day(0, 2, 2027));
    expect(parseGoTo("Tomorrow", now)).toBe(day(8, 24));
    expect(parseGoTo("02/30/2026", now)).toBeNull();
    expect(parseGoTo("next week", now)).toBeNull();
  });
});
