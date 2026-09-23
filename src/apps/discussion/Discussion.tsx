// ============================================================================
// Discussion: a discussion database (the team discussion, whose replica
// replicates with Apps01/Acme, and any discussion made from the template; the
// window's `db` picks which). The navigator offers All Documents (main topics
// with their responses indented under twisties, newest topics first), By
// Category, By Author and My Documents; the preview pane shows the selected
// post. Colleagues' posts arrive by replication and show unread (red, with
// the star) until you read them. Delete marks your posts with the trash can,
// and F9 or leaving the view asks before deleting them; deleting a main topic
// deletes its responses too.
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
import { getTabCommands, useTab, useTabCommands } from "../../components/tabs";
import { useNotes } from "../../data/store";
import { registerCloseGuard, useUI } from "../../data/ui";
import type { DiscussionPost } from "../../data/types";
import { commonName } from "../../data/names";
import { fmtListDate } from "../../lib/format";
import { openDocumentProperties } from "../../shell/dialogs/Properties";
import { DRAG_DOC } from "../../shell/BookmarkBar";
import { caretCategory, categoryLabels } from "../journal/journalHelpers";
import { openInEditMode } from "../journal/openInEdit";
import {
  deletionSet,
  discussionDb,
  DISCUSSION_DB,
  inDiscussionDb,
  isAuthor,
  markedDeletionQuestion,
  matchesPost,
  notAuthorMessage,
  parentOfPost,
  postTitle,
  responseCounts,
  threadSortValue,
} from "./discHelpers";
import { copyPostLink, newResponse, openPost, PostReader } from "./PostDoc";
import { useDiscussionUnread, useUnreadCheck } from "./unread";
import "../../styles/discussion.css";

type NavKey = "all" | "category" | "author" | "mine";

const NAV: { key: NavKey; label: string; icon: IconName }[] = [
  { key: "all", label: "All Documents", icon: "all-documents" },
  { key: "category", label: "By Category", icon: "tag" },
  { key: "author", label: "By Author", icon: "by-author" },
  { key: "mine", label: "My Documents", icon: "person" },
];

/** Views that show the response hierarchy (the others list posts flat). */
const THREADED: NavKey[] = ["all", "category"];

// Stable view callbacks (NotesView rebuilds its rows when they change).
const idOf = (p: DiscussionPost) => p.id;
const byCategory = (p: DiscussionPost) => categoryLabels(p.category);
const byAuthor = (p: DiscussionPost) => commonName(p.author);

const docs = (n: number) => `${n} document${n === 1 ? "" : "s"}`;

function TopicCell({ p, responses }: { p: DiscussionPost; responses?: number }) {
  return (
    <span className={"disc-topic" + (p.parentId || p.conflictOf ? " response" : " main")}>
      {p.conflictOf && <Icon name="conflict" />}
      <span className="disc-topic-text">{p.conflictOf ? "[Replication or Save Conflict]" : postTitle(p)}</span>
      {!p.parentId && !p.conflictOf && !!responses && (
        <span className="disc-count">
          ({responses} response{responses === 1 ? "" : "s"})
        </span>
      )}
    </span>
  );
}

function threadColumns(counts: Map<string, number>): ViewColumn<DiscussionPost>[] {
  return [
    {
      id: "topic",
      title: "Topic",
      flex: true,
      minWidth: 260,
      indent: true,
      // Fixed view sort: newest main topics first, each thread in the order written.
      sortValue: threadSortValue,
      text: (p) => postTitle(p),
      render: (p) => <TopicCell p={p} responses={counts.get(p.id)} />,
    },
    { id: "author", title: "Author", width: 150, render: (p) => commonName(p.author) },
    { id: "date", title: "Date", width: 96, render: (p) => fmtListDate(p.date) },
  ];
}

