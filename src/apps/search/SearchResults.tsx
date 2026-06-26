// ============================================================================
// Global search results — searches every Notes database (mail, calendar,
// contacts, to-do, notebook, discussion) for the current query and lists the
// hits grouped by application. Clicking a hit opens that application.
// ============================================================================

import { useMemo } from "react";
import { useNotes } from "../../data/store";
import { useUI, VIEWS } from "../../data/ui";
import type { ViewId } from "../../data/ui";
import { fmtDate, fmtListDate } from "../../lib/format";
import "../../styles/search.css";

interface Hit {
  app: ViewId;
  title: string;
  snippet: string;
  meta: string;
}

function snippetAround(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return text.slice(0, 90);
  const start = Math.max(0, i - 30);
  return (start > 0 ? "…" : "") + text.slice(start, start + 90).trim() + "…";
}

export default function SearchResults() {
  const store = useNotes();
  const query = useUI((s) => s.searchQuery);
  const openView = useUI((s) => s.openView);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Hit[] = [];
    const has = (...parts: (string | undefined)[]) =>
      parts.some((p) => (p ?? "").toLowerCase().includes(q));

    for (const m of store.mail) {
      if (has(m.subject, m.body, m.from.name, ...m.to.map((p) => p.name)))
        out.push({ app: "mail", title: m.subject, snippet: snippetAround(m.body, q), meta: `${m.from.name} · ${fmtListDate(m.date)}` });
    }
    for (const e of store.calendar) {
      if (has(e.subject, e.location, e.description))
        out.push({ app: "calendar", title: e.subject, snippet: e.description || e.location, meta: fmtDate(e.start) });
    }
    for (const c of store.contacts) {
      if (has(c.firstName, c.lastName, c.email, c.company, c.title))
        out.push({ app: "contacts", title: `${c.firstName} ${c.lastName}`.trim(), snippet: `${c.title}${c.title && c.company ? ", " : ""}${c.company}`, meta: c.email });
    }
    for (const t of store.todos) {
      if (has(t.subject, t.description, t.category))
        out.push({ app: "todo", title: t.subject, snippet: t.description, meta: t.due ? `Due ${fmtDate(t.due)}` : t.status });
    }
    for (const j of store.journal) {
      if (has(j.subject, j.body, j.category))
        out.push({ app: "journal", title: j.subject, snippet: snippetAround(j.body, q), meta: fmtListDate(j.modified) });
    }
    for (const p of store.discussion) {
      if (has(p.subject, p.body, p.author.name))
        out.push({ app: "discussion", title: p.subject, snippet: snippetAround(p.body, q), meta: `${p.author.name} · ${fmtListDate(p.date)}` });
    }
    return out;
  }, [store, query]);

  const byApp = useMemo(() => {
    const map = new Map<ViewId, Hit[]>();
    for (const h of hits) {
      const arr = map.get(h.app) ?? [];
      arr.push(h);
      map.set(h.app, arr);
    }
    return [...map.entries()];
  }, [hits]);

  return (
    <div className="app search-app">
      <div className="search-head">
        <span className="search-head-icon">🔍</span>
        <span>
          {query.trim() ? (
            <>
              <b>{hits.length}</b> result{hits.length === 1 ? "" : "s"} for “<b>{query}</b>” across all databases
            </>
          ) : (
            "Type a query in the toolbar search box and press Enter."
          )}
        </span>
      </div>
      <div className="search-body">
        {query.trim() && hits.length === 0 && (
          <div className="view-empty">No documents matched your search.</div>
        )}
        {byApp.map(([app, list]) => (
          <section key={app} className="search-group">
            <header className="search-group-head" style={{ borderColor: VIEWS[app].color }}>
              <span className="search-group-icon" style={{ background: VIEWS[app].color }}>
                {VIEWS[app].icon}
              </span>
              {VIEWS[app].title}
              <span className="search-group-count">({list.length})</span>
            </header>
            {list.map((h, i) => (
              <div key={i} className="search-hit" onClick={() => openView(h.app)}>
                <div className="search-hit-title">{h.title || "(No subject)"}</div>
                {h.snippet && <div className="search-hit-snippet">{h.snippet}</div>}
                <div className="search-hit-meta">{h.meta}</div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
