// ============================================================================
// The Welcome page — the Notes "home base". A masthead, big launch tiles for
// each application, and live panels (inbox, today's calendar, to-do) so it is
// genuinely useful rather than decorative.
// ============================================================================

import { useNotes } from "../data/store";
import { useUI, VIEWS } from "../data/ui";
import type { ViewId } from "../data/ui";
import { fmtListDate, fmtTime, fmtDateLong, sameDay } from "../lib/format";
import "../styles/welcome.css";

const TILES: ViewId[] = ["mail", "calendar", "contacts", "todo", "journal", "discussion"];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Welcome() {
  const openView = useUI((s) => s.openView);
  const { mail, calendar, todos, user } = useNotes();
  const now = Date.now();

  const inbox = mail
    .filter((m) => m.folder === "inbox")
    .sort((a, b) => b.date - a.date)
    .slice(0, 6);

  const today = calendar
    .filter((e) => sameDay(e.start, now))
    .sort((a, b) => a.start - b.start);

  const dueSoon = todos
    .filter((t) => t.status !== "complete")
    .sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity))
    .slice(0, 6);

  return (
    <div className="welcome">
      <div className="welcome-masthead">
        <div className="wm-logo">
          <span className="wm-squares">
            <i style={{ background: "#e7b416" }} />
            <i style={{ background: "#d33f3f" }} />
            <i style={{ background: "#3f9d3f" }} />
            <i style={{ background: "#2f6fd0" }} />
          </span>
          <span className="wm-word">Lotus Notes</span>
        </div>
        <div className="wm-greet">
          {greeting()}, {user.name.split(" ")[0]}
        </div>
        <div className="wm-date">{fmtDateLong(now)}</div>
      </div>

      <div className="welcome-scroll">
        <div className="welcome-tiles">
          {TILES.map((v) => {
            const meta = VIEWS[v];
            return (
              <button key={v} className="launch-tile" onClick={() => openView(v)}>
                <span className="lt-icon" style={{ background: meta.color }}>
                  {meta.icon}
                </span>
                <span className="lt-label">{meta.title}</span>
              </button>
            );
          })}
        </div>

        <div className="welcome-panels">
          <section className="panel">
            <header className="panel-head" onClick={() => openView("mail")}>
              <span>✉️ Inbox</span>
              <span className="panel-link">Open Mail →</span>
            </header>
            <div className="panel-body">
              {inbox.length === 0 && <div className="muted pad">No messages.</div>}
              {inbox.map((m) => (
                <div
                  key={m.id}
                  className={"panel-row" + (!m.read ? " unread" : "")}
                  onClick={() => openView("mail")}
                >
                  <span className="pr-main">{m.from.name}</span>
                  <span className="pr-sub">{m.subject}</span>
                  <span className="pr-meta">{fmtListDate(m.date)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <header className="panel-head" onClick={() => openView("calendar")}>
              <span>📅 Today's Calendar</span>
              <span className="panel-link">Open Calendar →</span>
            </header>
            <div className="panel-body">
              {today.length === 0 && <div className="muted pad">Nothing scheduled today.</div>}
              {today.map((e) => (
                <div key={e.id} className="panel-row" onClick={() => openView("calendar")}>
                  <span className="pr-time">{e.allDay ? "All day" : fmtTime(e.start)}</span>
                  <span className="pr-sub">{e.subject}</span>
                  <span className="pr-meta">{e.location}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <header className="panel-head" onClick={() => openView("todo")}>
              <span>✅ To Do</span>
              <span className="panel-link">Open To Do →</span>
            </header>
            <div className="panel-body">
              {dueSoon.length === 0 && <div className="muted pad">No open tasks.</div>}
              {dueSoon.map((t) => {
                const overdue = t.due != null && t.due < now;
                return (
                  <div key={t.id} className="panel-row" onClick={() => openView("todo")}>
                    <span className={"pr-flag prio-" + t.priority}>
                      {t.priority === "high" ? "❗" : "•"}
                    </span>
                    <span className="pr-sub">{t.subject}</span>
                    <span className={"pr-meta" + (overdue ? " prio-high" : "")}>
                      {t.due ? fmtListDate(t.due) : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="welcome-foot">
          Lotus Notes — web recreation. Your data is stored locally in this browser.
        </div>
      </div>
    </div>
  );
}
