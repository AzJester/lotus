// ============================================================================
// File > Database > Open (Ctrl+O) and File > Database > New. Open lists the
// databases on a chosen server; New creates a Discussion or Personal Journal
// from its template and puts its icon on the current Workspace page.
// ============================================================================

import { useMemo, useState } from "react";
import { NotesDialog, notesAlert, openDialog } from "../../components/dialogs";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { useNotes, canReachServer } from "../../data/store";
import { useUI } from "../../data/ui";
import { APPS_SERVER, MAIL_SERVER } from "../../data/directory";
import type { NotesDatabase } from "../../data/types";
import { openDatabase } from "../nav";

const DB_ICON: Record<NotesDatabase["template"], IconName> = {
  mail: "mail",
  addressbook: "addressbook",
  journal: "notebook",
  discussion: "discussion",
  help: "help",
  directory: "directory",
  outbox: "outbox",
};

interface Listing {
  db: NotesDatabase;
  /** Where this copy lives. */
  on: string;
}

function listingsFor(server: string, dbs: NotesDatabase[]): Listing[] {
  if (server === "Local") return dbs.filter((d) => d.server === "Local").map((db) => ({ db, on: "Local" }));
  return dbs
    .filter((d) => d.server === server || d.serverReplica === server)
    .map((db) => ({ db, on: server }));
}

