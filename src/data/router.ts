// ============================================================================
// The simulated Domino mail router. Routing a memo resolves every recipient
// against Acme's Directory (expanding groups), bounces names it cannot find
// with a Delivery Failure Report, and schedules what the colleagues on the
// other end do: reply, send a return receipt, answer a meeting invitation, or
// have their Out of Office agent respond. It also runs the server-side agents
// on mail delivered to you: your mail rules and your own Out of Office.
// Everything here is pure: callers get back ServerEvents to queue.
// ============================================================================

import type {
  Contact,
  ContactGroup,
  MailMessage,
  MailRule,
  OutOfOffice,
  Person,
  ServerEvent,
} from "./types";
import { findGroup, findPerson, findPersonByEmail, INTERNET_DOMAIN, ORG, DOMAIN } from "./directory";
import type { DirectoryPerson } from "./directory";
import { HELPDESK_REPLY, REPLY_TEMPLATES } from "./serverContent";
import { baseSubject, makeMemo, uid } from "./docs";
import { headerName } from "./names";
import { colleagueResponse } from "./scheduling";
import { fmtDate, fmtDateTime, startOfDay } from "../lib/format";

export const MAIL_ROUTER: Person = { name: "Mail Router", email: "mailrouter@" + INTERNET_DOMAIN };

const DAY = 86400000;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface RouterContext {
  now: number;
  /** The user (the sender of the memo being routed). */
  me: Person;
  contacts: Contact[];
  groups: ContactGroup[];
  /** Colleague name -> senders their Out of Office agent already answered. */
  oooNotified: Record<string, string[]>;
  /** Random source in [0, 1). */
  rand: () => number;
}

export interface RouteFailure {
  recipient: string;
  reason: string;
}

export interface RouteResult {
  events: ServerEvent[];
  oooNotified: Record<string, string[]>;
  /** Recipients the memo reached. */
  delivered: Person[];
  failures: RouteFailure[];
}

function notListed(name: string): string {
  return `User ${name} (${name}/${ORG}@${DOMAIN}) not listed in Domino Directory`;
}

/** Resolve people and groups into deliverable recipients. */
export function expandRecipients(
  people: Person[],
  contacts: Contact[],
  groups: ContactGroup[],
): { resolved: Person[]; failures: RouteFailure[] } {
  const resolved = new Map<string, Person>();
  const failures: RouteFailure[] = [];
  const add = (p: Person) => resolved.set(p.email.toLowerCase(), p);

  const resolveOne = (p: Person, depth: number) => {
    const email = p.email.trim();
    if (email) {
      if (email.toLowerCase().endsWith("@" + INTERNET_DOMAIN)) {
        const person = findPersonByEmail(email);
        if (person) add({ name: person.name, email: person.email });
        else failures.push({ recipient: p.name || email, reason: notListed(p.name || email.split("@")[0]) });
      } else if (EMAIL.test(email)) add({ name: p.name || email, email });
      else failures.push({ recipient: p.name || email, reason: `Unable to deliver: "${email}" is not a valid Internet address` });
      return;
    }
    const name = p.name.trim();
    if (!name) return;
    const dgroup = findGroup(name);
    if (dgroup && depth < 3) {
      for (const member of dgroup.members) resolveOne({ name: member, email: "" }, depth + 1);
      return;
    }
    const pgroup = groups.find((g) => g.name.toLowerCase() === name.toLowerCase());
    if (pgroup && depth < 3) {
      for (const id of pgroup.memberIds) {
        const c = contacts.find((x) => x.id === id);
        if (c && c.email) resolveOne({ name: `${c.firstName} ${c.lastName}`.trim(), email: c.email }, depth + 1);
      }
      return;
    }
    const person = findPerson(name);
    if (person) {
      add({ name: person.name, email: person.email });
      return;
    }
    const contact = contacts.find((c) => `${c.firstName} ${c.lastName}`.trim().toLowerCase() === name.toLowerCase());
    if (contact && contact.email) {
      resolveOne({ name, email: contact.email }, depth + 1);
      return;
    }
    failures.push({ recipient: name, reason: notListed(name) });
  };

  for (const p of people) resolveOne(p, 0);
  return { resolved: [...resolved.values()], failures };
}

