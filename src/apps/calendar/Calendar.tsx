// ============================================================================
// Calendar: the calendar views of the mail file. The navigator holds the
// date picker and the formats (Day, Two Days, Work Week, One Week, Two
// Weeks, One Month) plus the All Entries and Meetings views. The time-grid
// formats draw entries as blocks on hour rows, Two Weeks and One Month as
// day cells; under the Classic R5 theme the Two Days, One Week and Two Weeks
// formats are the ring-bound planner R4 and R5 drew. Entries open in their
// own window (CalendarDocument, see EntryDocument.tsx), repeat instances
// open their series, and dragging an entry reschedules it.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, MouseEvent } from "react";
import { ActionBar } from "../../components/ActionBar";
import type { ActionItem } from "../../components/ActionBar";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { NotesView } from "../../components/NotesView";
import type { ViewColumn } from "../../components/NotesView";
import { openContextMenu } from "../../components/menu";
import type { MenuItem } from "../../components/menu";
import { Splitter } from "../../components/Splitter";
import { useTab, useTabCommands } from "../../components/tabs";
import { useNotes, isOnline } from "../../data/store";
import { useUI } from "../../data/ui";
import type { CalEntryType, CalendarEntry } from "../../data/types";
import { masterIdOf } from "../../data/calendarUtil";
import { MAIL_SERVER } from "../../data/directory";
import { DRAG_DOC } from "../../shell/BookmarkBar";
import { fmtDate, fmtTime, startOfDay } from "../../lib/format";
import Planner from "./Planner";
import { DayGrid, TimeGrid, startEntryDrag } from "./CalendarGrids";
import type { GridProps } from "./CalendarGrids";
import { DatePicker } from "./DatePicker";
import {
  DEFAULT_HOUR,
  TYPE_COLOR,
  TYPE_ICON,
  TYPE_LABEL,
  addDays,
  atMinutes,
  compareMonthCategory,
  entriesForDay,
  isPeriodView,
  matchesQuery,
  monthCategory,
  monthWeeks,
  occurrencesBetween,
  periodDays,
  periodTitle,
  startOfMonth,
  stepAnchor,
  timeRangeText,
  weekLabel,
} from "./calendarModel";
import type { CalView, WeekStart } from "./calendarModel";
import { isInvited, meetingStatusText, roleText } from "./meetingModel";
import {
  copyEntryLink,
  copyIntoMemo,
  copyIntoTodo,
  deleteEntries,
  entryMenu,
  entryProperties,
  goToDialog,
  masterOf,
  newEntry,
  openEntry,
  rescheduleEntry,
} from "./calendarActions";
import "../../styles/calendar.css";

export { CalendarDocument } from "./EntryDocument";

const FORMATS: { id: CalView; label: string; icon: IconName }[] = [
  { id: "day", label: "Day", icon: "cal-day" },
  { id: "twodays", label: "Two Days", icon: "cal-twodays" },
  { id: "workweek", label: "Work Week", icon: "cal-workweek" },
  { id: "week", label: "One Week", icon: "cal-week" },
  { id: "twoweeks", label: "Two Weeks", icon: "cal-twoweeks" },
  { id: "month", label: "One Month", icon: "cal-month" },
];

const LISTS: { id: CalView; label: string; icon: IconName }[] = [
  { id: "all", label: "All Entries", icon: "cal-list" },
  { id: "meetings", label: "Meetings", icon: "meetings" },
];

const NEW_TYPES: CalEntryType[] = ["appointment", "meeting", "reminder", "event", "anniversary"];

/** The formats the R5 planner draws. */
const PLANNER_VIEWS: CalView[] = ["twodays", "week", "twoweeks"];

// The format and date survive closing and reopening the Calendar window.
let lastView: CalView = "week";
let lastAnchor: number | null = null;

