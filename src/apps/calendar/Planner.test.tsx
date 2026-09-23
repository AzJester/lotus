/* @jsxRuntime automatic */
// ============================================================================
// Planner tests: page layout for each format, entry lines, selection, the
// click / double-click callbacks and the optional month tabs.
// (The pragma above is needed because test files fall outside
// tsconfig.app.json, so esbuild would otherwise emit React.createElement.)
// ============================================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import Planner from "./Planner";
import type { PlannerProps } from "./Planner";
import type { CalendarEntry } from "../../data/types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// All dates are in 2026; months are 0-based (8 = September).
const day = (month: number, date: number) => new Date(2026, month, date).getTime();
const at = (month: number, date: number, hour: number, minute = 0) =>
  new Date(2026, month, date, hour, minute).getTime();
const range = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => day(8, from + i));

type Basics = Pick<CalendarEntry, "id" | "type" | "subject" | "start" | "end">;

function entry(e: Basics & Partial<CalendarEntry>): CalendarEntry {
  return {
    location: "",
    allDay: false,
    description: "",
    invitees: [],
    category: "",
    alarm: false,
    ...e,
  };
}

// Monday, September 21 to Sunday, September 27, and two weeks from that Monday.
const WEEK = range(21, 7);
const TWO_WEEKS = range(21, 14);

const DENTIST = entry({
  id: "dentist",
  type: "appointment",
  subject: "Dentist",
  location: "Downtown Dental",
  start: at(8, 21, 9),
  end: at(8, 21, 10),
});
const CLOSE = entry({
  id: "close",
  type: "event",
  subject: "Quarter-end close",
  start: at(8, 22, 0),
  end: at(8, 22, 23, 59),
  allDay: true,
});
const STAFF = entry({
  id: "staff",
  type: "meeting",
  subject: "Staff meeting",
  start: at(8, 22, 10, 30),
  end: at(8, 22, 11, 30),
  recurrence: { freq: "weekly", until: at(9, 31, 0) },
});
// The next occurrence of the series, as the Calendar module expands it.
const STAFF_NEXT = {
  ...STAFF,
  id: `staff__${at(8, 29, 10, 30)}`,
  start: at(8, 29, 10, 30),
  end: at(8, 29, 11, 30),
};
const OFFSITE = entry({
  id: "offsite",
  type: "meeting",
  subject: "Offsite",
  start: at(8, 24, 15),
  end: at(8, 25, 12),
});
const TIMESHEET = entry({
  id: "timesheet",
  type: "reminder",
  subject: "Submit timesheet",
  start: at(8, 25, 16),
  end: at(8, 25, 16),
});
// Ends exactly at midnight, so an inclusive overlap test also offers it to Thursday.
const LATE_SHOW = entry({
  id: "late",
  type: "appointment",
  subject: "Late show",
  start: at(8, 23, 22),
  end: at(8, 24, 0),
});
const ALL = [DENTIST, CLOSE, STAFF, STAFF_NEXT, OFFSITE, TIMESHEET, LATE_SHOW];

/** Same contract as the Calendar module: overlapping entries, all-day first, then by start. */
function entriesOn(dayMs: number): CalendarEntry[] {
  const next = new Date(dayMs);
  next.setDate(next.getDate() + 1);
  return ALL.filter((e) => e.start < next.getTime() && e.end >= dayMs).sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start,
  );
}

function setup(overrides: Partial<PlannerProps> = {}) {
  const props: PlannerProps = {
    days: WEEK,
    entriesOn,
    selectedId: null,
    onSelect: vi.fn(),
    onOpen: vi.fn(),
    onNewAt: vi.fn(),
    typeColor: () => "#2f6fb5",
    ...overrides,
  };
  const view = render(<Planner {...props} />);
  return { ...view, props };
}

/** The day headers inside an element, top to bottom. */
const dayNames = (el: Element | null) =>
  Array.from(el?.querySelectorAll(".planner-day-name") ?? []).map((n) => n.textContent);
