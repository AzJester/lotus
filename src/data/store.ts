// ============================================================================
// Lotus Notes — persistent data store
// A single Zustand store, persisted to localStorage, that holds every Notes
// "database". Each application module reads slices and calls the typed actions
// below. Mutations always refresh `modified` timestamps where relevant.
// ============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Contact,
  DiscussionPost,
  CalendarEntry,
  JournalEntry,
  MailFolder,
  MailMessage,
  TodoTask,
  UserProfile,
} from "./types";
import { buildSeed } from "./seed";

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "id-" + Math.floor(Math.random() * 1e9).toString(36) + Date.now().toString(36);
}

export interface NotesState {
  user: UserProfile;
  mail: MailMessage[];
  calendar: CalendarEntry[];
  contacts: Contact[];
  todos: TodoTask[];
  journal: JournalEntry[];
  discussion: DiscussionPost[];

  // --- profile ---
  setUser: (patch: Partial<UserProfile>) => void;

  // --- mail ---
  addMail: (m: MailMessage) => void;
  updateMail: (id: string, patch: Partial<MailMessage>) => void;
  sendMail: (m: MailMessage) => void;
  moveMail: (id: string, folder: MailFolder) => void;
  deleteMail: (id: string) => void; // soft-delete to trash, or purge if already trashed
  emptyTrash: () => void;
  markRead: (id: string, read: boolean) => void;

  // --- calendar ---
  addCalendarEntry: (e: CalendarEntry) => void;
  updateCalendarEntry: (id: string, patch: Partial<CalendarEntry>) => void;
  deleteCalendarEntry: (id: string) => void;

  // --- contacts ---
  addContact: (c: Contact) => void;
  updateContact: (id: string, patch: Partial<Contact>) => void;
  deleteContact: (id: string) => void;

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

  // --- maintenance ---
  resetAll: () => void;
  /** Serialize the entire workspace to a JSON string (the "NSF" backup). */
  exportAll: () => string;
  /** Replace the workspace from an exported JSON string. Returns success. */
  importAll: (json: string) => boolean;
}

const seed = buildSeed();

export const useNotes = create<NotesState>()(
  persist(
    (set, get) => ({
      user: seed.user,
      mail: seed.mail,
      calendar: seed.calendar,
      contacts: seed.contacts,
      todos: seed.todos,
      journal: seed.journal,
      discussion: seed.discussion,

      setUser: (patch) => set((s) => ({ user: { ...s.user, ...patch } })),

      addMail: (m) => set((s) => ({ mail: [m, ...s.mail] })),
      updateMail: (id, patch) =>
        set((s) => ({
          mail: s.mail.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      sendMail: (m) =>
        set((s) => ({ mail: [{ ...m, folder: "sent", read: true }, ...s.mail] })),
      moveMail: (id, folder) =>
        set((s) => ({
          mail: s.mail.map((m) => (m.id === id ? { ...m, folder } : m)),
        })),
      deleteMail: (id) =>
        set((s) => {
          const msg = s.mail.find((m) => m.id === id);
          if (msg && msg.folder !== "trash") {
            return {
              mail: s.mail.map((m) => (m.id === id ? { ...m, folder: "trash" as MailFolder } : m)),
            };
          }
          return { mail: s.mail.filter((m) => m.id !== id) };
        }),
      emptyTrash: () => set((s) => ({ mail: s.mail.filter((m) => m.folder !== "trash") })),
      markRead: (id, read) =>
        set((s) => ({
          mail: s.mail.map((m) => (m.id === id ? { ...m, read } : m)),
        })),

      addCalendarEntry: (e) => set((s) => ({ calendar: [...s.calendar, e] })),
      updateCalendarEntry: (id, patch) =>
        set((s) => ({
          calendar: s.calendar.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      deleteCalendarEntry: (id) =>
        set((s) => ({ calendar: s.calendar.filter((e) => e.id !== id) })),

      addContact: (c) => set((s) => ({ contacts: [...s.contacts, c] })),
      updateContact: (id, patch) =>
        set((s) => ({
          contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      deleteContact: (id) =>
        set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) })),

      addTodo: (t) => set((s) => ({ todos: [...s.todos, t] })),
      updateTodo: (id, patch) =>
        set((s) => ({
          todos: s.todos.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      deleteTodo: (id) => set((s) => ({ todos: s.todos.filter((t) => t.id !== id) })),

      addJournal: (j) => set((s) => ({ journal: [j, ...s.journal] })),
      updateJournal: (id, patch) =>
        set((s) => ({
          journal: s.journal.map((j) =>
            j.id === id ? { ...j, ...patch, modified: Date.now() } : j,
          ),
        })),
      deleteJournal: (id) => set((s) => ({ journal: s.journal.filter((j) => j.id !== id) })),

      addPost: (p) => set((s) => ({ discussion: [...s.discussion, p] })),
      updatePost: (id, patch) =>
        set((s) => ({
          discussion: s.discussion.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      deletePost: (id) =>
        set((s) => {
          // collect the post and all descendants
          const toRemove = new Set<string>([id]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const p of s.discussion) {
              if (p.parentId && toRemove.has(p.parentId) && !toRemove.has(p.id)) {
                toRemove.add(p.id);
                grew = true;
              }
            }
          }
          return { discussion: s.discussion.filter((p) => !toRemove.has(p.id)) };
        }),

      resetAll: () => {
        const fresh = buildSeed();
        set({
          user: fresh.user,
          mail: fresh.mail,
          calendar: fresh.calendar,
          contacts: fresh.contacts,
          todos: fresh.todos,
          journal: fresh.journal,
          discussion: fresh.discussion,
        });
      },

      exportAll: () => {
        const s = get();
        return JSON.stringify(
          {
            app: "lotus-notes",
            version: 1,
            exportedAt: Date.now(),
            data: {
              user: s.user,
              mail: s.mail,
              calendar: s.calendar,
              contacts: s.contacts,
              todos: s.todos,
              journal: s.journal,
              discussion: s.discussion,
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
          if (!d || typeof d !== "object") return false;
          set({
            user: d.user ?? get().user,
            mail: Array.isArray(d.mail) ? d.mail : [],
            calendar: Array.isArray(d.calendar) ? d.calendar : [],
            contacts: Array.isArray(d.contacts) ? d.contacts : [],
            todos: Array.isArray(d.todos) ? d.todos : [],
            journal: Array.isArray(d.journal) ? d.journal : [],
            discussion: Array.isArray(d.discussion) ? d.discussion : [],
          });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: "lotus-notes-db",
      version: 1,
    },
  ),
);

// Convenience selectors -------------------------------------------------------
export const unreadCount = (mail: MailMessage[]) =>
  mail.filter((m) => m.folder === "inbox" && !m.read).length;
