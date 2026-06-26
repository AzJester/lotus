// ============================================================================
// Contacts — the Personal Address Book. Three-pane layout (view navigator ·
// contact list · business-card preview) plus a two-column document form for
// creating and editing person documents. Follows the Mail module pattern: it
// reads/writes the shared store, composes the shared UI primitives, and reuses
// the shared layout classes (.app, .action-bar, .app-cols, .nav-pane, …).
// ============================================================================

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNotes, uid } from "../../data/store";
import { useUI } from "../../data/ui";
import type { Contact } from "../../data/types";
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

// The three built-in views, plus one generated nav-item per category found.
type NavKey =
  | { kind: "name" }
  | { kind: "company" }
  | { kind: "category" }
  | { kind: "cat"; value: string };

const sameNav = (a: NavKey, b: NavKey): boolean =>
  a.kind === b.kind && (a.kind !== "cat" || (b as { value: string }).value === a.value);

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
  const { contacts, addContact, updateContact, deleteContact } = useNotes();
  const setStatus = useUI((s) => s.setStatus);
  const openView = useUI((s) => s.openView);

  const [nav, setNav] = useState<NavKey>({ kind: "name" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // The contact being edited in the dialog; null when the dialog is closed.
  const [draft, setDraft] = useState<Contact | null>(null);

  // Distinct categories present in the data, for the generated nav-items.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) if (c.category.trim()) set.add(c.category.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [contacts]);

  // Group by company only when the "By Company" view is active.
  const grouped = nav.kind === "company";

  const list = useMemo(() => {
    let rows = contacts;
    if (nav.kind === "cat") rows = rows.filter((c) => c.category.trim() === nav.value);
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
  }, [contacts, nav, search, grouped]);

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
    if (!selected) return;
    openView("mail");
    setStatus(`New memo to ${selected.email || fullName(selected)}.`);
  }

  // --- render -------------------------------------------------------------
  return (
    <div className="app contacts-app">
      <ActionBar>
        <ActionButton icon="👤" label="New Contact" onClick={newContact} />
        <ActionButton icon="✏️" label="Edit" onClick={() => selected && editContact(selected)} disabled={!selected} />
        <ActionButton icon="🗑️" label="Delete" onClick={del} disabled={!selected} />
        <ActionSep />
        <ActionButton icon="✉️" label="Write Memo" onClick={writeMemo} disabled={!selected} />
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

        {/* Business-card preview */}
        <div className="preview-pane">
          {selected ? (
            <BusinessCard c={selected} onEdit={() => editContact(selected)} onMemo={writeMemo} />
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
    </div>
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