export default function Calendar() {
  const { active } = useTab();
  const calendar = useNotes((s) => s.calendar);
  const user = useNotes((s) => s.user);
  const theme = useUI((s) => s.theme);
  const setStatus = useUI((s) => s.setStatus);

  const [view, setViewState] = useState<CalView>(lastView);
  const [anchor, setAnchorState] = useState<number>(() => lastAnchor ?? startOfDay(Date.now()));
  const [pickerMonth, setPickerMonth] = useState<number>(() => startOfMonth(anchor));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [caret, setCaret] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [dropDay, setDropDay] = useState<number | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const plannerDrag = useRef<{ entry: CalendarEntry; day: number } | null>(null);
  /** The format to return to when a date is picked from a list view. */
  const lastPeriodic = useRef<CalView>(isPeriodView(view) ? view : "week");

  const me = useMemo(() => ({ name: user.name, email: user.email }), [user.name, user.email]);
  const weekStart: WeekStart = theme === "r5" ? 1 : 0;
  const planner = theme === "r5" && PLANNER_VIEWS.includes(view);
  const periodic = isPeriodView(view);

  const setView = (v: CalView) => {
    lastView = v;
    setViewState(v);
    setChecked(new Set());
  };
  const setAnchor = (ms: number) => {
    const day = startOfDay(ms);
    lastAnchor = day;
    setAnchorState(day);
    setPickerMonth(startOfMonth(day));
  };

  // The red line follows the clock.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  // Take the keyboard when the window comes to the front (list views focus their own view).
  useEffect(() => {
    if (!active || !periodic) return;
    const ae = document.activeElement as HTMLElement | null;
    if (!ae || ae === document.body || !ae.closest?.(".notes-window")) surfaceRef.current?.focus({ preventScroll: true });
  }, [active, periodic, view]);

  // --- what is shown --------------------------------------------------------
  const masters = useMemo(() => (applied ? calendar.filter((e) => matchesQuery(e, applied)) : calendar), [calendar, applied]);

  const days = useMemo(() => periodDays(view, anchor, weekStart), [view, anchor, weekStart]);
  const weeks = useMemo(() => {
    if (view === "month") return monthWeeks(anchor, weekStart);
    if (view === "twoweeks") return [days.slice(0, 7), days.slice(7)];
    return [];
  }, [view, anchor, weekStart, days]);
  const range = useMemo((): [number, number] => {
    const all = weeks.length ? weeks.flat() : days;
    return all.length ? [all[0], addDays(all[all.length - 1], 1)] : [anchor, anchor];
  }, [weeks, days, anchor]);
  const occurrences = useMemo(() => occurrencesBetween(masters, range[0], range[1]), [masters, range]);

  const pickerDays = useMemo(() => monthWeeks(pickerMonth, weekStart).flat(), [pickerMonth, weekStart]);
  const busyDays = useMemo(() => {
    const set = new Set<number>();
    if (!pickerDays.length) return set;
    const occ = occurrencesBetween(masters, pickerDays[0], addDays(pickerDays[pickerDays.length - 1], 1));
    for (const d of pickerDays) if (occ.some((e) => entriesForDay([e], d).length)) set.add(d);
    return set;
  }, [masters, pickerDays]);
  const shownDays = useMemo(() => new Set(periodic ? days : [anchor]), [periodic, days, anchor]);

  const selected = useMemo(
    () => (selectedId ? calendar.find((e) => e.id === masterIdOf(selectedId)) ?? null : null),
    [calendar, selectedId],
  );
  const selectedOcc = useMemo(
    () => (selectedId ? occurrences.find((e) => e.id === selectedId) ?? selected : null),
    [occurrences, selectedId, selected],
  );

  /** What Delete and the other actions apply to. */
  const selection = (): string[] => {
    if (!periodic && checked.size) return [...checked];
    return selectedId ? [selectedId] : [];
  };

  // --- navigation -------------------------------------------------------------
  const step = (dir: 1 | -1) => setAnchor(stepAnchor(view, anchor, dir));
  const goToday = () => {
    setAnchor(Date.now());
    setStatus(`Today is ${fmtDate(Date.now())}.`);
  };
  const showDay = (day: number) => {
    setView("day");
    setAnchor(day);
  };
  const goTo = async () => {
    const d = await goToDialog(anchor);
    if (d === null) return;
    if (!periodic) setView(lastPeriodic.current);
    setAnchor(d);
  };
  if (periodic) lastPeriodic.current = view;

  const pickDay = (day: number) => {
    if (!periodic) setView(lastPeriodic.current);
    setAnchor(day);
  };

  // --- entries ---------------------------------------------------------------
  /** New from the action bar: the next hour today, or 9 AM on the day being shown. */
  const newAt = (type: CalEntryType) => {
    if (!periodic || startOfDay(anchor) === startOfDay(Date.now())) return newEntry(type);
    const allDay = type === "event" || type === "anniversary";
    newEntry(type, { start: allDay ? anchor : atMinutes(anchor, DEFAULT_HOUR * 60) });
  };

  const canMove = (e: CalendarEntry) => !isInvited(masterOf(e.id) ?? e, me);
  const isTentative = (e: CalendarEntry) => e.type === "meeting" && e.myResponse === "tentative";

  const deleteSelection = async () => {
    const ids = selection();
    if (!ids.length) {
      setStatus("No document is selected.");
      return;
    }
    if (await deleteEntries(ids)) {
      setSelectedId(null);
      setChecked(new Set());
    }
  };

  const refresh = () => {
    setNow(Date.now());
    setStatus("View refreshed.");
  };

  useTabCommands("calendar", {
    refresh,
    deleteSelected: () => void deleteSelection(),
    properties: selected ? () => entryProperties(selected) : undefined,
    copyAsLink: selected ? () => copyEntryLink(selected) : undefined,
    newDocument: () => newAt("appointment"),
    searchBar: () => setSearchOpen((o) => !o),
  });

  // --- menus -----------------------------------------------------------------
  const entryContext = (ev: MouseEvent, e: CalendarEntry) => {
    const ids = !periodic && checked.has(e.id) ? [...checked] : [e.id];
    openContextMenu(ev, entryMenu(e, ids));
  };

  const slotContext = (ev: MouseEvent, day: number, minutes: number | null) => {
    const start = minutes === null ? atMinutes(day, DEFAULT_HOUR * 60) : atMinutes(day, minutes);
    const items: MenuItem[] = [
      { label: `New &Appointment${minutes === null ? "" : " at " + fmtTime(start)}`, run: () => newEntry("appointment", { start }) },
      { label: "&Schedule a Meeting", run: () => newEntry("meeting", { start }) },
      { label: "New &Reminder", run: () => newEntry("reminder", { start }) },
      { label: "New &Event", run: () => newEntry("event", { start: day }) },
      { label: "New A&nniversary", run: () => newEntry("anniversary", { start: day }) },
      { sep: true },
      { label: "Show This &Day", disabled: view === "day", run: () => showDay(day) },
      { label: "Go To &Today", run: goToday },
    ];
    openContextMenu(ev, items);
  };

  // --- keyboard (the global handler covers Delete, F9 and Alt+Enter) -------
  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.defaultPrevented || (ev.target as HTMLElement).closest("input, textarea, select")) return;
    const sorted = [...occurrences].filter((e) => days.some((d) => entriesForDay([e], d).length)).sort((a, b) => a.start - b.start);
    const i = sorted.findIndex((e) => e.id === selectedId);
    const handled = () => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    switch (ev.key) {
      case "Enter":
        if (selectedOcc) {
          handled();
          openEntry(selectedOcc);
        }
        break;
      case "ArrowDown":
      case "ArrowUp": {
        if (!sorted.length) return;
        handled();
        const next = ev.key === "ArrowDown" ? (i < 0 ? 0 : Math.min(sorted.length - 1, i + 1)) : i <= 0 ? 0 : i - 1;
        setSelectedId(sorted[next].id);
        break;
      }
      case "ArrowLeft":
      case "ArrowRight":
        handled();
        setAnchor(addDays(anchor, ev.key === "ArrowRight" ? 1 : -1));
        break;
      case "PageDown":
      case "PageUp":
        handled();
        step(ev.key === "PageDown" ? 1 : -1);
        break;
      case "Home":
        handled();
        goToday();
        break;
    }
  };

  // --- actions ----------------------------------------------------------------
  const ids = selection();
  const target = selectedOcc ?? selected;
  const actions: ActionItem[] = [
    {
      id: "new",
      label: "New",
      icon: "cal-new",
      children: NEW_TYPES.map((t) => ({ id: "new-" + t, label: TYPE_LABEL[t], icon: TYPE_ICON[t], run: () => newAt(t) })),
    },
    { id: "schedule", label: "Schedule a Meeting", icon: "meeting", run: () => newAt("meeting") },
    "sep",
    { id: "today", label: "Today", icon: "cal-today", run: goToday },
    { id: "goto", label: "Go To...", icon: "calendar", run: () => void goTo() },
    { id: "prev", label: "Previous", icon: "back", disabled: !periodic, run: () => step(-1) },
    { id: "next", label: "Next", icon: "forward", disabled: !periodic, run: () => step(1) },
    "sep",
    { id: "delete", label: "Delete", icon: "trash", disabled: !ids.length, run: () => void deleteSelection(), accel: "Del" },
    {
      id: "copyinto",
      label: "Copy Into New",
      icon: "copy-into",
      disabled: !target,
      children: [
        { id: "ci-memo", label: "Memo", run: () => target && copyIntoMemo(target) },
        { id: "ci-todo", label: "To Do", run: () => target && copyIntoTodo(target) },
      ],
    },
  ];

  // --- the surface ---------------------------------------------------------------
  const gridProps: GridProps = {
    occurrences,
    selectedId,
    now,
    onSelect: (e) => setSelectedId(e.id),
    onOpen: openEntry,
    onNew: (type, start) => newEntry(type, { start }),
    onEntryMenu: entryContext,
    onSlotMenu: slotContext,
    onMove: (e, start, end) => void rescheduleEntry(e, start, end),
    canMove,
    onShowDay: showDay,
    isTentative,
  };

  const plannerDrop = (ev: DragEvent, day: number) => {
    const d = plannerDrag.current;
    if (!d) return;
    ev.preventDefault();
    plannerDrag.current = null;
    setDropDay(null);
    const shift = Math.round((day - d.day) / 86400000);
    if (shift) void rescheduleEntry(d.entry, addDays(d.entry.start, shift), addDays(d.entry.end, shift));
  };

  useEffect(() => {
    const clear = () => {
      plannerDrag.current = null;
      setDropDay(null);
    };
    window.addEventListener("dragend", clear);
    return () => window.removeEventListener("dragend", clear);
  }, []);

  let surface;
  if (view === "all" || view === "meetings") {
    surface = (
      <EntryList
        kind={view}
        masters={view === "meetings" ? masters.filter((e) => e.type === "meeting") : masters}
        caret={caret}
        checked={checked}
        onCaret={(key, e) => {
          setCaret(key);
          setSelectedId(e ? e.id : null);
        }}
        onChecked={setChecked}
        onDelete={(list) => void deleteEntries(list).then((ok) => ok && setChecked(new Set()))}
        onRefresh={refresh}
        onContext={(ev, e) =>
          e
            ? entryContext(ev, e)
            : openContextMenu(ev, [
                ...NEW_TYPES.map((t) => ({ label: `New ${TYPE_LABEL[t]}`, run: () => newAt(t) })),
              ])
        }
        me={me}
      />
    );
  } else if (planner) {
    surface = (
      <Planner
        key={view}
        days={days}
        entriesOn={(d) => entriesForDay(occurrences, d)}
        selectedId={selectedId}
        onSelect={(e) => setSelectedId(e.id)}
        onOpen={openEntry}
        onNewAt={(d, hour) => newEntry("appointment", { start: atMinutes(d, hour * 60) })}
        typeColor={(t) => TYPE_COLOR[t]}
        onGoToMonth={(year, month) => setAnchor(new Date(year, month, 1).getTime())}
        anchor={anchor}
        onEntryContextMenu={entryContext}
        onDayContextMenu={(ev, d) => slotContext(ev, d, null)}
        canDrag={canMove}
        onEntryDragStart={(ev, e, d) => {
          startEntryDrag(ev, e);
          plannerDrag.current = { entry: e, day: d };
        }}
        onDayDragOver={(ev, d) => {
          if (!plannerDrag.current) return;
          ev.preventDefault();
          ev.dataTransfer.dropEffect = "move";
          if (dropDay !== d) setDropDay(d);
        }}
        onDayDrop={plannerDrop}
        dropDay={dropDay}
      />
    );
  } else if (view === "month" || view === "twoweeks") {
    surface = (
      <DayGrid
        key={view}
        {...gridProps}
        weeks={weeks}
        month={view === "month" ? new Date(anchor).getMonth() : null}
        weekStart={weekStart}
      />
    );
  } else {
    surface = <TimeGrid key={view} {...gridProps} days={days} />;
  }

  const title = periodTitle(view, anchor, weekStart);
  const count = periodic ? occurrences.filter((e) => days.some((d) => entriesForDay([e], d).length)).length : 0;

  return (
    <div className={"app cal-app" + (theme === "r5" ? " cal-r5" : " cal-n8")}>
      <ActionBar actions={actions} />
      <div className="app-cols">
        <div className="nav-pane cal-nav">
          <div className="nav-title">
            <span>Calendar</span>
            <span className="nav-sub-label">
              {user.name} on {isOnline(user.location) ? MAIL_SERVER : "Local"}
            </span>
          </div>
          <DatePicker
            month={pickerMonth}
            onMonth={setPickerMonth}
            shown={shownDays}
            busy={busyDays}
            onPick={pickDay}
            weekStart={weekStart}
          />
          <div className="nav-group" role="listbox" aria-label="Calendar formats">
            {FORMATS.map((f) => (
              <div
                key={f.id}
                role="option"
                aria-selected={view === f.id}
                className={"nav-item" + (view === f.id ? " active" : "")}
                onClick={() => setView(f.id)}
              >
                <span className="nav-ic">
                  <Icon name={f.icon} />
                </span>
                <span className="nav-label">{f.label}</span>
              </div>
            ))}
          </div>
          <div className="cal-nav-sep" />
          <div className="nav-group" role="listbox" aria-label="Calendar views">
            {LISTS.map((f) => (
              <div
                key={f.id}
                role="option"
                aria-selected={view === f.id}
                className={"nav-item" + (view === f.id ? " active" : "")}
                onClick={() => setView(f.id)}
              >
                <span className="nav-ic">
                  <Icon name={f.icon} />
                </span>
                <span className="nav-label">{f.label}</span>
              </div>
            ))}
          </div>
          <div className="cal-legend" aria-label="Entry colors">
            {NEW_TYPES.map((t) => (
              <div key={t} className="cal-legend-row">
                <span className={"cal-swatch cal-t-" + t} />
                <span>{TYPE_LABEL[t]}</span>
              </div>
            ))}
          </div>
        </div>

        <Splitter />

        <div className="cal-main">
          {searchOpen && (
            <div className="search-bar">
              <label>Search for:</label>
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setApplied(query.trim());
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    e.preventDefault();
                    setSearchOpen(false);
                  }
                }}
              />
              <button className="btn" onClick={() => setApplied(query.trim())}>
                Search
              </button>
              <button
                className="btn"
                onClick={() => {
                  setQuery("");
                  setApplied("");
                }}
              >
                Clear
              </button>
              {applied && (
                <span className="search-result">
                  {masters.length} entr{masters.length === 1 ? "y" : "ies"} found
                </span>
              )}
            </div>
          )}
          {periodic && (
            <div className="cal-head">
              <button type="button" className="cal-head-arrow" title="Previous (Page Up)" onClick={() => step(-1)}>
                ◄
              </button>
              <button type="button" className="cal-head-arrow" title="Next (Page Down)" onClick={() => step(1)}>
                ►
              </button>
              <span className="cal-head-title">{title}</span>
              {view !== "month" && <span className="cal-head-sub">{weekLabel(days)}</span>}
              <span className="cal-head-count">
                {count} entr{count === 1 ? "y" : "ies"}
              </span>
            </div>
          )}
          <div
            ref={surfaceRef}
            className={"cal-surface cal-v-" + view + (planner ? " cal-planner-host" : "")}
            tabIndex={periodic ? 0 : -1}
            onKeyDown={periodic ? onKeyDown : undefined}
          >
            {surface}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// All Entries and Meetings (Notes views of the calendar documents)
