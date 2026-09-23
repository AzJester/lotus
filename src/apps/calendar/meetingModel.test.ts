// ============================================================================
// Meeting model tests: roles and response summaries, invitee changes, the
// Scheduler's participants, Find Free Time across days, the timeline, and
// the entry form's draft (defaults, retyping, validation, round trip).
// ============================================================================

import { describe, expect, it } from "vitest";
import type { CalendarEntry, InviteeStatus, Person } from "../../data/types";
import { busySlots, overlaps } from "../../data/scheduling";
import { advance } from "../../data/calendarUtil";
import type { Slot } from "../../data/scheduling";
import {
  blankEntry,
  busyFor,
  conflictsWith,
  fromDraft,
  inviteeDiff,
  inviteeText,
  isChair,
  isInvited,
  meetingStatusText,
  nextFreeStart,
  nextHour,
  participantsFor,
  retype,
  samePerson,
  statusSummary,
  timelineFraction,
  timelineTime,
  toDraft,
  validateEntry,
} from "./meetingModel";

const day = (m: number, d: number) => new Date(2026, m, d).getTime();
const at = (m: number, d: number, h: number, min = 0) => new Date(2026, m, d, h, min).getTime();

const ME: Person = { name: "Sam Rivera", email: "sam.rivera@acme.example.com" };
const CARL: Person = { name: "Carl Jensen", email: "carl.jensen@acme.example.com" };
const PRIYA: Person = { name: "Priya Nair", email: "priya.nair@acme.example.com" };
const DIANE: Person = { name: "Diane Whitfield", email: "diane.whitfield@acme.example.com" };

function meeting(over: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: "m1",
    type: "meeting",
    subject: "Budget review",
    location: "Birch Room",
    start: at(8, 24, 10),
    end: at(8, 24, 11),
    allDay: false,
    description: "",
    invitees: [CARL, PRIYA],
    category: "",
    alarm: true,
    alarmMinutes: 15,
    chair: ME,
    ...over,
  };
}

describe("roles", () => {
  it("tells the chair from an invitee", () => {
    expect(isChair(meeting(), ME)).toBe(true);
    expect(isChair(meeting({ chair: undefined }), ME)).toBe(true);
    expect(isInvited(meeting({ chair: DIANE, myResponse: "accepted" }), ME)).toBe(true);
    expect(isChair(meeting({ chair: DIANE }), ME)).toBe(false);
    expect(isChair(meeting({ type: "appointment" }), ME)).toBe(false);
    expect(samePerson({ name: "carl jensen", email: "" }, { name: "Carl Jensen", email: "" })).toBe(true);
    expect(samePerson(CARL, { name: "Somebody Else", email: "CARL.JENSEN@acme.example.com" })).toBe(true);
  });

  it("summarizes where a meeting stands", () => {
    const statuses: InviteeStatus[] = [
      { person: CARL, status: "accepted" },
      { person: PRIYA, status: "tentative" },
      { person: DIANE, status: "needs-action" },
    ];
    expect(statusSummary(statuses)).toBe("1 accepted, 1 tentative, 1 needs action");
    expect(meetingStatusText(meeting(), ME)).toBe("Invitations not sent");
    expect(meetingStatusText(meeting({ inviteeStatus: statuses }), ME)).toBe("1 accepted, 1 tentative, 1 needs action");
    expect(meetingStatusText(meeting({ chair: DIANE, myResponse: "tentative" }), ME)).toBe("Tentatively accepted");
    expect(meetingStatusText(meeting({ invitees: [] }), ME)).toBe("No invitees");
  });

  it("finds who was added and removed", () => {
    const d = inviteeDiff([CARL, PRIYA], [PRIYA, DIANE]);
    expect(d.added).toEqual([DIANE]);
    expect(d.removed).toEqual([CARL]);
    expect(d.kept).toEqual([PRIYA]);
  });

  it("writes invitees back the Notes way", () => {
    expect(inviteeText(CARL)).toBe("Carl Jensen/Acme");
    expect(inviteeText({ name: "Sales Team", email: "" })).toBe("Sales Team");
    expect(inviteeText({ name: "Marcus Bell", email: "marcus.bell@northwind.example.com" })).toBe(
      "Marcus Bell <marcus.bell@northwind.example.com>",
    );
  });
});

