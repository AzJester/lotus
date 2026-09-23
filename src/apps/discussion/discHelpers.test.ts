import { describe, expect, it } from "vitest";
import {
  blankPost,
  deletePostQuestion,
  deletionSet,
  discussionDb,
  formOf,
  inDiscussionDb,
  isAuthor,
  isUnreadPost,
  markedDeletionQuestion,
  matchesPost,
  notAuthorMessage,
  parentOfPost,
  postSaveFields,
  responseCounts,
  responseSubject,
  threadRoot,
  threadSortValue,
} from "./discHelpers";
import type { DiscussionPost } from "../../data/types";

const carl = { name: "Carl Jensen", email: "carl.jensen@acme.example.com" };
const sam = { name: "Sam Rivera", email: "sam.rivera@acme.example.com" };

const post = (id: string, parentId: string | null, patch: Partial<DiscussionPost> = {}): DiscussionPost => ({
  id,
  parentId,
  topicId: patch.topicId ?? "t1",
  subject: parentId ? "RE: Sprints" : "Sprints",
  author: carl,
  body: "text",
  category: "Process",
  date: 1000,
  ...patch,
});

// t1 <- r1 <- rr1, t1 <- r2, t2 (no responses), conflict copy of r1
const thread = [
  post("t1", null, { date: 100 }),
  post("r1", "t1", { date: 200 }),
  post("rr1", "r1", { date: 300 }),
  post("r2", "t1", { date: 250, author: sam }),
  post("t2", null, { topicId: "t2", date: 400 }),
  post("r1~conflict", "t1", { conflictOf: "r1", date: 210 }),
];
const byId = new Map(thread.map((p) => [p.id, p]));

describe("discussion databases", () => {
  it("treats the team discussion as the default", () => {
    expect(discussionDb(undefined)).toBeUndefined();
    expect(discussionDb("discussion")).toBeUndefined();
    expect(discussionDb("disc-2")).toBe("disc-2");
    expect(inDiscussionDb({ db: "discussion" }, undefined)).toBe(true);
    expect(inDiscussionDb({}, "discussion")).toBe(true);
    expect(inDiscussionDb({ db: "disc-2" }, undefined)).toBe(false);
    expect(inDiscussionDb({ db: "disc-2" }, "disc-2")).toBe(true);
  });
});

describe("response hierarchy", () => {
  it("names the form from the parent chain", () => {
    expect(formOf(byId.get("t1")!)).toBe("Main Topic");
    expect(formOf(byId.get("r1")!, byId.get("t1"))).toBe("Response");
    expect(formOf(byId.get("rr1")!, byId.get("r1"))).toBe("Response to Response");
    expect(formOf(byId.get("rr1")!, undefined)).toBe("Response");
  });
  it("prefixes response subjects once", () => {
    expect(responseSubject("Sprints")).toBe("Re: Sprints");
    expect(responseSubject("RE: Sprints")).toBe("Re: Sprints");
    expect(responseSubject("Re: Re: Sprints")).toBe("Re: Sprints");
  });
  it("finds the main topic of a thread", () => {
    expect(threadRoot(byId.get("rr1")!, byId).id).toBe("t1");
    expect(threadRoot(byId.get("t2")!, byId).id).toBe("t2");
    const orphan = post("o1", "gone");
    expect(threadRoot(orphan, byId).id).toBe("o1");
  });
  it("counts responses at every depth, without conflict copies or orphans", () => {
    const counts = responseCounts([...thread, post("o1", "gone")]);
    expect(counts.get("t1")).toBe(3);
    expect(counts.get("t2")).toBeUndefined();
    expect(counts.get("o1")).toBeUndefined();
  });
  it("deletes responses and conflict copies with their parent", () => {
    expect([...deletionSet(thread, ["t1"])].sort()).toEqual(["r1", "r1~conflict", "r2", "rr1", "t1"]);
    expect([...deletionSet(thread, ["r1"])].sort()).toEqual(["r1", "r1~conflict", "rr1"]);
    expect([...deletionSet(thread, ["t2"])]).toEqual(["t2"]);
  });
  it("sorts newest topics first and each thread oldest first", () => {
    const sorted = [...thread].sort((a, b) => threadSortValue(b) - threadSortValue(a));
    const roots = sorted.filter((p) => !parentOfPost(p)).map((p) => p.id);
    const underT1 = sorted.filter((p) => parentOfPost(p) === "t1").map((p) => p.id);
    expect(roots).toEqual(["t2", "t1"]);
    expect(underT1).toEqual(["r1", "r2"]);
    expect(parentOfPost(byId.get("r1~conflict")!)).toBe("r1");
  });
});

