// ============================================================================
// Acme's Domino Directory (names.nsf on Mail01/Acme). The people and groups
// the simulated server knows about: type-ahead addressing and the Address
// dialog read it, and the router bounces mail to names that are not listed.
// Internal people get Notes hierarchical names ("Diane Whitfield/Acme").
// ============================================================================

export const ORG = "Acme";
export const DOMAIN = "Acme";
export const MAIL_SERVER = "Mail01/Acme";
export const APPS_SERVER = "Apps01/Acme";
export const INTERNET_DOMAIN = "acme.example.com";

export interface DirectoryPerson {
  kind: "person";
  /** Common name, e.g. "Diane Whitfield". */
  name: string;
  /** Internet address. */
  email: string;
  title: string;
  dept: string;
  phone: string;
  /** Out-of-office agent on this person's mail file, in days relative to today. */
  ooo?: { leavingDays: number; returningDays: number; message: string };
  /** Whether the simulated colleague answers mail you send them. */
  replies?: boolean;
}

export interface DirectoryGroup {
  kind: "group";
  name: string;
  /** Common names of the members. */
  members: string[];
  description: string;
}

export type DirectoryEntry = DirectoryPerson | DirectoryGroup;

const person = (
  name: string,
  title: string,
  dept: string,
  phone: string,
  extra: Partial<DirectoryPerson> = {},
): DirectoryPerson => ({
  kind: "person",
  name,
  email: name.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, ".") + "@" + INTERNET_DOMAIN,
  title,
  dept,
  phone,
  replies: true,
  ...extra,
});

export const DIRECTORY_PEOPLE: DirectoryPerson[] = [
  person("Sam Rivera", "Account Director", "Sales", "x4410", { replies: false }),
  person("Diane Whitfield", "VP of Sales", "Sales", "x4401"),
  person("Carl Jensen", "Senior Account Manager", "Sales", "x4417"),
  person("Priya Nair", "Financial Analyst", "Finance", "x4522"),
  person("Tom Becker", "Marketing Manager", "Marketing", "x4630", {
    ooo: {
      leavingDays: -2,
      returningDays: 7,
      message:
        "I will respond to your message when I return. For anything urgent, please contact Linda Park.",
    },
  }),
  person("Linda Park", "Product Manager", "Product", "x4712"),
  person("Raj Patel", "Engineering Lead", "Engineering", "x4805"),
  person("Maria Gonzalez", "Office Manager", "Facilities", "x4100"),
  person("Kevin O'Brien", "Sales Representative", "Sales", "x4421"),
  person("Susan Lee", "Corporate Counsel", "Legal", "x4900"),
  person("IT Help Desk", "Mail-in database", "Information Technology", "x4357", {
    email: "helpdesk@" + INTERNET_DOMAIN,
  }),
  person("Human Resources", "Mail-in database", "Human Resources", "x4200", {
    email: "hr@" + INTERNET_DOMAIN,
    replies: false,
  }),
  person("Domino Administrator", "Notes/Domino administration", "Information Technology", "x4358", {
    email: "admin@" + INTERNET_DOMAIN,
    replies: false,
  }),
];

export const DIRECTORY_GROUPS: DirectoryGroup[] = [
  {
    kind: "group",
    name: "Sales Team",
    members: ["Diane Whitfield", "Carl Jensen", "Kevin O'Brien", "Sam Rivera"],
    description: "Everyone in Sales",
  },
  {
    kind: "group",
    name: "Q3 Planning Committee",
    members: ["Diane Whitfield", "Carl Jensen", "Priya Nair", "Linda Park", "Sam Rivera"],
    description: "Q3 planning working group",
  },
  {
    kind: "group",
    name: "All Acme",
    members: DIRECTORY_PEOPLE.filter((p) => !p.title.startsWith("Mail-in")).map((p) => p.name),
    description: "Every Acme employee",
  },
];

export const DIRECTORY: DirectoryEntry[] = [...DIRECTORY_PEOPLE, ...DIRECTORY_GROUPS];

/** Find a directory person by common name (case-insensitive). */
export function findPerson(name: string): DirectoryPerson | undefined {
  const n = name.trim().toLowerCase();
  return DIRECTORY_PEOPLE.find((p) => p.name.toLowerCase() === n);
}

/** Find a directory group by name (case-insensitive). */
export function findGroup(name: string): DirectoryGroup | undefined {
  const n = name.trim().toLowerCase();
  return DIRECTORY_GROUPS.find((g) => g.name.toLowerCase() === n);
}

/** Find a directory person by internet address. */
export function findPersonByEmail(email: string): DirectoryPerson | undefined {
  const e = email.trim().toLowerCase();
  return DIRECTORY_PEOPLE.find((p) => p.email === e);
}
