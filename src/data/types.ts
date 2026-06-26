// ============================================================================
// Lotus Notes — domain model
// Notes stores everything as "documents" inside "databases". We model each
// database as a typed collection. These types are the shared contract every
// application module reads and writes through the store (see store.ts).
// ============================================================================

export type ID = string;

export interface Person {
  name: string;
  email: string;
}

export type Priority = "high" | "normal" | "low";

// ---------------------------------------------------------------------------
// Mail (the Memo form)
// ---------------------------------------------------------------------------
export type MailFolder = "inbox" | "sent" | "drafts" | "trash";

export type FlagColor = "red" | "yellow" | "green" | "blue" | "purple" | "orange";

export interface Attachment {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface MailMessage {
  id: ID;
  folder: MailFolder;
  from: Person;
  to: Person[];
  cc: Person[];
  subject: string;
  body: string;
  /** Rich-text HTML body (when composed with formatting). Falls back to `body`. */
  bodyHtml?: string;
  date: number; // epoch ms
  read: boolean;
  flagged: boolean; // follow-up flag
  /** Follow-up flag color (Notes colors rows by flag). Defaults to yellow when flagged. */
  flagColor?: FlagColor;
  /** Whether the memo carries an attachment (shows the paperclip column). */
  hasAttachment?: boolean;
  /** Actual attached files (stored inline as data URLs). */
  attachments?: Attachment[];
  priority: Priority;
  /** Ids of the custom folders this memo is filed under (a message can be in many). */
  labels?: string[];
}

/** A user-created mail folder. Messages reference it by id in `labels`. */
export interface CustomFolder {
  id: string;
  name: string;
}

/** A simple mail rule: when a field contains text, move or flag the message. */
export interface MailRule {
  id: string;
  field: "from" | "subject" | "body";
  contains: string;
  action: "move" | "flag";
  /** Target folder id when action is "move". */
  folderId?: string;
  /** Flag color applied when action is "flag". */
  flagColor?: FlagColor;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
export type CalEntryType =
  | "appointment"
  | "meeting"
  | "reminder"
  | "event"
  | "anniversary";

export type RecurFreq = "daily" | "weekly" | "monthly";

export interface Recurrence {
  freq: RecurFreq;
  /** Inclusive end of the series, epoch ms. */
  until: number;
}

export interface CalendarEntry {
  id: ID;
  type: CalEntryType;
  subject: string;
  location: string;
  start: number; // epoch ms
  end: number; // epoch ms
  allDay: boolean;
  description: string;
  invitees: Person[];
  category: string;
  alarm: boolean;
  /** Minutes before start to alert. Defaults to 15 when alarm is on. */
  alarmMinutes?: number;
  /** When set, this entry is a recurring master that expands into occurrences. */
  recurrence?: Recurrence;
}

// ---------------------------------------------------------------------------
// Contacts (the Personal Address Book)
// ---------------------------------------------------------------------------
export interface Contact {
  id: ID;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  title: string;
  workPhone: string;
  cellPhone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  category: string;
  comments: string;
}

/** A mailing list: a named set of contacts referenced by id. */
export interface ContactGroup {
  id: ID;
  name: string;
  memberIds: ID[];
}

// ---------------------------------------------------------------------------
// To Do
// ---------------------------------------------------------------------------
export type TaskStatus = "not-started" | "in-progress" | "complete" | "deferred";

export interface TodoTask {
  id: ID;
  subject: string;
  description: string;
  start: number | null;
  due: number | null;
  priority: Priority;
  status: TaskStatus;
  category: string;
  completedDate: number | null;
}

// ---------------------------------------------------------------------------
// Notebook / Journal
// ---------------------------------------------------------------------------
export interface JournalEntry {
  id: ID;
  subject: string;
  body: string;
  category: string;
  created: number;
  modified: number;
}

// ---------------------------------------------------------------------------
// Discussion database (threaded)
// ---------------------------------------------------------------------------
export interface DiscussionPost {
  id: ID;
  parentId: ID | null; // null => top-level topic
  topicId: ID; // root post id, shared by every reply in a thread
  subject: string;
  author: Person;
  body: string;
  category: string;
  date: number;
}

// ---------------------------------------------------------------------------
// User profile / preferences
// ---------------------------------------------------------------------------
export interface UserProfile {
  name: string;
  email: string;
  location: string;
}
