// ============================================================================
// Notebook: the Personal Journal database (journal.nsf, and any journal made
// from the template; the window's `db` picks which). The navigator switches
// between By Date (pages grouped by month, newest first) and By Category
// ("A\B" makes a subcategory), and the preview pane shows the selected page
// in read mode. Pages open in their own window. Delete marks pages with the
// trash can, and F9 or leaving the view asks before deleting them;
// Categorize... files the selected pages under categories.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionBar } from "../../components/ActionBar";
import type { ActionItem } from "../../components/ActionBar";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { NotesView } from "../../components/NotesView";
import type { ViewColumn } from "../../components/NotesView";
import { notesAsk } from "../../components/dialogs";
import { openContextMenu } from "../../components/menu";
import type { MenuItem } from "../../components/menu";
import { Splitter } from "../../components/Splitter";
import { useTab, useTabCommands } from "../../components/tabs";
import { useNotes } from "../../data/store";
import { registerCloseGuard, useUI } from "../../data/ui";
import type { JournalEntry } from "../../data/types";
import { fmtDate } from "../../lib/format";
import { openDocumentProperties } from "../../shell/dialogs/Properties";
import { DRAG_DOC } from "../../shell/BookmarkBar";
import { copyJournalLink, JournalForm } from "./JournalDoc";
import { keywordsDialog } from "./Categories";
import { openInEditMode } from "./openInEdit";
import {
  allCategories,
  caretCategory,
  categoryLabels,
  entryTitle,
  inJournalDb,
  joinCategories,
  JOURNAL_DB,
  journalDb,
  matchesEntry,
  monthLabel,
  monthOrder,
  splitCategories,
} from "./journalHelpers";
import "../../styles/notebook.css";

type NavKey = "date" | "category";

const NAV: { key: NavKey; label: string; icon: IconName }[] = [
  { key: "date", label: "By Date", icon: "calendar" },
  { key: "category", label: "By Category", icon: "tag" },
];

// Stable view callbacks (NotesView rebuilds its rows when they change).
const idOf = (e: JournalEntry) => e.id;
const byMonth = (e: JournalEntry) => monthLabel(e.created);
const byCategory = (e: JournalEntry) => categoryLabels(e.category);

const COLUMNS: ViewColumn<JournalEntry>[] = [
  {
    id: "date",
    title: "Date",
    width: 92,
    sortable: true,
    sortValue: (e) => e.created,
    render: (e) => fmtDate(e.created),
  },
  {
    id: "subject",
    title: "Subject",
    flex: true,
    minWidth: 220,
    sortable: true,
    sortValue: (e) => entryTitle(e).toLowerCase(),
    text: (e) => entryTitle(e),
    render: (e) => <span className={"nb-subject" + (e.subject.trim() ? "" : " untitled")}>{entryTitle(e)}</span>,
  },
];

const docs = (n: number) => `${n} document${n === 1 ? "" : "s"}`;

