// ============================================================================
// The Contact window: a person document in the Personal Address Book. The
// "Contact" title band, the name header with the photo frame, then the
// Business, Address and Comments tabs. New contacts open in edit mode and
// saved ones in read mode (Ctrl+E or a double-click edits, Ctrl+S saves); a
// save needs a last name or an e-mail address. The action bar writes a memo,
// starts a chat, copies the contact into a new memo, calendar entry or to do,
// and deletes the contact (after asking) and closes the window.
// ============================================================================

import { useId } from "react";
import { ActionBar } from "../../components/ActionBar";
import type { ActionItem } from "../../components/ActionBar";
import { notesAsk } from "../../components/dialogs";
import { DocMissing, FieldRow, FieldTable, FormPage, FormTabs, TextRow, useDocWindow } from "../../components/docform";
import { Icon } from "../../components/Icon";
import { useTab } from "../../components/tabs";
import { stampNew } from "../../data/docs";
import { useNotes } from "../../data/store";
import { useUI } from "../../data/ui";
import type { Contact } from "../../data/types";
import {
  allCategories,
  categoriesOf,
  chatName,
  colleagueOf,
  contactFromInit,
  contactPatch,
  contactProblem,
  displayName,
  fullName,
  memoAddress,
} from "./pab";
import type { ContactField } from "./pab";
import { chatWith, copyContactLink, copyInto, writeMemoTo } from "./pabActions";
import { MailLink, Presence } from "./BusinessCard";
import "../../styles/contacts.css";

