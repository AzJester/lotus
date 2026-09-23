// ============================================================================
// Planner: the ring-bound day planner that Notes R4.5 and R5 drew for their
// calendar views. Two facing paper pages lie open on a leather binder, metal
// rings run down the gutter, and every day is a ruled section that lists its
// entries as lines ("09:00 AM - 10:00 AM  Dentist"). The Calendar module uses
// it for the Two Days, One Week and Two Weeks formats under the classic theme.
// It is purely presentational: the caller supplies the days, the entries for
// each day and the callbacks.
//   2 days ...... one day per page
//   7 days ...... Mon-Wed on the left page, Thu-Sun on the right (Saturday and
//                 Sunday share the last slot, half height each)
//   14 days ..... one week per page, a row per day
// A day with more entries than fit scrolls on its own, and its header shows
// how many entries are out of sight ("3 more"). Optional hooks add right-
// click menus and dragging entries from one day to another.
// ============================================================================

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent, RefObject } from "react";
import type { CalEntryType, CalendarEntry } from "../../data/types";
import { DAYS, MONTHS, MONTHS_ABBR, fmtTime, startOfDay } from "../../lib/format";
import { Icon } from "../../components/Icon";
import "../../styles/planner.css";

export interface PlannerProps {
  /** Start-of-day epoch ms for each day shown: 2 (Two Days), 7 (One Week) or 14 (Two Weeks), consecutive. */
  days: number[];
  /** Entries overlapping a given day (already expanded for recurrence, sorted: all-day first, then by start). */
  entriesOn: (dayMs: number) => CalendarEntry[];
  selectedId: string | null;
  /** Whether an entry counts as selected (occurrences of a recurring series share a master id). Default: entry.id === selectedId. */
  isSelected?: (entryId: string, selectedId: string | null) => boolean;
  onSelect: (entry: CalendarEntry) => void;
  /** Double-click on an entry. */
  onOpen: (entry: CalendarEntry) => void;
  /** Double-click on empty space in a day (always hour 9). */
  onNewAt: (dayMs: number, hour: number) => void;
  typeColor: (t: CalEntryType) => string;
  /** Optional month tabs down the right page edge; clicking one jumps there (month 0-11). */
  onGoToMonth?: (year: number, month: number) => void;
  /** A time inside the period shown; used to highlight the current month tab. */
  anchor?: number;
  /** Right-click on an entry, or on empty space in a day. */
  onEntryContextMenu?: (ev: MouseEvent, entry: CalendarEntry) => void;
  onDayContextMenu?: (ev: MouseEvent, dayMs: number) => void;
  /** Dragging: which entries may be dragged, and the drag and drop callbacks. */
  canDrag?: (entry: CalendarEntry) => boolean;
  onEntryDragStart?: (ev: DragEvent, entry: CalendarEntry, dayMs: number) => void;
  onDayDragOver?: (ev: DragEvent, dayMs: number) => void;
  onDayDrop?: (ev: DragEvent, dayMs: number) => void;
  /** The day under a drag in progress (drawn as the drop target). */
  dropDay?: number | null;
}

/** The optional hooks every day and entry passes along. */
type Hooks = Pick<
  PlannerProps,
  "onEntryContextMenu" | "onDayContextMenu" | "canDrag" | "onEntryDragStart" | "onDayDragOver" | "onDayDrop" | "dropDay"
>;

/** New entries created from empty space start at 9 AM, like the grid views. */
const NEW_ENTRY_HOUR = 9;

/** Number of binder rings drawn down the gutter. */
const RING_COUNT = 8;

/** Index-tab colors, January through December (a muted planner rainbow). */
const TAB_COLORS = [
  "#ea9490",
  "#f0ab78",
  "#efd272",
  "#c0d872",
  "#8fcb8b",
  "#76c6b4",
  "#7dbbe2",
  "#96a7e8",
  "#b596e2",
  "#d993cf",
  "#e993ad",
  "#cfb594",
];

/** Join class names, skipping the falsy ones. */
const cx = (...names: (string | false)[]) => names.filter(Boolean).join(" ");

const TYPE_LABELS: Record<CalEntryType, string> = {
  appointment: "Appointment",
  meeting: "Meeting",
  reminder: "Reminder",
  event: "Event",
  anniversary: "Anniversary",
};

// --- date helpers -----------------------------------------------------------

