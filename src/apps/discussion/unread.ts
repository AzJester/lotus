// ============================================================================
// Unread marks for discussion documents. Notes keeps an unread table per
// user and database; here it is a map of document id -> the edit sequence
// number you last read, persisted beside the databases. Posts that arrive by
// replication, or change after you read them, show red with the star until
// you preview or open them. The first time it runs, everything already in
// the databases counts as read.
// ============================================================================

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "../../data/idb";
import { useNotes } from "../../data/store";
import type { DiscussionPost } from "../../data/types";
import { isUnreadPost } from "./discHelpers";

interface UnreadState {
  /** Document id -> sequence number read. Null until the table is built. */
  seen: Record<string, number> | null;
  markRead: (posts: DiscussionPost[]) => void;
  markUnread: (ids: string[]) => void;
  /** Build the table from the documents already there (first run only). */
  init: (posts: DiscussionPost[]) => void;
}

export const useDiscussionUnread = create<UnreadState>()(
  persist(
    (set, get) => ({
      seen: null,
      markRead: (posts) => {
        const seen = get().seen;
        if (!seen) return;
        let next: Record<string, number> | null = null;
        for (const p of posts) {
          const seq = p.seq ?? 1;
          if ((seen[p.id] ?? 0) >= seq) continue;
          next = next ?? { ...seen };
          next[p.id] = seq;
        }
        if (next) set({ seen: next });
      },
      markUnread: (ids) => {
        const seen = get().seen;
        if (!seen || !ids.some((id) => id in seen)) return;
        const next = { ...seen };
        for (const id of ids) delete next[id];
        set({ seen: next });
      },
      init: (posts) => {
        if (get().seen) return;
        set({ seen: Object.fromEntries(posts.map((p) => [p.id, p.seq ?? 1])) });
      },
    }),
    { name: "lotus-notes-disc-unread", storage: createJSONStorage(() => idbStorage) },
  ),
);

// Build the table once both the databases and the table itself are loaded.
const tryInit = () => {
  if (useNotes.persist.hasHydrated() && useDiscussionUnread.persist.hasHydrated()) {
    useDiscussionUnread.getState().init(useNotes.getState().discussion);
  }
};
useNotes.persist.onFinishHydration(tryInit);
useDiscussionUnread.persist.onFinishHydration(tryInit);
tryInit();

/** A view-ready predicate: is this post unread for the current user? */
export function useUnreadCheck(): (p: DiscussionPost) => boolean {
  const seen = useDiscussionUnread((s) => s.seen);
  const user = useNotes((s) => s.user);
  return (p) => isUnreadPost(p, seen, user);
}