function OpenDatabaseDialog({ close }: { close: () => void }) {
  const dbs = useNotes((s) => s.databases);
  const location = useNotes((s) => s.user.location);
  const servers = ["Local", MAIL_SERVER, APPS_SERVER];
  const [server, setServer] = useState("Local");
  const list = useMemo(() => listingsFor(server, dbs), [server, dbs]);
  const [selected, setSelected] = useState<string | null>(list[0]?.db.id ?? null);
  const current = list.find((l) => l.db.id === selected);
  const offline = server !== "Local" && !canReachServer(location);

  const doOpen = async () => {
    if (!current) return;
    if (offline) {
      await notesAlert("Unable to find path to server.", { icon: "error" });
      return;
    }
    close();
    openDatabase(current.db.id);
  };

  const doBookmark = () => {
    if (!current) return;
    useUI.getState().addBookmark({ title: current.db.title, folder: "favorites", view: "workspace", db: current.db.id });
    useUI.getState().setStatus(`Bookmarked ${current.db.title}.`);
  };

  return (
    <NotesDialog
      title="Open Database"
      onClose={close}
      width={470}
      footer={
        <>
          <button className="btn primary" onClick={doOpen} disabled={!current}>
            Open
          </button>
          <button className="btn" onClick={doBookmark} disabled={!current}>
            Bookmark
          </button>
          <button className="btn" onClick={close}>
            Cancel
          </button>
        </>
      }
    >
      <div className="opendb">
        <label className="opendb-row">
          Server:&nbsp;
          <select
            value={server}
            onChange={(e) => {
              setServer(e.target.value);
              setSelected(listingsFor(e.target.value, dbs)[0]?.db.id ?? null);
            }}
          >
            {servers.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <div className="opendb-label">Database:</div>
        <div className="opendb-list" role="listbox" tabIndex={0}>
          {offline && <div className="opendb-empty">Unable to find path to server.</div>}
          {!offline &&
            list.map((l) => (
              <div
                key={l.db.id}
                role="option"
                aria-selected={l.db.id === selected}
                className={"opendb-item" + (l.db.id === selected ? " active" : "")}
                onMouseDown={() => setSelected(l.db.id)}
                onDoubleClick={doOpen}
              >
                <Icon name={DB_ICON[l.db.template]} />
                <span>{l.db.title}</span>
              </div>
            ))}
          {!offline && list.length === 0 && <div className="opendb-empty">No databases found.</div>}
        </div>
        <div className="opendb-row">
          Filename:&nbsp;<span className="opendb-file">{current?.db.filePath ?? ""}</span>
        </div>
      </div>
    </NotesDialog>
  );
}

export function openDatabaseDialog() {
  return openDialog<void>((close) => <OpenDatabaseDialog close={() => close()} />);
}

// ---------------------------------------------------------------------------
// New Database
// ---------------------------------------------------------------------------

const TEMPLATES: { id: NotesDatabase["template"]; name: string; file: string; design: string; available: boolean }[] = [
  { id: "discussion", name: "Discussion - Notes & Web (R5.0)", file: "discsw50.ntf", design: "StdR50Disc", available: true },
  { id: "journal", name: "Personal Journal (R5)", file: "journal.ntf", design: "StdR5PersonalJournal", available: true },
  { id: "mail", name: "Mail (R5.0)", file: "mail50.ntf", design: "StdR50Mail", available: false },
  { id: "addressbook", name: "Personal Address Book", file: "pernames.ntf", design: "StdR50PersonalAddressBook", available: false },
];

function hexReplica(): string {
  const h = () => Math.floor(Math.random() * 0xffffffff).toString(16).toUpperCase().padStart(8, "0");
  return `${h()}:${h()}`;
}

function NewDatabaseDialog({ close }: { close: () => void }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState("");
  const [touchedFile, setTouchedFile] = useState(false);
  const [tpl, setTpl] = useState<NotesDatabase["template"]>("discussion");
  const autoFile = (t: string) => (t.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "untitled") + ".nsf";

  const create = async () => {
    const name = title.trim();
    if (!name) {
      await notesAlert("You must enter a title for the new database.", { icon: "warning" });
      return;
    }
    const template = TEMPLATES.find((t) => t.id === tpl)!;
    const filePath = file.trim() || autoFile(name);
    const notes = useNotes.getState();
    if (notes.databases.some((d) => d.filePath.toLowerCase() === filePath.toLowerCase())) {
      await notesAlert(`A database named ${filePath} already exists.`, { icon: "error" });
      return;
    }
    const id = "db-" + Math.random().toString(36).slice(2, 9);
    const db: NotesDatabase = {
      id,
      title: name,
      template: tpl,
      templateName: template.design,
      server: "Local",
      filePath,
      replicaId: hexReplica(),
      created: Date.now(),
      access: "Manager",
      userCreated: true,
    };
    notes.addDatabase(db);
    // The new icon lands on the Workspace page you were last looking at.
    const ui = useUI.getState();
    const pages = ui.workspacePages;
    const pageId = pages[0]?.id;
    ui.setWorkspacePages(pages.map((p) => (p.id === pageId ? { ...p, icons: [...p.icons, id] } : p)));
    ui.setStatus(`Database ${name} (${filePath}) created from ${template.name}.`);
    close();
    openDatabase(id);
  };

  return (
    <NotesDialog
      title="New Database"
      onClose={close}
      width={480}
      footer={
        <>
          <button className="btn primary" onClick={create}>
            OK
          </button>
          <button className="btn" onClick={close}>
            Cancel
          </button>
        </>
      }
    >
      <div className="newdb">
        <div className="opendb-row">Server: Local</div>
        <label className="opendb-row">
          Title:&nbsp;
          <input
            type="text"
            value={title}
            data-autofocus
            onChange={(e) => {
              setTitle(e.target.value);
              if (!touchedFile) setFile(autoFile(e.target.value));
            }}
          />
        </label>
        <label className="opendb-row">
          File name:&nbsp;
          <input
            type="text"
            value={file}
            onChange={(e) => {
              setTouchedFile(true);
              setFile(e.target.value);
            }}
          />
        </label>
        <div className="opendb-label">Template:</div>
        <div className="opendb-list" role="listbox">
          {TEMPLATES.map((t) => (
            <div
              key={t.id}
              role="option"
              aria-selected={t.id === tpl}
              aria-disabled={!t.available}
              className={"opendb-item" + (t.id === tpl ? " active" : "") + (t.available ? "" : " disabled")}
              onMouseDown={() => t.available && setTpl(t.id)}
            >
              <Icon name={DB_ICON[t.id]} />
              <span>{t.name}</span>
              <span className="opendb-tplfile">{t.file}</span>
            </div>
          ))}
        </div>
        <label className="opendb-row">
          <input type="checkbox" checked readOnly /> Inherit future design changes
        </label>
      </div>
    </NotesDialog>
  );
}

export function newDatabaseDialog() {
  return openDialog<void>((close) => <NewDatabaseDialog close={() => close()} />);
}