/** Whether a directory colleague's Out of Office agent is running today. */
export function colleagueAway(p: DirectoryPerson, now: number): boolean {
  if (!p.ooo) return false;
  const today = startOfDay(now);
  return now >= today + p.ooo.leavingDays * DAY && now < today + p.ooo.returningDays * DAY;
}

/** The standard Notes Out of Office notice text. */
export function outOfOfficeText(leaving: number, returning: number, message: string): string {
  const base = `I will be out of the office starting ${fmtDate(leaving)} and will not return until ${fmtDate(returning)}.`;
  return message.trim() ? `${base}\n\n${message.trim()}` : base;
}

/** The "Reply with History" block Notes appends below a reply. */
export function historyBlock(m: MailMessage): string {
  const to = m.to.map(headerName).join(", ");
  const cc = m.cc.map(headerName).join(", ");
  return (
    `${headerName(m.from).replace(/@.*$/, "")}\n` +
    `${fmtDateTime(m.date)}\n` +
    `To: ${to}\n` +
    `cc: ${cc}\n` +
    `Subject: ${m.subject}\n\n` +
    m.body
  );
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

/** Delivery Failure Report for the recipients that could not be reached. */
export function deliveryFailure(memo: MailMessage, failures: RouteFailure[], to: Person, now: number): MailMessage {
  const who = failures.map((f) => f.recipient).join(", ");
  const why = failures.map((f) => f.reason).join("\n");
  const first = failures[0];
  return makeMemo({
    from: MAIL_ROUTER,
    to: [to],
    subject: `DELIVERY FAILURE: ${first.reason}`,
    form: "DeliveryReport",
    auto: true,
    priority: "normal",
    date: now,
    failure: { originalSubject: memo.subject, recipient: who, reason: why },
    inReplyTo: memo.id,
    body:
      `Your document: ${memo.subject}\n` +
      `was not delivered to: ${who}\n` +
      `because: ${why}\n\n` +
      "What should you do?\n" +
      "- You can resend the undeliverable document to the recipients listed above by choosing the Resend button or the Resend command on the Actions menu.\n" +
      "- Once you have resent the document you may delete this Delivery Failure Report.\n" +
      "- If resending the document is not successful you will receive a new failure report.\n" +
      "- Unless you receive other Delivery Failure Reports, the document was successfully delivered to all other recipients.",
  });
}

/** Route a memo you sent. Returns the server events it causes. */
export function routeMemo(memo: MailMessage, ctx: RouterContext): RouteResult {
  const { now, me, rand } = ctx;
  const events: ServerEvent[] = [];
  const oooNotified: Record<string, string[]> = { ...ctx.oooNotified };
  const { resolved, failures } = expandRecipients(
    [...memo.to, ...memo.cc, ...(memo.bcc ?? [])],
    ctx.contacts,
    ctx.groups,
  );
  const later = (minSec: number, maxSec: number) => now + (minSec + rand() * (maxSec - minSec)) * 1000;

  for (const r of resolved) {
    if (r.email.toLowerCase() === me.email.toLowerCase()) {
      // Mail to yourself lands in your own Inbox.
      events.push({
        kind: "deliver",
        at: now + 2000,
        memo: { ...memo, id: uid(), folder: "inbox", read: false, labels: [], date: now },
      });
      continue;
    }
    const colleague = findPersonByEmail(r.email);
    if (!colleague) continue; // an Internet recipient: handed off to SMTP
    const person: Person = { name: colleague.name, email: colleague.email };
    const first = colleague.name.split(" ")[0];

    if (memo.notice) {
      // Invitations and reschedules get answered; other notices (your
      // responses, cancellations) do not.
      const asks = memo.notice.type === "invitation" || memo.notice.type === "rescheduled";
      if (asks && !colleagueAway(colleague, now) && colleague.replies) {
        const answer = colleagueResponse(person, memo.notice, now, rand());
        events.push({ kind: "deliver", at: later(45, 150), memo: { ...answer, date: 0 } });
      }
    } else if (colleagueAway(colleague, now) && colleague.ooo) {
      const already = oooNotified[colleague.name] ?? [];
      if (!already.includes(me.email) && !memo.auto) {
        oooNotified[colleague.name] = [...already, me.email];
        const today = startOfDay(now);
        events.push({
          kind: "deliver",
          at: later(15, 35),
          memo: makeMemo({
            from: person,
            to: [me],
            subject: `${colleague.name} is out of the office.`,
            body: outOfOfficeText(
              today + colleague.ooo.leavingDays * DAY,
              today + colleague.ooo.returningDays * DAY,
              colleague.ooo.message,
            ),
            auto: true,
            inReplyTo: memo.id,
            date: 0,
          }),
        });
      }
    } else if (colleague.name === "IT Help Desk" && !memo.auto) {
      const ticket = "HD-" + String(10000 + Math.floor(rand() * 89999));
      events.push({
        kind: "deliver",
        at: later(10, 20),
        memo: makeMemo({
          from: person,
          to: [me],
          subject: `RE: ${baseSubject(memo.subject)} [${ticket}]`,
          body: fill(HELPDESK_REPLY, { ticket, subject: baseSubject(memo.subject) }),
          auto: true,
          inReplyTo: memo.id,
          date: 0,
        }),
      });
    } else if (colleague.replies && !memo.auto && rand() < 0.75) {
      const template = REPLY_TEMPLATES[Math.floor(rand() * REPLY_TEMPLATES.length)] ?? "Thanks.\n\n{me}";
      const text = fill(template, { first: me.name.split(" ")[0], subject: baseSubject(memo.subject), me: first });
      events.push({
        kind: "deliver",
        at: later(60, 200),
        memo: makeMemo({
          from: person,
          to: [me],
          subject: `RE: ${baseSubject(memo.subject)}`,
          form: "Reply",
          body: `${text}\n\n\n${historyBlock(memo)}`,
          inReplyTo: memo.id,
          date: 0,
        }),
      });
    }

    if (memo.returnReceipt) {
      events.push({
        kind: "deliver",
        at: later(20, 80),
        memo: makeMemo({
          from: person,
          to: [me],
          subject: `Return Receipt: ${memo.subject}`,
          form: "ReturnReceipt",
          auto: true,
          inReplyTo: memo.id,
          receipt: { originalSubject: memo.subject, recipient: headerName(person), at: 0 },
          body: `Your document: ${memo.subject}\nwas received by: ${headerName(person)}`,
          date: 0,
        }),
      });
    }
  }

  if (failures.length) {
    events.push({ kind: "deliver", at: now + 4000, memo: deliveryFailure(memo, failures, me, now) });
  }

  return { events, oooNotified, delivered: resolved, failures };
}

/** Mail rules, run by the server on each memo delivered to you. */
export function applyRules(memo: MailMessage, rules: MailRule[]): MailMessage {
  let msg = memo;
  for (const rule of rules) {
    const needle = rule.contains.trim().toLowerCase();
    if (!needle) continue;
    const hay =
      rule.field === "from"
        ? `${msg.from.name} ${msg.from.email}`
        : rule.field === "subject"
          ? msg.subject
          : msg.body;
    if (!hay.toLowerCase().includes(needle)) continue;
    if (rule.action === "move" && rule.folderId) {
      const labels = msg.labels ?? [];
      if (!labels.includes(rule.folderId)) msg = { ...msg, labels: [...labels, rule.folderId] };
    } else if (rule.action === "flag") {
      msg = { ...msg, flagged: true, flagColor: rule.flagColor ?? "yellow" };
    } else if (rule.action === "junk") {
      msg = { ...msg, folder: "junk" };
    }
  }
  return msg;
}

/**
 * Your Out of Office agent: returns the notice to send for a delivered memo,
 * or null when it should not answer (automatic mail, yourself, already told).
 */
export function myOutOfOffice(
  memo: MailMessage,
  ooo: OutOfOffice,
  me: Person,
  now: number,
): MailMessage | null {
  if (!ooo.enabled || now < ooo.leaving || now >= ooo.returning) return null;
  if (memo.auto || memo.form === "Notice" || memo.form === "DeliveryReport") return null;
  const sender = memo.from.email.toLowerCase();
  if (!sender || sender === me.email.toLowerCase() || sender === MAIL_ROUTER.email) return null;
  if (ooo.notified.includes(sender)) return null;
  return makeMemo({
    from: me,
    to: [memo.from],
    subject: `${me.name} is out of the office.`,
    body: outOfOfficeText(ooo.leaving, ooo.returning, ooo.message),
    auto: true,
    folder: "sent",
    read: true,
    inReplyTo: memo.id,
    date: now,
  });
}