const leftPage = (c: HTMLElement) => dayNames(c.querySelector(".planner-page-left"));
const rightPage = (c: HTMLElement) => dayNames(c.querySelector(".planner-page-right"));
/** A day section, found by its "Monday, September 21" label. */
const region = (name: string) => screen.getByRole("region", { name });
/** The entry line with the given subject (optionally looked up within one day). */
const line = (subject: string, scope: HTMLElement = document.body) =>
  within(scope).getByText(subject).closest(".planner-entry") as HTMLElement;
const isSelected = (el: Element) => el.classList.contains("selected");

describe("Planner layout", () => {
  it("shows a header with the weekday and date for every day", () => {
    setup();
    for (const name of [
      "Monday, September 21",
      "Tuesday, September 22",
      "Wednesday, September 23",
      "Thursday, September 24",
      "Friday, September 25",
      "Saturday, September 26",
      "Sunday, September 27",
    ]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it("One Week puts Monday to Wednesday on the left, Thursday to Sunday on the right", () => {
    const { container } = setup();
    expect(leftPage(container)).toEqual([
      "Monday, September 21",
      "Tuesday, September 22",
      "Wednesday, September 23",
    ]);
    expect(rightPage(container)).toEqual([
      "Thursday, September 24",
      "Friday, September 25",
      "Saturday, September 26",
      "Sunday, September 27",
    ]);
    // Saturday and Sunday share the last slot.
    const slots = container.querySelectorAll(".planner-page-right .planner-slot");
    expect(slots).toHaveLength(3);
    expect(dayNames(slots[2])).toEqual(["Saturday, September 26", "Sunday, September 27"]);
  });

  it("Two Days puts one day on each page", () => {
    const { container } = setup({ days: [day(8, 30), day(9, 1)] });
    expect(leftPage(container)).toEqual(["Wednesday, September 30"]);
    expect(rightPage(container)).toEqual(["Thursday, October 1"]);
  });

  it("Two Weeks puts a week on each page, a row per day", () => {
    const { container } = setup({ days: TWO_WEEKS });
    const left = leftPage(container);
    const right = rightPage(container);
    expect(left).toHaveLength(7);
    expect(right).toHaveLength(7);
    expect(left[0]).toBe("Monday, September 21");
    expect(right[0]).toBe("Monday, September 28");
    expect(right[6]).toBe("Sunday, October 4");
    expect(container.querySelectorAll(".planner-slot")).toHaveLength(14);
  });

  it("derives weekdays from the dates, whatever day the range starts on", () => {
    const { container } = setup({ days: range(20, 7) });
    const left = leftPage(container);
    const right = rightPage(container);
    expect(left[0]).toBe("Sunday, September 20");
    expect(right[right.length - 1]).toBe("Saturday, September 26");
    expect([...left, ...right]).toHaveLength(7);
  });

  it("highlights today", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 23, 10, 0));
    setup();
    const today = region("Wednesday, September 23");
    expect(today.classList.contains("today")).toBe(true);
    expect(within(today).getByText("Today")).toBeTruthy();
    expect(region("Tuesday, September 22").classList.contains("today")).toBe(false);
  });
});

