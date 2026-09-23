// ============================================================================
// Content checks for the help documents (helpContent.ts) and the simulated
// server traffic (serverContent.ts): every sender is listed in Acme's
// Directory, placeholders are present, ids are unique, the help markup is
// well formed, and no string contains an em dash.
// ============================================================================

import { describe, expect, it } from "vitest";
import { DIRECTORY_PEOPLE } from "./directory";
import { ABOUT_DOCS, HELP_TOPICS } from "./helpContent";
import type { HelpDbKey, HelpDoc } from "./helpContent";
import {
  DISCUSSION_REPLIES,
  HELPDESK_REPLY,
  INCOMING_MEMOS,
  MEETING_INVITES,
  NEW_TOPICS,
  REPLY_TEMPLATES,
} from "./serverContent";

const NAMES = DIRECTORY_PEOPLE.map((p) => p.name);
const MAILBOXES = ["IT Help Desk", "Human Resources", "Domino Administrator"];
const DB_KEYS: HelpDbKey[] = [
  "mail",
  "calendar",
  "todo",
  "addressbook",
  "journal",
  "discussion",
  "directory",
  "help",
  "outbox",
];
const ALL_HELP_DOCS: HelpDoc[] = [
  ...Object.values(ABOUT_DOCS).flatMap((pair) => [pair.about, pair.using]),
  ...HELP_TOPICS,
];

const notInDirectory = (names: string[]) => names.filter((n) => !NAMES.includes(n));

/** Every string inside a value, however deeply nested. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

/** The placeholders ({name}) used in a template. */
const placeholders = (s: string) => s.match(/\{[^}]*\}/g) ?? [];

/** Problems with a help body's markup (see HelpDoc). */
function markupProblems(doc: HelpDoc): string[] {
  const problems: string[] = [];
  if (doc.body !== doc.body.trim()) problems.push("leading or trailing whitespace");
  if (doc.body.replace(/\*\*/g, "").includes("*")) problems.push("stray asterisk");
  if ((doc.body.match(/\*\*/g) ?? []).length % 2 !== 0) problems.push("unbalanced **bold**");
  for (const block of doc.body.split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const first = lines[0];
    if (lines.some((l) => l.includes("|"))) {
      const cells = new Set(lines.map((l) => l.split(" | ").length));
      if (lines.length < 2 || cells.size !== 1 || cells.has(1)) problems.push(`malformed table: ${first}`);
      continue;
    }
    if (lines.some((l) => l.startsWith("#") && !/^## \S/.test(l))) problems.push(`bad heading: ${first}`);
    if (lines.length > 1 && lines.some((l) => l.startsWith("## "))) problems.push(`heading shares a block: ${first}`);
    if (lines.some((l) => l.startsWith("- ")) && !lines.every((l) => l.startsWith("- "))) {
      problems.push(`bullets mixed with text: ${first}`);
    }
  }
  return problems;
}

describe("server content", () => {
  it("sends memos only from people in Acme's Directory", () => {
    expect(notInDirectory(INCOMING_MEMOS.map((m) => m.from))).toEqual([]);
  });

  it("posts topics and responses only from people in Acme's Directory", () => {
    expect(notInDirectory(NEW_TOPICS.map((t) => t.author))).toEqual([]);
    expect(notInDirectory(DISCUSSION_REPLIES.map((r) => r.author))).toEqual([]);
  });

  it("has meetings chaired only by people in Acme's Directory", () => {
    expect(notInDirectory(MEETING_INVITES.map((i) => i.chair))).toEqual([]);
  });

  it("has enough of each kind of traffic", () => {
    expect(INCOMING_MEMOS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(INCOMING_MEMOS.map((m) => m.from)).size).toBeGreaterThanOrEqual(8);
    expect(REPLY_TEMPLATES.length).toBeGreaterThanOrEqual(15);
    expect(NEW_TOPICS.length).toBeGreaterThanOrEqual(8);
    expect(DISCUSSION_REPLIES.length).toBeGreaterThanOrEqual(20);
    expect(MEETING_INVITES.length).toBeGreaterThanOrEqual(10);
  });

  it("signs each memo with the sender's first name, or in full for a mailbox", () => {
    const unsigned = INCOMING_MEMOS.filter((m) => {
      const signature = MAILBOXES.includes(m.from) ? m.from : m.from.split(" ")[0];
      return m.body.split("\n").pop() !== signature;
    });
    expect(unsigned.map((m) => m.subject)).toEqual([]);
  });

  it("files topics under the four discussion categories", () => {
    const categories = ["Process", "Off-topic", "Announcements", "Tools"];
    expect(NEW_TOPICS.filter((t) => !categories.includes(t.category))).toEqual([]);
  });

  it("gives meetings a positive length", () => {
    expect(MEETING_INVITES.filter((i) => !(i.durationMin > 0))).toEqual([]);
  });

  it("signs reply templates with {me} and uses only known placeholders", () => {
    for (const t of REPLY_TEMPLATES) {
      expect(t).toContain("{me}");
      expect(t.endsWith("{me}")).toBe(true);
    }
    const known = ["{first}", "{subject}", "{me}"];
    expect(REPLY_TEMPLATES.flatMap(placeholders).filter((p) => !known.includes(p))).toEqual([]);
  });

  it("puts the ticket number in the help desk acknowledgment", () => {
    expect(HELPDESK_REPLY).toContain("{ticket}");
    expect(HELPDESK_REPLY).toContain("{subject}");
    expect(placeholders(HELPDESK_REPLY).filter((p) => p !== "{ticket}" && p !== "{subject}")).toEqual([]);
  });
});

describe("help content", () => {
  it("has About and Using documents for every database", () => {
    expect(Object.keys(ABOUT_DOCS).sort()).toEqual([...DB_KEYS].sort());
    for (const key of DB_KEYS) {
      const { about, using } = ABOUT_DOCS[key];
      for (const d of [about, using]) {
        expect(d.title.trim(), `${key} title`).not.toBe("");
        expect(d.body.trim(), `${key} body`).not.toBe("");
      }
    }
  });

  it("has 12 to 16 Lotus Notes Help topics", () => {
    expect(HELP_TOPICS.length).toBeGreaterThanOrEqual(12);
    expect(HELP_TOPICS.length).toBeLessThanOrEqual(16);
    expect(HELP_TOPICS.filter((d) => !d.title.trim() || !d.body.trim())).toEqual([]);
  });

  it("gives every help document a unique id", () => {
    const ids = ALL_HELP_DOCS.map((d) => d.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it("uses only the supported help markup", () => {
    const problems = ALL_HELP_DOCS.flatMap((d) => markupProblems(d).map((p) => `${d.id}: ${p}`));
    expect(problems).toEqual([]);
  });
});

describe("all content", () => {
  it("contains no em dashes", () => {
    const all = strings([
      ABOUT_DOCS,
      HELP_TOPICS,
      INCOMING_MEMOS,
      REPLY_TEMPLATES,
      HELPDESK_REPLY,
      NEW_TOPICS,
      DISCUSSION_REPLIES,
      MEETING_INVITES,
    ]);
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((s) => s.includes("\u2014")).map((s) => s.slice(0, 60))).toEqual([]);
  });
});