/** Start of the following day (safe across daylight-saving changes). */
function nextDay(dayMs: number): number {
  const d = new Date(dayMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** "Monday, September 21" */
function dayLabel(dayMs: number): string {
  const d = new Date(dayMs);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "September 2026" */
function monthLabel(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function isWeekend(dayMs: number): boolean {
  const dow = new Date(dayMs).getDay();
  return dow === 0 || dow === 6;
}

/** ISO-8601 week number (weeks start on Monday; week 1 holds January 4). */
function isoWeek(ms: number): number {
  const d = new Date(ms);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
}

/**
 * The time column for an entry as it falls on one day. Timed entries that
 * spill past midnight read "From ..." on their first day, "Until ..." on
 * their last, and "All day" on any day they cover completely.
 */
function timeParts(entry: CalendarEntry, dayMs: number): { start: string; end?: string } {
  if (entry.allDay) return { start: "All day" };
  const dayStart = startOfDay(dayMs);
  const dayEnd = nextDay(dayStart);
  const before = entry.start < dayStart;
  const after = entry.end > dayEnd;
  if (before && after) return { start: "All day" };
  if (before) return { start: `Until ${fmtTime(entry.end)}` };
  if (after) return { start: `From ${fmtTime(entry.start)}` };
  if (entry.end <= entry.start) return { start: fmtTime(entry.start) };
  return { start: fmtTime(entry.start), end: fmtTime(entry.end) };
}

// --- page layout ------------------------------------------------------------

/** A slot on a page: one day, or Saturday + Sunday sharing it in One Week. */
type Slot = number[];

/**
 * Group the days into page slots and deal them onto the two pages, the left
 * page taking the first half. Only the One Week format pairs the weekend.
 */
function pageSlots(days: number[]): [Slot[], Slot[]] {
  const slots: Slot[] = [];
  for (let i = 0; i < days.length; i++) {
    const pairWeekend =
      days.length === 7 &&
      i + 1 < days.length &&
      new Date(days[i]).getDay() === 6 &&
      new Date(days[i + 1]).getDay() === 0;
    if (pairWeekend) {
      slots.push([days[i], days[i + 1]]);
      i++;
    } else {
      slots.push([days[i]]);
    }
  }
  const leftCount = Math.ceil(slots.length / 2);
  return [slots.slice(0, leftCount), slots.slice(leftCount)];
}

/**
 * The small printed captions across the top of the two pages: the month on
 * the left page, the week number on the right (plus the month again when the
 * right page starts a new one). In Two Weeks each page is a week of its own.
 */
function pageCaptions(left: Slot[], right: Slot[], format: number): [string, string] {
  const l = left[0]?.[0];
  const r = right[0]?.[0];
  if (l === undefined) return ["", ""];
  const leftCaption = format === 14 ? `${monthLabel(l)}  ·  Week ${isoWeek(l)}` : monthLabel(l);
  if (r === undefined) return [leftCaption, ""];
  const newMonth = new Date(r).getMonth() !== new Date(l).getMonth();
  const rightCaption = (newMonth ? `${monthLabel(r)}  ·  ` : "") + `Week ${isoWeek(r)}`;
  return [leftCaption, rightCaption];
}

// --- component ----------------------------------------------------------------

export default function Planner({
  days,
  entriesOn,
  selectedId,
  isSelected,
  onSelect,
  onOpen,
  onNewAt,
  typeColor,
  onGoToMonth,
  anchor,
  ...hooks
}: PlannerProps) {
  const [leftSlots, rightSlots] = pageSlots(days);
  const format = days.length <= 2 ? 2 : days.length <= 7 ? 7 : 14;
  const [leftCaption, rightCaption] = pageCaptions(leftSlots, rightSlots, format);
  const today = startOfDay(Date.now());
  const selected = isSelected ?? ((id: string, sel: string | null) => id === sel);

  const renderPage = (side: "left" | "right", slots: Slot[], caption: string) => (
    <div className={`planner-page planner-page-${side}`}>
      <div className="planner-sheet">
        <div className="planner-caption">{caption}</div>
        {slots.map((slot) => (
          <div key={slot[0]} className="planner-slot">
            {slot.map((dayMs) => (
              <PlannerDay
                key={dayMs}
                dayMs={dayMs}
                isToday={startOfDay(dayMs) === today}
                entries={entriesOn(dayMs)}
                selectedId={selectedId}
                selected={selected}
                typeColor={typeColor}
                onSelect={onSelect}
                onOpen={onOpen}
                onNewAt={onNewAt}
                hooks={hooks}
              />
            ))}
          </div>
        ))}
        {slots.length === 0 && <div className="planner-slot planner-slot-blank" />}
      </div>
      {side === "right" && onGoToMonth && (
        <MonthTabs at={anchor ?? days[0] ?? Date.now()} onGoToMonth={onGoToMonth} />
      )}
    </div>
  );

  return (
    <div className={cx("planner", `planner-days-${format}`, !!onGoToMonth && "planner-with-tabs")}>
      <div className="planner-book">
        {renderPage("left", leftSlots, leftCaption)}
        <div className="planner-binding" aria-hidden="true">
          {Array.from({ length: RING_COUNT }, (_, i) => (
            <div key={i} className="planner-ring">
              <span className="planner-ring-bar" />
            </div>
          ))}
        </div>
        {renderPage("right", rightSlots, rightCaption)}
      </div>
    </div>
  );
}

// --- one day section ------------------------------------------------------------

/** The entry lines of a day body that are (even partly) out of sight. */
function outOfSight(el: HTMLElement): { above: HTMLElement[]; below: HTMLElement[] } {
  const top = el.scrollTop - 1;
  const bottom = el.scrollTop + el.clientHeight + 1;
  const lines = Array.from(el.children) as HTMLElement[];
  return {
    above: lines.filter((c) => c.offsetTop < top),
    below: lines.filter((c) => c.offsetTop + c.offsetHeight > bottom),
  };
}

/**
 * How many entries of a scrolling day sit above and below its visible area,
 * re-measured after every render (the entries may have changed) and whenever
 * the day scrolls or resizes.
 */
function useOutOfSight(ref: RefObject<HTMLElement>): [number, number] {
  const [counts, setCounts] = useState<[number, number]>([0, 0]);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { above, below } = outOfSight(el);
    setCounts((prev) =>
      prev[0] === above.length && prev[1] === below.length ? prev : [above.length, below.length],
    );
  }, [ref]);
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [ref, measure]);
  return counts;
}

function PlannerDay({
  dayMs,
  isToday,
  entries,
  selectedId,
  selected,
  typeColor,
  onSelect,
  onOpen,
  onNewAt,
  hooks,
}: {
  dayMs: number;
  isToday: boolean;
  entries: CalendarEntry[];
  selectedId: string | null;
  selected: (entryId: string, selectedId: string | null) => boolean;
  typeColor: (t: CalEntryType) => string;
  onSelect: (entry: CalendarEntry) => void;
  onOpen: (entry: CalendarEntry) => void;
  onNewAt: (dayMs: number, hour: number) => void;
  hooks: Hooks;
}) {
  const label = dayLabel(dayMs);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [above, below] = useOutOfSight(bodyRef);
  // A timed entry that ends just as this day begins belongs to the day before
  // (it would otherwise read "Until 12:00 AM").
  const dayStart = startOfDay(dayMs);
  const lines = entries.filter((e) => e.allDay || e.start >= dayStart || e.end > dayStart);

  // Page through a day that holds more entries than fit: "more" brings the
  // first line out of sight below up to the top, "above" pages back up.
  const page = (dir: 1 | -1) => (ev: MouseEvent) => {
    ev.stopPropagation();
    const el = bodyRef.current;
    if (!el) return;
    let top = 0;
    if (dir > 0) {
      const next = outOfSight(el).below[0];
      if (!next) return;
      top = next.offsetTop;
    } else {
      const target = el.scrollTop - el.clientHeight + 1;
      const first = (Array.from(el.children) as HTMLElement[]).find((c) => c.offsetTop >= target);
      if (first && first.offsetTop < el.scrollTop) top = first.offsetTop;
    }
    const still =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top, behavior: still ? "auto" : "smooth" });
  };
  const keepDoubleClick = (ev: MouseEvent) => ev.stopPropagation();

  return (
    <section
      className={cx(
        "planner-day",
        isToday && "today",
        isWeekend(dayMs) && "weekend",
        hooks.dropDay === dayMs && "drop-target",
      )}
      aria-label={label}
      data-day={dayMs}
      onDoubleClick={() => onNewAt(dayMs, NEW_ENTRY_HOUR)}
      onContextMenu={
        hooks.onDayContextMenu
          ? (ev) => {
              ev.preventDefault();
              hooks.onDayContextMenu!(ev, dayMs);
            }
          : undefined
      }
      onDragOver={hooks.onDayDragOver ? (ev) => hooks.onDayDragOver!(ev, dayMs) : undefined}
      onDrop={hooks.onDayDrop ? (ev) => hooks.onDayDrop!(ev, dayMs) : undefined}
    >
      <h3 className="planner-day-head">
        <span className="planner-day-name">{label}</span>
        {above > 0 && (
          <button
            type="button"
            className="planner-more planner-more-up"
            title="Show the entries above"
            onClick={page(-1)}
            onDoubleClick={keepDoubleClick}
          >
            {above} above
          </button>
        )}
        {below > 0 && (
          <button
            type="button"
            className="planner-more"
            title="Show the entries below"
            onClick={page(1)}
            onDoubleClick={keepDoubleClick}
          >
            {below} more
          </button>
        )}
        {isToday && <span className="planner-day-today">Today</span>}
      </h3>
      <div
        ref={bodyRef}
        className={cx("planner-day-body", above > 0 && "more-above", below > 0 && "more-below")}
        role="listbox"
        aria-label={`Entries for ${label}`}
      >
        {lines.map((entry) => (
          <PlannerEntry
            key={entry.id}
            entry={entry}
            dayMs={dayMs}
            isSelected={selected(entry.id, selectedId)}
            color={typeColor(entry.type)}
            onSelect={onSelect}
            onOpen={onOpen}
            hooks={hooks}
          />
        ))}
      </div>
    </section>
  );
}

