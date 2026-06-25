// ============================================================================
// The Workspace — the signature Notes page of colorful "database" tiles laid
// out on a teal felt, organized into colored tabbed pages. Double-click a tile
// to open that application. The counts on each tile are live.
// ============================================================================

import { useState } from "react";
import { useNotes, unreadCount } from "../data/store";
import { useUI } from "../data/ui";
import type { ViewId } from "../data/ui";
import "../styles/workspace.css";

interface DbTile {
  view: ViewId;
  title: string;
  server: string;
  icon: string;
  color: string;
}

interface WsPage {
  name: string;
  color: string;
  tiles: DbTile[];
}

const PAGES: WsPage[] = [
  {
    name: "Mail & Calendar",
    color: "#c8a415",
    tiles: [
      { view: "mail", title: "Sam Rivera — Mail", server: "Mail/Acme", icon: "✉️", color: "#c8a415" },
      { view: "calendar", title: "Calendar", server: "Mail/Acme", icon: "📅", color: "#2e8b57" },
      { view: "todo", title: "To Do", server: "Mail/Acme", icon: "✅", color: "#b5651d" },
    ],
  },
  {
    name: "Applications",
    color: "#3a6ea5",
    tiles: [
      { view: "contacts", title: "Address Book", server: "Local", icon: "👤", color: "#7a3b8f" },
      { view: "journal", title: "Personal Notebook", server: "Local", icon: "📓", color: "#2f5fa5" },
      { view: "discussion", title: "Acme Team Discussion", server: "Apps/Acme", icon: "💬", color: "#a52f4f" },
    ],
  },
  {
    name: "Favorites",
    color: "#2e8b57",
    tiles: [
      { view: "welcome", title: "Welcome", server: "Local", icon: "🏠", color: "#3a6ea5" },
      { view: "mail", title: "Inbox", server: "Mail/Acme", icon: "📥", color: "#c8a415" },
      { view: "calendar", title: "This Week", server: "Mail/Acme", icon: "📆", color: "#2e8b57" },
    ],
  },
];

export default function Workspace() {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const openView = useUI((s) => s.openView);
  const { mail, calendar, contacts, todos, journal, discussion } = useNotes();
  const unread = unreadCount(mail);

  const counts: Record<ViewId, string> = {
    mail: `${mail.filter((m) => m.folder === "inbox").length} docs · ${unread} unread`,
    calendar: `${calendar.length} entries`,
    contacts: `${contacts.length} contacts`,
    todo: `${todos.filter((t) => t.status !== "complete").length} open`,
    journal: `${journal.length} notes`,
    discussion: `${discussion.length} documents`,
    welcome: "",
    workspace: "",
  };

  const current = PAGES[page];

  return (
    <div className="workspace">
      <div className="ws-tabs">
        {PAGES.map((pg, i) => (
          <button
            key={pg.name}
            className={"ws-tab" + (i === page ? " active" : "")}
            style={{ ["--tab-color" as string]: pg.color }}
            onClick={() => {
              setPage(i);
              setSelected(null);
            }}
          >
            {pg.name}
          </button>
        ))}
        <div className="ws-tabs-fill" />
      </div>

      <div
        className="ws-felt"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setSelected(null);
        }}
      >
        <div className="ws-grid">
          {current.tiles.map((t, i) => {
            const key = `${page}-${i}`;
            return (
              <div
                key={key}
                className={"db-tile" + (selected === key ? " selected" : "")}
                onMouseDown={() => setSelected(key)}
                onDoubleClick={() => openView(t.view)}
                title={`Double-click to open ${t.title}`}
              >
                <div className="db-icon" style={{ background: t.color }}>
                  <span className="db-glyph">{t.icon}</span>
                  {t.view === "mail" && unread > 0 && (
                    <span className="db-unread">{unread}</span>
                  )}
                </div>
                <div className="db-meta">
                  <div className="db-title">{t.title}</div>
                  <div className="db-server">{t.server}</div>
                  <div className="db-count">{counts[t.view]}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="ws-hint">
        Double-click a database to open it. Tip: every tile is a live application.
      </div>
    </div>
  );
}
