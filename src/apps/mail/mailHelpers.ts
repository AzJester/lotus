// ============================================================================
// Mail helpers shared by the view and the memo window: building replies and
// forwards the Notes way, the compose model, date categories and sizes.
// ============================================================================

import type { Attachment, MailMessage, MoodStamp, Person, Priority } from "../../data/types";
import { headerName, formatAddressList } from "../../data/names";
import { baseSubject } from "../../data/docs";
import { escapeHtml, sanitizeHtml, textToHtml } from "../../lib/sanitize";
import { fmtDateTime } from "../../lib/format";

/** The editable memo, as held by a memo window. */
export interface ComposeModel {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyHtml: string;
  attachments: Attachment[];
  priority: Priority;
  mood: MoodStamp;
  returnReceipt: boolean;
  inReplyTo?: string;
  /** What the memo answers, so sending can mark the original. */
  replyKind?: "reply" | "forward";
}

export const emptyCompose = (): ComposeModel => ({
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  bodyHtml: "",
  attachments: [],
  priority: "normal",
  mood: "normal",
  returnReceipt: false,
});

export type ReplyMode = "plain" | "history" | "noattach";

/** The history block Notes puts below a reply: sender, date, To, cc, Subject. */
export function historyHtml(m: MailMessage): string {
  const rows = [
    `<b>${escapeHtml(headerName(m.from).replace(/@.*$/, ""))}</b>`,
    escapeHtml(fmtDateTime(m.date)),
    `To: ${escapeHtml(m.to.map(headerName).join(", "))}`,
    `cc: ${escapeHtml(m.cc.map(headerName).join(", "))}`,
    `Subject: ${escapeHtml(m.subject)}`,
  ];
  const body = m.bodyHtml ? sanitizeHtml(m.bodyHtml) : textToHtml(m.body);
  return `<div class="memo-quote">${rows.join("<br>")}<br><br>${body}</div>`;
}

export function replyTo(
  m: MailMessage,
  me: Person,
  opts: { all: boolean; mode: ReplyMode },
): ComposeModel {
  const mine = me.email.toLowerCase();
  const others = opts.all
    ? [...m.to, ...m.cc].filter((p) => p.email.toLowerCase() !== mine && p.email.toLowerCase() !== m.from.email.toLowerCase())
    : [];
  return {
    ...emptyCompose(),
    to: formatAddressList([m.from]),
    cc: formatAddressList(others),
    subject: /^re:/i.test(m.subject) ? m.subject : `RE: ${baseSubject(m.subject)}`,
    bodyHtml: opts.mode === "plain" ? "" : `<div><br></div><div><br></div>${historyHtml(m)}`,
    attachments: opts.mode === "history" ? m.attachments ?? [] : [],
    inReplyTo: m.id,
    replyKind: "reply",
  };
}

export function forwardOf(m: MailMessage, me: { notesName: string }): ComposeModel {
  const banner = `----- Forwarded by ${escapeHtml(me.notesName)} on ${escapeHtml(fmtDateTime(Date.now()))} -----`;
  return {
    ...emptyCompose(),
    subject: /^fw:/i.test(m.subject) ? m.subject : `Fw: ${baseSubject(m.subject)}`,
    bodyHtml: `<div><br></div><div><br></div><div class="memo-quote">${banner}<br><br>${historyHtml(m).replace(/^<div class="memo-quote">|<\/div>$/g, "")}</div>`,
    attachments: m.attachments ?? [],
    inReplyTo: m.id,
    replyKind: "forward",
  };
}

/** Compose a draft or reopen a memo as a new one (Resend, Edit Draft). */
export function composeFrom(m: MailMessage): ComposeModel {
  return {
    to: formatAddressList(m.to),
    cc: formatAddressList(m.cc),
    bcc: formatAddressList(m.bcc ?? []),
    subject: m.subject,
    bodyHtml: m.bodyHtml ?? textToHtml(m.body),
    attachments: m.attachments ?? [],
    priority: m.priority,
    mood: m.mood ?? "normal",
    returnReceipt: !!m.returnReceipt,
    inReplyTo: m.inReplyTo,
  };
}

export const hasAttachment = (m: MailMessage) => !!(m.hasAttachment || (m.attachments && m.attachments.length));

export function rawBytes(m: MailMessage): number {
  const text = m.subject.length + m.body.length + (m.bodyHtml?.length ?? 0) / 3 + 200;
  const files = (m.attachments ?? []).reduce((n, a) => n + a.size, 0);
  return Math.round(text * 2 + 700 + files + (m.hasAttachment && !m.attachments ? 470000 : 0));
}

export function sizeLabel(m: MailMessage): string {
  const b = rawBytes(m);
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)}M`;
  return `${Math.max(1, Math.round(b / 1024))}K`;
}

export const fmtBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Notes 8-style date categories for the mail views. */
export const DATE_CATEGORIES = ["Today", "Yesterday", "Last Week", "Earlier This Month", "Older"];

export function dateCategory(ms: number): string {
  const d0 = new Date();
  d0.setHours(0, 0, 0, 0);
  const today = d0.getTime();
  const day = 86400000;
  if (ms >= today) return "Today";
  if (ms >= today - day) return "Yesterday";
  if (ms >= today - 7 * day) return "Last Week";
  if (ms >= today - 30 * day) return "Earlier This Month";
  return "Older";
}

/** Newest category first, or oldest first when the date sort is ascending. */
export const dateCategoryOrder = (dir: 1 | -1) => (a: string, b: string) =>
  (DATE_CATEGORIES.indexOf(a) - DATE_CATEGORIES.indexOf(b)) * -dir;

export const MOODS: { id: MoodStamp; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "personal", label: "Personal" },
  { id: "confidential", label: "Confidential" },
  { id: "private", label: "Private" },
  { id: "thankyou", label: "Thank You!" },
  { id: "flame", label: "Flame" },
  { id: "goodjob", label: "Good Job!" },
  { id: "joke", label: "Joke" },
  { id: "fyi", label: "FYI" },
  { id: "question", label: "Question" },
  { id: "reminder", label: "Reminder" },
];

export const moodLabel = (m?: MoodStamp) => MOODS.find((x) => x.id === m)?.label ?? "Normal";
