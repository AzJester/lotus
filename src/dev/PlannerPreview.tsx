// ============================================================================
// Dev-only preview of the ring-bound planner (served by `npm run dev` at
// /dev/planner.html; not part of the production build). Feeds <Planner> a set
// of sample entries around the current week, wires its callbacks to a status
// line, and lets you flip formats, themes and periods.
//   /dev/planner.html?days=2 | 7 | 14    Two Days, One Week (default), Two Weeks
//   /dev/planner.html?theme=r5 | notes8  classic R5 (default) or Notes 8 colors
//   /dev/planner.html?tabs=0             hide the month tabs
//   /dev/planner.html?date=2026-09-23    anchor the period on a given day
//   /dev/planner.html?sel=c1             start with an entry selected
// ============================================================================

import { StrictMode, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import Planner from "../apps/calendar/Planner";
import { ActionBar } from "../components/ActionBar";
import type { CalEntryType, CalendarEntry } from "../data/types";
import { MONTHS, fmtDate, fmtDateLong, fmtTime, startOfDay } from "../lib/format";
import "../styles/tokens.css";
import "../styles/chrome.css";
import "../styles/views.css";

type Format = 2 | 7 | 14;
type Theme = "r5" | "notes8";

// Same palette as the Calendar module's legend.
const TYPE_COLORS: Record<CalEntryType, string> = {
  appointment: "#2f6fb5",
  meeting: "#9a3bbf",
  reminder: "#b5651d",
  event: "#2e8b57",
  anniversary: "#c01457",
};

// --- date helpers -----------------------------------------------------------
function addDays(ms: number, n: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}
function mondayOf(ms: number): number {
  const d = new Date(startOfDay(ms));
  return addDays(d.getTime(), -((d.getDay() + 6) % 7));
}
/** A local time `dayOffset` days after `base`, at hour:minute. */
function at(base: number, dayOffset: number, hour: number, minute = 0): number {
  const d = new Date(base);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, hour, minute).getTime();
}
function daysFor(format: Format, anchor: number): number[] {
  const first = format === 2 ? startOfDay(anchor) : mondayOf(anchor);
  return Array.from({ length: format }, (_, i) => addDays(first, i));
}
function parseDate(raw: string | null): number | null {
  const m = raw?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}

// --- sample entries (relative to this week's Monday) -------------------------
function entry(
  id: string,
  type: CalEntryType,
  subject: string,
  start: number,
  end: number,
  extra: Partial<CalendarEntry> = {},
): CalendarEntry {
  const blank = { location: "", allDay: false, description: "", invitees: [], category: "" };
  return { ...blank, alarm: false, id, type, subject, start, end, ...extra };
}