/** The large name header at the top of the form. */
function ContactHeader({ c, editing, isNew }: { c: Contact; editing: boolean; isNew: boolean }) {
  const colleague = colleagueOf(c);
  const name = fullName(c) || (isNew && !c.email.trim() ? "New Contact" : displayName(c));
  const sub = [c.title.trim(), c.company.trim()].filter(Boolean).join(", ");
  return (
    <div className="pab-dochead">
      <div className="pab-photo">
        <Icon name="person" scale={3} />
      </div>
      <div className="pab-dochead-id">
        <div className="pab-dochead-name">
          <span>{name}</span>
          {colleague && !editing && <Presence name={colleague.name} />}
        </div>
        {sub && <div className="pab-dochead-sub">{sub}</div>}
        {!editing && (c.email.trim() || c.workPhone.trim()) && (
          <div className="pab-dochead-reach">
            {c.email.trim() && <MailLink c={c} />}
            {c.workPhone.trim() && <span>{c.workPhone.trim()}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function ContactDocument() {
  const { tab } = useTab();
  const id = tab.doc?.id ?? "";
  const doc = useNotes((s) => s.contacts.find((c) => c.id === id));
  const contacts = useNotes((s) => s.contacts);
  const listId = useId();

  const w = useDocWindow<Contact>({
    coll: "contacts",
    doc,
    blank: contactFromInit,
    title: (d) => fullName(d) || d.email.trim() || (tab.isNew ? "New Contact" : "(Untitled)"),
    validate: contactProblem,
    persist: (d, isNew) => {
      const s = useNotes.getState();
      const fields = contactPatch(d);
      if (isNew) s.addContact(stampNew<Contact>({ ...d, ...fields }, s.user.notesName));
      else s.updateContact(d.id, fields);
      useUI
        .getState()
        .setStatus(isNew ? `${displayName({ ...d, ...fields })} was added to your Address Book.` : "Contact saved.");
    },
    commands: { copyAsLink: doc ? () => copyContactLink(doc) : undefined },
  });

  if (w.missing) return <DocMissing />;
  const d = w.draft;

  const text = (label: string, field: ContactField, autoFocus?: boolean) => (
    <TextRow
      label={label}
      value={d[field]}
      editing={w.editing}
      autoFocus={autoFocus}
      onChange={(v) => w.set({ [field]: v } as Partial<Contact>)}
    />
  );

  const remove = async () => {
    if (!doc) return;
    if (!(await notesAsk(`Are you sure you want to delete ${displayName(doc)} from your Address Book?`, { title: "Delete Contact" })))
      return;
    useNotes.getState().deleteContact(doc.id);
    useUI.getState().setStatus(`${displayName(doc)} was deleted from your Address Book.`);
    w.closeNow();
  };

  const memo: ActionItem = {
    id: "memo",
    label: "Write Memo",
    icon: "write-memo",
    disabled: !memoAddress(d),
    run: () => writeMemoTo([d]),
  };
  const chat: ActionItem = { id: "chat", label: "Chat", icon: "chat", disabled: !chatName(d), run: () => chatWith(d) };
  const del: ActionItem = { id: "delete", label: "Delete", icon: "trash", run: () => void remove() };

  const actions: ActionItem[] = w.editing
    ? [
        { id: "saveclose", label: "Save & Close", icon: "save", run: () => void w.saveAndClose() },
        { id: "save", label: "Save", icon: "save", accel: "Ctrl+S", run: () => void w.save() },
        "sep",
        memo,
        chat,
        ...(w.isNew ? [] : (["sep", del] as ActionItem[])),
      ]
    : [
        { id: "edit", label: "Edit", icon: "edit", accel: "Ctrl+E", run: w.beginEdit },
        "sep",
        memo,
        chat,
        {
          id: "copyinto",
          label: "Copy Into New",
          icon: "copy-into",
          children: [
            { id: "ci-memo", label: "Memo", run: () => copyInto([d], "memo") },
            { id: "ci-cal", label: "Calendar Entry", run: () => copyInto([d], "calendar") },
            { id: "ci-todo", label: "To Do", run: () => copyInto([d], "todo") },
          ],
        },
        "sep",
        del,
      ];

  const cats = categoriesOf(d);

  return (
    <div className="app pab-doc">
      <ActionBar actions={actions} />
      <FormPage form="Contact" icon="person" editing={w.editing} onEdit={w.beginEdit} className="pab-form">
        <ContactHeader c={d} editing={w.editing} isNew={w.isNew} />
        <FormTabs
          tabs={[
            {
              id: "business",
              label: "Business",
              content: (
                <FieldTable>
                  {text("First name:", "firstName", w.isNew)}
                  {text("Last name:", "lastName")}
                  {text("Title:", "title")}
                  {text("Company:", "company")}
                  <FieldRow label="E-mail:" editing={w.editing} read={d.email.trim() ? <MailLink c={d} /> : ""}>
                    <input
                      type="email"
                      className="nf-input"
                      value={d.email}
                      spellCheck={false}
                      onChange={(e) => w.set({ email: e.target.value })}
                    />
                  </FieldRow>
                  {text("Business phone:", "workPhone")}
                  {text("Cell phone:", "cellPhone")}
                </FieldTable>
              ),
            },
            {
              id: "address",
              label: "Address",
              content: (
                <FieldTable>
                  <FieldRow label="Street:" editing={w.editing} read={d.address}>
                    <textarea
                      className="nf-input pab-street"
                      rows={2}
                      value={d.address}
                      onChange={(e) => w.set({ address: e.target.value })}
                    />
                  </FieldRow>
                  {text("City:", "city")}
                  {text("State:", "state")}
                  {text("ZIP:", "zip")}
                  {text("Country:", "country")}
                </FieldTable>
              ),
            },
            {
              id: "comments",
              label: "Comments",
              content: (
                <FieldTable>
                  <FieldRow label="Category:" editing={w.editing} read={cats.join(", ")}>
                    <input
                      type="text"
                      className="nf-input"
                      list={listId}
                      value={d.category}
                      onChange={(e) => w.set({ category: e.target.value })}
                    />
                    <datalist id={listId}>
                      {allCategories(contacts).map((cat) => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                  </FieldRow>
                  <FieldRow label="Comments:" editing={w.editing} read={d.comments} wide>
                    <textarea
                      className="nf-input pab-comments-field"
                      rows={6}
                      value={d.comments}
                      onChange={(e) => w.set({ comments: e.target.value })}
                    />
                  </FieldRow>
                  {w.editing && (
                    <tr className="pab-form-note">
                      <td colSpan={2}>
                        Separate several categories with commas. A backslash makes a subcategory, as in Clients\West.
                      </td>
                    </tr>
                  )}
                </FieldTable>
              ),
            },
          ]}
        />
      </FormPage>
    </div>
  );
}
