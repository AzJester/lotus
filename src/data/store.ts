// ============================================================================
// Lotus Notes: persistent data store
// A single Zustand store, persisted to IndexedDB, that holds every Notes
// database plus the simulated Domino server's replicas. Modules read slices
// and call the typed actions below. Every save stamps the document like Notes
// does ($Modified, $Seq, $UpdatedBy); deletes of replicated documents leave
// deletion stubs so replication can carry them to the server.
// ============================================================================

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  CalendarEntry,
  Contact,
  ContactGroup,
  CustomFolder,
  DeletionStubs,
  DiscussionPost,
  DocMeta,
  ID,
  JournalEntry,
  LocationName,
  MailFolder,
  MailMessage,
  MailPrefs,
  MailRule,
  MeetingNotice,
  NotesDatabase,
  OutOfOffice,
  Person,
  ReplBase,
  ReplCollection,
  ReplDbResult,
  ReplicaSnapshot,
  ReplResult,
  ReplSettings,
  ServerEvent,
  TodoTask,
  UserProfile,
} from "./types";
import { REPL_COLLECTIONS } from "./types";
import { buildSeed } from "./seed";
import { idbStorage } from "./idb";
import { sanitizeHtml } from "../lib/sanitize";
import { stampEdit, stampNew, uid as newId } from "./docs";
import { mergeCollection, pendingCount } from "./replication";
import { routeMemo } from "./router";
import type { RouteFailure } from "./router";
import { tickServer, DISCUSSION_DB } from "./server";
import { applyResponse, entryFromNotice, meetingSummary, noticeFor, noticeMemo } from "./scheduling";
import { fmtTime } from "../lib/format";

export { uid } from "./docs";

export const LOCATIONS: LocationName[] = [
  "Office (Network)",
  "Home (Network Dialup)",
  "Travel (Notes Direct Dialup)",
  "Island (Disconnected)",
];

/** Office works directly against the server; the others keep mail local. */
export const isOnline = (loc: LocationName) => loc === "Office (Network)";
export const canReachServer = (loc: LocationName) => loc !== "Island (Disconnected)";

/** Which collections live in which replicated database. */
export const DB_COLLECTIONS: Record<string, ReplCollection[]> = {
  mail: ["mail", "calendar", "todos"],
  discussion: ["discussion"],
};

export type InvitationAction = "accept" | "tentative" | "decline" | "delegate" | "counter" | "remove";

export interface SendOptions {
  /** Keep a copy in Sent. */
  saveCopy: boolean;
  /** Send and File: file the sent copy in this custom folder. */
  fileTo?: string;
}

export interface SendOutcome {
  /** True when the memo waits in Outgoing Mail (not connected to the server). */
  queued: boolean;
  /** Recipients the router could not resolve (a Delivery Failure Report follows). */
  failures: RouteFailure[];
}

export interface ChatLine {
  who: "me" | "them" | "system";
  text: string;
  at: number;
}

export interface NotesState {
  user: UserProfile;
  prefs: MailPrefs;
  ooo: OutOfOffice;
  mail: MailMessage[];
  calendar: CalendarEntry[];
  contacts: Contact[];
  contactGroups: ContactGroup[];
  todos: TodoTask[];
  journal: JournalEntry[];
  discussion: DiscussionPost[];
  customFolders: CustomFolder[];
  mailRules: MailRule[];
  databases: NotesDatabase[];
  /** Outgoing Mail (mail.box): memos sent while not connected to the server. */
  outbox: MailMessage[];
  /** Alarm acknowledgements: occurrence key -> snoozed-until ms, or -1 when done. */
  alarmAcks: Record<string, number>;

  // --- replication / simulated server ---
  stubs: DeletionStubs;
  replBase: ReplBase;
  replSettings: ReplSettings;
  /** Database id -> when it last replicated. */
  replLog: Record<string, number>;
  lastReplicated: number | null;
  server: ReplicaSnapshot;
  serverQueue: ServerEvent[];
  nextTrafficAt: number;
  usedContent: string[];
  /** Colleague name -> senders their Out of Office agent already answered. */
  oooNotified: Record<string, string[]>;

  // --- profile & preferences ---
  setUser: (patch: Partial<UserProfile>) => void;
  setLocation: (location: LocationName) => void;
  setPrefs: (patch: Partial<MailPrefs>) => void;
  setOutOfOffice: (patch: Partial<OutOfOffice>) => void;

  // --- mail ---
  addMail: (m: MailMessage) => void;
  updateMail: (id: string, patch: Partial<MailMessage>) => void;
  updateMailMany: (ids: string[], patch: Partial<MailMessage>) => void;
  /** Legacy: file a sent copy and route it. Prefer sendMemo. */
  sendMail: (m: MailMessage) => void;
  sendMemo: (m: MailMessage, opts: SendOptions) => SendOutcome;
  moveMail: (id: string, folder: MailFolder) => void;
  deleteMail: (id: string) => void; // soft-delete to trash, or purge if already trashed
  deleteMails: (ids: string[]) => void;
  emptyTrash: () => void;
  markRead: (id: string, read: boolean) => void;
  markReadMany: (ids: string[], read: boolean) => void;
  respondToInvitation: (
    noticeId: string,
    action: InvitationAction,
    extra?: { delegate?: Person; proposedStart?: number; proposedEnd?: number; comment?: string },
  ) => void;
  saveChatTranscript: (buddy: string, lines: ChatLine[]) => void;

