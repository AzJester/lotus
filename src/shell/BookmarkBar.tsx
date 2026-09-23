// ============================================================================
// The bookmark bar down the left edge. Classic R5: big buttons for Mail,
// Calendar, Address Book, To Do and the Replicator, then bookmark folders
// (Favorite Bookmarks, Databases, More Bookmarks) that fly out. Notes 8: the
// slim application rail. Drop a document on either bar to bookmark it.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import type { IconName } from "../components/Icon";
import { openContextMenu } from "../components/menu";
import { unreadCount, useNotes } from "../data/store";
import { useUI, VIEWS } from "../data/ui";
import type { Bookmark, DocColl, ViewId } from "../data/ui";
import { openDatabase } from "./nav";

export const DRAG_DOC = "application/x-notes-doc";

interface DraggedDoc {
  coll: DocColl;
  id: string;
  title: string;
  db?: string;
}

function readDrag(e: React.DragEvent): DraggedDoc | null {
  try {
    const raw = e.dataTransfer.getData(DRAG_DOC);
    return raw ? (JSON.parse(raw) as DraggedDoc) : null;
  } catch {
    return null;
  }
}

function openBookmark(b: Bookmark) {
  const ui = useUI.getState();
  if (b.doc) ui.openDocument(b.doc, { title: b.title, db: b.db });
  else if (b.db && b.view === "workspace") openDatabase(b.db);
  else ui.openView(b.view, b.db ? { db: b.db } : undefined);
}

type FolderId = "favorites" | "databases" | "more";

function Flyout({ folder, onClose }: { folder: FolderId; onClose: () => void }) {
  const bookmarks = useUI((s) => s.bookmarks);
  const removeBookmark = useUI((s) => s.removeBookmark);
  const dbs = useNotes((s) => s.databases);
  const ui = useUI.getState();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", close);
    };
  }, [onClose]);

  const title = folder === "favorites" ? "Favorite Bookmarks" : folder === "databases" ? "Databases" : "More Bookmarks";
  const rows: { key: string; icon: IconName; label: string; open: () => void; remove?: () => void }[] =
    folder === "databases"
      ? [
          { key: "ws", icon: "workspace", label: "Workspace", open: () => ui.openView("workspace") },
          { key: "wel", icon: "home", label: "Welcome", open: () => ui.openView("welcome") },
          ...dbs.map((d) => ({ key: d.id, icon: "database" as IconName, label: d.title, open: () => openDatabase(d.id) })),
        ]
      : bookmarks
          .filter((b) => b.folder === folder)
          .map((b) => ({
            key: b.id,
            icon: (b.doc ? "doclink" : VIEWS[b.view].icon) as IconName,
            label: b.title,
            open: () => openBookmark(b),
            remove: () => removeBookmark(b.id),
          }));

  return (
    <div className="bm-flyout" ref={ref}>
      <div className="bm-flyout-title">{title}</div>
      {rows.length === 0 && <div className="bm-flyout-empty">Drag documents here to bookmark them.</div>}
      {rows.map((r) => (
        <div
          key={r.key}
          className="bm-flyout-row"
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            onClose();
            r.open();
          }}
          onContextMenu={(e) =>
            openContextMenu(e, [
              { label: "Open", run: () => (onClose(), r.open()) },
              ...(r.remove ? [{ sep: true }, { label: "Remove Bookmark", run: r.remove }] : []),
            ])
          }
        >
          <Icon name={r.icon} />
          <span>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

function useDropBookmark(folder: "favorites" | "more") {
  const addBookmark = useUI((s) => s.addBookmark);
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_DOC)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "link";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        const d = readDrag(e);
        if (!d) return;
        e.preventDefault();
        addBookmark({ title: d.title, folder, view: "welcome", doc: { coll: d.coll, id: d.id }, db: d.db });
        useUI.getState().setStatus(`Bookmarked "${d.title}".`);
      },
    },
  };
}

const R5_APPS: { view: ViewId; icon: IconName; title: string }[] = [
  { view: "mail", icon: "db-mail", title: "Mail" },
  { view: "calendar", icon: "db-calendar", title: "Calendar" },
  { view: "contacts", icon: "db-addressbook", title: "Address Book" },
  { view: "todo", icon: "db-todo", title: "To Do" },
  { view: "replicator", icon: "db-replicator", title: "Replicator" },
];

const N8_APPS: ViewId[] = ["welcome", "workspace", "mail", "calendar", "contacts", "todo", "journal", "discussion"];

export default function BookmarkBar() {
  const theme = useUI((s) => s.theme);
  const activeView = useUI((s) => s.tabs.find((t) => t.id === s.activeTab)?.view);
  const openView = useUI((s) => s.openView);
  const unread = useNotes((s) => unreadCount(s.mail));
  const [flyout, setFlyout] = useState<FolderId | null>(null);
  const favDrop = useDropBookmark("favorites");
  const moreDrop = useDropBookmark("more");

  if (theme === "r5") {
    return (
      <div className="bookmark-bar bm-r5" {...favDrop.props}>
        {R5_APPS.map((a) => (
          <button
            key={a.view}
            className={"bm-big" + (activeView === a.view ? " active" : "")}
            title={a.title}
            onClick={() => openView(a.view)}
          >
            <Icon name={a.icon} />
            {a.view === "mail" && unread > 0 && <span className="bm-badge">{unread}</span>}
          </button>
        ))}
        <div className="bm-sep" />
        {(
          [
            ["favorites", "bm-favorites", "Favorite Bookmarks", favDrop],
            ["databases", "bm-databases", "Databases", null],
            ["more", "bm-more", "More Bookmarks", moreDrop],
          ] as const
        ).map(([id, icon, title, drop]) => (
          <div key={id} className="bm-folder-wrap">
            <button
              className={"bm-big" + (flyout === id ? " active" : "") + (drop?.over ? " drop" : "")}
              title={title}
              onMouseDown={(e) => {
                e.preventDefault();
                setFlyout(flyout === id ? null : id);
              }}
              {...(drop ? drop.props : {})}
            >
              <Icon name={icon} />
            </button>
            {flyout === id && <Flyout folder={id} onClose={() => setFlyout(null)} />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bookmark-bar" {...favDrop.props}>
      {N8_APPS.map((v) => (
        <button
          key={v}
          className={"bm-btn" + (activeView === v ? " active" : "")}
          title={VIEWS[v].bookmark}
          onClick={() => openView(v)}
        >
          <Icon name={VIEWS[v].icon} />
          {v === "mail" && unread > 0 && <span className="bm-badge">{unread}</span>}
        </button>
      ))}
      <div className="bm-sep" />
      <div className="bm-folder-wrap">
        <button
          className={"bm-btn" + (flyout === "favorites" ? " active" : "") + (favDrop.over ? " drop" : "")}
          title="Favorite Bookmarks"
          onMouseDown={(e) => {
            e.preventDefault();
            setFlyout(flyout === "favorites" ? null : "favorites");
          }}
        >
          <Icon name="favorites" />
        </button>
        {flyout === "favorites" && <Flyout folder="favorites" onClose={() => setFlyout(null)} />}
      </div>
    </div>
  );
}
