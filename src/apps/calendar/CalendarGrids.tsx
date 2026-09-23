// ============================================================================
// The calendar formats that draw a grid. TimeGrid is the Day, Two Days, Work
// Week and One Week format: a header per day, an all-day strip where events
// run as bars across the days they cover, and 24 hour rows (scrolled to
// 8 AM) with entries as colored blocks, overlapping ones side by side, and a
// red line at the current time. DayGrid is the Two Weeks and One Month
// format: a cell per day listing its entries. Entries are selected with a
// click, opened with a double-click, dragged to another time or day to
// reschedule them, and time-grid blocks resize from their bottom edge.
// Double-clicking empty space creates an entry there.
// ============================================================================

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent, PointerEvent } from "react";
import type { CalEntryType, CalendarEntry } from "../../data/types";
import { masterIdOf } from "../../data/calendarUtil";
import { Icon } from "../../components/Icon";
import { DRAG_DOC } from "../../shell/BookmarkBar";
import { DAYS, DAYS_ABBR, MONTHS_ABBR, fmtTime, startOfDay } from "../../lib/format";
import {
  DEFAULT_HOUR,
  addDays,
  allDayLanes,
  atMinutes,
  entriesForDay,
  hourLabel,
  isWeekend,
  layoutDay,
  longDate,
  shortRange,
  shortTime,
  snapMinutes,
  timeRangeText,
  wallMinutes,
  weekdayOrder,
  TYPE_LABEL,
} from "./calendarModel";
import type { Placed, WeekStart } from "./calendarModel";

/** Height of one hour row in the time grid. */
export const HOUR_PX = 40;
/** A drag is a move of the entry, the drop target reads this type. */
const DRAG_ENTRY = "application/x-notes-calendar-entry";

export interface GridProps {
  /** Every occurrence in (or touching) the period, repeating entries expanded. */
  occurrences: CalendarEntry[];
  selectedId: string | null;
  now: number;
  onSelect: (e: CalendarEntry) => void;
  onOpen: (e: CalendarEntry) => void;
  /** Double-click on empty space. */
  onNew: (type: CalEntryType, start: number) => void;
  onEntryMenu: (ev: MouseEvent, e: CalendarEntry) => void;
  /** Right-click on empty space: the day, and the time under the pointer (null: all day). */
  onSlotMenu: (ev: MouseEvent, day: number, minutes: number | null) => void;
  /** Drop after a drag (or a resize): the new start and end. */
  onMove: (e: CalendarEntry, start: number, end: number) => void;
  /** Entries you may reschedule (not meetings someone else chairs). */
  canMove: (e: CalendarEntry) => boolean;
  /** The date in a header or cell was clicked: show that day. */
  onShowDay: (day: number) => void;
  /** Tentatively accepted meetings are drawn hatched ("pencilled in"). */
  isTentative: (e: CalendarEntry) => boolean;
}

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

function tooltip(e: CalendarEntry): string {
  return [
    `${timeRangeText(e)}  ${e.subject || "(Untitled)"}`,
    e.location && `Where: ${e.location}`,
    e.type === "meeting" && e.chair ? `Chair: ${e.chair.name}` : "",
    e.recurrence ? `${TYPE_LABEL[e.type]}, repeats ${e.recurrence.freq}` : TYPE_LABEL[e.type],
  ]
    .filter(Boolean)
    .join("\n");
}

/** Small icons in front of a subject: repeats, alarm. */
function Marks({ e }: { e: CalendarEntry }) {
  return (
    <>
      {e.recurrence && <Icon name="recurrence" className="cal-mark" title="Repeats" />}
      {e.alarm && <Icon name="alarm" className="cal-mark" title="Alarm" />}
    </>
  );
}

/** Start a drag of an entry: the calendar moves it, the bookmark bar bookmarks it. */
export function startEntryDrag(ev: DragEvent, e: CalendarEntry) {
  ev.dataTransfer.effectAllowed = "copyMove";
  ev.dataTransfer.setData(DRAG_ENTRY, e.id);
  ev.dataTransfer.setData("text/plain", e.subject);
  ev.dataTransfer.setData(DRAG_DOC, JSON.stringify({ coll: "calendar", id: masterIdOf(e.id), title: e.subject }));
}