describe("Planner entries", () => {
  it("writes each entry as a line with its time range and subject", () => {
    setup();
    expect(line("Dentist").textContent).toContain("09:00 AM - 10:00 AM");
    expect(line("Dentist").textContent).toContain("Downtown Dental");
    expect(line("Staff meeting").textContent).toContain("10:30 AM - 11:30 AM");
    // A reminder has a single time.
    expect(line("Submit timesheet").textContent).toBe("04:00 PMSubmit timesheet");
  });

  it("labels all-day entries and lists them first", () => {
    setup();
    const tuesday = screen.getByRole("listbox", { name: "Entries for Tuesday, September 22" });
    const lines = within(tuesday).getAllByRole("option");
    expect(lines[0].textContent).toContain("All day");
    expect(lines[0].textContent).toContain("Quarter-end close");
    expect(lines[1].textContent).toContain("Staff meeting");
  });

  it("shows how a timed entry spills across midnight", () => {
    setup();
    expect(line("Offsite", region("Thursday, September 24")).textContent).toContain("From 03:00 PM");
    expect(line("Offsite", region("Friday, September 25")).textContent).toContain("Until 12:00 PM");
  });

  it("keeps an entry that ends at midnight on its own day only", () => {
    setup();
    expect(line("Late show", region("Wednesday, September 23")).textContent).toContain(
      "10:00 PM - 12:00 AM",
    );
    expect(within(region("Thursday, September 24")).queryByText("Late show")).toBeNull();
  });

  it("marks recurring entries and colors each line by type", () => {
    setup({ typeColor: (t) => (t === "meeting" ? "#9a3bbf" : "#2f6fb5") });
    expect(within(line("Staff meeting")).getByRole("img", { name: "Recurring" })).toBeTruthy();
    expect(within(line("Dentist")).queryByRole("img", { name: "Recurring" })).toBeNull();
    const mark = line("Staff meeting").querySelector(".planner-mark") as HTMLElement;
    expect(mark.style.getPropertyValue("--mark")).toBe("#9a3bbf");
  });

  it("click selects an entry", () => {
    const { props } = setup();
    fireEvent.click(line("Dentist"));
    expect(props.onSelect).toHaveBeenCalledWith(DENTIST);
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("double-click opens an entry without starting a new one", () => {
    const { props } = setup();
    fireEvent.doubleClick(line("Dentist"));
    expect(props.onOpen).toHaveBeenCalledWith(DENTIST);
    expect(props.onNewAt).not.toHaveBeenCalled();
  });

  it("Enter opens and Space selects the focused entry", () => {
    const { props } = setup();
    fireEvent.keyDown(line("Dentist"), { key: "Enter" });
    expect(props.onOpen).toHaveBeenCalledWith(DENTIST);
    fireEvent.keyDown(line("Dentist"), { key: " " });
    expect(props.onSelect).toHaveBeenCalledWith(DENTIST);
  });

  it("double-click on empty space in a day asks for a new entry at 9 AM", () => {
    const { props } = setup();
    fireEvent.doubleClick(within(region("Thursday, September 24")).getByRole("listbox"));
    expect(props.onNewAt).toHaveBeenCalledWith(day(8, 24), 9);
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("highlights the selected entry", () => {
    setup({ selectedId: "dentist" });
    expect(isSelected(line("Dentist"))).toBe(true);
    expect(line("Dentist").getAttribute("aria-selected")).toBe("true");
    expect(isSelected(line("Quarter-end close"))).toBe(false);
  });

  it("uses isSelected so every occurrence of a series lights up", () => {
    const masterOf = (id: string) => id.split("__")[0];
    setup({
      days: TWO_WEEKS,
      selectedId: "staff",
      isSelected: (id, sel) => sel != null && masterOf(id) === masterOf(sel),
    });
    const lines = screen.getAllByText("Staff meeting").map((s) => s.closest(".planner-entry")!);
    expect(lines).toHaveLength(2);
    expect(lines.every(isSelected)).toBe(true);
  });

  it("without isSelected only the exact id is selected", () => {
    setup({ days: TWO_WEEKS, selectedId: "staff" });
    const lines = screen.getAllByText("Staff meeting").map((s) => s.closest(".planner-entry")!);
    expect(lines.map(isSelected)).toEqual([true, false]);
  });
});

describe("Planner month tabs", () => {
  it("are not drawn without onGoToMonth", () => {
    const { container } = setup();
    expect(screen.queryByRole("navigation", { name: "Months" })).toBeNull();
    expect(container.querySelector(".planner-tab")).toBeNull();
  });

  it("run January to December, raise the current month and jump on click", () => {
    const onGoToMonth = vi.fn();
    setup({ onGoToMonth, anchor: at(8, 23, 12) });
    const nav = screen.getByRole("navigation", { name: "Months" });
    const tabs = within(nav).getAllByRole("button");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]);
    const current = tabs.filter((t) => t.getAttribute("aria-current") === "date");
    expect(current.map((t) => t.textContent)).toEqual(["Sep"]);
    fireEvent.click(screen.getByRole("button", { name: "Dec" }));
    expect(onGoToMonth).toHaveBeenCalledWith(2026, 11);
  });

  it("fall back to the first day shown for the current month", () => {
    setup({ onGoToMonth: vi.fn(), days: [day(9, 1), day(9, 2)] });
    expect(screen.getByRole("button", { name: "Oct" }).getAttribute("aria-current")).toBe("date");
  });
});
