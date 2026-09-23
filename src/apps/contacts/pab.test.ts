// ============================================================================
// Personal Address Book helper tests: names, the A-Z index, categories,
// addressing, groups, validation, search and the Copy Into New summary.
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  addressLines,
  allCategories,
  categoriesOf,
  chatName,
  contactFromInit,
  contactPatch,
  contactProblem,
  contactSummary,
  contactsHtml,
  displayName,
  emptyContact,
  groupMatchesQuery,
  groupMembers,
  groupNameProblem,
  indexLetter,
  jumpTarget,
  lastFirst,
  matchesQuery,
  memoAddress,
  membersOfGroups,
  mergeImported,
  vcfFileName,
  viewName,
} from "./pab";
import type { Contact, ContactGroup } from "../../data/types";

const person = (id: string, firstName: string, lastName: string, extra: Partial<Contact> = {}): Contact => ({
  ...emptyContact(id),
  firstName,
  lastName,
  ...extra,
});

const diane = person("1", "Diane", "Whitfield", {
  email: "diane.whitfield@acme.example.com",
  title: "VP, Operations",
  company: "Acme Corporation",
  workPhone: "(555) 010-2201",
  address: "100 Industrial Pkwy",
  city: "Riverton",
  state: "OH",
  zip: "44012",
  country: "USA",
  category: "Management",
});
const marcus = person("4", "Marcus", "Bell", { email: "marcus.bell@northwind.example.com", company: "Northwind Traders" });
const elena = person("5", "Elena", "Rossi", { category: "Partner" });
const zoe = person("6", "Zoë", "Ärger");

describe("names", () => {
  it("lists names last name first", () => {
    expect(lastFirst(diane)).toBe("Whitfield, Diane");
    expect(lastFirst(person("x", "", "Bell"))).toBe("Bell");
    expect(lastFirst(person("x", "Cher", ""))).toBe("Cher");
  });

  it("falls back to the e-mail address or company", () => {
    const anon = { ...emptyContact("x"), email: "info@contoso.example.com" };
    expect(viewName(anon)).toBe("info@contoso.example.com");
    expect(displayName(anon)).toBe("info@contoso.example.com");
    expect(viewName({ ...emptyContact("y"), company: "Contoso" })).toBe("Contoso");
    expect(displayName(emptyContact("z"))).toBe("(Untitled)");
  });
});

describe("A-Z index", () => {
  it("files contacts by the first letter of the last name", () => {
    expect(indexLetter(diane)).toBe("W");
    expect(indexLetter(zoe)).toBe("A");
    expect(indexLetter(person("x", "Ann", ""))).toBe("A");
    expect(indexLetter({ ...emptyContact("x"), email: "3m@example.com" })).toBe("#");
  });

  it("jumps to the letter's first name, else the next letter that has one", () => {
    const list = [diane, marcus, elena, person("7", "Bob", "Baker")];
    expect(jumpTarget("B", list)?.id).toBe("7");
    expect(jumpTarget("s", list)?.id).toBe("1");
    expect(jumpTarget("C", list)?.id).toBe("5");
    expect(jumpTarget("Z", list)?.id).toBe("1");
    expect(jumpTarget("A", [])).toBeUndefined();
  });
});

describe("categories", () => {
  it("splits several categories and tidies subcategories", () => {
    expect(categoriesOf({ category: "Client \\ West, Partner; partner" })).toEqual(["Client\\West", "Partner"]);
    expect(categoriesOf({ category: "  " })).toEqual([]);
  });

  it("collects every category in use", () => {
    expect(allCategories([diane, elena, person("8", "A", "B", { category: "management, Board" })])).toEqual([
      "Board",
      "Management",
      "Partner",
    ]);
  });
});

describe("addressing", () => {
  it("addresses colleagues by Notes name and others by internet address", () => {
    expect(memoAddress(diane)).toBe("Diane Whitfield/Acme");
    expect(memoAddress(marcus)).toBe("Marcus Bell <marcus.bell@northwind.example.com>");
    expect(memoAddress(elena)).toBe("Elena Rossi");
    expect(memoAddress({ ...emptyContact("x"), email: "info@contoso.example.com" })).toBe("info@contoso.example.com");
  });

  it("chats with colleagues under their directory name", () => {
    expect(chatName({ ...diane, firstName: "Di" })).toBe("Diane Whitfield");
    expect(chatName(marcus)).toBe("Marcus Bell");
  });
});

