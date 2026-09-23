// ============================================================================
// The date picker at the top of the Calendar navigator: one month of days
// with arrows to page through months. Today is boxed, the days the calendar
// shows are shaded, days with entries are bold, and clicking a day takes the
// calendar there.
// ============================================================================

import { MONTHS, DAYS_ABBR, startOfDay } from "../../lib/format";
import { addMonths, isWeekend, longDate, monthWeeks, startOfMonth, weekdayOrder } from "./calendarModel";
import type { WeekStart } from "./calendarModel";

export function DatePicker({
  month,
  onMonth,
  shown,
  busy,
  onPick,
  weekStart,
}: {
  /** Any time in the month on display. */
  month: number;
  onMonth: (month: number) => void;
  /** Start-of-day of every day the calendar currently shows. */
  shown: Set<number>;
  /** Start-of-day of days that have entries. */
  busy: Set<number>;
  onPick: (day: number) => void;
  weekStart: WeekStart;
}) {
  const first = startOfMonth(month);
  const m = new Date(first).getMonth();
  const today = startOfDay(Date.now());
  const weeks = monthWeeks(first, weekStart);
  return (
    <div className="cal-picker" role="group" aria-label="Date picker">
      <div className="cal-picker-head">
        <button type="button" className="cal-picker-arrow" title="Previous month" onClick={() => onMonth(addMonths(first, -1))}>
          ◄
        </button>
        <span className="cal-picker-title">
          {MONTHS[m]} {new Date(first).getFullYear()}
        </span>
        <button type="button" className="cal-picker-arrow" title="Next month" onClick={() => onMonth(addMonths(first, 1))}>
          ►
        </button>
      </div>
      <table className="cal-picker-grid">
        <thead>
          <tr>
            {weekdayOrder(weekStart).map((d) => (
              <th key={d} title={DAYS_ABBR[d]}>
                {DAYS_ABBR[d][0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((d) => {
                const date = new Date(d);
                const cls = [
                  "cal-pd",
                  date.getMonth() !== m && "outside",
                  d === today && "today",
                  shown.has(d) && "shown",
                  busy.has(d) && "busy",
                  isWeekend(d) && "weekend",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <td key={d}>
                    <button
                      type="button"
                      className={cls}
                      title={longDate(d)}
                      aria-current={d === today ? "date" : undefined}
                      onClick={() => onPick(d)}
                    >
                      {date.getDate()}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="cal-picker-today" onClick={() => onPick(today)}>
        Today
      </button>
    </div>
  );
}
