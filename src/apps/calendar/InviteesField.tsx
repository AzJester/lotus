// ============================================================================
// The meeting form's Invitees field: names separated by commas, completed
// inline as you type from Acme's Directory and the Personal Address Book (as
// Notes address fields do), plus an Address... button for the address dialog.
// ============================================================================

import { useMemo, useRef } from "react";
import { useNotes } from "../../data/store";
import { addressCandidates, completeName } from "../../data/names";

export function InviteesField({
  value,
  onChange,
  onAddress,
}: {
  value: string;
  onChange: (v: string) => void;
  onAddress: () => void;
}) {
  const contacts = useNotes((s) => s.contacts);
  const groups = useNotes((s) => s.contactGroups);
  const candidates = useMemo(() => addressCandidates(contacts, groups), [contacts, groups]);
  const ref = useRef<HTMLInputElement>(null);
  const deleting = useRef(false);

  /** Tab, Enter or a comma accepts the completion shown selected. */
  const accept = () => {
    const el = ref.current;
    if (!el || el.selectionStart === el.selectionEnd || el.selectionEnd !== el.value.length) return false;
    const next = el.value + ", ";
    onChange(next);
    requestAnimationFrame(() => el.setSelectionRange(next.length, next.length));
    return true;
  };

  return (
    <div className="cal-invitees">
      <span className="nf-field cal-invitees-field">
        <input
          ref={ref}
          type="text"
          className="nf-input"
          aria-label="Invitees"
          value={value}
          spellCheck={false}
          placeholder="Names, separated by commas"
          onKeyDown={(e) => {
            deleting.current = e.key === "Backspace" || e.key === "Delete";
            if ((e.key === "Tab" || e.key === "Enter" || e.key === ",") && accept()) e.preventDefault();
          }}
          onChange={(e) => {
            const el = e.target;
            const raw = el.value;
            if (deleting.current) {
              onChange(raw);
              return;
            }
            const cut = Math.max(raw.lastIndexOf(","), raw.lastIndexOf(";"));
            const head = raw.slice(0, cut + 1);
            const typed = raw.slice(cut + 1).replace(/^\s+/, "");
            const hit = typed.length >= 2 ? completeName(typed, candidates) : undefined;
            if (hit && hit.display.toLowerCase() !== typed.toLowerCase() && hit.display.toLowerCase().startsWith(typed.toLowerCase())) {
              const prefix = head + (head ? " " : "");
              const full = prefix + hit.display;
              onChange(full);
              const start = prefix.length + typed.length;
              requestAnimationFrame(() => el.setSelectionRange(start, full.length));
            } else onChange(raw);
          }}
        />
      </span>
      <button type="button" className="btn cal-address-btn" onClick={onAddress}>
        Address...
      </button>
    </div>
  );
}
