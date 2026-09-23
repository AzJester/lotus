// ============================================================================
// Open a document in edit mode. The Edit action of a view (and a double-click
// on the form in the preview pane) opens the document window and switches it
// to edit mode, as Notes does. The request waits here until that window is
// mounted and listening; a window that is already open gets it at once.
// ============================================================================

import { useEffect, useRef } from "react";
import { useUI } from "../../data/ui";
import type { DocColl } from "../../data/ui";

const pending = new Set<string>();
const listeners = new Map<string, () => void>();
const keyOf = (coll: DocColl, id: string) => `${coll}:${id}`;

/** Open (or bring forward) a document window in edit mode. */
export function openInEditMode(coll: DocColl, id: string, opts: { title?: string; db?: string } = {}): void {
  const key = keyOf(coll, id);
  const live = listeners.get(key);
  if (live) live();
  else pending.add(key);
  useUI.getState().openDocument({ coll, id }, opts);
}

/**
 * Document windows call this to receive edit requests. `ready` is false until
 * the saved document is loaded, so the request never starts on a blank draft.
 */
export function useEditRequests(coll: DocColl, id: string | undefined, beginEdit: () => void, ready: boolean): void {
  const latest = useRef(beginEdit);
  latest.current = beginEdit;
  useEffect(() => {
    if (!id || !ready) return;
    const key = keyOf(coll, id);
    const listener = () => latest.current();
    listeners.set(key, listener);
    if (pending.delete(key)) listener();
    return () => {
      if (listeners.get(key) === listener) listeners.delete(key);
    };
  }, [coll, id, ready]);
}
