// ============================================================================
// Calendar — the Notes calendaring database. A navigator of view modes (Day,
// Work Week, Week, Month, All Entries) drives a central calendar surface, and
// a shared modal hosts the appointment/meeting/reminder form. Like Mail, this
// module reads/writes the shared store and composes the shared UI primitives
// and layout classes. All date math is local (format.ts helpers + Date).
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useNotes, uid } from "../../data/store";
import { useUI } from "../../data/ui";
import type {
  CalEntryType,
  CalendarEntry,
  Person,
  RecurFreq,
  Recurrence,
} from "../../data/types";
import {
  ActionBar,
  ActionButton,
  ActionSep,
  ActionSpacer,
  Dialog,
  FieldRow,
} from "../../components/ui";
import {
  fmtTime,
  fmtDate,
  fmtDateLong,
  toLocalInput,
  fromLocalInput,
  toDateInput,
  startOfDay,
  MONTHS,
  DAYS_ABBR,
} from "../../lib/format";
import "../../styles/calendar.css";

// --- view modes -------------------------------------------------------------
type Mode = "day" | "workweek" | "week" | "month" | "all";

const MODES: { key: Mode; label: string; icon: string }[] = [
  { key: "day", label: "Day", icon: "📄" },
  { key: "workweek", label: "Work Week", icon: "🗂️" },
  { key: "week", label: "Week", icon: "📆" },
  { key: "month", label: "Month", icon: "📅" },
  { key: "all", label: "All Entries", icon: "🗄️" },
];

// --- entry types & their colors --------------------------------------------
const TYPES: { key: CalEntryType; label: string; color: string }[] = [
  { key: "appointment", label: "Appointment", color: "#2f6fb5" },
  { key: "meeting", label: "Meeting", color: "#9a3bbf" },
  { key: "reminder", label: "Reminder", color: "#b5651d" },
  { key: "event", label: "Event", color: "#2e8b57" },
  { key: "anniversary", label: "Anniversary", color: "#c01457" },
];

function typeColor(t: CalEntryType): string {
  return TYPES.find((x) => x.key === t)?.color ?? "#2f6fb5";
}
function typeLabel(t: CalEntryType): string {
  return TYPES.find((x) => x.key === t)?.label ?? t;
}

// The week/day grid spans these hours (inclusive both ends).
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 19;
const HOURS: number[] = [];
for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) HOURS.push(h);
const SLOT_PX = 40; // pixel height of one hour row

