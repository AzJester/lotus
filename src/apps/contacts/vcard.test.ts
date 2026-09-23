import { describe, expect, it } from "vitest";
import {
  decodeQuotedPrintable,
  escapeValue,
  foldLine,
  parseVCards,
  splitValue,
  toVCard,
  toVCardFile,
  unescapeValue,
} from "./vcard";
import { CONTACT_FIELDS, emptyContact } from "./pab";
import type { Contact } from "../../data/types";

const diane: Contact = {
  ...emptyContact("ct-1"),
  firstName: "Diane",
  lastName: "Whitfield",
  email: "diane.whitfield@acme.example.com",
  company: "Acme Corporation",
  title: "VP, Operations",
  workPhone: "(555) 010-2201",
  cellPhone: "(555) 248-1190",
  address: "100 Industrial Pkwy",
  city: "Riverton",
  state: "OH",
  zip: "44012",
  country: "USA",
  category: "Management",
  comments: "Prefers morning meetings.\nCall before 10.",
};

const marcus: Contact = {
  ...emptyContact("ct-4"),
  firstName: "Marcus",
  lastName: "Bell",
  email: "marcus.bell@northwind.example.com",
  company: "Northwind; Traders",
  category: "Client\\West, Partner",
};

const fields = (c: Contact) => Object.fromEntries(CONTACT_FIELDS.map((f) => [f, c[f]]));