function sampleEntries(): CalendarEntry[] {
  const w = mondayOf(Date.now());
  const day = (offset: number) => at(w, offset, 0);
  const allDay = { allDay: true };
  return [
    // Monday
    entry("c1", "appointment", "Dentist", at(w, 0, 9), at(w, 0, 10), {
      location: "Downtown Dental",
    }),
    entry("c2", "meeting", "Staff meeting", at(w, 0, 10, 30), at(w, 0, 11, 30), {
      location: "Birch Conference Room",
      recurrence: { freq: "weekly", until: at(w, 42, 23, 59) },
    }),
    entry(
      "c3",
      "meeting",
      "Vendor demo: Domino 5.0 upgrade path and licensing review with the Iris team",
      at(w, 0, 14),
      at(w, 0, 15, 30),
      { location: "Maple Room" },
    ),
    entry("c4", "appointment", "Morning standup", at(w, 0, 8, 45), at(w, 0, 9), {
      recurrence: { freq: "daily", until: at(w, 4, 23, 59) },
    }),
    // Tuesday
    entry("c5", "event", "Quarter-end close", day(1), at(w, 1, 23, 59), allDay),
    entry("c6", "appointment", "Lunch with Priya", at(w, 1, 12), at(w, 1, 13), {
      location: "Cafe Rialto",
    }),
    // Wednesday: a busy day that overflows its section
    entry("c7", "meeting", "Q3 Planning Session", at(w, 2, 10), at(w, 2, 12), {
      location: "Birch Conference Room",
    }),
    entry("c8", "appointment", "Review ACL changes", at(w, 2, 12), at(w, 2, 12, 30)),
    entry("c9", "appointment", "Call Carl re: Acme renewal", at(w, 2, 13), at(w, 2, 13, 15)),
    entry("c10", "appointment", "1:1 with Diane", at(w, 2, 15), at(w, 2, 15, 30), {
      location: "Diane's office",
    }),
    entry("c11", "reminder", "Submit timesheet", at(w, 2, 16), at(w, 2, 16)),
    entry("c12", "reminder", "Replicate with the Iris server", at(w, 2, 17, 30), at(w, 2, 17, 30)),
    entry("c13", "appointment", "Team dinner", at(w, 2, 18, 30), at(w, 2, 21), {
      location: "Luigi's",
    }),
    // Thursday to Sunday: a three-day event and a meeting that runs overnight
    entry("c14", "event", "Company All-Hands", at(w, 3, 13), at(w, 3, 14, 30), {
      location: "Auditorium",
    }),
    entry("c15", "event", "Lotusphere", day(3), at(w, 5, 23, 59), {
      ...allDay,
      location: "Orlando",
    }),
    entry("c16", "meeting", "Offsite: sales kickoff", at(w, 3, 15), at(w, 4, 12), {
      location: "Riverton Lodge",
    }),
    entry("c17", "appointment", "Code review", at(w, 4, 11), at(w, 4, 12)),
    entry("c18", "reminder", "Submit expense report", at(w, 4, 16), at(w, 4, 16)),
    entry("c19", "anniversary", "Carl's work anniversary (5 yrs)", day(5), day(5), allDay),
    entry("c20", "appointment", "Kids' soccer", at(w, 5, 9), at(w, 5, 10, 30), {
      location: "Riverside Park",
    }),
    entry("c21", "appointment", "Brunch with the Nairs", at(w, 6, 11), at(w, 6, 12, 30)),
    // Next week
    entry("c22", "meeting", "Budget review", at(w, 7, 9, 30), at(w, 7, 11), {
      location: "Finance",
    }),
    entry("c23", "appointment", "Dentist follow-up", at(w, 8, 8), at(w, 8, 8, 30), {
      location: "Downtown Dental",
    }),
    entry("c24", "appointment", "Fly to Boston", at(w, 9, 7, 15), at(w, 9, 9, 40), {
      location: "Flight 1182",
    }),
    entry("c25", "meeting", "Customer visit: Riverton Steel", at(w, 10, 10), at(w, 10, 16), {
      location: "Boston",
    }),
    entry("c26", "reminder", "Pay day", at(w, 11, 9), at(w, 11, 9)),
    entry("c27", "anniversary", "Mom's birthday", day(13), day(13), allDay),
  ];
}

/** Expand a recurring master into its occurrences (ids `${master}__${start}`). */
function expand(master: CalendarEntry): CalendarEntry[] {
  const rec = master.recurrence;
  if (!rec) return [master];
  const out = [master];
  const duration = master.end - master.start;
  for (let i = 1; i < 400; i++) {
    const d = new Date(master.start);
    if (rec.freq === "daily") d.setDate(d.getDate() + i);
    else if (rec.freq === "weekly") d.setDate(d.getDate() + 7 * i);
    else d.setMonth(d.getMonth() + i);
    const start = d.getTime();
    if (start > rec.until) break;
    out.push({ ...master, id: `${master.id}__${start}`, start, end: start + duration });
  }
  return out;
}

const masterIdOf = (id: string) => id.split("__")[0];

/** Put the theme class on <html>, where the app's App shell keeps it too. */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("theme-notes8", "theme-r5");
  root.classList.add(`theme-${theme}`);
}

const PARAMS = new URLSearchParams(location.search);
const INITIAL_THEME: Theme = PARAMS.get("theme") === "notes8" ? "notes8" : "r5";
applyTheme(INITIAL_THEME); // before the first paint, so there is no flash

