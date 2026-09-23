// ============================================================================
// Calendar actions shared by the view window and the entry windows: opening
// and creating entries, deleting them (a meeting you chair can send its
// invitees a cancellation notice, one you were invited to can tell the chair
// you will not come), rescheduling by drag (with the notify question for
// meetings whose invitations went out), meeting notices, Copy Into New,
// DocLinks, the right-click menu and the Go To dialog.
// ============================================================================

import { useState } from "react";
import type { CalEntryType, CalendarEntry, MailMessage, Person } from "../../data/types";
import { useNotes } from "../../data/store";
import type { SendOutcome } from "../../data/store";
import { useUI } from "../../data/ui";
import { expandEntry, masterIdOf } from "../../data/calendarUtil";
import { meetingSummary, noticeFor, noticeMemo } from "../../data/scheduling";
import { NotesDialog, notesAlert, notesAsk, notesConfirm, openDialog } from "../../components/dialogs";
import type { MenuItem } from "../../components/menu";
import { copyDocumentLink } from "../../components/RichText";
import { openDocumentProperties } from "../../shell/dialogs/Properties";
import { textToHtml } from "../../lib/sanitize";
import { respond } from "../mail/mailActions";
import { fmtDate, fmtTime, startOfDay } from "../../lib/format";
import { TYPE_LABEL, addDays, parseGoTo, whenText } from "./calendarModel";
import { invitationsSent, isChair, isInvited } from "./meetingModel";

const ui = () => useUI.getState();
const notes = () => useNotes.getState();

/** You, as the chair or an invitee. */
export function currentUser(): Person {
  const u = notes().user;
  return { name: u.name, email: u.email };
}

/** The stored document behind an entry or one of its repeat instances. */
export function masterOf(id: string): CalendarEntry | undefined {
  const mid = masterIdOf(id);
  return notes().calendar.find((e) => e.id === mid);
}

const subjectOf = (e: CalendarEntry) => e.subject.trim() || "(Untitled)";

// ---------------------------------------------------------------------------
// Opening and creating
// ---------------------------------------------------------------------------

/** Open an entry in its own window. A repeat instance opens the series. */
export function openEntry(e: CalendarEntry) {
  const master = masterOf(e.id) ?? e;
  ui().openDocument({ coll: "calendar", id: master.id }, { title: subjectOf(master) });
}

/** A new entry window (in edit mode) of the given type, optionally at a time. */
export function newEntry(type: CalEntryType = "appointment", init: Record<string, unknown> = {}) {
  const title = type === "meeting" ? "New Meeting" : `New ${TYPE_LABEL[type]}`;
  ui().newDocument("calendar", { type, ...init }, { title });
}

// ---------------------------------------------------------------------------
// Meeting notices
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** Status bar message for notices handed to the router. */
export function reportNotices(out: SendOutcome, sent: number, what: string) {
  const status = out.queued
    ? `${what} placed in Outgoing Mail. They will be sent the next time you replicate.`
    : out.failures.length
      ? `${what} sent. ${plural(out.failures.length, "name was", "names were")} not found; a Delivery Failure Report will follow.`
      : `${what} sent to ${plural(sent, "invitee")}.`;
  ui().setStatus(status);
}

/** Mail meeting notices for a meeting you chair (all invitees, or `only`). */
export function sendNotices(entryId: string, kind: "invitation" | "rescheduled" | "cancelled", only?: Person[]) {
  const entry = notes().calendar.find((e) => e.id === entryId);
  if (!entry) return;
  const out = notes().sendInvitations(entryId, kind, only);
  const what = kind === "invitation" ? "Invitations" : kind === "rescheduled" ? "Rescheduled notices" : "Cancellation notices";
  reportNotices(out, out.recipients ?? (only?.length ? only.length : entry.invitees.length), what);
}

/** The invitation (or latest reschedule) you received for a meeting on your calendar. */
export function invitationFor(entryId: string, mail = notes().mail, myEmail = notes().user.email): MailMessage | undefined {
  const mine = myEmail.toLowerCase();
  let best: MailMessage | undefined;
  for (const m of mail) {
    const n = m.notice;
    if (!n || n.entryId !== entryId || (n.type !== "invitation" && n.type !== "rescheduled")) continue;
    if (m.from.email.toLowerCase() === mine) continue;
    if (!best || m.date > best.date) best = m;
  }
  return best;
}