describe("scheduler", () => {
  it("lists you first, expands groups and flags people without free time information", () => {
    const rows = participantsFor(
      [
        CARL,
        { name: "Sales Team", email: "" },
        { name: "Nobody Here", email: "" },
        { name: "Marcus Bell", email: "marcus.bell@northwind.example.com" },
      ],
      ME,
    );
    expect(rows[0]).toMatchObject({ kind: "me", person: ME });
    const names = rows.map((r) => r.person.name);
    // Carl appears once even though the Sales Team includes him; you are not repeated.
    expect(names.filter((n) => n === "Carl Jensen")).toHaveLength(1);
    expect(names.filter((n) => n === "Sam Rivera")).toHaveLength(1);
    expect(rows.find((r) => r.person.name === "Diane Whitfield")).toMatchObject({ kind: "directory", note: "via Sales Team" });
    expect(rows.find((r) => r.person.name === "Nobody Here")).toMatchObject({
      kind: "none",
      note: "Not found in the Domino Directory",
    });
    expect(rows.find((r) => r.person.name === "Marcus Bell")?.kind).toBe("none");
  });

  it("reads busy time from your calendar and the Directory", () => {
    const [me, carl] = participantsFor([CARL], ME);
    const other = meeting({ id: "other", start: at(8, 24, 13), end: at(8, 24, 14) });
    const self = meeting();
    expect(busyFor(me, day(8, 24), [self, other], "m1")).toEqual([{ start: at(8, 24, 13), end: at(8, 24, 14) }]);
    expect(busyFor(carl, day(8, 24), [], "m1")).toEqual(busySlots("Carl Jensen", day(8, 24)));
    expect(busyFor({ key: "x", person: { name: "X", email: "" }, kind: "none" }, day(8, 24), [])).toBeNull();
  });

  it("finds conflicts with the proposed time", () => {
    const slots: Slot[] = [
      { start: at(8, 24, 9), end: at(8, 24, 10) },
      { start: at(8, 24, 10, 30), end: at(8, 24, 12) },
    ];
    expect(conflictsWith(slots, at(8, 24, 10), at(8, 24, 11))).toEqual([slots[1]]);
    expect(conflictsWith(slots, at(8, 24, 12), at(8, 24, 13))).toEqual([]);
    expect(conflictsWith(null, at(8, 24, 9), at(8, 24, 10))).toEqual([]);
  });

  it("finds the next time everyone is free, moving on to later work days", () => {
    // Everyone is busy all of Thursday; Friday is free from 9 AM.
    const busyOn = (d: number): Slot[][] => {
      if (d === day(8, 24)) return [[{ start: at(8, 24, 8), end: at(8, 24, 18) }]];
      if (d === day(8, 25)) return [[{ start: at(8, 25, 8), end: at(8, 25, 9) }], []];
      return [[]];
    };
    expect(nextFreeStart(busyOn, at(8, 24, 10), 3600000)).toBe(at(8, 25, 9));
    // From Friday evening the search skips the weekend and lands on Monday.
    expect(nextFreeStart(busyOn, at(8, 25, 17, 30), 3600000)).toBe(at(8, 28, 8));
    // A meeting longer than the working day never fits.
    expect(nextFreeStart(busyOn, at(8, 24, 8), 11 * 3600000)).toBeNull();
  });

  it("agrees with the colleagues' busy time", () => {
    const people = ["Carl Jensen", "Priya Nair", "Diane Whitfield"];
    const busyOn = (d: number) => people.map((p) => busySlots(p, d));
    const t = nextFreeStart(busyOn, at(8, 24, 8), 3600000)!;
    expect(t).not.toBeNull();
    const d = new Date(t);
    expect(busyOn(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()).some((s) => overlaps(s, t, t + 3600000))).toBe(
      false,
    );
  });

  it("maps times onto the 8 AM to 6 PM timeline and back", () => {
    expect(timelineFraction(at(8, 24, 8), day(8, 24))).toBe(0);
    expect(timelineFraction(at(8, 24, 13), day(8, 24))).toBe(0.5);
    expect(timelineFraction(at(8, 24, 20), day(8, 24))).toBe(1);
    expect(timelineFraction(at(8, 23, 20), day(8, 24))).toBe(0);
    expect(timelineTime(0.5, day(8, 24))).toBe(at(8, 24, 13));
    expect(timelineTime(0.52, day(8, 24))).toBe(at(8, 24, 13));
    expect(timelineTime(0.56, day(8, 24))).toBe(at(8, 24, 13, 30));
  });
});

