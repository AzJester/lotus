// ============================================================================
// Lotus Notes Help (help.nsf) and the Help > About / Using This Database
// documents. The database opens on its Contents view (topics categorized by
// subject) with an Index view and a full-text Search view in the navigator;
// topics open in their own window, and a bold reference to another topic's
// title works as a link to it.
// ============================================================================

import { Fragment, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ActionBar } from "../../components/ActionBar";
import type { ActionItem } from "../../components/ActionBar";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { NotesView } from "../../components/NotesView";
import type { ViewColumn } from "../../components/NotesView";
import { Splitter } from "../../components/Splitter";
import { useTab, useTabCommands } from "../../components/tabs";
import { useUI } from "../../data/ui";
import { ABOUT_DOCS, HELP_TOPICS } from "../../data/helpContent";
import type { HelpDbKey, HelpDoc } from "../../data/helpContent";
import "../../styles/help.css";

// ---------------------------------------------------------------------------
// The documents
// ---------------------------------------------------------------------------

const TOPIC_CATEGORY: Record<string, string> = {
  "help-getting-around": "Getting Started",
  "help-keyboard": "Getting Started",
  "help-views": "Getting Started",
  "help-mail-basics": "Mail",
  "help-addressing": "Mail",
  "help-delivery-options": "Mail",
  "help-out-of-office": "Mail",
  "help-calendar": "Calendar and Scheduling",
  "help-replication": "Replication and Mobile Users",
  "help-locations": "Replication and Mobile Users",
  "help-deleting": "Working with Documents",
  "help-doclinks": "Working with Documents",
  "help-properties": "Working with Documents",
  "help-id-password": "Security",
  "help-discussion": "Databases",
  "help-templates": "Databases",
};

const CATEGORY_ORDER = [
  "Getting Started",
  "Mail",
  "Calendar and Scheduling",
  "Working with Documents",
  "Replication and Mobile Users",
  "Databases",
  "Security",
  "About the Standard Templates",
];

const DB_LABEL: Record<HelpDbKey, string> = {
  mail: "Mail",
  calendar: "Calendar",
  todo: "To Do",
  addressbook: "Personal Address Book",
  journal: "Personal Journal",
  discussion: "Discussion",
  directory: "Domino Directory",
  help: "Lotus Notes Help",
  outbox: "Outgoing Mail",
};

export interface HelpEntry extends HelpDoc {
  category: string;
}

export const HELP_ENTRIES: HelpEntry[] = [
  ...HELP_TOPICS.map((d) => ({ ...d, category: TOPIC_CATEGORY[d.id] ?? "Other Topics" })),
  ...(Object.keys(ABOUT_DOCS) as HelpDbKey[]).flatMap((k) => [
    { ...ABOUT_DOCS[k].about, category: `About the Standard Templates\\${DB_LABEL[k]}` },
    { ...ABOUT_DOCS[k].using, category: `About the Standard Templates\\${DB_LABEL[k]}` },
  ]),
];

export function findHelpDoc(id: string): HelpEntry | undefined {
  return HELP_ENTRIES.find((d) => d.id === id);
}

const byTitle = new Map(HELP_ENTRIES.map((d) => [d.title.toLowerCase(), d]));

export function openHelpTopic(id: string) {
  const d = findHelpDoc(id);
  if (!d) return;
  useUI.getState().openDocument({ coll: "help", id }, { title: d.title });
}

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------

function inline(text: string, key: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      const label = p.slice(2, -2);
      const target = byTitle.get(label.toLowerCase());
      if (target)
        return (
          <a
            key={`${key}-${i}`}
            href={`#${target.id}`}
            className="help-link"
            title={`Open "${target.title}"`}
            onClick={(e) => {
              e.preventDefault();
              openHelpTopic(target.id);
            }}
          >
            {label}
          </a>
        );
      return <b key={`${key}-${i}`}>{label}</b>;
    }
    return <Fragment key={`${key}-${i}`}>{p}</Fragment>;
  });
}