// --- one entry line -------------------------------------------------------------

function PlannerEntry({
  entry,
  dayMs,
  isSelected,
  color,
  onSelect,
  onOpen,
  hooks,
}: {
  entry: CalendarEntry;
  dayMs: number;
  isSelected: boolean;
  color: string;
  onSelect: (entry: CalendarEntry) => void;
  onOpen: (entry: CalendarEntry) => void;
  hooks: Hooks;
}) {
  const time = timeParts(entry, dayMs);
  const timeText = time.end ? `${time.start} - ${time.end}` : time.start;
  const kind = TYPE_LABELS[entry.type] ?? entry.type;
  const tooltip = [
    `${timeText}  ${entry.subject}`,
    entry.location,
    entry.recurrence ? `${kind}, repeats ${entry.recurrence.freq}` : kind,
  ]
    .filter(Boolean)
    .join("\n");

  const click = (ev: MouseEvent) => {
    ev.stopPropagation();
    onSelect(entry);
  };
  const doubleClick = (ev: MouseEvent) => {
    ev.stopPropagation();
    onOpen(entry);
  };
  const menu = (ev: MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    onSelect(entry);
    hooks.onEntryContextMenu?.(ev, entry);
  };
  const draggable = !!hooks.onEntryDragStart && (hooks.canDrag?.(entry) ?? true);
  const key = (ev: KeyboardEvent) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return; // Alt+Enter is Document Properties
    if (ev.key === "Enter") {
      ev.preventDefault();
      onOpen(entry);
    } else if (ev.key === " ") {
      ev.preventDefault();
      onSelect(entry);
    }
  };

  return (
    <div
      className={cx("planner-entry", isSelected && "selected", entry.allDay && "all-day")}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      title={tooltip}
      data-entry-id={entry.id}
      onClick={click}
      onDoubleClick={doubleClick}
      onKeyDown={key}
      onContextMenu={hooks.onEntryContextMenu ? menu : undefined}
      draggable={draggable || undefined}
      onDragStart={draggable ? (ev) => hooks.onEntryDragStart!(ev, entry, dayMs) : undefined}
    >
      <span
        className="planner-mark"
        style={{ "--mark": color } as CSSProperties}
        aria-hidden="true"
      />
      <span className="planner-time">
        {time.start}
        {time.end && <span className="planner-time-end"> - {time.end}</span>}
      </span>
      {entry.recurrence && <Icon name="recurrence" className="planner-recur" title="Recurring" />}
      <span className="planner-subject">
        {entry.subject}
        {entry.location && <span className="planner-loc"> ({entry.location})</span>}
      </span>
    </div>
  );
}

// --- month index tabs -------------------------------------------------------------

function MonthTabs({
  at,
  onGoToMonth,
}: {
  at: number;
  onGoToMonth: (year: number, month: number) => void;
}) {
  const d = new Date(at);
  const year = d.getFullYear();
  const current = d.getMonth();
  return (
    <nav className="planner-tabs" aria-label="Months">
      {MONTHS_ABBR.map((abbr, i) => (
        <button
          key={abbr}
          type="button"
          className={cx("planner-tab", i === current && "current")}
          style={{ "--tab": TAB_COLORS[i] } as CSSProperties}
          aria-current={i === current ? "date" : undefined}
          title={`${MONTHS[i]} ${year}`}
          onClick={() => onGoToMonth(year, i)}
        >
          {abbr}
        </button>
      ))}
    </nav>
  );
}
