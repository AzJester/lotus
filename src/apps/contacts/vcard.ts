// ============================================================================
// vCard 3.0 (RFC 2426) import and export for the Personal Address Book, as
// Tools > Import vCard... and Export vCard... use it. Export writes one card
// per contact with escaped values and lines folded at 75 octets. Import reads
// 3.0 and 2.1 cards: folded lines, quoted-printable values, grouped
// properties ("item1.EMAIL"), TYPE parameters in either style, and escaped
// separators inside structured values (N, ADR, ORG, CATEGORIES).
// ============================================================================

import type { Contact } from "../../data/types";
import { CONTACT_FIELDS, categoriesOf, emptyContact, fullName } from "./pab";

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/** Escape a text value (RFC 2426 section 5): backslash, newline, comma, semicolon. */
export function escapeValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Undo escapeValue. "\n" and "\N" become newlines; other escapes keep the character. */
export function unescapeValue(value: string): string {
  return value.replace(/\\(.)/g, (_m, ch: string) => (ch === "n" || ch === "N" ? "\n" : ch));
}

/** Split a structured value on unescaped separators, then unescape each part. */
export function splitValue(value: string, sep: ";" | ","): string[] {
  const parts: string[] = [];
  let cur = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\" && i + 1 < value.length) {
      cur += ch + value[i + 1];
      i++;
    } else if (ch === sep) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map(unescapeValue);
}

const utf8Length = (cp: string): number => {
  const n = cp.codePointAt(0) ?? 0;
  return n < 0x80 ? 1 : n < 0x800 ? 2 : n < 0x10000 ? 3 : 4;
};

/** Fold a content line at 75 octets; continuation lines start with a space. */
export function foldLine(line: string, limit = 75): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const cp of line) {
    const len = utf8Length(cp);
    // A continuation line's leading space counts toward its limit.
    const max = out.length ? limit - 1 : limit;
    if (bytes + len > max && cur) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += cp;
    bytes += len;
  }
  out.push(cur);
  return out.join("\r\n ");
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const revStamp = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** One contact as a vCard 3.0 card (CRLF line breaks, no trailing break). */
export function toVCard(c: Contact): string {
  const v = (s: string) => escapeValue(s.trim());
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  lines.push(`N:${v(c.lastName)};${v(c.firstName)};;;`);
  lines.push(`FN:${v(fullName(c) || c.email || c.company || "(Untitled)")}`);
  if (c.company.trim()) lines.push(`ORG:${v(c.company)}`);
  if (c.title.trim()) lines.push(`TITLE:${v(c.title)}`);
  if (c.email.trim()) lines.push(`EMAIL;TYPE=INTERNET,PREF:${v(c.email)}`);
  if (c.workPhone.trim()) lines.push(`TEL;TYPE=WORK,VOICE:${v(c.workPhone)}`);
  if (c.cellPhone.trim()) lines.push(`TEL;TYPE=CELL,VOICE:${v(c.cellPhone)}`);
  const adr = [c.address, c.city, c.state, c.zip, c.country];
  // ADR: post office box; extended address; street; city; region; postal code; country
  if (adr.some((x) => x.trim())) lines.push(`ADR;TYPE=WORK:;;${adr.map(v).join(";")}`);
  if (c.comments.trim()) lines.push(`NOTE:${v(c.comments)}`);
  const cats = categoriesOf(c);
  if (cats.length) lines.push(`CATEGORIES:${cats.map(v).join(",")}`);
  if (c.id) lines.push(`UID:${v(c.id)}`);
  if (c.modified) lines.push(`REV:${revStamp(c.modified)}`);
  lines.push("END:VCARD");
  return lines.map((l) => foldLine(l)).join("\r\n");
}

