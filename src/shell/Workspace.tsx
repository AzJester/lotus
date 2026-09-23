// ============================================================================
// The Workspace: database icons on tabbed, colored pages, the signature
// R3/R4 desktop that R5 kept behind a bookmark. Each icon shows the database
// title, its unread count and (optionally) the server; replicas stack into
// one icon with a small arrow to pick the replica. Double-click opens,
// right-click gives the database menu, icons drag to another page's tab,
// double-clicking a page tab renames and recolors it, and the Replicator
// page sits at the end.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import type { IconName } from "../components/Icon";
import { NotesDialog, notesAsk, notesAlert, openDialog } from "../components/dialogs";
import { openContextMenu } from "../components/menu";
import type { MenuItem } from "../components/menu";
import { useTabCommands } from "../components/tabs";
import { canReachServer, unreadCount, useNotes } from "../data/store";
import { useUI } from "../data/ui";
import type { WsPage } from "../data/ui";
import type { NotesDatabase } from "../data/types";
import { openDatabase } from "./nav";
import { runReplication } from "./replicate";
import { openDatabaseProperties } from "./dialogs/Properties";
import { openAccessInfo } from "./dialogs/About";
import { newDatabaseDialog, openDatabaseDialog } from "./dialogs/DatabaseDialogs";
import "../styles/workspace.css";

const TEMPLATE_ICON: Record<NotesDatabase["template"], IconName> = {
  mail: "db-mail",
  addressbook: "db-addressbook",
  journal: "db-journal",
  discussion: "db-discussion",
  help: "db-help",
  directory: "db-directory",
  outbox: "db-outbox",
};

/** The page tab colors of the classic Workspace. */
export const PAGE_COLORS = [
  "#c8a415",
  "#3a6ea5",
  "#2e8b57",
  "#a52f4f",
  "#7a3b8f",
  "#b5651d",
  "#1f7a7a",
  "#5a5a8a",
  "#8a8a2a",
  "#c05080",
];

const DRAG_ICON = "application/x-notes-ws-icon";

type PageEdit = { name: string; color: string };

function PageDialog({ page, close }: { page: WsPage; close: (v: PageEdit | null) => void }) {
  const [name, setName] = useState(page.name);
  const [color, setColor] = useState(page.color);
  const ok = () => close({ name: name.trim() || page.name, color });
  return (
    <NotesDialog
      title="Workspace Properties"
      onClose={() => close(null)}
      width={360}
      footer={
        <>
          <button className="btn primary" onClick={ok}>
            OK
          </button>
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
        </>
      }
    >
      <label className="prompt-label">
        Workspace page name:
        <input
          type="text"
          className="prompt-input"
          value={name}
          data-autofocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ok();
          }}
        />
      </label>
      <div className="ws-colors-label">Tab color:</div>
      <div className="ws-colors" role="radiogroup">
        {PAGE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === color}
            aria-label={c}
            className={"ws-swatch" + (c === color ? " active" : "")}
            style={{ background: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
    </NotesDialog>
  );
}

export async function editPage(page: WsPage) {
  const v = await openDialog<PageEdit | null>((close) => <PageDialog page={page} close={close} />);
  if (!v) return;
  const ui = useUI.getState();
  ui.setWorkspacePages(ui.workspacePages.map((p) => (p.id === page.id ? { ...p, ...v } : p)));
}

