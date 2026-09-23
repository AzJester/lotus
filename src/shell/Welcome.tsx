// ============================================================================
// The Welcome page, the Notes "home base": a masthead, launch icons for the
// applications, and live panels (Inbox, today's calendar, To Do) whose rows
// open the documents themselves. Classic R5 draws it as the R5 "Basics"
// page (teal, with big bookmark-style links); Notes 8 as the Home page.
// ============================================================================

import { Icon } from "../components/Icon";
import type { IconName } from "../components/Icon";
import { expandEntry } from "../data/calendarUtil";
import { unreadCount, useNotes } from "../data/store";
import { useUI } from "../data/ui";
import type { ViewId } from "../data/ui";
import { fmtDateLong, fmtListDate, fmtTime, sameDay } from "../lib/format";
import "../styles/welcome.css";

const TILES: { view: ViewId; icon: IconName; label: string }[] = [
  { view: "mail", icon: "db-mail", label: "Mail" },
  { view: "calendar", icon: "db-calendar", label: "Calendar" },
  { view: "contacts", icon: "db-addressbook", label: "Address Book" },
  { view: "todo", icon: "db-todo", label: "To Do" },
  { view: "journal", icon: "db-journal", label: "Personal Journal" },
  { view: "discussion", icon: "db-discussion", label: "Discussion" },
  { view: "replicator", icon: "db-replicator", label: "Replicator" },
  { view: "workspace", icon: "bm-workspace", label: "Workspace" },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Welcome() {
  const theme = useUI((s) => s.theme);
  const openView = useUI((s) => s.openView);
  const openDocument = useUI((s) => s.openDocument);
  const mail = useNotes((s) => s.mail);
  const calendar = useNotes((s) => s.calendar);
  const todos = useNotes((s) => s.todos);
  const user = useNotes((s) => s.user);
  const outbox = useNotes((s) => s.outbox.length);
  const now = Date.now();
  const unread = unreadCount(mail);

  const inbox = mail
    .filter((m) => m.folder === "inbox")
    .sort((a, b) => b.date - a.date)
    .slice(0, 7);

  const today = calendar
    .flatMap((e) => expandEntry(e).map((occ) => ({ occ, masterId: e.id })))
    .filter(({ occ }) => sameDay(occ.start, now) || (occ.allDay && occ.start <= now && occ.end >= now))
    .sort((a, b) => a.occ.start - b.occ.start);

  const dueSoon = todos
    .filter((t) => t.status !== "complete")
    .sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity))
    .slice(0, 6);

  const r5 = theme === "r5";

  return (
    <div className={"welcome" + (r5 ? " welcome-r5" : "")}>
      <div className="welcome-masthead">
        <div className="wm-logo">
          <span className="wm-squares" aria-hidden>
            <i style={{ background: "#e7b416" }} />
            <i style={{ background: "#d33f3f" }} />
            <i style={{ background: "#3f9d3f" }} />
            <i style={{ background: "#2f6fd0" }} />
          </span>
          <span className="wm-word">{r5 ? "Welcome to Lotus Notes" : "Lotus Notes"}</span>
        </div>
        <div className="wm-greet">
          {greeting()}, {user.name.split(" ")[0]}
        </div>
        <div className="wm-date">
          {fmtDateLong(now)}
          {unread > 0 && (
            <>
              {" · "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  openView("mail");
                }}
              >
                {unread} unread message{unread === 1 ? "" : "s"}
              </a>
            </>
          )}
          {outbox > 0 && ` · ${outbox} waiting in Outgoing Mail`}
        </div>
      </div>

      <div className="welcome-scroll">
        <div className="welcome-tiles">
          {TILES.map((t) => (
            <button key={t.view} className="launch-tile" onClick={() => openView(t.view)} title={`Open ${t.label}`}>
              <Icon name={t.icon} />
              <span className="lt-label">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="welcome-panels">
          <section className="panel">
            <header className="panel-head" onClick={() => openView("mail")}>
              <Icon name="inbox" />
              <span>Inbox</span>
              <span className="panel-link">Open Mail</span>
            </header>
            <div className="panel-body">
              {inbox.length === 0 && <div className="muted pad">No messages.</div>}
              {inbox.map((m) => (
                <div
                  key={m.id}
                  className={"panel-row" + (!m.read ? " unread" : "")}
                  onClick={() => openDocument({ coll: "mail", id: m.id }, { title: m.subject || "(No subject)" })}
                  title="Open this memo"
                >
                  <span className="pr-main">{m.from.name}</span>
                  <span className="pr-sub">{m.subject || "(No subject)"}</span>
                  <span className="pr-meta">{fmtListDate(m.date)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <header className="panel-head" onClick={() => openView("calendar")}>
              <Icon name="cal-today" />
              <span>Today's Calendar</span>
              <span className="panel-link">Open Calendar</span>
            </header>
            <div className="panel-body">
              {today.length === 0 && <div className="muted pad">Nothing scheduled today.</div>}
              {today.map(({ occ, masterId }) => (
                <div
                  key={occ.id}
                  className="panel-row"
                  onClick={() => openDocument({ coll: "calendar", id: masterId }, { title: occ.subject })}
                  title="Open this calendar entry"
                >
                  <span className="pr-time">{occ.allDay ? "All day" : fmtTime(occ.start)}</span>
                  <span className="pr-sub">{occ.subject}</span>
                  <span className="pr-meta">{occ.location}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <header className="panel-head" onClick={() => openView("todo")}>
              <Icon name="todo" />
              <span>To Do</span>
              <span className="panel-link">Open To Do</span>
            </header>
            <div className="panel-body">
              {dueSoon.length === 0 && <div className="muted pad">No open tasks.</div>}
              {dueSoon.map((t) => {
                const overdue = t.due != null && t.due < now;
                return (
                  <div
                    key={t.id}
                    className="panel-row"
                    onClick={() => openDocument({ coll: "todos", id: t.id }, { title: t.subject })}
                    title="Open this To Do"
                  >
                    <span className="pr-flag">{t.priority === "high" ? <Icon name="importance" /> : null}</span>
                    <span className="pr-sub">{t.subject}</span>
                    <span className={"pr-meta" + (overdue ? " prio-high" : "")}>{t.due ? fmtListDate(t.due) : ""}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="welcome-foot">A web recreation of the Lotus Notes client. Your documents are stored in this browser.</div>
      </div>
    </div>
  );
}