  // --- custom mail folders ---
  addFolder: (name: string) => string; // returns the new folder id
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void; // also strips the label from every message
  setMailFolderLabel: (msgId: string, folderId: string, on: boolean) => void;

  // --- mail rules ---
  addRule: (r: MailRule) => void;
  deleteRule: (id: string) => void;
  /** Run every rule over the Inbox now. Returns how many memos changed. */
  applyRules: () => number;

  // --- calendar ---
  addCalendarEntry: (e: CalendarEntry) => void;
  updateCalendarEntry: (id: string, patch: Partial<CalendarEntry>) => void;
  deleteCalendarEntry: (id: string) => void;
  /** Send invitations (or reschedule / cancellation notices) for a meeting you chair; `only` limits who gets it. */
  sendInvitations: (entryId: string, kind?: "invitation" | "rescheduled" | "cancelled", only?: Person[]) => SendOutcome;
  ackAlarm: (key: string, until: number) => void;

  // --- contacts ---
  addContact: (c: Contact) => void;
  updateContact: (id: string, patch: Partial<Contact>) => void;
  deleteContact: (id: string) => void;

  // --- contact groups (mailing lists) ---
  addGroup: (g: ContactGroup) => void;
  updateGroup: (id: string, patch: Partial<ContactGroup>) => void;
  deleteGroup: (id: string) => void;

  // --- todos ---
  addTodo: (t: TodoTask) => void;
  updateTodo: (id: string, patch: Partial<TodoTask>) => void;
  deleteTodo: (id: string) => void;

  // --- journal ---
  addJournal: (j: JournalEntry) => void;
  updateJournal: (id: string, patch: Partial<JournalEntry>) => void;
  deleteJournal: (id: string) => void;

  // --- discussion ---
  addPost: (p: DiscussionPost) => void;
  updatePost: (id: string, patch: Partial<DiscussionPost>) => void;
  deletePost: (id: string) => void; // also removes descendant replies

  // --- databases ---
  addDatabase: (db: NotesDatabase) => void;
  updateDatabase: (id: string, patch: Partial<NotesDatabase>) => void;

  // --- replication & server ---
  replicate: (opts?: { dbs?: string[]; sendOutgoing?: boolean }) => ReplResult;
  /** Route everything in Outgoing Mail. Returns how many memos left. */
  sendOutgoing: () => number;
  /** Local changes the server has not seen yet, for one database. */
  pendingFor: (dbId: string) => number;
  setReplSettings: (patch: Partial<ReplSettings>) => void;
  /** Advance the simulated server. At Office, new mail is pulled at once. */
  serverTick: (now?: number) => { delivered: number; newMail: number; discussionChanged: number };
  /** Legacy wrapper around replicate(). */
  replicateNow: () => { pulled: number; pushed: number };
  /** Legacy: pending changes across every replicated database. */
  pendingChanges: () => number;