/** Tell the chair you will not attend (and take the meeting off your calendar). */
async function declineMeeting(e: CalendarEntry) {
  const memo = invitationFor(e.id);
  if (memo) {
    // Mail's responder marks the invitation as declined and removes the entry.
    await respond(memo, "decline");
  }
  if (notes().calendar.some((x) => x.id === e.id)) {
    if (!memo && e.chair) {
      const self = currentUser();
      const notice = { ...noticeFor(e, "declined", e.chair), type: "declined" as const };
      notes().sendMemo(noticeMemo(notice, self, [e.chair], `Sorry, I can't make it.\n\n${meetingSummary(notice)}`), {
        saveCopy: false,
      });
    }
    notes().deleteCalendarEntry(e.id);
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete entries after asking. Repeat instances delete their whole series.
 * Resolves true when something was deleted.
 */
export async function deleteEntries(ids: string[]): Promise<boolean> {
  const seen = new Set<string>();
  const masters: CalendarEntry[] = [];
  for (const id of ids) {
    const m = masterOf(id);
    if (m && !seen.has(m.id)) {
      seen.add(m.id);
      masters.push(m);
    }
  }
  if (!masters.length) {
    ui().setStatus("No document is selected.");
    return false;
  }
  const me = currentUser();
  const chaired = masters.filter((e) => isChair(e, me) && invitationsSent(e) && e.invitees.length > 0);
  const invited = masters.filter((e) => isInvited(e, me));
  let cancel = false;
  let decline = false;

  if (masters.length === 1) {
    const e = masters[0];
    const repeats = e.recurrence ? ` It repeats: all ${expandEntry(e).length} instances will be deleted.` : "";
    if (chaired.length) {
      const b = await notesConfirm(
        `"${subjectOf(e)}" is a meeting you chair. Do you want to send a cancellation notice to the invitees?${repeats}`,
        { title: "Delete Meeting", buttons: ["Yes", "No", "Cancel"] },
      );
      if (b === "Cancel") return false;
      cancel = b === "Yes";
    } else if (invited.length) {
      const b = await notesConfirm(
        `"${subjectOf(e)}" was called by ${e.chair!.name}. Do you want to tell the chair that you will not attend?`,
        { title: "Delete Meeting", buttons: ["Yes", "No", "Cancel"] },
      );
      if (b === "Cancel") return false;
      decline = b === "Yes";
    } else if (!(await notesAsk(`Do you want to delete "${subjectOf(e)}"?${repeats}`, { title: "Delete" }))) {
      return false;
    }
  } else {
    if (!(await notesAsk(`Do you want to delete the ${masters.length} selected calendar entries?`, { title: "Delete" }))) {
      return false;
    }
    if (chaired.length) {
      cancel = await notesAsk(
        `${chaired.length === 1 ? "One of them is a meeting" : `${chaired.length} of them are meetings`} you chair. ` +
          "Do you want to send cancellation notices to the invitees?",
        { title: "Delete Meetings" },
      );
    }
    if (invited.length) {
      decline = await notesAsk(
        `${invited.length === 1 ? "One of them is a meeting" : `${invited.length} of them are meetings`} you were invited to. ` +
          "Do you want to tell the chairs that you will not attend?",
        { title: "Delete Meetings" },
      );
    }
  }

  let notified = 0;
  for (const e of masters) {
    if (cancel && chaired.includes(e)) {
      notes().sendInvitations(e.id, "cancelled");
      notified++;
    }
    if (decline && invited.includes(e)) {
      await declineMeeting(e);
      notified++;
      continue;
    }
    notes().deleteCalendarEntry(e.id);
  }
  const what = masters.length === 1 ? `"${subjectOf(masters[0])}" deleted.` : `${masters.length} calendar entries deleted.`;
  const extra = cancel ? " Cancellation notices sent." : decline ? " The chair has been told you will not attend." : "";
  ui().setStatus(what + (notified ? extra : ""));
  return true;
}

// ---------------------------------------------------------------------------
// Reschedule (drag in the calendar)
// ---------------------------------------------------------------------------

/**
 * Move an entry (or resize it) to a new start and end. A repeat instance
 * moves the whole series by the same amount. Meetings you chair whose
 * invitations went out ask whether to send a rescheduled notice.
 */
export async function rescheduleEntry(occ: CalendarEntry, start: number, end: number): Promise<boolean> {
  const master = masterOf(occ.id);
  if (!master) return false;
  const me = currentUser();
  const subject = subjectOf(master);
  if (isInvited(master, me)) {
    await notesAlert(
      `"${subject}" is chaired by ${master.chair!.name}. Only the chair can reschedule it; open the invitation and choose Propose New Time to suggest another time.`,
      { icon: "info" },
    );
    return false;
  }
  const delta = start - occ.start;
  const stretch = end - start - (occ.end - occ.start);
  if (!delta && !stretch) return false;
  if (master.recurrence) {
    const ok = await notesAsk(`"${subject}" repeats. Changing this instance changes every instance in the series. Do you want to continue?`, {
      title: "Repeating Entry",
    });
    if (!ok) return false;
  }
  let notify = false;
  if (isChair(master, me) && invitationsSent(master) && master.invitees.length) {
    const b = await notesConfirm("You have changed the time of this meeting. Do you want to send a rescheduled notice to the invitees?", {
      title: "Reschedule Meeting",
      buttons: ["Yes", "No", "Cancel"],
    });
    if (b === "Cancel") return false;
    notify = b === "Yes";
  }
  const days = Math.round((startOfDay(start) - startOfDay(occ.start)) / 86400000);
  notes().updateCalendarEntry(master.id, {
    start: master.start + delta,
    end: master.end + delta + stretch,
    recurrence: master.recurrence ? { ...master.recurrence, until: addDays(master.recurrence.until, days) } : undefined,
  });
  if (notify) sendNotices(master.id, "rescheduled");
  else {
    const when = master.allDay ? fmtDate(start) : `${fmtDate(start)} ${fmtTime(start)} - ${fmtTime(end)}`;
    ui().setStatus(`"${subject}" moved to ${when}.`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Copy Into New, DocLinks, Properties
// ---------------------------------------------------------------------------

/** The entry as plain text, for Copy Into New. */
export function entrySummary(e: CalendarEntry): string {
  const lines = [`${TYPE_LABEL[e.type]}: ${subjectOf(e)}`, `When: ${whenText(e)}`];
  if (e.location) lines.push(`Where: ${e.location}`);
  if (e.type === "meeting") {
    if (e.chair) lines.push(`Chair: ${e.chair.name}`);
    if (e.invitees.length) lines.push(`Invitees: ${e.invitees.map((p) => p.name).join(", ")}`);
  }
  return lines.join("\n") + (e.description ? `\n\n${e.description}` : "");
}

export function copyIntoMemo(e: CalendarEntry) {
  const master = masterOf(e.id) ?? e;
  ui().newDocument("mail", { subject: master.subject, bodyHtml: textToHtml(entrySummary(master)) }, { title: master.subject || "New Memo" });
  ui().setStatus("Copied into a new memo.");
}

export function copyIntoTodo(e: CalendarEntry) {
  const master = masterOf(e.id) ?? e;
  ui().copyToTodo({ subject: master.subject, description: entrySummary(master) });
}

/** Edit > Copy as Link > Document Link. */
export function copyEntryLink(e: CalendarEntry) {
  const master = masterOf(e.id) ?? e;
  copyDocumentLink({ coll: "calendar", id: master.id, title: subjectOf(master) });
}

export function entryProperties(e: CalendarEntry) {
  void openDocumentProperties("calendar", masterIdOf(e.id));
}

/** The right-click menu of an entry (`ids`: everything the action applies to). */
export function entryMenu(e: CalendarEntry, ids: string[] = [e.id]): MenuItem[] {
  return [
    { label: "&Open", run: () => openEntry(e) },
    { sep: true },
    { label: "&Delete", accel: "Del", run: () => void deleteEntries(ids) },
    { sep: true },
    { label: "Copy Into New &Memo", run: () => copyIntoMemo(e) },
    { label: "Copy Into New &To Do", run: () => copyIntoTodo(e) },
    { label: "Copy as &Link", run: () => copyEntryLink(e) },
    { sep: true },
    { label: "Document &Properties...", accel: "Alt+Enter", run: () => entryProperties(e) },
  ];
}

// ---------------------------------------------------------------------------
// Go To
// ---------------------------------------------------------------------------

function GoTo({ initial, close }: { initial: number; close: (v: number | null) => void }) {
  const [text, setText] = useState(fmtDate(initial));
  const [problem, setProblem] = useState(false);
  const ok = () => {
    const d = parseGoTo(text);
    if (d === null) setProblem(true);
    else close(d);
  };
  return (
    <NotesDialog
      title="Go To"
      onClose={() => close(null)}
      width={340}
      footer={
        <>
          <button className="btn primary" onClick={ok}>
            OK
          </button>
          <button className="btn" onClick={() => close(startOfDay(Date.now()))}>
            Today
          </button>
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
        </>
      }
    >
      <label className="prompt-label">
        Go to date:
        <input
          type="text"
          className="prompt-input"
          value={text}
          data-autofocus
          onChange={(e) => {
            setText(e.target.value);
            setProblem(false);
          }}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              ok();
            }
          }}
        />
      </label>
      <div className={problem ? "prio-high cal-goto-hint" : "muted cal-goto-hint"}>
        {problem ? "That is not a date. " : ""}Type a date such as {fmtDate(Date.now())}, or "today".
      </div>
    </NotesDialog>
  );
}

/** The Go To dialog: resolves with the day picked, or null. */
export function goToDialog(initial: number): Promise<number | null> {
  return openDialog<number | null>((close) => <GoTo initial={initial} close={close} />);
}
