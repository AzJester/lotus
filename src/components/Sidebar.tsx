// ============================================================================
// The Notes 8 sidebar: collapsible panels for Sametime Contacts (your
// colleagues from the Domino Directory, with presence), Activities,
// Day-At-A-Glance (today's calendar, entries open on click), Feeds, Lotus
// Quickr and SideKick. The icon rail on the right collapses the panels or,
// when collapsed, opens the one you click.
// ============================================================================

import { useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { useNotes } from "../data/store";
import { useUI } from "../data/ui";
import { DIRECTORY_PEOPLE } from "../data/directory";
import { expandEntry } from "../data/calendarUtil";
import { fmtTime, initials, sameDay } from "../lib/format";
import { presenceOf } from "../lib/presence";
import "../styles/sidebar.css";

const FEEDS = [
  { src: "developerWorks", title: "Best practices for Domino replication" },
  { src: "Lotus Blog", title: "What's new in the 8.5 client sidebar" },
  { src: "Planet Lotus", title: "Composite applications: a primer" },
  { src: "IBM News", title: "Notes and Domino roadmap update" },
];

type PanelId = "contacts" | "activities" | "day" | "feeds" | "quickr" | "sidekick";

const PANELS: { id: PanelId; title: string; icon: IconName }[] = [
  { id: "contacts", title: "Sametime Contacts", icon: "chat" },
  { id: "activities", title: "Activities", icon: "activities" },
  { id: "day", title: "Day-At-A-Glance", icon: "day-glance" },
  { id: "feeds", title: "Feeds", icon: "feeds" },
  { id: "quickr", title: "Lotus Quickr", icon: "quickr" },
  { id: "sidekick", title: "SideKick", icon: "sidekick" },
];

function Panel({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: IconName;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={"sb-panel" + (open ? "" : " collapsed")}>
      <header className="sb-panel-head" onClick={onToggle}>
        <Icon name={open ? "twistie-down" : "twistie-right"} />
        <Icon name={icon} />
        <span className="sb-panel-title">{title}</span>
      </header>
      {open && <div className="sb-panel-body">{children}</div>}
    </section>
  );
}

export default function Sidebar() {
  const [open, setOpen] = useState(true);
  const [panels, setPanels] = useState<Record<PanelId, boolean>>({
    contacts: true,
    activities: false,
    day: true,
    feeds: false,
    quickr: false,
    sidekick: false,
  });
  const calendar = useNotes((s) => s.calendar);
  const me = useNotes((s) => s.user.name);
  const openDocument = useUI((s) => s.openDocument);
  const openChat = useUI((s) => s.openChat);
  const setStatus = useUI((s) => s.setStatus);

  const now = Date.now();
  const today = calendar
    .flatMap((e) => expandEntry(e).map((occ) => ({ occ, masterId: e.id })))
    .filter(({ occ }) => sameDay(occ.start, now))
    .sort((a, b) => a.occ.start - b.occ.start);

  const rank = { online: 0, away: 1, offline: 2 } as const;
  const buddies = DIRECTORY_PEOPLE.filter((p) => p.name !== me && !p.title.startsWith("Mail-in") && !p.email.startsWith("admin@"))
    .map((p) => ({ p, status: presenceOf(p.name) }))
    .sort((a, b) => rank[a.status] - rank[b.status] || a.p.name.localeCompare(b.p.name));
  const onlineCount = buddies.filter((b) => b.status !== "offline").length;

  const toggle = (id: PanelId) => setPanels((p) => ({ ...p, [id]: !p[id] }));

  const body: Record<PanelId, ReactNode> = {
    contacts: (
      <>
        <div className="sb-group">Work ({onlineCount}/{buddies.length})</div>
        {buddies.map(({ p, status }) => (
          <div
            key={p.name}
            className={"sb-buddy " + status}
            title={`${p.name}, ${p.title}. ${status === "offline" ? "Offline" : "Double-click to chat"}`}
            onDoubleClick={() => openChat(p.name)}
          >
            <span className={"sb-presence " + status} />
            <span className="sb-avatar">{initials(p.name)}</span>
            <span className="sb-text">{p.name}</span>
            {p.ooo && <span className="sb-note">Out of office</span>}
          </div>
        ))}
      </>
    ),
    activities: <div className="sb-empty">No activities. Create one to get started.</div>,
    day:
      today.length === 0 ? (
        <div className="sb-empty">No entries today.</div>
      ) : (
        today.map(({ occ, masterId }) => (
          <div
            key={occ.id}
            className="sb-row"
            title="Open this calendar entry"
            onClick={() => openDocument({ coll: "calendar", id: masterId }, { title: occ.subject })}
          >
            <span className="sb-time">{occ.allDay ? "All day" : fmtTime(occ.start)}</span>
            <span className="sb-text">{occ.subject}</span>
          </div>
        ))
      ),
    feeds: FEEDS.map((f) => (
      <div key={f.title} className="sb-feed" onClick={() => setStatus(`Feed: ${f.title}`)}>
        <Icon name="feeds" />
        <span className="sb-feed-body">
          <span className="sb-text">{f.title}</span>
          <span className="sb-feed-src">{f.src}</span>
        </span>
      </div>
    )),
    quickr: <div className="sb-empty">No Quickr places connected.</div>,
    sidekick: (
      <div className="sb-sidekick">
        <div className="sb-text" style={{ fontWeight: "bold" }}>
          Get Directions...
        </div>
        <div className="sb-text muted">Acme headquarters</div>
        <div className="sb-text muted">100 Main Street</div>
        <div className="sb-map" aria-hidden />
      </div>
    ),
  };

  return (
    <div className={"sidebar" + (open ? "" : " closed")}>
      {open && (
        <div className="sb-body">
          {PANELS.map((p) => (
            <Panel
              key={p.id}
              title={p.id === "contacts" ? `${p.title} (${onlineCount})` : p.title}
              icon={p.icon}
              open={panels[p.id]}
              onToggle={() => toggle(p.id)}
            >
              {body[p.id]}
            </Panel>
          ))}
        </div>
      )}
      <div className="sb-rail">
        <button className="sb-rail-btn toggle" title={open ? "Collapse the sidebar" : "Open the sidebar"} onClick={() => setOpen((o) => !o)}>
          {open ? "▶" : "◀"}
        </button>
        <div className="sb-rail-icons">
          {PANELS.map((p) => (
            <button
              key={p.id}
              className="sb-rail-btn"
              title={p.title}
              onClick={() => {
                setOpen(true);
                setPanels((s) => ({ ...s, [p.id]: true }));
              }}
            >
              <Icon name={p.icon} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
