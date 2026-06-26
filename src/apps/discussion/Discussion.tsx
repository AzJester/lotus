// ============================================================================
// Discussion — the threaded team discussion database. Three-pane layout
// (view navigator · threaded topic tree · reading pane) plus an inline compose
// pane for new topics and replies. Follows the Mail module's structure: it
// reads/writes the shared store, composes the shared UI primitives, and uses
// the shared layout classes (.app, .action-bar, .app-cols, .nav-pane, etc).
// ============================================================================

import { useMemo, useState } from "react";
import { useNotes, uid } from "../../data/store";
import { useUI } from "../../data/ui";
import type { DiscussionPost } from "../../data/types";
import {
  ActionBar,
  ActionButton,
  ActionSep,
  ActionSpacer,
  Twistie,
} from "../../components/ui";
import { fmtListDate, fmtDateTime } from "../../lib/format";
import "../../styles/discussion.css";

type NavKey = "all" | "by-category" | string; // "cat:<name>" for a category filter

interface Compose {
  mode: "topic" | "reply";
  parentId: string | null;
  topicId: string | null; // null until the post is created (a topic uses its own id)
  subject: string;
  category: string;
  body: string;
}

// A node in the rendered thread tree.
interface ThreadNode {
  post: DiscussionPost;
  depth: number;
  children: ThreadNode[];
}

function stripRe(subject: string): string {
  return subject.replace(/^(\s*RE:\s*)+/i, "").trim();
}

// Whether `id` is a descendant of `ancestorId` within the post list.
function isDescendant(posts: DiscussionPost[], id: string, ancestorId: string): boolean {
  const byId = new Map(posts.map((p) => [p.id, p]));
  let cur = byId.get(id);
  while (cur && cur.parentId) {
    if (cur.parentId === ancestorId) return true;
    cur = byId.get(cur.parentId);
  }
  return false;
}