export default function Notebook() {
  const { tab } = useTab();
  const db = journalDb(tab.db);
  const journal = useNotes((s) => s.journal);
  const dbInfo = useNotes((s) => s.databases.find((d) => d.id === (db ?? JOURNAL_DB)));
  const updateJournal = useNotes((s) => s.updateJournal);
  const deleteJournal = useNotes((s) => s.deleteJournal);
  const setStatus = useUI((s) => s.setStatus);
  const setTabTitle = useUI((s) => s.setTabTitle);
  const newDocument = useUI((s) => s.newDocument);
  const openDocument = useUI((s) => s.openDocument);
  const preview = useUI((s) => s.uiPrefs.preview);

  const [nav, setNav] = useState<NavKey>("date");
  const viewKey = `journal-${nav}${db ? "@" + db : ""}`;
  const sortPref = useUI((s) => s.viewPrefs[viewKey]?.sort);
  const [caret, setCaret] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");

  // A journal made from the template is titled after its database.
  useEffect(() => {
    if (db && dbInfo) setTabTitle(tab.id, dbInfo.title);
  }, [db, dbInfo, tab.id, setTabTitle]);

  const inDb = useMemo(() => journal.filter((j) => inJournalDb(j, db)), [journal, db]);
  const shown = useMemo(() => (applied ? inDb.filter((j) => matchesEntry(j, applied)) : inDb), [inDb, applied]);
  const categories = useMemo(() => allCategories(inDb), [inDb]);
  const selected = inDb.find((j) => j.id === selectedId) ?? null;
  const selection = useCallback(
    () => (checked.size ? [...checked] : selectedId ? [selectedId] : []),
    [checked, selectedId],
  );

  // ---- deletion marks ------------------------------------------------------
  const markForDeletion = (ids: string[]) => {
    if (!ids.length) return;
    // Delete again on marked documents takes the marks off.
    const allMarked = ids.every((id) => marked.has(id));
    const next = new Set(marked);
    for (const id of ids) {
      if (allMarked) next.delete(id);
      else next.add(id);
    }
    setMarked(next);
    setChecked(new Set());
    setStatus(allMarked ? "Deletion mark removed." : `${docs(ids.length)} marked for deletion. Press F9 to delete.`);
  };

  /** F9 / leaving the view: ask, then delete what is marked. Resolves with how many went. */
  const processDeletions = async (): Promise<number> => {
    const ids = [...marked].filter((id) => useNotes.getState().journal.some((j) => j.id === id));
    if (!ids.length) {
      if (marked.size) setMarked(new Set());
      return 0;
    }
    const ok = await notesAsk(`Delete ${docs(ids.length)} marked for deletion?`, { title: "Delete Documents" });
    setMarked(new Set());
    if (!ok) return 0;
    for (const id of ids) deleteJournal(id);
    setStatus(`${docs(ids.length)} deleted.`);
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    return ids.length;
  };

  const refresh = () => {
    void processDeletions().then((n) => {
      if (!n) setStatus("View refreshed.");
    });
  };

  const goNav = async (key: NavKey) => {
    if (key === nav) return;
    await processDeletions();
    setNav(key);
    // The same page stays current in the other view.
    setCaret(selectedId);
    setChecked(new Set());
  };

  // Closing the window with marked pages asks first, too.
  useEffect(() =>
    registerCloseGuard(tab.id, {
      isDirty: () => false,
      confirmClose: async () => {
        await processDeletions();
        return true;
      },
    }),
  );

  // ---- documents ---------------------------------------------------------------
  const newPage = () => {
    // In By Category, a new page starts in the category under the cursor.
    const category = nav === "category" ? caretCategory(caret) : undefined;
    newDocument("journal", category ? { category } : {}, { title: "New Journal Entry", db });
  };
  const open = (e: JournalEntry) => openDocument({ coll: "journal", id: e.id }, { title: entryTitle(e), db });
  const edit = (e: JournalEntry) => openInEditMode("journal", e.id, { title: entryTitle(e), db });

  const categorize = async (ids: string[]) => {
    const list = inDb.filter((j) => ids.includes(j.id));
    if (!list.length) return;
    // Check the categories every selected page already has.
    const common = splitCategories(list[0].category).filter((c) =>
      list.every((j) => splitCategories(j.category).some((x) => x.toLowerCase() === c.toLowerCase())),
    );
    const chosen = await keywordsDialog({
      title: "Categorize",
      prompt: `Categorize ${list.length} selected document${list.length === 1 ? "" : "s"} as:`,
      options: categories,
      selected: common,
    });
    if (!chosen) return;
    const value = joinCategories(chosen);
    for (const j of list) if (j.category !== value) updateJournal(j.id, { category: value });
    setChecked(new Set());
    setStatus(value ? `${docs(list.length)} categorized as ${value}.` : `${docs(list.length)} removed from their categories.`);
  };

  useTabCommands("journal", {
    refresh,
    deleteSelected: () => markForDeletion(selection()),
    searchBar: () => setSearchOpen((o) => !o),
    newDocument: newPage,
    toggleEdit: selected ? () => edit(selected) : undefined,
    copyAsLink: selected ? () => copyJournalLink(selected) : undefined,
    properties: selected ? () => void openDocumentProperties("journal", selected.id) : undefined,
  });

  // ---- view ---------------------------------------------------------------------
  const sortDir: 1 | -1 = sortPref?.col === "date" ? sortPref.dir : -1;
  const order = useMemo(() => monthOrder(sortDir), [sortDir]);

  const rowMenu = (e: JournalEntry | null): MenuItem[] => {
    if (!e) return [{ label: "&New Page", run: newPage }];
    const ids = checked.has(e.id) ? [...checked] : [e.id];
    return [
      { label: "&Open", run: () => open(e) },
      { label: "&Edit", accel: "Ctrl+E", run: () => edit(e) },
      { sep: true },
      { label: "Ca&tegorize...", run: () => void categorize(ids) },
      { label: "Copy as &Link", children: [{ label: "&Document Link", run: () => copyJournalLink(e) }] },
      { sep: true },
      { label: "&Delete", accel: "Del", run: () => markForDeletion(ids) },
      { label: "Document &Properties...", accel: "Alt+Enter", run: () => void openDocumentProperties("journal", e.id) },
    ];
  };

  const ids = selection();
  const actions: ActionItem[] = [
    { id: "new", label: "New Page", icon: "note-new", run: newPage },
    { id: "edit", label: "Edit", icon: "edit", disabled: !selected, run: () => selected && edit(selected), accel: "Ctrl+E" },
    "sep",
    { id: "delete", label: "Delete", icon: "trash", disabled: !ids.length, run: () => markForDeletion(ids), accel: "Del" },
    { id: "categorize", label: "Categorize...", icon: "tag", disabled: !ids.length, run: () => void categorize(ids) },
  ];

  const searchBar = searchOpen && (
    <div className="search-bar">
      <label>Search for:</label>
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setApplied(query.trim());
          if (e.key === "Escape") {
            e.stopPropagation();
            e.preventDefault();
            setSearchOpen(false);
          }
        }}
      />
      <button className="btn" onClick={() => setApplied(query.trim())}>
        Search
      </button>
      <button
        className="btn"
        onClick={() => {
          setQuery("");
          setApplied("");
        }}
      >
        Clear
      </button>
      {applied && <span className="search-result">{docs(shown.length)} found</span>}
    </div>
  );

  return (
    <div className="app nb-app">
      <ActionBar actions={actions} />
      <div className="app-cols">
        <div className="nav-pane nb-nav">
          <div className="nav-title">
            <span>{dbInfo?.title ?? "Personal Journal"}</span>
            <span className="nav-sub-label">on {dbInfo?.server ?? "Local"}</span>
          </div>
          <div className="nav-group">
            {NAV.map((n) => (
              <div key={n.key} className={"nav-item" + (nav === n.key ? " active" : "")} onClick={() => void goNav(n.key)}>
                <span className="nav-ic">
                  <Icon name={n.icon} />
                </span>
                <span className="nav-label">{n.label}</span>
              </div>
            ))}
          </div>
        </div>

        <Splitter id="journal.nav" />

        {/* Keyed by placement: a pane size dragged for one layout must not leak into the other. */}
        <div key={preview} className={"nb-stack preview-" + preview}>
          <div className="list-pane nb-list">
            {searchBar}
            <NotesView
              viewKey={viewKey}
              docs={shown}
              getId={idOf}
              columns={COLUMNS}
              defaultSort={{ col: "date", dir: -1 }}
              categorize={nav === "date" ? byMonth : byCategory}
              categoryOrder={nav === "date" ? order : undefined}
              caret={caret}
              onCaret={(key, e) => {
                setCaret(key);
                setSelectedId(e ? e.id : null);
              }}
              checked={checked}
              onChecked={setChecked}
              marked={marked}
              onOpen={open}
              onDelete={markForDeletion}
              onRefresh={refresh}
              onContextMenu={(ev, e) => openContextMenu(ev, rowMenu(e))}
              onDragStart={(ev, e) => {
                ev.dataTransfer.setData("text/plain", e.id);
                ev.dataTransfer.setData(DRAG_DOC, JSON.stringify({ coll: "journal", id: e.id, title: entryTitle(e), db }));
                ev.dataTransfer.effectAllowed = "copyMove";
              }}
              emptyText={applied ? "No documents match your search." : "There are no documents in this view."}
              autoFocus
            />
          </div>
          {preview !== "off" && (
            <>
              <Splitter vertical={preview === "bottom"} id={`journal.preview.${preview}`} />
              <div className="preview-pane nb-preview">
                {selected ? (
                  <JournalForm entry={selected} editing={false} categories={categories} onEdit={() => edit(selected)} compact />
                ) : (
                  <div className="preview-empty">Select a document to preview it.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export { JournalDocument } from "./JournalDoc";