  // --- maintenance ---
  resetAll: () => void;
  /** Serialize the entire workspace to a JSON string (the "NSF" backup). */
  exportAll: () => string;
  /** Replace the workspace from an exported JSON string. Returns success. */
  importAll: (json: string) => boolean;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const emptyStubs = (): DeletionStubs => ({ mail: {}, calendar: {}, todos: {}, discussion: {} });
const emptyBase = (): ReplBase => ({ mail: {}, calendar: {}, todos: {}, discussion: {} });

const defaultReplSettings = (): ReplSettings => ({
  enabled: { mail: true, discussion: true },
  sendOutgoing: true,
  scheduleOn: true,
  everyMinutes: 10,
});

const isReplicatedPost = (p: DiscussionPost) => (p.db ?? DISCUSSION_DB) === DISCUSSION_DB;

/** The server replica built from a fresh seed, plus server-only documents so
 *  the first replication visibly brings something down. */
function buildServerSnapshot(seed = buildSeed()): ReplicaSnapshot {
  const now = Date.now();
  const serverMemo = stampNew<MailMessage>(
    {
      id: "srv-1",
      folder: "inbox",
      from: { name: "Domino Administrator", email: "admin@acme.example.com" },
      to: [{ name: seed.user.name, email: seed.user.email }],
      cc: [],
      subject: "Replication: server is online",
      body:
        "This message originated on the Domino server replica.\n\n" +
        "When you replicate, documents new to your local copy are pulled down and " +
        "documents you created locally are pushed up to the server.\n\nDomino Administrator",
      date: now - 10 * 60000,
      read: false,
      flagged: false,
      priority: "normal",
      labels: [],
    },
    "Domino Administrator",
    now - 10 * 60000,
  );
  const topic = seed.discussion.find((p) => p.parentId === null);
  const serverPost: DiscussionPost[] = topic
    ? [
        stampNew<DiscussionPost>(
          {
            id: "srv-d1",
            parentId: topic.id,
            topicId: topic.topicId,
            subject: `RE: ${topic.subject}`,
            author: { name: "Linda Park", email: "linda.park@acme.example.com" },
            body: "Late to this thread, but Product is in. We'd like to line our release reviews up with the sprint boundaries.",
            category: topic.category,
            date: now - 20 * 60000,
            db: DISCUSSION_DB,
          },
          "Linda Park",
          now - 20 * 60000,
        ),
      ]
    : [];
  return {
    mail: [serverMemo, ...seed.mail],
    calendar: seed.calendar,
    todos: seed.todos,
    discussion: [...seed.discussion, ...serverPost],
    stubs: emptyStubs(),
  };
}

/** Both replicas start from the same seed, so they agree on every shared document. */
function agreedBase(seed: ReturnType<typeof buildSeed>, server: ReplicaSnapshot): ReplBase {
  const base = emptyBase();
  const local: Record<ReplCollection, DocMetaWithId[]> = {
    mail: seed.mail,
    calendar: seed.calendar,
    todos: seed.todos,
    discussion: seed.discussion,
  };
  for (const coll of REPL_COLLECTIONS) {
    const onServer = new Map((server[coll] as DocMetaWithId[]).map((d) => [d.id, d]));
    for (const d of local[coll]) {
      const r = onServer.get(d.id);
      if (r && (r.seq ?? 1) === (d.seq ?? 1)) base[coll][d.id] = d.seq ?? 1;
    }
  }
  return base;
}

type DocMetaWithId = { id: string; seq?: number };

function freshData() {
  const seed = buildSeed();
  const server = buildServerSnapshot(seed);
  return {
    user: seed.user,
    prefs: seed.prefs,
    ooo: seed.ooo,
    mail: seed.mail,
    calendar: seed.calendar,
    contacts: seed.contacts,
    contactGroups: seed.contactGroups,
    todos: seed.todos,
    journal: seed.journal,
    discussion: seed.discussion,
    customFolders: seed.customFolders,
    mailRules: seed.mailRules,
    databases: seed.databases,
    outbox: [] as MailMessage[],
    alarmAcks: {} as Record<string, number>,
    stubs: emptyStubs(),
    replBase: agreedBase(seed, server),
    replSettings: defaultReplSettings(),
    replLog: {} as Record<string, number>,
    lastReplicated: null as number | null,
    server,
    serverQueue: [] as ServerEvent[],
    nextTrafficAt: Date.now() + 75000,
    usedContent: [] as string[],
    oooNotified: {} as Record<string, string[]>,
  };
}

const me = (s: Pick<NotesState, "user">): Person => ({ name: s.user.name, email: s.user.email });

function withStub(stubs: DeletionStubs, coll: ReplCollection, ids: ID[], now = Date.now()): DeletionStubs {
  if (!ids.length) return stubs;
  const next = { ...stubs[coll] };
  for (const id of ids) next[id] = now;
  return { ...stubs, [coll]: next };
}

function conflictCopy<T extends DocMeta & { id: ID }>(loser: T, winner: T): T {
  const now = Date.now();
  return { ...loser, id: `${winner.id}~conflict~${newId().slice(0, 8)}`, conflictOf: winner.id, seq: 1, created: now, modified: now };
}

/** Sanitize and stamp documents arriving through File > Import. */
function importDocs<T extends DocMeta>(list: unknown, withHtml = false): T[] {
  if (!Array.isArray(list)) return [];
  const now = Date.now();
  return (list as T[]).map((d) => {
    const doc = { ...d } as T & { bodyHtml?: unknown };
    if (withHtml && typeof doc.bodyHtml === "string") doc.bodyHtml = sanitizeHtml(doc.bodyHtml);
    else delete doc.bodyHtml;
    doc.created = doc.created ?? now;
    doc.modified = now; // imported copies win over older deletion stubs
    doc.seq = doc.seq ?? 1;
    return doc as T;
  });
}

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

export const useNotes = create<NotesState>()(
  persist(
    (set, get) => {
      const by = () => get().user.notesName;
      const edit = <T extends DocMeta>(doc: T, patch: Partial<T>) => stampEdit(doc, patch, by());
      const fresh = <T extends DocMeta>(doc: T) => stampNew(doc, by());

      const routerCtx = () => {
        const s = get();
        return {
          now: Date.now(),
          me: me(s),
          contacts: s.contacts,
          groups: s.contactGroups,
          oooNotified: s.oooNotified,
          rand: Math.random,
        };
      };

      /** Route now (Office) or park in Outgoing Mail (everywhere else). */
      const dispatch = (memo: MailMessage): SendOutcome => {
        const s = get();
        if (isOnline(s.user.location)) {
          const r = routeMemo(memo, routerCtx());
          set({ serverQueue: [...get().serverQueue, ...r.events], oooNotified: r.oooNotified });
          return { queued: false, failures: r.failures };
        }
        set({ outbox: [...get().outbox, memo] });
        return { queued: true, failures: [] };
      };

      /** Chair side: fold arrived invitee responses into your meetings. */
      const processResponses = (arrivedMail: MailMessage[]) => {
        const s = get();
        const mine = s.user.email.toLowerCase();
        let calendar = s.calendar;
        let changed = false;
        for (const m of arrivedMail) {
          const n = m.notice;
          if (!n || n.type === "invitation" || n.type === "rescheduled" || n.type === "cancelled") continue;
          if (n.chair.email.toLowerCase() !== mine) continue;
          calendar = calendar.map((e) => {
            if (e.id !== n.entryId) return e;
            changed = true;
            return edit(e, { inviteeStatus: applyResponse(e, m).inviteeStatus });
          });
        }
        if (changed) set({ calendar });
      };

      return {
        ...freshData(),

        setUser: (patch) => set((s) => ({ user: { ...s.user, ...patch } })),
        setLocation: (location) => set((s) => ({ user: { ...s.user, location } })),
        setPrefs: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),
        setOutOfOffice: (patch) =>
          set((s) => {
            const ooo = { ...s.ooo, ...patch };
            // Turning the agent on starts a fresh absence: nobody notified yet.
            if (patch.enabled && !s.ooo.enabled) ooo.notified = [];
            return { ooo };
          }),

        // ------------------------------------------------------------- mail
        addMail: (m) => set((s) => ({ mail: [fresh(m), ...s.mail] })),
        updateMail: (id, patch) => set((s) => ({ mail: s.mail.map((m) => (m.id === id ? edit(m, patch) : m)) })),
        updateMailMany: (ids, patch) =>
          set((s) => {
            const want = new Set(ids);
            return { mail: s.mail.map((m) => (want.has(m.id) ? edit(m, patch) : m)) };
          }),
        sendMail: (m) => {
          get().sendMemo(m, { saveCopy: true });
        },
        sendMemo: (m, opts) => {
          const s = get();
          const now = Date.now();
          const labels = opts.fileTo ? Array.from(new Set([...(m.labels ?? []), opts.fileTo])) : m.labels ?? [];
          const existing = s.mail.find((x) => x.id === m.id);
          const fields = { ...m, folder: "sent" as MailFolder, read: true, date: now, from: me(s), labels };
          const sentCopy: MailMessage = existing ? edit(existing, fields) : stampNew(fields, by(), now);
          let mail = s.mail.filter((x) => x.id !== m.id);
          let stubs = s.stubs;
          if (opts.saveCopy) mail = [sentCopy, ...mail];
          else if (existing) stubs = withStub(stubs, "mail", [m.id], now);
          set({ mail, stubs });
          return dispatch(sentCopy);
        },
        moveMail: (id, folder) => set((s) => ({ mail: s.mail.map((m) => (m.id === id ? edit(m, { folder }) : m)) })),
        deleteMail: (id) => get().deleteMails([id]),
        deleteMails: (ids) =>
          set((s) => {
            const want = new Set(ids);
            const purged: ID[] = [];
            const mail = s.mail.flatMap((m) => {
              if (!want.has(m.id)) return [m];
              if (m.folder === "trash") {
                purged.push(m.id);
                return [];
              }
              return [edit(m, { folder: "trash" as MailFolder })];
            });
            return { mail, stubs: withStub(s.stubs, "mail", purged) };
          }),
        emptyTrash: () =>
          set((s) => {
            const purged = s.mail.filter((m) => m.folder === "trash").map((m) => m.id);
            return { mail: s.mail.filter((m) => m.folder !== "trash"), stubs: withStub(s.stubs, "mail", purged) };
          }),
        markRead: (id, read) => get().markReadMany([id], read),
        markReadMany: (ids, read) =>
          set((s) => {
            const want = new Set(ids);
            return { mail: s.mail.map((m) => (want.has(m.id) && m.read !== read ? edit(m, { read }) : m)) };
          }),

        respondToInvitation: (noticeId, action, extra = {}) => {
          const s = get();
          const memo = s.mail.find((m) => m.id === noticeId);
          const n = memo?.notice;
          if (!memo || !n) return;
          const self = me(s);
          const others = [...memo.to, ...memo.cc].filter((p) => p.email.toLowerCase() !== self.email.toLowerCase());
          const reply = (type: MeetingNotice["type"], body: string, patch: Partial<MeetingNotice> = {}) => {
            const out: MeetingNotice = { ...n, type, response: undefined, comment: extra.comment, ...patch };
            get().sendMemo(noticeMemo(out, self, [n.chair], `${body}\n\n${meetingSummary(out)}`), { saveCopy: false });
          };
          const existing = s.calendar.find((e) => e.id === n.entryId);
          const upsertEntry = (response: "accepted" | "tentative") => {
            const entry = entryFromNotice(n, [n.chair, ...others], response);
            if (existing) get().updateCalendarEntry(existing.id, { start: entry.start, end: entry.end, myResponse: response });
            else get().addCalendarEntry(entry);
          };
          let response: MeetingNotice["response"];
          switch (action) {
            case "accept":
              upsertEntry("accepted");
              if (n.type !== "rescheduled") reply("accepted", extra.comment || "I'll be there.");
              response = "accepted";
              break;
            case "tentative":
              upsertEntry("tentative");
              reply("tentative", extra.comment || "I'll try to make it.");
              response = "tentative";
              break;
            case "decline":
              if (existing) get().deleteCalendarEntry(existing.id);
              reply("declined", extra.comment || "Sorry, I can't make it.");
              response = "declined";
              break;
            case "delegate":
              if (!extra.delegate) return;
              reply("delegated", `I've delegated this meeting to ${extra.delegate.name}.`, { delegate: extra.delegate });
              get().sendMemo(
                noticeMemo(
                  { ...n, type: "invitation", response: undefined },
                  self,
                  [extra.delegate],
                  `Delegated to you by ${self.name}.\n\n${meetingSummary(n)}`,
                ),
                { saveCopy: false },
              );
              response = "delegated";
              break;
            case "counter":
              if (!extra.proposedStart || !extra.proposedEnd) return;
              reply("counter", extra.comment || `Could we meet at ${fmtTime(extra.proposedStart)} instead?`, {
                proposedStart: extra.proposedStart,
                proposedEnd: extra.proposedEnd,
              });
              response = "counter";
              break;
            case "remove":
              if (existing) get().deleteCalendarEntry(existing.id);
              break;
          }
          get().updateMail(noticeId, { notice: { ...n, response }, read: true });
        },

        saveChatTranscript: (buddy, lines) => {
          const s = get();
          const spoken = lines.filter((l) => l.who !== "system");
          if (!spoken.length) return;
          const body = lines
            .map((l) =>
              l.who === "system"
                ? `(${fmtTime(l.at)}) ${l.text}`
                : `(${fmtTime(l.at)}) ${l.who === "me" ? s.user.name : buddy}: ${l.text}`,
            )
            .join("\n");
          const memo = stampNew<MailMessage>(
            {
              id: newId(),
              folder: "chat",
              form: "ChatTranscript",
              from: me(s),
              to: [{ name: buddy, email: "" }],
              cc: [],
              subject: `Chat with ${buddy}`,
              body,
              date: lines[0].at,
              read: true,
              flagged: false,
              priority: "normal",
              labels: [],
            },
            by(),
          );
          set({ mail: [memo, ...s.mail] });
        },

        // --------------------------------------------------- custom folders
        addFolder: (name) => {
          const folder: CustomFolder = { id: newId(), name: name.trim() || "Untitled Folder" };
          set((s) => ({ customFolders: [...s.customFolders, folder] }));
          return folder.id;
        },
        renameFolder: (id, name) =>
          set((s) => ({
            customFolders: s.customFolders.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)),
          })),
        deleteFolder: (id) =>
          set((s) => ({
            customFolders: s.customFolders.filter((f) => f.id !== id),
            mail: s.mail.map((m) =>
              m.labels && m.labels.includes(id) ? edit(m, { labels: m.labels.filter((l) => l !== id) }) : m,
            ),
          })),
        setMailFolderLabel: (msgId, folderId, on) =>
          set((s) => ({
            mail: s.mail.map((m) => {
              if (m.id !== msgId) return m;
              const current = m.labels ?? [];
              if (on) return current.includes(folderId) ? m : edit(m, { labels: [...current, folderId] });
              return current.includes(folderId) ? edit(m, { labels: current.filter((l) => l !== folderId) }) : m;
            }),
          })),

        // ------------------------------------------------------------ rules
        addRule: (r) => set((s) => ({ mailRules: [...s.mailRules, r] })),
        deleteRule: (id) => set((s) => ({ mailRules: s.mailRules.filter((r) => r.id !== id) })),
        applyRules: () => {
          const s = get();
          if (s.mailRules.length === 0) return 0;
          let affected = 0;
          const next = s.mail.map((m) => {
            if (m.folder !== "inbox") return m;
            let msg = m;
            for (const rule of s.mailRules) {
              const needle = rule.contains.trim().toLowerCase();
              if (!needle) continue;
              const hay =
                rule.field === "from" ? `${msg.from.name} ${msg.from.email}` : rule.field === "subject" ? msg.subject : msg.body;
              if (!hay.toLowerCase().includes(needle)) continue;
              if (rule.action === "move" && rule.folderId) {
                const labels = msg.labels ?? [];
                if (!labels.includes(rule.folderId)) msg = { ...msg, labels: [...labels, rule.folderId] };
              } else if (rule.action === "flag") {
                const color = rule.flagColor ?? "yellow";
                if (!msg.flagged || msg.flagColor !== color) msg = { ...msg, flagged: true, flagColor: color };
              } else if (rule.action === "junk") {
                msg = { ...msg, folder: "junk" };
              }
            }
            if (msg === m) return m;
            affected++;
            return edit(m, msg);
          });
          if (affected > 0) set({ mail: next });
          return affected;
        },

        // --------------------------------------------------------- calendar
        addCalendarEntry: (e) => set((s) => ({ calendar: [...s.calendar, fresh(e)] })),
        updateCalendarEntry: (id, patch) =>
          set((s) => ({ calendar: s.calendar.map((e) => (e.id === id ? edit(e, patch) : e)) })),
        deleteCalendarEntry: (id) =>
          set((s) => ({
            calendar: s.calendar.filter((e) => e.id !== id),
            stubs: withStub(s.stubs, "calendar", [id]),
          })),
        sendInvitations: (entryId, kind = "invitation", only) => {
          const s = get();
          const entry = s.calendar.find((e) => e.id === entryId);
          if (!entry || !entry.invitees.length) return { queued: false, failures: [] };
          const self = me(s);
          const notice = noticeFor(entry, kind, self);
          const statuses = entry.invitees.map(
            (p) =>
              (kind !== "rescheduled" &&
                entry.inviteeStatus?.find((x) => x.person.email.toLowerCase() === p.email.toLowerCase())) || {
                person: p,
                status: "needs-action" as const,
              },
          );
          get().updateCalendarEntry(entryId, { chair: self, inviteeStatus: statuses });
          const intro = kind === "cancelled" ? "This meeting has been cancelled." : entry.description;
          const body = `${intro ? intro + "\n\n" : ""}${meetingSummary(notice)}`;
          return dispatch(noticeMemo(notice, self, only?.length ? only : entry.invitees, body));
        },
        ackAlarm: (key, until) => set((s) => ({ alarmAcks: { ...s.alarmAcks, [key]: until } })),

        // --------------------------------------------------------- contacts
        addContact: (c) => set((s) => ({ contacts: [...s.contacts, fresh(c)] })),
        updateContact: (id, patch) =>
          set((s) => ({ contacts: s.contacts.map((c) => (c.id === id ? edit(c, patch) : c)) })),
        deleteContact: (id) =>
          set((s) => ({
            contacts: s.contacts.filter((c) => c.id !== id),
            contactGroups: s.contactGroups.map((g) =>
              g.memberIds.includes(id) ? edit(g, { memberIds: g.memberIds.filter((m) => m !== id) }) : g,
            ),
          })),

        addGroup: (g) => set((s) => ({ contactGroups: [...s.contactGroups, fresh(g)] })),
        updateGroup: (id, patch) =>
          set((s) => ({ contactGroups: s.contactGroups.map((g) => (g.id === id ? edit(g, patch) : g)) })),
        deleteGroup: (id) => set((s) => ({ contactGroups: s.contactGroups.filter((g) => g.id !== id) })),

        // ------------------------------------------------------------ todos
        addTodo: (t) => set((s) => ({ todos: [...s.todos, fresh(t)] })),
        updateTodo: (id, patch) => set((s) => ({ todos: s.todos.map((t) => (t.id === id ? edit(t, patch) : t)) })),
        deleteTodo: (id) =>
          set((s) => ({ todos: s.todos.filter((t) => t.id !== id), stubs: withStub(s.stubs, "todos", [id]) })),

        // ---------------------------------------------------------- journal
        addJournal: (j) => set((s) => ({ journal: [fresh({ ...j, db: j.db ?? "journal" }), ...s.journal] })),
        updateJournal: (id, patch) =>
          set((s) => ({ journal: s.journal.map((j) => (j.id === id ? edit(j, patch) : j)) })),
        deleteJournal: (id) => set((s) => ({ journal: s.journal.filter((j) => j.id !== id) })),

        // ------------------------------------------------------- discussion
        addPost: (p) => set((s) => ({ discussion: [...s.discussion, fresh({ ...p, db: p.db ?? DISCUSSION_DB })] })),
        updatePost: (id, patch) =>
          set((s) => ({ discussion: s.discussion.map((p) => (p.id === id ? edit(p, patch) : p)) })),
        deletePost: (id) =>
          set((s) => {
            // collect the post and all descendants (and conflict copies)
            const toRemove = new Set<string>([id]);
            let grew = true;
            while (grew) {
              grew = false;
              for (const p of s.discussion) {
                const parent = p.conflictOf ?? p.parentId;
                if (parent && toRemove.has(parent) && !toRemove.has(p.id)) {
                  toRemove.add(p.id);
                  grew = true;
                }
              }
            }
            return {
              discussion: s.discussion.filter((p) => !toRemove.has(p.id)),
              stubs: withStub(s.stubs, "discussion", [...toRemove]),
            };
          }),

        // -------------------------------------------------------- databases
        addDatabase: (db) => set((s) => ({ databases: [...s.databases, db] })),
        updateDatabase: (id, patch) =>
          set((s) => ({ databases: s.databases.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),

        // ------------------------------------------------------ replication
        sendOutgoing: () => {
          const s = get();
          if (!s.outbox.length || !canReachServer(s.user.location)) return 0;
          let queue = s.serverQueue;
          let notified = s.oooNotified;
          for (const memo of s.outbox) {
            const r = routeMemo(memo, { ...routerCtx(), oooNotified: notified });
            queue = [...queue, ...r.events];
            notified = r.oooNotified;
          }
          set({ outbox: [], serverQueue: queue, oooNotified: notified });
          return s.outbox.length;
        },

        replicate: (opts = {}) => {
          const s0 = get();
          if (!canReachServer(s0.user.location)) {
            return { ok: false, error: "Unable to find path to server.", dbs: [], mailSent: 0, newMail: 0 };
          }
          const mailSent = opts.sendOutgoing === false || !s0.replSettings.sendOutgoing ? 0 : get().sendOutgoing();
          // Let the server catch up before comparing (without recursing into
          // the Office auto-sync).
          tickOnly(get, set);
          const s = get();
          const now = Date.now();
          const dbIds = (opts.dbs ?? Object.keys(DB_COLLECTIONS)).filter(
            (id) => DB_COLLECTIONS[id] && (opts.dbs ? true : s.replSettings.enabled[id] !== false),
          );

          const state: Record<string, unknown> = {};
          const server: ReplicaSnapshot = { ...s.server, stubs: { ...s.server.stubs } };
          const stubs: DeletionStubs = { ...s.stubs };
          const replBase: ReplBase = { ...s.replBase };
          const results: ReplDbResult[] = [];
          let arrivedMail: MailMessage[] = [];

          for (const dbId of dbIds) {
            const res: ReplDbResult = { db: dbId, received: 0, sent: 0, deleted: 0, conflicts: 0 };
            for (const coll of DB_COLLECTIONS[dbId]) {
              const out = mergeCollection<DocMeta & { id: ID }>({
                local: s[coll] as (DocMeta & { id: ID })[],
                server: server[coll] as (DocMeta & { id: ID })[],
                base: replBase[coll],
                localStubs: stubs[coll],
                serverStubs: server.stubs[coll],
                makeConflict: conflictCopy,
                include: coll === "discussion" ? (d) => isReplicatedPost(d as DiscussionPost) : undefined,
              });
              state[coll] = out.local;
              (server as unknown as Record<string, unknown>)[coll] = out.server;
              stubs[coll] = out.stubs;
              server.stubs[coll] = out.stubs;
              replBase[coll] = out.base;
              res.received += out.received;
              res.sent += out.sent;
              res.deleted += out.deleted;
              res.conflicts += out.conflicts;
              if (coll === "mail") {
                const ids = new Set(out.arrived);
                arrivedMail = (out.local as MailMessage[]).filter((m) => ids.has(m.id));
              }
            }
            results.push(res);
          }

          const replLog = { ...s.replLog };
          for (const r of results) replLog[r.db] = now;
          set({ ...(state as Partial<NotesState>), server, stubs, replBase, replLog, lastReplicated: now });
          processResponses(arrivedMail);
          const newMail = arrivedMail.filter((m) => m.folder === "inbox" && !m.read).length;
          return { ok: true, dbs: results, mailSent, newMail };
        },

        pendingFor: (dbId) => {
          const s = get();
          const colls = DB_COLLECTIONS[dbId];
          if (!colls) return 0;
          let n = 0;
          for (const coll of colls) {
            const serverIds = new Set((s.server[coll] as { id: ID }[]).map((d) => d.id));
            n += pendingCount(
              s[coll] as (DocMeta & { id: ID })[],
              s.replBase[coll],
              s.stubs[coll],
              serverIds,
              coll === "discussion" ? (d) => isReplicatedPost(d as DiscussionPost) : undefined,
            );
          }
          return n;
        },

        setReplSettings: (patch) => set((s) => ({ replSettings: { ...s.replSettings, ...patch } })),

        serverTick: (now = Date.now()) => {
          const result = tickOnly(get, set, now);
          let newMail = 0;
          // At the office you work against the server: new mail shows up at once.
          if (isOnline(get().user.location) && (result.delivered > 0 || get().outbox.length > 0)) {
            newMail = get().replicate({ dbs: ["mail"] }).newMail;
          }
          return { ...result, newMail };
        },

        replicateNow: () => {
          const r = get().replicate();
          return {
            pulled: r.dbs.reduce((n, d) => n + d.received, 0),
            pushed: r.dbs.reduce((n, d) => n + d.sent, 0) + r.mailSent,
          };
        },
        pendingChanges: () => Object.keys(DB_COLLECTIONS).reduce((n, id) => n + get().pendingFor(id), 0),

        // ------------------------------------------------------ maintenance
        resetAll: () => set(freshData()),

        exportAll: () => {
          const s = get();
          return JSON.stringify(
            {
              app: "lotus-notes",
              version: 2,
              exportedAt: Date.now(),
              data: {
                user: s.user,
                prefs: s.prefs,
                ooo: s.ooo,
                mail: s.mail,
                calendar: s.calendar,
                contacts: s.contacts,
                contactGroups: s.contactGroups,
                todos: s.todos,
                journal: s.journal,
                discussion: s.discussion,
                customFolders: s.customFolders,
                mailRules: s.mailRules,
                databases: s.databases,
              },
            },
            null,
            2,
          );
        },

        importAll: (json) => {
          try {
            const parsed = JSON.parse(json);
            const d = parsed?.data ?? parsed;
            if (!d || typeof d !== "object" || Array.isArray(d)) return false;
            const cur = get();
            const mail = importDocs<MailMessage>(d.mail, true).map((m) => ({
              ...m,
              labels: Array.isArray(m.labels) ? m.labels : [],
            }));
            const location = LOCATIONS.includes(d.user?.location) ? d.user.location : cur.user.location;
            set({
              user: d.user
                ? {
                    ...cur.user,
                    ...d.user,
                    location,
                    notesName: d.user.notesName ?? `${d.user.name ?? cur.user.name}/Acme`,
                  }
                : cur.user,
              prefs: d.prefs ? { ...cur.prefs, ...d.prefs } : cur.prefs,
              ooo: d.ooo ? { ...cur.ooo, ...d.ooo } : cur.ooo,
              mail,
              calendar: importDocs<CalendarEntry>(d.calendar),
              contacts: importDocs<Contact>(d.contacts),
              contactGroups: importDocs<ContactGroup>(d.contactGroups),
              todos: importDocs<TodoTask>(d.todos),
              journal: importDocs<JournalEntry>(d.journal, true).map((j) => ({ ...j, db: j.db ?? "journal" })),
              discussion: importDocs<DiscussionPost>(d.discussion, true).map((p) => ({ ...p, db: p.db ?? DISCUSSION_DB })),
              customFolders: Array.isArray(d.customFolders) ? d.customFolders : [],
              mailRules: Array.isArray(d.mailRules) ? d.mailRules : [],
              databases: Array.isArray(d.databases) && d.databases.length ? d.databases : cur.databases,
              replBase: emptyBase(),
            });
            return true;
          } catch {
            return false;
          }
        },
      };
    },
    {
      name: "lotus-notes-db",
      version: 2,
      storage: createJSONStorage(() => idbStorage),
      migrate: (persisted, version) => migrateNotes(persisted, version) as NotesState,
    },
  ),
);

