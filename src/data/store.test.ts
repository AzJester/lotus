import { beforeEach, describe, expect, it } from "vitest";
import { useNotes, unreadCount } from "./store";
import type { MailMessage, TodoTask } from "./types";

const s = () => useNotes.getState();

beforeEach(() => {
  localStorage.clear();
  s().resetAll();
});

describe("mail", () => {
  it("soft-deletes to Trash, then purges on a second delete", () => {
    const m = s().mail.find((x) => x.folder === "inbox")!;
    s().deleteMail(m.id);
    expect(s().mail.find((x) => x.id === m.id)!.folder).toBe("trash");
    s().deleteMail(m.id);
    expect(s().mail.find((x) => x.id === m.id)).toBeUndefined();
  });

  it("sendMail files a message under Sent and marks it read", () => {
    const before = s().mail.filter((x) => x.folder === "sent").length;
    const draft: MailMessage = {
      id: "test-msg",
      folder: "drafts",
      from: { name: "Me", email: "me@x" },
      to: [{ name: "You", email: "you@x" }],
      cc: [],
      subject: "Hi",
      body: "Body",
      date: Date.now(),
      read: false,
      flagged: false,
      priority: "normal",
    };
    s().sendMail(draft);
    const sent = s().mail.filter((x) => x.folder === "sent");
    expect(sent.length).toBe(before + 1);
    expect(sent.some((x) => x.subject === "Hi" && x.read)).toBe(true);
  });

  it("counts unread inbox messages", () => {
    const n = s().mail.filter((m) => m.folder === "inbox" && !m.read).length;
    expect(unreadCount(s().mail)).toBe(n);
  });

  it("emptyTrash purges only trashed messages", () => {
    const m = s().mail.find((x) => x.folder === "inbox")!;
    s().moveMail(m.id, "trash");
    s().emptyTrash();
    expect(s().mail.some((x) => x.folder === "trash")).toBe(false);
  });
});

describe("discussion", () => {
  it("deletePost removes the post and all its descendants", () => {
    const root = s().discussion.find((p) => p.parentId === null)!;
    const inThread = s().discussion.filter((p) => p.topicId === root.topicId).length;
    const before = s().discussion.length;
    s().deletePost(root.id);
    expect(s().discussion.length).toBe(before - inThread);
    expect(s().discussion.some((p) => p.topicId === root.topicId)).toBe(false);
  });
});

describe("todos", () => {
  it("adds, updates and deletes a task", () => {
    const t: TodoTask = {
      id: "todo-x",
      subject: "Test task",
      description: "",
      start: null,
      due: null,
      priority: "normal",
      status: "not-started",
      category: "",
      completedDate: null,
    };
    s().addTodo(t);
    expect(s().todos.some((x) => x.id === "todo-x")).toBe(true);
    s().updateTodo("todo-x", { status: "complete" });
    expect(s().todos.find((x) => x.id === "todo-x")!.status).toBe("complete");
    s().deleteTodo("todo-x");
    expect(s().todos.some((x) => x.id === "todo-x")).toBe(false);
  });
});

describe("export / import", () => {
  it("round-trips the workspace through JSON", () => {
    s().addContact({
      id: "contact-z", firstName: "Zed", lastName: "Tester", email: "z@x",
      company: "", title: "", workPhone: "", cellPhone: "", address: "",
      city: "", state: "", zip: "", country: "", category: "", comments: "",
    });
    const json = s().exportAll();
    s().resetAll();
    expect(s().contacts.some((c) => c.id === "contact-z")).toBe(false);
    expect(s().importAll(json)).toBe(true);
    expect(s().contacts.some((c) => c.id === "contact-z")).toBe(true);
  });

  it("rejects invalid import payloads", () => {
    expect(s().importAll("not json")).toBe(false);
  });
});