export default function Workspace() {
  const pages = useUI((s) => s.workspacePages);
  const setPages = useUI((s) => s.setWorkspacePages);
  const prefs = useUI((s) => s.uiPrefs);
  const setUiPrefs = useUI((s) => s.setUiPrefs);
  const setStatus = useUI((s) => s.setStatus);
  const openView = useUI((s) => s.openView);
  const theme = useUI((s) => s.theme);
  const dbs = useNotes((s) => s.databases);
  const mail = useNotes((s) => s.mail);
  const location = useNotes((s) => s.user.location);
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [sel, setSel] = useState<string | null>(null);
  const [dropTab, setDropTab] = useState<string | null>(null);
  const [dropIcon, setDropIcon] = useState<string | null>(null);
  /** Which replica each stacked icon opens. */
  const [replicaChoice, setReplicaChoice] = useState<Record<string, "local" | "server">>({});

  useEffect(() => {
    if (!pages.some((p) => p.id === pageId) && pages[0]) setPageId(pages[0].id);
  }, [pages, pageId]);

  const page = pages.find((p) => p.id === pageId) ?? pages[0];
  const hidden = useMemo(() => new Set(prefs.hiddenIcons ?? []), [prefs.hiddenIcons]);

  // Databases on no page (and not removed) show on the first page.
  const visible = useMemo(() => {
    if (!page) return [];
    const placed = new Set(pages.flatMap((p) => p.icons));
    const strays = page.id === pages[0]?.id ? dbs.filter((d) => !placed.has(d.id) && !hidden.has(d.id)).map((d) => d.id) : [];
    return [...page.icons, ...strays].map((id) => dbs.find((d) => d.id === id)).filter((d): d is NotesDatabase => !!d);
  }, [page, pages, dbs, hidden]);

  const unreadFor = (db: NotesDatabase) => (db.template === "mail" ? unreadCount(mail) : 0);

  const moveToPage = (dbId: string, target: string) => {
    const next = useUI.getState().workspacePages.map((p) => {
      const without = p.icons.filter((i) => i !== dbId);
      return p.id === target ? { ...p, icons: [...without, dbId] } : { ...p, icons: without };
    });
    setPages(next);
    setStatus(`Icon moved to the ${next.find((p) => p.id === target)?.name ?? ""} page.`);
  };

  const removeIcon = async (db: NotesDatabase) => {
    if (!(await notesAsk(`Remove the icon for "${db.title}" from your Workspace? The database itself is not deleted.`))) return;
    setPages(useUI.getState().workspacePages.map((p) => ({ ...p, icons: p.icons.filter((i) => i !== db.id) })));
    setUiPrefs({ hiddenIcons: [...(useUI.getState().uiPrefs.hiddenIcons ?? []), db.id] });
    setSel(null);
    setStatus(`Icon for ${db.title} removed from the Workspace.`);
  };

  const open = async (db: NotesDatabase, replica?: "local" | "server") => {
    const choice = replica ?? replicaChoice[db.id] ?? "local";
    const onServer = db.server !== "Local" || (!!db.serverReplica && choice === "server");
    if (onServer && !canReachServer(location)) {
      await notesAlert(`Unable to find path to server ${db.serverReplica ?? db.server}.`, { icon: "error" });
      return;
    }
    openDatabase(db.id);
    if (db.serverReplica && choice === "server") setStatus(`Opened the replica of ${db.title} on ${db.serverReplica}.`);
  };

  const replicaMenu = (db: NotesDatabase): MenuItem[] => [
    { label: "Local", checked: replicaChoice[db.id] !== "server", run: () => setReplicaChoice((c) => ({ ...c, [db.id]: "local" })) },
    {
      label: db.serverReplica ?? "",
      checked: replicaChoice[db.id] === "server",
      run: () => setReplicaChoice((c) => ({ ...c, [db.id]: "server" })),
    },
  ];

  const iconMenu = (db: NotesDatabase): MenuItem[] => [
    { label: "&Open", run: () => void open(db) },
    ...(db.serverReplica
      ? [
          { label: "Open &Replica", children: replicaMenu(db) },
          { label: "Re&plicate", run: () => void runReplication({ dbs: [db.id], sendOutgoing: db.template === "mail" }) },
        ]
      : []),
    { sep: true },
    {
      label: "&Move to Page",
      disabled: pages.length < 2,
      children: pages.filter((p) => p.id !== page?.id).map((p) => ({ label: p.name, run: () => moveToPage(db.id, p.id) })),
    },
    { label: "Remove from &Workspace", accel: "Del", run: () => void removeIcon(db) },
    { sep: true },
    { label: "&Access Control...", run: () => void openAccessInfo(db) },
    { label: "Database P&roperties...", accel: "Alt+Enter", run: () => void openDatabaseProperties(db.id) },
  ];

  const addPage = () => {
    const all = useUI.getState().workspacePages;
    const p: WsPage = {
      id: "p-" + Math.random().toString(36).slice(2, 8),
      name: `Page ${all.length + 1}`,
      color: PAGE_COLORS[all.length % PAGE_COLORS.length],
      icons: [],
    };
    setPages([...all, p]);
    setPageId(p.id);
    void editPage(p);
  };

  const removePage = async (p: WsPage) => {
    if (p.icons.length) {
      await notesAlert("Move or remove the icons on this page before you remove the page.", { icon: "warning" });
      return;
    }
    if (!(await notesAsk(`Remove the Workspace page "${p.name}"?`))) return;
    setPages(useUI.getState().workspacePages.filter((x) => x.id !== p.id));
  };

  const arrange = () => {
    if (!page) return;
    const sorted = [...visible].sort((a, b) => a.title.localeCompare(b.title)).map((d) => d.id);
    setPages(useUI.getState().workspacePages.map((p) => (p.id === page.id ? { ...p, icons: sorted } : p)));
    setStatus("Icons arranged.");
  };

  const backgroundMenu = (): MenuItem[] => [
    { label: "&Open Database...", accel: "Ctrl+O", run: () => void openDatabaseDialog() },
    { label: "&New Database...", run: () => void newDatabaseDialog() },
    { sep: true },
    { label: "New &Page", run: addPage },
    ...(page ? [{ label: "Page P&roperties...", run: () => void editPage(page) }] : []),
    ...(page && pages.length > 1 ? [{ label: "Remove Pa&ge", run: () => void removePage(page) }] : []),
    { label: "Arrange &Icons", run: arrange },
    ...(prefs.hiddenIcons?.length ? [{ label: "Restore Removed Icons", run: () => setUiPrefs({ hiddenIcons: [] }) }] : []),
    { sep: true },
    { label: "Show &Unread", checked: prefs.showUnread, run: () => setUiPrefs({ showUnread: !prefs.showUnread }) },
    { label: "Show &Server Names", checked: prefs.showServerNames, run: () => setUiPrefs({ showServerNames: !prefs.showServerNames }) },
    { label: "Stac&k Replica Icons", checked: prefs.stackReplicas, run: () => setUiPrefs({ stackReplicas: !prefs.stackReplicas }) },
    { label: "&Textured Workspace", checked: prefs.texturedWorkspace, run: () => setUiPrefs({ texturedWorkspace: !prefs.texturedWorkspace }) },
  ];

  const selected = visible.find((d) => d.id === sel) ?? null;

  useTabCommands("workspace", {
    refresh: () => setStatus("Unread counts refreshed."),
    properties: selected ? () => void openDatabaseProperties(selected.id) : undefined,
    deleteSelected: selected ? () => void removeIcon(selected) : undefined,
  });

  // Unstacked replicas show one icon per replica.
  type Tile = { db: NotesDatabase; replica: "local" | "server" | null };
  const tiles: Tile[] = visible.flatMap((db): Tile[] =>
    db.serverReplica && !prefs.stackReplicas
      ? [
          { db, replica: "local" as const },
          { db, replica: "server" as const },
        ]
      : [{ db, replica: null }],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (!visible.length) return;
    const idx = Math.max(0, visible.findIndex((d) => d.id === sel));
    const grid = (e.currentTarget as HTMLElement).clientWidth;
    const cols = Math.max(1, Math.floor(grid / 132));
    let next = idx;
    if (e.key === "ArrowRight") next = Math.min(visible.length - 1, idx + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, idx - 1);
    else if (e.key === "ArrowDown") next = Math.min(visible.length - 1, idx + cols);
    else if (e.key === "ArrowUp") next = Math.max(0, idx - cols);
    else if (e.key === "Enter" && selected) {
      e.preventDefault();
      void open(selected);
      return;
    } else return;
    e.preventDefault();
    setSel(visible[next].id);
  };

  return (
    <div
      className={"workspace" + (prefs.texturedWorkspace ? " textured" : "") + (theme === "r5" ? " ws-r5" : "")}
      style={{ ["--page" as string]: page?.color ?? "#888" }}
    >
      <div className="ws-tabs" role="tablist">
        {pages.map((p) => (
          <div
            key={p.id}
            role="tab"
            aria-selected={p.id === page?.id}
            className={"ws-tab" + (p.id === page?.id ? " active" : "") + (dropTab === p.id ? " drop" : "")}
            style={{ ["--tab" as string]: p.color }}
            onMouseDown={(e) => {
              if (e.button === 0) setPageId(p.id);
            }}
            onDoubleClick={() => void editPage(p)}
            onContextMenu={(e) =>
              openContextMenu(e, [
                { label: "Page P&roperties...", run: () => void editPage(p) },
                { label: "New &Page", run: addPage },
                ...(pages.length > 1 ? [{ label: "Remove Pa&ge", run: () => void removePage(p) }] : []),
              ])
            }
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG_ICON)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDropTab(p.id);
            }}
            onDragLeave={() => setDropTab((t) => (t === p.id ? null : t))}
            onDrop={(e) => {
              setDropTab(null);
              const id = e.dataTransfer.getData(DRAG_ICON);
              if (id && p.id !== page?.id) moveToPage(id, p.id);
            }}
            title="Double-click to rename the page or change its color"
          >
            {p.name}
          </div>
        ))}
        <div className="ws-tab ws-tab-add" title="New page" onMouseDown={addPage}>
          +
        </div>
        <div className="ws-tabs-fill" />
        <div
          className="ws-tab ws-tab-replicator"
          style={{ ["--tab" as string]: "#9a9a9a" }}
          title="Replicator"
          onMouseDown={() => openView("replicator")}
        >
          <Icon name="replicator" /> Replicator
        </div>
      </div>

      <div
        className="ws-page"
        tabIndex={0}
        onKeyDown={onKey}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setSel(null);
        }}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) openContextMenu(e, backgroundMenu());
        }}
      >
        {tiles.length === 0 && (
          <div className="ws-empty">This page is empty. Drag database icons onto its tab, or right-click for options.</div>
        )}
        {tiles.map(({ db, replica }) => {
          const stacked = !!db.serverReplica && replica === null;
          const choice = replica ?? replicaChoice[db.id] ?? "local";
          const server = db.server !== "Local" ? db.server : db.serverReplica && choice === "server" ? db.serverReplica : "Local";
          const unread = prefs.showUnread ? unreadFor(db) : 0;
          const key = db.id + (replica ?? "");
          return (
            <div
              key={key}
              className={"ws-icon" + (sel === db.id ? " selected" : "") + (stacked ? " stacked" : "") + (dropIcon === key ? " drop" : "")}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_ICON, db.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_ICON)) return;
                e.preventDefault();
                setDropIcon(key);
              }}
              onDragLeave={() => setDropIcon((k) => (k === key ? null : k))}
              onDrop={(e) => {
                setDropIcon(null);
                const id = e.dataTransfer.getData(DRAG_ICON);
                if (!id || id === db.id || !page) return;
                const order = visible.map((d) => d.id).filter((x) => x !== id);
                order.splice(order.indexOf(db.id), 0, id);
                setPages(
                  useUI
                    .getState()
                    .workspacePages.map((p) => (p.id === page.id ? { ...p, icons: order } : { ...p, icons: p.icons.filter((x) => x !== id) })),
                );
              }}
              onMouseDown={(e) => {
                if (e.button === 0 || e.button === 2) setSel(db.id);
              }}
              onDoubleClick={() => void open(db, replica ?? undefined)}
              onContextMenu={(e) => {
                e.preventDefault();
                setSel(db.id);
                openContextMenu(e, iconMenu(db));
              }}
              title={`${db.title}\n${server === "Local" ? "Local" : server}: ${db.filePath}`}
            >
              <div className="ws-art">
                {stacked && <span className="ws-stack-shadow" aria-hidden />}
                <Icon name={TEMPLATE_ICON[db.template] ?? "db-generic"} />
                {stacked && (
                  <span
                    className="ws-stack-arrow"
                    title="Choose which replica to open"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      openContextMenu({ clientX: r.left, clientY: r.bottom }, replicaMenu(db));
                    }}
                  >
                    ▾
                  </span>
                )}
                {unread > 0 && <span className="ws-unread">{unread}</span>}
              </div>
              <div className="ws-text">
                <span className="ws-title">{db.title}</span>
                {(prefs.showServerNames || replica === "server") && <span className="ws-server">{server}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
