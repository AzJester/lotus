// ============================================================================
// Search Results: a full-text search across every local database (mail,
// calendar, To Do, contacts, journals, discussions, help), shown the way a
// Notes full-text search showed hits: a relevance bar, categorized by
// database, and every hit opens the document itself. The search bar at the
// top refines the query.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { NotesView } from "../../components/NotesView";
import type { ViewColumn } from "../../components/NotesView";
import { useTabCommands } from "../../components/tabs";
import { useNotes } from "../../data/store";
import { useUI } from "../../data/ui";
import type { DocColl } from "../../data/ui";
import { fmtListDate } from "../../lib/format";
import { HELP_ENTRIES } from "../help/Help";
import "../../styles/search.css";

interface Hit {
  key: string;
  coll: DocColl;
  id: string;
  db: string;
  icon: IconName;
  title: string;
  snippet: string;
  date: number | null;
  score: number;
}

function snippetAround(text: string, q: string): string {
  const flat = text.replace(/\s+/g, " ");
  const i = flat.toLowerCase().indexOf(q);
  if (i < 0) return flat.slice(0, 110);
  const start = Math.max(0, i - 40);
  return (start > 0 ? "..." : "") + flat.slice(start, start + 110).trim() + "...";
}

/** How many times the terms occur, weighted toward titles (the relevance bar). */
function relevance(q: string, title: string, body: string): number {
  const terms = q.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const t of terms) {
    const inTitle = title.toLowerCase().split(t).length - 1;
    const inBody = body.toLowerCase().split(t).length - 1;
    score += inTitle * 5 + inBody;
  }
  return score;
}

