// ============================================================================
// Calendar & Scheduling: meeting notices that travel by mail, the invitee
// responses they trigger, and the free/busy data behind the Scheduler.
// Everything here is pure; the store applies the results.
// ============================================================================

import type {
  CalendarEntry,
  InviteeStatus,
  MailMessage,
  MeetingNotice,
  NoticeType,
  Person,
} from "./types";
import { makeMemo } from "./docs";
import { entriesOnDay } from "./calendarUtil";
import { fmtDate, fmtTime, startOfDay } from "../lib/format";

export interface Slot {
  start: number;
  end: number;
}

/** Working-day window the Scheduler shows and searches. */
export const WORK_START_HOUR = 8;
export const WORK_END_HOUR = 18;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function ymd(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * A colleague's busy time on a day. Deterministic per person and date, so the
 * Scheduler, the invitee's simulated answer and every re-render agree.
 */
export function busySlots(personName: string, dayMs: number): Slot[] {
  const day = startOfDay(dayMs);
  const dow = new Date(day).getDay();
  if (dow === 0 || dow === 6) return [];
  let h = hash(personName.toLowerCase() + "|" + ymd(day));
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return (h >>> 0) / 4294967296;
  };
  const count = 1 + Math.floor(next() * 3); // 1-3 blocks
  const slots: Slot[] = [];
  for (let i = 0; i < count; i++) {
    const startHalf = WORK_START_HOUR * 2 + Math.floor(next() * ((WORK_END_HOUR - WORK_START_HOUR) * 2 - 2));
    const lenHalf = 1 + Math.floor(next() * 4); // 30 min - 2 h
    const start = day + startHalf * 1800000;
    const end = Math.min(day + WORK_END_HOUR * 3600000, start + lenHalf * 1800000);
    slots.push({ start, end });
  }
  return mergeSlots(slots);
}

/** The user's own busy time from their calendar (timed entries only). */
export function myBusySlots(calendar: CalendarEntry[], dayMs: number, excludeId?: string): Slot[] {
  return mergeSlots(
    entriesOnDay(calendar, dayMs)
      .filter((e) => !e.allDay && e.type !== "reminder" && e.type !== "anniversary")
      .filter((e) => !excludeId || !e.id.startsWith(excludeId))
      .map((e) => ({ start: e.start, end: e.end })),
  );
}

