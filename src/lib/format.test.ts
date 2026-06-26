import { describe, expect, it } from "vitest";
import { fmtDate, fmtTime, sameDay, toDateInput, initials, startOfDay } from "./format";

describe("format helpers", () => {
  it("formats a date as MM/DD/YYYY", () => {
    expect(fmtDate(new Date(2026, 5, 25, 9, 5).getTime())).toBe("06/25/2026");
  });

  it("formats time with AM/PM", () => {
    expect(fmtTime(new Date(2026, 5, 25, 9, 5).getTime())).toBe("09:05 AM");
    expect(fmtTime(new Date(2026, 5, 25, 13, 0).getTime())).toBe("01:00 PM");
  });

  it("derives initials", () => {
    expect(initials("Sam Rivera")).toBe("SR");
    expect(initials("Madonna")).toBe("MA");
  });

  it("compares calendar days", () => {
    const a = new Date(2026, 5, 25, 1).getTime();
    const b = new Date(2026, 5, 25, 23).getTime();
    const c = new Date(2026, 5, 26, 0).getTime();
    expect(sameDay(a, b)).toBe(true);
    expect(sameDay(a, c)).toBe(false);
  });

  it("produces a date-input value", () => {
    expect(toDateInput(new Date(2026, 5, 5).getTime())).toBe("2026-06-05");
  });

  it("normalizes to start of day", () => {
    const d = new Date(2026, 5, 25, 14, 30, 15);
    expect(new Date(startOfDay(d.getTime())).getHours()).toBe(0);
  });
});