/** Several contacts as one .vcf file. */
export function toVCardFile(list: Contact[]): string {
  return list.length ? list.map(toVCard).join("\r\n") + "\r\n" : "";
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

interface Prop {
  /** Upper case, group prefix ("item1.") removed. */
  name: string;
  /** TYPE values and bare vCard 2.1 parameters, upper case. */
  types: Set<string>;
  /** The value, still escaped, decoded from quoted-printable. */
  value: string;
}

/** Split "NAME;PARAM=x:value" at the first colon outside double quotes. */
function splitLine(line: string): { head: string; value: string } | null {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ":" && !quoted) return { head: line.slice(0, i), value: line.slice(i + 1) };
  }
  return null;
}

/** Split the property head on semicolons outside double quotes. */
function splitHead(head: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of head) {
    if (ch === '"') quoted = !quoted;
    if (ch === ";" && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const isQuotedPrintable = (line: string) => /QUOTED-PRINTABLE/i.test(splitLine(line)?.head ?? "");

/** Decode a quoted-printable value (soft line breaks were joined already). */
export function decodeQuotedPrintable(value: string, charset = "utf-8"): string {
  const bytes: number[] = [];
  const enc = new TextEncoder();
  for (let i = 0; i < value.length; i++) {
    const hex = value.slice(i + 1, i + 3);
    if (value[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else bytes.push(...enc.encode(value[i]));
  }
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset || "utf-8");
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  return decoder.decode(new Uint8Array(bytes));
}

/** Physical lines joined back into logical lines (unfolding and QP soft breaks). */
function logicalLines(text: string): string[] {
  const out: string[] = [];
  for (const line of text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n")) {
    const last = out.length - 1;
    if (last >= 0 && out[last].endsWith("=") && isQuotedPrintable(out[last])) {
      out[last] = out[last].slice(0, -1) + line;
    } else if (last >= 0 && (line.startsWith(" ") || line.startsWith("\t"))) {
      out[last] += line.slice(1);
    } else out.push(line);
  }
  return out;
}

function parseProp(line: string): Prop | null {
  const parts = splitLine(line);
  if (!parts) return null;
  const [rawName, ...params] = splitHead(parts.head);
  const name = rawName.trim().toUpperCase().replace(/^.*\./, "");
  const types = new Set<string>();
  let encoding = "";
  let charset = "";
  for (const p of params) {
    const eq = p.indexOf("=");
    const key = eq < 0 ? "" : p.slice(0, eq).trim().toUpperCase();
    const raw = (eq < 0 ? p : p.slice(eq + 1)).replace(/"/g, "").trim();
    const values = raw
      .split(",")
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean);
    const bareEncoding = !key && ["QUOTED-PRINTABLE", "BASE64", "B", "8BIT", "7BIT"].includes(values[0] ?? "");
    if (key === "ENCODING" || bareEncoding) encoding = values[0] ?? "";
    else if (key === "CHARSET") charset = raw;
    else if (key === "TYPE" || !key) values.forEach((t) => types.add(t));
    else if (key === "PREF") types.add("PREF");
  }
  // Binary values (photos, logos, keys) are not kept.
  if (encoding === "B" || encoding === "BASE64") return { name, types, value: "" };
  const value = encoding === "QUOTED-PRINTABLE" ? decodeQuotedPrintable(parts.value, charset) : parts.value;
  return { name, types, value };
}

type PhoneSlot = "work" | "plain" | "home" | "cell";

interface Draft {
  c: Contact;
  fn: string;
  email: { value: string; pref: boolean } | null;
  phones: Partial<Record<PhoneSlot, { value: string; pref: boolean }>>;
  adr: { parts: string[]; rank: number } | null;
  cats: string[];
  notes: string[];
}

const newDraft = (): Draft => ({ c: emptyContact(), fn: "", email: null, phones: {}, adr: null, cats: [], notes: [] });

function apply(d: Draft, p: Prop) {
  const text = () => unescapeValue(p.value).trim();
  const pref = p.types.has("PREF");
  switch (p.name) {
    case "N": {
      const [family = "", given = "", additional = ""] = splitValue(p.value, ";");
      d.c.lastName = family.trim();
      d.c.firstName = [given.trim(), additional.trim()].filter(Boolean).join(" ");
      break;
    }
    case "FN":
      d.fn = text();
      break;
    case "ORG":
      d.c.company = (splitValue(p.value, ";")[0] ?? "").trim();
      break;
    case "TITLE":
      d.c.title = text();
      break;
    case "EMAIL": {
      const value = text().replace(/^mailto:/i, "");
      if (value && (!d.email || (pref && !d.email.pref))) d.email = { value, pref };
      break;
    }
    case "TEL": {
      const value = text().replace(/^tel:/i, "");
      const t = p.types;
      if (!value || t.has("FAX") || t.has("PAGER")) break;
      const slot: PhoneSlot = t.has("CELL") || t.has("MOBILE") ? "cell" : t.has("WORK") ? "work" : t.has("HOME") ? "home" : "plain";
      const had = d.phones[slot];
      if (!had || (pref && !had.pref)) d.phones[slot] = { value, pref };
      break;
    }
    case "ADR": {
      // Business addresses win over untyped ones, which win over home addresses.
      const rank = (p.types.has("WORK") ? 3 : p.types.has("HOME") ? 1 : 2) + (pref ? 0.5 : 0);
      if (!d.adr || rank > d.adr.rank) d.adr = { parts: splitValue(p.value, ";"), rank };
      break;
    }
    case "NOTE":
      d.notes.push(unescapeValue(p.value).replace(/\r\n?/g, "\n").replace(/\s+$/, ""));
      break;
    case "CATEGORIES":
      d.cats.push(...splitValue(p.value, ",").map((x) => x.trim()).filter(Boolean));
      break;
  }
}

function finish(d: Draft): Contact | null {
  const c = d.c;
  if (!c.firstName && !c.lastName && d.fn && d.fn !== c.company) {
    const words = d.fn.split(/\s+/);
    c.lastName = words.pop() ?? "";
    c.firstName = words.join(" ");
  }
  c.email = d.email?.value ?? "";
  c.workPhone = (d.phones.work ?? d.phones.plain ?? d.phones.home)?.value ?? "";
  c.cellPhone = d.phones.cell?.value ?? "";
  if (d.adr) {
    const [pobox = "", ext = "", street = "", city = "", region = "", zip = "", country = ""] = d.adr.parts.map((x) => x.trim());
    const streetLines = [street, ext].filter(Boolean);
    if (!streetLines.length && pobox) streetLines.push(`P.O. Box ${pobox}`);
    c.address = streetLines.join("\n");
    c.city = city;
    c.state = region;
    c.zip = zip;
    c.country = country;
  }
  c.comments = d.notes.filter(Boolean).join("\n");
  c.category = categoriesOf({ category: d.cats.join(",") }).join(", ");
  return CONTACT_FIELDS.some((f) => c[f].trim()) ? c : null;
}

/**
 * Read every card in a .vcf file. The contacts come back without ids; the
 * caller assigns them. Cards with nothing we can use are skipped.
 */
export function parseVCards(text: string): Contact[] {
  const out: Contact[] = [];
  let draft: Draft | null = null;
  let depth = 0;
  for (const line of logicalLines(text)) {
    const bare = line.replace(/\s+/g, "").toUpperCase();
    if (bare === "BEGIN:VCARD") {
      depth++;
      if (depth === 1) draft = newDraft();
      continue;
    }
    if (bare === "END:VCARD") {
      if (depth === 1 && draft) {
        const c = finish(draft);
        if (c) out.push(c);
        draft = null;
      }
      depth = Math.max(0, depth - 1);
      continue;
    }
    // Properties of nested cards (AGENT) are ignored.
    if (!draft || depth !== 1 || !line.trim()) continue;
    const p = parseProp(line);
    if (p) apply(draft, p);
  }
  return out;
}
