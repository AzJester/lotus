// ============================================================================
// Calendar — the Notes calendaring database. A navigator of view modes (Day,
// Work Week, Week, Month, All Entries) drives a central calendar surface, and
// a shared modal hosts the appointment/meeting/reminder form. Like Mail, this
// module reads/writes the shared store and composes the shared UI primitives
// and layout classes. All date math is local (format.ts helpers + Date).
// ============================================================================

import { useMemo, useState } from "react";
import { useNotes, uid } from "../../data/store";
import { useUI } from "../../data/ui";
import type { CalEntryType, CalendarEntry, Person } from "../../data/types";
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
  startOfDay,
  sameDay,
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
interface Draft {
  id: string | null; // existing entry being edited, else null
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

  const selected = calendar.find((e) => e.id === selectedId) ?? null;

  // Entries matching the search box (applied everywhere).
  const visible = useMemo(() => {
    if (!search.trim()) return calendar;
    const q = search.toLowerCase();
    return calendar.filter(
      (e) =>
        e.subject.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q),
    );
  }, [calendar, search]);

  function entriesOn(dayMs: number): CalendarEntry[] {
    return visible
      .filter((e) => sameDay(e.start, dayMs))
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
  function openEntry(e: CalendarEntry) {
    setSelectedId(e.id);
    setDraft({
      id: e.id,
      type: e.type,
      subject: e.subject,
      location: e.location,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      description: e.description,
      invitees: peopleStr(e.invitees),
      category: e.category,
      alarm: e.alarm,
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
    if (draft.end < draft.start) {
      setStatus("End time must be on or after the start time.");
      return;
    }
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
    };
    if (draft.id) {
      updateCalendarEntry(draft.id, entry);
      setStatus(`Updated "${entry.subject}".`);
    } else {
      addCalendarEntry(entry);
      setStatus(`Saved "${entry.subject}" to the calendar.`);
    }
    setSelectedId(entry.id);
    setDraft(null);
  }

  function delEntry(id?: string) {
    const target = id ?? selectedId;
    if (!target) return;
    const e = calendar.find((x) => x.id === target);
    deleteCalendarEntry(target);
    setStatus(e ? `Deleted "${e.subject}".` : "Entry deleted.");
    if (selectedId === target) setSelectedId(null);
    if (draft && draft.id === target) setDraft(null);
  }

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
            />
          )}
          {mode === "all" && (
            <AllEntriesView
              entries={visible}
              selectedId={selectedId}
              onSelect={setSelectedId}
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
                    className={"cal-chip" + (entry.id === selectedId ? " selected" : "")}
                    style={{ background: typeColor(entry.type) }}
                    title={`${entry.allDay ? "All day" : fmtTime(entry.start)} — ${entry.subject}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpen(entry);
                    }}
                  >
                    {!entry.allDay && <span className="cal-chip-time">{fmtTime(entry.start)}</span>}
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
function TimeGrid({
  days,
  wide,
  selectedId,
  entriesOn,
  onOpen,
  onNewAt,
}: {
  days: number[];
  wide?: boolean;
  selectedId: string | null;
  entriesOn: (dayMs: number) => CalendarEntry[];
  onOpen: (e: CalendarEntry) => void;
  onNewAt: (dayMs: number, hour: number) => void;
}) {
  const gridHeight = HOURS.length * SLOT_PX;
  const todayStart = startOfDay(Date.now());

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
                  className={"cal-chip" + (entry.id === selectedId ? " selected" : "")}
                  style={{ background: typeColor(entry.type) }}
                  title={entry.subject}
                  onClick={() => onOpen(entry)}
                >
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
          {days.map((dayMs) => {
            const timed = entriesOn(dayMs).filter((e) => !e.allDay && e.type !== "reminder");
            return (
              <div key={dayMs} className="cal-daycol" style={{ height: gridHeight }}>
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="cal-slot"
                    style={{ height: SLOT_PX }}
                    onClick={() => onNewAt(dayMs, h)}
                  />
                ))}
                {timed.map((entry) => {
                  const dayTop = atHour(dayMs, DAY_START_HOUR);
                  const minPerPx = 60 / SLOT_PX;
                  const top = Math.max(0, (entry.start - dayTop) / 60000 / minPerPx);
                  const rawH = (entry.end - entry.start) / 60000 / minPerPx;
                  const height = Math.max(16, rawH || 16);
                  return (
                    <div
                      key={entry.id}
                      className={"cal-block" + (entry.id === selectedId ? " selected" : "")}
                      style={{
                        top,
                        height,
                        background: typeColor(entry.type),
                        borderColor: typeColor(entry.type),
                      }}
                      title={`${fmtTime(entry.start)}–${fmtTime(entry.end)} ${entry.subject}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onOpen(entry);
                      }}
                    >
                      <div className="cal-block-time">
                        {fmtTime(entry.start)}–{fmtTime(entry.end)}
                      </div>
                      <div className="cal-block-sub">{entry.subject}</div>
                      {entry.location && <div className="cal-block-loc">{entry.location}</div>}
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
              className={"view-row" + (e.id === selectedId ? " selected" : "")}
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
            onChange={(e) => set({ start: fromLocalInput(e.target.value) })}
          />
        </FieldRow>
        <FieldRow label="Ends">
          <input
            type="datetime-local"
            className={badRange ? "cal-bad" : undefined}
            value={toLocalInput(draft.end)}
            onChange={(e) => set({ end: fromLocalInput(e.target.value) })}
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
        </FieldRow>
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
