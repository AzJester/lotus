// ============================================================================
// Mail — the Memo database. Three-pane client (folder navigator · message list
// · reading pane) plus a full memo compose/reply/forward form. This module is
// the reference pattern the other applications follow: it reads/writes the
// shared store, composes the shared UI primitives, and uses the shared layout
// classes (.app, .action-bar, .app-cols, .nav-pane, .list-pane, .preview-pane).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useNotes, uid } from "../../data/store";
import { useUI } from "../../data/ui";
import type { MailFolder, MailMessage, Person, Priority } from "../../data/types";
import {
  ActionBar,
  ActionButton,
  ActionSep,
  ActionSpacer,
} from "../../components/ui";
import { fmtListDate, fmtDateTime, initials } from "../../lib/format";
import "../../styles/mail.css";

type NavKey = MailFolder | "followup" | "all";

interface Compose {
  draftId: string | null; // existing draft being edited, if any
  to: string;
  cc: string;
  subject: string;
  body: string;
  priority: Priority;
}

const FOLDERS: { key: NavKey; label: string; icon: string }[] = [
  { key: "inbox", label: "Inbox", icon: "📥" },
  { key: "drafts", label: "Drafts", icon: "📝" },
  { key: "sent", label: "Sent", icon: "📤" },
  { key: "followup", label: "Follow Up", icon: "🚩" },
  { key: "all", label: "All Documents", icon: "🗂️" },
  { key: "trash", label: "Trash", icon: "🗑️" },
];

function parsePeople(raw: string): Person[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      if (token.includes("@")) {
        const name = token.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        return { name, email: token };
      }
      const email = token.toLowerCase().replace(/\s+/g, ".") + "@acme.example.com";
      return { name: token, email };
    });
}

const peopleStr = (ppl: Person[]) => ppl.map((p) => p.name || p.email).join(", ");

