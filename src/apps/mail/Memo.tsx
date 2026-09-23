// ============================================================================
// The memo window. Read mode shows the classic header block (sender and date
// on the left; To, cc and Subject on the right; the mood stamp), meeting
// notices with their responses, delivery reports and receipts. Compose mode
// is the Memo form: bracketed address fields with type-ahead, Address...,
// Delivery Options..., attachments and rich text. Closing a memo you changed
// asks the Close Window question (send / save / discard).
// ============================================================================

import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { ActionBar } from "../../components/ActionBar";
import type { ActionItem } from "../../components/ActionBar";
import { Icon } from "../../components/Icon";
import { notesAlert, notesConfirm } from "../../components/dialogs";
import { RichTextEditor, RichTextView } from "../../components/RichText";
import { useTab, useTabCommands } from "../../components/tabs";
import { useNotes, uid } from "../../data/store";
import { registerCloseGuard, useUI } from "../../data/ui";
import { addressCandidates, completeName, commonName, headerName, parseAddressList } from "../../data/names";
import type { Attachment, MailMessage, Person } from "../../data/types";
import { htmlToText } from "../../lib/sanitize";
import { fmtDate, fmtDateTime, fmtTime } from "../../lib/format";
import { openDocumentProperties } from "../../shell/dialogs/Properties";
import { composeFrom, emptyCompose, fmtBytes, moodLabel } from "./mailHelpers";
import type { ComposeModel } from "./mailHelpers";
import {
  addressDialog,
  closeWindowDialog,
  deliveryOptionsDialog,
  moveToFolderDialog,
  MOOD_ICON,
} from "./mailDialogs";
import {
  copyDocLink,
  copyIntoAction,
  fileInFolder,
  followUpAction,
  noticeActions,
  replyActions,
  resend,
  respond,
} from "./mailActions";
import "../../styles/mail.css";

// ---------------------------------------------------------------------------
// Read mode
// ---------------------------------------------------------------------------

function NoticePanel({ m }: { m: MailMessage }) {
  const n = m.notice!;
  const when = `${fmtDate(n.proposedStart ?? n.start)} ${fmtTime(n.proposedStart ?? n.start)} - ${fmtTime(n.proposedEnd ?? n.end)}`;
  const titles: Record<string, string> = {
    invitation: "Meeting Invitation",
    accepted: `${m.from.name} has accepted`,
    declined: `${m.from.name} has declined`,
    tentative: `${m.from.name} has tentatively accepted`,
    delegated: `${m.from.name} has delegated to ${n.delegate?.name ?? "someone else"}`,
    counter: `${m.from.name} has proposed a new time`,
    rescheduled: "This meeting has been rescheduled",
    cancelled: "This meeting has been cancelled",
  };
  const responded: Record<string, string> = {
    accepted: "You accepted this invitation.",
    tentative: "You tentatively accepted this invitation.",
    declined: "You declined this invitation.",
    delegated: "You delegated this invitation.",
    counter: "You proposed a new time.",
  };
  return (
    <div className={"notice-panel notice-" + n.type}>
      <div className="notice-head">
        <Icon name={n.type === "invitation" ? "invitation" : n.type === "declined" || n.type === "cancelled" ? "decline" : n.type === "counter" ? "propose" : "accept"} />
        <b>{titles[n.type]}</b>
      </div>
      <div className="notice-grid">
        <span>Subject:</span>
        <span>{n.subject}</span>
        <span>{n.type === "counter" || n.type === "rescheduled" ? "Proposed:" : "When:"}</span>
        <span>{when}</span>
        {n.type === "counter" && (
          <>
            <span>Original:</span>
            <span>
              {fmtDate(n.start)} {fmtTime(n.start)} - {fmtTime(n.end)}
            </span>
          </>
        )}
        <span>Where:</span>
        <span>{n.location || "(not specified)"}</span>
        <span>Chair:</span>
        <span>{headerName(n.chair).replace(/@.*$/, "")}</span>
        {n.comment && (
          <>
            <span>Comment:</span>
            <span>{n.comment}</span>
          </>
        )}
      </div>
      {n.response && <div className="notice-status">{responded[n.response]}</div>}
      {n.type === "invitation" && !n.response && (
        <div className="notice-buttons">
          <button className="btn primary" onClick={() => void respond(m, "accept")}>
            Accept
          </button>
          <button className="btn" onClick={() => void respond(m, "tentative")}>
            Tentatively Accept
          </button>
          <button className="btn" onClick={() => void respond(m, "decline")}>
            Decline
          </button>
          <button className="btn" onClick={() => void respond(m, "counter")}>
            Propose New Time...
          </button>
          <button className="btn" onClick={() => void respond(m, "delegate")}>
            Delegate...
          </button>
        </div>
      )}
    </div>
  );
}

