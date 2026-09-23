// ============================================================================
// The Properties InfoBox: Document Properties (Info, Fields, Security) and
// Database Properties (Basics, Info, Design), with the tabbed look of the
// Notes InfoBox. Opened from File > Document Properties (Alt+Enter), right-
// click menus, and Workspace icons.
// ============================================================================

import { useState } from "react";
import type { ReactNode } from "react";
import { NotesDialog, notesAlert, openDialog } from "../../components/dialogs";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { useNotes } from "../../data/store";
import { useUI } from "../../data/ui";
import type { DocColl } from "../../data/ui";
import { itemLength, notesItems } from "../../data/items";
import type { NotesItem } from "../../data/items";
import type { DocMeta } from "../../data/types";
import { fmtDateTime } from "../../lib/format";

interface InfoTab {
  id: string;
  icon: IconName;
  label: string;
  render: () => ReactNode;
}

function InfoBox({ title, subject, tabs, close }: { title: string; subject: string; tabs: InfoTab[]; close: () => void }) {
  const [tab, setTab] = useState(tabs[0].id);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  return (
    <NotesDialog
      title={title}
      onClose={close}
      width={470}
      className="infobox"
      footer={
        <button className="btn primary" onClick={close}>
          Close
        </button>
      }
    >
      <div className="ib-select">
        <span>Properties for:</span>
        <span className="ib-select-box">{subject}</span>
      </div>
      <div className="ib-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === tab}
            className={"ib-tab" + (t.id === tab ? " active" : "")}
            title={t.label}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="ib-page">{current.render()}</div>
    </NotesDialog>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ib-row">
      <span className="ib-label">{label}</span>
      <span className="ib-value">{children}</span>
    </div>
  );
}

function FieldsTab({ items }: { items: NotesItem[] }) {
  const [sel, setSel] = useState(items[0]?.name ?? "");
  const it = items.find((i) => i.name === sel) ?? items[0];
  return (
    <div className="ib-fields">
      <div className="ib-fieldlist" role="listbox">
        {items.map((i) => (
          <div
            key={i.name}
            role="option"
            aria-selected={i.name === sel}
            className={"ib-field" + (i.name === sel ? " active" : "")}
            onMouseDown={() => setSel(i.name)}
          >
            {i.name}
          </div>
        ))}
      </div>
      <div className="ib-fielddetail">
        {it ? (
          <>
            <div>Field Name: {it.name}</div>
            <div>Data Type: {it.type}</div>
            <div>Data Length: {itemLength(it)} bytes</div>
            <div>Seq Num: 1</div>
            <div>Dup Item ID: 0</div>
            <div>Field Flags: {it.flags || "(none)"}</div>
            <div className="ib-fieldvalue">{it.value.length > 600 ? it.value.slice(0, 600) + "..." : it.value}</div>
          </>
        ) : (
          <div className="muted">No fields.</div>
        )}
      </div>
    </div>
  );
}

function findDoc(coll: DocColl, id: string): (DocMeta & { id: string; subject?: string }) | undefined {
  const s = useNotes.getState();
  const lists: Record<string, (DocMeta & { id: string })[]> = {
    mail: s.mail,
    calendar: s.calendar,
    contacts: s.contacts,
    todos: s.todos,
    journal: s.journal,
    discussion: s.discussion,
  };
  const found = lists[coll]?.find((d) => d.id === id);
  if (found || coll !== "contacts") return found;
  // Groups live in the Address Book too.
  const g = s.contactGroups.find((x) => x.id === id);
  if (!g) return undefined;
  const memberNames = g.memberIds
    .map((m) => s.contacts.find((c) => c.id === m))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => `${c.firstName} ${c.lastName}`.trim() || c.email);
  return { ...g, subject: g.name, memberNames } as DocMeta & { id: string; subject?: string };
}

