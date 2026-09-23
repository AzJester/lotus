import { describe, expect, it } from "vitest";
import {
  allCategories,
  blankEntry,
  caretCategory,
  categoryLabels,
  entrySaveFields,
  inJournalDb,
  joinCategories,
  journalDb,
  matchesEntry,
  monthIndex,
  monthLabel,
  monthOrder,
  splitCategories,
} from "./journalHelpers";
import type { JournalEntry } from "../../data/types";

const entry = (patch: Partial<JournalEntry> = {}): JournalEntry => ({
  id: "j1",
  subject: "Renewal notes",
  body: "Call with Marcus",
  category: "Work",
  created: new Date(2026, 8, 20).getTime(),
  modified: new Date(2026, 8, 20).getTime(),
  ...patch,
});

describe("journal databases", () => {
  it("treats the default journal as undefined", () => {
    expect(journalDb(undefined)).toBeUndefined();
    expect(journalDb("journal")).toBeUndefined();
    expect(journalDb("j-2")).toBe("j-2");
  });
  it("matches entries to their database", () => {
    expect(inJournalDb({}, undefined)).toBe(true);
    expect(inJournalDb({ db: "journal" }, undefined)).toBe(true);
    expect(inJournalDb({ db: "journal" }, "journal")).toBe(true);
    expect(inJournalDb({ db: "j-2" }, undefined)).toBe(false);
    expect(inJournalDb({ db: "j-2" }, "j-2")).toBe(true);
    expect(inJournalDb({}, "j-2")).toBe(false);
  });
});

describe("month categories", () => {
  it("labels and parses months", () => {
    expect(monthLabel(new Date(2026, 8, 3).getTime())).toBe("September 2026");
    expect(monthIndex("September 2026")).toBe(2026 * 12 + 8);
    expect(monthIndex("(Not Categorized)")).toBeNull();
    expect(monthIndex("Smarch 2026")).toBeNull();
  });
  it("orders months newest first for a descending date sort", () => {
    const labels = ["August 2026", "January 2027", "September 2026", "December 2025"];
    expect([...labels].sort(monthOrder(-1))).toEqual(["January 2027", "September 2026", "August 2026", "December 2025"]);
    expect([...labels].sort(monthOrder(1))).toEqual(["December 2025", "August 2026", "September 2026", "January 2027"]);
  });
});

describe("categories", () => {
  it("splits keyword lists and subcategories", () => {
    expect(splitCategories("Work, Personal ; work")).toEqual(["Work", "Personal"]);
    expect(splitCategories(" Work \\ Clients ,")).toEqual(["Work\\Clients"]);
    expect(splitCategories("")).toEqual([]);
    expect(splitCategories(undefined)).toEqual([]);
    expect(joinCategories(["Work", "Personal, Books"])).toBe("Work, Personal, Books");
  });
  it("puts empty categories in (Not Categorized)", () => {
    expect(categoryLabels("")).toEqual([""]);
    expect(categoryLabels("A;B")).toEqual(["A", "B"]);
  });
  it("lists every category once, alphabetically", () => {
    expect(allCategories([{ category: "work, Ideas" }, { category: "Work" }, { category: "" }])).toEqual(["Ideas", "work"]);
  });
  it("reads the category under the current row", () => {
    expect(caretCategory("cat:Work")).toBe("Work");
    expect(caretCategory("cat:Work\\Clients")).toBe("Work\\Clients");
    expect(caretCategory("Work\\Clients|j1")).toBe("Work\\Clients");
    expect(caretCategory("cat:(Not Categorized)")).toBeUndefined();
    expect(caretCategory("(Not Categorized)|j1")).toBeUndefined();
    expect(caretCategory("j1")).toBeUndefined();
    expect(caretCategory(null)).toBeUndefined();
  });
});

describe("entries", () => {
  it("filters on subject, body and category", () => {
    expect(matchesEntry(entry(), "marcus")).toBe(true);
    expect(matchesEntry(entry(), "WORK")).toBe(true);
    expect(matchesEntry(entry(), "books")).toBe(false);
    expect(matchesEntry(entry(), "  ")).toBe(true);
  });
  it("starts new pages from tab.init in the right database", () => {
    const e = blankEntry({ subject: "Ideas", category: "Personal;Books" }, "new1", "journal", 1000);
    expect(e).toMatchObject({ id: "new1", subject: "Ideas", category: "Personal, Books", created: 1000, db: undefined });
    expect(blankEntry({}, "new2", "j-2").db).toBe("j-2");
  });
  it("saves the plain text of the rich text body", () => {
    const f = entrySaveFields(entry({ subject: "  Hi  ", bodyHtml: "<div>One</div><div>Two <b>bold</b></div>" }));
    expect(f.subject).toBe("Hi");
    expect(f.body).toBe("One\nTwo bold");
    expect(f.bodyHtml).toContain("<b>bold</b>");
  });
  it("keeps the plain body when the rich text was never touched", () => {
    const f = entrySaveFields(entry());
    expect(f.body).toBeUndefined();
    expect(f.bodyHtml).toBeUndefined();
  });
  it("strips unsafe markup from the saved body", () => {
    const f = entrySaveFields(entry({ bodyHtml: '<div onclick="x()">Hi<script>alert(1)</script></div>' }));
    expect(f.bodyHtml).toBe("<div>Hi</div>");
  });
});