function flatColumns(withCategory: boolean): ViewColumn<DiscussionPost>[] {
  const cols: ViewColumn<DiscussionPost>[] = [
    { id: "date", title: "Date", width: 96, sortable: true, sortValue: (p) => p.date, render: (p) => fmtListDate(p.date) },
    {
      id: "topic",
      title: "Subject",
      flex: true,
      minWidth: 240,
      sortable: true,
      sortValue: (p) => postTitle(p).toLowerCase(),
      text: (p) => postTitle(p),
      render: (p) => (
        <span className="disc-topic flat">
          <Icon name={p.parentId ? "response" : "topic"} />
          <span className="disc-topic-text">{postTitle(p)}</span>
        </span>
      ),
    },
  ];
  if (withCategory) {
    cols.push({
      id: "category",
      title: "Category",
      width: 140,
      sortable: true,
      sortValue: (p) => p.category.toLowerCase(),
      render: (p) => p.category,
    });
  }
  return cols;
}

export default function Discussion() {
  const { tab, active } = useTab();
  const db = discussionDb(tab.db);
  const discussion = useNotes((s) => s.discussion);
  const user = useNotes((s) => s.user);
  const dbInfo = useNotes((s) => s.databases.find((d) => d.id === (db ?? DISCUSSION_DB)));
  const deletePost = useNotes((s) => s.deletePost);
  const setStatus = useUI((s) => s.setStatus);
  const setTabTitle = useUI((s) => s.setTabTitle);
  const newDocument = useUI((s) => s.newDocument);
  const preview = useUI((s) => s.uiPrefs.preview);
  const markRead = useDiscussionUnread((s) => s.markRead);
  const markUnread = useDiscussionUnread((s) => s.markUnread);
  const isUnread = useUnreadCheck();

  const [nav, setNav] = useState<NavKey>("all");
  const viewKey = `discussion-${nav}${db ? "@" + db : ""}`;
  const [caret, setCaret] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");

  // A discussion made from the template is titled after its database.
  useEffect(() => {
    if (db && dbInfo) setTabTitle(tab.id, dbInfo.title);
  }, [db, dbInfo, tab.id, setTabTitle]);

  const inDb = useMemo(() => discussion.filter((p) => inDiscussionDb(p, db)), [discussion, db]);
  const counts = useMemo(() => responseCounts(inDb), [inDb]);
  const shown = useMemo(() => {
    let list = nav === "mine" ? inDb.filter((p) => isAuthor(p, user)) : inDb;
    if (applied) list = list.filter((p) => matchesPost(p, applied));
    return list;
  }, [inDb, nav, user, applied]);
  const selected = inDb.find((p) => p.id === selectedId) ?? null;
  const selection = useCallback(
    () => (checked.size ? [...checked] : selectedId ? [selectedId] : []),
    [checked, selectedId],
  );
  const unreadTotal = inDb.filter(isUnread).length;
  const threaded = THREADED.includes(nav);

  // Previewing a post reads it.
  const selectedUnread = !!selected && isUnread(selected);
  useEffect(() => {
    if (active && preview !== "off" && selected && selectedUnread) markRead([selected]);
  }, [active, preview, selected, selectedUnread, markRead]);

  const toggleUnread = (p: DiscussionPost) => {
    if (isAuthor(p, user)) return;
    if (isUnread(p)) markRead([p]);
    else markUnread([p.id]);
    setStatus(isUnread(p) ? "Marked read." : "Marked unread.");
  };

  const markReadCmd = (read: boolean, scope: "selected" | "all") => {
    const ids = new Set(scope === "all" ? shown.map((p) => p.id) : selection());
    // Your own posts are never unread.
    const list = inDb.filter((p) => ids.has(p.id) && !isAuthor(p, user));
    if (read) markRead(list);
    else markUnread(list.map((p) => p.id));
    setStatus(`${docs(list.length)} marked ${read ? "read" : "unread"}.`);
  };

  // ---- deletion marks (only your own posts) ----------------------------------------
  const markForDeletion = (ids: string[]) => {
    if (!ids.length) return;
    const posts = inDb.filter((p) => ids.includes(p.id));
    const allowed = posts.filter((p) => isAuthor(p, user)).map((p) => p.id);
    const refused = posts.length - allowed.length;
    if (!allowed.length) {
      setStatus(
        refused === 1
          ? "You are not authorized to delete that document. You can delete only documents you wrote."
          : `You are not authorized to delete those ${refused} documents. You can delete only documents you wrote.`,
      );
      return;
    }
    // Delete again on marked documents takes the marks off.
    const allMarked = allowed.every((id) => marked.has(id));
    const next = new Set(marked);
    for (const id of allowed) {
      if (allMarked) next.delete(id);
      else next.add(id);
    }
    setMarked(next);
    setChecked(new Set());
    setStatus(
      allMarked
        ? "Deletion mark removed."
        : `${docs(allowed.length)} marked for deletion. Press F9 to delete.` +
            (refused ? ` ${docs(refused)} written by others cannot be deleted.` : ""),
    );
  };

  /** F9 / leaving the view: ask, then delete what is marked. Resolves with how many went. */
  const processDeletions = async (): Promise<number> => {
    const all = useNotes.getState().discussion;
    const ids = [...marked].filter((id) => all.some((p) => p.id === id));
    if (!ids.length) {
      if (marked.size) setMarked(new Set());
      return 0;
    }
    const going = deletionSet(all, ids);
    const [question, note] = markedDeletionQuestion(ids.length, going.size - ids.length);
    const ok = await notesAsk(
      <>
        {question}
        {note && (
          <>
            <br />
            <br />
            {note}
          </>
        )}
      </>,
      { title: "Delete Documents" },
    );
    setMarked(new Set());
    if (!ok) return 0;
    for (const id of ids) if (useNotes.getState().discussion.some((p) => p.id === id)) deletePost(id);
    setStatus(`${docs(going.size)} deleted.`);
    if (selectedId && going.has(selectedId)) setSelectedId(null);
    return going.size;
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
    // The same post stays current in the other view.
    setCaret(selectedId);
    setChecked(new Set());
  };

  // Closing the window with marked posts asks first, too.
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
  const newTopic = () => {
    // In By Category, a new topic starts in the category under the cursor.
    const category = nav === "category" ? caretCategory(caret) : undefined;
    newDocument("discussion", category ? { category } : {}, { title: "New Topic", db });
  };

  const editPost = (p: DiscussionPost) => {
    if (!isAuthor(p, user)) {
      setStatus(notAuthorMessage(dbInfo?.access));
      return;
    }
    openInEditMode("discussion", p.id, { title: postTitle(p), db });
  };

  useTabCommands("discussion", {
    refresh,
    deleteSelected: () => markForDeletion(selection()),
    properties: selected ? () => void openDocumentProperties("discussion", selected.id) : undefined,
    newDocument: selected ? () => newResponse(selected, false) : undefined,
    searchBar: () => setSearchOpen((o) => !o),
    copyAsLink: selected ? () => copyPostLink(selected) : undefined,
    markRead: markReadCmd,
    toggleEdit: selected ? () => editPost(selected) : undefined,
  });

  // ---- view ---------------------------------------------------------------------
  const columns = useMemo(
    () => (threaded ? threadColumns(counts) : flatColumns(nav === "mine")),
    [threaded, counts, nav],
  );

  const rowMenu = (p: DiscussionPost | null): MenuItem[] => {
    if (!p) return [{ label: "New &Main Topic", run: newTopic }];
    const ids = checked.has(p.id) ? [...checked] : [p.id];
    const mine = isAuthor(p, user);
    return [
      { label: "&Open", run: () => openPost(p) },
      ...(mine ? [{ label: "&Edit", accel: "Ctrl+E", run: () => editPost(p) }] : []),
      { sep: true },
      { label: "New &Response", run: () => newResponse(p, false) },
      { label: "New Response to Res&ponse", disabled: !p.parentId, run: () => newResponse(p, true) },
      { sep: true },
      ...(mine ? [] : [{ label: isUnread(p) ? "Mark Re&ad" : "Mark &Unread", accel: "Ins", run: () => toggleUnread(p) }]),
      { label: "Copy as &Link", children: [{ label: "&Document Link", run: () => copyPostLink(p) }] },
      { sep: true },
      { label: "&Delete", accel: "Del", disabled: !mine && !checked.size, run: () => markForDeletion(ids) },
      { label: "Document &Properties...", accel: "Alt+Enter", run: () => void openDocumentProperties("discussion", p.id) },
    ];
  };

  const ids = selection();
  const actions: ActionItem[] = [
    { id: "topic", label: "New Main Topic", icon: "topic-new", run: newTopic },
    {
      id: "response",
      label: "New Response",
      icon: "response-new",
      disabled: !selected,
      run: () => selected && newResponse(selected, false),
    },
    {
      id: "rr",
      label: "New Response to Response",
      icon: "thread",
      disabled: !selected?.parentId,
      run: () => selected && newResponse(selected, true),
    },
    "sep",
    { id: "delete", label: "Delete", icon: "trash", disabled: !ids.length, run: () => markForDeletion(ids), accel: "Del" },
    "sep",
    {
      id: "expand",
      label: "Expand All",
      icon: "expand-all",
      disabled: nav === "mine",
      run: () => getTabCommands(tab.id).expandAll?.(),
    },
    {
      id: "collapse",
      label: "Collapse All",
      icon: "collapse-all",
      disabled: nav === "mine",
      run: () => getTabCommands(tab.id).collapseAll?.(),
    },
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

  const replica = dbInfo?.serverReplica;
  return (
    <div className="app disc-app">
      <ActionBar actions={actions} />
      <div className="app-cols">
        <div className="nav-pane disc-nav">
          <div className="nav-title">
            <span>{dbInfo?.title ?? "Discussion"}</span>
            <span className="nav-sub-label">{replica ? `Replica of ${replica}` : `on ${dbInfo?.server ?? "Local"}`}</span>
          </div>
          <div className="nav-group">
            {NAV.map((n) => {
              const count = n.key === "all" ? unreadTotal : 0;
              return (
                <div key={n.key} className={"nav-item" + (nav === n.key ? " active" : "")} onClick={() => void goNav(n.key)}>
                  <span className="nav-ic">
                    <Icon name={n.icon} />
                  </span>
                  <span className={"nav-label" + (count > 0 ? " has-count" : "")}>
                    {n.label}
                    {count > 0 ? ` (${count})` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <Splitter id="discussion.nav" />

        {/* Keyed by placement: a pane size dragged for one layout must not leak into the other. */}
        <div key={preview} className={"disc-stack preview-" + preview}>
          <div className="list-pane disc-list">
            {searchBar}
            <NotesView
              viewKey={viewKey}
              docs={shown}
              getId={idOf}
              columns={columns}
              defaultSort={threaded ? { col: "topic", dir: -1 } : { col: "date", dir: -1 }}
              categorize={nav === "category" ? byCategory : nav === "author" ? byAuthor : undefined}
              parentOf={threaded ? parentOfPost : undefined}
              isUnread={isUnread}
              caret={caret}
              onCaret={(key, p) => {
                setCaret(key);
                setSelectedId(p ? p.id : null);
              }}
              checked={checked}
              onChecked={setChecked}
              marked={marked}
              onOpen={openPost}
              onToggleUnread={toggleUnread}
              onDelete={markForDeletion}
              onRefresh={refresh}
              onContextMenu={(e, p) => openContextMenu(e, rowMenu(p))}
              onDragStart={(e, p) => {
                e.dataTransfer.setData("text/plain", p.id);
                e.dataTransfer.setData(DRAG_DOC, JSON.stringify({ coll: "discussion", id: p.id, title: postTitle(p), db }));
                e.dataTransfer.effectAllowed = "copyMove";
              }}
              emptyText={
                applied
                  ? "No documents match your search."
                  : nav === "mine"
                    ? "You have not written any documents in this database."
                    : "There are no documents in this view."
              }
              autoFocus
            />
          </div>
          {preview !== "off" && (
            <>
              <Splitter vertical={preview === "bottom"} id={`discussion.preview.${preview}`} />
              <div className="preview-pane disc-preview">
                {selected ? (
                  <div className="disc-scroll">
                    <PostReader post={selected} compact />
                  </div>
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

export { PostDocument } from "./PostDoc";