export function mergeSlots(slots: Slot[]): Slot[] {
  const sorted = [...slots].sort((a, b) => a.start - b.start);
  const out: Slot[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

export function overlaps(slots: Slot[], start: number, end: number): boolean {
  return slots.some((s) => s.start < end && s.end > start);
}

/** First half-hour start in the working day when nobody is busy, or null. */
export function findFreeTime(everyone: Slot[][], dayMs: number, durationMin: number, notBefore = 0): number | null {
  const day = startOfDay(dayMs);
  const dur = durationMin * 60000;
  for (let t = day + WORK_START_HOUR * 3600000; t + dur <= day + WORK_END_HOUR * 3600000; t += 1800000) {
    if (t < notBefore) continue;
    if (everyone.every((slots) => !overlaps(slots, t, t + dur))) return t;
  }
  return null;
}

const SUBJECT_PREFIX: Record<NoticeType, string> = {
  invitation: "Invitation",
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Tentatively Accepted",
  delegated: "Delegated",
  counter: "Counter-proposal",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
};

/** "Invitation: Budget review (09/25/2026 02:00 PM)" */
export function noticeSubject(type: NoticeType, subject: string, start: number): string {
  return `${SUBJECT_PREFIX[type]}: ${subject} (${fmtDate(start)} ${fmtTime(start)})`;
}

/** The notice payload for a meeting entry. */
export function noticeFor(entry: CalendarEntry, type: NoticeType, chair: Person): MeetingNotice {
  return {
    type,
    entryId: entry.id,
    subject: entry.subject,
    location: entry.location,
    start: entry.start,
    end: entry.end,
    chair,
  };
}

/** A meeting notice memo from `from` to `to`. */
export function noticeMemo(
  notice: MeetingNotice,
  from: Person,
  to: Person[],
  body: string,
  now = Date.now(),
): MailMessage {
  const when = notice.proposedStart ?? notice.start;
  return makeMemo({
    from,
    to,
    subject: noticeSubject(notice.type, notice.subject, when),
    body,
    form: "Notice",
    notice,
    date: now,
    updatedBy: from.name,
  });
}

/** Human-readable meeting summary used in notice bodies. */
export function meetingSummary(n: MeetingNotice): string {
  const start = n.proposedStart ?? n.start;
  const end = n.proposedEnd ?? n.end;
  return (
    `When: ${fmtDate(start)} ${fmtTime(start)} - ${fmtTime(end)}\n` +
    `Where: ${n.location || "(not specified)"}\n` +
    `Chair: ${n.chair.name}`
  );
}

/**
 * How a simulated colleague answers an invitation: busy at that time means a
 * decline or a counter-proposal for the first free slot that day.
 */
export function colleagueResponse(
  colleague: Person,
  invitation: MeetingNotice,
  now: number,
  roll: number,
): MailMessage {
  const busy = busySlots(colleague.name, invitation.start);
  const conflict = overlaps(busy, invitation.start, invitation.end);
  let type: NoticeType;
  let proposedStart: number | undefined;
  let proposedEnd: number | undefined;
  if (conflict) {
    const duration = invitation.end - invitation.start;
    const free = findFreeTime([busy], invitation.start, duration / 60000, invitation.start);
    if (free !== null && roll < 0.6) {
      type = "counter";
      proposedStart = free;
      proposedEnd = free + duration;
    } else type = "declined";
  } else type = roll < 0.8 ? "accepted" : "tentative";

  const notice: MeetingNotice = { ...invitation, type, proposedStart, proposedEnd, response: undefined };
  const first = colleague.name.split(" ")[0];
  const bodies: Record<string, string> = {
    accepted: `I'll be there.\n\n${first}`,
    tentative: `I might have a conflict, but I'll try to make it.\n\n${first}`,
    declined: `Sorry, I can't make this one.\n\n${first}`,
    counter: `I'm booked then. Would ${fmtTime(proposedStart ?? 0)} work instead?\n\n${first}`,
  };
  return noticeMemo(notice, colleague, [invitation.chair], `${bodies[type]}\n\n${meetingSummary(notice)}`, now);
}

/** Chair side: record one invitee's response on the meeting entry. */
export function applyResponse(entry: CalendarEntry, response: MailMessage): CalendarEntry {
  const n = response.notice;
  if (!n) return entry;
  const statusFor: Partial<Record<NoticeType, InviteeStatus["status"]>> = {
    accepted: "accepted",
    declined: "declined",
    tentative: "tentative",
    delegated: "delegated",
    counter: "counter",
  };
  const status = statusFor[n.type];
  if (!status) return entry;
  const who = response.from;
  const list: InviteeStatus[] =
    entry.inviteeStatus ?? entry.invitees.map((p) => ({ person: p, status: "needs-action" as const }));
  let found = false;
  const next = list.map((s) => {
    if (s.person.email.toLowerCase() !== who.email.toLowerCase()) return s;
    found = true;
    return {
      ...s,
      status,
      delegate: n.delegate,
      proposedStart: n.proposedStart,
      proposedEnd: n.proposedEnd,
      comment: n.comment,
    };
  });
  if (!found) next.push({ person: who, status, delegate: n.delegate, proposedStart: n.proposedStart, proposedEnd: n.proposedEnd });
  return { ...entry, inviteeStatus: next };
}

/** Invitee side: the calendar entry created when you accept an invitation. */
export function entryFromNotice(n: MeetingNotice, invitees: Person[], response: "accepted" | "tentative"): CalendarEntry {
  const start = n.proposedStart ?? n.start;
  const end = n.proposedEnd ?? n.end;
  return {
    id: n.entryId,
    type: "meeting",
    subject: n.subject,
    location: n.location,
    start,
    end,
    allDay: false,
    description: "",
    invitees,
    category: "",
    alarm: true,
    alarmMinutes: 15,
    chair: n.chair,
    myResponse: response,
  };
}
