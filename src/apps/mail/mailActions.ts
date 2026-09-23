// ============================================================================
// Mail actions shared by the Inbox view, the preview pane and memo windows:
// the reply family, forward, follow-up flags, folders, Copy Into, DocLinks,
// meeting responses and Resend.
// ============================================================================

import type { FlagColor, MailMessage } from "../../data/types";
import { useNotes } from "../../data/store";
import { useUI } from "../../data/ui";
import { parseAddress } from "../../data/names";
import { notesAlert, notesPrompt } from "../../components/dialogs";
import type { ActionItem } from "../../components/ActionBar";
import { copyDocumentLink } from "../../components/RichText";
import { composeFrom, forwardOf, replyTo } from "./mailHelpers";
import type { ComposeModel, ReplyMode } from "./mailHelpers";
import { moveToFolderDialog, proposeTimeDialog } from "./mailDialogs";

const ui = () => useUI.getState();
const notes = () => useNotes.getState();
const me = () => ({ name: notes().user.name, email: notes().user.email });

export function openCompose(init: Partial<ComposeModel>, title = "New Memo") {
  ui().newDocument("mail", init as Record<string, unknown>, { title });
}

export function reply(m: MailMessage, all: boolean, mode: ReplyMode) {
  const c = replyTo(m, me(), { all, mode });
  openCompose(c, c.subject);
}

export function forward(m: MailMessage) {
  const c = forwardOf(m, notes().user);
  openCompose(c, c.subject);
}

/** The Reply / Reply to All dropdowns, as Notes 6+ offered them. */
export function replyActions(m: MailMessage | null): ActionItem[] {
  const off = !m;
  const menu = (all: boolean): ActionItem[] => [
    { id: `r${all}p`, label: all ? "Reply to All" : "Reply", run: () => m && reply(m, all, "plain") },
    { id: `r${all}h`, label: all ? "Reply to All with History" : "Reply with History", run: () => m && reply(m, all, "history") },
    {
      id: `r${all}n`,
      label: all ? "Reply to All without Attachments" : "Reply without Attachments",
      run: () => m && reply(m, all, "noattach"),
    },
  ];
  return [
    { id: "reply", label: "Reply", icon: "reply", disabled: off, children: menu(false) },
    { id: "replyall", label: "Reply to All", icon: "reply-all", disabled: off, children: menu(true) },
    { id: "forward", label: "Forward", icon: "forward-mail", disabled: off, run: () => m && forward(m) },
  ];
}

const FLAG_COLORS: FlagColor[] = ["red", "orange", "yellow", "green", "blue", "purple"];

export function followUp(ids: string[], color: FlagColor | null) {
  if (!ids.length) return;
  notes().updateMailMany(ids, color ? { flagged: true, flagColor: color } : { flagged: false, flagColor: undefined });
  ui().setStatus(color ? `Flagged for follow up (${color}).` : "Follow up flag cleared.");
}

export function followUpAction(ids: string[]): ActionItem {
  return {
    id: "followup",
    label: "Follow Up",
    icon: "follow-up",
    disabled: !ids.length,
    children: [
      ...FLAG_COLORS.map((c) => ({ id: "f-" + c, label: c[0].toUpperCase() + c.slice(1), run: () => followUp(ids, c) })),
      "sep",
      { id: "f-clear", label: "Clear Follow Up", run: () => followUp(ids, null) },
    ],
  };
}

export async function fileInFolder(ids: string[]) {
  if (!ids.length) return;
  const folderId = await moveToFolderDialog();
  if (!folderId) return;
  for (const id of ids) notes().setMailFolderLabel(id, folderId, true);
  const name = notes().customFolders.find((f) => f.id === folderId)?.name ?? "folder";
  ui().setStatus(`${ids.length} document${ids.length === 1 ? "" : "s"} moved to folder "${name}".`);
}

export function removeFromFolder(ids: string[], folderId: string) {
  for (const id of ids) notes().setMailFolderLabel(id, folderId, false);
  ui().setStatus(`Removed from folder.`);
}

export function copyInto(m: MailMessage, target: "calendar" | "todo" | "memo") {
  if (target === "calendar") ui().copyToCalendar({ subject: m.subject, description: m.body });
  else if (target === "todo") ui().copyToTodo({ subject: m.subject, description: m.body });
  else openCompose({ ...composeFrom(m), to: "", cc: "", bcc: "", inReplyTo: undefined }, m.subject);
}