describe("vCard values", () => {
  it("escapes and unescapes backslashes, newlines, commas and semicolons", () => {
    const raw = "a\\b, c; d\ne";
    expect(escapeValue(raw)).toBe("a\\\\b\\, c\\; d\\ne");
    expect(unescapeValue(escapeValue(raw))).toBe(raw);
    expect(unescapeValue("Line one\\NLine two")).toBe("Line one\nLine two");
  });

  it("splits structured values only on unescaped separators", () => {
    expect(splitValue("O\\;Brien;Kevin;;;", ";")).toEqual(["O;Brien", "Kevin", "", "", ""]);
    expect(splitValue("Clients\\\\West,Partner\\, Europe", ",")).toEqual(["Clients\\West", "Partner, Europe"]);
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const line = "NOTE:" + "Zürich café ☕ ".repeat(12);
    const folded = foldLine(line);
    const physical = folded.split("\r\n");
    expect(physical.length).toBeGreaterThan(1);
    for (const p of physical) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    for (const p of physical.slice(1)) expect(p.startsWith(" ")).toBe(true);
    expect(physical.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
    expect(foldLine("FN:Short")).toBe("FN:Short");
  });

  it("decodes quoted-printable UTF-8", () => {
    expect(decodeQuotedPrintable("Caf=C3=A9 =3D ok")).toBe("Café = ok");
  });
});

describe("vCard export", () => {
  it("writes a 3.0 card with the contact's fields", () => {
    const card = toVCard(diane);
    const lines = card.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCARD");
    expect(lines[1]).toBe("VERSION:3.0");
    expect(lines).toContain("N:Whitfield;Diane;;;");
    expect(lines).toContain("FN:Diane Whitfield");
    expect(lines).toContain("ORG:Acme Corporation");
    expect(lines).toContain("TITLE:VP\\, Operations");
    expect(lines).toContain("EMAIL;TYPE=INTERNET,PREF:diane.whitfield@acme.example.com");
    expect(lines).toContain("TEL;TYPE=WORK,VOICE:(555) 010-2201");
    expect(lines).toContain("TEL;TYPE=CELL,VOICE:(555) 248-1190");
    expect(lines).toContain("ADR;TYPE=WORK:;;100 Industrial Pkwy;Riverton;OH;44012;USA");
    expect(lines).toContain("NOTE:Prefers morning meetings.\\nCall before 10.");
    expect(lines).toContain("CATEGORIES:Management");
    expect(lines).toContain("UID:ct-1");
    expect(lines[lines.length - 1]).toBe("END:VCARD");
  });

  it("leaves out empty fields and escapes structured parts", () => {
    const card = toVCard(marcus);
    expect(card).not.toContain("TEL");
    expect(card).not.toContain("ADR");
    expect(card).not.toContain("NOTE");
    expect(card).toContain("ORG:Northwind\\; Traders");
    expect(card).toContain("CATEGORIES:Client\\\\West,Partner");
  });

  it("stamps REV from the modified time", () => {
    expect(toVCard({ ...marcus, modified: Date.UTC(2026, 8, 23, 14, 5, 0) })).toContain("REV:2026-09-23T14:05:00Z");
  });

  it("gives an FN to a card without a name", () => {
    expect(toVCard({ ...emptyContact(), email: "info@contoso.example.com" })).toContain("FN:info@contoso.example.com");
  });

  it("round-trips through parseVCards", () => {
    const file = toVCardFile([diane, marcus]);
    expect(file.endsWith("\r\n")).toBe(true);
    const back = parseVCards(file);
    expect(back).toHaveLength(2);
    expect(fields(back[0])).toEqual(fields(diane));
    expect(fields(back[1])).toEqual(fields(marcus));
    expect(back[0].id).toBe("");
  });

  it("round-trips a long folded note", () => {
    const long = { ...diane, comments: "Met at the Riverton trade fair. ".repeat(10).trim() };
    const card = toVCard(long);
    expect(card.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(parseVCards(card)[0].comments).toBe(long.comments);
  });

  it("writes nothing for an empty list", () => {
    expect(toVCardFile([])).toBe("");
  });
});

describe("vCard import", () => {
  it("reads vCard 2.1 cards with bare types and quoted-printable notes", () => {
    const text = [
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N:Rossi;Elena",
      "FN:Elena Rossi",
      "TEL;WORK;VOICE:(555) 442-1100",
      "TEL;CELL:(555) 442-1101",
      "TEL;WORK;FAX:(555) 442-1199",
      "EMAIL;PREF;INTERNET:elena.rossi@contoso.example.com",
      "NOTE;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:Caf=C3=A9 meetings, =",
      "Tuesdays=0D=0Aonly",
      "END:VCARD",
    ].join("\r\n");
    const [c] = parseVCards(text);
    expect(c.firstName).toBe("Elena");
    expect(c.lastName).toBe("Rossi");
    expect(c.workPhone).toBe("(555) 442-1100");
    expect(c.cellPhone).toBe("(555) 442-1101");
    expect(c.email).toBe("elena.rossi@contoso.example.com");
    expect(c.comments).toBe("Café meetings, Tuesdays\nonly");
  });

  it("handles grouped properties, lowercase keywords and quoted type lists", () => {
    const text = [
      "begin:vcard",
      "version:3.0",
      "item1.EMAIL;type=INTERNET:old@example.com",
      'item2.EMAIL;TYPE="INTERNET,pref":new@example.com',
      "N:Nair;Priya;;;",
      "end:vcard",
    ].join("\n");
    const [c] = parseVCards(text);
    expect(c.email).toBe("new@example.com");
    expect(c.lastName).toBe("Nair");
  });

  it("unfolds folded lines", () => {
    const text = "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Jensen;Carl;;;\r\nTITLE:Senior Acc\r\n ount Manager\r\nEND:VCARD\r\n";
    expect(parseVCards(text)[0].title).toBe("Senior Account Manager");
  });

  it("splits FN when there is no N, and keeps company-only cards nameless", () => {
    const text = [
      "BEGIN:VCARD",
      "FN:Mary Ann Lee",
      "END:VCARD",
      "BEGIN:VCARD",
      "FN:Contoso Ltd.",
      "ORG:Contoso Ltd.;Sales",
      "END:VCARD",
    ].join("\n");
    const [a, b] = parseVCards(text);
    expect([a.firstName, a.lastName]).toEqual(["Mary Ann", "Lee"]);
    expect([b.firstName, b.lastName, b.company]).toEqual(["", "", "Contoso Ltd."]);
  });

  it("prefers the business address and falls back from home phones", () => {
    const text = [
      "BEGIN:VCARD",
      "N:Park;Linda;;;",
      "TEL;TYPE=HOME:(555) 111-2222",
      "ADR;TYPE=HOME:;;1 Home St;Hometown;CA;90001;USA",
      "ADR;TYPE=WORK:;Suite 200;9 Office Rd;Worktown;CA;90002;USA",
      "END:VCARD",
    ].join("\n");
    const [c] = parseVCards(text);
    expect(c.workPhone).toBe("(555) 111-2222");
    expect(c.address).toBe("9 Office Rd\nSuite 200");
    expect([c.city, c.state, c.zip, c.country]).toEqual(["Worktown", "CA", "90002", "USA"]);
  });

  it("joins several categories and notes", () => {
    const text = "BEGIN:VCARD\nN:Bell;Marcus;;;\nCATEGORIES:Client,Partner\nCATEGORIES:client\nNOTE:One\nNOTE:Two\nEND:VCARD";
    const [c] = parseVCards(text);
    expect(c.category).toBe("Client, Partner");
    expect(c.comments).toBe("One\nTwo");
  });

  it("skips photos, nested agent cards, empty cards and stray text", () => {
    const text = [
      "Some text before",
      "BEGIN:VCARD",
      "N:Becker;Tom;;;",
      "PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQ",
      " AAAQABAAD",
      "AGENT:BEGIN:VCARD",
      "BEGIN:VCARD",
      "N:Assistant;Anna;;;",
      "END:VCARD",
      "TITLE:Marketing Manager",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:3.0",
      "END:VCARD",
    ].join("\r\n");
    const out = parseVCards(text);
    expect(out).toHaveLength(1);
    expect(out[0].lastName).toBe("Becker");
    expect(out[0].title).toBe("Marketing Manager");
    expect(out[0].comments).toBe("");
  });

  it("returns nothing for text without cards", () => {
    expect(parseVCards("")).toEqual([]);
    expect(parseVCards("hello\nworld")).toEqual([]);
  });

  it("ignores a byte order mark and mailto:/tel: prefixes", () => {
    const text = "\uFEFFBEGIN:VCARD\nN:Lee;Susan;;;\nEMAIL:mailto:susan.lee@acme.example.com\nTEL;VALUE=uri:tel:+1-555-0100\nEND:VCARD";
    const [c] = parseVCards(text);
    expect(c.email).toBe("susan.lee@acme.example.com");
    expect(c.workPhone).toBe("+1-555-0100");
  });
});
