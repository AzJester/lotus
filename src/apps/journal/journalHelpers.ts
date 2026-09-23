// ============================================================================
// Personal Journal helpers: which database an entry belongs to, the month
// categories of the By Date view, the Categories keyword list (several
// values separated by commas or semicolons, "A\B" for a subcategory), the
// search filter and the blank entry a new page starts from. Pure.
// ============================================================================

import type { JournalEntry } from "../../data/types";
import { MONTHS } from "../../lib/format";
import { htmlToText, sanitizeHtml } from "../../lib/sanitize";

/** The default Personal Journal (journal.nsf). */
export const JOURNAL_DB = "journal";

/** NotesView's label for documents with an empty category. */
export const NOT_CATEGORIZED = "(Not Categorized)";

/** A window's database id, normalized: the default journal is undefined. */
export function journalDb(db: string | undefined): string | undefined {
  return db && db !== JOURNAL_DB ? db : undefined;
}

/** Does the entry live in this database (undefined = the default journal)? */
export function inJournalDb(e: { db?: string }, db: string | undefined): boolean {
  return (e.db || JOURNAL_DB) === (db || JOURNAL_DB);
}

// ---------------------------------------------------------------------------
// By Date: one category per month
// ---------------------------------------------------------------------------

/** "September 2026" */
export function monthLabel(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Months since year 0 for a month label, or null when it is not one. */
export function monthIndex(label: string): number | null {
  const m = label.match(/^(\S+)\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  return month < 0 ? null : Number(m[2]) * 12 + month;
}

/** Category order for month labels: newest first when the date sort is descending. */
export function monthOrder(dir: 1 | -1): (a: string, b: string) => number {
  return (a, b) => {
    const x = monthIndex(a);
    const y = monthIndex(b);
    if (x === null || y === null) return a.localeCompare(b);
    return (x - y) * dir;
  };
}

// ---------------------------------------------------------------------------
// By Category: the Categories keyword field
// ---------------------------------------------------------------------------

/** "Work, Personal\Books" -> ["Work", "Personal\Books"] (trimmed, no duplicates). */
export function splitCategories(value: string | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of (value ?? "").split(/[,;]/)) {
    const path = raw
      .split("\\")
      .map((p) => p.trim())
      .filter(Boolean)
      .join("\\");
    const key = path.toLowerCase();
    if (!path || seen.has(key)) continue;
    seen.add(key);
    out.push(path);
  }
  return out;
}

export function joinCategories(list: string[]): string {
  return splitCategories(list.join(",")).join(", ");
}

/** Category labels for the By Category view ("" lands in "(Not Categorized)"). */
export function categoryLabels(value: string | undefined): string[] {
  const list = splitCategories(value);
  return list.length ? list : [""];
}

/** Every category used in these entries, alphabetically. */
export function allCategories(entries: { category: string }[]): string[] {
  const byKey = new Map<string, string>();
  for (const e of entries) for (const c of splitCategories(e.category)) if (!byKey.has(c.toLowerCase())) byKey.set(c.toLowerCase(), c);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/**
 * The category under the view's current row, from a NotesView row key:
 * "cat:Work\\Clients" for a category row, "Work|<id>" for a document in it.
 */
export function caretCategory(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  let path: string | undefined;
  if (key.startsWith("cat:")) path = key.slice(4);
  else {
    const bar = key.lastIndexOf("|");
    if (bar > 0) path = key.slice(0, bar);
  }
  return path && path !== NOT_CATEGORIZED ? path : undefined;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** Search bar filter: subject, body text or category contains the words. */
export function matchesEntry(e: JournalEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [e.subject, e.body, e.category].some((v) => (v ?? "").toLowerCase().includes(q));
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The draft a new page starts from (tab.init may carry subject, category, body). */
export function blankEntry(init: Record<string, unknown>, id: string, db: string | undefined, now = Date.now()): JournalEntry {
  return {
    id,
    subject: str(init.subject),
    body: str(init.body),
    category: joinCategories([str(init.category)]),
    created: now,
    modified: now,
    db: journalDb(db),
  };
}

/** The fields a save writes. The plain `body` follows the rich text when it changed. */
export function entrySaveFields(d: JournalEntry): Partial<JournalEntry> {
  const out: Partial<JournalEntry> = {
    subject: d.subject.trim(),
    category: joinCategories([d.category]),
  };
  if (d.bodyHtml !== undefined) {
    const html = sanitizeHtml(d.bodyHtml);
    out.bodyHtml = html;
    out.body = htmlToText(html);
  }
  return out;
}

export const entryTitle = (e: { subject: string }) => e.subject.trim() || "(Untitled)";
