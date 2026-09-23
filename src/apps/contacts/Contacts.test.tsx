/* @jsxRuntime automatic */
// ============================================================================
// Contacts component tests: the business card, the Group dialog (duplicate
// names are refused, members come from the check list) and the Contact
// window (a new contact needs a last name or e-mail address before it saves).
// ============================================================================

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DialogHost } from "../../components/dialogs";
import { TabContext } from "../../components/tabs";
import { useNotes } from "../../data/store";
import { useUI } from "../../data/ui";
import { BusinessCard, GroupCard } from "./BusinessCard";
import { ContactDocument } from "./ContactDocument";
import { groupDialog } from "./pabDialogs";
import type { GroupDraft } from "./pabDialogs";

beforeAll(() => {
  // The action bar measures itself; jsdom has no ResizeObserver.
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(() => {
  localStorage.clear();
  useNotes.getState().resetAll();
  useUI.setState({ tabs: [{ id: "view:welcome", view: "welcome" }], activeTab: "view:welcome" });
});

afterEach(cleanup);

const contact = (last: string) => useNotes.getState().contacts.find((c) => c.lastName === last)!;

describe("BusinessCard", () => {
  it("shows the contact and starts a memo from the e-mail address", () => {
    render(<BusinessCard c={contact("Whitfield")} />);
    screen.getByText("Diane Whitfield");
    screen.getByText("VP, Operations");
    screen.getByText("Acme Corporation");
    screen.getByText("Riverton, OH 44012");
    screen.getByText("(555) 248-1190");
    screen.getByText("Management");
    fireEvent.click(screen.getByText("diane.whitfield@acme.example.com"));
    const memo = useUI.getState().tabs.find((t) => t.doc?.coll === "mail" && t.isNew);
    expect(memo?.init?.to).toBe("Diane Whitfield/Acme");
  });

  it("lists a group's members", () => {
    const g = useNotes.getState().contactGroups[0];
    render(<GroupCard g={g} members={[contact("Whitfield"), contact("Jensen")]} />);
    screen.getByText("Mail group, 2 members");
    screen.getByText("Whitfield, Diane");
    screen.getByText("Jensen, Carl");
  });
});

describe("Group dialog", () => {
  it("refuses a duplicate name and returns the picked members", async () => {
    render(<DialogHost />);
    let result: GroupDraft | null | undefined;
    act(() => {
      void groupDialog().then((r) => (result = r));
    });
    const name = await screen.findByLabelText("Group name:");
    fireEvent.change(name, { target: { value: "acme team" } });
    fireEvent.click(screen.getByText("OK"));
    await screen.findByText(/already exists/);
    const oks = screen.getAllByText("OK");
    fireEvent.click(oks[oks.length - 1]);
    await waitFor(() => expect(screen.queryByText(/already exists/)).toBeNull());

    fireEvent.change(name, { target: { value: "Northwind Deal" } });
    fireEvent.click(screen.getByLabelText(/Bell, Marcus/));
    screen.getByText("1 of 5 contacts selected");
    fireEvent.click(screen.getByText("OK"));
    await waitFor(() => expect(result).toEqual({ name: "Northwind Deal", memberIds: [contact("Bell").id] }));
  });
});

describe("ContactDocument", () => {
  it("opens new contacts in edit mode and saves once a last name is given", async () => {
    const tabId = useUI.getState().newDocument("contacts", { firstName: "Raj" }, { title: "New Contact" });
    const tab = useUI.getState().tabs.find((t) => t.id === tabId)!;
    const { container } = render(
      <>
        <TabContext.Provider value={{ tab, active: true }}>
          <ContactDocument />
        </TabContext.Provider>
        <DialogHost />
      </>,
    );
    const inputs = () => Array.from(container.querySelectorAll<HTMLInputElement>(".doc-form input"));
    expect(inputs()[0].value).toBe("Raj");

    fireEvent.click(screen.getAllByText("Save")[0]);
    await screen.findByText(/You must enter a Last name or an E-mail address/);
    fireEvent.click(screen.getByText("OK"));
    await waitFor(() => expect(screen.queryByText(/You must enter a Last name/)).toBeNull());
    expect(useNotes.getState().contacts.some((c) => c.firstName === "Raj")).toBe(false);

    fireEvent.change(inputs()[1], { target: { value: "Patel " } });
    screen.getByText("Raj Patel");
    fireEvent.click(screen.getAllByText("Save")[0]);
    await waitFor(() => expect(useNotes.getState().contacts.some((c) => c.lastName === "Patel")).toBe(true));
    const saved = useNotes.getState().contacts.find((c) => c.lastName === "Patel")!;
    expect(saved.id).toBe(tab.doc!.id);
    expect(saved.seq).toBe(1);
    expect(useUI.getState().tabs.find((t) => t.id === tabId)?.isNew).toBe(false);
  });
});