/** Advance the simulated server without the Office auto-sync. */
function tickOnly(
  get: () => NotesState,
  set: (partial: Partial<NotesState>) => void,
  now = Date.now(),
): { delivered: number; discussionChanged: number } {
  const s = get();
  const result = tickServer(
    { server: s.server, serverQueue: s.serverQueue, nextTrafficAt: s.nextTrafficAt, usedContent: s.usedContent },
    { now, me: me(s), ooo: s.ooo, rules: s.mailRules, rand: Math.random },
  );
  let queue = result.serverQueue;
  let notified = s.oooNotified;
  // Out of Office notices your server agent sent go through the router too.
  for (const memo of result.outgoing) {
    const r = routeMemo(memo, {
      now,
      me: me(s),
      contacts: s.contacts,
      groups: s.contactGroups,
      oooNotified: notified,
      rand: Math.random,
    });
    queue = [...queue, ...r.events];
    notified = r.oooNotified;
  }
  set({
    server: result.server,
    serverQueue: queue,
    nextTrafficAt: result.nextTrafficAt,
    usedContent: result.usedContent,
    ooo: result.ooo,
    oooNotified: notified,
  });
  return { delivered: result.delivered.length, discussionChanged: result.discussionChanged };
}

// ---------------------------------------------------------------------------
// Persisted-state migration
// ---------------------------------------------------------------------------