/** An entry as a one-line chip (all-day strip, month cells). */
function Chip({
  e,
  props,
  style,
  className,
  onDragStart,
  onDragEnd,
  showTime = true,
}: {
  e: CalendarEntry;
  props: GridProps;
  style?: CSSProperties;
  className?: string;
  onDragStart?: (ev: DragEvent) => void;
  onDragEnd?: () => void;
  showTime?: boolean;
}) {
  const movable = props.canMove(e);
  return (
    <div
      className={cx(
        "cal-chip",
        "cal-t-" + e.type,
        e.allDay && "all-day",
        props.selectedId === e.id && "selected",
        props.isTentative(e) && "tentative",
        className,
      )}
      style={style}
      title={tooltip(e)}
      data-entry-id={e.id}
      draggable={movable}
      onDragStart={(ev) => {
        startEntryDrag(ev, e);
        onDragStart?.(ev);
      }}
      onDragEnd={onDragEnd}
      onMouseDown={(ev) => {
        if (ev.button === 0) props.onSelect(e);
      }}
      onDoubleClick={(ev) => {
        ev.stopPropagation();
        props.onOpen(e);
      }}
      onContextMenu={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        props.onSelect(e);
        props.onEntryMenu(ev, e);
      }}
    >
      {!e.allDay && <span className="cal-chip-mark" aria-hidden="true" />}
      {!e.allDay && showTime && <span className="cal-chip-time">{shortTime(e.start)}</span>}
      <Marks e={e} />
      <span className="cal-chip-subj">{e.subject || "(Untitled)"}</span>
    </div>
  );
}

// ===========================================================================
// Time grid
// ===========================================================================

function dayHead(day: number, count: number): { dow: string; date: string } {
  const d = new Date(day);
  if (count <= 2) return { dow: DAYS[d.getDay()], date: `${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}` };
  return { dow: DAYS_ABBR[d.getDay()], date: `${d.getMonth() + 1}/${d.getDate()}` };
}

interface Ghost {
  day: number;
  top: number;
  height: number;
}

