// ============================================================================
// The simulated Domino server. It owns the server replicas (a snapshot of the
// mail file and the team discussion) and a queue of timed events: mail that
// colleagues send, replies to memos you sent, meeting invitations, discussion
// posts and edits. `tickServer` makes due events happen on the server (mail
// rules and your Out of Office agent run there, like server agents) and
// schedules new spontaneous traffic every few minutes. Pure.
// ============================================================================

import type {
  DiscussionPost,
  MailMessage,
  MailRule,
  OutOfOffice,
  Person,
  ReplicaSnapshot,
  ServerEvent,
} from "./types";
import { findPerson } from "./directory";
import { baseSubject, makeMemo, stampEdit, stampNew, uid } from "./docs";
import { applyRules, myOutOfOffice } from "./router";
import { meetingSummary, noticeMemo } from "./scheduling";
import { DISCUSSION_REPLIES, INCOMING_MEMOS, MEETING_INVITES, NEW_TOPICS } from "./serverContent";
import type { MemoTemplate } from "./serverContent";
import { startOfDay } from "../lib/format";

export interface ServerState {
  server: ReplicaSnapshot;
  serverQueue: ServerEvent[];
  nextTrafficAt: number;
  /** Content keys already used, so the pools don't repeat until exhausted. */
  usedContent: string[];
}

export interface TickContext {
  now: number;
  me: Person;
  ooo: OutOfOffice;
  rules: MailRule[];
  rand: () => number;
}

export interface TickResult extends ServerState {
  /** Memos delivered to your server mail file this tick. */
  delivered: MailMessage[];
  /** Discussion documents created or edited on the server. */
  discussionChanged: number;
  /** Memos your server agents sent (Out of Office notices), to be routed. */
  outgoing: MailMessage[];
  ooo: OutOfOffice;
}

const MINUTE = 60000;

export const DISCUSSION_DB = "discussion";

function personOf(name: string): Person {
  const p = findPerson(name);
  return p ? { name: p.name, email: p.email } : { name, email: "" };
}

function pick<T>(pool: T[], key: (t: T) => string, used: string[], rand: () => number): { item: T; used: string[] } | null {
  if (pool.length === 0) return null;
  let fresh = pool.filter((t) => !used.includes(key(t)));
  let nextUsed = used;
  if (fresh.length === 0) {
    // Pool exhausted: start over, but drop only this pool's keys.
    const keys = new Set(pool.map(key));
    nextUsed = used.filter((k) => !keys.has(k));
    fresh = pool;
  }
  const item = fresh[Math.floor(rand() * fresh.length)];
  return { item, used: [...nextUsed, key(item)] };
}

/** A tiny placeholder file so simulated attachments open and download. */
function placeholderAttachment(name: string, sizeKb: number) {
  const text = `${name}\n\nThis attachment was delivered by the Lotus Notes simulation.\n`;
  const b64 = typeof btoa === "function" ? btoa(text) : "";
  return { name, type: "text/plain", size: sizeKb * 1024, dataUrl: `data:text/plain;base64,${b64}` };
}

function memoFromTemplate(t: MemoTemplate, me: Person, at: number): MailMessage {
  const attachments = t.attachment ? [placeholderAttachment(t.attachment.name, t.attachment.sizeKb)] : undefined;
  return makeMemo({
    from: personOf(t.from),
    to: [me],
    subject: t.subject,
    body: t.body,
    priority: t.importance ?? "normal",
    mood: t.mood,
    attachments,
    hasAttachment: !!attachments,
    date: at,
  });
}

/** Next working-day slot 1-3 days out for a simulated invitation. */
function meetingStart(now: number, rand: () => number): number {
  let day = startOfDay(now);
  let ahead = 1 + Math.floor(rand() * 3);
  while (ahead > 0) {
    day += 86400000;
    const dow = new Date(day).getDay();
    if (dow !== 0 && dow !== 6) ahead--;
  }
  const hours = [9, 10, 11, 13, 14, 15, 16];
  const d = new Date(day);
  d.setHours(hours[Math.floor(rand() * hours.length)], 0, 0, 0);
  return d.getTime();
}

const EDIT_NOTES = [
  "Update: I added the latest numbers to the shared drive.",
  "Edit: corrected the date above.",
  "Update: this came up again at staff meeting, so I am still looking for input.",
  "Edit: clarified the second point after a few questions.",
];

