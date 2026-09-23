/* @jsxRuntime automatic */
// ============================================================================
// Discussion view and window tests (jsdom): the threaded All Documents view
// (newest topics first, responses in order, response counts, unread marks),
// the preview header, deletion marks that take responses along, refusing to
// delete colleagues' posts, a new response that inherits from its parent,
// and a colleague's post that stays read-only.
// ============================================================================

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Discussion, { PostDocument } from "./Discussion";
import { useDiscussionUnread } from "./unread";
import { DialogHost } from "../../components/dialogs";
import { TabContext } from "../../components/tabs";
import { useNotes } from "../../data/store";
import { useUI } from "../../data/ui";
import type { OpenTab } from "../../data/ui";
import type { DiscussionPost } from "../../data/types";

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

const carl = { name: "Carl Jensen", email: "carl.jensen@acme.example.com" };
const priya = { name: "Priya Nair", email: "priya.nair@acme.example.com" };
const sam = { name: "Sam Rivera", email: "sam.rivera@acme.example.com" };
const HOUR = 3600000;
const t0 = Date.now() - 48 * HOUR;

const post = (p: Partial<DiscussionPost> & Pick<DiscussionPost, "id" | "subject">): DiscussionPost => ({
  parentId: null,
  topicId: p.id,
  author: carl,
  body: "",
  category: "Process",
  date: t0,
  seq: 1,
  ...p,
});

const find = (id: string) => useNotes.getState().discussion.find((p) => p.id === id);
const topics = () => [...document.querySelectorAll(".disc-list .nview-row .disc-topic-text")].map((e) => e.textContent);
const rowOf = (subject: string) =>
  [...document.querySelectorAll<HTMLElement>(".disc-list .nview-row")].find(
    (r) => r.querySelector(".disc-topic-text")?.textContent === subject,
  ) ?? null;
/** The visible copy of an action button (the bar also renders a hidden measuring copy). */
const action = (title: string) => screen.getAllByTitle(title)[0];

beforeEach(() => {
  localStorage.clear();
  useNotes.getState().resetAll();
  useNotes.setState({
    discussion: [
      post({ id: "t1", subject: "Two-week sprints", date: t0, body: "Thoughts?" }),
      post({ id: "r1", parentId: "t1", topicId: "t1", subject: "RE: Two-week sprints", author: priya, date: t0 + HOUR }),
      post({ id: "rr1", parentId: "r1", topicId: "t1", subject: "RE: Two-week sprints", date: t0 + 3 * HOUR }),
      post({ id: "r2", parentId: "t1", topicId: "t1", subject: "Pilot team", author: priya, date: t0 + 2 * HOUR }),
      post({ id: "t2", subject: "Team lunch", author: sam, category: "Off-topic", date: t0 + 5 * HOUR }),
      post({ id: "r3", parentId: "t2", topicId: "t2", subject: "Re: Team lunch", author: sam, category: "Off-topic", date: t0 + 6 * HOUR }),
      post({ id: "x1", subject: "Another database", db: "db-other", date: t0 + 9 * HOUR }),
    ],
  });
  // Everything read except Priya's pilot post.
  useDiscussionUnread.setState({ seen: { t1: 1, r1: 1, rr1: 1, t2: 1, r3: 1 } });
  useUI.setState({ viewPrefs: {}, uiPrefs: { ...useUI.getState().uiPrefs, preview: "bottom" } });
});

function renderView() {
  render(
    <>
      <Discussion />
      <DialogHost />
    </>,
  );
}