// --- local date helpers (built on format.ts + Date) ------------------------
function addDays(ms: number, n: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  return d.getTime();
}
function startOfWeek(ms: number, mondayFirst: boolean): number {
  const d = new Date(startOfDay(ms));
  const dow = d.getDay(); // 0 = Sun
  const back = mondayFirst ? (dow + 6) % 7 : dow;
  d.setDate(d.getDate() - back);
  return d.getTime();
}
function startOfMonth(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
function addMonths(ms: number, n: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
}
function hourLabel(h: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${hh} ${ampm}`;
}
function atHour(dayMs: number, hour: number): number {
  const d = new Date(startOfDay(dayMs));
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

// --- recurrence expansion --------------------------------------------------
const SNAP_MIN = 15;
const SNAP_MS = SNAP_MIN * 60000;
const MIN_DURATION_MS = SNAP_MS;
const MAX_OCCURRENCES = 366;

/** Advance an epoch ms by one step of the given frequency (calendar-aware). */
function advance(ms: number, freq: RecurFreq, n: number): number {
  const d = new Date(ms);
  if (freq === "daily") d.setDate(d.getDate() + n);
  else if (freq === "weekly") d.setDate(d.getDate() + n * 7);
  else d.setMonth(d.getMonth() + n); // monthly
  return d.getTime();
}

/** Synthetic occurrence id: `${masterId}__${occStartMs}`. */
function occurrenceId(masterId: string, occStart: number): string {
  return `${masterId}__${occStart}`;
}
/** Resolve a (possibly synthetic) id back to the master entry id. */
function masterIdOf(id: string): string {
  const i = id.indexOf("__");
  return i === -1 ? id : id.slice(0, i);
}
/** An occurrence is "selected" when its master matches the selected id. */
function isSelected(entryId: string, selectedId: string | null): boolean {
  return selectedId != null && masterIdOf(entryId) === masterIdOf(selectedId);
}

/**
 * Expand a master entry into its concrete occurrences (the master itself plus
 * any recurring repeats up to `until`). Non-recurring entries return just
 * themselves. Each occurrence carries the master's fields with shifted
 * start/end and a synthetic id so the original master is still reachable.
 */
function expandEntry(master: CalendarEntry): CalendarEntry[] {
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
        : {
            ...master,
            id: occurrenceId(master.id, occStart),
            start: occStart,
            end: occStart + duration,
          },
    );
  }
  return out;
}

/** Snap an epoch ms timestamp to the nearest SNAP_MIN boundary. */
function snap(ms: number): number {
  return Math.round(ms / SNAP_MS) * SNAP_MS;
}

// --- invitee parsing (Person[]) --------------------------------------------
function parsePeople(raw: string): Person[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      if (token.includes("@")) {
        const name = token
          .split("@")[0]
          .replace(/[._]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        return { name, email: token };
      }
      const email = token.toLowerCase().replace(/\s+/g, ".") + "@acme.example.com";
      return { name: token, email };
    });
}
const peopleStr = (ppl: Person[]) => ppl.map((p) => p.name || p.email).join(", ");

// --- editable form draft ----------------------------------------------------
type RepeatChoice = "none" | RecurFreq;

interface Draft {
  id: string | null; // existing MASTER entry being edited, else null
  type: CalEntryType;
  subject: string;
  location: string;
  start: number;
  end: number;
  allDay: boolean;
  description: string;
  invitees: string;
  category: string;
  alarm: boolean;
  alarmMinutes: number;
  repeat: RepeatChoice;
  until: number; // series end (used when repeat !== "none")
}

function blankDraft(start: number): Draft {
  return {
    id: null,
    type: "appointment",
    subject: "",
    location: "",
    start,
    end: start + 60 * 60000,
    allDay: false,
    description: "",
    invitees: "",
    category: "",
    alarm: false,
    alarmMinutes: 15,
    repeat: "none",
    until: addDays(start, 30),
  };
}

export default function Calendar() {
  const { calendar, addCalendarEntry, updateCalendarEntry, deleteCalendarEntry } = useNotes();
  const setStatus = useUI((s) => s.setStatus);

  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState<number>(Date.now()); // a ms within the current period
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  // The selection tracks a MASTER id; an occurrence resolves back to its master.
  const selected =
    calendar.find((e) => e.id === (selectedId ? masterIdOf(selectedId) : null)) ?? null;

  // Masters matching the search box (applied everywhere). Filtering on the
  // master is enough: occurrences inherit the master's searchable fields.
  const masters = useMemo(() => {
    if (!search.trim()) return calendar;
    const q = search.toLowerCase();
    return calendar.filter(
      (e) =>
        e.subject.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q),
    );
  }, [calendar, search]);

  // Every concrete occurrence (recurring masters expanded), used by the grid /
  // month / all-entries views.
  const visible = useMemo(() => masters.flatMap(expandEntry), [masters]);

  function entriesOn(dayMs: number): CalendarEntry[] {
    const dayStart = startOfDay(dayMs);
    const dayEnd = dayStart + 86400000;
    return visible
      .filter((e) => {
        // An entry shows on any day its [start, end] span overlaps (covers
        // multi-day events as well as single-day ones).
        const s = Math.min(e.start, e.end);
        const en = Math.max(e.start, e.end);
        return s < dayEnd && en >= dayStart;
      })
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
  }

  // --- period navigation --------------------------------------------------
  function step(dir: number) {
    if (mode === "month") setAnchor(addMonths(anchor, dir));
    else if (mode === "week" || mode === "workweek") setAnchor(addDays(anchor, dir * 7));
    else setAnchor(addDays(anchor, dir)); // day & all
  }
  function goToday() {
    setAnchor(Date.now());
    setStatus("Calendar moved to today.");
  }

  const periodLabel = useMemo(() => {
    if (mode === "month") {
      const d = new Date(anchor);
      return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    }
    if (mode === "day") return fmtDateLong(anchor);
    if (mode === "all") return "All Entries";
    const mondayFirst = mode === "workweek";
    const ws = startOfWeek(anchor, mondayFirst);
    const days = mode === "workweek" ? 5 : 7;
    const we = addDays(ws, days - 1);
    return `${fmtDate(ws)} – ${fmtDate(we)}`;
  }, [mode, anchor]);

  // --- open / create / edit ----------------------------------------------
  // Opening any occurrence opens the MASTER entry for editing.
  function openEntry(occurrence: CalendarEntry) {
    const master =
      calendar.find((e) => e.id === masterIdOf(occurrence.id)) ?? occurrence;
    setSelectedId(master.id);
    setDraft({
      id: master.id,
      type: master.type,
      subject: master.subject,
      location: master.location,
      start: master.start,
      end: master.end,
      allDay: master.allDay,
      description: master.description,
      invitees: peopleStr(master.invitees),
      category: master.category,
      alarm: master.alarm,
      alarmMinutes: master.alarmMinutes ?? 15,
      repeat: master.recurrence?.freq ?? "none",
      until: master.recurrence?.until ?? addDays(master.start, 30),
    });
  }
  function newEntry(start?: number) {
    const base = start ?? atHour(anchor, 9);
    setDraft(blankDraft(base));
  }
  function newEntryOnDay(dayMs: number) {
    newEntry(atHour(dayMs, 9));
  }

  function saveDraft() {
    if (!draft) return;
    if (Number.isNaN(draft.start) || Number.isNaN(draft.end)) {
      setStatus("Please provide a valid start and end date/time.");
      return;
    }
    if (draft.end < draft.start) {
      setStatus("End time must be on or after the start time.");
      return;
    }
    const recurrence: Recurrence | undefined =
      draft.repeat === "none"
        ? undefined
        : { freq: draft.repeat, until: Math.max(draft.until, draft.start) };
    const entry: CalendarEntry = {
      id: draft.id ?? uid(),
      type: draft.type,
      subject: draft.subject.trim() || "(Untitled)",
      location: draft.location.trim(),
      start: draft.start,
      end: draft.end,
      allDay: draft.allDay,
      description: draft.description,
      invitees: parsePeople(draft.invitees),
      category: draft.category.trim(),
      alarm: draft.alarm,
      alarmMinutes: draft.alarm ? draft.alarmMinutes : undefined,
      recurrence,
    };
    if (draft.id) {
      // Editing the master updates the whole series. Replace wholesale so a
      // removed recurrence/alarm is actually cleared.
      updateCalendarEntry(draft.id, entry);
      setStatus(`Updated "${entry.subject}".`);
    } else {
      addCalendarEntry(entry);
      setStatus(`Saved "${entry.subject}" to the calendar.`);
    }
    setSelectedId(entry.id);
    setDraft(null);
  }

  // Deleting any occurrence deletes the whole series (the master).
  function delEntry(id?: string) {
    const raw = id ?? selectedId;
    if (!raw) return;
    const target = masterIdOf(raw);
    const e = calendar.find((x) => x.id === target);
    deleteCalendarEntry(target);
    setStatus(e ? `Deleted "${e.subject}".` : "Entry deleted.");
    if (selectedId && masterIdOf(selectedId) === target) setSelectedId(null);
    if (draft && draft.id === target) setDraft(null);
  }

  // --- drag to move / resize (occurrence-aware) ---------------------------
  // Moving an occurrence shifts the MASTER by the same delta (the whole series
  // moves), keeping behaviour simple and predictable.
  function moveEntry(occurrence: CalendarEntry, newStart: number) {
    const masterId = masterIdOf(occurrence.id);
    const master = calendar.find((e) => e.id === masterId);
    if (!master) return;
    const delta = snap(newStart) - occurrence.start;
    if (delta === 0) return;
    updateCalendarEntry(masterId, {
      start: master.start + delta,
      end: master.end + delta,
    });
    if (master.recurrence) setStatus(`Moved the whole "${master.subject}" series.`);
    else setStatus(`Moved "${master.subject}".`);
  }

  // Resizing an occurrence changes only the end time of the MASTER (preserving
  // the series cadence). Enforces a 15-minute minimum duration.
  function resizeEntry(occurrence: CalendarEntry, newEnd: number) {
    const masterId = masterIdOf(occurrence.id);
    const master = calendar.find((e) => e.id === masterId);
    if (!master) return;
    const occEnd = Math.max(snap(newEnd), occurrence.start + MIN_DURATION_MS);
    const delta = occEnd - occurrence.end;
    if (delta === 0) return;
    updateCalendarEntry(masterId, { end: master.end + delta });
    setStatus(`Resized "${master.subject}".`);
  }

  // --- alarms + browser notifications -------------------------------------
  // Track which occurrence alarms have already been scheduled so changes to the
  // calendar never schedule the same alert twice.
  const scheduledAlarms = useRef<Set<string>>(new Set());

  useEffect(() => {
    const hasNotif = typeof Notification !== "undefined";
    if (hasNotif && Notification.permission === "default") {
      // Request permission once, the first time we have something to schedule.
      const anyAlarmed = calendar.some((e) => e.alarm);
      if (anyAlarmed) void Notification.requestPermission();
    }

    const now = Date.now();
    const horizon = now + 24 * 3600000; // next 24 hours
    const timers: ReturnType<typeof setTimeout>[] = [];
    const seen = scheduledAlarms.current;

    // Expand every alarmed master into occurrences and schedule those whose
    // alarm time falls in the future but within the next 24 hours.
    for (const master of calendar) {
      if (!master.alarm) continue;
      const minutes = master.alarmMinutes ?? 15;
      for (const occ of expandEntry(master)) {
        const fireAt = occ.start - minutes * 60000;
        if (fireAt <= now || fireAt > horizon) continue;
        const key = `${occ.id}@${fireAt}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const subject = occ.subject;
        const body = `${occ.allDay ? "All day" : fmtTime(occ.start)}${
          occ.location ? " — " + occ.location : ""
        }`;
        const timer = setTimeout(() => {
          if (hasNotif && Notification.permission === "granted") {
            try {
              new Notification(subject, { body });
            } catch {
              /* some environments block construction; fall through to status */
            }
          }
          setStatus(`⏰ ${subject} — ${body}`);
        }, fireAt - now);
        timers.push(timer);
      }
    }

    return () => {
      for (const t of timers) clearTimeout(t);
      // Allow these occurrences to be rescheduled after cleanup (e.g. on the
      // next calendar change) without double-firing within a single schedule.
      scheduledAlarms.current = new Set();
    };
  }, [calendar, setStatus]);

  // --- render -------------------------------------------------------------
  return (
    <div className="app calendar-app">
      <ActionBar>
        <ActionButton icon="🆕" label="New Entry" onClick={() => newEntry()} />
        <ActionSep />
        <ActionButton icon="📍" label="Today" onClick={goToday} />
        <ActionButton icon="◀" label="Prev" onClick={() => step(-1)} title="Previous period" />
        <ActionButton icon="▶" label="Next" onClick={() => step(1)} title="Next period" />
        <ActionSep />
        <div className="cal-period">{periodLabel}</div>
        <ActionSep />
        <ActionButton icon="🗑️" label="Delete" onClick={() => delEntry()} disabled={!selected} />
        <ActionSpacer />
        <div className="action-search">
          <input
            type="search"
            placeholder="Search Calendar…"
            className="bevel-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </ActionBar>

      <div className="app-cols">
        {/* Navigator */}
        <div className="nav-pane">
          <div className="nav-title">Calendar</div>
          <div className="nav-group">
            {MODES.map((m) => (
              <div
                key={m.key}
                className={"nav-item" + (mode === m.key ? " active" : "")}
                onClick={() => {
                  setMode(m.key);
                  setStatus(`Showing ${m.label}.`);
                }}
              >
                <span className="nav-ic">{m.icon}</span>
                <span className="nav-label">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="nav-title">Legend</div>
          <div className="cal-legend">
            {TYPES.map((t) => (
              <div key={t.key} className="cal-legend-row">
                <span className="cal-swatch" style={{ background: t.color }} />
                <span className="cal-legend-label">{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Calendar surface */}
        <div className="cal-surface">
          {mode === "month" && (
            <MonthView
              anchor={anchor}
              selectedId={selectedId}
              entriesOn={entriesOn}
              onOpen={openEntry}
              onNewDay={newEntryOnDay}
            />
          )}
          {(mode === "week" || mode === "workweek") && (
            <TimeGrid
              days={
                mode === "workweek"
                  ? Array.from({ length: 5 }, (_, i) => addDays(startOfWeek(anchor, true), i))
                  : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor, false), i))
              }
              selectedId={selectedId}
              entriesOn={entriesOn}
              onOpen={openEntry}
              onNewAt={(dayMs, hour) => newEntry(atHour(dayMs, hour))}
              onMove={moveEntry}
              onResize={resizeEntry}
            />
          )}
          {mode === "day" && (
            <TimeGrid
              days={[anchor]}
              wide
              selectedId={selectedId}
              entriesOn={entriesOn}
              onOpen={openEntry}
              onNewAt={(dayMs, hour) => newEntry(atHour(dayMs, hour))}
              onMove={moveEntry}
              onResize={resizeEntry}
            />
          )}
          {mode === "all" && (
            <AllEntriesView
              entries={visible}
              selectedId={selectedId}
              onSelect={(occ) => setSelectedId(masterIdOf(occ))}
              onOpen={openEntry}
            />
          )}
        </div>
      </div>

      {draft && (
        <EntryForm
          draft={draft}
          setDraft={setDraft}
          onSave={saveDraft}
          onDelete={draft.id ? () => delEntry(draft.id!) : undefined}
          onCancel={() => setDraft(null)}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Month view
// ===========================================================================
function MonthView({
  anchor,
  selectedId,
  entriesOn,
  onOpen,
  onNewDay,
}: {
  anchor: number;
  selectedId: string | null;
  entriesOn: (dayMs: number) => CalendarEntry[];
  onOpen: (e: CalendarEntry) => void;
  onNewDay: (dayMs: number) => void;
}) {
  const monthStart = startOfMonth(anchor);
  const month = new Date(monthStart).getMonth();
  const gridStart = startOfWeek(monthStart, false); // Sunday on/before the 1st
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const todayStart = startOfDay(Date.now());

  return (
    <div className="cal-month">
      <div className="cal-month-head">
        {DAYS_ABBR.map((d) => (
          <div key={d} className="cal-month-dow">
            {d}
          </div>
        ))}
      </div>
      <div className="cal-month-grid">
        {cells.map((dayMs) => {
          const d = new Date(dayMs);
          const outside = d.getMonth() !== month;
          const isToday = startOfDay(dayMs) === todayStart;
          const list = entriesOn(dayMs);
          return (
            <div
              key={dayMs}
              className={"cal-cell" + (outside ? " outside" : "") + (isToday ? " today" : "")}
              onDoubleClick={(e) => {
                if (e.target === e.currentTarget) onNewDay(dayMs);
              }}
            >
              <div className="cal-cell-num">{d.getDate()}</div>
              <div className="cal-cell-list">
                {list.map((entry) => (
                  <div
                    key={entry.id}
                    className={
                      "cal-chip" + (isSelected(entry.id, selectedId) ? " selected" : "")
                    }
                    style={{ background: typeColor(entry.type) }}
                    title={`${entry.allDay ? "All day" : fmtTime(entry.start)} — ${entry.subject}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpen(entry);
                    }}
                  >
                    {!entry.allDay && <span className="cal-chip-time">{fmtTime(entry.start)}</span>}
                    {entry.recurrence && <span className="cal-recur">↻</span>}
                    <span className="cal-chip-sub">{entry.subject}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// Day / Week / Work Week time grid
// ===========================================================================
// While a block is being dragged we keep the live preview here (no store writes
// happen until the mouse is released).
interface DragState {
  entry: CalendarEntry;
  kind: "move" | "resize";
  movedPx: number; // total cursor travel, to tell a click from a drag
  // preview times (already snapped) committed on mouseup
  start: number;
  end: number;
}
const DRAG_THRESHOLD = 4; // px of travel before a press becomes a drag

function TimeGrid({
  days,
  wide,
  selectedId,
  entriesOn,
  onOpen,
  onNewAt,
  onMove,
  onResize,
}: {
  days: number[];
  wide?: boolean;
  selectedId: string | null;
  entriesOn: (dayMs: number) => CalendarEntry[];
  onOpen: (e: CalendarEntry) => void;
  onNewAt: (dayMs: number, hour: number) => void;
  onMove: (entry: CalendarEntry, newStart: number) => void;
  onResize: (entry: CalendarEntry, newEnd: number) => void;
}) {
  const gridHeight = HOURS.length * SLOT_PX;
  const todayStart = startOfDay(Date.now());
  const minPerPx = 60 / SLOT_PX;

  // DOM refs to each day column so we can map cursor X→day and cursor Y→time.
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Keep the latest drag in a ref so document listeners read fresh values.
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  /** Map a cursor position to {dayMs, time} using the column under the cursor. */
  function pointToTime(clientX: number, clientY: number): { dayMs: number; time: number } {
    // Find the column whose horizontal box contains the cursor; fall back to
    // the nearest end column so dragging past the edge still resolves a day.
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < days.length; i++) {
      const el = colRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX < r.right) {
        idx = i;
        best = 0;
        break;
      }
      const dist = clientX < r.left ? r.left - clientX : clientX - r.right;
      if (dist < best) {
        best = dist;
        idx = i;
      }
    }
    const dayMs = days[idx];
    const el = colRefs.current[idx];
    const top = el ? el.getBoundingClientRect().top : 0;
    const offsetY = Math.max(0, Math.min(clientY - top, gridHeight));
    const dayTop = atHour(dayMs, DAY_START_HOUR);
    const time = dayTop + offsetY * minPerPx * 60000;
    return { dayMs, time };
  }

  function beginDrag(entry: CalendarEntry, kind: "move" | "resize", e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const grabTime = pointToTime(startX, startY).time;
    // For a move, remember where inside the block the user grabbed so the block
    // doesn't jump its top edge to the cursor.
    const grabOffset = grabTime - entry.start;
    const duration = entry.end - entry.start;

    setDrag({ entry, kind, movedPx: 0, start: entry.start, end: entry.end });

    function onMouseMove(ev: MouseEvent) {
      const moved = Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY);
      const { time } = pointToTime(ev.clientX, ev.clientY);
      if (kind === "move") {
        const newStart = snap(time - grabOffset);
        setDrag({ entry, kind, movedPx: moved, start: newStart, end: newStart + duration });
      } else {
        const newEnd = Math.max(snap(time), entry.start + MIN_DURATION_MS);
        setDrag({ entry, kind, movedPx: moved, start: entry.start, end: newEnd });
      }
    }
    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      if (d.movedPx < DRAG_THRESHOLD) {
        onOpen(entry); // treat as a click
        return;
      }
      if (kind === "move") onMove(entry, d.start);
      else onResize(entry, d.end);
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div className={"cal-grid" + (wide ? " wide" : "")}>
      {/* day-column headers */}
      <div className="cal-grid-head">
        <div className="cal-gutter-head" />
        {days.map((dayMs) => {
          const d = new Date(dayMs);
          const isToday = startOfDay(dayMs) === todayStart;
          return (
            <div key={dayMs} className={"cal-day-head" + (isToday ? " today" : "")}>
              <span className="cal-day-dow">{DAYS_ABBR[d.getDay()]}</span>{" "}
              <span className="cal-day-num">{d.getDate()}</span>
            </div>
          );
        })}
      </div>

      {/* all-day / reminder row */}
      <div className="cal-allday">
        <div className="cal-gutter cal-allday-label">All Day</div>
        {days.map((dayMs) => {
          const allDay = entriesOn(dayMs).filter((e) => e.allDay || e.type === "reminder");
          return (
            <div
              key={dayMs}
              className="cal-allday-cell"
              onDoubleClick={(e) => {
                if (e.target === e.currentTarget) onNewAt(dayMs, 9);
              }}
            >
              {allDay.map((entry) => (
                <div
                  key={entry.id}
                  className={
                    "cal-chip" + (isSelected(entry.id, selectedId) ? " selected" : "")
                  }
                  style={{ background: typeColor(entry.type) }}
                  title={
                    entry.allDay ? entry.subject : `${fmtTime(entry.start)} ${entry.subject}`
                  }
                  onClick={() => onOpen(entry)}
                >
                  {!entry.allDay && <span className="cal-chip-time">{fmtTime(entry.start)}</span>}
                  {entry.recurrence && <span className="cal-recur">↻</span>}
                  <span className="cal-chip-sub">{entry.subject}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* scrolling hour body */}
      <div className="cal-grid-body">
        <div className="cal-grid-inner" style={{ height: gridHeight }}>
          {/* hour gutter */}
          <div className="cal-gutter cal-hours">
            {HOURS.map((h) => (
              <div key={h} className="cal-hour" style={{ height: SLOT_PX }}>
                {hourLabel(h)}
              </div>
            ))}
          </div>
          {/* day columns */}
          {days.map((dayMs, colIdx) => {
            const dayTop = atHour(dayMs, DAY_START_HOUR);
            const dayBottom = atHour(dayMs, DAY_END_HOUR + 1); // 8:00 PM
            // Entries to draw in this column: the ones that fall on this day,
            // minus a block being MOVED to another day, plus a block being
            // moved INTO this day (so the preview follows the cursor's column).
            const here = entriesOn(dayMs).filter((e) => !e.allDay && e.type !== "reminder");
            const draggedOff =
              drag && drag.kind === "move" && startOfDay(drag.start) !== startOfDay(dayMs)
                ? drag.entry.id
                : null;
            let toDraw = draggedOff ? here.filter((e) => e.id !== draggedOff) : here;
            if (
              drag &&
              drag.kind === "move" &&
              startOfDay(drag.start) === startOfDay(dayMs) &&
              !toDraw.some((e) => e.id === drag.entry.id)
            ) {
              toDraw = [...toDraw, drag.entry];
            }
            return (
              <div
                key={dayMs}
                ref={(el) => {
                  colRefs.current[colIdx] = el;
                }}
                className="cal-daycol"
                style={{ height: gridHeight }}
              >
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="cal-slot"
                    style={{ height: SLOT_PX }}
                    onClick={() => onNewAt(dayMs, h)}
                  />
                ))}
                {toDraw.map((entry) => {
                  // While dragging, render the live preview for the dragged entry.
                  const isDragging = drag != null && drag.entry.id === entry.id;
                  const previewStart = isDragging ? drag!.start : entry.start;
                  const previewEnd = isDragging ? drag!.end : entry.end;
                  // Clamp the entry's span into the visible window so entries that
                  // start before 7 AM or end after 7 PM never overflow the column.
                  const vs = Math.min(Math.max(previewStart, dayTop), dayBottom);
                  const ve = Math.min(Math.max(previewEnd, vs), dayBottom);
                  const top = (vs - dayTop) / 60000 / minPerPx;
                  const rawH = (ve - vs) / 60000 / minPerPx;
                  const height = Math.max(16, rawH || 16);
                  return (
                    <div
                      key={entry.id}
                      className={
                        "cal-block" +
                        (isSelected(entry.id, selectedId) ? " selected" : "") +
                        (isDragging ? " dragging" : "")
                      }
                      style={{
                        top,
                        height,
                        background: typeColor(entry.type),
                        borderColor: typeColor(entry.type),
                      }}
                      title={`${fmtTime(previewStart)}–${fmtTime(previewEnd)} ${entry.subject}`}
                      onMouseDown={(ev) => beginDrag(entry, "move", ev)}
                    >
                      <div className="cal-block-time">
                        {fmtTime(previewStart)}–{fmtTime(previewEnd)}
                        {entry.recurrence && <span className="cal-recur"> ↻</span>}
                      </div>
                      <div className="cal-block-sub">{entry.subject}</div>
                      {entry.location && <div className="cal-block-loc">{entry.location}</div>}
                      <div
                        className="cal-block-resize"
                        title="Drag to resize"
                        onMouseDown={(ev) => beginDrag(entry, "resize", ev)}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// All Entries list
// ===========================================================================
function AllEntriesView({
  entries,
  selectedId,
  onSelect,
  onOpen,
}: {
  entries: CalendarEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (e: CalendarEntry) => void;
}) {
  const sorted = useMemo(() => [...entries].sort((a, b) => a.start - b.start), [entries]);
  return (
    <div className="list-pane cal-all">
      <div className="view">
        <div className="view-head">
          <div className="col" style={{ flex: "0 0 100px" }}>
            Date
          </div>
          <div className="col" style={{ flex: "0 0 84px" }}>
            Time
          </div>
          <div className="col" style={{ flex: "0 0 110px" }}>
            Type
          </div>
          <div className="col" style={{ flex: 1 }}>
            Subject
          </div>
          <div className="col" style={{ flex: "0 0 160px" }}>
            Location
          </div>
        </div>
        <div className="view-body">
          {sorted.length === 0 && <div className="view-empty">No entries in this view.</div>}
          {sorted.map((e) => (
            <div
              key={e.id}
              className={"view-row" + (isSelected(e.id, selectedId) ? " selected" : "")}
              onClick={() => onSelect(e.id)}
              onDoubleClick={() => onOpen(e)}
            >
              <div className="col" style={{ flex: "0 0 100px" }}>
                {fmtDate(e.start)}
              </div>
              <div className="col" style={{ flex: "0 0 84px" }}>
                {e.allDay ? "All day" : fmtTime(e.start)}
              </div>
              <div className="col" style={{ flex: "0 0 110px" }}>
                <span className="cal-type-dot" style={{ background: typeColor(e.type) }} />
                {typeLabel(e.type)}
              </div>
              <div className="col" style={{ flex: 1 }}>
                {e.recurrence && (
                  <span className="cal-recur" title="Recurring series">
                    ↻{" "}
                  </span>
                )}
                {e.subject}
              </div>
              <div className="col" style={{ flex: "0 0 160px" }}>
                {e.location || "—"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Entry form (modal)
// ===========================================================================
function EntryForm({
  draft,
  setDraft,
  onSave,
  onDelete,
  onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const badRange = draft.end < draft.start;

  return (
    <Dialog
      title={draft.id ? "Edit Calendar Entry" : "New Calendar Entry"}
      onClose={onCancel}
      width={480}
      footer={
        <>
          <button className="btn primary" onClick={onSave}>
            💾 Save
          </button>
          {onDelete && (
            <button className="btn" onClick={onDelete}>
              🗑️ Delete
            </button>
          )}
          <button className="btn" onClick={onCancel}>
            ✕ Cancel
          </button>
        </>
      }
    >
      <div className="form cal-form">
        <FieldRow label="Type">
          <select
            value={draft.type}
            onChange={(e) => set({ type: e.target.value as CalEntryType })}
          >
            {TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Subject">
          <input
            type="text"
            value={draft.subject}
            autoFocus
            placeholder="What is this entry about?"
            onChange={(e) => set({ subject: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="Location">
          <input
            type="text"
            value={draft.location}
            onChange={(e) => set({ location: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="Starts">
          <input
            type="datetime-local"
            value={toLocalInput(draft.start)}
            onChange={(e) => {
              const v = fromLocalInput(e.target.value);
              if (!Number.isNaN(v)) set({ start: v });
            }}
          />
        </FieldRow>
        <FieldRow label="Ends">
          <input
            type="datetime-local"
            className={badRange ? "cal-bad" : undefined}
            value={toLocalInput(draft.end)}
            onChange={(e) => {
              const v = fromLocalInput(e.target.value);
              if (!Number.isNaN(v)) set({ end: v });
            }}
          />
        </FieldRow>
        {badRange && (
          <div className="field-row">
            <div className="field-label" />
            <div className="field-val prio-high">End must be on or after the start.</div>
          </div>
        )}
        <FieldRow label="Options">
          <label className="cal-check">
            <input
              type="checkbox"
              checked={draft.allDay}
              onChange={(e) => set({ allDay: e.target.checked })}
            />{" "}
            All day
          </label>
          <label className="cal-check">
            <input
              type="checkbox"
              checked={draft.alarm}
              onChange={(e) => set({ alarm: e.target.checked })}
            />{" "}
            Alarm
          </label>
          {draft.alarm && (
            <label className="cal-check">
              <input
                type="number"
                min={0}
                step={5}
                className="cal-alarm-min"
                value={draft.alarmMinutes}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  set({ alarmMinutes: Number.isNaN(v) ? 0 : Math.max(0, v) });
                }}
              />{" "}
              min before
            </label>
          )}
        </FieldRow>
        <FieldRow label="Repeats">
          <select
            value={draft.repeat}
            onChange={(e) => set({ repeat: e.target.value as RepeatChoice })}
          >
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </FieldRow>
        {draft.repeat !== "none" && (
          <FieldRow label="Until">
            <input
              type="date"
              value={toDateInput(draft.until)}
              onChange={(e) => {
                const v = fromLocalInput(e.target.value + "T23:59");
                if (!Number.isNaN(v)) set({ until: v });
              }}
            />
          </FieldRow>
        )}
        <FieldRow label="Category">
          <input
            type="text"
            value={draft.category}
            placeholder="e.g. Work, Personal"
            onChange={(e) => set({ category: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="Invitees">
          <input
            type="text"
            value={draft.invitees}
            placeholder="Comma-separated names or emails"
            onChange={(e) => set({ invitees: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="Description">
          <textarea
            rows={4}
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </FieldRow>
      </div>
    </Dialog>
  );
}
