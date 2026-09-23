/* @jsxRuntime automatic */
// ============================================================================
// Calendar view and entry window tests (jsdom): the formats and list views,
// deleting from the view (with the cancellation question for a meeting you
// chair), a new meeting saved with Save & Send Invitations, accepting a
// counter-proposal from Invitee Status, and a meeting someone else chairs
// that is read-only apart from the alarm.
// ============================================================================

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Calendar, { CalendarDocument } from "./Calendar";
import { DialogHost } from "../../components/dialogs";
import { TabContext } from "../../components/tabs";
import { useNotes } from "../../data/store";
import { useUI } from "../../data/ui";
import type { OpenTab } from "../../data/ui";

beforeAll(() => {
  // Browser APIs jsdom does not provide.
  const g = globalThis as Record<string, unknown>;
  g.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= function () {};
  const css = (g.CSS ??= {}) as { escape?: (s: string) => string };
  css.escape ??= (s: string) => s.replace(/["\\]/g, "\\$&");
});

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  useNotes.getState().resetAll();
  useUI.setState({ viewPrefs: {}, theme: "notes8" });
});

const entry = (id: string) => useNotes.getState().calendar.find((e) => e.id === id);
/** The visible copy of an action button (the bar also renders a hidden measuring copy). */
const action = (label: string) => screen.getAllByTitle(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))[0];
const navItem = (label: string) => screen.getByText(label, { selector: ".cal-nav .nav-label" });
const block = (subject: string) =>
  [...document.querySelectorAll<HTMLElement>(".cal-block, .cal-chip, .planner-entry")].find((b) => b.textContent?.includes(subject)) ??
  null;

function renderView() {
  render(
    <>
      <Calendar />
      <DialogHost />
    </>,
  );
}

function renderDoc(tab: OpenTab) {
  useUI.setState({ tabs: [...useUI.getState().tabs, tab], activeTab: tab.id });
  render(
    <>
      <TabContext.Provider value={{ tab, active: true }}>
        <CalendarDocument />
      </TabContext.Provider>
      <DialogHost />
    </>,
  );
}

describe("Calendar view", () => {
  it("switches formats and lists entries in All Entries and Meetings", async () => {
    renderView();
    fireEvent.click(navItem("One Week"));
    expect(document.querySelector(".cal-tg")).not.toBeNull();
    expect(block("1:1 with Diane")).not.toBeNull();
    fireEvent.click(navItem("One Month"));
    expect(document.querySelector(".cal-dg")).not.toBeNull();
    fireEvent.click(navItem("All Entries"));
    await waitFor(() => expect(document.querySelector(".nview")).not.toBeNull());
    const cats = [...document.querySelectorAll(".nview-cat .nview-catlabel")].map((e) => e.textContent);
    expect(cats.length).toBeGreaterThan(0);
    expect(cats.every((c) => /^[A-Z][a-z]+ \d{4}$/.test(c ?? ""))).toBe(true);
    fireEvent.click(navItem("Meetings"));
    await waitFor(() => expect(screen.getByText("Invitee")).toBeTruthy());
    expect(screen.getByText("Chair", { selector: ".nview-cell" })).toBeTruthy();
    expect(screen.getByText("1 accepted, 1 tentative")).toBeTruthy();
  });

  it("deletes the selected entry after asking", async () => {
    renderView();
    fireEvent.click(navItem("One Week"));
    fireEvent.mouseDown(block("Dentist")!);
    expect(block("Dentist")!.classList.contains("selected")).toBe(true);
    fireEvent.click(action("Delete"));
    await screen.findByText('Do you want to delete "Dentist"?');
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(entry("c-3")).toBeUndefined());
    expect(useNotes.getState().stubs.calendar["c-3"]).toBeTypeOf("number");
  });

  it("offers a cancellation notice when you delete a meeting you chair", async () => {
    renderView();
    fireEvent.click(navItem("One Week"));
    fireEvent.mouseDown(block("Northwind proposal prep")!);
    fireEvent.click(action("Delete"));
    await screen.findByText(/is a meeting you chair\. Do you want to send a cancellation notice/);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(entry("c-7")).toBeUndefined());
    expect(useUI.getState().status).toMatch(/Cancellation notices sent/);
  });

  it("draws the ring-bound planner for One Week under the Classic R5 theme", () => {
    useUI.setState({ theme: "r5" });
    renderView();
    fireEvent.click(navItem("One Week"));
    expect(document.querySelector(".planner")).not.toBeNull();
    expect(block("Northwind proposal prep")).not.toBeNull();
    fireEvent.click(navItem("Work Week"));
    expect(document.querySelector(".planner")).toBeNull();
    expect(document.querySelector(".cal-tg")).not.toBeNull();
  });
});

