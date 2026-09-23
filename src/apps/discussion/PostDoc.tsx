// ============================================================================
// Discussion documents: the Main Topic, Response and Response to Response
// forms (the form follows the response hierarchy). Read mode shows the
// discussion header (subject, "by Author on Date", category and, for a
// response, the document it answers as a link) above the rich text body; the
// preview pane uses the same reader. Edit mode shows the document being
// answered above the Subject and Category fields. Only a post's author may
// edit or delete it; anyone may respond.
// ============================================================================

import { useEffect, useMemo, useRef } from "react";
import { ActionBar } from "../../components/ActionBar";
import type { ActionItem } from "../../components/ActionBar";
import { DocMissing, FieldTable, FormPage, TextRow, useDocWindow } from "../../components/docform";
import { notesAsk } from "../../components/dialogs";
import { Icon } from "../../components/Icon";
import { RichTextEditor, RichTextView } from "../../components/RichText";
import { useTab } from "../../components/tabs";
import { useNotes } from "../../data/store";
import { useUI } from "../../data/ui";
import type { DiscussionPost } from "../../data/types";
import { commonName } from "../../data/names";
import { textToHtml } from "../../lib/sanitize";
import { fmtDateTime } from "../../lib/format";
import { CategoriesRow } from "../journal/Categories";
import { allCategories, splitCategories } from "../journal/journalHelpers";
import { useEditRequests } from "../journal/openInEdit";
import {
  blankPost,
  deletePostQuestion,
  deletionSet,
  discussionDb,
  DISCUSSION_DB,
  formOf,
  inDiscussionDb,
  isAuthor,
  notAuthorMessage,
  postSaveFields,
  postTitle,
  threadRoot,
} from "./discHelpers";
import { useDiscussionUnread } from "./unread";
import "../../styles/discussion.css";

// ---------------------------------------------------------------------------
// Shared actions
// ---------------------------------------------------------------------------

export function openPost(p: DiscussionPost) {
  useUI.getState().openDocument({ coll: "discussion", id: p.id }, { title: postTitle(p), db: discussionDb(p.db) });
}

/**
 * Compose a response. New Response answers the main topic of the post's
 * thread; New Response to Response answers the post itself.
 */
export function newResponse(target: DiscussionPost, toResponse: boolean) {
  const byId = new Map(useNotes.getState().discussion.map((p) => [p.id, p]));
  const parent = toResponse ? target : threadRoot(target, byId);
  useUI.getState().newDocument("discussion", { parentId: parent.id }, { title: "New Response", db: discussionDb(parent.db) });
}

/** Edit > Copy as Link > Document Link. */
export function copyPostLink(p: DiscussionPost) {
  const ui = useUI.getState();
  ui.setClipboardLink({ coll: "discussion", id: p.id, db: discussionDb(p.db), title: postTitle(p) });
  ui.setStatus("Document link copied to the clipboard. Paste it into a rich text field.");
}

// ---------------------------------------------------------------------------
// Read mode
// ---------------------------------------------------------------------------

/** The post in read mode: the discussion header and the body. */
export function PostReader({ post, compact }: { post: DiscussionPost; compact?: boolean }) {
  const parent = useNotes((s) => (post.parentId ? s.discussion.find((p) => p.id === post.parentId) : undefined));
  const categories = splitCategories(post.category);
  return (
    <div className={"disc-read" + (compact ? " compact" : "")}>
      <div className="disc-head">
        <div className="disc-subject">
          {post.conflictOf && <Icon name="conflict" />}
          <span>{postTitle(post)}</span>
        </div>
        <div className="disc-byline">
          by <b>{commonName(post.author)}</b> on {fmtDateTime(post.date)}
        </div>
        {categories.length > 0 && !post.parentId && (
          <div className="disc-meta">
            <span className="disc-meta-label">Category:</span> {categories.join(", ")}
          </div>
        )}
        {post.parentId && (
          <div className="disc-meta disc-inresp">
            <span className="disc-meta-label">In response to:</span>{" "}
            {parent ? (
              <>
                <a
                  href="#"
                  className="disc-link"
                  title="Open the document this one responds to"
                  onClick={(e) => {
                    e.preventDefault();
                    openPost(parent);
                  }}
                >
                  {postTitle(parent)}
                </a>
                <span className="muted"> by {commonName(parent.author)}</span>
              </>
            ) : (
              <span className="muted">(the original document has been deleted)</span>
            )}
          </div>
        )}
        {post.conflictOf && <div className="disc-conflict">[Replication or Save Conflict]</div>}
      </div>
      <RichTextView className="disc-body" html={post.bodyHtml} text={post.bodyHtml ? undefined : post.body} />
    </div>
  );
}

