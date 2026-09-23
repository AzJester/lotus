// ============================================================================
// The calendar entry window (CalendarDocument). A new entry starts with the
// entry type radio buttons R5 put across the top (Appointment, Anniversary,
// Reminder, Event, Meeting); then Subject, When, Repeats, Where, Category,
// Notify me and Description, and for meetings the Chair, the Invitees, the
// Scheduler and, once invitations went out, the Invitee Status. Saving a
// meeting you chair offers to send the invitations (or the rescheduled
// notice when you moved it). A meeting someone else chairs is read-only
// apart from your own alarm; it shows the chair and how you responded.
// ============================================================================

import { useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { ActionBar } from "../../components/ActionBar";
import type { ActionItem } from "../../components/ActionBar";
import { Icon } from "../../components/Icon";
import { DocMissing, FieldRow, FieldTable, FormPage, FormSection, TextRow, useDocWindow } from "../../components/docform";
import { notesAlert, notesAsk } from "../../components/dialogs";
import { useTab } from "../../components/tabs";
import { useNotes } from "../../data/store";
import { requestClose, useUI } from "../../data/ui";
import type { CalEntryType, CalendarEntry, InviteeStatus, Person, RecurFreq } from "../../data/types";
import { notesName, parseAddressList } from "../../data/names";
import { fmtDate, fmtTime, startOfDay } from "../../lib/format";
import { respond } from "../mail/mailActions";
import { addressDialog } from "../mail/mailDialogs";
import {
  DAY,
  DEFAULT_HOUR,
  HOUR,
  MINUTE,
  TYPE_ICON,
  TYPE_LABEL,
  addMonths,
  alarmLeadText,
  atMinutes,
  dateValue,
  repeatText,
  timeValue,
  whenText,
  withDate,
  withTime,
} from "./calendarModel";
import {
  blankEntry,
  busyFor,
  conflictsWith,
  fromDraft,
  inviteeDiff,
  invitationsSent,
  isChair,
  isInvited,
  nextFreeStart,
  participantsFor,
  retype,
  samePerson,
  timeChanged,
  toDraft,
  validateEntry,
} from "./meetingModel";
import type { EntryDraft } from "./meetingModel";
import { copyIntoMemo, copyIntoTodo, currentUser, deleteEntries, sendNotices } from "./calendarActions";
import { InviteesField } from "./InviteesField";
import { InviteeStatusTable, Scheduler } from "./Scheduler";
import "../../styles/calendar.css";

/** The order R5 put the entry types in. */
const TYPE_ORDER: CalEntryType[] = ["appointment", "anniversary", "reminder", "event", "meeting"];

const ALARM_CHOICES = [0, 5, 10, 15, 30, 45, 60, 120, 1440];

const ui = () => useUI.getState();

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

/** Write the form to the store. What the store tracks by mail (responses) is never overwritten. */
function persistEntry(d: EntryDraft, me: Person, sendNow: boolean) {
  const s = useNotes.getState();
  const prev = s.calendar.find((e) => e.id === d.id);
  if (prev && isInvited(prev, me)) {
    // Only the chair changes an invitation; yours to keep is the alarm.
    s.updateCalendarEntry(prev.id, { alarm: d.alarm, alarmMinutes: d.alarmMinutes });
    return;
  }
  const entry = fromDraft(d, { me, contacts: s.contacts, groups: s.contactGroups });
  if (!prev) {
    s.addCalendarEntry({
      ...entry,
      chair: entry.type === "meeting" ? me : undefined,
      inviteeStatus: undefined,
      myResponse: undefined,
    });
    ui().setStatus(`"${entry.subject}" saved.`);
  } else {
    // Responses arrive by mail while the form is open and the store stamps every save,
    // so neither comes from the (possibly older) draft.
    const {
      inviteeStatus: _status,
      myResponse: _response,
      chair: _chair,
      created: _created,
      modified: _modified,
      seq: _seq,
      updatedBy: _by,
      ...patch
    } = entry;
    const changed = (Object.keys(patch) as (keyof typeof patch)[]).some(
      (k) => JSON.stringify(patch[k]) !== JSON.stringify(prev[k]),
    );
    if (changed) {
      s.updateCalendarEntry(d.id, patch);
      ui().setStatus(`"${entry.subject}" saved.`);
    }
  }
  void afterSave(prev, entry.id, sendNow);
}

/**
 * The questions Notes asks after a meeting you chair is saved: send the
 * invitations, notify the invitees of a new time, invite the people you
 * added, and tell the ones you removed.
 */
async function afterSave(prev: CalendarEntry | undefined, id: string, sendNow: boolean) {
  const me = currentUser();
  const saved = useNotes.getState().calendar.find((e) => e.id === id);
  if (!saved || !isChair(saved, me)) return;
  if (!invitationsSent(saved)) {
    if (!saved.invitees.length) return;
    if (sendNow || (await notesAsk("Do you want to send invitations to the invitees?", { title: "Send Invitations" }))) {
      sendNotices(id, "invitation");
    }
    return;
  }
  if (!prev) return;
  const names = (list: Person[]) => list.map((p) => p.name).join(", ");
  const diff = inviteeDiff(prev.invitees, saved.invitees);
  if (timeChanged(prev, saved) && diff.kept.length) {
    const ok = await notesAsk("You have changed the time of this meeting. Do you want to notify the invitees?", {
      title: "Reschedule Meeting",
    });
    if (ok) sendNotices(id, "rescheduled", diff.added.length ? diff.kept : undefined);
  }
  if (diff.added.length) {
    const ok = await notesAsk(`Do you want to send invitations to the people you added (${names(diff.added)})?`, {
      title: "Send Invitations",
    });
    if (ok) sendNotices(id, "invitation", diff.added);
  }
  if (diff.removed.length) {
    const ok = await notesAsk(
      `Do you want to send a cancellation notice to the people you removed (${names(diff.removed)})?`,
      { title: "Invitees Removed" },
    );
    if (ok) sendNotices(id, "cancelled", diff.removed);
  }
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** A form row holding several fields (each with its own brackets in edit mode). */
function MultiRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <tr className={"frow" + (className ? " " + className : "")}>
      <th>{label}</th>
      <td>
        <div className="cal-multi">{children}</div>
      </td>
    </tr>
  );
}

