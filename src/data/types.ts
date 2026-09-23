// ============================================================================
// Lotus Notes: domain model
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

/**
 * Bookkeeping every document carries, after Notes' $Created, $Modified,
 * $Seq (edit sequence number) and $UpdatedBy items. Replication compares
 * sequence numbers; `conflictOf` marks the losing copy of a replication or
 * save conflict, shown as a response to the winner.
 */
export interface DocMeta {
  created?: number;
  modified?: number;
  seq?: number;
  updatedBy?: string;
  conflictOf?: ID;
}

// ---------------------------------------------------------------------------
// Mail (the Memo form and friends)
// ---------------------------------------------------------------------------
export type MailFolder = "inbox" | "sent" | "drafts" | "trash" | "junk" | "chat";

export type FlagColor = "red" | "yellow" | "green" | "blue" | "purple" | "orange";

export interface Attachment {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

/** Delivery Options mood stamps (decorate the memo header). */
export type MoodStamp =
  | "normal"
  | "personal"
  | "confidential"
  | "private"
  | "thankyou"
  | "flame"
  | "goodjob"
  | "joke"
  | "fyi"
  | "question"
  | "reminder";

/** The Notes form a mail document was created with. */
export type MailForm =
  | "Memo"
  | "Reply"
  | "Notice"
  | "DeliveryReport"
  | "ReturnReceipt"
  | "ChatTranscript";

/** Calendar notices that travel by mail (Notes' NoticeType item). */
export type NoticeType =
  | "invitation"
  | "accepted"
  | "declined"
  | "tentative"
  | "delegated"
  | "counter"
  | "rescheduled"
  | "cancelled";

export interface MeetingNotice {
  type: NoticeType;
  /** The meeting's calendar entry id, shared by chair and invitees. */
  entryId: ID;
  subject: string;
  location: string;
  start: number;
  end: number;
  chair: Person;
  /** Counter-proposals and reschedules: the proposed time. */
  proposedStart?: number;
  proposedEnd?: number;
  /** Delegation: who the invitee handed the meeting to. */
  delegate?: Person;
  /** Invitations you received: how you answered (set once you act). */
  response?: "accepted" | "declined" | "tentative" | "delegated" | "counter";
  /** Optional comment sent with a response. */
  comment?: string;
}

export interface MailMessage extends DocMeta {
  id: ID;
  folder: MailFolder;
  from: Person;
  to: Person[];
  cc: Person[];
  bcc?: Person[];
  subject: string;
  body: string;
  /** Rich-text HTML body (when composed with formatting). Falls back to `body`. */
  bodyHtml?: string;
  date: number; // epoch ms (PostedDate / DeliveredDate)
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
  /** Form used to create the document (defaults to Memo). */
  form?: MailForm;
  /** Delivery Options: mood stamp. */
  mood?: MoodStamp;
  /** Delivery Options: return receipt requested. */
  returnReceipt?: boolean;
  /** When you replied to / forwarded this memo (drives the view icons). */
  repliedAt?: number;
  forwardedAt?: number;
  /** The memo this one answers ($Ref), for threads. */
  inReplyTo?: ID;
  /** Calendar notice carried by this memo. */
  notice?: MeetingNotice;
  /** Delivery failure report details. */
  failure?: { originalSubject: string; recipient: string; reason: string };
  /** Return receipt details. */
  receipt?: { originalSubject: string; recipient: string; at: number };
  /** Generated automatically (Out of Office, receipts): never auto-answered. */
  auto?: boolean;
}

/** A user-created mail folder. Messages reference it by id in `labels`. */
export interface CustomFolder {
  id: string;
  name: string;
}

/** A mail rule: when a field contains text, file, flag or junk the memo. Runs on delivery. */
export interface MailRule {
  id: string;
  field: "from" | "subject" | "body";
  contains: string;
  action: "move" | "flag" | "junk";
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

export type InviteeResponse =
  | "needs-action"
  | "accepted"
  | "declined"
  | "tentative"
  | "delegated"
  | "counter";

/** Chair-side tracking of one invitee's answer. */
export interface InviteeStatus {
  person: Person;
  status: InviteeResponse;
  delegate?: Person;
  proposedStart?: number;
  proposedEnd?: number;
  comment?: string;
}

export interface CalendarEntry extends DocMeta {
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
  /** Meetings: who called it (you, for meetings you create). */
  chair?: Person;
  /** Meetings you chair: each invitee's response. */
  inviteeStatus?: InviteeStatus[];
  /** Meetings you were invited to: how you accepted. */
  myResponse?: "accepted" | "tentative";
}

// ---------------------------------------------------------------------------
// Contacts (the Personal Address Book)
// ---------------------------------------------------------------------------
export interface Contact extends DocMeta {
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
export interface ContactGroup extends DocMeta {
  id: ID;
  name: string;
  memberIds: ID[];
}

// ---------------------------------------------------------------------------
// To Do
// ---------------------------------------------------------------------------
export type TaskStatus = "not-started" | "in-progress" | "complete" | "deferred";

/** The To Do form offers High, Medium ("normal"), Low and None. */
export type TaskPriority = Priority | "none";

export interface TodoTask extends DocMeta {
  id: ID;
  subject: string;
  description: string;
  start: number | null;
  due: number | null;
  priority: TaskPriority;
  status: TaskStatus;
  category: string;
  completedDate: number | null;
}

// ---------------------------------------------------------------------------
// Notebook / Personal Journal (one collection; `db` picks the database)
// ---------------------------------------------------------------------------
export interface JournalEntry extends DocMeta {
  id: ID;
  subject: string;
  body: string;
  bodyHtml?: string;
  category: string;
  created: number;
  modified: number;
  /** Database id (a user can create more journals from the template). */
  db?: string;
}

// ---------------------------------------------------------------------------
// Discussion database (threaded; `db` picks the database)
// ---------------------------------------------------------------------------
export interface DiscussionPost extends DocMeta {
  id: ID;
  parentId: ID | null; // null => top-level topic
  topicId: ID; // root post id, shared by every reply in a thread
  subject: string;
  author: Person;
  body: string;
  bodyHtml?: string;
  category: string;
  date: number;
  /** Database id (a user can create more discussions from the template). */
  db?: string;
}

// ---------------------------------------------------------------------------
// User profile, location and preferences
// ---------------------------------------------------------------------------
export type LocationName =
  | "Office (Network)"
  | "Home (Network Dialup)"
  | "Travel (Notes Direct Dialup)"
  | "Island (Disconnected)";

export interface UserProfile {
  /** Common name, e.g. "Sam Rivera". */
  name: string;
  email: string;
  /** Current location document. */
  location: LocationName;
  /** Hierarchical Notes name, e.g. "Sam Rivera/Acme". */
  notesName: string;
}

export interface OutOfOffice {
  enabled: boolean;
  /** Start-of-day epoch ms. */
  leaving: number;
  returning: number;
  /** Extra text after the standard "I will be out of the office..." sentence. */
  message: string;
  /** Senders already notified during this absence (Notes answers each once). */
  notified: string[];
}

export interface MailPrefs {
  /** Keep a copy of sent memos in Sent. "prompt" asks each time. */
  saveSentMail: "always" | "never" | "prompt";
  /** Show the new mail notice when mail arrives. */
  newMailNotify: boolean;
}

// ---------------------------------------------------------------------------
// Databases (the Workspace icons and Database Properties)
// ---------------------------------------------------------------------------
export type DbTemplate =
  | "mail"
  | "addressbook"
  | "journal"
  | "discussion"
  | "help"
  | "directory"
  | "outbox";

export type AccessLevel = "Manager" | "Designer" | "Editor" | "Author" | "Reader";

export interface NotesDatabase {
  id: string;
  title: string;
  template: DbTemplate;
  /** Design template name shown in Database Properties. */
  templateName: string;
  /** Where this copy lives: "Local" or a server name. */
  server: string;
  filePath: string;
  replicaId: string;
  created: number;
  /** A server holding another replica (the Workspace stacks the icons). */
  serverReplica?: string;
  /** Your access in the ACL (shown in the status bar). */
  access: AccessLevel;
  /** Created by the user from a template (shows About on first open). */
  userCreated?: boolean;
}

// ---------------------------------------------------------------------------
// Replication
// Only databases with a server replica replicate: the mail file (mail,
// calendar and to do documents all live in it) and the team discussion.
// ---------------------------------------------------------------------------
export type ReplCollection = "mail" | "calendar" | "todos" | "discussion";

export const REPL_COLLECTIONS: ReplCollection[] = ["mail", "calendar", "todos", "discussion"];

/** Deletion stubs: id -> when it was deleted. */
export type DeletionStubs = Record<ReplCollection, Record<ID, number>>;

/** Per-document sequence number at the last replication (both sides agreed). */
export type ReplBase = Record<ReplCollection, Record<ID, number>>;

export interface ReplicaSnapshot {
  mail: MailMessage[];
  calendar: CalendarEntry[];
  todos: TodoTask[];
  discussion: DiscussionPost[];
  stubs: DeletionStubs;
}

/** What one replication run did, per database. */
export interface ReplDbResult {
  db: string;
  received: number;
  sent: number;
  deleted: number;
  conflicts: number;
}

export interface ReplResult {
  ok: boolean;
  /** Set when the server could not be reached. */
  error?: string;
  dbs: ReplDbResult[];
  /** Memos routed from the outbox. */
  mailSent: number;
  /** Inbox memos that arrived (for the new mail notice). */
  newMail: number;
}

export interface ReplSettings {
  /** Database ids whose replication is enabled on the Replicator page. */
  enabled: Record<string, boolean>;
  sendOutgoing: boolean;
  /** Scheduled replication. */
  scheduleOn: boolean;
  everyMinutes: number;
}

/** Something the simulated Domino server will do at time `at`. */
export type ServerEvent =
  | { kind: "deliver"; at: number; memo: MailMessage }
  | { kind: "post"; at: number; post: DiscussionPost }
  | { kind: "edit-post"; at: number; id: ID; body: string; author: string };
