// ============================================================================
// Meeting model: the pure side of Calendar & Scheduling. Who chairs a meeting
// and who was invited, invitee response labels and summaries, what changed
// between two saves of a meeting, the people the Scheduler shows and their
// busy time, Find Free Time across days, and the calendar entry form's
// draft (new-entry defaults, switching the entry type, validation, turning
// the draft back into a document). See meetingModel.test.ts.
// ============================================================================

import type {
  CalEntryType,
  CalendarEntry,
  Contact,
  ContactGroup,
  InviteeResponse,
  InviteeStatus,
  Person,
} from "../../data/types";
import { busySlots, findFreeTime, myBusySlots, WORK_END_HOUR, WORK_START_HOUR } from "../../data/scheduling";
import type { Slot } from "../../data/scheduling";
import { findGroup, findPerson, findPersonByEmail } from "../../data/directory";
import { notesName, parseAddressList } from "../../data/names";
import type { ParsedAddress } from "../../data/names";
import { startOfDay } from "../../lib/format";
import { DAY, DEFAULT_HOUR, HOUR, MINUTE, addDays, atMinutes, isWeekend, wallMinutes } from "./calendarModel";

// ---------------------------------------------------------------------------
// People and roles
// ---------------------------------------------------------------------------

/** Two addresses name the same person (by internet address, else by name). */
export function samePerson(a: Person, b: Person): boolean {
  if (a.email && b.email) return a.email.trim().toLowerCase() === b.email.trim().toLowerCase();
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
}

/** A meeting you called (meetings saved before the chair was recorded count as yours). */
export function isChair(e: CalendarEntry, me: Person): boolean {
  return e.type === "meeting" && (!e.chair || samePerson(e.chair, me));
}

/** A meeting someone else chairs, on your calendar because you were invited. */
export function isInvited(e: CalendarEntry, me: Person): boolean {
  return e.type === "meeting" && !!e.chair && !samePerson(e.chair, me);
}

/** The chair has mailed the invitations (the store starts tracking responses then). */
export const invitationsSent = (e: CalendarEntry) => !!e.inviteeStatus;

export const STATUS_LABEL: Record<InviteeResponse, string> = {
  "needs-action": "Needs action",
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Tentative",
  delegated: "Delegated",
  counter: "Proposed new time",
};