export function TimeGrid(props: GridProps & { days: number[] }) {
  const { days, occurrences, now } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ entry: CalendarEntry; grab: number; allDayOffset: number } | null>(null);
  const resizingRef = useRef(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [allDayDrop, setAllDayDrop] = useState<number | null>(null);
  const [stretch, setStretch] = useState<{ id: string; end: number } | null>(null);
  const today = startOfDay(now);

  // Start the day at 8 AM, as Notes does.
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 8 * HOUR_PX - 12;
  }, []);

  const lanes = allDayLanes(occurrences, days);
  const laneCount = Math.max(1, ...lanes.map((l) => l.lane + 1));
  const columns = days.map((day) => ({ day, placed: layoutDay(entriesForDay(occurrences, day), day) }));

  const minutesAt = (ev: { clientY: number }, col: HTMLElement) =>
    ((ev.clientY - col.getBoundingClientRect().top) / HOUR_PX) * 60;

  const clearDrag = () => {
    dragRef.current = null;
    setGhost(null);
    setAllDayDrop(null);
  };

  // A drag that ends outside any drop target still has to clear the ghost.
  useEffect(() => {
    window.addEventListener("dragend", clearDrag);
    return () => window.removeEventListener("dragend", clearDrag);
  }, []);

  // --- dragging timed blocks onto the hour columns ------------------------
  const dropTimeFor = (ev: DragEvent, day: number, col: HTMLElement) => {
    const d = dragRef.current!;
    const duration = Math.max(0, d.entry.end - d.entry.start);
    const top = Math.max(0, Math.min(1440 - 15, snapMinutes(minutesAt(ev, col) - d.grab)));
    return { top, start: atMinutes(day, top), duration };
  };

  const colDragOver = (ev: DragEvent<HTMLDivElement>, day: number) => {
    const d = dragRef.current;
    if (!d || d.entry.allDay) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    const { top, duration } = dropTimeFor(ev, day, ev.currentTarget);
    const height = Math.max(30, Math.min(duration / 60000, 1440 - top));
    if (!ghost || ghost.day !== day || ghost.top !== top || ghost.height !== height) setGhost({ day, top, height });
  };

  const colDrop = (ev: DragEvent<HTMLDivElement>, day: number) => {
    const d = dragRef.current;
    if (!d || d.entry.allDay) return;
    ev.preventDefault();
    const { start, duration } = dropTimeFor(ev, day, ev.currentTarget);
    clearDrag();
    props.onMove(d.entry, start, start + duration);
  };

  // --- dragging all-day bars across the all-day strip ----------------------
  const dayIndexAt = (ev: { clientX: number }, strip: HTMLElement) => {
    const cells = Array.from(strip.querySelectorAll<HTMLElement>(".cal-tg-allcell"));
    const i = cells.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return ev.clientX >= r.left && ev.clientX < r.right;
    });
    return i;
  };

  const stripDragOver = (ev: DragEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || !d.entry.allDay) return;
    const i = dayIndexAt(ev, ev.currentTarget);
    if (i < 0) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    if (allDayDrop !== i) setAllDayDrop(i);
  };

  const stripDrop = (ev: DragEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || !d.entry.allDay) return;
    const i = dayIndexAt(ev, ev.currentTarget);
    if (i < 0) return;
    ev.preventDefault();
    const lane = lanes.find((l) => l.entry.id === d.entry.id);
    clearDrag();
    if (!lane) return;
    const grabbedDay = addDays(days[lane.from], d.allDayOffset);
    const shift = Math.round((days[i] - grabbedDay) / 86400000);
    if (shift) props.onMove(d.entry, addDays(d.entry.start, shift), addDays(d.entry.end, shift));
  };

  // --- resizing a block from its bottom edge -------------------------------
  const beginStretch = (ev: PointerEvent<HTMLDivElement>, p: Placed, day: number) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    ev.preventDefault();
    resizingRef.current = true;
    const handle = ev.currentTarget;
    handle.setPointerCapture(ev.pointerId);
    const e = p.entry;
    const startY = ev.clientY;
    const baseEnd = wallMinutes(e.end) || 1440;
    const minEnd = wallMinutes(e.start) + 15;
    let end = baseEnd;
    const move = (m: globalThis.PointerEvent) => {
      end = Math.max(minEnd, snapMinutes(baseEnd + ((m.clientY - startY) / HOUR_PX) * 60));
      setStretch({ id: e.id, end });
    };
    const up = (u: globalThis.PointerEvent) => {
      handle.releasePointerCapture(u.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      resizingRef.current = false;
      setStretch(null);
      if (end !== baseEnd) props.onMove(e, e.start, atMinutes(day, end));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  const style = { "--cal-days": days.length, "--cal-hour": `${HOUR_PX}px` } as CSSProperties;

  return (
    <div className={cx("cal-tg", days.length === 1 && "cal-tg-single")} ref={scrollRef} style={style}>
      <div className="cal-tg-top">
        <div className="cal-tg-heads">
          <div className="cal-tg-corner" />
          {days.map((day) => {
            const { dow, date } = dayHead(day, days.length);
            return (
              <button
                type="button"
                key={day}
                className={cx("cal-tg-dayhead", day === today && "today", isWeekend(day) && "weekend")}
                title={`${longDate(day)}${days.length > 1 ? " (click to show this day)" : ""}`}
                onClick={() => days.length > 1 && props.onShowDay(day)}
              >
                <span className="cal-tg-dow">{dow}</span> <span className="cal-tg-date">{date}</span>
              </button>
            );
          })}
        </div>
        <div
          className="cal-tg-allday"
          style={{ gridTemplateRows: `repeat(${laneCount}, 21px)` }}
          onDragOver={stripDragOver}
          onDragLeave={(ev) => {
            if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setAllDayDrop(null);
          }}
          onDrop={stripDrop}
        >
          <div className="cal-tg-alllabel" style={{ gridRow: `1 / span ${laneCount}` }}>
            All day
          </div>
          {days.map((day, i) => (
            <div
              key={day}
              className={cx("cal-tg-allcell", day === today && "today", isWeekend(day) && "weekend", allDayDrop === i && "drop")}
              style={{ gridColumn: i + 2, gridRow: `1 / span ${laneCount}` }}
              onDoubleClick={() => props.onNew("event", day)}
              onContextMenu={(ev) => {
                ev.preventDefault();
                props.onSlotMenu(ev, day, null);
              }}
            />
          ))}
          {lanes.map((l) => (
            <Chip
              key={l.entry.id}
              e={l.entry}
              props={props}
              className={cx("cal-bar", l.before && "from-before", l.after && "goes-on")}
              style={{ gridColumn: `${l.from + 2} / ${l.to + 3}`, gridRow: l.lane + 1 }}
              onDragStart={(ev) => {
                const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                const span = l.to - l.from + 1;
                const offset = Math.max(0, Math.min(span - 1, Math.floor(((ev.clientX - r.left) / r.width) * span)));
                dragRef.current = { entry: l.entry, grab: 0, allDayOffset: offset };
              }}
              onDragEnd={clearDrag}
            />
          ))}
        </div>
      </div>

      <div className="cal-tg-body" style={{ height: 24 * HOUR_PX }}>
        <div className="cal-tg-gutter" aria-hidden="true">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className={cx("cal-tg-hour", (h < 8 || h >= 18) && "off")} style={{ height: HOUR_PX }}>
              {h > 0 && <span>{hourLabel(h)}</span>}
            </div>
          ))}
        </div>
        {columns.map(({ day, placed }) => (
          <div
            key={day}
            className={cx("cal-tg-col", day === today && "today", isWeekend(day) && "weekend")}
            data-day={day}
            onDoubleClick={(ev) => {
              if (ev.target !== ev.currentTarget) return;
              const minutes = Math.floor(minutesAt(ev, ev.currentTarget) / 30) * 30;
              props.onNew("appointment", atMinutes(day, Math.max(0, Math.min(1410, minutes))));
            }}
            onContextMenu={(ev) => {
              if (ev.target !== ev.currentTarget) return;
              ev.preventDefault();
              props.onSlotMenu(ev, day, Math.max(0, Math.min(1410, Math.floor(minutesAt(ev, ev.currentTarget) / 30) * 30)));
            }}
            onDragOver={(ev) => colDragOver(ev, day)}
            onDragLeave={(ev) => {
              if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setGhost((g) => (g && g.day === day ? null : g));
            }}
            onDrop={(ev) => colDrop(ev, day)}
          >
            {placed.map((p) => (
              <Block
                key={p.entry.id}
                p={p}
                props={props}
                stretchedEnd={stretch?.id === p.entry.id ? stretch.end : null}
                onDragStart={(ev) => {
                  if (resizingRef.current) {
                    ev.preventDefault();
                    return;
                  }
                  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                  dragRef.current = { entry: p.entry, grab: p.fromBefore ? 0 : ((ev.clientY - r.top) / HOUR_PX) * 60, allDayOffset: 0 };
                }}
                onDragEnd={clearDrag}
                onStretch={(ev) => beginStretch(ev, p, day)}
              />
            ))}
            {ghost && ghost.day === day && (
              <div
                className="cal-tg-ghost"
                style={{ top: (ghost.top * HOUR_PX) / 60, height: (ghost.height * HOUR_PX) / 60 }}
                aria-hidden="true"
              >
                {fmtTime(atMinutes(day, ghost.top))}
              </div>
            )}
            {day === today && (
              <div className="cal-now" style={{ top: (wallMinutes(now) * HOUR_PX) / 60 }} title={`Now: ${fmtTime(now)}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Block({
  p,
  props,
  stretchedEnd,
  onDragStart,
  onDragEnd,
  onStretch,
}: {
  p: Placed;
  props: GridProps;
  stretchedEnd: number | null;
  onDragStart: (ev: DragEvent) => void;
  onDragEnd: () => void;
  onStretch: (ev: PointerEvent<HTMLDivElement>) => void;
}) {
  const e = p.entry;
  const movable = props.canMove(e);
  const height = stretchedEnd !== null ? Math.max(15, stretchedEnd - p.top) : p.height;
  const px = (height * HOUR_PX) / 60;
  const resizable = movable && e.end > e.start && !p.fromBefore && !p.goesOn;
  const short = px < 34;
  const time =
    stretchedEnd !== null
      ? `${shortTime(e.start)} - ${shortTime(atMinutes(e.start, stretchedEnd))}`
      : short
        ? shortTime(e.start)
        : shortRange(e);
  return (
    <div
      className={cx(
        "cal-block",
        "cal-t-" + e.type,
        props.selectedId === e.id && "selected",
        props.isTentative(e) && "tentative",
        short && "short",
        p.fromBefore && "from-before",
        p.goesOn && "goes-on",
      )}
      style={{
        top: (p.top * HOUR_PX) / 60,
        height: px,
        left: `calc(${(p.col / p.cols) * 100}% + 1px)`,
        width: `calc(${(p.span / p.cols) * 100}% - 4px)`,
      }}
      title={tooltip(e)}
      data-entry-id={e.id}
      draggable={movable}
      onDragStart={(ev) => {
        startEntryDrag(ev, e);
        onDragStart(ev);
      }}
      onDragEnd={onDragEnd}
      onMouseDown={(ev) => {
        if (ev.button === 0) props.onSelect(e);
      }}
      onDoubleClick={(ev) => {
        ev.stopPropagation();
        props.onOpen(e);
      }}
      onContextMenu={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        props.onSelect(e);
        props.onEntryMenu(ev, e);
      }}
    >
      <div className="cal-block-time">
        {p.fromBefore && "... "}
        {time}
      </div>
      <div className="cal-block-subj">
        <Marks e={e} />
        {e.type === "meeting" && <Icon name="meeting" className="cal-mark" />}
        {e.type === "reminder" && <Icon name="reminder" className="cal-mark" />}
        <span>{e.subject || "(Untitled)"}</span>
      </div>
      {e.location && <div className="cal-block-loc">{e.location}</div>}
      {resizable && <div className="cal-block-resize" title="Drag to change the end time" onPointerDown={onStretch} />}
    </div>
  );
}

// ===========================================================================
// Day grid (Two Weeks and One Month)
// ===========================================================================

const CELL_HEAD_PX = 19;
const CHIP_PX = 17;

export function DayGrid(props: GridProps & { weeks: number[][]; month: number | null; weekStart: WeekStart }) {
  const { weeks, month, occurrences, now } = props;
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ entry: CalendarEntry; day: number } | null>(null);
  const [dropDay, setDropDay] = useState<number | null>(null);
  const [rowPx, setRowPx] = useState(90);
  const today = startOfDay(now);

  // How many chips fit in a cell depends on the window height.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setRowPx(el.clientHeight / Math.max(1, weeks.length));
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [weeks.length]);

  useEffect(() => {
    const clear = () => {
      dragRef.current = null;
      setDropDay(null);
    };
    window.addEventListener("dragend", clear);
    return () => window.removeEventListener("dragend", clear);
  }, []);

  const capacity = Math.max(1, Math.floor((rowPx - CELL_HEAD_PX - 4) / CHIP_PX));

  return (
    <div className={cx("cal-dg", month === null && "cal-dg-weeks")}>
      <div className="cal-dg-head">
        {weekdayOrder(props.weekStart).map((d) => (
          <div key={d} className={cx("cal-dg-dow", (d === 0 || d === 6) && "weekend")}>
            {DAYS[d]}
          </div>
        ))}
      </div>
      <div className="cal-dg-body" ref={bodyRef} style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.flat().map((day, i) => {
          const d = new Date(day);
          const list = entriesForDay(occurrences, day);
          const fits = list.length > capacity ? capacity - 1 : list.length;
          const more = list.length - fits;
          const first = i === 0 || d.getDate() === 1;
          return (
            <div
              key={day}
              className={cx(
                "cal-dg-cell",
                day === today && "today",
                month !== null && d.getMonth() !== month && "outside",
                isWeekend(day) && "weekend",
                dropDay === day && "drop",
              )}
              data-day={day}
              onDoubleClick={(ev) => {
                if ((ev.target as HTMLElement).closest(".cal-chip, .cal-dg-num, .cal-dg-more")) return;
                props.onNew("appointment", atMinutes(day, DEFAULT_HOUR * 60));
              }}
              onContextMenu={(ev) => {
                if ((ev.target as HTMLElement).closest(".cal-chip")) return;
                ev.preventDefault();
                props.onSlotMenu(ev, day, DEFAULT_HOUR * 60);
              }}
              onDragOver={(ev) => {
                if (!dragRef.current) return;
                ev.preventDefault();
                ev.dataTransfer.dropEffect = "move";
                if (dropDay !== day) setDropDay(day);
              }}
              onDragLeave={(ev) => {
                if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setDropDay((x) => (x === day ? null : x));
              }}
              onDrop={(ev) => {
                const drag = dragRef.current;
                if (!drag) return;
                ev.preventDefault();
                dragRef.current = null;
                setDropDay(null);
                const shift = Math.round((day - drag.day) / 86400000);
                if (shift) props.onMove(drag.entry, addDays(drag.entry.start, shift), addDays(drag.entry.end, shift));
              }}
            >
              <div className="cal-dg-date">
                <button
                  type="button"
                  className="cal-dg-num"
                  title={`${longDate(day)} (click to show this day)`}
                  onClick={() => props.onShowDay(day)}
                >
                  {first ? `${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}` : d.getDate()}
                </button>
              </div>
              <div className="cal-dg-list">
                {list.slice(0, fits).map((e) => (
                  <Chip
                    key={e.id}
                    e={e}
                    props={props}
                    onDragStart={() => {
                      dragRef.current = { entry: e, day };
                    }}
                    onDragEnd={() => {
                      dragRef.current = null;
                      setDropDay(null);
                    }}
                  />
                ))}
                {more > 0 && (
                  <button
                    type="button"
                    className="cal-dg-more"
                    title={`Show all ${list.length} entries of ${longDate(day)}`}
                    onClick={() => props.onShowDay(day)}
                  >
                    +{more} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
