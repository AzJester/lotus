// ============================================================================
// Lotus Notes — application shell
// The faux-OS window that hosts every module: title bar, menu bar, SmartIcons
// toolbar, the left bookmark bar, window tabs, the active view, and the status
// bar. Modules are selected by the active window tab.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useUI, VIEWS } from "./data/ui";
import type { ViewId } from "./data/ui";
import { unreadCount, useNotes } from "./data/store";
import MenuBar from "./components/MenuBar";
import Sidebar from "./components/Sidebar";

import Welcome from "./shell/Welcome";
import Workspace from "./shell/Workspace";
import Mail from "./apps/mail/Mail";
import Calendar from "./apps/calendar/Calendar";
import Contacts from "./apps/contacts/Contacts";
import Todo from "./apps/todo/Todo";
import Notebook from "./apps/journal/Notebook";
import Discussion from "./apps/discussion/Discussion";

const VIEW_COMPONENTS: Record<ViewId, () => JSX.Element> = {
  welcome: Welcome,
  workspace: Workspace,
  mail: Mail,
  calendar: Calendar,
  contacts: Contacts,
  todo: Todo,
  journal: Notebook,
  discussion: Discussion,
};

// Order of the bookmark buttons down the left rail.
const BOOKMARKS: ViewId[] = [
  "welcome",
  "workspace",
  "mail",
  "calendar",
  "contacts",
  "todo",
  "journal",
  "discussion",
];

function NotesLogo() {
  // The little skewed colored bars from the old Notes logo.
  const colors = ["#e7b416", "#d33f3f", "#3f9d3f", "#2f6fd0"];
  return (
    <span className="titlebar-logo" aria-hidden>
      {colors.map((c) => (
        <i key={c} style={{ background: c }} />
      ))}
    </span>
  );
}

// The green "Open" launcher from Notes 8 — a dropdown of every application.
function OpenLauncher({ onOpen }: { onOpen: (v: ViewId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const items: ViewId[] = [
    "welcome", "workspace", "mail", "calendar", "contacts", "todo", "journal", "discussion",
  ];
  return (
    <div className="open-launcher" ref={ref}>
      <button
        className={"open-btn" + (open ? " active" : "")}
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        <span className="open-ic">⊞</span> Open <span className="open-caret">▾</span>
      </button>
      {open && (
        <div className="open-menu" onMouseDown={(e) => e.stopPropagation()}>
          {items.map((v) => (
            <div
              key={v}
              className="open-row"
              onMouseDown={(e) => {
                e.preventDefault();
                onOpen(v);
                setOpen(false);
              }}
            >
              <span className="open-row-ic" style={{ color: VIEWS[v].color }}>
                {VIEWS[v].icon}
              </span>
              {VIEWS[v].title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { tabs, active, openView, closeTab, setActive, status } = useUI();
  const mail = useNotes((s) => s.mail);
  const user = useNotes((s) => s.user);
  const unread = unreadCount(mail);

  useEffect(() => {
    document.title = `${VIEWS[active].title} - IBM Lotus Notes`;
  }, [active]);

  const ActiveView = VIEW_COMPONENTS[active];

  return (
    <div className="notes-window">
      {/* Title bar */}
      <div className="titlebar">
        <NotesLogo />
        <span className="titlebar-title">{VIEWS[active].title} - IBM Lotus Notes</span>
        <span className="titlebar-spacer" />
        <div className="titlebar-btns">
          <span className="titlebar-btn">_</span>
          <span className="titlebar-btn">▢</span>
          <span className="titlebar-btn close">✕</span>
        </div>
      </div>

      <MenuBar />

      {/* SmartIcons toolbar */}
      <div className="toolbar">
        <button className="tool-btn" title="Open Mail" onClick={() => openView("mail")}>✉️</button>
        <button className="tool-btn" title="Open Calendar" onClick={() => openView("calendar")}>📅</button>
        <button className="tool-btn" title="Open Contacts" onClick={() => openView("contacts")}>👤</button>
        <button className="tool-btn" title="Open To Do" onClick={() => openView("todo")}>✅</button>
        <div className="tool-sep" />
        <button className="tool-btn" title="Workspace" onClick={() => openView("workspace")}>🗔</button>
        <button className="tool-btn" title="Notebook" onClick={() => openView("journal")}>📓</button>
        <button className="tool-btn" title="Discussion" onClick={() => openView("discussion")}>💬</button>
        <div className="tool-sep" />
        <button className="tool-btn" title="Print" onClick={() => window.print()}>🖨️</button>
        <div className="addr">
          <label>Address</label>
          <input
            type="text"
            readOnly
            value={`notes://acme/${active}.nsf`}
            className="bevel-field"
          />
        </div>
      </div>

      {/* Body: bookmark rail + workpane */}
      <div className="notes-body">
        <div className="bookmark-bar">
          {BOOKMARKS.map((v) => {
            const meta = VIEWS[v];
            return (
              <button
                key={v}
                className={"bm-btn" + (active === v ? " active" : "")}
                title={meta.bookmark}
                onClick={() => openView(v)}
              >
                <span className="glyph">{meta.icon}</span>
                {v === "mail" && unread > 0 && <span className="bm-badge">{unread}</span>}
              </button>
            );
          })}
          <div className="bm-sep" />
        </div>

        <div className="workpane">
          <div className="tabs-row">
            <OpenLauncher onOpen={openView} />
            <div className="window-tabs">
              {tabs.map((t) => {
              const meta = VIEWS[t.view];
              const isActive = t.view === active;
              return (
                <div
                  key={t.view}
                  className={"wtab" + (isActive ? " active" : "")}
                  onMouseDown={() => setActive(t.view)}
                  title={meta.title}
                >
                  <span className="wtab-accent" style={{ background: meta.color }} />
                  <span className="wtab-label">{meta.title}</span>
                  {t.view !== "welcome" && (
                    <span
                      className="wtab-close"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        closeTab(t.view);
                      }}
                    >
                      ✕
                    </span>
                  )}
                </div>
              );
              })}
            </div>
          </div>

          <div className="workview">
            <ActiveView />
          </div>
        </div>

        <Sidebar />
      </div>

      {/* Status bar */}
      <div className="statusbar">
        <div className="status-cell" style={{ width: 26, justifyContent: "center" }}>
          <span className="dot" />
        </div>
        <div className="status-cell grow">{status}</div>
        <div className="status-cell">{user.name}</div>
        <div className="status-cell" title="Inbox unread">
          ✉️ {unread} unread
        </div>
        <div className="status-cell">{user.location}</div>
        <div className="status-cell" style={{ width: 70, justifyContent: "center" }}>
          ▲ Online
        </div>
      </div>
    </div>
  );
}
