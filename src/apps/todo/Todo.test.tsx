/* @jsxRuntime automatic */
// ============================================================================
// To Do view and window tests (jsdom): the By Due Date categories and the
// overdue count, the preview pane, Mark Complete from the action bar,
// deletion marks with the F9 question, the Complete view, and a new To Do
// window that refuses to save without a subject.
// ============================================================================

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Todo, { TodoDocument } from "./Todo";
import { DialogHost } from "../../components/dialogs";
import { TabContext } from "../../components/tabs";
import { useNotes } from "../../data/store";
import { useUI } from "../../data/ui";
import type { OpenTab } from "../../data/ui";
import type { TodoTask } from "../../data/types";

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

/** Noon, `days` from today. */
const noon = (days: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.getTime();
};

const task = (p: Partial<TodoTask> & Pick<TodoTask, "id" | "subject">): TodoTask => ({
  description: "",
  start: null,
  due: null,
  priority: "normal",
  status: "not-started",
  category: "",
  completedDate: null,
  ...p,
});

const todo = (id: string) => useNotes.getState().todos.find((t) => t.id === id);
/** The view row showing a subject (the preview pane shows it too). */
const rowOf = (subject: string) =>
  [...document.querySelectorAll<HTMLElement>(".todo-list .nview-row")].find(
    (r) => r.querySelector(".todo-subject")?.textContent === subject,
  ) ?? null;
/** The visible copy of an action button (the bar also renders a hidden measuring copy). */
const action = (label: string) => screen.getAllByTitle(new RegExp(`^${label}`))[0];

beforeEach(() => {
  localStorage.clear();
  useNotes.getState().resetAll();
  useNotes.setState({
    todos: [
      task({ id: "a", subject: "Send the redlines", due: noon(-2), priority: "high" }),
      task({ id: "b", subject: "Call Marcus", due: noon(0) }),
      task({ id: "c", subject: "Read Peopleware" }),
      task({ id: "d", subject: "File expenses", due: noon(-1), status: "complete", completedDate: noon(-1) }),
    ],
  });
  useUI.setState({ viewPrefs: {}, uiPrefs: { ...useUI.getState().uiPrefs, preview: "bottom" } });
});

function renderView() {
  render(
    <>
      <Todo />
      <DialogHost />
    </>,
  );
}

describe("To Do view", () => {
  it("lists open To Dos by due date, with the overdue count", () => {
    renderView();
    const cats = [...document.querySelectorAll(".nview-cat .nview-catlabel")].map((e) => e.textContent);
    expect(cats).toEqual(["Overdue", "Today", "No Due Date"]);
    expect(rowOf("File expenses")).toBeNull();
    expect(document.querySelector(".todo-overdue-count")?.textContent).toBe("1 overdue");
    expect(rowOf("Send the redlines")?.classList.contains("todo-overdue")).toBe(true);
    // The view opens on its first document, shown in the preview pane.
    expect(document.querySelector(".todo-preview .todo-status-line")?.textContent).toBe("Overdue by 2 days");
  });

  it("previews the current To Do and marks it complete", () => {
    renderView();
    fireEvent.mouseDown(rowOf("Call Marcus")!);
    expect(document.querySelector(".todo-preview .todo-status-line")?.textContent).toBe("Due today");
    fireEvent.click(action("Mark Complete"));
    expect(todo("b")?.status).toBe("complete");
    expect(todo("b")?.completedDate).toBeTypeOf("number");
    // By Due Date lists open To Dos only.
    expect(rowOf("Call Marcus")).toBeNull();
  });

  it("marks documents for deletion and deletes them on F9", async () => {
    renderView();
    fireEvent.mouseDown(rowOf("Read Peopleware")!);
    const view = document.querySelector(".nview")!;
    fireEvent.keyDown(view, { key: "Delete" });
    expect(rowOf("Read Peopleware")?.classList.contains("marked")).toBe(true);
    fireEvent.keyDown(view, { key: "F9" });
    await screen.findByText("Delete 1 document marked for deletion?");
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(todo("c")).toBeUndefined());
    expect(useNotes.getState().stubs.todos.c).toBeTypeOf("number");
  });

  it("shows finished To Dos in the Complete view", async () => {
    renderView();
    fireEvent.click(screen.getByText("Complete", { selector: ".nav-label" }));
    await waitFor(() => expect(rowOf("File expenses")).not.toBeNull());
    expect(rowOf("File expenses")?.classList.contains("todo-done")).toBe(true);
    expect(screen.getByText("Completed", { selector: ".nview-htext" })).toBeTruthy();
  });
});

describe("To Do window", () => {
  it("opens a new To Do from Copy Into New and requires a subject", async () => {
    const tab: OpenTab = {
      id: "new:todos:t1",
      view: "todo",
      doc: { coll: "todos", id: "t1" },
      isNew: true,
      init: { description: "Please review the agenda." },
    };
    useUI.setState({ tabs: [...useUI.getState().tabs, tab], activeTab: tab.id });
    render(
      <>
        <TabContext.Provider value={{ tab, active: true }}>
          <TodoDocument />
        </TabContext.Provider>
        <DialogHost />
      </>,
    );
    expect((document.querySelector("textarea") as HTMLTextAreaElement).value).toBe("Please review the agenda.");
    fireEvent.click(action("Save & Close"));
    await screen.findByText("Please enter a Subject for this To Do.");
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    const subject = document.querySelector('[data-field="subject"]') as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(subject));
    fireEvent.change(subject, { target: { value: "Review the agenda" } });
    fireEvent.click(action("Save & Close"));
    await waitFor(() => expect(todo("t1")?.subject).toBe("Review the agenda"));
    expect(todo("t1")?.description).toBe("Please review the agenda.");
    expect(useUI.getState().tabs.some((t) => t.id === tab.id)).toBe(false);
  });
});
