// ============================================================================
// Lotus Notes — seed data
// First-run content so the desktop feels alive. Dates are computed relative to
// "now" so the inbox and calendar always look current. Content has a deliberate
// late-90s / early-2000s corporate flavor.
// ============================================================================

import type {
  Contact,
  ContactGroup,
  CustomFolder,
  DiscussionPost,
  CalendarEntry,
  JournalEntry,
  MailMessage,
  MailRule,
  TodoTask,
  UserProfile,
} from "./types";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function id(prefix: string, n: number): string {
  return `${prefix}-${n}`;
}

/** Build a Date at a given day-offset from today and a specific local hour. */
function at(dayOffset: number, hour: number, minute = 0): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() + dayOffset * DAY + hour * HOUR + minute * 60 * 1000;
}

export interface SeedData {
  user: UserProfile;
  mail: MailMessage[];
  calendar: CalendarEntry[];
  contacts: Contact[];
  contactGroups: ContactGroup[];
  todos: TodoTask[];
  journal: JournalEntry[];
  discussion: DiscussionPost[];
  customFolders: CustomFolder[];
  mailRules: MailRule[];
}

export function buildSeed(): SeedData {
  const me: UserProfile = {
    name: "Sam Rivera",
    email: "sam.rivera@acme.example.com",
    location: "Office (Network)",
  };

  const now = Date.now();

  const p = (name: string, email: string) => ({ name, email });
  const boss = p("Diane Whitfield", "diane.whitfield@acme.example.com");
  const it = p("IT Help Desk", "helpdesk@acme.example.com");
  const hr = p("Human Resources", "hr@acme.example.com");
  const carl = p("Carl Jensen", "carl.jensen@acme.example.com");
  const priya = p("Priya Nair", "priya.nair@acme.example.com");
  const admin = p("Domino Administrator", "admin@acme.example.com");

  // User-created folders the demo ships with, so the "Folders" section is alive.
  const customFolders: CustomFolder[] = [
    { id: id("f", 1), name: "Projects" },
    { id: id("f", 2), name: "Receipts" },
  ];

  const mail: MailMessage[] = [
    {
      id: id("m", 1),
      folder: "inbox",
      from: boss,
      to: [p(me.name, me.email)],
      cc: [],
      subject: "Q3 Planning — agenda for Thursday",
      body:
        "Hi Sam,\n\nPlease review the attached agenda before our Q3 planning session on Thursday. " +
        "I'd like each team lead to come prepared with their top three priorities and a rough resourcing estimate.\n\n" +
        "We'll start promptly at 10:00 in the Birch conference room. Coffee provided.\n\n" +
        "Thanks,\nDiane",
      date: now - 2 * HOUR,
      read: false,
      flagged: true,
      flagColor: "yellow",
      hasAttachment: true,
      priority: "high",
      labels: [id("f", 1)],
    },
    {
      id: id("m", 2),
      folder: "inbox",
      from: it,
      to: [p(me.name, me.email)],
      cc: [],
      subject: "Scheduled maintenance: Domino server this weekend",
      body:
        "The Domino mail cluster will be unavailable Saturday 02:00–05:00 for routine maintenance and " +
        "replication of the address book. Please save your work and close Notes before you leave Friday.\n\n" +
        "No action is required on your part.\n\n— IT Help Desk",
      date: now - 5 * HOUR,
      read: false,
      flagged: false,
      hasAttachment: true,
      priority: "normal",
    },
    {
      id: id("m", 3),
      folder: "inbox",
      from: priya,
      to: [p(me.name, me.email)],
      cc: [carl],
      subject: "RE: Budget numbers for the Northwind account",
      body:
        "Sam — the revised figures are in. Margin is holding at 22% even after the discount we discussed.\n\n" +
        "Let me know if you want me to pull the same breakdown for the other two accounts.\n\nPriya",
      date: now - DAY - 3 * HOUR,
      read: true,
      flagged: true,
      flagColor: "green",
      priority: "normal",
      labels: [id("f", 1)],
    },
    {
      id: id("m", 4),
      folder: "inbox",
      from: hr,
      to: [p(me.name, me.email)],
      cc: [],
      subject: "Reminder: Benefits enrollment closes Friday",
      body:
        "This is a friendly reminder that the annual benefits enrollment window closes this Friday at 5:00 PM. " +
        "Log in to the HR portal to review your selections.\n\nHuman Resources",
      date: now - DAY - 6 * HOUR,
      read: true,
      flagged: true,
      flagColor: "yellow",
      priority: "normal",
    },
    {
      id: id("m", 5),
      folder: "inbox",
      from: carl,
      to: [p(me.name, me.email)],
      cc: [],
      subject: "Lunch Friday?",
      body: "Want to grab lunch Friday? Trying that new place by the river. — Carl",
      date: now - 2 * DAY,
      read: true,
      flagged: false,
      priority: "low",
    },
    {
      id: id("m", 6),
      folder: "inbox",
      from: admin,
      to: [p(me.name, me.email)],
      cc: [],
      subject: "Welcome to Lotus Notes",
      body:
        "Welcome to your Lotus Notes workspace!\n\n" +
        "Notes brings your mail, calendar, contacts, to-do list, notebook and team discussions into one place. " +
        "A few tips to get started:\n\n" +
        "  • Use the bookmark bar on the left to jump between applications.\n" +
        "  • The Workspace shows every database as a tile — double-click to open one.\n" +
        "  • Create a new memo with Create > Mail, or press the New Memo action.\n" +
        "  • Everything you create is saved locally and will be here when you return.\n\n" +
        "Have a productive day.\n\n— Domino Administrator",
      date: now - 3 * DAY,
      read: true,
      flagged: false,
      priority: "normal",
    },
    {
      id: id("m", 7),
      folder: "sent",
      from: p(me.name, me.email),
      to: [priya],
      cc: [],
      subject: "RE: Budget numbers for the Northwind account",
      body: "Thanks Priya — yes please, pull the breakdown for all three. No rush, end of week is fine.\n\nSam",
      date: now - DAY - 2 * HOUR,
      read: true,
      flagged: false,
      priority: "normal",
    },
    {
      id: id("m", 8),
      folder: "drafts",
      from: p(me.name, me.email),
      to: [boss],
      cc: [],
      subject: "Q3 priorities — my list",
      body: "Diane,\n\nHere are my proposed priorities for Q3:\n\n1. \n2. \n3. \n\n(still drafting)",
      date: now - 30 * 60 * 1000,
      read: true,
      flagged: false,
      priority: "normal",
    },
  ];

  const calendar: CalendarEntry[] = [
    {
      id: id("c", 1),
      type: "meeting",
      subject: "Q3 Planning Session",
      location: "Birch Conference Room",
      start: at(2, 10, 0),
      end: at(2, 12, 0),
      allDay: false,
      description: "Quarterly planning with all team leads. Bring top three priorities.",
      invitees: [boss, carl, priya],
      category: "Planning",
      alarm: true,
    },
    {
      id: id("c", 2),
      type: "appointment",
      subject: "1:1 with Diane",
      location: "Diane's office",
      start: at(0, 15, 0),
      end: at(0, 15, 30),
      allDay: false,
      description: "Weekly check-in.",
      invitees: [boss],
      category: "Management",
      alarm: true,
    },
    {
      id: id("c", 3),
      type: "appointment",
      subject: "Dentist",
      location: "Downtown Dental",
      start: at(1, 9, 0),
      end: at(1, 10, 0),
      allDay: false,
      description: "Routine cleaning.",
      invitees: [],
      category: "Personal",
      alarm: true,
    },
    {
      id: id("c", 4),
      type: "reminder",
      subject: "Submit timesheet",
      location: "",
      start: at(4, 16, 0),
      end: at(4, 16, 0),
      allDay: false,
      description: "Don't forget the weekly timesheet before you leave.",
      invitees: [],
      category: "Admin",
      alarm: true,
    },
    {
      id: id("c", 5),
      type: "event",
      subject: "Company All-Hands",
      location: "Auditorium",
      start: at(3, 13, 0),
      end: at(3, 14, 30),
      allDay: false,
      description: "Quarterly all-hands with leadership Q&A.",
      invitees: [],
      category: "Company",
      alarm: false,
    },
    {
      id: id("c", 6),
      type: "anniversary",
      subject: "Carl's work anniversary (5 yrs)",
      location: "",
      start: at(5, 0, 0),
      end: at(5, 0, 0),
      allDay: true,
      description: "",
      invitees: [],
      category: "Personal",
      alarm: false,
    },
  ];

  const contacts: Contact[] = [
    {
      id: id("ct", 1),
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
      comments: "Prefers morning meetings.",
    },
    {
      id: id("ct", 2),
      firstName: "Carl",
      lastName: "Jensen",
      email: "carl.jensen@acme.example.com",
      company: "Acme Corporation",
      title: "Account Manager",
      workPhone: "(555) 010-2245",
      cellPhone: "(555) 771-3380",
      address: "100 Industrial Pkwy",
      city: "Riverton",
      state: "OH",
      zip: "44012",
      country: "USA",
      category: "Sales",
      comments: "",
    },
    {
      id: id("ct", 3),
      firstName: "Priya",
      lastName: "Nair",
      email: "priya.nair@acme.example.com",
      company: "Acme Corporation",
      title: "Financial Analyst",
      workPhone: "(555) 010-2298",
      cellPhone: "",
      address: "100 Industrial Pkwy",
      city: "Riverton",
      state: "OH",
      zip: "44012",
      country: "USA",
      category: "Finance",
      comments: "Owns the Northwind account model.",
    },
    {
      id: id("ct", 4),
      firstName: "Marcus",
      lastName: "Bell",
      email: "marcus.bell@northwind.example.com",
      company: "Northwind Traders",
      title: "Director of Procurement",
      workPhone: "(555) 330-8800",
      cellPhone: "",
      address: "42 Harbor View",
      city: "Seattle",
      state: "WA",
      zip: "98101",
      country: "USA",
      category: "Client",
      comments: "Key contact for the Northwind renewal.",
    },
    {
      id: id("ct", 5),
      firstName: "Elena",
      lastName: "Rossi",
      email: "elena.rossi@contoso.example.com",
      company: "Contoso Ltd.",
      title: "Partner Manager",
      workPhone: "(555) 442-1100",
      cellPhone: "(555) 442-1101",
      address: "9 Via Roma",
      city: "Boston",
      state: "MA",
      zip: "02108",
      country: "USA",
      category: "Partner",
      comments: "",
    },
  ];

  const contactGroups: ContactGroup[] = [
    {
      id: id("cg", 1),
      name: "Acme Team",
      // The Acme Corporation employees: Diane, Carl, Priya.
      memberIds: [id("ct", 1), id("ct", 2), id("ct", 3)],
    },
  ];

  const todos: TodoTask[] = [
    {
      id: id("t", 1),
      subject: "Prepare Q3 priorities list",
      description: "Three priorities + resourcing estimate for Thursday's planning session.",
      start: at(0, 9, 0),
      due: at(2, 9, 0),
      priority: "high",
      status: "in-progress",
      category: "Planning",
      completedDate: null,
    },
    {
      id: id("t", 2),
      subject: "Review Northwind budget",
      description: "Check Priya's revised margin figures before the client call.",
      start: null,
      due: at(1, 17, 0),
      priority: "high",
      status: "not-started",
      category: "Finance",
      completedDate: null,
    },
    {
      id: id("t", 3),
      subject: "Submit benefits enrollment",
      description: "HR portal — closes Friday 5 PM.",
      start: null,
      due: at(4, 17, 0),
      priority: "normal",
      status: "not-started",
      category: "Admin",
      completedDate: null,
    },
    {
      id: id("t", 4),
      subject: "Book travel for Seattle visit",
      description: "Northwind on-site next month. Flights + hotel.",
      start: null,
      due: at(7, 12, 0),
      priority: "normal",
      status: "not-started",
      category: "Travel",
      completedDate: null,
    },
    {
      id: id("t", 5),
      subject: "File expense report",
      description: "Last month's expenses.",
      start: null,
      due: at(-1, 17, 0),
      priority: "low",
      status: "complete",
      category: "Admin",
      completedDate: now - DAY,
    },
  ];

  const journal: JournalEntry[] = [
    {
      id: id("j", 1),
      subject: "Notes on the Northwind renewal strategy",
      body:
        "Key points from the call with Marcus:\n\n" +
        "• They're happy with delivery but price-sensitive this cycle.\n" +
        "• A two-year commitment unlocks the 22% margin Priya modeled.\n" +
        "• Decision expected by end of quarter.\n\n" +
        "Next step: draft a two-year proposal and run it past Diane.",
      category: "Work",
      created: now - 2 * DAY,
      modified: now - DAY,
    },
    {
      id: id("j", 2),
      subject: "Book recommendations",
      body: "From the team lunch:\n\n- The Mythical Man-Month\n- Peopleware\n- The Goal",
      category: "Personal",
      created: now - 6 * DAY,
      modified: now - 6 * DAY,
    },
  ];

  const topic1 = id("d", 1);
  const topic2 = id("d", 5);
  const discussion: DiscussionPost[] = [
    {
      id: topic1,
      parentId: null,
      topicId: topic1,
      subject: "Proposal: move to two-week sprints",
      author: carl,
      body:
        "I'd like to propose we move from our current monthly cycle to two-week sprints. " +
        "Faster feedback, smaller batches, easier to course-correct. Thoughts?",
      category: "Process",
      date: now - 4 * DAY,
    },
    {
      id: id("d", 2),
      parentId: topic1,
      topicId: topic1,
      subject: "RE: Proposal: move to two-week sprints",
      author: priya,
      body: "+1. Monthly planning always drifts. Two weeks keeps us honest.",
      category: "Process",
      date: now - 4 * DAY + 3 * HOUR,
    },
    {
      id: id("d", 3),
      parentId: topic1,
      topicId: topic1,
      subject: "RE: Proposal: move to two-week sprints",
      author: boss,
      body:
        "Supportive in principle. Let's pilot with one team for a quarter and review the metrics before " +
        "rolling it out broadly.",
      category: "Process",
      date: now - 3 * DAY,
    },
    {
      id: id("d", 4),
      parentId: id("d", 2),
      topicId: topic1,
      subject: "RE: Proposal: move to two-week sprints",
      author: carl,
      body: "Agreed Priya. I'll volunteer my team for the pilot.",
      category: "Process",
      date: now - 3 * DAY + 2 * HOUR,
    },
    {
      id: topic2,
      parentId: null,
      topicId: topic2,
      subject: "Recommended snacks for the break room",
      author: priya,
      body: "The pretzel situation has become dire. Taking suggestions for the next order.",
      category: "Off-topic",
      date: now - 6 * DAY,
    },
    {
      id: id("d", 6),
      parentId: topic2,
      topicId: topic2,
      subject: "RE: Recommended snacks for the break room",
      author: carl,
      body: "More of those dark chocolate almonds. They vanish instantly for a reason.",
      category: "Off-topic",
      date: now - 6 * DAY + 5 * HOUR,
    },
  ];

  // One example rule: file anything mentioning "Northwind" into Projects.
  const mailRules: MailRule[] = [
    {
      id: id("r", 1),
      field: "subject",
      contains: "Northwind",
      action: "move",
      folderId: id("f", 1),
    },
  ];

  return {
    user: me,
    mail,
    calendar,
    contacts,
    contactGroups,
    todos,
    journal,
    discussion,
    customFolders,
    mailRules,
  };
}