/** Above the fields of a response being written: the document it answers. */
function ParentBlock({ parentId }: { parentId: string }) {
  const parent = useNotes((s) => s.discussion.find((p) => p.id === parentId));
  return (
    <div className="disc-parent">
      <span className="disc-parent-label">Response to:</span>
      {parent ? (
        <>
          <a
            href="#"
            className="disc-link"
            onClick={(e) => {
              e.preventDefault();
              openPost(parent);
            }}
          >
            {postTitle(parent)}
          </a>
          <span className="disc-parent-by">
            by {commonName(parent.author)} on {fmtDateTime(parent.date)}
          </span>
        </>
      ) : (
        <span className="muted">(the original document has been deleted)</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

export function PostDocument() {
  const { tab, active } = useTab();
  const id = tab.doc?.id ?? "";
  const doc = useNotes((s) => (tab.isNew ? undefined : s.discussion.find((p) => p.id === id)));
  const discussion = useNotes((s) => s.discussion);
  const user = useNotes((s) => s.user);
  const addPost = useNotes((s) => s.addPost);
  const updatePost = useNotes((s) => s.updatePost);
  const deletePost = useNotes((s) => s.deletePost);
  const markRead = useDiscussionUnread((s) => s.markRead);
  const db = discussionDb(doc?.db ?? tab.db);
  const access = useNotes((s) => s.databases.find((d) => d.id === (db ?? DISCUSSION_DB))?.access);
  const initParent = typeof tab.init?.parentId === "string" ? tab.init.parentId : undefined;

  const w = useDocWindow<DiscussionPost>({
    coll: "discussion",
    doc,
    blank: (init, newId) => {
      const s = useNotes.getState();
      const parent = initParent ? s.discussion.find((p) => p.id === initParent) : undefined;
      return blankPost(init, newId, { name: s.user.name, email: s.user.email }, parent, tab.db);
    },
    title: (d) => d.subject.trim() || (tab.isNew ? (d.parentId ? "New Response" : "New Topic") : "(Untitled)"),
    validate: (d) => (d.subject.trim() ? null : "You must enter a subject."),
    readOnly: (d) => (isAuthor(d, useNotes.getState().user) ? null : notAuthorMessage(access)),
    persist: (d, isNew) => {
      if (isNew) addPost({ ...d, ...postSaveFields(d), date: Date.now() });
      else updatePost(d.id, postSaveFields(d));
      useUI.getState().setStatus("Document saved.");
    },
    commands: {
      copyAsLink: doc ? () => copyPostLink(doc) : undefined,
      newDocument: doc ? () => newResponse(doc, false) : undefined,
    },
  });

  useEditRequests("discussion", doc?.id, w.beginEdit, !!doc);

  // Opening a post marks it read.
  useEffect(() => {
    if (active && doc) markRead([doc]);
  }, [active, doc, markRead]);

  const inDb = useMemo(() => discussion.filter((p) => inDiscussionDb(p, db)), [discussion, db]);
  const categories = useMemo(() => allCategories(inDb.filter((p) => !p.parentId)), [inDb]);

  // A new response starts with its subject filled in: the cursor goes to the body.
  const editorWrap = useRef<HTMLDivElement>(null);
  const d = w.draft;
  const focusBody = w.editing && w.isNew && !!d.parentId;
  useEffect(() => {
    if (focusBody) editorWrap.current?.querySelector<HTMLElement>(".rt-body")?.focus();
  }, [focusBody]);

  if (w.missing) return <DocMissing />;

  const parent = d.parentId ? discussion.find((p) => p.id === d.parentId) : undefined;
  const form = formOf(d, parent);
  const mine = isAuthor(d, user);

  const remove = async () => {
    if (!doc) return;
    if (!isAuthor(doc, user)) {
      useUI.getState().setStatus(notAuthorMessage(access));
      return;
    }
    const responses = deletionSet(inDb, [doc.id]).size - 1;
    if (!(await notesAsk(deletePostQuestion(!doc.parentId, responses), { title: "Delete Document" }))) return;
    deletePost(doc.id);
    useUI.getState().setStatus(responses ? `${responses + 1} documents deleted.` : "Document deleted.");
    w.closeNow();
  };

  const actions: ActionItem[] = w.editing
    ? [
        { id: "saveclose", label: "Save & Close", icon: "save", run: () => void w.saveAndClose() },
        { id: "save", label: "Save", icon: "save", run: () => void w.save(), accel: "Ctrl+S" },
        !w.isNew && mine && "sep",
        !w.isNew && mine && { id: "delete", label: "Delete", icon: "trash", run: () => void remove() },
      ]
    : [
        doc && { id: "respond", label: "Respond", icon: "response-new", run: () => newResponse(doc, false) },
        doc && !!doc.parentId && { id: "respond-rr", label: "Respond to Response", icon: "thread", run: () => newResponse(doc, true) },
        mine && "sep",
        mine && { id: "edit", label: "Edit", icon: "edit", run: w.beginEdit, accel: "Ctrl+E" },
        mine && { id: "delete", label: "Delete", icon: "trash", run: () => void remove() },
      ];

  return (
    <div className="app disc-window">
      <ActionBar actions={actions} />
      <FormPage
        form={form}
        icon={form === "Main Topic" ? "topic" : "response"}
        editing={w.editing}
        onEdit={mine ? w.beginEdit : undefined}
        className="disc-form"
      >
        {w.editing ? (
          <>
            {d.parentId && <ParentBlock parentId={d.parentId} />}
            <FieldTable>
              <TextRow
                label="Subject"
                value={d.subject}
                editing
                autoFocus={!d.subject}
                onChange={(v) => w.set({ subject: v })}
              />
              {form === "Main Topic" && (
                <CategoriesRow value={d.category} editing options={categories} onChange={(v) => w.set({ category: v })} />
              )}
            </FieldTable>
            <div ref={editorWrap} className="disc-editor-wrap">
              <RichTextEditor
                className="disc-editor"
                html={d.bodyHtml ?? textToHtml(d.body)}
                placeholder={d.parentId ? "Type your response here." : "Type your topic here."}
                onChange={(html) => w.set({ bodyHtml: html })}
              />
            </div>
          </>
        ) : (
          <PostReader post={d} />
        )}
      </FormPage>
    </div>
  );
}