describe("groups", () => {
  const group: ContactGroup = { id: "g", name: "Acme Team", memberIds: ["5", "gone", "1"] };

  it("lists a group's members in order and skips deleted contacts", () => {
    expect(groupMembers(group, [diane, marcus, elena]).map((c) => c.id)).toEqual(["5", "1"]);
  });

  it("collects the members of several groups once", () => {
    const other: ContactGroup = { id: "h", name: "Clients", memberIds: ["4", "1"] };
    expect(membersOfGroups([group, other], [diane, marcus, elena]).map((c) => c.id)).toEqual(["4", "5", "1"]);
  });

  it("matches groups by name or member", () => {
    expect(groupMatchesQuery(group, [diane, elena], "acme")).toBe(true);
    expect(groupMatchesQuery(group, [diane, elena], "riverton")).toBe(true);
    expect(groupMatchesQuery(group, [diane, elena], "northwind")).toBe(false);
    expect(groupMatchesQuery(group, [], " ")).toBe(true);
  });

  it("checks group names", () => {
    expect(groupNameProblem(" ", [group])).toMatch(/Group name/);
    expect(groupNameProblem("acme team", [group])).toMatch(/already exists/);
    expect(groupNameProblem("Acme Team", [group], "g")).toBeNull();
    expect(groupNameProblem("A, B", [group])).toMatch(/commas/);
    expect(groupNameProblem("Northwind", [group])).toBeNull();
  });
});

describe("documents", () => {
  it("requires a last name or an e-mail address", () => {
    expect(contactProblem(person("x", "Ann", ""))).toMatch(/Last name/);
    expect(contactProblem(person("x", "", "Bell"))).toBeNull();
    expect(contactProblem({ ...emptyContact("x"), email: "a@b.c" })).toBeNull();
  });

  it("builds a new contact from handed-over values", () => {
    const c = contactFromInit({ firstName: "Raj", email: "raj.patel@acme.example.com", bogus: 3, title: 7 }, "new-1");
    expect(c.id).toBe("new-1");
    expect(c.firstName).toBe("Raj");
    expect(c.email).toBe("raj.patel@acme.example.com");
    expect(c.title).toBe("");
    expect("bogus" in c).toBe(false);
  });

  it("tidies fields on save", () => {
    const p = contactPatch({ ...diane, firstName: "  Diane ", lastName: "Whit  field", category: "b, a ,b", comments: "Hi\n\n" });
    expect(p.firstName).toBe("Diane");
    expect(p.lastName).toBe("Whit field");
    expect(p.category).toBe("b, a");
    expect(p.comments).toBe("Hi");
    expect("id" in p).toBe(false);
  });

  it("merges imported values without erasing stored ones", () => {
    const imported = { ...emptyContact(), firstName: "Diane", title: "COO", cellPhone: "(555) 000-0000" };
    expect(mergeImported(diane, imported)).toEqual({ title: "COO", cellPhone: "(555) 000-0000" });
  });

  it("matches the search bar text against several fields", () => {
    expect(matchesQuery(diane, "riverton")).toBe(true);
    expect(matchesQuery(diane, "diane acme")).toBe(true);
    expect(matchesQuery(diane, "diane northwind")).toBe(false);
    expect(matchesQuery(diane, "  ")).toBe(true);
  });

  it("writes the business address as lines", () => {
    expect(addressLines(diane)).toEqual(["100 Industrial Pkwy", "Riverton, OH 44012", "USA"]);
    expect(addressLines(marcus)).toEqual([]);
  });

  it("summarizes a contact for Copy Into New", () => {
    expect(contactSummary(diane)).toEqual([
      "Diane Whitfield",
      "VP, Operations",
      "Acme Corporation",
      "",
      "Business phone: (555) 010-2201",
      "E-mail: diane.whitfield@acme.example.com",
      "",
      "100 Industrial Pkwy",
      "Riverton, OH 44012",
      "USA",
    ]);
    expect(contactSummary(elena)).toEqual(["Elena Rossi"]);
    expect(contactsHtml([{ ...elena, title: "<b>Boss</b>" }])).toBe("<p><b>Elena Rossi</b><br>&lt;b&gt;Boss&lt;/b&gt;</p>");
  });

  it("names export files", () => {
    expect(vcfFileName([diane])).toBe("Whitfield_Diane.vcf");
    expect(vcfFileName([diane, marcus])).toBe("contacts.vcf");
    expect(vcfFileName([{ ...emptyContact("x"), email: "a@b.com" }])).toBe("a_b.com.vcf");
  });
});
