// ============================================================================
// Contacts — the Personal Address Book. Three-pane layout (view navigator ·
// contact list · business-card preview) plus a two-column document form for
// creating and editing person documents. Follows the Mail module pattern: it
// reads/writes the shared store, composes the shared UI primitives, and reuses
// the shared layout classes (.app, .action-bar, .app-cols, .nav-pane, …).
// ============================================================================

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNotes, uid } from "../../data/store";
import { useUI } from "../../data/ui";
import type { Contact, ContactGroup } from "../../data/types";
import {
  ActionBar,
  ActionButton,
  ActionSep,
  ActionSpacer,
  Dialog,
  FieldRow,
} from "../../components/ui";
import { initials } from "../../lib/format";
import "../../styles/contacts.css";

// The three built-in views, plus one generated nav-item per category found and
// one per saved contact group (mailing list).
type NavKey =
  | { kind: "name" }
  | { kind: "company" }
  | { kind: "category" }
  | { kind: "cat"; value: string }
  | { kind: "group"; value: string };

const sameNav = (a: NavKey, b: NavKey): boolean =>
  a.kind === b.kind &&
  (a.kind === "cat" || a.kind === "group"
    ? (b as { value: string }).value === a.value
    : true);

// --- vCard 3.0 helpers ------------------------------------------------------

/** Escape a value for a vCard property (RFC 2426 §5). */
function vesc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Reverse vesc() for an imported value. */
function vunesc(value: string): string {
  return value.replace(/\\([\\,;nN])/g, (_m, ch: string) =>
    ch === "n" || ch === "N" ? "\n" : ch,
  );
}

/** Serialize a single contact to a vCard 3.0 block. */
function toVCard(c: Contact): string {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];
  // N: Family;Given;Additional;Prefix;Suffix
  lines.push(`N:${vesc(c.lastName)};${vesc(c.firstName)};;;`);
  lines.push(`FN:${vesc(fullName(c) || fileAs(c))}`);
  if (c.company) lines.push(`ORG:${vesc(c.company)}`);
  if (c.title) lines.push(`TITLE:${vesc(c.title)}`);
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${vesc(c.email)}`);
  if (c.workPhone) lines.push(`TEL;TYPE=WORK:${vesc(c.workPhone)}`);
  if (c.cellPhone) lines.push(`TEL;TYPE=CELL:${vesc(c.cellPhone)}`);
  if (c.address || c.city || c.state || c.zip || c.country) {
    // ADR: PO;Ext;Street;City;Region;PostalCode;Country
    lines.push(
      `ADR;TYPE=WORK:;;${vesc(c.address)};${vesc(c.city)};${vesc(c.state)};${vesc(
        c.zip,
      )};${vesc(c.country)}`,
    );
  }
  if (c.comments) lines.push(`NOTE:${vesc(c.comments)}`);
  if (c.category.trim()) lines.push(`CATEGORIES:${vesc(c.category.trim())}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

/** Serialize many contacts into one .vcf payload. */
function toVCardFile(contacts: Contact[]): string {
  return contacts.map(toVCard).join("\r\n") + "\r\n";
}

/** Parse a .vcf payload into draft contacts (without ids). Tolerant of missing
 *  fields and of folded/CRLF lines. */
