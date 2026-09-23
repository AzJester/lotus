// ============================================================================
// Address Book actions shared by the Contacts views and contact windows:
// Write Memo and Chat, Copy Into New (a memo with the vCard attached, a
// calendar entry or a to do), Copy as Link, vCard export (a download) and
// vCard import (which asks before touching contacts you already have).
// ============================================================================

import type { Contact, ContactGroup } from "../../data/types";
import { useNotes, uid } from "../../data/store";
import { stampNew } from "../../data/docs";
import { useUI } from "../../data/ui";
import { docLinkHtml } from "../../components/RichText";
import { notesAlert, notesConfirm } from "../../components/dialogs";
import { parseVCards, toVCardFile } from "./vcard";
import {
  chatName,
  contactPatch,
  contactSummary,
  contactsHtml,
  displayName,
  memoAddress,
  mergeImported,
  plural,
  vcfFileName,
} from "./pab";

const ui = () => useUI.getState();
const notes = () => useNotes.getState();

/** Write Memo to one or more contacts. */
export function writeMemoTo(list: Contact[]) {
  const to = list.map(memoAddress).filter(Boolean);
  if (!to.length) {
    ui().setStatus("No contact is selected.");
    return;
  }
  ui().requestMemo(to.join(", "));
}

/** Write Memo to groups: the router expands Address Book groups by name. */
export function writeMemoToGroups(groups: ContactGroup[]) {
  if (groups.length) ui().requestMemo(groups.map((g) => g.name).join(", "));
}

export function chatWith(c: Contact) {
  const name = chatName(c);
  if (name) ui().openChat(name);
}

function utf8DataUrl(text: string, mime: string): { dataUrl: string; size: number } {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return { dataUrl: `data:${mime};base64,${btoa(bin)}`, size: bytes.length };
}

export type CopyTarget = "memo" | "calendar" | "todo";

const subjectFor = (list: Contact[]) => {
  const names = list.map(displayName);
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
};

/** Copy Into New: a memo (the details, with a vCard attached), a calendar entry or a to do. */
export function copyInto(list: Contact[], target: CopyTarget) {
  if (!list.length) return;
  const subject = subjectFor(list);
  const description = list.map((c) => contactSummary(c).join("\n")).join("\n\n");
  if (target === "calendar") ui().copyToCalendar({ subject, description });
  else if (target === "todo") ui().copyToTodo({ subject, description });
  else {
    const file = utf8DataUrl(toVCardFile(list), "text/vcard");
    ui().newDocument(
      "mail",
      {
        subject,
        bodyHtml: contactsHtml(list),
        attachments: [{ name: vcfFileName(list), type: "text/vcard", size: file.size, dataUrl: file.dataUrl }],
      },
      { title: subject },
    );
    ui().setStatus(`${plural(list.length, "contact")} copied into a new memo, with the vCard attached.`);
  }
}

/** Edit > Copy as Link > Document Link. */
export function copyContactLink(c: Contact) {
  const title = displayName(c);
  const link = { coll: "contacts" as const, id: c.id, title };
  ui().setClipboardLink(link);
  try {
    const html = docLinkHtml(link);
    const text = `notes:///names.nsf/0/${c.id}?OpenDocument`;
    if (navigator.clipboard && "write" in navigator.clipboard && typeof ClipboardItem !== "undefined") {
      void navigator.clipboard
        .write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ])
        .catch(() => undefined);
    }
  } catch {
    /* the in-app clipboard still has the link */
  }
  ui().setStatus(`Document link copied: "${title}". Paste it into a memo.`);
}

/** Save text as a file (the browser's download). */
function downloadText(fileName: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export vCard: write the contacts to a .vcf file. */
export function exportContacts(list: Contact[], fileName: string) {
  if (!list.length) {
    ui().setStatus("There are no contacts to export.");
    return;
  }
  const name = /\.vcf$/i.test(fileName.trim()) ? fileName.trim() : `${fileName.trim() || "contacts"}.vcf`;
  downloadText(name, toVCardFile(list), "text/vcard");
  ui().setStatus(`${plural(list.length, "contact")} exported to ${name}.`);
}

/**
 * Import vCard: add the cards in a .vcf file to the Address Book. Contacts
 * whose e-mail address is already listed can update the stored ones instead.
 * Resolves with the ids of the contacts added or updated.
 */
export async function importVCardFile(file: File): Promise<string[]> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    await notesAlert(`Cannot read the file ${file.name}.`, { icon: "error", title: "Import vCard" });
    return [];
  }
  const cards = parseVCards(text);
  if (!cards.length) {
    await notesAlert(`${file.name} does not contain any vCards.`, { icon: "warning", title: "Import vCard" });
    return [];
  }
  const s = notes();
  const byEmail = new Map(s.contacts.filter((c) => c.email.trim()).map((c) => [c.email.trim().toLowerCase(), c]));
  const existing = (c: Contact) => (c.email.trim() ? byEmail.get(c.email.trim().toLowerCase()) : undefined);
  const dups = cards.filter(existing).length;
  let update = false;
  if (dups) {
    const which =
      dups === cards.length ? (dups === 1 ? "The contact" : `All ${dups} contacts`) : `${dups} of the ${cards.length} contacts`;
    const b = await notesConfirm(
      `${which} in ${file.name} ${dups === 1 ? "is" : "are"} already in your Address Book (same e-mail address). ` +
        `Do you want to update ${dups === 1 ? "it" : "them"} with the imported information?`,
      { title: "Import vCard", buttons: ["Update", "Add as New", "Cancel"] },
    );
    if (b === "Cancel") return [];
    update = b === "Update";
  }
  const ids: string[] = [];
  let added = 0;
  let updated = 0;
  for (const card of cards) {
    const match = update ? existing(card) : undefined;
    if (match) {
      const patch = mergeImported(match, card);
      if (Object.keys(patch).length) {
        s.updateContact(match.id, patch);
        updated++;
      }
      ids.push(match.id);
    } else {
      const id = uid();
      s.addContact(stampNew<Contact>({ ...card, ...contactPatch(card), id }, s.user.notesName));
      ids.push(id);
      added++;
    }
  }
  const parts = [added ? `${plural(added, "contact")} imported` : "", updated ? `${updated} updated` : ""].filter(Boolean);
  ui().setStatus(parts.length ? `${parts.join(", ")} from ${file.name}.` : `Your Address Book already had everything in ${file.name}.`);
  return ids;
}