/** Decide the next spontaneous event on the server. */
export function spontaneousEvent(
  state: ServerState,
  me: Person,
  now: number,
  rand: () => number,
): { event: ServerEvent | null; usedContent: string[] } {
  const roll = rand();
  const at = now + Math.floor(rand() * 20000);
  const topics = state.server.discussion.filter((p) => p.parentId === null && (p.db ?? DISCUSSION_DB) === DISCUSSION_DB);

  if (roll < 0.5) {
    const got = pick(INCOMING_MEMOS, (t) => "memo:" + t.subject, state.usedContent, rand);
    if (!got) return { event: null, usedContent: state.usedContent };
    return { event: { kind: "deliver", at, memo: memoFromTemplate(got.item, me, 0) }, usedContent: got.used };
  }
  if (roll < 0.72 && topics.length) {
    const topic = topics[Math.floor(rand() * topics.length)];
    const thread = state.server.discussion.filter((p) => p.topicId === topic.topicId);
    const parent = thread[Math.floor(rand() * thread.length)];
    const candidates = DISCUSSION_REPLIES.filter((r) => r.author !== parent.author.name);
    const got = pick(candidates, (r) => "reply:" + r.body.slice(0, 40), state.usedContent, rand);
    if (!got) return { event: null, usedContent: state.usedContent };
    const post: DiscussionPost = {
      id: uid(),
      parentId: parent.id,
      topicId: topic.topicId,
      subject: `RE: ${baseSubject(topic.subject)}`,
      author: personOf(got.item.author),
      body: got.item.body,
      category: topic.category,
      date: 0,
      db: DISCUSSION_DB,
    };
    return { event: { kind: "post", at, post }, usedContent: got.used };
  }
  if (roll < 0.8) {
    const got = pick(NEW_TOPICS, (t) => "topic:" + t.subject, state.usedContent, rand);
    if (!got) return { event: null, usedContent: state.usedContent };
    const id = uid();
    const post: DiscussionPost = {
      id,
      parentId: null,
      topicId: id,
      subject: got.item.subject,
      author: personOf(got.item.author),
      body: got.item.body,
      category: got.item.category,
      date: 0,
      db: DISCUSSION_DB,
    };
    return { event: { kind: "post", at, post }, usedContent: got.used };
  }
  if (roll < 0.92) {
    const got = pick(MEETING_INVITES, (t) => "invite:" + t.subject, state.usedContent, rand);
    if (!got) return { event: null, usedContent: state.usedContent };
    const chair = personOf(got.item.chair);
    const start = meetingStart(now, rand);
    const notice = {
      type: "invitation" as const,
      entryId: uid(),
      subject: got.item.subject,
      location: got.item.location,
      start,
      end: start + got.item.durationMin * MINUTE,
      chair,
    };
    const memo = noticeMemo(notice, chair, [me], `${got.item.description}\n\n${meetingSummary(notice)}`, 0);
    return { event: { kind: "deliver", at, memo }, usedContent: got.used };
  }
  // A colleague edits one of their own posts (the raw material of conflicts).
  const theirs = state.server.discussion.filter(
    (p) => (p.db ?? DISCUSSION_DB) === DISCUSSION_DB && p.author.email !== me.email && p.author.email,
  );
  if (!theirs.length) return { event: null, usedContent: state.usedContent };
  const post = theirs[Math.floor(rand() * theirs.length)];
  const note = EDIT_NOTES[Math.floor(rand() * EDIT_NOTES.length)];
  return {
    event: { kind: "edit-post", at, id: post.id, body: `${post.body}\n\n${note}`, author: post.author.name },
    usedContent: state.usedContent,
  };
}

/** Advance the server to `now`: run due events and schedule new traffic. */
export function tickServer(state: ServerState, ctx: TickContext): TickResult {
  const { now, me, rand } = ctx;
  let { serverQueue, nextTrafficAt, usedContent } = state;
  let server = state.server;
  let ooo = ctx.ooo;

  // Spontaneous traffic. After a long absence, catch up with at most one event.
  if (now >= nextTrafficAt) {
    const { event, usedContent: used } = spontaneousEvent({ ...state, usedContent }, me, now, rand);
    usedContent = used;
    if (event) serverQueue = [...serverQueue, event];
    nextTrafficAt = now + (4 + rand() * 4) * MINUTE;
  }

  const due = serverQueue.filter((e) => e.at <= now).sort((a, b) => a.at - b.at);
  serverQueue = serverQueue.filter((e) => e.at > now);

  const delivered: MailMessage[] = [];
  const outgoing: MailMessage[] = [];
  let discussionChanged = 0;
  let mail = server.mail;
  let discussion = server.discussion;

  for (const ev of due) {
    if (ev.kind === "deliver") {
      const at = ev.at;
      let memo: MailMessage = stampNew(
        {
          ...ev.memo,
          date: ev.memo.date || at,
          created: at,
          receipt: ev.memo.receipt ? { ...ev.memo.receipt, at: ev.memo.receipt.at || at } : undefined,
        },
        ev.memo.from.name,
        at,
      );
      if (memo.folder === "inbox") memo = applyRules(memo, ctx.rules);
      mail = [memo, ...mail];
      delivered.push(memo);
      const notice = memo.folder === "inbox" ? myOutOfOffice(memo, ooo, me, at) : null;
      if (notice) {
        mail = [notice, ...mail];
        outgoing.push(notice);
        ooo = { ...ooo, notified: [...ooo.notified, memo.from.email.toLowerCase()] };
      }
    } else if (ev.kind === "post") {
      discussion = [...discussion, stampNew({ ...ev.post, date: ev.post.date || ev.at }, ev.post.author.name, ev.at)];
      discussionChanged++;
    } else if (ev.kind === "edit-post") {
      discussion = discussion.map((p) => (p.id === ev.id ? stampEdit(p, { body: ev.body }, ev.author, ev.at) : p));
      discussionChanged++;
    }
  }

  if (due.length) server = { ...server, mail, discussion };
  return { server, serverQueue, nextTrafficAt, usedContent, delivered, discussionChanged, outgoing, ooo };
}