function parseVCards(text: string): Contact[] {
  // Unfold continued lines (a leading space/tab continues the previous line).
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const unfolded = raw.replace(/\n[ \t]/g, "");
  const lines = unfolded.split("\n");

  const out: Contact[] = [];
  let cur: Contact | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const upper = trimmed.toUpperCase();
    if (upper === "BEGIN:VCARD") {
      cur = emptyContact();
      continue;
    }
    if (upper === "END:VCARD") {
      if (cur) {
        // Derive a name from FN when N was absent.
        if (!cur.firstName && !cur.lastName && cur.email) {
          cur.firstName = cur.email.split("@")[0];
        }
        out.push(cur);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const rawKey = trimmed.slice(0, colon);
    const value = vunesc(trimmed.slice(colon + 1));
    const parts = rawKey.split(";");
    const name = parts[0].toUpperCase();
    const params = parts.slice(1).map((p) => p.toUpperCase());

    if (name === "N") {
      const seg = value.split(";");
      cur.lastName = (seg[0] || "").trim();
      cur.firstName = (seg[1] || "").trim();
    } else if (name === "FN") {
      if (!cur.firstName && !cur.lastName) {
        const sp = value.trim().split(/\s+/);
        cur.firstName = sp[0] || "";
        cur.lastName = sp.slice(1).join(" ");
      }
    } else if (name === "ORG") {
      cur.company = value.split(";")[0].trim();
    } else if (name === "TITLE") {
      cur.title = value.trim();
    } else if (name === "EMAIL") {
      if (!cur.email) cur.email = value.trim();
    } else if (name === "TEL") {
      const isCell = params.some((p) => p.includes("CELL") || p.includes("MOBILE"));
      if (isCell) {
        if (!cur.cellPhone) cur.cellPhone = value.trim();
      } else if (!cur.workPhone) {
        cur.workPhone = value.trim();
      }
    } else if (name === "ADR") {
      const seg = value.split(";");
      // ADR: PO;Ext;Street;City;Region;PostalCode;Country
      cur.address = (seg[2] || "").trim();
      cur.city = (seg[3] || "").trim();
      cur.state = (seg[4] || "").trim();
      cur.zip = (seg[5] || "").trim();
      cur.country = (seg[6] || "").trim();
    } else if (name === "NOTE") {
      cur.comments = value;
    } else if (name === "CATEGORIES") {
      cur.category = value.split(",")[0].trim();
    }
  }

  return out;
}

// A blank document, used to seed the New Contact form.
const emptyContact = (): Contact => ({
  id: "",
  firstName: "",
  lastName: "",
  email: "",
  company: "",
  title: "",
  workPhone: "",
  cellPhone: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  country: "",
  category: "",
  comments: "",
});

const fullName = (c: Contact): string => `${c.firstName} ${c.lastName}`.trim();
const fileAs = (c: Contact): string =>
  c.lastName || c.firstName ? `${c.lastName}${c.lastName && c.firstName ? ", " : ""}${c.firstName}` : "(Untitled)";

// Compare by last name, then first, for the default "By Name" ordering.
function byLastName(a: Contact, b: Contact): number {
  const ln = a.lastName.localeCompare(b.lastName, undefined, { sensitivity: "base" });
  if (ln !== 0) return ln;
  return a.firstName.localeCompare(b.firstName, undefined, { sensitivity: "base" });
}

export default function Contacts() {
  const {
    contacts,
    contactGroups,
    addContact,
    updateContact,
    deleteContact,
    addGroup,
    updateGroup,
    deleteGroup,
  } = useNotes();
  const setStatus = useUI((s) => s.setStatus);
  const requestMemo = useUI((s) => s.requestMemo);

  const [nav, setNav] = useState<NavKey>({ kind: "name" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // The contact being edited in the dialog; null when the dialog is closed.
  const [draft, setDraft] = useState<Contact | null>(null);
  // New-group dialog state; null when closed.
  const [groupDraft, setGroupDraft] = useState<string | null>(null);
  // Whether the "Add to Group" dropdown is open.
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  // Hidden file input used by Import vCard.
  const fileRef = useRef<HTMLInputElement>(null);

  // Distinct categories present in the data, for the generated nav-items.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) if (c.category.trim()) set.add(c.category.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [contacts]);

  // Group by company only when the "By Company" view is active.
  const grouped = nav.kind === "company";

  // The contact group selected in the navigator, if any.
  const activeGroup =
    nav.kind === "group" ? contactGroups.find((g) => g.id === nav.value) ?? null : null;

  const list = useMemo(() => {
    let rows = contacts;
    if (nav.kind === "cat") rows = rows.filter((c) => c.category.trim() === nav.value);
    if (nav.kind === "group") {
      const grp = contactGroups.find((g) => g.id === nav.value);
      const ids = new Set(grp?.memberIds ?? []);
      rows = rows.filter((c) => ids.has(c.id));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (c) =>
          fullName(c).toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q),
      );
    }
    const sorted = [...rows];
    if (grouped) {
      sorted.sort((a, b) => {
        const co = a.company.localeCompare(b.company, undefined, { sensitivity: "base" });
        return co !== 0 ? co : byLastName(a, b);
      });
    } else {
      sorted.sort(byLastName);
    }
    return sorted;
  }, [contacts, contactGroups, nav, search, grouped]);

  const selected = contacts.find((c) => c.id === selectedId) ?? null;

  // --- actions ------------------------------------------------------------
  function newContact() {
    const seed = emptyContact();
    // Pre-fill category when a category view is active, for convenience.
    if (nav.kind === "cat") seed.category = nav.value;
    setDraft(seed);
  }
  function editContact(c: Contact) {
    setDraft({ ...c });
  }
  function saveDraft() {
    if (!draft) return;
    if (!draft.firstName.trim() && !draft.lastName.trim()) {
      setStatus("A contact needs at least a first or last name.");
      return;
    }
    if (draft.id) {
      updateContact(draft.id, draft);
      setStatus(`Saved contact: ${fullName(draft) || fileAs(draft)}.`);
    } else {
      const id = uid();
      addContact({ ...draft, id });
      setSelectedId(id);
      setStatus(`Added contact: ${fullName(draft) || fileAs(draft)}.`);
    }
    setDraft(null);
  }
  function del() {
    if (!selected) return;
    const label = fullName(selected) || fileAs(selected);
    if (!confirm(`Delete the contact "${label}"? This cannot be undone.`)) return;
    deleteContact(selected.id);
    setSelectedId(null);
    setStatus(`Deleted contact: ${label}.`);
  }
  function writeMemo() {
    // When a group view is active, address the whole group; otherwise the
    // single selected contact.
    if (activeGroup) {
      writeToGroup(activeGroup);
      return;
    }
    if (!selected) return;
    requestMemo(selected.email || fullName(selected));
  }

  // --- group actions ------------------------------------------------------
  function newGroup() {
    setGroupDraft("");
  }
  function saveGroup() {
    const name = (groupDraft ?? "").trim();
    if (!name) {
      setStatus("A group needs a name.");
      return;
    }
    const id = uid();
    // Seed the new group with the selected contact, if any.
    addGroup({ id, name, memberIds: selected ? [selected.id] : [] });
    setGroupDraft(null);
    setNav({ kind: "group", value: id });
    setStatus(`Created group: ${name}.`);
  }
  function removeGroup(g: ContactGroup) {
    if (!confirm(`Delete the group "${g.name}"? The contacts themselves are not removed.`)) return;
    deleteGroup(g.id);
    if (nav.kind === "group" && nav.value === g.id) setNav({ kind: "name" });
    setStatus(`Deleted group: ${g.name}.`);
  }
  function addSelectedToGroup(g: ContactGroup) {
    setGroupMenuOpen(false);
    if (!selected) return;
    if (g.memberIds.includes(selected.id)) {
      setStatus(`${fullName(selected) || fileAs(selected)} is already in "${g.name}".`);
      return;
    }
    updateGroup(g.id, { memberIds: [...g.memberIds, selected.id] });
    setStatus(`Added ${fullName(selected) || fileAs(selected)} to "${g.name}".`);
  }
  function removeSelectedFromGroup(g: ContactGroup) {
    setGroupMenuOpen(false);
    if (!selected) return;
    updateGroup(g.id, { memberIds: g.memberIds.filter((m) => m !== selected.id) });
    setStatus(`Removed ${fullName(selected) || fileAs(selected)} from "${g.name}".`);
  }
  function writeToGroup(g: ContactGroup) {
    const ids = new Set(g.memberIds);
    const emails = contacts
      .filter((c) => ids.has(c.id) && c.email.trim())
      .map((c) => c.email.trim());
    if (emails.length === 0) {
      setStatus(`No members of "${g.name}" have an e-mail address.`);
      return;
    }
    requestMemo(emails.join(", "), "");
  }

  // --- vCard actions ------------------------------------------------------
  function exportVCard() {
    // Export the whole listed set when a group/all view is active, otherwise
    // the single selected contact.
    const single = nav.kind === "name" || nav.kind === "company";
    const rows = single && selected ? [selected] : list;
    if (rows.length === 0) {
      setStatus("Nothing to export.");
      return;
    }
    const blob = new Blob([toVCardFile(rows)], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base =
      rows.length === 1
        ? (fileAs(rows[0]) || "contact").replace(/[^\w.-]+/g, "_")
        : "contacts";
    a.href = url;
    a.download = `${base}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(
      rows.length === 1
        ? `Exported vCard: ${fullName(rows[0]) || fileAs(rows[0])}.`
        : `Exported ${rows.length} contacts to vCard.`,
    );
  }
  function importVCard() {
    fileRef.current?.click();
  }
  function onImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const drafts = parseVCards(String(reader.result));
      if (drafts.length === 0) {
        setStatus("No vCards found in that file.");
        return;
      }
      let lastId = "";
      for (const d of drafts) {
        const id = uid();
        lastId = id;
        addContact({ ...d, id });
      }
      if (drafts.length === 1) setSelectedId(lastId);
      setStatus(`Imported ${drafts.length} contact${drafts.length === 1 ? "" : "s"} from vCard.`);
    };
    reader.readAsText(file);
  }

  // --- render -------------------------------------------------------------
  return (
    <div className="app contacts-app">
      <ActionBar>
        <ActionButton icon="👤" label="New Contact" onClick={newContact} />
        <ActionButton icon="✏️" label="Edit" onClick={() => selected && editContact(selected)} disabled={!selected} />
        <ActionButton icon="🗑️" label="Delete" onClick={del} disabled={!selected} />
        <ActionSep />
        <ActionButton
          icon="✉️"
          label={activeGroup ? "Write to Group" : "Write Memo"}
          onClick={writeMemo}
          disabled={!activeGroup && !selected}
          title={activeGroup ? `Write a memo to everyone in "${activeGroup.name}"` : "Write Memo"}
        />
        <ActionSep />
        <ActionButton icon="📇" label="New Group" onClick={newGroup} />
        <div className="action-dropdown">
          <ActionButton
            icon="➕"
            label="Add to Group"
            caret
            onClick={() => setGroupMenuOpen((v) => !v)}
            disabled={!selected || contactGroups.length === 0}
            title={
              contactGroups.length === 0
                ? "Create a group first"
                : "Add or remove the selected contact"
            }
          />
          {groupMenuOpen && selected && (
            <GroupMenu
              groups={contactGroups}
              memberOf={(g) => g.memberIds.includes(selected.id)}
              onAdd={addSelectedToGroup}
              onRemove={removeSelectedFromGroup}
              onClose={() => setGroupMenuOpen(false)}
            />
          )}
        </div>
        <ActionSep />
        <ActionButton icon="📤" label="Export vCard" onClick={exportVCard} disabled={list.length === 0} />
        <ActionButton icon="📥" label="Import vCard" onClick={importVCard} />
        <ActionSpacer />
        <div className="action-search">
          <input
            type="search"
            placeholder="Search Contacts…"
            className="bevel-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </ActionBar>

      <input
        ref={fileRef}
        type="file"
        accept=".vcf,text/vcard,text/x-vcard"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportFile(f);
          e.target.value = "";
        }}
      />

      <div className="app-cols">
        {/* Navigator */}
        <div className="nav-pane">
          <div className="nav-title">Personal Address Book</div>
          <div className="nav-group">
            <NavItem icon="🔤" label="By Name" active={nav.kind === "name"} count={contacts.length}
              onClick={() => { setNav({ kind: "name" }); setSearch(""); }} />
            <NavItem icon="🏢" label="By Company" active={nav.kind === "company"} count={contacts.length}
              onClick={() => { setNav({ kind: "company" }); setSearch(""); }} />
            <NavItem icon="🗂️" label="By Category" active={nav.kind === "category"} count={categories.length}
              onClick={() => { setNav({ kind: "category" }); setSearch(""); }} />
          </div>
          {categories.length > 0 && (
            <>
              <div className="nav-subhead">Categories</div>
              <div className="nav-group nav-sub">
                {categories.map((cat) => {
                  const key: NavKey = { kind: "cat", value: cat };
                  return (
                    <NavItem
                      key={cat}
                      icon="🏷️"
                      label={cat}
                      active={sameNav(nav, key)}
                      count={contacts.filter((c) => c.category.trim() === cat).length}
                      onClick={() => { setNav(key); setSelectedId(null); }}
                    />
                  );
                })}
              </div>
            </>
          )}

          <div className="nav-subhead nav-groups-head">
            <span>Groups</span>
            <button className="nav-mini-btn" title="New Group…" onClick={newGroup}>＋</button>
          </div>
          <div className="nav-group nav-sub">
            {contactGroups.length === 0 && (
              <div className="nav-hint">No groups. Use New Group.</div>
            )}
            {contactGroups.map((g) => {
              const key: NavKey = { kind: "group", value: g.id };
              return (
                <div
                  key={g.id}
                  className={"nav-item nav-group-item" + (sameNav(nav, key) ? " active" : "")}
                  onClick={() => { setNav(key); setSelectedId(null); }}
                >
                  <span className="nav-ic">👥</span>
                  <span className="nav-label">{g.name}</span>
                  <span className="nav-count">{g.memberIds.length}</span>
                  <button
                    className="nav-mini-btn nav-del"
                    title={`Delete group "${g.name}"`}
                    onClick={(e) => { e.stopPropagation(); removeGroup(g); }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Contact list */}
        <div className="list-pane contacts-list">
          <div className="view">
            <div className="view-head">
              <div className="col" style={{ flex: "0 0 170px" }}>Name</div>
              <div className="col" style={{ flex: "0 0 160px" }}>Company</div>
              <div className="col" style={{ flex: 1 }}>Title</div>
              <div className="col" style={{ flex: "0 0 190px" }}>E-Mail</div>
              <div className="col" style={{ flex: "0 0 130px" }}>Phone</div>
            </div>
            <div className="view-body">
              {list.length === 0 && <div className="view-empty">No contacts in this view.</div>}
              {renderRows(list, grouped, selectedId, setSelectedId, editContact)}
            </div>
          </div>
        </div>

        {/* Business-card preview (or a group summary when none selected) */}
        <div className="preview-pane">
          {selected ? (
            <BusinessCard c={selected} onEdit={() => editContact(selected)} onMemo={writeMemo} />
          ) : activeGroup ? (
            <GroupCard
              group={activeGroup}
              memberCount={list.length}
              onWrite={() => writeToGroup(activeGroup)}
              onDelete={() => removeGroup(activeGroup)}
            />
          ) : (
            <div className="preview-empty">Select a contact to view the card.</div>
          )}
        </div>
      </div>

      {draft && (
        <ContactDialog
          draft={draft}
          isNew={!draft.id}
          categories={categories}
          onChange={setDraft}
          onSave={saveDraft}
          onCancel={() => setDraft(null)}
        />
      )}

      {groupDraft !== null && (
        <GroupDialog
          name={groupDraft}
          seededWith={selected ? fullName(selected) || fileAs(selected) : null}
          onChange={setGroupDraft}
          onSave={saveGroup}
          onCancel={() => setGroupDraft(null)}
        />
      )}
    </div>
  );
}

// --- "Add to Group" dropdown menu -------------------------------------------
function GroupMenu({
  groups,
  memberOf,
  onAdd,
  onRemove,
  onClose,
}: {
  groups: ContactGroup[];
  memberOf: (g: ContactGroup) => boolean;
  onAdd: (g: ContactGroup) => void;
  onRemove: (g: ContactGroup) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="dropdown-scrim" onClick={onClose} />
      <div className="dropdown-menu group-menu">
        {groups.map((g) => {
          const inGroup = memberOf(g);
          return (
            <div
              key={g.id}
              className="dropdown-item"
              onClick={() => (inGroup ? onRemove(g) : onAdd(g))}
            >
              <span className="dd-check">{inGroup ? "✓" : ""}</span>
              <span className="dd-label">{g.name}</span>
              <span className="dd-hint">{inGroup ? "Remove" : "Add"}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// --- New Group dialog -------------------------------------------------------
function GroupDialog({
  name,
  seededWith,
  onChange,
  onSave,
  onCancel,
}: {
  name: string;
  seededWith: string | null;
  onChange: (name: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      title="New Group"
      width={380}
      onClose={onCancel}
      footer={
        <>
          <button className="btn primary" onClick={onSave}>💾 Create</button>
          <button className="btn" onClick={onCancel}>✕ Cancel</button>
        </>
      }
    >
      <div className="contact-form contact-form-wide">
        <FieldRow label="Group Name">
          <input
            type="text"
            autoFocus
            value={name}
            placeholder="e.g. Project Falcon"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
          />
        </FieldRow>
        {seededWith && (
          <div className="group-seed-hint">
            Will start with the selected contact: <b>{seededWith}</b>.
          </div>
        )}
      </div>
    </Dialog>
  );
}

// Render the list rows, injecting subtle company group headers when grouped.
function renderRows(
  list: Contact[],
  grouped: boolean,
  selectedId: string | null,
  setSelectedId: (id: string) => void,
  onEdit: (c: Contact) => void,
) {
  const out: ReactNode[] = [];
  let lastGroup = "";
  for (const c of list) {
    if (grouped) {
      const g = c.company || "(No Company)";
      if (g !== lastGroup) {
        lastGroup = g;
        out.push(
          <div key={`g-${g}`} className="group-head">
            <span className="nav-twistie">▼</span> {g}
          </div>,
        );
      }
    }
    out.push(
      <div
        key={c.id}
        className={"view-row" + (c.id === selectedId ? " selected" : "")}
        onClick={() => setSelectedId(c.id)}
        onDoubleClick={() => onEdit(c)}
      >
        <div className="col" style={{ flex: "0 0 170px" }}>{fileAs(c)}</div>
        <div className="col" style={{ flex: "0 0 160px" }}>{c.company || "—"}</div>
        <div className="col" style={{ flex: 1 }}>{c.title || "—"}</div>
        <div className="col" style={{ flex: "0 0 190px" }}>{c.email || "—"}</div>
        <div className="col" style={{ flex: "0 0 130px" }}>{c.workPhone || c.cellPhone || "—"}</div>
      </div>,
    );
  }
  return out;
}

// --- Navigator item ---------------------------------------------------------
function NavItem({
  icon,
  label,
  active,
  count,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <div className={"nav-item" + (active ? " active" : "")} onClick={onClick}>
      <span className="nav-ic">{icon}</span>
      <span className="nav-label">{label}</span>
      {count > 0 && <span className="nav-count">{count}</span>}
    </div>
  );
}

// --- Business card (preview pane) -------------------------------------------
function BusinessCard({ c, onEdit, onMemo }: { c: Contact; onEdit: () => void; onMemo: () => void }) {
  const name = fullName(c) || "(Unnamed contact)";
  const cityLine = [c.city, c.state].filter(Boolean).join(", ");
  const mailLine = [cityLine, c.zip].filter(Boolean).join(" ");
  const hasAddress = c.address || mailLine || c.country;

  return (
    <div className="form card-host">
      <div className="biz-card">
        <div className="biz-head">
          <div className="biz-avatar">{initials(name)}</div>
          <div className="biz-id">
            <div className="biz-name">{name}</div>
            {c.title && <div className="biz-title">{c.title}</div>}
            {c.company && <div className="biz-company">{c.company}</div>}
            {c.category.trim() && <span className="tag biz-tag">{c.category.trim()}</span>}
          </div>
        </div>

        <div className="biz-grid">
          <CardRow label="E-Mail">
            {c.email ? <a href={`mailto:${c.email}`} className="biz-link">{c.email}</a> : <span className="muted">—</span>}
          </CardRow>
          <CardRow label="Work Phone">{c.workPhone || <span className="muted">—</span>}</CardRow>
          <CardRow label="Cell Phone">{c.cellPhone || <span className="muted">—</span>}</CardRow>
          <CardRow label="Address">
            {hasAddress ? (
              <div className="biz-address">
                {c.address && <div>{c.address}</div>}
                {mailLine && <div>{mailLine}</div>}
                {c.country && <div>{c.country}</div>}
              </div>
            ) : (
              <span className="muted">—</span>
            )}
          </CardRow>
          <CardRow label="Category">{c.category.trim() || <span className="muted">—</span>}</CardRow>
          <CardRow label="Comments">
            {c.comments ? <div className="biz-comments">{c.comments}</div> : <span className="muted">—</span>}
          </CardRow>
        </div>

        <div className="biz-foot">
          <button className="btn" onClick={onEdit}>✏️ Edit</button>
          <button className="btn" onClick={onMemo}>✉️ Write Memo</button>
        </div>
      </div>
    </div>
  );
}

function CardRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="biz-row">
      <div className="biz-label">{label}</div>
      <div className="biz-value">{children}</div>
    </div>
  );
}

// --- Group summary card (preview pane when a group is selected) --------------
function GroupCard({
  group,
  memberCount,
  onWrite,
  onDelete,
}: {
  group: ContactGroup;
  memberCount: number;
  onWrite: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="form card-host">
      <div className="biz-card">
        <div className="biz-head">
          <div className="biz-avatar group-avatar">👥</div>
          <div className="biz-id">
            <div className="biz-name">{group.name}</div>
            <div className="biz-company">Mailing list</div>
          </div>
        </div>
        <div className="biz-grid">
          <CardRow label="Members">{memberCount}</CardRow>
        </div>
        <div className="biz-foot">
          <button className="btn" onClick={onWrite}>✉️ Write to Group</button>
          <button className="btn" onClick={onDelete}>🗑️ Delete Group</button>
        </div>
      </div>
    </div>
  );
}

// --- Add / Edit dialog ------------------------------------------------------
function ContactDialog({
  draft,
  isNew,
  categories,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Contact;
  isNew: boolean;
  categories: string[];
  onChange: (c: Contact) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<Contact>) => onChange({ ...draft, ...patch });
  const text = (key: keyof Contact) => (
    <input
      type="text"
      value={draft[key]}
      onChange={(e) => set({ [key]: e.target.value } as Partial<Contact>)}
    />
  );

  return (
    <Dialog
      title={isNew ? "New Contact" : "Edit Contact"}
      width={620}
      onClose={onCancel}
      footer={
        <>
          <button className="btn primary" onClick={onSave}>💾 Save &amp; Close</button>
          <button className="btn" onClick={onCancel}>✕ Cancel</button>
        </>
      }
    >
      <div className="contact-form">
        <div className="cform-col">
          <FieldRow label="First Name">{text("firstName")}</FieldRow>
          <FieldRow label="Last Name">{text("lastName")}</FieldRow>
          <FieldRow label="E-Mail">{text("email")}</FieldRow>
          <FieldRow label="Company">{text("company")}</FieldRow>
          <FieldRow label="Title">{text("title")}</FieldRow>
          <FieldRow label="Category">
            <input
              type="text"
              list="contact-categories"
              value={draft.category}
              onChange={(e) => set({ category: e.target.value })}
            />
            <datalist id="contact-categories">
              {categories.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </FieldRow>
        </div>
        <div className="cform-col">
          <FieldRow label="Work Phone">{text("workPhone")}</FieldRow>
          <FieldRow label="Cell Phone">{text("cellPhone")}</FieldRow>
          <FieldRow label="Address">{text("address")}</FieldRow>
          <FieldRow label="City">{text("city")}</FieldRow>
          <FieldRow label="State / Zip">
            <div className="cf-split">
              <input
                type="text"
                className="cf-state"
                value={draft.state}
                onChange={(e) => set({ state: e.target.value })}
              />
              <input
                type="text"
                className="cf-zip"
                value={draft.zip}
                onChange={(e) => set({ zip: e.target.value })}
              />
            </div>
          </FieldRow>
          <FieldRow label="Country">{text("country")}</FieldRow>
        </div>
      </div>
      <div className="contact-form contact-form-wide">
        <FieldRow label="Comments">
          <textarea
            className="cf-comments"
            value={draft.comments}
            onChange={(e) => set({ comments: e.target.value })}
            placeholder="Notes about this contact…"
          />
        </FieldRow>
      </div>
    </Dialog>
  );
}