/** "2 accepted, 1 tentative, 1 needs action" */
export function statusSummary(list: InviteeStatus[]): string {
  const order: InviteeResponse[] = ["accepted", "tentative", "counter", "delegated", "declined", "needs-action"];
  const words: Record<InviteeResponse, string> = {
    accepted: "accepted",
    tentative: "tentative",
    counter: "proposed a new time",
    delegated: "delegated",
    declined: "declined",
    "needs-action": "needs action",
  };
  const parts = order
    .map((s) => [s, list.filter((x) => x.status === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${words[s]}`);
  return parts.join(", ") || "No invitees";
}

/** Your part in a meeting, for the Meetings view. */
export function roleText(e: CalendarEntry, me: Person): string {
  if (e.type !== "meeting") return "";
  return isChair(e, me) ? "Chair" : "Invitee";
}

/** Where the meeting stands, from your side. */
export function meetingStatusText(e: CalendarEntry, me: Person): string {
  if (isInvited(e, me)) return e.myResponse === "tentative" ? "Tentatively accepted" : "Accepted";
  if (!e.invitees.length) return "No invitees";
  if (!e.inviteeStatus) return "Invitations not sent";
  return statusSummary(e.inviteeStatus);
}

/** How the invitee list changed between two saves. */
export function inviteeDiff(before: Person[], after: Person[]): { added: Person[]; removed: Person[]; kept: Person[] } {
  const has = (list: Person[], p: Person) => list.some((q) => samePerson(p, q));
  return {
    added: after.filter((p) => !has(before, p)),
    removed: before.filter((p) => !has(after, p)),
    kept: after.filter((p) => has(before, p)),
  };
}

/** The meeting moved (its first occurrence or duration changed). */
export function timeChanged(before: CalendarEntry, after: CalendarEntry): boolean {
  return before.start !== after.start || before.end !== after.end;
}

/** How an address is written back into the Invitees field. */
export function inviteeText(p: Person): string {
  return p.email ? notesName(p) : p.name;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export interface Participant {
  key: string;
  person: Person;
  /** me: your own calendar; directory: an Acme colleague; none: no free time information. */
  kind: "me" | "directory" | "none";
  /** Why a row is special: "Not found in the Domino Directory", "via Sales Team"... */
  note?: string;
}

/**
 * The rows the Scheduler draws: you first, then every invitee. Groups are
 * expanded to their members; people outside Acme and names the Directory
 * does not know have no free time information.
 */
export function participantsFor(
  invitees: (Person | ParsedAddress)[],
  me: Person,
  contacts: Contact[] = [],
  groups: ContactGroup[] = [],
): Participant[] {
  const out: Participant[] = [{ key: "me", person: me, kind: "me" }];
  const seen = new Set<string>([(me.email || me.name).trim().toLowerCase()]);
  const add = (p: Person, note?: string) => {
    const colleague = p.email ? findPersonByEmail(p.email) : findPerson(p.name);
    const person = colleague ? { name: colleague.name, email: colleague.email } : p;
    const key = (person.email || person.name).trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (colleague) out.push({ key, person, kind: "directory", note });
    else
      out.push({
        key,
        person,
        kind: "none",
        note: note ?? (p.email ? "No free time information (Internet address)" : "Not found in the Domino Directory"),
      });
  };
  for (const p of invitees) {
    if (!p.email) {
      const dgroup = findGroup(p.name);
      if (dgroup) {
        for (const member of dgroup.members) add({ name: member, email: "" }, `via ${dgroup.name}`);
        continue;
      }
      const pgroup = groups.find((g) => g.name.toLowerCase() === p.name.trim().toLowerCase());
      if (pgroup) {
        for (const id of pgroup.memberIds) {
          const c = contacts.find((x) => x.id === id);
          if (c) add({ name: `${c.firstName} ${c.lastName}`.trim() || c.email, email: c.email }, `via ${pgroup.name}`);
        }
        continue;
      }
    }
    add(p);
  }
  return out;
}

/** A participant's busy time on a day, or null when there is no information. */
export function busyFor(p: Participant, dayMs: number, calendar: CalendarEntry[], excludeId?: string): Slot[] | null {
  if (p.kind === "me") return myBusySlots(calendar, dayMs, excludeId);
  if (p.kind === "directory") return busySlots(p.person.name, dayMs);
  return null;
}

/** Busy slots that overlap the proposed time. */
export function conflictsWith(slots: Slot[] | null, start: number, end: number): Slot[] {
  if (!slots) return [];
  const e = end > start ? end : start + 30 * MINUTE;
  return slots.filter((s) => s.start < e && s.end > start);
}

/**
 * The first start at or after `from`, in the working day, when every row
 * is free for the whole meeting. Searches `days` days (weekends after the
 * first day are skipped); null when nothing fits.
 */
export function nextFreeStart(
  busyOn: (dayMs: number) => Slot[][],
  from: number,
  durationMs: number,
  days = 14,
): number | null {
  const first = startOfDay(from);
  for (let i = 0; i < days; i++) {
    const day = addDays(first, i);
    if (i > 0 && isWeekend(day)) continue;
    const t = findFreeTime(busyOn(day), day, Math.max(30, durationMs / MINUTE), from);
    if (t !== null) return t;
  }
  return null;
}

/** Where a time falls across the Scheduler's working day (0 = 8 AM, 1 = 6 PM). */
export function timelineFraction(ms: number, dayStart: number): number {
  const day = startOfDay(dayStart);
  let minutes: number;
  if (ms <= day) minutes = 0;
  else if (ms >= addDays(day, 1)) minutes = 1440;
  else minutes = wallMinutes(ms);
  const from = WORK_START_HOUR * 60;
  const to = WORK_END_HOUR * 60;
  return Math.max(0, Math.min(1, (minutes - from) / (to - from)));
}

/** The half-hour start under a point of the Scheduler timeline. */
export function timelineTime(fraction: number, dayStart: number): number {
  const from = WORK_START_HOUR * 60;
  const to = WORK_END_HOUR * 60;
  const minutes = from + Math.floor((Math.max(0, Math.min(0.999, fraction)) * (to - from)) / 30) * 30;
  return atMinutes(dayStart, minutes);
}

// ---------------------------------------------------------------------------
// The entry form's draft
// ---------------------------------------------------------------------------

/** What the form edits: the document plus the Invitees field as typed. */
export interface EntryDraft extends CalendarEntry {
  inviteesText: string;
}

const TYPES: CalEntryType[] = ["appointment", "meeting", "reminder", "event", "anniversary"];
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** All-day entries run from the start of their first day to 11:59 PM on the last. */
function allDaySpan(start: number, end: number): { start: number; end: number } {
  const s = startOfDay(start);
  const last = Math.max(s, startOfDay(end));
  return { start: s, end: atMinutes(last, 23 * 60 + 59) };
}

/**
 * Switch the entry type, as the radio buttons across the top of a new
 * entry do: events and anniversaries become all day, reminders have one
 * time, appointments and meetings get a start and an end.
 */
export function retype(e: CalendarEntry, type: CalEntryType): CalendarEntry {
  // Leaving Anniversary drops the yearly repeat it brought with it.
  const leaving = e.type === "anniversary" && type !== "anniversary" && e.recurrence?.freq === "yearly";
  const next: CalendarEntry = { ...e, type, recurrence: leaving ? undefined : e.recurrence };
  if (type === "event" || type === "anniversary") {
    const span = allDaySpan(e.start, type === "anniversary" ? e.start : e.end);
    // An anniversary comes around every year, as the Notes form set it up.
    const recurrence =
      type === "anniversary" && !next.recurrence
        ? { freq: "yearly" as const, until: new Date(span.start).setFullYear(new Date(span.start).getFullYear() + 10) }
        : next.recurrence;
    return { ...next, allDay: true, ...span, recurrence };
  }
  const start = e.allDay ? atMinutes(e.start, DEFAULT_HOUR * 60) : e.start;
  if (type === "reminder") return { ...next, allDay: false, start, end: start };
  const end = e.allDay || e.end <= e.start ? start + HOUR : e.end;
  return { ...next, allDay: false, start, end };
}

/** Next whole hour after `now`. */
export function nextHour(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
}

/**
 * A new entry. `init` comes from the window that asked for it: a type
 * ("Schedule a Meeting" passes meeting), a start (the slot you double-
 * clicked), or a subject and description (Copy Into New Calendar Entry).
 */
export function blankEntry(init: Record<string, unknown>, id: string, now = Date.now()): CalendarEntry {
  const type = TYPES.includes(init.type as CalEntryType) ? (init.type as CalEntryType) : "appointment";
  const start = num(init.start) ?? nextHour(now);
  const end = num(init.end) ?? start + HOUR;
  const base: CalendarEntry = {
    id,
    type: "appointment",
    subject: str(init.subject),
    location: str(init.location),
    start,
    end: end > start ? end : start + HOUR,
    allDay: false,
    description: str(init.description),
    invitees: [],
    category: str(init.category),
    alarm: type === "meeting" || type === "reminder",
    alarmMinutes: type === "reminder" ? 0 : 15,
  };
  return retype(base, type);
}

export function toDraft(e: CalendarEntry): EntryDraft {
  return { ...e, inviteesText: e.invitees.map(inviteeText).join(", ") };
}

/** Turn the draft back into the document: parse invitees, tidy text, normalize times. */
export function fromDraft(
  d: EntryDraft,
  ctx: { me: Person; contacts?: Contact[]; groups?: ContactGroup[] },
): CalendarEntry {
  const { inviteesText, ...rest } = d;
  const e: CalendarEntry = {
    ...rest,
    subject: d.subject.trim(),
    location: d.location.trim(),
    category: d.category.trim(),
  };
  if (e.type === "meeting") {
    const parsed = parseAddressList(inviteesText, ctx.contacts, ctx.groups).filter((p) => !samePerson(p, ctx.me));
    const unique: ParsedAddress[] = [];
    for (const p of parsed) if (!unique.some((q) => samePerson(p, q))) unique.push(p);
    e.invitees = unique;
  }
  if (e.allDay) Object.assign(e, allDaySpan(e.start, e.type === "anniversary" ? e.start : e.end));
  else if (e.type === "reminder") e.end = e.start;
  if (e.alarm && e.alarmMinutes === undefined) e.alarmMinutes = 15;
  if (e.recurrence) e.recurrence = { ...e.recurrence, until: startOfDay(e.recurrence.until) + DAY - 1 };
  return e;
}

/** Why the form cannot be saved, or null. */
export function validateEntry(d: CalendarEntry): string | null {
  if (!d.subject.trim()) return "You must enter a subject for this calendar entry.";
  if (!Number.isFinite(d.start) || !Number.isFinite(d.end)) return "Please enter a valid date and time.";
  if (d.type !== "reminder") {
    if (d.allDay) {
      if (startOfDay(d.end) < startOfDay(d.start)) return "The end date must be on or after the begin date.";
    } else if (d.end <= d.start) return "The end time must be after the begin time.";
  }
  if (d.recurrence) {
    if (!Number.isFinite(d.recurrence.until)) return "Please enter the date the entry repeats until.";
    if (startOfDay(d.recurrence.until) < startOfDay(d.start)) return "The repeat end date must be on or after the begin date.";
  }
  return null;
}