describe("Discussion view", () => {
  it("threads the posts: newest topics first, responses in order, with counts", () => {
    renderView();
    expect(topics()).toEqual(["Team lunch", "Re: Team lunch", "Two-week sprints", "RE: Two-week sprints", "RE: Two-week sprints", "Pilot team"]);
    expect(rowOf("Two-week sprints")?.querySelector(".disc-count")?.textContent).toBe("(3 responses)");
    expect(rowOf("Team lunch")?.querySelector(".disc-count")?.textContent).toBe("(1 response)");
    // Only this database's posts, and the unread one is red with the star.
    expect(rowOf("Another database")).toBeNull();
    expect(rowOf("Pilot team")?.classList.contains("unread")).toBe(true);
    expect(screen.getByText("All Documents (1)")).toBeTruthy();
  });

  it("previews a response with the document it answers, and reads it", async () => {
    renderView();
    fireEvent.mouseDown(rowOf("Pilot team")!);
    const head = document.querySelector(".disc-preview .disc-head")!;
    expect(head.querySelector(".disc-subject")?.textContent).toBe("Pilot team");
    expect(head.querySelector(".disc-byline")?.textContent).toContain("by Priya Nair on");
    expect(head.querySelector(".disc-inresp a")?.textContent).toBe("Two-week sprints");
    await waitFor(() => expect(rowOf("Pilot team")?.classList.contains("unread")).toBe(false));
    expect(useDiscussionUnread.getState().seen?.r2).toBe(1);
  });

  it("deletes a marked main topic together with its responses", async () => {
    renderView();
    fireEvent.mouseDown(rowOf("Team lunch")!);
    const view = document.querySelector(".nview")!;
    fireEvent.keyDown(view, { key: "Delete" });
    expect(rowOf("Team lunch")?.classList.contains("marked")).toBe(true);
    fireEvent.keyDown(view, { key: "F9" });
    await screen.findByText("Delete 1 document marked for deletion?", { exact: false });
    expect(screen.getByText("Its responses will be deleted too (1 more document).", { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(find("t2")).toBeUndefined());
    expect(find("r3")).toBeUndefined();
    expect(useNotes.getState().stubs.discussion.r3).toBeTypeOf("number");
  });

  it("will not mark a colleague's post for deletion", () => {
    renderView();
    fireEvent.mouseDown(rowOf("Pilot team")!);
    fireEvent.keyDown(document.querySelector(".nview")!, { key: "Delete" });
    expect(rowOf("Pilot team")?.classList.contains("marked")).toBe(false);
    expect(useUI.getState().status).toMatch(/not authorized to delete/);
  });

  it("lists your own posts in My Documents", async () => {
    renderView();
    fireEvent.click(screen.getByText("My Documents"));
    await waitFor(() => expect(topics()).toEqual(["Re: Team lunch", "Team lunch"]));
  });
});

describe("Discussion windows", () => {
  function renderDoc(tab: OpenTab) {
    useUI.setState({ tabs: [...useUI.getState().tabs, tab], activeTab: tab.id });
    render(
      <>
        <TabContext.Provider value={{ tab, active: true }}>
          <PostDocument />
        </TabContext.Provider>
        <DialogHost />
      </>,
    );
  }

  it("starts a response from its parent and saves it into the thread", async () => {
    renderDoc({ id: "new:discussion:n1", view: "discussion", doc: { coll: "discussion", id: "n1" }, isNew: true, init: { parentId: "r1" } });
    expect(document.querySelector(".form-name")?.textContent).toBe("Response to Response");
    expect(document.querySelector(".disc-parent a")?.textContent).toBe("RE: Two-week sprints");
    const subject = document.querySelector(".frow input") as HTMLInputElement;
    expect(subject.value).toBe("Re: Two-week sprints");
    fireEvent.click(action("Save & Close"));
    await waitFor(() => expect(find("n1")).toBeTruthy());
    expect(find("n1")).toMatchObject({ parentId: "r1", topicId: "t1", category: "Process", db: "discussion", author: sam });
  });

  it("keeps a colleague's post read-only", () => {
    renderDoc({ id: "doc:discussion:r2", view: "discussion", doc: { coll: "discussion", id: "r2" } });
    expect(document.querySelector(".form-name")?.textContent).toBe("Response");
    expect(screen.queryByTitle("Edit (Ctrl+E)")).toBeNull();
    expect(action("Respond")).toBeTruthy();
    fireEvent.doubleClick(document.querySelector(".disc-body")!);
    expect(document.querySelector(".rt-editor")).toBeNull();
  });

  it("lets you edit your own post", async () => {
    renderDoc({ id: "doc:discussion:t2", view: "discussion", doc: { coll: "discussion", id: "t2" } });
    expect(document.querySelector(".form-name")?.textContent).toBe("Main Topic");
    fireEvent.click(action("Edit (Ctrl+E)"));
    await waitFor(() => expect(document.querySelector(".rt-editor")).not.toBeNull());
    const subject = document.querySelector(".frow input") as HTMLInputElement;
    fireEvent.change(subject, { target: { value: "Team lunch on Friday" } });
    fireEvent.click(action("Save (Ctrl+S)"));
    await waitFor(() => expect(find("t2")?.subject).toBe("Team lunch on Friday"));
  });
});
