// ============================================================================
// Discussion helpers: which database a post belongs to, the response
// hierarchy (the form a post was written with, the main topic of a thread,
// response counts, what a delete takes with it), authorship, unread marks,
// the fixed sort of the threaded views and the blank post a new main topic
// or response starts from. Pure.
// ============================================================================

import type { DiscussionPost, Person } from "../../data/types";
import { DISCUSSION_DB } from "../../data/server";
import { baseSubject } from "../../data/docs";
import { htmlToText, sanitizeHtml } from "../../lib/sanitize";

export { DISCUSSION_DB };

/** A window's database id, normalized: the team discussion is undefined. */
export function discussionDb(db: string | undefined): string | undefined {
  return db && db !== DISCUSSION_DB ? db : undefined;
}

/** Does the post live in this database (undefined = the team discussion)? */
export function inDiscussionDb(p: { db?: string }, db: string | undefined): boolean {
  return (p.db || DISCUSSION_DB) === (db || DISCUSSION_DB);
}

// ---------------------------------------------------------------------------
// Forms and the response hierarchy
// ---------------------------------------------------------------------------

export type PostForm = "Main Topic" | "Response" | "Response to Response";

/** The form a post uses: a main topic, a response to one, or a response to a response. */
export function formOf(p: { parentId: string | null }, parent?: { parentId: string | null }): PostForm {
  if (!p.parentId) return "Main Topic";
  if (!parent || !parent.parentId) return "Response";
  return "Response to Response";
}

/** "Re: Proposal: move to two-week sprints" (never "Re: RE: ..."). */
export function responseSubject(parentSubject: string): string {
  return `Re: ${baseSubject(parentSubject)}`;
}

/** The main topic of a post's thread (the post itself when it is one, or when its parent is gone). */
export function threadRoot(p: DiscussionPost, byId: Map<string, DiscussionPost>): DiscussionPost {
  let cur = p;
  const seen = new Set<string>();
  while (cur.parentId && !seen.has(cur.id)) {
    seen.add(cur.id);
    const up = byId.get(cur.parentId);
    if (!up) break;
    cur = up;
  }
  return cur;
}

/** Responses (at any depth) under each main topic, by main topic id. */
export function responseCounts(posts: DiscussionPost[]): Map<string, number> {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const out = new Map<string, number>();
  for (const p of posts) {
    if (!p.parentId || p.conflictOf) continue;
    const root = threadRoot(p, byId);
    if (root.id === p.id || root.parentId) continue;
    out.set(root.id, (out.get(root.id) ?? 0) + 1);
  }
  return out;
}

/** Everything deleting these posts removes: their responses and conflict copies go too (as deletePost does). */
export function deletionSet(posts: DiscussionPost[], ids: string[]): Set<string> {
  const out = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of posts) {
      const parent = p.conflictOf ?? p.parentId;
      if (parent && out.has(parent) && !out.has(p.id)) {
        out.add(p.id);
        grew = true;
      }
    }
  }
  return out;
}

/**
 * Sort value for the threaded views (sorted descending): main topics newest
 * first, and within a thread the responses in the order they were written.
 */
export function threadSortValue(p: DiscussionPost): number {
  return p.parentId || p.conflictOf ? -p.date : p.date;
}

/** Where a post sits in the response hierarchy (conflict copies answer the winner). */
export const parentOfPost = (p: DiscussionPost): string | null => p.conflictOf ?? p.parentId;

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** Did this person write the post? (internet address, or the name when there is none) */
export function isAuthor(p: { author: Person }, me: { name: string; email: string }): boolean {
  const a = p.author.email.trim().toLowerCase();
  const b = me.email.trim().toLowerCase();
  if (a && b) return a === b;
  return p.author.name.trim().toLowerCase() === me.name.trim().toLowerCase();
}

/**
 * Shown in the status bar when you try to change someone else's post. The
 * access level is named when it is the reason (Author access).
 */
export function notAuthorMessage(access?: string): string {
  const base = "You are not authorized to edit this document.";
  return access === "Author" || access === undefined
    ? `${base} You have Author access, and you are not listed as an author of it.`
    : `${base} You are not listed as an author of it.`;
}

/**
 * Unread marks: `seen` maps a document id to the edit sequence you last read
 * (null until the table exists). Your own posts are never unread; a post
 * someone edits after you read it is unread again.
 */
export function isUnreadPost(p: DiscussionPost, seen: Record<string, number> | null, me: { name: string; email: string }): boolean {
  if (!seen || isAuthor(p, me)) return false;
  return (seen[p.id] ?? 0) < (p.seq ?? 1);
}

// ---------------------------------------------------------------------------
// Deleting
// ---------------------------------------------------------------------------

const docCount = (n: number) => `${n} document${n === 1 ? "" : "s"}`;

/** The question F9 asks about posts marked for deletion: [question, note about responses]. */
export function markedDeletionQuestion(marked: number, responses: number): [string, string?] {
  const question = `Delete ${docCount(marked)} marked for deletion?`;
  if (!responses) return [question];
  return [question, `${marked === 1 ? "Its" : "Their"} responses will be deleted too (${responses} more document${responses === 1 ? "" : "s"}).`];
}

/** The question the Delete action of a post window asks. */
export function deletePostQuestion(mainTopic: boolean, responses: number): string {
  const what = mainTopic ? "this main topic" : "this document";
  if (!responses) return `Delete ${what}?`;
  return `Delete ${what}? Its ${responses} response${responses === 1 ? "" : "s"} will be deleted too.`;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** Search bar filter: subject, body, author or category contains the words. */
export function matchesPost(p: DiscussionPost, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.subject, p.body, p.author.name, p.category].some((v) => (v ?? "").toLowerCase().includes(q));
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * The draft a new document starts from. A response inherits its parent's
 * thread, category and database and answers "Re: <parent subject>".
 */
export function blankPost(
  init: Record<string, unknown>,
  id: string,
  me: Person,
  parent: DiscussionPost | undefined,
  db: string | undefined,
  now = Date.now(),
): DiscussionPost {
  if (parent) {
    return {
      id,
      parentId: parent.id,
      topicId: parent.topicId || parent.id,
      subject: responseSubject(parent.subject),
      author: me,
      body: "",
      category: parent.category,
      date: now,
      db: discussionDb(parent.db),
    };
  }
  return {
    id,
    parentId: null,
    topicId: id,
    subject: str(init.subject),
    author: me,
    body: str(init.body),
    category: str(init.category),
    date: now,
    db: discussionDb(db),
  };
}

/** The fields a save writes. The plain `body` follows the rich text when it changed. */
export function postSaveFields(d: DiscussionPost): Partial<DiscussionPost> {
  const out: Partial<DiscussionPost> = { subject: d.subject.trim(), category: d.category.trim() };
  if (d.bodyHtml !== undefined) {
    const html = sanitizeHtml(d.bodyHtml);
    out.bodyHtml = html;
    out.body = htmlToText(html);
  }
  return out;
}

export const postTitle = (p: { subject: string }) => p.subject.trim() || "(Untitled)";