export default function Mail() {
  const {
    mail,
    user,
    sendMail,
    addMail,
    updateMail,
    deleteMail,
    markRead,
    emptyTrash,
  } = useNotes();
  const setStatus = useUI((s) => s.setStatus);
  const pendingMemo = useUI((s) => s.pendingMemo);
  const clearMemo = useUI((s) => s.clearMemo);

  const [nav, setNav] = useState<NavKey>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState<Compose | null>(null);

  // Honour a "Write Memo" request handed over from another module (e.g. Contacts).
  useEffect(() => {
    if (pendingMemo) {
      setCompose({
        draftId: null,
        to: pendingMemo.to,
        cc: "",
        subject: pendingMemo.subject,
        body: "",
        priority: "normal",
      });
      clearMemo();
    }
  }, [pendingMemo, clearMemo]);

  const messages = useMemo(() => {
    let list = mail;
    if (nav === "followup") list = mail.filter((m) => m.flagged && m.folder !== "trash");
    else if (nav === "all") list = mail.filter((m) => m.folder !== "trash");
    else list = mail.filter((m) => m.folder === nav);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.subject.toLowerCase().includes(q) ||
          m.body.toLowerCase().includes(q) ||
          m.from.name.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => b.date - a.date);
  }, [mail, nav, search]);

  const selected = mail.find((m) => m.id === selectedId) ?? null;
  const inboxUnread = mail.filter((m) => m.folder === "inbox" && !m.read).length;
  const draftCount = mail.filter((m) => m.folder === "drafts").length;
  const flagCount = mail.filter((m) => m.flagged && m.folder !== "trash").length;
  const showsSender = nav === "sent" || nav === "drafts";

  function selectMessage(m: MailMessage) {
    setSelectedId(m.id);
    if (!m.read) markRead(m.id, true);
  }

  // --- compose helpers ----------------------------------------------------
  function newMemo() {
    setCompose({ draftId: null, to: "", cc: "", subject: "", body: "", priority: "normal" });
  }
  function editDraft(m: MailMessage) {
    setCompose({
      draftId: m.id,
      to: peopleStr(m.to),
      cc: peopleStr(m.cc),
      subject: m.subject,
      body: m.body,
      priority: m.priority,
    });
  }
  function reply(all: boolean) {
    if (!selected) return;
    // Reply All carries every other primary + cc recipient (minus me and the sender).
    const cc = all
      ? peopleStr(
          [...selected.to, ...selected.cc].filter(
            (p) => p.email !== user.email && p.email !== selected.from.email,
          ),
        )
      : "";
    setCompose({
      draftId: null,
      to: peopleStr([selected.from]),
      cc,
      subject: /^re:/i.test(selected.subject) ? selected.subject : `RE: ${selected.subject}`,
      body: `\n\n----- Original Message -----\nFrom: ${selected.from.name}\nDate: ${fmtDateTime(selected.date)}\nSubject: ${selected.subject}\n\n${selected.body}`,
      priority: "normal",
    });
  }
  function forward() {
    if (!selected) return;
    setCompose({
      draftId: null,
      to: "",
      cc: "",
      subject: /^fw:/i.test(selected.subject) ? selected.subject : `Fw: ${selected.subject}`,
      body: `\n\n----- Forwarded Message -----\nFrom: ${selected.from.name}\nDate: ${fmtDateTime(selected.date)}\nSubject: ${selected.subject}\n\n${selected.body}`,
      priority: "normal",
    });
  }

  function buildMessage(c: Compose, folder: MailFolder): MailMessage {
    return {
      id: c.draftId ?? uid(),
      folder,
      from: { name: user.name, email: user.email },
      to: parsePeople(c.to),
      cc: parsePeople(c.cc),
      subject: c.subject || "(No subject)",
      body: c.body,
      date: Date.now(),
      read: true,
      flagged: false,
      priority: c.priority,
    };
  }

  function doSend() {
    if (!compose) return;
    if (!compose.to.trim()) {
      setStatus("Please specify at least one recipient.");
      return;
    }
    if (compose.draftId) {
      // Promote the existing draft document into a Sent memo in place, so it
      // never lingers in Drafts or transits through Trash.
      const msg = buildMessage(compose, "sent");
      updateMail(compose.draftId, { ...msg, id: compose.draftId });
    } else {
      sendMail(buildMessage({ ...compose, draftId: null }, "sent"));
    }
    setStatus(`Memo sent to ${parsePeople(compose.to).length} recipient(s).`);
    setCompose(null);
  }
  function doSaveDraft() {
    if (!compose) return;
    const msg = buildMessage(compose, "drafts");
    if (compose.draftId) updateMail(compose.draftId, msg);
    else addMail(msg);
    setStatus("Saved to Drafts.");
    setCompose(null);
  }

  // --- delete / flag ------------------------------------------------------
  function del() {
    if (!selected) return;
    const wasTrash = selected.folder === "trash";
    deleteMail(selected.id);
    setStatus(wasTrash ? "Document deleted." : "Moved to Trash.");
    setSelectedId(null);
  }
  function toggleFlag() {
    if (!selected) return;
    updateMail(selected.id, { flagged: !selected.flagged });
  }
  function toggleRead() {
    if (!selected) return;
    markRead(selected.id, !selected.read);
  }

  // --- render -------------------------------------------------------------
  return (
    <div className="app mail-app">
      <ActionBar>
        <ActionButton icon="📝" label="New Memo" onClick={newMemo} />
        <ActionSep />
        <ActionButton icon="↩️" label="Reply" caret onClick={() => reply(false)} disabled={!selected} />
        <ActionButton icon="↪️" label="Reply All" onClick={() => reply(true)} disabled={!selected} />
        <ActionButton icon="➡️" label="Forward" onClick={forward} disabled={!selected} />
        <ActionSep />
        <ActionButton icon="🚩" label="Follow Up" onClick={toggleFlag} disabled={!selected} />
        <ActionButton
          icon="✉️"
          label={selected && selected.read ? "Mark Unread" : "Mark Read"}
          onClick={toggleRead}
          disabled={!selected}
        />
        <ActionButton icon="🗑️" label="Delete" onClick={del} disabled={!selected} />
        <ActionSpacer />
        <div className="action-search">
          <input
            type="search"
            placeholder="Search Mail…"
            className="bevel-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </ActionBar>

      <div className="app-cols">
        {/* Navigator */}
        <div className="nav-pane">
          <div className="nav-title">{user.name}</div>
          <div className="nav-group">
            {FOLDERS.map((f) => {
              const count =
                f.key === "inbox" ? inboxUnread : f.key === "drafts" ? draftCount : f.key === "followup" ? flagCount : 0;
              return (
                <div
                  key={f.key}
                  className={"nav-item" + (nav === f.key ? " active" : "")}
                  onClick={() => {
                    setNav(f.key);
                    setSelectedId(null);
                    setCompose(null);
                  }}
                >
                  <span className="nav-ic">{f.icon}</span>
                  <span className={"nav-label" + (count > 0 ? " has-count" : "")}>
                    {f.label}
                    {count > 0 ? ` (${count})` : ""}
                  </span>
                </div>
              );
            })}
          </div>
          {nav === "trash" && (
            <div style={{ padding: 8 }}>
              <button className="btn" onClick={() => { emptyTrash(); setSelectedId(null); }}>
                Empty Trash
              </button>
            </div>
          )}
        </div>

        {compose ? (
          <ComposeForm
            compose={compose}
            setCompose={setCompose}
            onSend={doSend}
            onSave={doSaveDraft}
            onCancel={() => setCompose(null)}
          />
        ) : (
          <>
            {/* Message list */}
            <div className="list-pane mail-list">
              <div className="view">
                <div className="view-head">
                  <div className="col" style={{ flex: "0 0 22px" }} title="Flag">🚩</div>
                  <div className="col" style={{ flex: "0 0 150px" }}>
                    {showsSender ? "Recipient" : "Who"}
                  </div>
                  <div className="col" style={{ flex: 1 }}>Subject</div>
                  <div className="col" style={{ flex: "0 0 96px" }}>Date</div>
                </div>
                <div className="view-body">
                  {messages.length === 0 && <div className="view-empty">No documents in this view.</div>}
                  {messages.map((m) => {
                    const who = showsSender ? peopleStr(m.to) || "—" : m.from.name;
                    return (
                      <div
                        key={m.id}
                        className={
                          "view-row" +
                          (m.id === selectedId ? " selected" : "") +
                          (!m.read && m.folder === "inbox" ? " unread" : "") +
                          (m.flagged ? " flagged" : "") +
                          (m.priority === "high" ? " hot" : "")
                        }
                        onClick={() => selectMessage(m)}
                        onDoubleClick={() => (m.folder === "drafts" ? editDraft(m) : selectMessage(m))}
                      >
                        <div className="col col-c" style={{ flex: "0 0 22px" }}>
                          {m.flagged ? "🚩" : m.priority === "high" ? "❗" : ""}
                        </div>
                        <div className="col" style={{ flex: "0 0 150px" }}>{who}</div>
                        <div className="col" style={{ flex: 1 }}>{m.subject}</div>
                        <div className="col" style={{ flex: "0 0 96px" }}>{fmtListDate(m.date)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Reading pane */}
            <div className="preview-pane">
              {selected ? (
                <MemoReader msg={selected} isDraft={selected.folder === "drafts"} onEdit={() => editDraft(selected)} />
              ) : (
                <div className="preview-empty">Select a memo to read it.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// --- Reading pane -----------------------------------------------------------
function MemoReader({ msg, isDraft, onEdit }: { msg: MailMessage; isDraft: boolean; onEdit: () => void }) {
  return (
    <div className="form memo-reader">
      <div className="memo-head">
        <div className="memo-avatar">{initials(msg.from.name)}</div>
        <div className="memo-headlines">
          <div className="memo-subject">
            {msg.priority === "high" && <span className="prio-high">❗ </span>}
            {msg.subject}
          </div>
          <div className="memo-line">
            <b>{msg.from.name}</b> <span className="muted">&lt;{msg.from.email}&gt;</span>
          </div>
          <div className="memo-line muted">
            To: {peopleStr(msg.to) || "—"}
            {msg.cc.length > 0 && <> &nbsp;·&nbsp; Cc: {peopleStr(msg.cc)}</>}
          </div>
          <div className="memo-line muted">{fmtDateTime(msg.date)}</div>
        </div>
        {isDraft && (
          <button className="btn" onClick={onEdit}>Edit Draft</button>
        )}
      </div>
      <div className="memo-body">{msg.body}</div>
    </div>
  );
}

// --- Compose form -----------------------------------------------------------
function ComposeForm({
  compose,
  setCompose,
  onSend,
  onSave,
  onCancel,
}: {
  compose: Compose;
  setCompose: (c: Compose) => void;
  onSend: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<Compose>) => setCompose({ ...compose, ...patch });
  return (
    <div className="compose-pane">
      <div className="compose-actions">
        <button className="btn primary" onClick={onSend}>📨 Send</button>
        <button className="btn" onClick={onSave}>💾 Save as Draft</button>
        <span style={{ flex: 1 }} />
        <label className="compose-prio">
          Priority:&nbsp;
          <select value={compose.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>
        <button className="btn" onClick={onCancel}>✕ Discard</button>
      </div>
      <div className="compose-fields">
        <div className="cf-row">
          <label>To</label>
          <input type="text" value={compose.to} placeholder="name@acme.example.com, …"
            onChange={(e) => set({ to: e.target.value })} />
        </div>
        <div className="cf-row">
          <label>cc</label>
          <input type="text" value={compose.cc} onChange={(e) => set({ cc: e.target.value })} />
        </div>
        <div className="cf-row">
          <label>Subject</label>
          <input type="text" value={compose.subject} onChange={(e) => set({ subject: e.target.value })} />
        </div>
      </div>
      <textarea
        className="memo-body compose-body"
        value={compose.body}
        autoFocus
        onChange={(e) => set({ body: e.target.value })}
        placeholder="Type your message…"
      />
    </div>
  );
}
