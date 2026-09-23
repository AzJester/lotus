/* @jsxRuntime automatic */
// ============================================================================
// Notebook view and window tests (jsdom): By Date groups pages by month,
// newest first, and shows only the window's database; By Category nests
// "A\B" subcategories; Categorize... files the selected page; deletion marks
// ask on F9; a new page saves into the window's database.
// ============================================================================

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Notebook, { JournalDocument } from "./Notebook";
import { DialogHost } from "../../components/dialogs";
import { TabContext } from "../../components/tabs";
import { useNotes } from "../../data/store";
import { useUI } from "../../data/ui";
import type { OpenTab } from "../../data/ui";
import type { JournalEntry } from "../../data/types";

beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  g.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= function () {};
  const css = (g.CSS ??= {}) as { escape?: (s: string) => string };
  css.escape ??= (s: string) => s.replace(/["\\]/g, "\\$&");
  // The rich text editor asks the document for its formatting state.
  const doc = document as unknown as Record<string, unknown>;
  doc.queryCommandValue ??= () => "";
  doc.queryCommandState ??= () => false;
  doc.execCommand ??= () => false;
});

afterEach(cleanup);

const on = (y: number, m: number, d: number) => new Date(y, m, d, 9, 30).getTime();

const entry = (p: Partial<JournalEntry> & Pick<JournalEntry, "id" | "subject">): JournalEntry => ({
  body: "",
  category: "",
  created: on(2026, 8, 20),
  modified: on(2026, 8, 20),
  db: "journal",
  ...p,
});

const find = (id: string) => useNotes.getState().journal.find((j) => j.id === id);
const categories = () => [...document.querySelectorAll(".nview-cat .nview-catlabel")].map((e) => e.textContent);
const subjects = () => [...document.querySelectorAll(".nb-list .nview-row .nb-subject")].map((e) => e.textContent);
const rowOf = (subject: string) =>
  [...document.querySelectorAll<HTMLElement>(".nb-list .nview-row")].find(
    (r) => r.querySelector(".nb-subject")?.textContent === subject,
  ) ?? null;
const action = (title: string) => screen.getAllByTitle(title)[0];

beforeEach(() => {
  localStorage.clear();
  useNotes.getState().resetAll();
  useNotes.setState({
    journal: [
      entry({ id: "a", subject: "Renewal notes", category: "Work\\Clients", created: on(2026, 8, 21) }),
      entry({ id: "b", subject: "Reading list", category: "Personal", created: on(2026, 7, 2) }),
      entry({ id: "c", subject: "Loose thoughts", created: on(2026, 8, 3) }),
      entry({ id: "d", subject: "Lisbon, day one", created: on(2026, 8, 22), db: "db-trip" }),
    ],
  });
  useUI.setState({ viewPrefs: {}, uiPrefs: { ...useUI.getState().uiPrefs, preview: "bottom" } });
});

function renderView(tab?: OpenTab) {
  const view = (
    <>
      <Notebook />
      <DialogHost />
    </>
  );
  render(tab ? <TabContext.Provider value={{ tab, active: true }}>{view}</TabContext.Provider> : view);
}

describe("Notebook view", () => {
  it("groups the pages by month, newest first, in this database only", () => {
    renderView();
    expect(categories()).toEqual(["September 2026", "August 2026"]);
    expect(subjects()).toEqual(["Renewal notes", "Loose thoughts", "Reading list"]);
    // The view opens on its first page, shown in the preview pane.
    expect(document.querySelector(".nb-preview .form-name")?.textContent).toBe("Journal Entry");
    expect(document.querySelector(".nb-preview .field-read")?.textContent).toBe("Renewal notes");
  });

  it("shows another journal's pages in its own window", () => {
    renderView({ id: "view:journal:db-trip", view: "journal", db: "db-trip" });
    expect(subjects()).toEqual(["Lisbon, day one"]);
  });

  it("nests subcategories in By Category", async () => {
    renderView();
    fireEvent.click(screen.getByText("By Category"));
    await waitFor(() => expect(categories()).toEqual(["(Not Categorized)", "Personal", "Work", "Clients"]));
  });

  it("categorizes the selected page", async () => {
    renderView();
    fireEvent.mouseDown(rowOf("Loose thoughts")!);
    fireEvent.click(action("Categorize..."));
    await screen.findByText("Categorize 1 selected document as:");
    fireEvent.click(screen.getByText("Personal", { selector: ".nb-kw-label" }));
    fireEvent.change(document.querySelector(".nb-kw-new input")!, { target: { value: "Ideas" } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await waitFor(() => expect(find("c")?.category).toBe("Personal, Ideas"));
  });

  it("marks pages for deletion and deletes them on F9", async () => {
    renderView();
    fireEvent.mouseDown(rowOf("Reading list")!);
    const view = document.querySelector(".nview")!;
    fireEvent.keyDown(view, { key: "Delete" });
    expect(rowOf("Reading list")?.classList.contains("marked")).toBe(true);
    fireEvent.keyDown(view, { key: "F9" });
    await screen.findByText("Delete 1 document marked for deletion?");
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(find("b")).toBeUndefined());
  });
});

describe("Journal Entry window", () => {
  function renderDoc(tab: OpenTab) {
    useUI.setState({ tabs: [...useUI.getState().tabs, tab], activeTab: tab.id });
    render(
      <>
        <TabContext.Provider value={{ tab, active: true }}>
          <JournalDocument />
        </TabContext.Provider>
        <DialogHost />
      </>,
    );
  }

  it("saves a new page into the window's database", async () => {
    renderDoc({
      id: "new:journal:n1",
      view: "journal",
      db: "db-trip",
      doc: { coll: "journal", id: "n1" },
      isNew: true,
      init: { category: "Travel" },
    });
    const [subject, category] = [...document.querySelectorAll<HTMLInputElement>(".frow input")];
    expect(category.value).toBe("Travel");
    fireEvent.change(subject, { target: { value: "Day two" } });
    fireEvent.click(action("Save & Close"));
    await waitFor(() => expect(find("n1")).toBeTruthy());
    expect(find("n1")).toMatchObject({ subject: "Day two", category: "Travel", db: "db-trip" });
  });

  it("opens saved pages in read mode and edits them", async () => {
    renderDoc({ id: "doc:journal:a", view: "journal", doc: { coll: "journal", id: "a" } });
    expect(document.querySelector(".rt-editor")).toBeNull();
    expect(screen.getByText("Work\\Clients", { selector: ".field-read" })).toBeTruthy();
    fireEvent.click(action("Edit (Ctrl+E)"));
    await waitFor(() => expect(document.querySelector(".rt-editor")).not.toBeNull());
    fireEvent.change(document.querySelector(".frow input")!, { target: { value: "Renewal notes (final)" } });
    fireEvent.click(action("Save (Ctrl+S)"));
    await waitFor(() => expect(find("a")?.subject).toBe("Renewal notes (final)"));
  });
});
