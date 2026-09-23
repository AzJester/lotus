// ============================================================================
// Notes items. Every document is shown to the Document Properties InfoBox
// (Fields tab) as the item list a Notes document would carry: Form, SendTo,
// PostedDate, $UpdatedBy, $Revisions and friends, each with its data type,
// length and flags.
// ============================================================================

import type {
  CalendarEntry,
  Contact,
  ContactGroup,
  DiscussionPost,
  DocMeta,
  JournalEntry,
  MailMessage,
  Person,
  TodoTask,
} from "./types";
import type { DocColl } from "./ui";
import { canonicalName } from "./names";
import { fmtDateTime } from "../lib/format";

export type ItemType = "Text" | "Text List" | "Rich Text" | "Time/Date" | "Time/Date List" | "Names" | "Author Names" | "Number";

export interface NotesItem {
  name: string;
  type: ItemType;
  value: string;
  flags: string;
}

const size = (v: string) => new TextEncoder().encode(v).length;

function item(name: string, type: ItemType, value: unknown, flags = "SUMMARY"): NotesItem | null {
  if (value === undefined || value === null || value === "") return null;
  let text: string;
  if (Array.isArray(value)) text = value.join(", ");
  else if (typeof value === "number" && (type === "Time/Date" || type === "Time/Date List")) text = fmtDateTime(value);
  else text = String(value);
  return { name, type, value: text, flags };
}

const names = (people: Person[] | undefined) => (people ?? []).map(canonicalName);

function common(doc: DocMeta, author: string): (NotesItem | null)[] {
  return [
    item("$UpdatedBy", "Author Names", [doc.updatedBy ? `CN=${doc.updatedBy.replace("/", "/O=")}` : author], "SUMMARY NAMES READ/WRITE ACCESS"),
    item("$Revisions", "Time/Date List", doc.modified && doc.created !== doc.modified ? doc.modified : undefined),
    doc.conflictOf ? item("$Conflict", "Text", "") ?? { name: "$Conflict", type: "Text", value: "", flags: "SUMMARY" } : null,
    doc.conflictOf ? item("$REF", "Text", doc.conflictOf) : null,
  ];
}

const IMPORTANCE: Record<string, string> = { high: "1", normal: "2", low: "3" };

function mailItems(m: MailMessage): (NotesItem | null)[] {
  return [
    item("Form", "Text", m.form ?? "Memo"),
    item("From", "Names", canonicalName(m.from), "SUMMARY NAMES"),
    item("Principal", "Names", canonicalName(m.from), "SUMMARY NAMES"),
    item("SendTo", "Names", names(m.to), "SUMMARY NAMES"),
    item("CopyTo", "Names", names(m.cc), "SUMMARY NAMES"),
    item("BlindCopyTo", "Names", names(m.bcc), "SUMMARY NAMES"),
    item("Subject", "Text", m.subject),
    item("Body", "Rich Text", m.body, ""),
    item(m.folder === "inbox" ? "DeliveredDate" : "PostedDate", "Time/Date", m.date),
    item("Importance", "Text", IMPORTANCE[m.priority]),
    item("ReturnReceipt", "Text", m.returnReceipt ? "1" : undefined),
    item("$Moods", "Text", m.mood && m.mood !== "normal" ? m.mood.toUpperCase().slice(0, 1) : undefined),
    item("$MessageID", "Text", `<OF${m.id.replace(/-/g, "").slice(0, 16).toUpperCase()}.ON@Acme>`),
    item("$FolderRefs", "Text List", m.labels && m.labels.length ? m.labels : undefined),
    item("$FILE", "Text List", m.attachments?.map((a) => a.name)),
    item("InReply_To", "Text", m.inReplyTo),
    item("NoticeType", "Text", m.notice ? m.notice.type.slice(0, 1).toUpperCase() : undefined),
    item("ApptUNID", "Text", m.notice?.entryId),
    ...common(m, canonicalName(m.from)),
  ];
}

const APPT_TYPE: Record<string, string> = { appointment: "0", anniversary: "1", event: "2", meeting: "3", reminder: "4" };

function calendarItems(e: CalendarEntry): (NotesItem | null)[] {
  return [
    item("Form", "Text", "Appointment"),
    item("AppointmentType", "Text", APPT_TYPE[e.type]),
    item("Subject", "Text", e.subject),
    item("Location", "Text", e.location),
    item("StartDateTime", "Time/Date", e.start),
    item("EndDateTime", "Time/Date", e.end),
    item("Chair", "Names", e.chair ? canonicalName(e.chair) : undefined, "SUMMARY NAMES"),
    item("RequiredAttendees", "Names", names(e.invitees), "SUMMARY NAMES"),
    item("$Alarm", "Number", e.alarm ? "1" : undefined),
    item("$AlarmOffset", "Number", e.alarm ? String(-(e.alarmMinutes ?? 15)) : undefined),
    item("Repeats", "Text", e.recurrence ? "1" : undefined),
    item("RepeatUnit", "Text", e.recurrence?.freq),
    item("Categories", "Text", e.category),
    item("Body", "Rich Text", e.description, ""),
    ...common(e, ""),
  ];
}

