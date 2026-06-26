// ============================================================================
// The Notes 8 right-hand sidebar: a collapsible rail of mini-applications.
// Day-At-A-Glance (today's calendar), Sametime Contacts (a buddy list), and
// Feeds. Reads the shared store so the panels are live. A thin icon rail on the
// far right toggles the panel area open and closed, as in the real client.
// ============================================================================

import { useState } from "react";
import { useNotes } from "../data/store";
import { useUI } from "../data/ui";
import { fmtTime, initials, sameDay } from "../lib/format";
import "../styles/sidebar.css";

// Deterministic pseudo-presence so the buddy list feels alive without state.
function presence(id: string): "online" | "away" | "offline" {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const r = h % 3;
  return r === 0 ? "online" : r === 1 ? "away" : "offline";
}

const FEEDS = [
  { src: "developerWorks", title: "Best practices for Domino replication" },
  { src: "Lotus Blog", title: "What's new in the 8.5 client sidebar" },
  { src: "Planet Lotus", title: "Composite applications: a primer" },
  { src: "IBM News", title: "Notes & Domino roadmap update" },
];

function Panel({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={"sb-panel" + (open ? "" : " collapsed")}>
      <header className="sb-panel-head" onClick={() => setOpen((o) => !o)}>
        <span className="sb-twist">{open ? "▼" : "▶"}</span>
        <span className="sb-panel-icon">{icon}</span>
        <span className="sb-panel-title">{title}</span>
      </header>
      {open && <div className="sb-panel-body">{children}</div>}
    </section>
  );
}

export default function Sidebar() {
  const [open, setOpen] = useState(true);
  const { calendar, contacts } = useNotes();
  const openView = useUI((s) => s.openView);
  const requestMemo = useUI((s) => s.requestMemo);
  const setStatus = useUI((s) => s.setStatus);

  const now = Date.now();
  const today = calendar
    .filter((e) => sameDay(e.start, now))
    .sort((a, b) => a.start - b.start);

  const buddies = contacts
    .map((c) => ({ c, status: presence(c.id) }))
    .sort((a, b) => {
      const rank = { online: 0, away: 1, offline: 2 } as const;
      return rank[a.status] - rank[b.status];
    });
  const onlineCount = buddies.filter((b) => b.status === "online").length;

  return (
    <div className={"sidebar" + (open ? "" : " closed")}>
      {open && (
        <div className="sb-body">
          <Panel title="Day-At-A-Glance" icon="📆">
            {today.length === 0 ? (
              <div className="sb-empty">No entries today.</div>
            ) : (
              today.map((e) => (
                <div key={e.id} className="sb-row" onClick={() => openView("calendar")}>
                  <span className="sb-time">{e.allDay ? "All day" : fmtTime(e.start)}</span>
                  <span className="sb-text">{e.subject}</span>
                </div>
              ))
            )}
          </Panel>

          <Panel title={`Sametime Contacts (${onlineCount})`} icon="💬">
            {buddies.map(({ c, status }) => (
              <div
                key={c.id}
                className="sb-buddy"
                title={`Chat with ${c.firstName} ${c.lastName}`}
                onClick={() => requestMemo(c.email || `${c.firstName} ${c.lastName}`)}
              >
                <span className={"sb-presence " + status} />
                <span className="sb-avatar">{initials(`${c.firstName} ${c.lastName}`)}</span>
                <span className="sb-text">
                  {c.firstName} {c.lastName}
                </span>
              </div>
            ))}
            {buddies.length === 0 && <div className="sb-empty">No contacts.</div>}
          </Panel>

          <Panel title="Feeds" icon="📡" defaultOpen={false}>
            {FEEDS.map((f) => (
              <div
                key={f.title}
                className="sb-feed"
                onClick={() => setStatus(`Feed: ${f.title}`)}
              >
                <span className="sb-feed-dot">📰</span>
                <span className="sb-feed-body">
                  <span className="sb-text">{f.title}</span>
                  <span className="sb-feed-src">{f.src}</span>
                </span>
              </div>
            ))}
          </Panel>
        </div>
      )}

      {/* Far-right icon rail — always visible; toggles the panel area. */}
      <div className="sb-rail">
        <button
          className="sb-rail-btn toggle"
          title={open ? "Collapse sidebar" : "Open sidebar"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "▶" : "◀"}
        </button>
        <div className="sb-rail-icons">
          <span className="sb-rail-btn" title="Day-At-A-Glance">📆</span>
          <span className="sb-rail-btn" title="Sametime Contacts">💬</span>
          <span className="sb-rail-btn" title="Feeds">📡</span>
          <span className="sb-rail-btn" title="SideKick">🗺️</span>
        </div>
      </div>
    </div>
  );
}
