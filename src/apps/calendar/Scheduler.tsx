// ============================================================================
// The meeting form's Scheduler and Invitee Status. The Scheduler is the
// free time timeline for the meeting's day, 8 AM to 6 PM: a row for you
// (from your own calendar) and one for every invitee (from the Domino
// Directory's free time data), the proposed meeting drawn across all rows,
// busy time that collides with it in red, and Find Free Time. Invitee
// Status lists how each invitee answered, with the time and comment of a
// counter-proposal and a button to accept it.
// ============================================================================

import type { CSSProperties, MouseEvent } from "react";
import type { CalendarEntry, InviteeStatus } from "../../data/types";
import { WORK_END_HOUR, WORK_START_HOUR } from "../../data/scheduling";
import type { Slot } from "../../data/scheduling";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { notesName } from "../../data/names";
import { fmtDate, fmtTime, startOfDay } from "../../lib/format";
import { hourLabel, longDate } from "./calendarModel";
import { STATUS_LABEL, busyFor, conflictsWith, statusSummary, timelineFraction, timelineTime } from "./meetingModel";
import type { Participant } from "./meetingModel";

const pct = (f: number) => `${(f * 100).toFixed(3)}%`;

export function Scheduler({
  start,
  end,
  participants,
  calendar,
  excludeId,
  canChange,
  onPick,
  onFindFree,
}: {
  start: number;
  end: number;
  participants: Participant[];
  calendar: CalendarEntry[];
  /** The meeting itself (left out of your own busy time). */
  excludeId: string;
  /** Clicking the timeline moves the meeting (edit mode). */
  canChange: boolean;
  onPick: (start: number) => void;
  onFindFree: () => void;
}) {
  const day = startOfDay(start);
  const valid = Number.isFinite(start) && Number.isFinite(end);
  const rows = participants.map((p) => {
    const slots = valid ? busyFor(p, day, calendar, excludeId) : null;
    return { p, slots, conflicts: valid ? conflictsWith(slots, start, end) : [] };
  });
  const clashing = rows.filter((r) => r.conflicts.length);
  const unknown = rows.filter((r) => r.slots === null);
  const hours = Array.from({ length: WORK_END_HOUR - WORK_START_HOUR + 1 }, (_, i) => WORK_START_HOUR + i);
  const left = valid ? timelineFraction(start, day) : 0;
  const right = valid ? timelineFraction(Math.max(end, start + 15 * 60000), day) : 0;
  const outside = valid && (right <= 0 || left >= 1);
  const band: CSSProperties = { left: pct(left), width: pct(Math.max(right - left, 0.004)) };

  const pick = (ev: MouseEvent<HTMLDivElement>) => {
    if (!canChange) return;
    const r = ev.currentTarget.getBoundingClientRect();
    onPick(timelineTime((ev.clientX - r.left) / r.width, day));
  };

  const busyBlock = (s: Slot, conflict: boolean, i: number) => {
    const a = timelineFraction(s.start, day);
    const b = timelineFraction(s.end, day);
    if (b <= a) return null;
    return (
      <span
        key={i}
        className={"cal-sched-busy" + (conflict ? " conflict" : "")}
        style={{ left: pct(a), width: pct(b - a) }}
        title={`Busy ${fmtTime(s.start)} - ${fmtTime(s.end)}${conflict ? " (conflicts with this meeting)" : ""}`}
      />
    );
  };

  return (
    <div className="cal-sched">
      <div className="cal-sched-bar">
        <span className="cal-sched-day">{valid ? longDate(start) : "Enter a valid time"}</span>
        {valid && (
          <span className="cal-sched-when">
            {fmtTime(start)} - {fmtTime(end)}
          </span>
        )}
        <button type="button" className="btn cal-sched-find" onClick={onFindFree} disabled={!valid}>
          <Icon name="scheduler" /> Find Free Time
        </button>
      </div>
      <div className="cal-sched-grid">
        <div className="cal-sched-row cal-sched-hours" aria-hidden="true">
          <div className="cal-sched-name" />
          <div className="cal-sched-track">
            {hours.map((h, i) => (
              <span key={h} className="cal-sched-hour" style={{ left: pct(i / (hours.length - 1)) }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>
        </div>
        <div className="cal-sched-rows">
          {rows.map(({ p, slots, conflicts }) => (
            <div
              key={p.key}
              className={"cal-sched-row" + (conflicts.length ? " has-conflict" : "") + (slots === null ? " no-info" : "")}
            >
              <div className="cal-sched-name" title={p.note ?? notesName(p.person)}>
                <Icon name={conflicts.length ? "warning" : p.kind === "none" ? "question" : "person"} />
                <span className="cal-sched-person">{p.person.name || p.person.email}</span>
                {p.kind === "me" && <span className="cal-sched-tag">Chair</span>}
              </div>
              <div className={"cal-sched-track" + (canChange ? " pickable" : "")} onClick={pick}>
                {slots === null ? (
                  <span className="cal-sched-none">{p.note ?? "No free time information"}</span>
                ) : (
                  slots.map((s, i) => busyBlock(s, conflicts.includes(s), i))
                )}
              </div>
            </div>
          ))}
          {valid && !outside && (
            <div className="cal-sched-overlay" aria-hidden="true">
              <div className="cal-sched-name" />
              <div className="cal-sched-track">
                <span className={"cal-sched-meeting" + (clashing.length ? " clash" : "")} style={band} />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={"cal-sched-summary" + (clashing.length ? " clash" : "")}>
        {!valid
          ? "Enter a begin and end time to see who is free."
          : outside
            ? "The meeting is outside the working day (8 AM to 6 PM)."
            : clashing.length
              ? `Conflicts: ${clashing.map((r) => r.p.person.name).join(", ")}.`
              : participants.length > 1
                ? "Everyone is available at this time."
                : "Add invitees to see when they are free."}
        {unknown.length > 0 && ` No free time information for ${unknown.map((r) => r.p.person.name || r.p.person.email).join(", ")}.`}
      </div>
      <div className="cal-sched-legend">
        <span>
          <i className="cal-sched-key busy" /> Busy
        </span>
        <span>
          <i className="cal-sched-key conflict" /> Conflict
        </span>
        <span>
          <i className="cal-sched-key meeting" /> This meeting
        </span>
        <span>
          <i className="cal-sched-key none" /> No information
        </span>
        {canChange && <span className="muted">Click the timeline to move the meeting.</span>}
      </div>
    </div>
  );
}

const STATUS_ICON: Record<InviteeStatus["status"], IconName> = {
  "needs-action": "invitation",
  accepted: "accept",
  declined: "decline",
  tentative: "tentative",
  delegated: "delegate",
  counter: "propose",
};

export function InviteeStatusTable({
  statuses,
  onAccept,
}: {
  statuses: InviteeStatus[];
  /** Accept a counter-proposal (moves the meeting and notifies everyone). */
  onAccept: (s: InviteeStatus) => void;
}) {
  return (
    <div className="cal-status">
      <table className="cal-status-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Details</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {statuses.map((s) => (
            <tr key={(s.person.email || s.person.name) + s.status} className={"cal-status-" + s.status}>
              <td title={notesName(s.person)}>{s.person.name || s.person.email}</td>
              <td className="cal-status-cell">
                <Icon name={STATUS_ICON[s.status]} />
                {STATUS_LABEL[s.status]}
              </td>
              <td className="cal-status-details">
                {s.status === "delegated" && s.delegate && <span>To {s.delegate.name}. </span>}
                {s.status === "counter" && s.proposedStart !== undefined && s.proposedEnd !== undefined && (
                  <span className="cal-status-proposed">
                    {fmtDate(s.proposedStart)} {fmtTime(s.proposedStart)} - {fmtTime(s.proposedEnd)}.{" "}
                  </span>
                )}
                {s.comment && <span className="cal-status-comment">"{s.comment}"</span>}
              </td>
              <td>
                {s.status === "counter" && s.proposedStart !== undefined && (
                  <button type="button" className="btn cal-status-accept" onClick={() => onAccept(s)}>
                    Accept Proposal
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cal-status-summary">{statusSummary(statuses)}</div>
    </div>
  );
}