describe("Calendar entry window", () => {
  it("schedules a meeting and sends the invitations", async () => {
    renderDoc({
      id: "new:calendar:m1",
      view: "calendar",
      doc: { coll: "calendar", id: "m1" },
      isNew: true,
      init: { type: "meeting" },
    });
    expect((screen.getByLabelText("Meeting") as HTMLInputElement).checked).toBe(true);
    const subject = document.querySelector(".field-table input.nf-input") as HTMLInputElement;
    fireEvent.change(subject, { target: { value: "Budget review" } });
    fireEvent.change(screen.getByLabelText("Invitees"), { target: { value: "Carl Jensen, Priya Nair, Zed Nobody" } });
    // The Scheduler shows a row per invitee; unknown names have no free time information.
    expect(screen.getAllByText("Not found in the Domino Directory").length).toBeGreaterThan(0);
    fireEvent.click(action("Save & Send Invitations"));
    await waitFor(() => expect(entry("m1")?.inviteeStatus).toHaveLength(3));
    const m = entry("m1")!;
    expect(m.chair?.name).toBe("Sam Rivera");
    expect(m.invitees.map((p) => p.name)).toEqual(["Carl Jensen", "Priya Nair", "Zed Nobody"]);
    expect(m.invitees[2]).toMatchObject({ email: "", unresolved: true });
    expect(useUI.getState().tabs.some((t) => t.id === "new:calendar:m1")).toBe(false);
  });

  it("asks before saving a meeting whose invitations were never sent", async () => {
    renderDoc({
      id: "new:calendar:m2",
      view: "calendar",
      doc: { coll: "calendar", id: "m2" },
      isNew: true,
      init: { type: "meeting", subject: "Pricing sync" },
    });
    fireEvent.change(screen.getByLabelText("Invitees"), { target: { value: "Linda Park" } });
    fireEvent.click(action("Save & Close"));
    await screen.findByText("Do you want to send invitations to the invitees?");
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    await waitFor(() => expect(entry("m2")).toBeTruthy());
    expect(entry("m2")!.inviteeStatus).toBeUndefined();
  });

  it("refuses to save without a subject", async () => {
    renderDoc({ id: "new:calendar:a1", view: "calendar", doc: { coll: "calendar", id: "a1" }, isNew: true, init: {} });
    expect((screen.getByLabelText("Appointment") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(action("Save & Close"));
    await screen.findByText("You must enter a subject for this calendar entry.");
    expect(entry("a1")).toBeUndefined();
  });

  it("accepts a counter-proposal and reschedules the meeting", async () => {
    const e = entry("c-7")!;
    const proposed = new Date(e.start);
    proposed.setHours(14, 0, 0, 0);
    const ps = proposed.getTime();
    useNotes.getState().updateCalendarEntry("c-7", {
      inviteeStatus: [
        { person: e.invitees[0], status: "accepted" },
        { person: e.invitees[1], status: "counter", proposedStart: ps, proposedEnd: ps + 1800000, comment: "After the forecast call" },
      ],
    });
    renderDoc({ id: "doc:calendar:c-7", view: "calendar", doc: { coll: "calendar", id: "c-7" } });
    expect(screen.getByText("Proposed new time")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept Proposal" }));
    await screen.findByText(/as Priya Nair proposed, and send a rescheduled notice/);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(entry("c-7")!.start).toBe(ps));
    expect(entry("c-7")!.end).toBe(ps + 1800000);
    expect(entry("c-7")!.inviteeStatus!.map((s) => s.status)).toEqual(["needs-action", "accepted"]);
  });

  it("keeps a meeting someone else chairs read-only, apart from your alarm", () => {
    renderDoc({ id: "doc:calendar:c-1", view: "calendar", doc: { coll: "calendar", id: "c-1" } });
    expect(screen.getByText(/Diane Whitfield invited you to this meeting/)).toBeTruthy();
    expect(screen.queryAllByTitle(/^Edit/)).toHaveLength(0);
    expect(document.querySelector(".cal-sched")).toBeNull();
    const alarm = screen.getByLabelText("Notify me") as HTMLInputElement;
    expect(alarm.checked).toBe(true);
    fireEvent.click(alarm);
    expect(entry("c-1")!.alarm).toBe(false);
  });
});