// ===========================================================================

function EntryList({
  kind,
  masters,
  caret,
  checked,
  onCaret,
  onChecked,
  onDelete,
  onRefresh,
  onContext,
  me,
}: {
  kind: "all" | "meetings";
  masters: CalendarEntry[];
  caret: string | null;
  checked: Set<string>;
  onCaret: (key: string | null, e: CalendarEntry | null) => void;
  onChecked: (next: Set<string>) => void;
  onDelete: (ids: string[]) => void;
  onRefresh: () => void;
  onContext: (ev: MouseEvent, e: CalendarEntry | null) => void;
  me: { name: string; email: string };
}) {
  const viewKey = kind === "all" ? "calendar-all" : "calendar-meetings";
  const sortPref = useUI((s) => s.viewPrefs[viewKey]?.sort);

  const columns = useMemo((): ViewColumn<CalendarEntry>[] => {
    const date: ViewColumn<CalendarEntry> = {
      id: "date",
      title: "Date",
      width: 92,
      sortable: true,
      sortValue: (e) => e.start,
      text: (e) => fmtDate(e.start),
      render: (e) => fmtDate(e.start),
    };
    const time: ViewColumn<CalendarEntry> = {
      id: "time",
      title: "Time",
      width: 150,
      render: (e) => <span className="cal-list-time">{timeRangeText(e)}</span>,
    };
    const subject: ViewColumn<CalendarEntry> = {
      id: "subject",
      title: "Subject",
      flex: true,
      minWidth: 200,
      sortable: true,
      sortValue: (e) => e.subject.toLowerCase(),
      text: (e) => e.subject,
      render: (e) => (
        <span className="cal-list-subj">
          {e.recurrence && <Icon name="recurrence" title="Repeats" />}
          {e.alarm && <Icon name="alarm" title="Alarm" />}
          {e.conflictOf ? "[Replication or Save Conflict]" : e.subject || "(Untitled)"}
        </span>
      ),
    };
    if (kind === "all") {
      return [
        date,
        time,
        {
          id: "type",
          title: "Type",
          headerIcon: "calendar",
          icon: true,
          sortable: true,
          sortValue: (e) => TYPE_LABEL[e.type],
          render: (e) => <Icon name={TYPE_ICON[e.type]} title={TYPE_LABEL[e.type]} />,
        },
        subject,
        {
          id: "location",
          title: "Location",
          width: 170,
          sortable: true,
          sortValue: (e) => e.location.toLowerCase(),
          render: (e) => e.location,
        },
      ];
    }
    const statusIcon = (e: CalendarEntry): IconName =>
      isInvited(e, me)
        ? e.myResponse === "tentative"
          ? "tentative"
          : "accept"
        : !e.inviteeStatus
          ? "invitation"
          : e.inviteeStatus.some((s) => s.status === "counter")
            ? "propose"
            : e.inviteeStatus.some((s) => s.status === "declined")
              ? "decline"
              : "accept";
    return [
      date,
      time,
      subject,
      {
        id: "chair",
        title: "Chair",
        width: 130,
        sortable: true,
        sortValue: (e) => (e.chair?.name ?? me.name).toLowerCase(),
        render: (e) => e.chair?.name ?? me.name,
      },
      {
        id: "role",
        title: "Role",
        width: 64,
        sortable: true,
        sortValue: (e) => roleText(e, me),
        render: (e) => roleText(e, me),
      },
      {
        id: "status",
        title: "Status",
        width: 230,
        render: (e) => (
          <span className="cal-list-status">
            <Icon name={statusIcon(e)} />
            {meetingStatusText(e, me)}
          </span>
        ),
      },
    ];
  }, [kind, me]);

  const sortCol = sortPref?.col ?? "date";
  const sortDir = sortPref?.dir ?? 1;
  const categorized = sortCol === "date";

  return (
    <div className="list-pane cal-list">
      <NotesView
        viewKey={viewKey}
        docs={masters}
        getId={(e) => e.id}
        columns={columns}
        defaultSort={{ col: "date", dir: 1 }}
        categorize={categorized ? (e) => monthCategory(e.start) : undefined}
        categoryOrder={categorized ? (a, b) => compareMonthCategory(a, b) * sortDir : undefined}
        parentOf={(e) => e.conflictOf}
        rowClass={(e) => "cal-row-" + e.type}
        caret={caret}
        onCaret={onCaret}
        checked={checked}
        onChecked={onChecked}
        onOpen={openEntry}
        onDelete={onDelete}
        onRefresh={onRefresh}
        onContextMenu={onContext}
        onDragStart={(ev, e) => {
          ev.dataTransfer.setData("text/plain", e.subject);
          ev.dataTransfer.setData(DRAG_DOC, JSON.stringify({ coll: "calendar", id: e.id, title: e.subject }));
          ev.dataTransfer.effectAllowed = "copyMove";
        }}
        emptyText={kind === "all" ? "There are no calendar entries." : "There are no meetings on your calendar."}
        autoFocus
      />
    </div>
  );
}