describe("deletion prompts", () => {
  it("says when responses go with the marked documents", () => {
    expect(markedDeletionQuestion(2, 0)).toEqual(["Delete 2 documents marked for deletion?"]);
    expect(markedDeletionQuestion(1, 3)).toEqual([
      "Delete 1 document marked for deletion?",
      "Its responses will be deleted too (3 more documents).",
    ]);
    expect(markedDeletionQuestion(2, 1)[1]).toBe("Their responses will be deleted too (1 more document).");
  });
  it("asks before deleting a post from its window", () => {
    expect(deletePostQuestion(true, 0)).toBe("Delete this main topic?");
    expect(deletePostQuestion(true, 3)).toBe("Delete this main topic? Its 3 responses will be deleted too.");
    expect(deletePostQuestion(false, 1)).toBe("Delete this document? Its 1 response will be deleted too.");
  });
});

describe("authors and unread marks", () => {
  it("matches the author by address, or by name without one", () => {
    expect(isAuthor(byId.get("r2")!, sam)).toBe(true);
    expect(isAuthor(byId.get("t1")!, sam)).toBe(false);
    expect(isAuthor({ author: { name: "Sam Rivera", email: "" } }, sam)).toBe(true);
    expect(isAuthor({ author: { name: "sam.rivera", email: "SAM.RIVERA@acme.example.com" } }, sam)).toBe(true);
  });
  it("words the not-an-author message by access level", () => {
    expect(notAuthorMessage("Author")).toContain("You have Author access");
    expect(notAuthorMessage("Editor")).not.toContain("Author access");
    expect(notAuthorMessage("Editor")).toMatch(/^You are not authorized to edit this document\./);
  });
  it("marks others' posts unread until read, and again after an edit", () => {
    const t1 = byId.get("t1")!;
    expect(isUnreadPost(t1, null, sam)).toBe(false);
    expect(isUnreadPost(t1, {}, sam)).toBe(true);
    expect(isUnreadPost(t1, { t1: 1 }, sam)).toBe(false);
    expect(isUnreadPost({ ...t1, seq: 2 }, { t1: 1 }, sam)).toBe(true);
    expect(isUnreadPost(byId.get("r2")!, {}, sam)).toBe(false);
  });
});

describe("documents", () => {
  it("filters on subject, body, author and category", () => {
    expect(matchesPost(byId.get("t1")!, "carl")).toBe(true);
    expect(matchesPost(byId.get("t1")!, "process")).toBe(true);
    expect(matchesPost(byId.get("t1")!, "snacks")).toBe(false);
  });
  it("starts a main topic in the window's database", () => {
    const p = blankPost({ subject: "Hello", category: "General" }, "n1", sam, undefined, "disc-2", 5);
    expect(p).toMatchObject({ id: "n1", parentId: null, topicId: "n1", subject: "Hello", category: "General", db: "disc-2", date: 5 });
    expect(blankPost({}, "n2", sam, undefined, "discussion").db).toBeUndefined();
  });
  it("starts a response from its parent", () => {
    const parent = { ...byId.get("r1")!, db: "disc-2" };
    const p = blankPost({}, "n3", sam, parent, undefined);
    expect(p).toMatchObject({ parentId: "r1", topicId: "t1", subject: "Re: Sprints", category: "Process", db: "disc-2", author: sam });
  });
  it("saves the plain text of the rich text body", () => {
    const f = postSaveFields({ ...byId.get("t1")!, subject: " Hi ", bodyHtml: "<p>One</p><p>Two</p>" });
    expect(f).toMatchObject({ subject: "Hi", body: "One\nTwo" });
    expect(postSaveFields(byId.get("t1")!).body).toBeUndefined();
  });
});
