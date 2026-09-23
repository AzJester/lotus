// ============================================================================
// Notes names and addressing. Acme people are shown with hierarchical names
// ("Diane Whitfield/Acme", "Diane Whitfield/Acme@Acme" in memo headers), the
// way a Notes client displays them; internet correspondents keep their
// internet address. Address fields are parsed against Acme's Directory and
// the Personal Address Book, and unknown Notes names stay unresolved so the
// router can bounce them.
// ============================================================================

import type { Contact, ContactGroup, Person } from "./types";
import {
  DIRECTORY_GROUPS,
  DIRECTORY_PEOPLE,
  DOMAIN,
  INTERNET_DOMAIN,
  ORG,
  findGroup,
  findPerson,
  findPersonByEmail,
} from "./directory";

/** True for Acme people (internal Notes users and mail-in databases). */
export function isInternal(p: Person): boolean {
  if (p.email) return p.email.toLowerCase().endsWith("@" + INTERNET_DOMAIN);
  return true; // a bare Notes name with no internet address
}

/** Abbreviated hierarchical name: "Diane Whitfield/Acme" (or the internet address). */
export function notesName(p: Person): string {
  if (!isInternal(p)) return p.name && p.name !== p.email ? `${p.name} <${p.email}>` : p.email;
  return `${p.name}/${ORG}`;
}

/** How a memo header shows an address: "Diane Whitfield/Acme@Acme". */
export function headerName(p: Person): string {
  if (!isInternal(p)) return p.email || p.name;
  return `${p.name}/${ORG}@${DOMAIN}`;
}

/** Canonical form for the Fields tab: "CN=Diane Whitfield/O=Acme". */
export function canonicalName(p: Person): string {
  if (!isInternal(p)) return p.email;
  return `CN=${p.name}/O=${ORG}`;
}

/** Common name for view columns ("Diane Whitfield", or the internet name). */
export function commonName(p: Person): string {
  return p.name || p.email;
}

/** Names typed into To/cc/bcc, rendered back the Notes way. */
export function formatAddressList(people: Person[]): string {
  return people.map(notesName).join(", ");
}

/** A candidate for type-ahead and the Address dialog. */
export interface AddressCandidate {
  kind: "person" | "group";
  /** What gets typed into the field. */
  display: string;
  /** Sort / match key (the common name). */
  name: string;
  email: string;
  source: "directory" | "pab";
  detail: string;
}

/** Everyone you can address: Acme's Directory plus the Personal Address Book. */
export function addressCandidates(contacts: Contact[], groups: ContactGroup[]): AddressCandidate[] {
  const out: AddressCandidate[] = [];
  for (const p of DIRECTORY_PEOPLE) {
    out.push({
      kind: "person",
      display: `${p.name}/${ORG}`,
      name: p.name,
      email: p.email,
      source: "directory",
      detail: `${p.title}, ${p.dept}`,
    });
  }
  for (const g of DIRECTORY_GROUPS) {
    out.push({ kind: "group", display: g.name, name: g.name, email: "", source: "directory", detail: g.description });
  }
  for (const c of contacts) {
    const name = `${c.firstName} ${c.lastName}`.trim();
    if (!name && !c.email) continue;
    // Acme colleagues already appear from the directory.
    if (c.email && findPersonByEmail(c.email)) continue;
    out.push({
      kind: "person",
      display: c.email ? `${name} <${c.email}>` : name,
      name: name || c.email,
      email: c.email,
      source: "pab",
      detail: [c.title, c.company].filter(Boolean).join(", "),
    });
  }
  for (const g of groups) {
    out.push({ kind: "group", display: g.name, name: g.name, email: "", source: "pab", detail: `${g.memberIds.length} members` });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Inline type-ahead: the first candidate whose name (or display) starts with
 * what was typed, as Notes completes names in address fields.
 */
export function completeName(typed: string, candidates: AddressCandidate[]): AddressCandidate | undefined {
  const t = typed.trim().toLowerCase();
  if (t.length < 1) return undefined;
  return candidates.find(
    (c) => c.display.toLowerCase().startsWith(t) || c.name.toLowerCase().startsWith(t),
  );
}

/** A parsed address token. `unresolved` Notes names bounce at the router. */
export interface ParsedAddress extends Person {
  unresolved?: boolean;
  group?: boolean;
}

const ANGLE = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/;

/** Parse one typed address token. */
export function parseAddress(token: string, contacts: Contact[] = [], groups: ContactGroup[] = []): ParsedAddress | null {
  const raw = token.trim();
  if (!raw) return null;
  const angle = raw.match(ANGLE);
  if (angle) {
    const email = angle[2].trim();
    const known = findPersonByEmail(email);
    return known ? { name: known.name, email: known.email } : { name: angle[1].trim() || email, email };
  }
  // "Name/Acme@Acme", "Name/Acme", "CN=Name/O=Acme"
  const notes = raw
    .replace(/^CN=/i, "")
    .replace(/\/O=/i, "/")
    .replace(new RegExp(`@${DOMAIN}$`, "i"), "");
  if (notes.includes("/")) {
    const cn = notes.split("/")[0].trim();
    const person = findPerson(cn);
    return person ? { name: person.name, email: person.email } : { name: cn, email: "", unresolved: true };
  }
  if (raw.includes("@")) {
    const known = findPersonByEmail(raw);
    if (known) return { name: known.name, email: known.email };
    const local = raw.split("@")[0];
    const pab = contacts.find((c) => c.email.toLowerCase() === raw.toLowerCase());
    const name = pab
      ? `${pab.firstName} ${pab.lastName}`.trim()
      : local.replace(/[._]/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
    return { name, email: raw };
  }
  // A bare common name: directory person, directory group, PAB contact, PAB group.
  const person = findPerson(raw);
  if (person) return { name: person.name, email: person.email };
  const dgroup = findGroup(raw);
  if (dgroup) return { name: dgroup.name, email: "", group: true };
  const pgroup = groups.find((g) => g.name.toLowerCase() === raw.toLowerCase());
  if (pgroup) return { name: pgroup.name, email: "", group: true };
  const contact = contacts.find(
    (c) => `${c.firstName} ${c.lastName}`.trim().toLowerCase() === raw.toLowerCase(),
  );
  if (contact && contact.email) return { name: `${contact.firstName} ${contact.lastName}`.trim(), email: contact.email };
  return { name: raw, email: "", unresolved: true };
}

/** Parse a comma/semicolon separated address field. */
export function parseAddressList(raw: string, contacts: Contact[] = [], groups: ContactGroup[] = []): ParsedAddress[] {
  // Split on commas/semicolons that are not inside <...>.
  const tokens: string[] = [];
  let cur = "";
  let depth = 0;
  for (const ch of raw) {
    if (ch === "<") depth++;
    if (ch === ">") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";") && depth === 0) {
      tokens.push(cur);
      cur = "";
    } else cur += ch;
  }
  tokens.push(cur);
  return tokens
    .map((t) => parseAddress(t, contacts, groups))
    .filter((p): p is ParsedAddress => p !== null);
}

/** The user's own Person record from a profile. */
export function selfPerson(user: { name: string; email: string }): Person {
  return { name: user.name, email: user.email };
}