function contactItems(c: Contact): (NotesItem | null)[] {
  return [
    item("Form", "Text", "Person"),
    item("Type", "Text", "Person"),
    item("FirstName", "Text", c.firstName),
    item("LastName", "Text", c.lastName),
    item("MailAddress", "Text", c.email),
    item("CompanyName", "Text", c.company),
    item("JobTitle", "Text", c.title),
    item("OfficePhoneNumber", "Text", c.workPhone),
    item("CellPhoneNumber", "Text", c.cellPhone),
    item("OfficeStreetAddress", "Text", c.address),
    item("OfficeCity", "Text", c.city),
    item("OfficeState", "Text", c.state),
    item("OfficeZIP", "Text", c.zip),
    item("OfficeCountry", "Text", c.country),
    item("Categories", "Text", c.category),
    item("Comment", "Text", c.comments),
    ...common(c, ""),
  ];
}

/** A Personal Address Book group (a mailing list). */
function groupItems(g: ContactGroup & { memberNames?: string[] }): (NotesItem | null)[] {
  return [
    item("Form", "Text", "Group"),
    item("Type", "Text", "Group"),
    item("ListName", "Text", g.name),
    item("GroupType", "Text", "0"),
    item("Members", "Text List", g.memberNames ?? g.memberIds, "SUMMARY NAMES"),
    ...common(g, ""),
  ];
}

const TASK_STATE: Record<string, string> = { "not-started": "0", "in-progress": "1", complete: "2", deferred: "3" };

function todoItems(t: TodoTask): (NotesItem | null)[] {
  return [
    item("Form", "Text", "Task"),
    item("Subject", "Text", t.subject),
    item("StartDate", "Time/Date", t.start ?? undefined),
    item("DueDate", "Time/Date", t.due ?? undefined),
    item("Importance", "Text", IMPORTANCE[t.priority]),
    item("TaskState", "Text", TASK_STATE[t.status]),
    item("CompletedDateTime", "Time/Date", t.completedDate ?? undefined),
    item("Categories", "Text", t.category),
    item("Body", "Rich Text", t.description, ""),
    ...common(t, ""),
  ];
}

function journalItems(j: JournalEntry): (NotesItem | null)[] {
  return [
    item("Form", "Text", "JournalEntry"),
    item("Subject", "Text", j.subject),
    item("Categories", "Text", j.category),
    item("Body", "Rich Text", j.body, ""),
    ...common(j, ""),
  ];
}

function discussionItems(p: DiscussionPost): (NotesItem | null)[] {
  return [
    item("Form", "Text", p.parentId ? (p.parentId === p.topicId ? "Response" : "ResponseToResponse") : "MainTopic"),
    item("Subject", "Text", p.subject),
    item("From", "Author Names", canonicalName(p.author), "SUMMARY NAMES READ/WRITE ACCESS"),
    item("Categories", "Text", p.category),
    item("Body", "Rich Text", p.body, ""),
    item("$REF", "Text", p.parentId ?? undefined),
    ...common(p, canonicalName(p.author)),
  ];
}

/** The item list for a document, as the Fields tab shows it (sorted by name). */
export function notesItems(coll: DocColl, doc: unknown): NotesItem[] {
  let list: (NotesItem | null)[] = [];
  if (coll === "mail") list = mailItems(doc as MailMessage);
  else if (coll === "calendar") list = calendarItems(doc as CalendarEntry);
  else if (coll === "contacts")
    list = "memberIds" in (doc as object) ? groupItems(doc as ContactGroup) : contactItems(doc as Contact);
  else if (coll === "todos") list = todoItems(doc as TodoTask);
  else if (coll === "journal") list = journalItems(doc as JournalEntry);
  else if (coll === "discussion") list = discussionItems(doc as DiscussionPost);
  return list
    .filter((x): x is NotesItem => x !== null)
    .sort((a, b) => a.name.replace(/^\$/, "~").localeCompare(b.name.replace(/^\$/, "~")));
}

/** Bytes of storage an item takes (for the Fields tab "Data Length"). */
export const itemLength = (it: NotesItem) => size(it.value) + 2;
