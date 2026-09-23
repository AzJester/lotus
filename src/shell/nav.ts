// ============================================================================
// Navigation helpers: open a database the way a Workspace icon or bookmark
// does, work out which database a window belongs to, and translate windows
// to and from notes:// URLs (the address field).
// ============================================================================

import { useNotes } from "../data/store";
import { useUI, VIEWS } from "../data/ui";
import type { DocColl, OpenTab, ViewId } from "../data/ui";
import type { NotesDatabase } from "../data/types";
import { MAIL_SERVER } from "../data/directory";
import { notesAlert } from "../components/dialogs";

const TEMPLATE_VIEW: Record<NotesDatabase["template"], ViewId> = {
  mail: "mail",
  addressbook: "contacts",
  journal: "journal",
  discussion: "discussion",
  help: "help",
  directory: "directory",
  outbox: "outbox",
};

export function viewOfDb(db: NotesDatabase): ViewId {
  return TEMPLATE_VIEW[db.template];
}

/** Open a database (Workspace double-click, bookmark, Open Database...). */
export function openDatabase(dbId: string) {
  const db = useNotes.getState().databases.find((d) => d.id === dbId);
  if (!db) return;
  const view = viewOfDb(db);
  const ui = useUI.getState();
  // Discussion and journal databases can have several instances.
  const multi = view === "discussion" || view === "journal";
  ui.openView(view, multi ? { db: db.id } : undefined);
  if (db.userCreated && !ui.aboutShown.includes(db.id)) {
    ui.markAboutShown(db.id);
    ui.openDocument({ coll: "help", id: `about-${db.template}` }, { title: `About ${db.title}`, db: db.id });
  }
}

/** The database a window belongs to (for properties, access level, About). */
export function dbOfTab(tab: OpenTab | undefined): NotesDatabase | undefined {
  if (!tab) return undefined;
  const dbs = useNotes.getState().databases;
  const id = tab.db ?? VIEWS[tab.view].db;
  return id ? dbs.find((d) => d.id === id) : undefined;
}

const VIEW_PATH: Partial<Record<ViewId, string>> = {
  mail: "($Inbox)",
  calendar: "($Calendar)",
  todo: "($ToDo)",
  contacts: "People",
  journal: "All Documents",
  discussion: "All Documents",
  help: "Contents",
  directory: "People",
  outbox: "Mail",
};

/** notes:// address of a window. */
export function tabUrl(tab: OpenTab | undefined): string {
  if (!tab) return "";
  if (tab.view === "welcome") return "notes:///__Welcome";
  if (tab.view === "workspace") return "notes:///__Workspace";
  if (tab.view === "replicator") return "notes:///__Replicator";
  if (tab.view === "search") return `notes:///__Search?q=${encodeURIComponent(useUI.getState().searchQuery)}`;
  const db = dbOfTab(tab);
  if (!db) return "";
  const server = db.server === "Local" ? "" : db.server.split("/")[0];
  const path = db.filePath.replace(/\\/g, "/");
  if (tab.doc) return `notes://${server}/${path}/0/${tab.doc.id}?OpenDocument`;
  return `notes://${server}/${path}/${encodeURIComponent(VIEW_PATH[tab.view] ?? "All Documents")}?OpenView`;
}

/** Follow a notes:// URL typed into the address field. */
export async function openUrl(raw: string) {
  const url = raw.trim();
  const ui = useUI.getState();
  if (!url) return;
  if (/^notes:\/\/\/__welcome/i.test(url)) return void ui.openView("welcome");
  if (/^notes:\/\/\/__workspace/i.test(url)) return void ui.openView("workspace");
  if (/^notes:\/\/\/__replicator/i.test(url)) return void ui.openView("replicator");
  const m = url.match(/^notes:\/\/([^/]*)\/(.+?\.(nsf|box))(\/.*)?$/i);
  if (!m) {
    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener");
      return;
    }
    await notesAlert("File does not exist", { icon: "error" });
    return;
  }
  const file = m[2].replace(/\//g, "\\").toLowerCase();
  const db = useNotes
    .getState()
    .databases.find((d) => d.filePath.toLowerCase() === file || d.filePath.toLowerCase().endsWith("\\" + file));
  if (!db) {
    await notesAlert("File does not exist", { icon: "error" });
    return;
  }
  const docMatch = (m[4] ?? "").match(/^\/0\/([^?]+)/);
  if (docMatch) {
    const id = decodeURIComponent(docMatch[1]);
    const coll = findDocColl(id);
    if (!coll) {
      await notesAlert("Document has been deleted.", { icon: "warning" });
      return;
    }
    ui.openDocument({ coll, id }, { db: db.id });
    return;
  }
  openDatabase(db.id);
}

/** Which collection holds a document id. */
export function findDocColl(id: string): DocColl | undefined {
  const s = useNotes.getState();
  if (s.mail.some((d) => d.id === id)) return "mail";
  if (s.calendar.some((d) => d.id === id)) return "calendar";
  if (s.contacts.some((d) => d.id === id)) return "contacts";
  if (s.todos.some((d) => d.id === id)) return "todos";
  if (s.journal.some((d) => d.id === id)) return "journal";
  if (s.discussion.some((d) => d.id === id)) return "discussion";
  return undefined;
}

export const SERVER_NAME = MAIL_SERVER;
