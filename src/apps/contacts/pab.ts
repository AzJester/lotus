// ============================================================================
// Personal Address Book helpers shared by the Contacts views, the contact
// document window and the tests: names the way the views list them ("Last,
// First"), the A-Z index, categories ("A\B" makes a subcategory, commas
// separate several), memo addresses, group members, search, validation and
// the text Copy Into New puts in a memo. Pure functions, no store access.
// ============================================================================

import type { Contact, ContactGroup } from "../../data/types";
import { findPersonByEmail, ORG } from "../../data/directory";

/** The fields a contact document holds, in form order. */
export const CONTACT_FIELDS = [
  "firstName",
  "lastName",
  "title",
  "company",
  "email",
  "workPhone",
  "cellPhone",
  "address",
  "city",
  "state",
  "zip",
  "country",
  "category",
  "comments",
] as const;

export type ContactField = (typeof CONTACT_FIELDS)[number];
export type ContactFields = Pick<Contact, ContactField>;

/** The letters of the A-Z index beside the Contacts view. */
export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function emptyContact(id = ""): Contact {
  return {
    id,
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
  };
}

/** A new contact from the values another window hands over (tab.init). */
export function contactFromInit(init: Record<string, unknown>, id: string): Contact {
  const c = emptyContact(id);
  for (const f of CONTACT_FIELDS) {
    const v = init[f];
    if (typeof v === "string") c[f] = v;
  }
  return c;
}

/** Just the form fields, tidied the way a save stores them. */
export function contactPatch(c: Contact): ContactFields {
  const out = {} as ContactFields;
  for (const f of CONTACT_FIELDS) {
    const v = c[f] ?? "";
    out[f] = f === "comments" || f === "address" ? v.replace(/\s+$/, "") : v.trim().replace(/\s+/g, " ");
  }
  out.category = categoriesOf(c).join(", ");
  return out;
}

export const fullName = (c: Pick<Contact, "firstName" | "lastName">): string =>
  `${c.firstName.trim()} ${c.lastName.trim()}`.trim();

/** "Whitfield, Diane", as the Name column of the Contacts view shows it. */
export function lastFirst(c: Pick<Contact, "firstName" | "lastName">): string {
  const first = c.firstName.trim();
  const last = c.lastName.trim();
  return last && first ? `${last}, ${first}` : last || first;
}

/** Name for window titles and messages: the full name, else the e-mail address. */
export function displayName(c: Contact): string {
  return fullName(c) || c.email.trim() || c.company.trim() || "(Untitled)";
}

/** The Name column text: "Last, First", falling back to the e-mail address. */
export function viewName(c: Contact): string {
  return lastFirst(c) || c.email.trim() || c.company.trim() || "(Untitled)";
}

/** Compare contacts by last name, then first name (the view order). */
export function compareContacts(a: Contact, b: Contact): number {
  return viewName(a).localeCompare(viewName(b), undefined, { sensitivity: "base", numeric: true });
}

/** The A-Z index letter a contact is filed under ("#" for digits and symbols). */
export function indexLetter(c: Contact): string {
  const ch = viewName(c)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .charAt(0)
    .toUpperCase();
  return ch >= "A" && ch <= "Z" ? ch : "#";
}

/** Where the A-Z index goes for a letter: its first contact, else the next letter that has one. */
export function jumpTarget(letter: string, contacts: Contact[]): Contact | undefined {
  if (!contacts.length) return undefined;
  const sorted = [...contacts].sort(compareContacts);
  const want = letter.toUpperCase();
  return (
    sorted.find((c) => indexLetter(c) === want) ??
    sorted.find((c) => indexLetter(c) !== "#" && indexLetter(c) > want) ??
    sorted[sorted.length - 1]
  );
}

/**
 * The categories a contact is filed under. Several are separated by commas
 * or semicolons; "Clients\West" is the subcategory West of Clients.
 */
export function categoriesOf(c: Pick<Contact, "category">): string[] {
  const out: string[] = [];
  for (const raw of (c.category ?? "").split(/[,;]/)) {
    const cat = raw
      .split("\\")
      .map((part) => part.trim())
      .filter(Boolean)
      .join("\\");
    if (cat && !out.some((o) => o.toLowerCase() === cat.toLowerCase())) out.push(cat);
  }
  return out;
}

