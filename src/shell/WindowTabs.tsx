// ============================================================================
// The window tabs row: one tab per open view or document (Notes R5 onward),
// with the Notes 8 "Open" launcher at the left in that theme. Middle-click or
// the X closes a window (asking first if it has unsaved changes).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { openContextMenu } from "../components/menu";
import { PINNED_VIEWS, requestClose, useUI, VIEWS } from "../data/ui";
import type { OpenTab, ViewId } from "../data/ui";
import { useNotes } from "../data/store";
import { openDatabase } from "./nav";

const LAUNCH: ViewId[] = ["welcome", "workspace", "mail", "calendar", "contacts", "todo", "journal", "discussion", "replicator", "help"];

function OpenLauncher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const openView = useUI((s) => s.openView);
  const dbs = useNotes((s) => s.databases.filter((d) => d.userCreated));
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="open-launcher" ref={ref}>
      <button
        className={"open-btn" + (open ? " active" : "")}
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        <Icon name="workspace" /> Open <span className="open-caret">▾</span>
      </button>
      {open && (
        <div className="open-menu" onMouseDown={(e) => e.stopPropagation()}>
          {LAUNCH.map((v) => (
            <div
              key={v}
              className="open-row"
              onMouseDown={(e) => {
                e.preventDefault();
                openView(v);
                setOpen(false);
              }}
            >
              <Icon name={VIEWS[v].icon} />
              {VIEWS[v].title}
            </div>
          ))}
          {dbs.map((d) => (
            <div
              key={d.id}
              className="open-row"
              onMouseDown={(e) => {
                e.preventDefault();
                openDatabase(d.id);
                setOpen(false);
              }}
            >
              <Icon name="database" />
              {d.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function tabLabel(t: OpenTab): string {
  if (t.title) return t.title;
  if (t.db && t.db !== VIEWS[t.view].db) {
    const db = useNotes.getState().databases.find((d) => d.id === t.db);
    if (db) return db.title;
  }
  return VIEWS[t.view].title;
}

export default function WindowTabs() {
  const theme = useUI((s) => s.theme);
  const tabs = useUI((s) => s.tabs);
  const activeTab = useUI((s) => s.activeTab);
  const activate = useUI((s) => s.activate);
  useNotes((s) => s.databases); // relabel when a database is renamed

  return (
    <div className="tabs-row">
      {theme === "notes8" && <OpenLauncher />}
      <div className="window-tabs">
        {tabs.map((t) => {
          const meta = VIEWS[t.view];
          const closable = !!t.doc || !PINNED_VIEWS.includes(t.view);
          const label = tabLabel(t);
          return (
            <div
              key={t.id}
              className={"wtab" + (t.id === activeTab ? " active" : "") + (t.doc ? " doc" : "")}
              onMouseDown={(e) => {
                if (e.button === 1 && closable) {
                  e.preventDefault();
                  void requestClose(t.id);
                } else if (e.button === 0) activate(t.id);
              }}
              onContextMenu={(e) =>
                openContextMenu(e, [
                  { label: "&Close Window", disabled: !closable, run: () => void requestClose(t.id) },
                  {
                    label: "Close &Other Windows",
                    run: async () => {
                      for (const o of [...useUI.getState().tabs]) {
                        if (o.id === t.id || (!o.doc && PINNED_VIEWS.includes(o.view))) continue;
                        if (!(await requestClose(o.id))) break;
                      }
                    },
                  },
                ])
              }
              title={label}
            >
              {t.doc ? (
                <Icon name={t.isNew ? "edit" : "note"} />
              ) : (
                <span className="wtab-accent" style={{ background: meta.color }} />
              )}
              <span className="wtab-label">{label}</span>
              {closable && (
                <span
                  className="wtab-close"
                  title="Close (Esc)"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (e.button === 0) void requestClose(t.id);
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
  );
}
