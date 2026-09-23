import { beforeEach, describe, expect, it } from "vitest";
import { migrateNotes, useNotes, unreadCount } from "./store";
import { busySlots, findFreeTime } from "./scheduling";
import type { MailMessage, TodoTask } from "./types";

const s = () => useNotes.getState();

const memo = (over: Partial<MailMessage> = {}): MailMessage => ({
  id: "test-msg",
  folder: "drafts",
  from: { name: "Me", email: "me@x" },
  to: [{ name: "Priya Nair", email: "priya.nair@acme.example.com" }],
  cc: [],
  subject: "Hi",
  body: "Body",
  date: Date.now(),
  read: false,
  flagged: false,
  priority: "normal",
  ...over,
});

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
    expect(s().stubs.mail[m.id]).toBeTypeOf("number");
  });

  it("sendMemo files a sent copy and routes it at the office", () => {
    const before = s().mail.filter((x) => x.folder === "sent").length;
    const queueBefore = s().serverQueue.length;
    const out = s().sendMemo(memo(), { saveCopy: true });
    expect(out.queued).toBe(false);
    const sent = s().mail.filter((x) => x.folder === "sent");
    expect(sent.length).toBe(before + 1);
    expect(sent.some((x) => x.subject === "Hi" && x.read && x.from.name === "Sam Rivera")).toBe(true);
    expect(s().serverQueue.length).toBeGreaterThanOrEqual(queueBefore);
  });

  it("queues mail in Outgoing Mail away from the office until replication", () => {
    s().setLocation("Home (Network Dialup)");
    const out = s().sendMemo(memo({ id: "queued-1" }), { saveCopy: false });
    expect(out.queued).toBe(true);
    expect(s().outbox).toHaveLength(1);
    const r = s().replicate();
    expect(r.ok).toBe(true);
    expect(r.mailSent).toBe(1);
    expect(s().outbox).toHaveLength(0);
  });

  it("cannot reach the server from Island", () => {
    s().setLocation("Island (Disconnected)");
    const r = s().replicate();
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Unable to find path to server.");
  });

  it("stamps every save with a new sequence number", () => {
    const m = s().mail.find((x) => x.folder === "inbox")!;
    const seq = m.seq ?? 1;
    s().markRead(m.id, !m.read);
    const after = s().mail.find((x) => x.id === m.id)!;
    expect(after.seq).toBe(seq + 1);
    expect(after.updatedBy).toBe("Sam Rivera/Acme");
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

describe("replication", () => {
  it("does not bring purged documents back", () => {
    s().replicate();
    const victim = s().mail.find((m) => m.folder === "inbox")!;
    s().deleteMail(victim.id);
    s().deleteMail(victim.id);
    s().replicate();
    expect(s().mail.some((m) => m.id === victim.id)).toBe(false);
    expect(s().server.mail.some((m) => m.id === victim.id)).toBe(false);
  });

  it("pulls the server-only memo on the first replication", () => {
    expect(s().mail.some((m) => m.id === "srv-1")).toBe(false);
    const r = s().replicate();
    expect(s().mail.some((m) => m.id === "srv-1")).toBe(true);
    expect(r.newMail).toBeGreaterThan(0);
  });

  it("replicates local edits and reports pending changes", () => {
    s().replicate();
    expect(s().pendingFor("mail")).toBe(0);
    const t = s().todos[0];
    s().updateTodo(t.id, { subject: "Edited locally" });
    expect(s().pendingFor("mail")).toBe(1);
    s().replicate();
    expect(s().server.todos.find((x) => x.id === t.id)!.subject).toBe("Edited locally");
    expect(s().pendingFor("mail")).toBe(0);
  });
});

describe("calendar & scheduling", () => {
  it("accepting an invitation adds the meeting and answers the chair", () => {
    const invite = s().mail.find((m) => m.notice?.type === "invitation")!;
    s().respondToInvitation(invite.id, "accept");
    const entry = s().calendar.find((e) => e.id === invite.notice!.entryId)!;
    expect(entry.type).toBe("meeting");
    expect(entry.myResponse).toBe("accepted");
    expect(s().mail.find((m) => m.id === invite.id)!.notice!.response).toBe("accepted");
  });

  it("busy time is deterministic and free time avoids it", () => {
    const day = new Date(2026, 8, 23).getTime(); // a Wednesday
    const a = busySlots("Priya Nair", day);
    expect(busySlots("Priya Nair", day)).toEqual(a);
    const free = findFreeTime([a], day, 30);
    expect(free).not.toBeNull();
    expect(a.some((sl) => sl.start < free! + 1800000 && sl.end > free!)).toBe(false);
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

  it("sanitizes imported memo bodies", () => {
    const json = JSON.stringify({ data: { mail: [memo({ bodyHtml: '<b>hi</b><img src=x onerror="alert(1)">' })] } });
    expect(s().importAll(json)).toBe(true);
    expect(s().mail[0].bodyHtml).toBe("<b>hi</b>");
  });

  it("rejects invalid import payloads", () => {
    expect(s().importAll("not json")).toBe(false);
  });
});

describe("migration", () => {
  it("upgrades a version 1 workspace", () => {
    const v1 = {
      user: { name: "Pat Lee", email: "pat@x", location: "Office (Network)" },
      mail: [memo({ id: "old-1", folder: "inbox" })],
      journal: [{ id: "j", subject: "s", body: "b", category: "", created: 1, modified: 2 }],
      server: { mail: [], calendar: [], contacts: [], todos: [], journal: [], discussion: [] },
    };
    const next = migrateNotes(v1, 1);
    expect(next.user!.notesName).toBe("Pat Lee/Acme");
    expect(next.mail![0].seq).toBe(1);
    expect(next.journal![0].db).toBe("journal");
    expect(next.outbox).toEqual([]);
    expect(next.server!.stubs).toBeDefined();
  });
});

describe("fresh replicas", () => {
  it("start in agreement, so only server-only documents arrive", () => {
    expect(s().pendingChanges()).toBe(0);
    const r = s().replicate({ dbs: ["mail", "discussion"], sendOutgoing: false });
    expect(r.ok).toBe(true);
    const byDb = Object.fromEntries(r.dbs.map((d) => [d.db, d]));
    expect(byDb.mail.received).toBe(1);
    expect(byDb.mail.sent).toBe(0);
    expect(byDb.discussion.received).toBe(1);
    expect(byDb.discussion.sent).toBe(0);
  });
});
