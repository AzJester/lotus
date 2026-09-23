import { describe, expect, it } from "vitest";
import { applyRules, expandRecipients, myOutOfOffice, outOfOfficeText, routeMemo } from "./router";
import type { RouterContext } from "./router";
import { makeMemo } from "./docs";
import { parseAddressList, notesName, headerName } from "./names";
import type { MailMessage, MailRule } from "./types";
import { noticeFor, noticeMemo } from "./scheduling";
import { advance, expandEntry } from "./calendarUtil";

const me = { name: "Sam Rivera", email: "sam.rivera@acme.example.com" };

const ctx = (over: Partial<RouterContext> = {}): RouterContext => ({
  now: Date.UTC(2026, 8, 23, 15, 0),
  me,
  contacts: [],
  groups: [],
  oooNotified: {},
  rand: () => 0.1, // always "reply"
  ...over,
});

const memoTo = (raw: string, extra: Partial<MailMessage> = {}) =>
  makeMemo({ from: me, to: parseAddressList(raw), subject: "Quarterly numbers", body: "See attached.", ...extra });

describe("names", () => {
  it("shows Acme people with hierarchical names", () => {
    const [diane] = parseAddressList("Diane Whitfield/Acme@Acme");
    expect(diane.email).toBe("diane.whitfield@acme.example.com");
    expect(notesName(diane)).toBe("Diane Whitfield/Acme");
    expect(headerName(diane)).toBe("Diane Whitfield/Acme@Acme");
  });

  it("keeps internet addresses and flags unknown Notes names", () => {
    const list = parseAddressList("Marcus Bell <marcus.bell@northwind.example.com>, Bob Nobody");
    expect(list[0].email).toBe("marcus.bell@northwind.example.com");
    expect(list[1].unresolved).toBe(true);
  });
});

describe("routeMemo", () => {
  it("bounces names that are not in the Domino Directory", () => {
    const r = routeMemo(memoTo("Bob Nobody"), ctx());
    expect(r.failures).toHaveLength(1);
    const dfr = r.events.find((e) => e.kind === "deliver" && e.memo.form === "DeliveryReport");
    expect(dfr && dfr.kind === "deliver" && dfr.memo.subject).toMatch(/^DELIVERY FAILURE: .*not listed in Domino Directory/);
  });

  it("gets a reply from a colleague", () => {
    const r = routeMemo(memoTo("Priya Nair"), ctx());
    const reply = r.events.find((e) => e.kind === "deliver" && e.memo.from.name === "Priya Nair");
    expect(reply && reply.kind === "deliver" && reply.memo.subject).toBe("RE: Quarterly numbers");
  });

  it("answers once from a colleague who is out of the office", () => {
    const first = routeMemo(memoTo("Tom Becker"), ctx());
    const notice = first.events.find((e) => e.kind === "deliver" && e.memo.subject === "Tom Becker is out of the office.");
    expect(notice).toBeTruthy();
    expect(notice && notice.kind === "deliver" && notice.memo.body).toMatch(/^I will be out of the office starting /);
    const second = routeMemo(memoTo("Tom Becker"), ctx({ oooNotified: first.oooNotified }));
    expect(second.events.some((e) => e.kind === "deliver" && e.memo.subject.includes("out of the office"))).toBe(false);
  });

  it("expands directory groups", () => {
    const { resolved } = expandRecipients(parseAddressList("Sales Team"), [], []);
    expect(resolved.map((p) => p.name)).toContain("Carl Jensen");
  });

  it("sends return receipts when asked", () => {
    const r = routeMemo(memoTo("Carl Jensen", { returnReceipt: true }), ctx());
    expect(r.events.some((e) => e.kind === "deliver" && e.memo.form === "ReturnReceipt")).toBe(true);
  });
});

describe("server agents", () => {
  it("applies mail rules on delivery", () => {
    const rules: MailRule[] = [{ id: "r", field: "subject", contains: "numbers", action: "junk" }];
    const m = applyRules(makeMemo({ from: me, to: [me], subject: "Quarterly numbers" }), rules);
    expect(m.folder).toBe("junk");
  });

  it("answers incoming mail while you are out, once per sender", () => {
    const now = Date.UTC(2026, 8, 23);
    const ooo = { enabled: true, leaving: now - 1000, returning: now + 86400000, message: "Back soon.", notified: [] };
    const incoming = makeMemo({ from: { name: "Carl Jensen", email: "carl.jensen@acme.example.com" }, to: [me], subject: "Hi" });
    const notice = myOutOfOffice(incoming, ooo, me, now)!;
    expect(notice.subject).toBe("Sam Rivera is out of the office.");
    expect(notice.body).toBe(outOfOfficeText(ooo.leaving, ooo.returning, "Back soon."));
    expect(myOutOfOffice(incoming, { ...ooo, notified: ["carl.jensen@acme.example.com"] }, me, now)).toBeNull();
  });
});

describe("meeting notices", () => {
  const entry = {
    id: "mtg-1",
    type: "meeting" as const,
    subject: "Pricing review",
    location: "Maple Room",
    start: Date.UTC(2026, 8, 24, 15, 0),
    end: Date.UTC(2026, 8, 24, 16, 0),
    allDay: false,
    description: "",
    invitees: parseAddressList("Priya Nair"),
    category: "",
    alarm: false,
  };

  it("answers invitations and reschedules, but not cancellations", () => {
    for (const [type, answered] of [
      ["invitation", true],
      ["rescheduled", true],
      ["cancelled", false],
    ] as const) {
      const memo = noticeMemo(noticeFor(entry, type, me), me, entry.invitees, "", ctx().now);
      const r = routeMemo(memo, ctx());
      const answer = r.events.some((e) => e.kind === "deliver" && e.memo.from.name === "Priya Nair" && !!e.memo.notice);
      expect(answer, type).toBe(answered);
    }
  });
});

describe("yearly repeats", () => {
  it("advance a year at a time, so anniversaries land on the same date", () => {
    const start = new Date(2026, 1, 14, 0, 0).getTime();
    const next = new Date(advance(start, "yearly", 1));
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2027, 1, 14]);
    const occ = expandEntry({
      id: "ann",
      type: "anniversary",
      subject: "Work anniversary",
      location: "",
      start,
      end: start + 60000,
      allDay: true,
      description: "",
      invitees: [],
      category: "",
      alarm: false,
      recurrence: { freq: "yearly", until: new Date(2030, 1, 14).getTime() },
    });
    expect(occ).toHaveLength(5);
  });
});