describe("entry drafts", () => {
  const now = at(8, 23, 14, 20);

  it("starts new entries at the next hour, or where they were asked for", () => {
    expect(nextHour(now)).toBe(at(8, 23, 15));
    const appt = blankEntry({}, "n1", now);
    expect(appt).toMatchObject({ id: "n1", type: "appointment", start: at(8, 23, 15), end: at(8, 23, 16), allDay: false });
    const fromMail = blankEntry({ subject: "Lunch?", description: "Friday works" }, "n2", now);
    expect(fromMail).toMatchObject({ subject: "Lunch?", description: "Friday works" });
    const meet = blankEntry({ type: "meeting", start: at(8, 24, 10) }, "n3", now);
    expect(meet).toMatchObject({ type: "meeting", start: at(8, 24, 10), end: at(8, 24, 11), alarm: true });
    const evt = blankEntry({ type: "event", start: day(8, 25) }, "n4", now);
    expect(evt).toMatchObject({ allDay: true, start: day(8, 25), end: at(8, 25, 23, 59) });
    expect(blankEntry({ type: "bogus" }, "n5", now).type).toBe("appointment");
  });

  it("switches types the way the radio buttons do", () => {
    const appt = blankEntry({ start: at(8, 24, 10) }, "n", now);
    const anniv = retype(appt, "anniversary");
    expect(anniv).toMatchObject({ allDay: true, start: day(8, 24), end: at(8, 24, 23, 59) });
    const back = retype(anniv, "meeting");
    expect(back).toMatchObject({ allDay: false, start: at(8, 24, 9), end: at(8, 24, 10) });
    const rem = retype(appt, "reminder");
    expect(rem.end).toBe(rem.start);
    expect(retype(rem, "appointment").end).toBe(at(8, 24, 11));
  });

  it("round-trips the invitee field and leaves you and duplicates out", () => {
    const d = toDraft(meeting({ invitees: [CARL, { name: "Sales Team", email: "" }] }));
    expect(d.inviteesText).toBe("Carl Jensen/Acme, Sales Team");
    const e = fromDraft({ ...d, inviteesText: "Carl Jensen/Acme, carl jensen, Sam Rivera, Priya Nair, Sales Team, Zed Nobody" }, { me: ME });
    expect(e.invitees.map((p) => p.name)).toEqual(["Carl Jensen", "Priya Nair", "Sales Team", "Zed Nobody"]);
    expect(e.invitees[3]).toMatchObject({ email: "", unresolved: true });
    expect("inviteesText" in e).toBe(false);
  });

  it("normalizes times for each type", () => {
    const d = toDraft(blankEntry({ type: "event", start: day(8, 24) }, "e", now));
    const e = fromDraft({ ...d, start: at(8, 24, 13), end: at(8, 26, 2) }, { me: ME });
    expect([e.start, e.end]).toEqual([day(8, 24), at(8, 26, 23, 59)]);
    const r = fromDraft({ ...toDraft(blankEntry({ type: "reminder" }, "r", now)), end: 0 }, { me: ME });
    expect(r.end).toBe(r.start);
    const rep = fromDraft({ ...toDraft(meeting()), recurrence: { freq: "weekly", until: at(9, 31, 9) } }, { me: ME });
    expect(rep.recurrence!.until).toBe(day(10, 1) - 1);
  });

  it("validates the subject, the times and the repeat end", () => {
    const ok = meeting();
    expect(validateEntry(ok)).toBeNull();
    expect(validateEntry({ ...ok, subject: "  " })).toMatch(/subject/);
    expect(validateEntry({ ...ok, end: ok.start })).toMatch(/end time/);
    expect(validateEntry({ ...ok, start: NaN })).toMatch(/valid date/);
    expect(validateEntry({ ...ok, type: "reminder", end: ok.start })).toBeNull();
    expect(validateEntry({ ...ok, allDay: true, start: day(8, 24), end: day(8, 23) })).toMatch(/end date/);
    expect(validateEntry({ ...ok, recurrence: { freq: "daily", until: day(8, 20) } })).toMatch(/repeat/);
  });
});

describe("retype and repeats", () => {
  const base = {
    id: "e1",
    type: "appointment" as const,
    subject: "x",
    location: "",
    start: new Date(2027, 0, 31, 9, 0).getTime(),
    end: new Date(2027, 0, 31, 10, 0).getTime(),
    allDay: false,
    description: "",
    invitees: [],
    category: "",
    alarm: false,
  };
  it("gives a new anniversary a yearly repeat and takes it away again", () => {
    const ann = retype(base, "anniversary");
    expect(ann.recurrence?.freq).toBe("yearly");
    expect(retype(ann, "appointment").recurrence).toBeUndefined();
    expect(retype(ann, "event").recurrence).toBeUndefined();
  });
  it("keeps monthly repeats on the last day of shorter months", () => {
    const days = [1, 2, 3].map((n) => new Date(advance(base.start, "monthly", n)));
    expect(days.map((d) => [d.getMonth(), d.getDate()])).toEqual([
      [1, 28],
      [2, 31],
      [3, 30],
    ]);
  });
});