function DateField({ value, onChange, label }: { value: number; onChange: (ms: number) => void; label: string }) {
  return (
    <span className="nf-field cal-date-field">
      <input
        type="date"
        className="nf-input"
        aria-label={label}
        value={Number.isFinite(value) ? dateValue(value) : ""}
        onChange={(e) => {
          const next = withDate(Number.isFinite(value) ? value : atMinutes(Date.now(), DEFAULT_HOUR * 60), e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </span>
  );
}

function TimeField({ value, onChange, label }: { value: number; onChange: (ms: number) => void; label: string }) {
  return (
    <span className="nf-field cal-time-field">
      <input
        type="time"
        className="nf-input"
        aria-label={label}
        step={900}
        value={Number.isFinite(value) ? timeValue(value) : ""}
        onChange={(e) => {
          const next = withTime(Number.isFinite(value) ? value : startOfDay(Date.now()), e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </span>
  );
}

function TypeChooser({ id, value, onChange }: { id: string; value: CalEntryType; onChange: (t: CalEntryType) => void }) {
  return (
    <div className="cal-types" role="radiogroup" aria-label="Entry type">
      {TYPE_ORDER.map((t) => (
        <label key={t} className={"cal-type" + (value === t ? " on" : "")}>
          <input type="radio" name={"cal-type-" + id} checked={value === t} onChange={() => onChange(t)} />
          <Icon name={TYPE_ICON[t]} />
          <span>{TYPE_LABEL[t]}</span>
        </label>
      ))}
    </div>
  );
}

/** Begins / Ends (or the reminder's one time, or the all-day dates). */
function WhenRows({ d, set }: { d: EntryDraft; set: (patch: Partial<EntryDraft>) => void }) {
  const moveStart = (start: number) => set({ start, end: d.type === "reminder" ? start : start + (d.end - d.start) });
  const canAllDay = d.type === "event" || d.type === "anniversary";
  const badEnd = d.type !== "reminder" && (d.allDay ? startOfDay(d.end) < startOfDay(d.start) : d.end <= d.start);
  const allDayBox = canAllDay && (
    <label className="cal-check">
      <input
        type="checkbox"
        checked={d.allDay}
        onChange={(e) =>
          set(
            e.target.checked
              ? { allDay: true, start: startOfDay(d.start), end: atMinutes(d.type === "anniversary" ? d.start : d.end, 23 * 60 + 59) }
              : { allDay: false, start: atMinutes(d.start, DEFAULT_HOUR * 60), end: atMinutes(d.start, DEFAULT_HOUR * 60) + HOUR },
          )
        }
      />
      All day
    </label>
  );
  if (d.type === "reminder") {
    return (
      <MultiRow label="When">
        <DateField label="Date" value={d.start} onChange={moveStart} />
        <TimeField label="Time" value={d.start} onChange={moveStart} />
      </MultiRow>
    );
  }
  if (d.allDay && d.type === "anniversary") {
    return (
      <MultiRow label="Date">
        <DateField label="Date" value={d.start} onChange={moveStart} />
        {allDayBox}
      </MultiRow>
    );
  }
  return (
    <>
      <MultiRow label="Begins">
        <DateField label="Begin date" value={d.start} onChange={moveStart} />
        {!d.allDay && <TimeField label="Begin time" value={d.start} onChange={moveStart} />}
        {allDayBox}
      </MultiRow>
      <MultiRow label="Ends">
        <DateField label="End date" value={d.end} onChange={(end) => set({ end })} />
        {!d.allDay && <TimeField label="End time" value={d.end} onChange={(end) => set({ end })} />}
        {badEnd && <span className="cal-bad">The end must be after the beginning.</span>}
      </MultiRow>
    </>
  );
}

function RepeatRow({ d, editing, set }: { d: EntryDraft; editing: boolean; set: (patch: Partial<EntryDraft>) => void }) {
  if (!editing) {
    return (
      <FieldRow label="Repeats" editing={false} read={repeatText(d.recurrence)}>
        {null}
      </FieldRow>
    );
  }
  const defaultUntil = (freq: RecurFreq) =>
    startOfDay(addMonths(d.start, freq === "daily" ? 1 : freq === "weekly" ? 3 : 12)) + DAY - 1;
  return (
    <MultiRow label="Repeats">
      <span className="nf-field cal-repeat-field">
        <select
          className="nf-input"
          aria-label="Repeats"
          value={d.recurrence?.freq ?? "none"}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "none") set({ recurrence: undefined });
            else {
              const freq = v as RecurFreq;
              set({ recurrence: { freq, until: d.recurrence?.until ?? defaultUntil(freq) } });
            }
          }}
        >
          <option value="none">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </span>
      {d.recurrence && (
        <>
          <span className="cal-word">until</span>
          <DateField
            label="Repeat until"
            value={d.recurrence.until}
            onChange={(until) => set({ recurrence: { ...d.recurrence!, until: startOfDay(until) + DAY - 1 } })}
          />
        </>
      )}
    </MultiRow>
  );
}

function AlarmControls({ d, onChange }: { d: CalendarEntry; onChange: (patch: Partial<CalendarEntry>) => void }) {
  const minutes = d.alarmMinutes ?? 15;
  const choices = ALARM_CHOICES.includes(minutes) ? ALARM_CHOICES : [...ALARM_CHOICES, minutes].sort((a, b) => a - b);
  return (
    <>
      <label className="cal-check">
        <input type="checkbox" checked={d.alarm} onChange={(e) => onChange({ alarm: e.target.checked, alarmMinutes: minutes })} />
        Notify me
      </label>
      <span className="nf-field cal-alarm-field">
        <select
          className="nf-input"
          aria-label="Minutes before"
          disabled={!d.alarm}
          value={minutes}
          onChange={(e) => onChange({ alarmMinutes: Number(e.target.value), alarm: true })}
        >
          {choices.map((m) => (
            <option key={m} value={m}>
              {alarmLeadText(m)}
            </option>
          ))}
        </select>
      </span>
    </>
  );
}

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

export function CalendarDocument() {
  const { tab } = useTab();
  const id = tab.doc?.id ?? "";
  const isNewTab = !!tab.isNew;
  const stored = useNotes((s) => (isNewTab ? undefined : s.calendar.find((e) => e.id === id)));
  const calendar = useNotes((s) => s.calendar);
  const contacts = useNotes((s) => s.contacts);
  const groups = useNotes((s) => s.contactGroups);
  const user = useNotes((s) => s.user);
  const invitation = useNotes((s) =>
    s.mail.find(
      (m) =>
        m.notice?.entryId === id &&
        (m.notice.type === "invitation" || m.notice.type === "rescheduled") &&
        m.from.email.toLowerCase() !== s.user.email.toLowerCase(),
    ),
  );
  const me = useMemo(() => ({ name: user.name, email: user.email }), [user.name, user.email]);
  const docDraft = useMemo(() => (stored ? toDraft(stored) : undefined), [stored]);
  const sendNow = useRef(false);

  const w = useDocWindow<EntryDraft>({
    coll: "calendar",
    doc: docDraft,
    blank: (init, newId) => toDraft(blankEntry(init, newId)),
    title: (d) => d.subject.trim() || (isNewTab ? (d.type === "meeting" ? "New Meeting" : "New Calendar Entry") : "(Untitled)"),
    persist: (d) => persistEntry(d, me, sendNow.current),
    validate: validateEntry,
    readOnly: (d) =>
      isInvited(d, me) ? `${d.chair?.name ?? "The chair"} chairs this meeting; only the chair can change it. You can still set your alarm.` : null,
  });

  const d = w.draft;
  const editing = w.editing;
  const invited = isInvited(d, me);
  const meeting = d.type === "meeting";
  const chairing = meeting && !invited;
  const sent = !!stored && invitationsSent(stored);
  const invitees = useMemo(
    () => (meeting ? parseAddressList(d.inviteesText, contacts, groups).filter((p) => !samePerson(p, me)) : []),
    [meeting, d.inviteesText, contacts, groups, me],
  );
  const people = useMemo(() => participantsFor(invitees, me, contacts, groups), [invitees, me, contacts, groups]);

  if (w.missing) return <DocMissing />;

  const set = w.set;

  const saveAndSend = async () => {
    sendNow.current = true;
    try {
      if (await w.save()) w.closeNow();
    } finally {
      sendNow.current = false;
    }
  };

  const findFreeTime = () => {
    if (!Number.isFinite(d.start) || !Number.isFinite(d.end) || d.end <= d.start) {
      void notesAlert("Enter a begin and end time first.", { icon: "warning" });
      return;
    }
    const all = useNotes.getState().calendar;
    const busyOn = (day: number) => people.map((p) => busyFor(p, day, all, d.id) ?? []);
    const clash = people.some((p) => conflictsWith(busyFor(p, startOfDay(d.start), all, d.id), d.start, d.end).length > 0);
    const halfHour = 30 * MINUTE;
    const soon = Math.ceil(Date.now() / halfHour) * halfHour;
    const duration = d.end - d.start;
    const t = nextFreeStart(busyOn, Math.max(soon, clash ? d.start : d.start + halfHour), duration);
    if (t === null) {
      void notesAlert("There is no time in the next two weeks when everyone is free for a meeting this long.", { icon: "info" });
      return;
    }
    if (!editing) w.beginEdit();
    set({ start: t, end: t + duration });
    ui().setStatus(`Everyone is free ${fmtDate(t)} ${fmtTime(t)} - ${fmtTime(t + duration)}.`);
  };

  const acceptProposal = async (st: InviteeStatus) => {
    const ps = st.proposedStart;
    const pe = st.proposedEnd;
    if (ps === undefined || pe === undefined) return;
    const ok = await notesAsk(
      `Move this meeting to ${fmtDate(ps)} ${fmtTime(ps)} - ${fmtTime(pe)}, as ${st.person.name} proposed, and send a rescheduled notice to the invitees?`,
      { title: "Accept Proposal" },
    );
    if (!ok) return;
    const s = useNotes.getState();
    const cur = s.calendar.find((e) => e.id === d.id);
    if (!cur) return;
    s.updateCalendarEntry(cur.id, { start: ps, end: pe });
    sendNotices(cur.id, "rescheduled");
    // The person who asked for this time has agreed to it.
    const after = useNotes.getState().calendar.find((e) => e.id === cur.id);
    if (after?.inviteeStatus) {
      s.updateCalendarEntry(cur.id, {
        inviteeStatus: after.inviteeStatus.map((x) => (samePerson(x.person, st.person) ? { ...x, status: "accepted" as const } : x)),
      });
    }
    if (editing) set({ start: ps, end: pe });
  };

  const del = async () => {
    if (await deleteEntries([d.id])) w.closeNow();
  };

  const answer = async (action: "accept" | "tentative" | "decline" | "delegate" | "counter") => {
    if (!invitation) return;
    await respond(invitation, action);
    if (action === "decline" && !useNotes.getState().calendar.some((e) => e.id === d.id)) w.closeNow();
  };

  // --- actions ----------------------------------------------------------------
  const copyInto: ActionItem = {
    id: "copyinto",
    label: "Copy Into New",
    icon: "copy-into",
    disabled: w.isNew,
    children: [
      { id: "ci-memo", label: "Memo", run: () => stored && copyIntoMemo(stored) },
      { id: "ci-todo", label: "To Do", run: () => stored && copyIntoTodo(stored) },
    ],
  };
  const actions: ActionItem[] = editing
    ? [
        { id: "saveclose", label: "Save & Close", icon: "save", run: () => void w.saveAndClose() },
        chairing &&
          !sent && {
            id: "savesend",
            label: "Save & Send Invitations",
            icon: "send",
            disabled: !invitees.length,
            run: () => void saveAndSend(),
          },
        chairing && { id: "findfree", label: "Find Free Time", icon: "scheduler", run: findFreeTime },
        "sep",
        !w.isNew && copyInto,
        w.isNew
          ? { id: "cancel", label: "Cancel", icon: "discard", run: () => void requestClose(tab.id) }
          : { id: "delete", label: "Delete", icon: "trash", run: () => void del() },
      ]
    : [
        !invited && { id: "edit", label: "Edit", icon: "edit", run: w.beginEdit, accel: "Ctrl+E" },
        chairing &&
          !sent &&
          (stored?.invitees.length ?? 0) > 0 && {
            id: "send",
            label: "Send Invitations",
            icon: "send",
            run: () => sendNotices(d.id, "invitation"),
          },
        invited &&
          !!invitation && {
            id: "respond",
            label: "Respond",
            icon: "invitation",
            children: [
              d.myResponse === "tentative"
                ? { id: "r-acc", label: "Accept", run: () => void answer("accept") }
                : { id: "r-ten", label: "Tentatively Accept", run: () => void answer("tentative") },
              { id: "r-dec", label: "Decline", run: () => void answer("decline") },
              { id: "r-ctr", label: "Propose New Time...", run: () => void answer("counter") },
              { id: "r-del", label: "Delegate...", run: () => void answer("delegate") },
            ],
          },
        "sep",
        copyInto,
        { id: "delete", label: "Delete", icon: "trash", run: () => void del() },
      ];

  // --- the form ------------------------------------------------------------------
  const chair = meeting ? d.chair ?? me : null;
  const formName = w.isNew && editing ? (meeting ? "Meeting" : "Calendar Entry") : TYPE_LABEL[d.type];

  return (
    <div className="app cal-doc-window">
      <ActionBar actions={actions} />
      <FormPage
        form={formName}
        icon={TYPE_ICON[d.type]}
        editing={editing}
        onEdit={invited ? undefined : w.beginEdit}
        className={"cal-doc cal-doc-" + d.type}
      >
        {editing && w.isNew && (
          <TypeChooser
            id={d.id}
            value={d.type}
            onChange={(t) => {
              const next = retype(d, t);
              set({ type: next.type, allDay: next.allDay, start: next.start, end: next.end });
            }}
          />
        )}
        {invited && (
          <div className="cal-invited">
            <Icon name={d.myResponse === "tentative" ? "tentative" : "accept"} />
            <span>
              {chair?.name} invited you to this meeting. You {d.myResponse === "tentative" ? "tentatively accepted" : "accepted"}.
            </span>
          </div>
        )}
        <FieldTable>
          <TextRow label="Subject" value={d.subject} editing={editing} onChange={(v) => set({ subject: v })} autoFocus={w.isNew} />
          {editing ? (
            <WhenRows d={d} set={set} />
          ) : (
            <FieldRow label="When" editing={false} read={Number.isFinite(d.start) ? whenText(d) : ""}>
              {null}
            </FieldRow>
          )}
          <RepeatRow d={d} editing={editing} set={set} />
          <TextRow label="Where" value={d.location} editing={editing} onChange={(v) => set({ location: v })} />
          <TextRow label="Category" value={d.category} editing={editing} onChange={(v) => set({ category: v })} />
          {editing ? (
            <MultiRow label="Notify me">
              <AlarmControls d={d} onChange={set} />
            </MultiRow>
          ) : invited ? (
            <MultiRow label="Notify me" className="cal-live">
              <AlarmControls
                d={d}
                onChange={(patch) => {
                  useNotes.getState().updateCalendarEntry(d.id, patch);
                  ui().setStatus("Your alarm for this meeting was updated.");
                }}
              />
            </MultiRow>
          ) : (
            <FieldRow label="Notify me" editing={false} read={d.alarm ? alarmLeadText(d.alarmMinutes ?? 15) : "Off"}>
              {null}
            </FieldRow>
          )}
          {meeting && (
            <FieldRow label="Chair" editing={false} read={chair ? notesName(chair) : ""}>
              {null}
            </FieldRow>
          )}
          {meeting &&
            (editing ? (
              <tr className="frow wide">
                <th>Invitees</th>
                <td>
                  <InviteesField
                    value={d.inviteesText}
                    onChange={(v) => set({ inviteesText: v })}
                    onAddress={async () => {
                      const split = d.inviteesText.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
                      const pick = await addressDialog({ to: split, cc: [], bcc: [] }, { title: "Select Invitees" });
                      if (pick) set({ inviteesText: [...pick.to, ...pick.cc, ...pick.bcc].join(", ") });
                    }}
                  />
                </td>
              </tr>
            ) : (
              <FieldRow label="Invitees" editing={false} read={d.invitees.map((p) => (p.email ? notesName(p) : p.name)).join(", ") || "(none)"}>
                {null}
              </FieldRow>
            ))}
          {invited && (
            <FieldRow label="Your response" editing={false} read={d.myResponse === "tentative" ? "Tentatively accepted" : "Accepted"}>
              {null}
            </FieldRow>
          )}
          {editing ? (
            <tr className="frow wide">
              <th>Description</th>
              <td>
                <span className="nf-field cal-desc-field">
                  <textarea
                    className="nf-input cal-desc"
                    rows={6}
                    value={d.description}
                    aria-label="Description"
                    onChange={(e) => set({ description: e.target.value })}
                  />
                </span>
              </td>
            </tr>
          ) : (
            <tr className="frow wide">
              <th>Description</th>
              <td>
                <div className="cal-desc-read">{d.description}</div>
              </td>
            </tr>
          )}
        </FieldTable>

        {chairing && (
          <FormSection title="Scheduler">
            <Scheduler
              start={d.start}
              end={d.end}
              participants={people}
              calendar={calendar}
              excludeId={d.id}
              canChange={editing}
              onPick={(start) => set({ start, end: start + Math.max(15 * MINUTE, d.end - d.start) })}
              onFindFree={findFreeTime}
            />
          </FormSection>
        )}
        {chairing && sent && stored?.inviteeStatus && (
          <FormSection title="Invitee Status">
            <InviteeStatusTable statuses={stored.inviteeStatus} onAccept={(st) => void acceptProposal(st)} />
          </FormSection>
        )}
        {chairing && !sent && !w.isNew && invitees.length > 0 && !editing && (
          <div className="cal-unsent">
            <Icon name="info" /> Invitations have not been sent yet. Choose Send Invitations to mail them.
          </div>
        )}
      </FormPage>
    </div>
  );
}
