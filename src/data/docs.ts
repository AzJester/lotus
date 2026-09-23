// ============================================================================
// Document bookkeeping shared by the store, router and replicator: unique ids
// and the Notes-style stamps ($Created, $Modified, $Seq, $UpdatedBy) every
// save applies.
// ============================================================================

import type { DocMeta, MailMessage, Person } from "./types";

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "id-" + Math.floor(Math.random() * 1e9).toString(36) + Date.now().toString(36);
}

/** Stamp a brand-new document (sequence 1). */
export function stampNew<T extends DocMeta>(doc: T, by?: string, now = Date.now()): T {
  return {
    ...doc,
    created: doc.created ?? now,
    modified: now,
    seq: 1,
    updatedBy: by ?? doc.updatedBy,
  };
}

/** Apply an edit and bump the sequence number, as every Notes save does. */
export function stampEdit<T extends DocMeta>(doc: T, patch: Partial<T>, by?: string, now = Date.now()): T {
  return {
    ...doc,
    ...patch,
    modified: now,
    seq: (doc.seq ?? 1) + 1,
    updatedBy: by ?? doc.updatedBy,
  };
}

/** Comparable "age" for legacy documents that predate stamps. */
export function docTime(doc: DocMeta & { date?: number; start?: number | null }): number {
  if (typeof doc.modified === "number") return doc.modified;
  if (typeof doc.date === "number") return doc.date;
  if (typeof doc.start === "number") return doc.start;
  return 0;
}

/** A minimal mail document with sensible defaults. */
export function makeMemo(fields: Partial<MailMessage> & { from: Person; to: Person[]; subject: string }): MailMessage {
  const now = fields.date ?? Date.now();
  return stampNew(
    {
      id: fields.id ?? uid(),
      folder: "inbox",
      cc: [],
      body: "",
      date: now,
      read: false,
      flagged: false,
      priority: "normal",
      labels: [],
      form: "Memo",
      ...fields,
    } as MailMessage,
    fields.updatedBy,
    now,
  );
}

/** Strip any number of leading "RE:"/"Re:"/"FW:"/"Fw:" prefixes. */
export function baseSubject(subject: string): string {
  return subject.replace(/^(\s*(re|fw|fwd)\s*:\s*)+/i, "").trim();
}