function PeopleLine({ label, people }: { label: string; people: Person[] | undefined }) {
  if (!people || people.length === 0) return label === "To:" ? (
    <div className="mh-row">
      <span className="mh-label">{label}</span>
      <span className="mh-val muted">(none)</span>
    </div>
  ) : null;
  return (
    <div className="mh-row">
      <span className="mh-label">{label}</span>
      <span className="mh-val">{people.map(headerName).join(", ")}</span>
    </div>
  );
}

/** The memo in read mode (memo windows and the preview pane). */
export function MemoReader({ m, compact }: { m: MailMessage; compact?: boolean }) {
  const theme = useUI((s) => s.theme);
  const myEmail = useNotes((s) => s.user.email);
  const [details, setDetails] = useState(false);
  const mine = m.from.email.toLowerCase() === myEmail.toLowerCase();
  const moodIcon = m.mood ? MOOD_ICON[m.mood] : null;

  return (
    <div className={"memo-read" + (compact ? " compact" : "")}>
      {theme === "r5" ? (
        <div className="memo-head r5">
          <div className="mh-left">
            <div className="mh-from">{headerName(m.from).replace(/@.*$/, "")}</div>
            <div className="mh-date">{fmtDateTime(m.date)}</div>
            {m.priority === "high" && <div className="mh-importance">Importance: High</div>}
          </div>
          <div className="mh-right">
            <PeopleLine label="To:" people={m.to} />
            <PeopleLine label="cc:" people={m.cc} />
            {mine && <PeopleLine label="bcc:" people={m.bcc} />}
            <div className="mh-row">
              <span className="mh-label">Subject:</span>
              <span className="mh-val mh-subject">{m.subject}</span>
            </div>
          </div>
          {moodIcon && (
            <div className="mh-mood" title={moodLabel(m.mood)}>
              <Icon name={moodIcon} scale={2} />
              <span>{moodLabel(m.mood)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="memo-head n8">
          <div className="mh-subject-big">
            {m.priority === "high" && <Icon name="importance" />}
            {m.subject}
            {moodIcon && (
              <span className="mh-mood-inline" title={moodLabel(m.mood)}>
                <Icon name={moodIcon} /> {moodLabel(m.mood)}
              </span>
            )}
          </div>
          <div className="mh-line">
            <b>{commonName(m.from)}</b> <span className="muted">to {m.to.map(commonName).join(", ") || "(none)"}</span>
            <span className="mh-date-inline">{fmtDateTime(m.date)}</span>
            <a
              className="mh-details"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setDetails((d) => !d);
              }}
            >
              {details ? "Hide Details" : "Show Details"}
            </a>
          </div>
          {details && (
            <div className="mh-details-box">
              <div>From: {headerName(m.from)}</div>
              <div>To: {m.to.map(headerName).join(", ") || "(none)"}</div>
              {m.cc.length > 0 && <div>cc: {m.cc.map(headerName).join(", ")}</div>}
              {mine && m.bcc && m.bcc.length > 0 && <div>bcc: {m.bcc.map(headerName).join(", ")}</div>}
              <div>Date: {fmtDateTime(m.date)}</div>
              <div>Importance: {m.priority[0].toUpperCase() + m.priority.slice(1)}</div>
              {m.returnReceipt && <div>Return receipt requested</div>}
            </div>
          )}
        </div>
      )}

      {m.notice && <NoticePanel m={m} />}
      {m.failure && (
        <div className="notice-panel notice-failure">
          <div className="notice-head">
            <Icon name="error" />
            <b>Delivery Failure Report</b>
          </div>
          <div className="notice-grid">
            <span>Your document:</span>
            <span>{m.failure.originalSubject}</span>
            <span>was not delivered to:</span>
            <span>{m.failure.recipient}</span>
            <span>because:</span>
            <span>{m.failure.reason}</span>
          </div>
          <div className="notice-buttons">
            <button className="btn" onClick={() => resend(m)}>
              Resend...
            </button>
          </div>
        </div>
      )}
      {m.receipt && (
        <div className="notice-panel notice-receipt">
          <div className="notice-head">
            <Icon name="accept" />
            <b>Return Receipt</b>
          </div>
          <div className="notice-grid">
            <span>Your document:</span>
            <span>{m.receipt.originalSubject}</span>
            <span>was received by:</span>
            <span>{m.receipt.recipient}</span>
            <span>at:</span>
            <span>{fmtDateTime(m.receipt.at)}</span>
          </div>
        </div>
      )}
      {m.attachments && m.attachments.length > 0 && (
        <div className="memo-attachments">
          {m.attachments.map((a, i) => (
            <a key={i} className="attach-chip" href={a.dataUrl} download={a.name} title={`${a.name} (${fmtBytes(a.size)})`}>
              <Icon name="attachment" />
              <span className="attach-name">{a.name}</span>
              <span className="attach-size">{fmtBytes(a.size)}</span>
            </a>
          ))}
        </div>
      )}
      {!m.failure && !m.receipt && <RichTextView className="memo-body" html={m.bodyHtml} text={m.bodyHtml ? undefined : m.body} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compose mode
// ---------------------------------------------------------------------------

/** An address field with Notes type-ahead: names complete inline as you type. */
function AddressField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const contacts = useNotes((s) => s.contacts);
  const groups = useNotes((s) => s.contactGroups);
  const candidates = useMemo(() => addressCandidates(contacts, groups), [contacts, groups]);
  const ref = useRef<HTMLInputElement>(null);
  const deleting = useRef(false);
  // Selection to apply once React has rendered the completed value. Applying
  // it in a layout effect (not a later frame) keeps fast typing from landing
  // after the completion instead of replacing it.
  const pendingSel = useRef<[number, number] | null>(null);
  // Re-render even when the completed value equals the previous one.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useLayoutEffect(() => {
    const el = ref.current;
    const sel = pendingSel.current;
    if (!el || !sel) return;
    pendingSel.current = null;
    el.setSelectionRange(sel[0], sel[1]);
  });

  const accept = () => {
    const el = ref.current;
    if (!el || el.selectionStart === el.selectionEnd || el.selectionEnd !== el.value.length) return false;
    const next = el.value + ", ";
    pendingSel.current = [next.length, next.length];
    onChange(next);
    rerender();
    return true;
  };

  return (
    <div className="cf-row">
      <label className="cf-label">{label}</label>
      <span className="nf-field">
        <input
          ref={ref}
          type="text"
          className="cf-input"
          value={value}
          autoFocus={autoFocus}
          spellCheck={false}
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
            if (hit && hit.display.toLowerCase() !== typed.toLowerCase()) {
              const prefix = head + (head ? " " : "");
              const full = prefix + hit.display;
              pendingSel.current = [prefix.length + typed.length, full.length];
              onChange(full);
              rerender();
            } else onChange(raw);
          }}
        />
      </span>
    </div>
  );
}