/** Every category in use, sorted (for the category field's suggestions). */
export function allCategories(contacts: Contact[]): string[] {
  const seen = new Map<string, string>();
  for (const c of contacts) for (const cat of categoriesOf(c)) if (!seen.has(cat.toLowerCase())) seen.set(cat.toLowerCase(), cat);
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** An Acme colleague listed in the Domino Directory (has Sametime presence). */
export function colleagueOf(c: Contact) {
  return c.email.trim() ? findPersonByEmail(c.email) : undefined;
}

/**
 * How the To field of a memo addresses a contact: colleagues by their Notes
 * name ("Diane Whitfield/Acme"), others by name and internet address.
 */
export function memoAddress(c: Contact): string {
  const email = c.email.trim();
  const name = fullName(c);
  const colleague = colleagueOf(c);
  if (colleague) return `${colleague.name}/${ORG}`;
  if (email) return name ? `${name} <${email}>` : email;
  return name;
}

/** The name a chat window uses for a contact. */
export function chatName(c: Contact): string {
  return colleagueOf(c)?.name ?? (fullName(c) || c.email.trim());
}

/** A group's members in list order (contacts that no longer exist are skipped). */
export function groupMembers(g: ContactGroup, contacts: Contact[]): Contact[] {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  return g.memberIds.map((id) => byId.get(id)).filter((c): c is Contact => !!c);
}

/** Contacts that belong to any of the groups, each once, in view order. */
export function membersOfGroups(groups: ContactGroup[], contacts: Contact[]): Contact[] {
  const ids = new Set(groups.flatMap((g) => g.memberIds));
  return contacts.filter((c) => ids.has(c.id)).sort(compareContacts);
}

/** Search bar matching: names, e-mail, company, title, phones, category, city. */
export function matchesQuery(c: Contact, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [
    c.firstName,
    c.lastName,
    c.email,
    c.company,
    c.title,
    c.workPhone,
    c.cellPhone,
    c.category,
    c.city,
    c.state,
    c.country,
  ]
    .join(" ")
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** "Riverton, OH 44012" */
export function cityLine(c: Pick<Contact, "city" | "state" | "zip">): string {
  const cityState = [c.city.trim(), c.state.trim()].filter(Boolean).join(", ");
  return [cityState, c.zip.trim()].filter(Boolean).join(" ");
}

/** The business address as lines (street lines, city line, country). */
export function addressLines(c: Contact): string[] {
  return [...c.address.split("\n"), cityLine(c), c.country]
    .map((l) => l.trim())
    .filter(Boolean);
}

/** A save needs a last name or an e-mail address, as the Contact form requires. */
export function contactProblem(c: Contact): string | null {
  if (!c.lastName.trim() && !c.email.trim()) return "You must enter a Last name or an E-mail address for this contact.";
  return null;
}

/** A group needs a name no other group in the Address Book uses. */
export function groupNameProblem(name: string, groups: ContactGroup[], selfId?: string): string | null {
  const n = name.trim();
  if (!n) return "You must enter a Group name.";
  if (n.includes(",") || n.includes(";")) return "A Group name cannot contain commas or semicolons.";
  if (groups.some((g) => g.id !== selfId && g.name.trim().toLowerCase() === n.toLowerCase()))
    return `A group named "${n}" already exists in your Address Book.`;
  return null;
}

/**
 * Import with Update: the imported values that differ from the stored
 * contact (empty imported fields never erase what is there).
 */
export function mergeImported(existing: Contact, imported: Contact): Partial<ContactFields> {
  const patch: Partial<ContactFields> = {};
  for (const f of CONTACT_FIELDS) {
    const v = imported[f].trim() ? imported[f] : "";
    if (v && v !== existing[f]) patch[f] = v;
  }
  return patch;
}

/** The lines Copy Into New writes for a contact (memo body, calendar and to do descriptions). */
export function contactSummary(c: Contact): string[] {
  const head = [displayName(c), c.title.trim(), c.company.trim()].filter(Boolean);
  const reach = [
    c.workPhone.trim() && `Business phone: ${c.workPhone.trim()}`,
    c.cellPhone.trim() && `Cell phone: ${c.cellPhone.trim()}`,
    c.email.trim() && `E-mail: ${c.email.trim()}`,
  ].filter((l): l is string => !!l);
  const blocks = [head, reach, addressLines(c)].filter((b) => b.length);
  // A blank line between the blocks.
  return blocks.flatMap((b, i) => (i ? ["", ...b] : b));
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Memo body HTML for Copy Into New Memo: one block per contact. */
export function contactsHtml(list: Contact[]): string {
  return list
    .map((c) => {
      const [name, ...rest] = contactSummary(c);
      return `<p><b>${escapeHtml(name)}</b>${rest.map((l) => "<br>" + (l ? escapeHtml(l) : "")).join("")}</p>`;
    })
    .join("");
}

/** A name made safe for a file: "Whitfield, Diane" becomes "Whitfield_Diane". */
export function safeFileName(name: string): string {
  return name
    .replace(/,\s*/g, "_")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** A file name for an export: "Whitfield_Diane.vcf" for one contact, else "contacts.vcf". */
export function vcfFileName(list: Contact[]): string {
  if (list.length !== 1) return "contacts.vcf";
  return `${safeFileName(viewName(list[0])) || "contact"}.vcf`;
}

/** "1 document" / "3 documents" */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