export function copyIntoAction(m: MailMessage | null): ActionItem {
  return {
    id: "copyinto",
    label: "Copy Into New",
    icon: "copy-into",
    disabled: !m,
    children: [
      { id: "ci-memo", label: "Memo", run: () => m && copyInto(m, "memo") },
      { id: "ci-cal", label: "Calendar Entry", run: () => m && copyInto(m, "calendar") },
      { id: "ci-todo", label: "To Do", run: () => m && copyInto(m, "todo") },
    ],
  };
}

/** Edit > Copy as Link > Document Link. */
export function copyDocLink(m: MailMessage) {
  copyDocumentLink({ coll: "mail", id: m.id, title: m.subject || "(No subject)" });
}

// ---------------------------------------------------------------------------
// Meeting notices
// ---------------------------------------------------------------------------

export async function respond(m: MailMessage, action: "accept" | "tentative" | "decline" | "delegate" | "counter" | "remove") {
  const n = m.notice;
  if (!n) return;
  if (action === "delegate") {
    const name = await notesPrompt("Delegate this meeting to:", { title: "Delegate" });
    if (!name) return;
    const who = parseAddress(name, notes().contacts, notes().contactGroups);
    if (!who || !who.email) {
      await notesAlert(`${name} is not listed in the Domino Directory.`, { icon: "warning" });
      return;
    }
    notes().respondToInvitation(m.id, "delegate", { delegate: { name: who.name, email: who.email } });
    ui().setStatus(`Delegated to ${who.name}.`);
    return;
  }
  if (action === "counter") {
    const t = await proposeTimeDialog(n.start, n.end);
    if (!t) return;
    notes().respondToInvitation(m.id, "counter", { proposedStart: t.start, proposedEnd: t.end, comment: t.comment });
    ui().setStatus("New time proposed to the chair.");
    return;
  }
  notes().respondToInvitation(m.id, action);
  const msg: Record<string, string> = {
    accept: "Accepted. The meeting is on your calendar.",
    tentative: "Tentatively accepted. The meeting is on your calendar.",
    decline: "Declined.",
    remove: "Removed from your calendar.",
  };
  ui().setStatus(msg[action]);
}

export function noticeActions(m: MailMessage | null): ActionItem[] {
  const n = m?.notice;
  if (!m || !n) return [];
  if (n.type === "invitation") {
    return [
      "sep",
      { id: "n-acc", label: "Accept", icon: "accept", disabled: n.response === "accepted", run: () => void respond(m, "accept") },
      { id: "n-dec", label: "Decline", icon: "decline", disabled: n.response === "declined", run: () => void respond(m, "decline") },
      {
        id: "n-resp",
        label: "Respond",
        icon: "invitation",
        children: [
          { id: "n-ten", label: "Tentatively Accept", run: () => void respond(m, "tentative") },
          { id: "n-del", label: "Delegate...", run: () => void respond(m, "delegate") },
          { id: "n-ctr", label: "Propose New Time...", run: () => void respond(m, "counter") },
        ],
      },
    ];
  }
  if (n.type === "rescheduled") {
    return [
      "sep",
      { id: "n-acc", label: "Accept New Time", icon: "accept", run: () => void respond(m, "accept") },
      { id: "n-dec", label: "Decline", icon: "decline", run: () => void respond(m, "decline") },
    ];
  }
  if (n.type === "cancelled") {
    return ["sep", { id: "n-rm", label: "Remove from Calendar", icon: "trash", run: () => void respond(m, "remove") }];
  }
  return [
    "sep",
    {
      id: "n-view",
      label: "View Meeting",
      icon: "calendar",
      run: () => ui().openDocument({ coll: "calendar", id: n.entryId }, { title: n.subject }),
    },
  ];
}

/** Resend the memo a Delivery Failure Report is about. */
export function resend(dfr: MailMessage) {
  const original = notes().mail.find((m) => m.id === dfr.inReplyTo);
  if (original) openCompose(composeFrom({ ...original, inReplyTo: undefined }), original.subject);
  else openCompose({ subject: dfr.failure?.originalSubject ?? "", to: dfr.failure?.recipient ?? "" });
}