function readFiles(files: FileList): Promise<Attachment[]> {
  return Promise.all(
    Array.from(files).map(
      (f) =>
        new Promise<Attachment>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve({ name: f.name, type: f.type || "application/octet-stream", size: f.size, dataUrl: String(r.result) });
          r.readAsDataURL(f);
        }),
    ),
  );
}

function MemoCompose({ initial, draftId }: { initial: ComposeModel; draftId: string | null }) {
  const { tab } = useTab();
  const [model, setModel] = useState<ComposeModel>(initial);
  const dirty = useRef(false);
  const modelRef = useRef(model);
  modelRef.current = model;
  const fileRef = useRef<HTMLInputElement>(null);
  const setTabTitle = useUI((s) => s.setTabTitle);
  const set = (patch: Partial<ComposeModel>) => {
    dirty.current = true;
    setModel((m) => ({ ...m, ...patch }));
  };

  useEffect(() => {
    setTabTitle(tab.id, model.subject.trim() || (draftId ? "(Untitled)" : "New Memo"));
  }, [model.subject, tab.id, draftId, setTabTitle]);

  const build = (folder: MailMessage["folder"]): MailMessage => {
    const s = useNotes.getState();
    const m = modelRef.current;
    return {
      id: draftId ?? tab.doc?.id ?? uid(),
      folder,
      from: { name: s.user.name, email: s.user.email },
      to: parseAddressList(m.to, s.contacts, s.contactGroups),
      cc: parseAddressList(m.cc, s.contacts, s.contactGroups),
      bcc: parseAddressList(m.bcc, s.contacts, s.contactGroups),
      subject: m.subject.trim() || "(No subject)",
      body: htmlToText(m.bodyHtml),
      bodyHtml: m.bodyHtml || undefined,
      attachments: m.attachments.length ? m.attachments : undefined,
      hasAttachment: m.attachments.length > 0,
      date: Date.now(),
      read: true,
      flagged: false,
      priority: m.priority,
      mood: m.mood !== "normal" ? m.mood : undefined,
      returnReceipt: m.returnReceipt || undefined,
      form: m.replyKind === "reply" ? "Reply" : "Memo",
      inReplyTo: m.inReplyTo,
      labels: [],
    };
  };

  const closeNow = () => {
    dirty.current = false;
    useUI.getState().closeTab(tab.id);
  };

  /** Returns true when the memo went out (or was queued). */
  const send = async (opts: { saveCopy?: boolean; fileTo?: string } = {}): Promise<boolean> => {
    const s = useNotes.getState();
    const m = modelRef.current;
    if (!m.to.trim() && !m.cc.trim() && !m.bcc.trim()) {
      await notesAlert("No names found to send mail to.", { icon: "warning" });
      return false;
    }
    let saveCopy = opts.saveCopy;
    if (saveCopy === undefined) {
      if (s.prefs.saveSentMail === "prompt") {
        const b = await notesConfirm("Do you want to save a copy of this memo in your Sent folder?", { buttons: ["Yes", "No", "Cancel"] });
        if (b === "Cancel") return false;
        saveCopy = b === "Yes";
      } else saveCopy = s.prefs.saveSentMail === "always";
    }
    const memo = build("sent");
    const out = s.sendMemo(memo, { saveCopy, fileTo: opts.fileTo });
    if (m.inReplyTo && m.replyKind) {
      s.updateMail(m.inReplyTo, m.replyKind === "reply" ? { repliedAt: Date.now() } : { forwardedAt: Date.now() });
    }
    const n = memo.to.length + memo.cc.length + (memo.bcc?.length ?? 0);
    useUI
      .getState()
      .setStatus(
        out.queued
          ? "Memo placed in Outgoing Mail. It will be sent the next time you replicate."
          : out.failures.length
            ? `Memo sent. ${out.failures.length} recipient${out.failures.length === 1 ? " was" : "s were"} not found; a Delivery Failure Report will follow.`
            : `Memo sent to ${n} recipient${n === 1 ? "" : "s"}.`,
      );
    closeNow();
    return true;
  };

  const saveDraft = () => {
    const s = useNotes.getState();
    const memo = build("drafts");
    if (draftId) s.updateMail(draftId, memo);
    else s.addMail(memo);
    useUI.getState().setStatus("Memo saved to Drafts.");
    closeNow();
  };

  const sendAndFile = async () => {
    const folderId = await moveToFolderDialog("Send and File");
    if (folderId) await send({ fileTo: folderId });
  };

  const openAddress = async () => {
    const m = modelRef.current;
    const split = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
    const pick = await addressDialog({ to: split(m.to), cc: split(m.cc), bcc: split(m.bcc) });
    if (pick) set({ to: pick.to.join(", "), cc: pick.cc.join(", "), bcc: pick.bcc.join(", ") });
  };

  const openDelivery = async () => {
    const m = modelRef.current;
    const o = await deliveryOptionsDialog({ priority: m.priority, mood: m.mood, returnReceipt: m.returnReceipt });
    if (o) set(o);
  };

  useEffect(
    () =>
      registerCloseGuard(tab.id, {
        isDirty: () => dirty.current,
        confirmClose: async () => {
          if (!dirty.current) return true;
          const choice = await closeWindowDialog();
          if (choice === null) return false;
          if (choice === "discard") {
            dirty.current = false;
            return true;
          }
          if (choice === "save") {
            const s = useNotes.getState();
            const memo = build("drafts");
            if (draftId) s.updateMail(draftId, memo);
            else s.addMail(memo);
            useUI.getState().setStatus("Memo saved to Drafts.");
            dirty.current = false;
            return true;
          }
          return send({ saveCopy: choice === "send-save" }).then((ok) => ok && false);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab.id, draftId],
  );

  useTabCommands("memo-compose", {
    save: saveDraft,
  });

  const actions: ActionItem[] = [
    { id: "send", label: "Send", icon: "send", run: () => void send() },
    { id: "sendfile", label: "Send and File", icon: "send-file", run: () => void sendAndFile() },
    { id: "draft", label: "Save as Draft", icon: "save", run: saveDraft, accel: "Ctrl+S" },
    "sep",
    { id: "delivery", label: "Delivery Options...", icon: "delivery-options", run: () => void openDelivery() },
    { id: "address", label: "Address...", icon: "address", run: () => void openAddress() },
    "sep",
    { id: "attach", label: "Attach...", icon: "attach", run: () => fileRef.current?.click() },
  ];

  const moodIcon = MOOD_ICON[model.mood];
  return (
    <div className="app memo-window">
      <ActionBar actions={actions} />
      <div className="memo-compose">
        <div className="memo-form-head">
          <div className="memo-form-title">
            <span>Memo</span>
            {moodIcon && (
              <span className="mh-mood-inline">
                <Icon name={moodIcon} /> {moodLabel(model.mood)}
              </span>
            )}
          </div>
          <AddressField label="To:" value={model.to} onChange={(v) => set({ to: v })} autoFocus={!model.to} />
          <AddressField label="cc:" value={model.cc} onChange={(v) => set({ cc: v })} />
          <AddressField label="bcc:" value={model.bcc} onChange={(v) => set({ bcc: v })} />
          <div className="cf-row">
            <label className="cf-label">Subject:</label>
            <span className="nf-field">
              <input
                type="text"
                className="cf-input"
                value={model.subject}
                autoFocus={!!model.to && !model.subject}
                onChange={(e) => set({ subject: e.target.value })}
              />
            </span>
          </div>
          <div className="memo-delivery-line">
            {model.priority === "high" && (
              <span>
                <Icon name="importance" /> High importance
              </span>
            )}
            {model.priority === "low" && <span>Low importance</span>}
            {model.returnReceipt && <span>Return receipt requested</span>}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length) void readFiles(files).then((added) => set({ attachments: [...modelRef.current.attachments, ...added] }));
            e.target.value = "";
          }}
        />
        {model.attachments.length > 0 && (
          <div className="memo-attachments">
            {model.attachments.map((a, i) => (
              <span key={i} className="attach-chip">
                <Icon name="attachment" />
                <span className="attach-name">{a.name}</span>
                <span className="attach-size">{fmtBytes(a.size)}</span>
                <span
                  className="attach-x"
                  title="Remove attachment"
                  onClick={() => set({ attachments: model.attachments.filter((_, j) => j !== i) })}
                >
                  ✕
                </span>
              </span>
            ))}
          </div>
        )}
        <RichTextEditor
          className="memo-editor"
          html={initial.bodyHtml}
          placeholder=""
          onChange={(html) => set({ bodyHtml: html })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

export function MemoDocument() {
  const { tab, active } = useTab();
  const id = tab.doc?.id ?? "";
  const doc = useNotes((s) => (tab.isNew ? undefined : s.mail.find((m) => m.id === id)));
  const markRead = useNotes((s) => s.markRead);
  const deleteMail = useNotes((s) => s.deleteMail);
  const setTabTitle = useUI((s) => s.setTabTitle);
  const [editing, setEditing] = useState<boolean>(!!tab.isNew || doc?.folder === "drafts");

  // Opening a memo marks it read, as Notes does.
  useEffect(() => {
    if (active && doc && !doc.read) markRead(doc.id, true);
  }, [active, doc, markRead]);

  useEffect(() => {
    if (doc && !editing) setTabTitle(tab.id, doc.subject || "(No subject)");
  }, [doc, editing, tab.id, setTabTitle]);

  useTabCommands("memo", {
    properties: doc ? () => void openDocumentProperties("mail", doc.id) : undefined,
    copyAsLink: doc ? () => copyDocLink(doc) : undefined,
    toggleEdit: () => {
      if (doc?.folder === "drafts" || tab.isNew) setEditing((e) => !e);
      else useUI.getState().setStatus("Received and sent memos are read-only. Use Forward or Copy Into New to reuse the text.");
    },
  });

  if (tab.isNew) {
    const init = { ...emptyCompose(), ...(tab.init as Partial<ComposeModel> | undefined) };
    return <MemoCompose initial={init} draftId={null} />;
  }
  if (!doc) {
    return (
      <div className="app">
        <div className="view-empty">Document has been deleted.</div>
      </div>
    );
  }
  if (editing) return <MemoCompose initial={composeFrom(doc)} draftId={doc.id} />;

  const actions: ActionItem[] = [
    ...(doc.folder === "drafts" ? [{ id: "edit", label: "Edit", icon: "edit" as const, run: () => setEditing(true) }, "sep" as const] : []),
    ...replyActions(doc),
    "sep",
    followUpAction([doc.id]),
    copyIntoAction(doc),
    { id: "folder", label: "Folder", icon: "move-to-folder", run: () => void fileInFolder([doc.id]) },
    "sep",
    {
      id: "delete",
      label: "Delete",
      icon: "trash",
      run: () => {
        const trashed = doc.folder === "trash";
        deleteMail(doc.id);
        useUI.getState().setStatus(trashed ? "Document deleted." : "Moved to Trash.");
        useUI.getState().closeTab(tab.id);
      },
    },
    ...(doc.failure ? ["sep" as const, { id: "resend", label: "Resend", icon: "send" as const, run: () => resend(doc) }] : []),
    ...noticeActions(doc),
  ];

  return (
    <div className="app memo-window">
      <ActionBar actions={actions} />
      <div className="memo-scroll">
        <MemoReader m={doc} />
      </div>
    </div>
  );
}
