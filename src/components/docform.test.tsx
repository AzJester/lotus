/* @jsxRuntime automatic */
// ============================================================================
// useDocWindow: new documents open in edit mode, saved ones in read mode;
// saving persists and turns the new-document window into a normal one; and
// closing a changed document asks "Do you want to save your changes?".
// ============================================================================

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useDocWindow } from "./docform";
import { TabContext } from "./tabs";
import { DialogHost } from "./dialogs";
import { requestClose, useUI } from "../data/ui";
import type { OpenTab } from "../data/ui";

interface Note {
  id: string;
  subject: string;
}

function Form({ doc, persist }: { doc?: Note; persist: (d: Note, isNew: boolean) => void }) {
  const w = useDocWindow<Note>({
    coll: "journal",
    doc,
    blank: (init, id) => ({ id, subject: String(init.subject ?? "") }),
    title: (d) => d.subject || "(Untitled)",
    persist,
    validate: (d) => (d.subject.trim() ? null : "Enter a subject."),
  });
  return (
    <div>
      <div data-testid="mode">{w.editing ? "edit" : "read"}</div>
      {w.editing ? (
        <input aria-label="Subject" value={w.draft.subject} onChange={(e) => w.set({ subject: e.target.value })} />
      ) : (
        <span>{w.draft.subject}</span>
      )}
      <button onClick={() => void w.save()}>Save</button>
      <button onClick={() => void w.toggleEdit()}>Toggle</button>
    </div>
  );
}

function mount(tab: OpenTab, doc: Note | undefined, persist = vi.fn()) {
  useUI.setState({ tabs: [{ id: "view:welcome", view: "welcome" }, tab], activeTab: tab.id });
  render(
    <>
      <TabContext.Provider value={{ tab: useUI.getState().tabs.find((t) => t.id === tab.id)!, active: true }}>
        <Form doc={doc} persist={persist} />
      </TabContext.Provider>
      <DialogHost />
    </>,
  );
  return persist;
}

beforeEach(() => {
  useUI.setState({ tabs: [{ id: "view:welcome", view: "welcome" }], activeTab: "view:welcome" });
});
afterEach(cleanup);

// Tell React this environment drives act() itself.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => act(async () => void (await Promise.resolve()));

describe("useDocWindow", () => {
  it("opens a new document in edit mode and saves it", async () => {
    const tab: OpenTab = { id: "new:journal:abc", view: "journal", doc: { coll: "journal", id: "abc" }, isNew: true, init: { subject: "Hello" } };
    const persist = mount(tab, undefined);
    expect(screen.getByTestId("mode").textContent).toBe("edit");
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe("Hello");
    fireEvent.click(screen.getByText("Save"));
    await flush();
    expect(persist).toHaveBeenCalledWith({ id: "abc", subject: "Hello" }, true);
    expect(useUI.getState().tabs.find((t) => t.id === tab.id)?.isNew).toBe(false);
    expect(useUI.getState().tabs.find((t) => t.id === tab.id)?.title).toBe("Hello");
  });

  it("refuses to save when validation fails", async () => {
    const tab: OpenTab = { id: "new:journal:x", view: "journal", doc: { coll: "journal", id: "x" }, isNew: true };
    const persist = mount(tab, undefined);
    fireEvent.click(screen.getByText("Save"));
    await flush();
    expect(persist).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a subject.")).toBeTruthy();
  });

  it("opens a saved document in read mode", () => {
    const tab: OpenTab = { id: "doc:journal:n1", view: "journal", doc: { coll: "journal", id: "n1" } };
    mount(tab, { id: "n1", subject: "Saved" });
    expect(screen.getByTestId("mode").textContent).toBe("read");
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("asks before closing a changed document, and closes on No", async () => {
    const tab: OpenTab = { id: "doc:journal:n2", view: "journal", doc: { coll: "journal", id: "n2" } };
    const persist = mount(tab, { id: "n2", subject: "Original" });
    fireEvent.click(screen.getByText("Toggle"));
    await flush();
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Changed" } });
    let closed: boolean | undefined;
    await act(async () => {
      void requestClose(tab.id).then((v) => (closed = v));
    });
    expect(screen.getByText("Do you want to save your changes?")).toBeTruthy();
    fireEvent.click(screen.getByText("No"));
    await flush();
    expect(closed).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    expect(useUI.getState().tabs.some((t) => t.id === tab.id)).toBe(false);
  });

  it("keeps the window open on Cancel", async () => {
    const tab: OpenTab = { id: "doc:journal:n3", view: "journal", doc: { coll: "journal", id: "n3" } };
    mount(tab, { id: "n3", subject: "Original" });
    fireEvent.click(screen.getByText("Toggle"));
    await flush();
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Changed" } });
    let closed: boolean | undefined;
    await act(async () => {
      void requestClose(tab.id).then((v) => (closed = v));
    });
    fireEvent.click(screen.getByText("Cancel"));
    await flush();
    expect(closed).toBe(false);
    expect(useUI.getState().tabs.some((t) => t.id === tab.id)).toBe(true);
  });
});
