// ============================================================================
// Notebook / Journal — the personal Notebook database. Three-pane layout
// (category navigator · document list · editable note form). Follows the Mail
// reference module: reads/writes the shared store, composes shared UI
// primitives, and reuses the shared layout classes (.app, .action-bar,
// .app-cols, .nav-pane, .list-pane, .preview-pane, .view, .form).
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useNotes, uid } from "../../data/store";
import { useUI } from "../../data/ui";
import type { JournalEntry } from "../../data/types";
import {
  ActionBar,
  ActionButton,
  ActionSep,
  ActionSpacer,
} from "../../components/ui";
import { fmtListDate, fmtDateTime } from "../../lib/format";
import "../../styles/notebook.css";

type NavKey = "all" | "by-category" | { cat: string };

function navEq(a: NavKey, b: NavKey): boolean {
  if (typeof a === "string" || typeof b === "string") return a === b;
  return a.cat === b.cat;
}

export default function Notebook() {
  const { journal, addJournal, updateJournal, deleteJournal } = useNotes();
  const setStatus = useUI((s) => s.setStatus);

  const [nav, setNav] = useState<NavKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const subjectRef = useRef<HTMLInputElement>(null);
  const focusOnSelect = useRef(false);

  // Distinct categories, alphabetical, for the navigator.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const j of journal) {
      const c = j.category.trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [journal]);

  const entries = useMemo(() => {
    let list = journal;
    if (typeof nav !== "string") {
      list = list.filter((j) => j.category.trim() === nav.cat);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (j) =>
          j.subject.toLowerCase().includes(q) ||
          j.body.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => b.modified - a.modified);
  }, [journal, nav, search]);

  const selected = journal.find((j) => j.id === selectedId) ?? null;

  // Focus the subject input right after a "New Entry" creates & selects it.
  useEffect(() => {
    if (focusOnSelect.current && selected) {
      focusOnSelect.current = false;
      subjectRef.current?.focus();
      subjectRef.current?.select();
    }
  }, [selected]);

  function newEntry() {
    const now = Date.now();
    const entry: JournalEntry = {
      id: uid(),
      subject: "Untitled",
      body: "",
      category: typeof nav === "string" ? "" : nav.cat,
      created: now,
      modified: now,
    };
    addJournal(entry);
    focusOnSelect.current = true;
    setSelectedId(entry.id);
    setStatus("New journal entry created.");
  }

  function del() {
    if (!selected) return;
    if (!confirm(`Delete "${selected.subject || "Untitled"}"? This cannot be undone.`)) {
      return;
    }
    deleteJournal(selected.id);
    setSelectedId(null);
    setStatus("Document deleted.");
  }

  return (
    <div className="app notebook-app">
      <ActionBar>
        <ActionButton icon="📝" label="New Entry" onClick={newEntry} />
        <ActionSep />
        <ActionButton icon="🗑️" label="Delete" onClick={del} disabled={!selected} />
        <ActionSpacer />
        <div className="action-search">
          <input
            type="search"
            placeholder="Search Notebook…"
            className="bevel-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </ActionBar>

      <div className="app-cols">
        {/* Navigator */}
        <div className="nav-pane">
          <div className="nav-title">Notebook</div>
          <div className="nav-group">
            <div
              className={"nav-item" + (navEq(nav, "all") ? " active" : "")}
              onClick={() => {
                setNav("all");
                setSelectedId(null);
              }}
            >
              <span className="nav-ic">🗂️</span>
              <span className="nav-label">All Documents</span>
              {journal.length > 0 && <span className="nav-count">{journal.length}</span>}
            </div>
            <div
              className={"nav-item" + (navEq(nav, "by-category") ? " active" : "")}
              onClick={() => {
                setNav("by-category");
                setSelectedId(null);
              }}
            >
              <span className="nav-ic">📑</span>
              <span className="nav-label">By Category</span>
            </div>
          </div>
          {categories.length > 0 && (
            <div className="nav-group nav-sub">
              {categories.map((c) => {
                const count = journal.filter((j) => j.category.trim() === c).length;
                return (
                  <div
                    key={c}
                    className={
                      "nav-item" +
                      (typeof nav !== "string" && nav.cat === c ? " active" : "")
                    }
                    onClick={() => {
                      setNav({ cat: c });
                      setSelectedId(null);
                    }}
                  >
                    <span className="nav-ic">📓</span>
                    <span className="nav-label">{c}</span>
                    {count > 0 && <span className="nav-count">{count}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Document list */}
        <div className="list-pane notebook-list">
          <div className="view">
            <div className="view-head">
              <div className="col" style={{ flex: 1 }}>Subject</div>
              <div className="col" style={{ flex: "0 0 130px" }}>Category</div>
              <div className="col" style={{ flex: "0 0 96px" }}>Modified</div>
            </div>
            <div className="view-body">
              {entries.length === 0 && (
                <div className="view-empty">No documents in this view.</div>
              )}
              {entries.map((j) => (
                <div
                  key={j.id}
                  className={"view-row" + (j.id === selectedId ? " selected" : "")}
                  onClick={() => setSelectedId(j.id)}
                >
                  <div className="col" style={{ flex: 1 }}>{j.subject || "Untitled"}</div>
                  <div className="col" style={{ flex: "0 0 130px" }}>
                    {j.category ? (
                      <span className="tag">{j.category}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                  <div className="col" style={{ flex: "0 0 96px" }}>{fmtListDate(j.modified)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Editor / reading pane */}
        <div className="preview-pane">
          {selected ? (
            <NoteEditor
              key={selected.id}
              entry={selected}
              subjectRef={subjectRef}
              categories={categories}
              onSave={(patch) => {
                updateJournal(selected.id, patch);
                setStatus("Document saved.");
              }}
              onFieldBlur={(patch) => updateJournal(selected.id, patch)}
            />
          ) : (
            <div className="preview-empty">
              Select a journal entry to read it, or click “New Entry” to start one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Note editor ------------------------------------------------------------
function NoteEditor({
  entry,
  subjectRef,
  categories,
  onSave,
  onFieldBlur,
}: {
  entry: JournalEntry;
  subjectRef: React.RefObject<HTMLInputElement>;
  categories: string[];
  onSave: (patch: Partial<JournalEntry>) => void;
  onFieldBlur: (patch: Partial<JournalEntry>) => void;
}) {
  const [subject, setSubject] = useState(entry.subject);
  const [category, setCategory] = useState(entry.category);
  const [body, setBody] = useState(entry.body);

  // Persist a field if it diverges from the stored value (auto-save on blur).
  const blurSubject = () => {
    if (subject !== entry.subject) onFieldBlur({ subject });
  };
  const blurCategory = () => {
    if (category !== entry.category) onFieldBlur({ category });
  };
  const blurBody = () => {
    if (body !== entry.body) onFieldBlur({ body });
  };

  const save = () => {
    const patch: Partial<JournalEntry> = {};
    if (subject !== entry.subject) patch.subject = subject;
    if (category !== entry.category) patch.category = category;
    if (body !== entry.body) patch.body = body;
    onSave(patch);
  };

  return (
    <div className="form note-form">
      <div className="note-head">
        <input
          ref={subjectRef}
          type="text"
          className="note-subject"
          value={subject}
          placeholder="Untitled"
          onChange={(e) => setSubject(e.target.value)}
          onBlur={blurSubject}
        />
        <div className="note-cat">
          <label>Category</label>
          <input
            type="text"
            className="bevel-field note-cat-input"
            list="notebook-categories"
            value={category}
            placeholder="(none)"
            onChange={(e) => setCategory(e.target.value)}
            onBlur={blurCategory}
          />
          <datalist id="notebook-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="note-meta muted">
        Created {fmtDateTime(entry.created)} &nbsp;·&nbsp; Modified {fmtDateTime(entry.modified)}
      </div>

      <textarea
        className="memo-body note-body"
        value={body}
        placeholder="Write your note…"
        onChange={(e) => setBody(e.target.value)}
        onBlur={blurBody}
      />

      <div className="note-actions">
        <button className="btn primary" onClick={save}>💾 Save</button>
      </div>
    </div>
  );
}