export async function openDocumentProperties(coll: DocColl, id: string) {
  const doc = findDoc(coll, id);
  if (!doc) {
    await notesAlert("No document is selected.", { icon: "warning" });
    return;
  }
  const items = notesItems(coll, doc);
  const bytes = items.reduce((n, i) => n + itemLength(i), 0) + 400;
  const subject =
    doc.subject ??
    ("firstName" in doc
      ? `${(doc as unknown as { firstName: string }).firstName} ${(doc as unknown as { lastName: string }).lastName}`
      : "Document");
  const form = items.find((i) => i.name === "Form")?.value ?? "Document";
  await openDialog<void>((close) => (
    <InfoBox
      title="Document Properties"
      subject={`Document: ${subject}`}
      close={() => close()}
      tabs={[
        {
          id: "info",
          icon: "info",
          label: "Info",
          render: () => (
            <>
              <Row label="Created:">{doc.created ? fmtDateTime(doc.created) : "(unknown)"}</Row>
              <Row label="Modified:">{doc.modified ? fmtDateTime(doc.modified) : "(unknown)"}</Row>
              <Row label="Modified by:">{doc.updatedBy ?? "(unknown)"}</Row>
              <Row label="Size:">{bytes.toLocaleString()} bytes</Row>
              <Row label="Form:">{form}</Row>
              <Row label="Edits:">{doc.seq ?? 1}</Row>
              <Row label="Identifier:">{id.replace(/-/g, "").toUpperCase().slice(0, 32)}</Row>
              {doc.conflictOf && <Row label="Conflict:">[Replication or Save Conflict]</Row>}
            </>
          ),
        },
        { id: "fields", icon: "all-documents", label: "Fields", render: () => <FieldsTab items={items} /> },
        {
          id: "security",
          icon: "key",
          label: "Security",
          render: () => (
            <>
              <Row label="Who can read:">All readers and above</Row>
              <Row label="Who can edit:">All editors and above, and the document's authors</Row>
              <Row label="Signed:">No</Row>
              <Row label="Encrypted:">No</Row>
              <Row label="Prevent copying:">No</Row>
            </>
          ),
        },
      ]}
    />
  ));
}

function dbSizeKb(dbId: string): number {
  const s = useNotes.getState();
  const docs: unknown[] =
    dbId === "mail"
      ? [...s.mail, ...s.calendar, ...s.todos]
      : dbId === "contacts"
        ? [...s.contacts, ...s.contactGroups]
        : dbId === "outbox"
          ? s.outbox
          : [...s.journal.filter((j) => (j.db ?? "journal") === dbId), ...s.discussion.filter((p) => (p.db ?? "discussion") === dbId)];
  return Math.max(256, Math.round(JSON.stringify(docs).length / 1024) + 320);
}

function docCount(dbId: string): number {
  const s = useNotes.getState();
  if (dbId === "mail") return s.mail.length + s.calendar.length + s.todos.length;
  if (dbId === "contacts") return s.contacts.length + s.contactGroups.length;
  if (dbId === "outbox") return s.outbox.length;
  if (dbId === "help") return 25;
  if (dbId === "directory") return 16;
  return s.journal.filter((j) => (j.db ?? "journal") === dbId).length + s.discussion.filter((p) => (p.db ?? "discussion") === dbId).length;
}

export async function openDatabaseProperties(dbId: string) {
  const db = useNotes.getState().databases.find((d) => d.id === dbId);
  if (!db) return;
  const kb = dbSizeKb(dbId);
  const used = 93 + ((kb * 7) % 60) / 10;
  await openDialog<void>((close) => (
    <InfoBox
      title="Database Properties"
      subject={`Database: ${db.title}`}
      close={() => close()}
      tabs={[
        {
          id: "basics",
          icon: "database",
          label: "Basics",
          render: () => (
            <>
              <Row label="Title:">{db.title}</Row>
              <Row label="Server:">{db.server}</Row>
              <Row label="Filename:">{db.filePath}</Row>
              <Row label="Type:">Standard</Row>
              <Row label="Replica on:">{db.serverReplica ?? "(no other replicas)"}</Row>
              <div className="ib-actions">
                <button
                  className="btn"
                  disabled={!db.serverReplica}
                  onClick={() => {
                    close();
                    useUI.getState().openView("replicator");
                  }}
                >
                  Replication Settings...
                </button>
              </div>
            </>
          ),
        },
        {
          id: "info",
          icon: "info",
          label: "Info",
          render: () => (
            <>
              <Row label="Size:">{kb.toLocaleString()} KB</Row>
              <Row label="Documents:">{docCount(dbId)}</Row>
              <Row label="% used:">{used.toFixed(1)}%</Row>
              <Row label="Created:">{fmtDateTime(db.created)}</Row>
              <Row label="Replica ID:">{db.replicaId}</Row>
              <Row label="Your access:">{db.access}</Row>
              <div className="ib-actions">
                <button
                  className="btn"
                  onClick={() => useUI.getState().setStatus(`Compacting ${db.title}... done. ${Math.round(kb * 0.04)} KB recovered.`)}
                >
                  Compact
                </button>
              </div>
            </>
          ),
        },
        {
          id: "design",
          icon: "tools",
          label: "Design",
          render: () => (
            <>
              <Row label="Inherit design from:">{db.templateName}</Row>
              <Row label="Design hidden:">No</Row>
              <Row label="List in Open Database dialog:">Yes</Row>
              <Row label="Show About document:">{db.userCreated ? "On first open" : "No"}</Row>
            </>
          ),
        },
      ]}
    />
  ));
}