// --- preview ---------------------------------------------------------------
const FORMATS: { days: Format; label: string }[] = [
  { days: 2, label: "Two Days" },
  { days: 7, label: "One Week" },
  { days: 14, label: "Two Weeks" },
];
const HINT =
  "Click an entry to select it, double-click to open it, double-click empty space for a new entry.";

const periodStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "0 10px",
  fontWeight: "bold",
};
// Stands in for the Calendar module's .cal-surface (a white flex column).
const surfaceStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  background: "var(--white)",
};

function Preview() {
  const initialDays = Number(PARAMS.get("days"));
  const [format, setFormat] = useState<Format>(
    initialDays === 2 || initialDays === 14 ? initialDays : 7,
  );
  const [theme, setTheme] = useState<Theme>(INITIAL_THEME);
  const [anchor, setAnchor] = useState<number>(() => parseDate(PARAMS.get("date")) ?? Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(PARAMS.get("sel"));
  const [status, setStatus] = useState(HINT);
  const showTabs = PARAMS.get("tabs") !== "0";

  useEffect(() => applyTheme(theme), [theme]);

  // Keep the query string in step so a reload lands on the same view.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    q.set("days", String(format));
    q.set("theme", theme);
    history.replaceState(null, "", `${location.pathname}?${q.toString()}`);
  }, [format, theme]);

  const all = useMemo(() => sampleEntries().flatMap(expand), []);
  const days = useMemo(() => daysFor(format, anchor), [format, anchor]);

  const entriesOn = (dayMs: number) => {
    const dayStart = startOfDay(dayMs);
    const dayEnd = addDays(dayStart, 1);
    return all
      .filter((e) => Math.min(e.start, e.end) < dayEnd && Math.max(e.start, e.end) >= dayStart)
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
  };

  const period =
    days.length > 1 ? `${fmtDate(days[0])} - ${fmtDate(days[days.length - 1])}` : fmtDate(days[0]);

  return (
    <div className="app" style={{ height: "100%" }}>
      <ActionBar
        publish={false}
        actions={[
          ...FORMATS.map((f) => ({
            id: `f${f.days}`,
            label: f.label,
            checked: format === f.days,
            run: () => setFormat(f.days),
          })),
          "sep" as const,
          { id: "prev", label: "Prev", icon: "back" as const, run: () => setAnchor(addDays(anchor, -format)) },
          { id: "today", label: "Today", icon: "cal-today" as const, run: () => setAnchor(Date.now()) },
          { id: "next", label: "Next", icon: "forward" as const, run: () => setAnchor(addDays(anchor, format)) },
          "sep" as const,
          {
            id: "theme",
            label: theme === "r5" ? "Theme: Classic R5" : "Theme: Notes 8",
            run: () => setTheme(theme === "r5" ? "notes8" : "r5"),
          },
        ]}
        right={<div style={periodStyle}>{period}</div>}
      />
      <div style={surfaceStyle}>
        <Planner
          days={days}
          entriesOn={entriesOn}
          selectedId={selectedId}
          isSelected={(id, sel) => sel != null && masterIdOf(id) === masterIdOf(sel)}
          onSelect={(e) => {
            setSelectedId(masterIdOf(e.id));
            setStatus(`Selected "${e.subject}".`);
          }}
          onOpen={(e) =>
            setStatus(`Open "${e.subject}" (${e.allDay ? "all day" : fmtTime(e.start)}).`)
          }
          onNewAt={(dayMs, hour) => setStatus(`New entry on ${fmtDateLong(dayMs)} at ${hour}:00.`)}
          typeColor={(t) => TYPE_COLORS[t]}
          onGoToMonth={
            showTabs
              ? (year, month) => {
                  setAnchor(new Date(year, month, 1).getTime());
                  setStatus(`Jumped to ${MONTHS[month]} ${year}.`);
                }
              : undefined
          }
          anchor={anchor}
        />
      </div>
      <div className="statusbar">
        <div className="status-cell grow">{status}</div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