export default function SearchResults() {
  const query = useUI((s) => s.searchQuery);
  const runSearch = useUI((s) => s.runSearch);
  const openDocument = useUI((s) => s.openDocument);
  const setStatus = useUI((s) => s.setStatus);
  const mail = useNotes((s) => s.mail);
  const calendar = useNotes((s) => s.calendar);
  const contacts = useNotes((s) => s.contacts);
  const todos = useNotes((s) => s.todos);
  const journal = useNotes((s) => s.journal);
  const discussion = useNotes((s) => s.discussion);
  const databases = useNotes((s) => s.databases);
  const [text, setText] = useState(query);
  const [caret, setCaret] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => setText(query), [query]);

  const dbTitle = (id: string | undefined, fallback: string) => databases.find((d) => d.id === id)?.title ?? fallback;

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Hit[] = [];
    const matches = (...parts: (string | undefined)[]) => q.split(/\s+/).every((t) => parts.some((p) => (p ?? "").toLowerCase().includes(t)));
    const add = (h: Omit<Hit, "key" | "score">, body: string) =>
      out.push({ ...h, key: `${h.coll}:${h.id}`, score: relevance(q, h.title, body) });

    const mailDb = dbTitle("mail", "Mail");
    for (const m of mail) {
      if (m.folder === "trash") continue;
      if (matches(m.subject, m.body, m.from.name, ...m.to.map((p) => p.name)))
        add({ coll: "mail", id: m.id, db: mailDb, icon: "mail", title: m.subject || "(No subject)", snippet: `${m.from.name}: ${snippetAround(m.body, q)}`, date: m.date }, m.body);
    }
    for (const e of calendar) {
      if (matches(e.subject, e.location, e.description))
        add({ coll: "calendar", id: e.id, db: mailDb, icon: "calendar", title: e.subject, snippet: e.location || snippetAround(e.description, q), date: e.start }, e.description);
    }
    for (const t of todos) {
      if (matches(t.subject, t.description, t.category))
        add({ coll: "todos", id: t.id, db: mailDb, icon: "todo", title: t.subject, snippet: snippetAround(t.description, q), date: t.due }, t.description);
    }
    const pab = dbTitle("contacts", "Address Book");
    for (const c of contacts) {
      const name = `${c.firstName} ${c.lastName}`.trim();
      if (matches(c.firstName, c.lastName, c.email, c.company, c.title, c.comments))
        add({ coll: "contacts", id: c.id, db: pab, icon: "person", title: name || c.email, snippet: [c.title, c.company, c.email].filter(Boolean).join(", "), date: null }, c.comments);
    }
    for (const j of journal) {
      if (matches(j.subject, j.body, j.category))
        add({ coll: "journal", id: j.id, db: dbTitle(j.db ?? "journal", "Personal Journal"), icon: "note", title: j.subject, snippet: snippetAround(j.body, q), date: j.modified }, j.body);
    }
    for (const p of discussion) {
      if (matches(p.subject, p.body, p.author.name))
        add(
          { coll: "discussion", id: p.id, db: dbTitle(p.db ?? "discussion", "Discussion"), icon: p.parentId ? "response" : "topic", title: p.subject, snippet: `${p.author.name}: ${snippetAround(p.body, q)}`, date: p.date },
          p.body,
        );
    }
    for (const d of HELP_ENTRIES) {
      if (matches(d.title, d.body)) add({ coll: "help", id: d.id, db: "Lotus Notes Help", icon: "help", title: d.title, snippet: snippetAround(d.body, q), date: null }, d.body);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mail, calendar, contacts, todos, journal, discussion, databases]);

  const maxScore = Math.max(1, ...hits.map((h) => h.score));

  const columns: ViewColumn<Hit>[] = [
    {
      id: "score",
      title: "Relevance",
      width: 74,
      sortable: true,
      sortValue: (h) => h.score,
      render: (h) => (
        <span className="search-score" title={`Relevance ${Math.round((h.score / maxScore) * 100)}%`}>
          <span style={{ width: `${Math.max(8, Math.round((h.score / maxScore) * 100))}%` }} />
        </span>
      ),
    },
    {
      id: "title",
      title: "Document",
      width: 300,
      sortable: true,
      sortValue: (h) => h.title.toLowerCase(),
      text: (h) => h.title,
      render: (h) => (
        <span className="search-title">
          <Icon name={h.icon} /> {h.title}
        </span>
      ),
    },
    { id: "snippet", title: "Text", flex: true, minWidth: 200, render: (h) => <span className="muted">{h.snippet}</span> },
    { id: "date", title: "Date", width: 100, sortable: true, sortValue: (h) => h.date ?? 0, render: (h) => (h.date ? fmtListDate(h.date) : "") },
  ];

  const open = (h: Hit) => openDocument({ coll: h.coll, id: h.id }, { title: h.title });

  useTabCommands("search", {
    refresh: () => {
      runSearch(text.trim());
      setStatus(`${hits.length} documents found.`);
    },
  });

  return (
    <div className="app search-app">
      <div className="search-bar">
        <label>Search for:</label>
        <input
          type="text"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) runSearch(text.trim());
          }}
        />
        <button className="btn" onClick={() => text.trim() && runSearch(text.trim())}>
          Search
        </button>
        <span className="search-indexed">
          <Icon name="info" /> All local databases, full text
        </span>
      </div>
      <div className="search-summary">
        {query.trim() ? (
          <>
            <b>{hits.length}</b> document{hits.length === 1 ? "" : "s"} found for <b>{query}</b>. Double-click a document to open it.
          </>
        ) : (
          "Type what to search for and press Enter."
        )}
      </div>
      <div className="list-pane">
        <NotesView
          viewKey="search"
          docs={hits}
          getId={(h) => h.key}
          columns={columns}
          defaultSort={{ col: "score", dir: -1 }}
          categorize={(h) => h.db}
          caret={caret}
          onCaret={(k) => setCaret(k)}
          checked={checked}
          onChecked={setChecked}
          onOpen={open}
          emptyText={query.trim() ? "No documents matched your search." : "No search yet."}
          autoFocus
          noMargin
        />
      </div>
    </div>
  );
}