type AnyDoc = DocMeta & Record<string, unknown>;

function stampLegacy<T extends AnyDoc>(list: unknown, when: (d: T) => number): T[] {
  if (!Array.isArray(list)) return [];
  return (list as T[]).map((d) => {
    const t = when(d) || Date.now();
    return { ...d, created: d.created ?? t, modified: d.modified ?? t, seq: d.seq ?? 1 };
  });
}

/** v1 (before stamps, stubs, databases and the outbox) -> v2. */
export function migrateNotes(persisted: unknown, version: number): Partial<NotesState> {
  const old = (persisted ?? {}) as Record<string, unknown>;
  if (version >= 2) return old as Partial<NotesState>;
  const base = freshData();
  const oldUser = (old.user ?? {}) as Partial<UserProfile>;
  const location = LOCATIONS.includes(oldUser.location as LocationName)
    ? (oldUser.location as LocationName)
    : "Office (Network)";
  const user: UserProfile = {
    ...base.user,
    ...oldUser,
    location,
    notesName: oldUser.notesName ?? `${oldUser.name ?? base.user.name}/Acme`,
  };
  const has = (k: string) => Array.isArray(old[k]);
  const mailWhen = (m: AnyDoc) => Number(m.date) || 0;
  const oldServer = (old.server ?? null) as Record<string, unknown> | null;
  const server: ReplicaSnapshot = oldServer
    ? {
        mail: stampLegacy<AnyDoc>(oldServer.mail, mailWhen) as unknown as MailMessage[],
        calendar: stampLegacy<AnyDoc>(oldServer.calendar, (e) => Number(e.start)) as unknown as CalendarEntry[],
        todos: stampLegacy<AnyDoc>(oldServer.todos, () => Date.now()) as unknown as TodoTask[],
        discussion: (stampLegacy<AnyDoc>(oldServer.discussion, (p) => Number(p.date)) as unknown as DiscussionPost[]).map(
          (p) => ({ ...p, db: p.db ?? DISCUSSION_DB }),
        ),
        stubs: emptyStubs(),
      }
    : base.server;
  return {
    ...base,
    user,
    mail: has("mail") ? (stampLegacy<AnyDoc>(old.mail, mailWhen) as unknown as MailMessage[]) : base.mail,
    calendar: has("calendar")
      ? (stampLegacy<AnyDoc>(old.calendar, (e) => Number(e.start)) as unknown as CalendarEntry[])
      : base.calendar,
    contacts: has("contacts") ? (stampLegacy<AnyDoc>(old.contacts, () => Date.now()) as unknown as Contact[]) : base.contacts,
    contactGroups: has("contactGroups")
      ? (stampLegacy<AnyDoc>(old.contactGroups, () => Date.now()) as unknown as ContactGroup[])
      : base.contactGroups,
    todos: has("todos") ? (stampLegacy<AnyDoc>(old.todos, () => Date.now()) as unknown as TodoTask[]) : base.todos,
    journal: has("journal")
      ? (stampLegacy<AnyDoc>(old.journal, (j) => Number(j.modified)) as unknown as JournalEntry[]).map((j) => ({
          ...j,
          db: j.db ?? "journal",
        }))
      : base.journal,
    discussion: has("discussion")
      ? (stampLegacy<AnyDoc>(old.discussion, (p) => Number(p.date)) as unknown as DiscussionPost[]).map((p) => ({
          ...p,
          db: p.db ?? DISCUSSION_DB,
        }))
      : base.discussion,
    customFolders: has("customFolders") ? (old.customFolders as CustomFolder[]) : base.customFolders,
    mailRules: has("mailRules") ? (old.mailRules as MailRule[]) : base.mailRules,
    server,
    lastReplicated: typeof old.lastReplicated === "number" ? old.lastReplicated : null,
  };
}

// Convenience selectors -------------------------------------------------------
export const unreadCount = (mail: MailMessage[]) => mail.filter((m) => m.folder === "inbox" && !m.read).length;

export { REPL_COLLECTIONS };