export default function Discussion() {
  const { discussion, user, addPost, deletePost } = useNotes();
  const setStatus = useUI((s) => s.setStatus);

  const [nav, setNav] = useState<NavKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState<Compose | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const selected = discussion.find((p) => p.id === selectedId) ?? null;

  // Distinct categories, alphabetically, for the navigator.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of discussion) if (p.category) set.add(p.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [discussion]);

  // Posts after applying the search filter and the active category filter.
  const filtered = useMemo(() => {
    let list = discussion;
    if (nav.startsWith("cat:")) {
      const cat = nav.slice(4);
      list = list.filter((p) => p.category === cat);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.subject.toLowerCase().includes(q) ||
          p.body.toLowerCase().includes(q) ||
          p.author.name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [discussion, nav, search]);

  // Build the threaded tree. When filtering (search or category), a post that
  // matches pulls in its ancestors so the thread stays navigable.
  const tree = useMemo(() => {
    const byId = new Map(discussion.map((p) => [p.id, p]));
    const keep = new Set(filtered.map((p) => p.id));
    if (search.trim() || nav.startsWith("cat:")) {
      for (const p of filtered) {
        let cur: DiscussionPost | undefined = p;
        while (cur && cur.parentId) {
          const parent = byId.get(cur.parentId);
          if (!parent || keep.has(parent.id)) break;
          keep.add(parent.id);
          cur = parent;
        }
      }
    }
    const visible = discussion.filter((p) => keep.has(p.id));

    // Recursively assemble a node and its descendants (children sorted asc).
    const build = (post: DiscussionPost, depth: number): ThreadNode => {
      const kids = visible
        .filter((p) => p.parentId === post.id)
        .sort((a, b) => a.date - b.date)
        .map((c) => build(c, depth + 1));
      return { post, depth, children: kids };
    };

    const roots = visible
      .filter((p) => p.parentId === null)
      .map((p) => build(p, 0));

    // Most-recent-activity per thread, descending.
    const latest = (node: ThreadNode): number => {
      let max = node.post.date;
      for (const c of node.children) max = Math.max(max, latest(c));
      return max;
    };
    roots.sort((a, b) => latest(b) - latest(a));
    return roots;
  }, [discussion, filtered, search, nav]);

  // Flatten the tree to a row list, honouring collapsed subtrees.
  const rows = useMemo(() => {
    const out: ThreadNode[] = [];
    const walk = (nodes: ThreadNode[]) => {
      for (const n of nodes) {
        out.push(n);
        if (n.children.length && !collapsed.has(n.post.id)) walk(n.children);
      }
    };
    walk(tree);
    return out;
  }, [tree, collapsed]);

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // --- compose helpers ----------------------------------------------------
  function newTopic() {
    setSelectedId(null);
    setCompose({
      mode: "topic",
      parentId: null,
      topicId: null,
      subject: "",
      category: categories[0] ?? "General",
      body: "",
    });
  }

  function reply() {
    if (!selected) return;
    setCompose({
      mode: "reply",
      parentId: selected.id,
      topicId: selected.topicId,
      subject: `RE: ${stripRe(selected.subject)}`,
      category: selected.category,
      body: "",
    });
  }

  function doPost() {
    if (!compose) return;
    const id = uid();
    const post: DiscussionPost = {
      id,
      parentId: compose.parentId,
      topicId: compose.mode === "topic" ? id : (compose.topicId as string),
      subject: compose.subject.trim() || "(Untitled)",
      author: { name: user.name, email: user.email },
      body: compose.body,
      category: compose.category.trim() || "General",
      date: Date.now(),
    };
    addPost(post);
    setCompose(null);
    setSelectedId(post.id);
    // Ensure a freshly posted reply is visible (expand its parent if collapsed).
    if (post.parentId) {
      setCollapsed((prev) => {
        if (!prev.has(post.parentId as string)) return prev;
        const next = new Set(prev);
        next.delete(post.parentId as string);
        return next;
      });
    }
    setStatus(compose.mode === "topic" ? "New topic posted." : "Reply posted.");
  }

  function del() {
    if (!selected) return;
    const replyCount = discussion.filter(
      (p) => p.id !== selected.id && isDescendant(discussion, p.id, selected.id),
    ).length;
    const note =
      replyCount > 0
        ? `Delete "${stripRe(selected.subject)}" and its ${replyCount} repl${replyCount === 1 ? "y" : "ies"}?`
        : `Delete "${stripRe(selected.subject)}"?`;
    if (!confirm(note)) return;
    deletePost(selected.id);
    setSelectedId(null);
    setStatus("Document deleted.");
  }

  // --- render -------------------------------------------------------------
  return (
    <div className="app discussion-app">
      <ActionBar>
        <ActionButton icon="📝" label="New Topic" onClick={newTopic} />
        <ActionSep />
        <ActionButton icon="↩️" label="Reply" onClick={reply} disabled={!selected} />
        <ActionButton icon="🗑️" label="Delete" onClick={del} disabled={!selected} />
        <ActionSpacer />
        <div className="action-search">
          <input
            type="search"
            placeholder="Search Discussion…"
            className="bevel-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </ActionBar>

      <div className="app-cols">
        {/* Navigator */}
        <div className="nav-pane">
          <div className="nav-title">Acme Team Discussion</div>
          <div className="nav-group">
            <div
              className={"nav-item" + (nav === "all" ? " active" : "")}
              onClick={() => {
                setNav("all");
                setSelectedId(null);
                setCompose(null);
              }}
            >
              <span className="nav-ic">🧵</span>
              <span className="nav-label">All Topics</span>
            </div>
            <div
              className={"nav-item" + (nav === "by-category" ? " active" : "")}
              onClick={() => {
                setNav("by-category");
                setSelectedId(null);
                setCompose(null);
              }}
            >
              <span className="nav-ic">🗂️</span>
              <span className="nav-label">By Category</span>
            </div>
          </div>

          <div className="nav-group nav-sub">
            {categories.length === 0 && (
              <div className="nav-item muted">
                <span className="nav-label">No categories</span>
              </div>
            )}
            {categories.map((cat) => (
              <div
                key={cat}
                className={"nav-item" + (nav === "cat:" + cat ? " active" : "")}
                onClick={() => {
                  setNav("cat:" + cat);
                  setSelectedId(null);
                  setCompose(null);
                }}
              >
                <span className="nav-ic">🏷️</span>
                <span className="nav-label">{cat}</span>
                <span className="nav-count">
                  {discussion.filter((p) => p.category === cat).length}
                </span>
              </div>
            ))}
          </div>
        </div>

        {compose ? (
          <ComposeForm
            compose={compose}
            setCompose={setCompose}
            categories={categories}
            onPost={doPost}
            onCancel={() => setCompose(null)}
          />
        ) : (
          <>
            {/* Threaded topic list */}
            <div className="list-pane disc-list">
              <div className="view">
                <div className="view-head">
                  <div className="col" style={{ flex: 1 }}>Topic</div>
                  <div className="col" style={{ flex: "0 0 130px" }}>Author</div>
                  <div className="col" style={{ flex: "0 0 96px" }}>Date</div>
                </div>
                <div className="view-body">
                  {rows.length === 0 && (
                    <div className="view-empty">No documents in this view.</div>
                  )}
                  {rows.map((node) => {
                    const p = node.post;
                    const hasKids = node.children.length > 0;
                    const open = !collapsed.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className={"view-row" + (p.id === selectedId ? " selected" : "")}
                        onClick={() => setSelectedId(p.id)}
                      >
                        <div className="col" style={{ flex: 1 }}>
                          <span
                            className="disc-indent"
                            style={{ width: node.depth * 16 }}
                          />
                          {hasKids ? (
                            <span
                              className="disc-twistie"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCollapse(p.id);
                              }}
                            >
                              <Twistie open={open} />
                            </span>
                          ) : (
                            <span className="disc-twistie disc-leaf">·</span>
                          )}
                          <span className="disc-subject">{p.subject}</span>
                        </div>
                        <div className="col" style={{ flex: "0 0 130px" }}>
                          {p.author.name}
                        </div>
                        <div className="col" style={{ flex: "0 0 96px" }}>
                          {fmtListDate(p.date)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Reading pane */}
            <div className="preview-pane">
              {selected ? (
                <PostReader post={selected} onReply={reply} onDelete={del} />
              ) : (
                <div className="preview-empty">Select a post to read it.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// --- Reading pane -----------------------------------------------------------
function PostReader({
  post,
  onReply,
  onDelete,
}: {
  post: DiscussionPost;
  onReply: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="form disc-reader">
      <div className="disc-head">
        <div className="disc-headlines">
          <div className="disc-subject-title">{post.subject}</div>
          <div className="disc-line">
            <b>{post.author.name}</b>{" "}
            <span className="muted">&lt;{post.author.email}&gt;</span>
          </div>
          <div className="disc-line muted">{fmtDateTime(post.date)}</div>
          <div className="disc-line">
            <span className="tag">{post.category}</span>
            {post.parentId === null && <span className="muted disc-roottag"> · Topic</span>}
          </div>
        </div>
        <div className="disc-head-actions">
          <button className="btn" onClick={onReply}>↩️ Reply</button>
          <button className="btn" onClick={onDelete}>🗑️ Delete</button>
        </div>
      </div>
      <div className="memo-body disc-body">{post.body}</div>
    </div>
  );
}

// --- Compose form -----------------------------------------------------------
function ComposeForm({
  compose,
  setCompose,
  categories,
  onPost,
  onCancel,
}: {
  compose: Compose;
  setCompose: (c: Compose) => void;
  categories: string[];
  onPost: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<Compose>) => setCompose({ ...compose, ...patch });
  // Offer the known categories plus whatever the user has typed.
  const catOptions =
    !compose.category || categories.includes(compose.category)
      ? categories
      : [compose.category, ...categories];
  return (
    <div className="compose-pane">
      <div className="compose-actions">
        <button className="btn primary" onClick={onPost}>📨 Post</button>
        <span style={{ flex: 1 }} />
        <span className="muted disc-compose-mode">
          {compose.mode === "topic" ? "New Topic" : "Reply"}
        </span>
        <button className="btn" onClick={onCancel}>✕ Cancel</button>
      </div>
      <div className="compose-fields">
        <div className="cf-row">
          <label>Subject</label>
          <input
            type="text"
            value={compose.subject}
            autoFocus
            onChange={(e) => set({ subject: e.target.value })}
          />
        </div>
        <div className="cf-row">
          <label>Category</label>
          <input
            type="text"
            list="disc-cat-list"
            value={compose.category}
            placeholder="General"
            onChange={(e) => set({ category: e.target.value })}
          />
          <datalist id="disc-cat-list">
            {catOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>
      <textarea
        className="memo-body compose-body"
        value={compose.body}
        onChange={(e) => set({ body: e.target.value })}
        placeholder="Type your message…"
      />
    </div>
  );
}