/** Render help markup: paragraphs, "## " headings, "- " bullets, "a | b" tables, **bold**. */
export function HelpBody({ body }: { body: string }) {
  const blocks: ReactNode[] = [];
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const k = `b${i}`;
    if (line.startsWith("## ")) {
      blocks.push(<h2 key={k}>{inline(line.slice(3), k)}</h2>);
      i++;
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2));
      blocks.push(
        <ul key={k}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, `${k}-${j}`)}</li>
          ))}
        </ul>,
      );
    } else if (line.includes(" | ")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes(" | ")) rows.push(lines[i++].split(" | ").map((c) => c.trim()));
      const [head, ...rest] = rows;
      blocks.push(
        <table key={k} className="help-table">
          <thead>
            <tr>
              {head.map((c, j) => (
                <th key={j}>{inline(c, `${k}-h${j}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rest.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, j) => (
                  <td key={j}>{inline(c, `${k}-${ri}-${j}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !lines[i].startsWith("## ") && !lines[i].startsWith("- ") && !lines[i].includes(" | "))
        para.push(lines[i++]);
      blocks.push(
        <p key={k}>
          {para.map((t, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {inline(t, `${k}-${j}`)}
            </Fragment>
          ))}
        </p>,
      );
    }
  }
  return <div className="help-body">{blocks}</div>;
}

// ---------------------------------------------------------------------------
// The Help view
// ---------------------------------------------------------------------------

type HelpNav = "contents" | "index" | "search";

const NAV: { key: HelpNav; label: string; icon: IconName }[] = [
  { key: "contents", label: "Contents", icon: "help" },
  { key: "index", label: "Index", icon: "by-name" },
  { key: "search", label: "Search", icon: "search" },
];

const categoryOrder = (a: string, b: string) => {
  const ia = CATEGORY_ORDER.indexOf(a);
  const ib = CATEGORY_ORDER.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a.localeCompare(b);
};

export default function Help() {
  const [nav, setNav] = useState<HelpNav>("contents");
  const [caret, setCaret] = useState<string | null>(null);
  const [sel, setSel] = useState<HelpEntry | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const setStatus = useUI((s) => s.setStatus);

  const docs = useMemo(() => {
    if (nav !== "search" || !applied) return nav === "search" ? [] : HELP_ENTRIES;
    const q = applied.toLowerCase();
    return HELP_ENTRIES.filter((d) => d.title.toLowerCase().includes(q) || d.body.toLowerCase().includes(q));
  }, [nav, applied]);

  const columns: ViewColumn<HelpEntry>[] = useMemo(
    () => [
      {
        id: "title",
        title: nav === "index" ? "Index" : nav === "search" ? "Topics found" : "Contents",
        flex: true,
        sortable: nav === "index",
        sortValue: (d) => d.title.toLowerCase(),
        text: (d) => d.title,
        render: (d) => (
          <span className="help-row">
            <Icon name="note" /> {d.title}
          </span>
        ),
      },
    ],
    [nav],
  );

  const open = (d: HelpEntry) => openHelpTopic(d.id);

  const actions: ActionItem[] = [
    { id: "open", label: "Open Topic", icon: "open", disabled: !sel, run: () => sel && open(sel) },
    "sep",
    { id: "print", label: "Print", icon: "print", disabled: !sel, run: () => window.print() },
  ];

  useTabCommands("help", {
    refresh: () => setStatus("View refreshed."),
    searchBar: () => setNav("search"),
  });

  return (
    <div className="app help-app">
      <ActionBar actions={actions} />
      <div className="app-cols">
        <div className="nav-pane help-nav">
          <div className="nav-title">
            <span>Lotus Notes Help</span>
          </div>
          <div className="nav-group">
            {NAV.map((n) => (
              <div
                key={n.key}
                className={"nav-item" + (nav === n.key ? " active" : "")}
                onClick={() => {
                  setNav(n.key);
                  setCaret(null);
                  setSel(null);
                }}
              >
                <span className="nav-ic">
                  <Icon name={n.icon} />
                </span>
                <span className="nav-label">{n.label}</span>
              </div>
            ))}
          </div>
        </div>
        <Splitter id="help.nav" />
        <div className="help-stack">
          <div className="list-pane">
            {nav === "search" && (
              <div className="search-bar">
                <label>Search for:</label>
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setApplied(query.trim());
                  }}
                />
                <button className="btn" onClick={() => setApplied(query.trim())}>
                  Search
                </button>
                {applied && (
                  <span className="search-result">
                    {docs.length} topic{docs.length === 1 ? "" : "s"} found
                  </span>
                )}
              </div>
            )}
            <NotesView
              viewKey={`help-${nav}`}
              docs={docs}
              getId={(d) => d.id}
              columns={columns}
              defaultSort={nav === "index" ? { col: "title", dir: 1 } : undefined}
              categorize={nav === "contents" ? (d) => d.category : undefined}
              categoryOrder={nav === "contents" ? categoryOrder : undefined}
              caret={caret}
              onCaret={(k, d) => {
                setCaret(k);
                setSel(d);
              }}
              checked={checked}
              onChecked={setChecked}
              onOpen={open}
              emptyText={nav === "search" ? "Type a word or phrase and click Search." : "No topics."}
              autoFocus
              noMargin
            />
          </div>
          <Splitter vertical id="help.preview" />
          <div className="preview-pane help-preview">
            {sel ? (
              <div className="help-doc compact">
                <h1>{sel.title}</h1>
                <HelpBody body={sel.body} />
              </div>
            ) : (
              <div className="preview-empty">Select a topic to read it here, or press Enter to open it.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A help topic in its own window
// ---------------------------------------------------------------------------

export function HelpDocument() {
  const { tab } = useTab();
  const id = tab.doc?.id ?? "";
  const doc = findHelpDoc(id);
  const openView = useUI((s) => s.openView);
  const idx = HELP_ENTRIES.findIndex((d) => d.id === id);
  const prev = idx > 0 ? HELP_ENTRIES[idx - 1] : undefined;
  const next = idx >= 0 && idx < HELP_ENTRIES.length - 1 ? HELP_ENTRIES[idx + 1] : undefined;
  const retarget = (d: HelpEntry) => {
    const ui = useUI.getState();
    ui.retargetTab(tab.id, { coll: "help", id: d.id });
    ui.setTabTitle(`doc:help:${d.id}`, d.title);
  };

  const actions: ActionItem[] = [
    { id: "contents", label: "Contents", icon: "help", run: () => openView("help") },
    "sep",
    { id: "prev", label: "Previous", icon: "back", disabled: !prev, run: () => prev && retarget(prev) },
    { id: "next", label: "Next", icon: "forward", disabled: !next, run: () => next && retarget(next) },
    "sep",
    { id: "print", label: "Print", icon: "print", run: () => window.print() },
  ];

  if (!doc)
    return (
      <div className="app help-app">
        <div className="doc-missing">The document could not be found. It may have been deleted.</div>
      </div>
    );

  return (
    <div className="app help-app">
      <ActionBar actions={actions} />
      <div className="doc-scroll">
        <div className="help-doc">
          <div className="help-band">
            <Icon name="help" /> {doc.category.replace("\\", " > ")}
          </div>
          <h1>{doc.title}</h1>
          <HelpBody body={doc.body} />
        </div>
      </div>
    </div>
  );
}
