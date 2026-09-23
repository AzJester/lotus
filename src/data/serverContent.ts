// ============================================================================
// Traffic for the simulated Domino server: the memos, replies, discussion
// posts and meeting invitations that colleagues "send" while the app runs.
// Every sender, author and chair is a common name from DIRECTORY_PEOPLE in
// directory.ts (content.test.ts checks this). Tom Becker is out of the office,
// so he sends nothing. Memo bodies are plain text with paragraphs separated
// by blank lines, signed with the sender's first name (mailboxes sign as
// themselves).
// ============================================================================

export type Mood =
  | "personal"
  | "confidential"
  | "private"
  | "thankyou"
  | "flame"
  | "goodjob"
  | "joke"
  | "fyi"
  | "question"
  | "reminder";

export interface MemoTemplate {
  /** DIRECTORY_PEOPLE common name. */
  from: string;
  subject: string;
  /** Plain text, paragraphs separated by blank lines, signed with the sender's first name. */
  body: string;
  importance?: "high" | "normal" | "low";
  attachment?: { name: string; sizeKb: number };
  mood?: Mood;
}

export type TopicCategory = "Process" | "Off-topic" | "Announcements" | "Tools";

export interface TopicTemplate {
  author: string;
  subject: string;
  category: TopicCategory;
  body: string;
}

export interface DiscussionReplyTemplate {
  author: string;
  body: string;
}

export interface MeetingInviteTemplate {
  chair: string;
  subject: string;
  location: string;
  durationMin: number;
  description: string;
}

/** Joins paragraphs with the blank line that separates them. */
function paras(...parts: string[]): string {
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Incoming memos
// ---------------------------------------------------------------------------
export const INCOMING_MEMOS: MemoTemplate[] = [
  // Diane Whitfield, VP of Sales (Sam's boss)
  {
    from: "Diane Whitfield",
    subject: "Q3 territory assignments",
    body: paras(
      "Sam,",
      "Attached are the proposed Q3 territory assignments. Northwind stays with you and Carl, and I've added Fabrikam to your list, since you already know their purchasing team.",
      "Look it over and tell me by Wednesday if anything is unworkable. I'd rather hear it now than halfway through the quarter.",
      "Diane",
    ),
    attachment: { name: "Q3 Territories.ppt", sizeKb: 412 },
  },
  {
    from: "Diane Whitfield",
    subject: "Great work on the Contoso deal!",
    body: paras(
      "Sam,",
      "Contoso just called to say they've signed the two-year agreement. That is a terrific result, and I know how many late nights went into the proposal.",
      "I'll be bragging about it at Friday's all-hands. Well done.",
      "Diane",
    ),
    mood: "goodjob",
  },
  {
    from: "Diane Whitfield",
    subject: "Your review is scheduled for Thursday",
    body: paras(
      "Sam,",
      "I've put your performance review on the calendar for Thursday at 2:00 in my office. Please bring your self-evaluation and a short list of what you want to accomplish next quarter.",
      "Think of it as a conversation, not a report card. Come ready to tell me what you need from me, too.",
      "Diane",
    ),
    mood: "private",
  },
  {
    from: "Diane Whitfield",
    subject: "Thank you for a record month",
    body: paras(
      "Team,",
      "We closed the month at 112% of plan, the best result this group has ever posted. Thank you for the extra calls, the weekend proposals and your patience with the fax machine.",
      "Lunch is on me Friday. Pizza arrives in the break room at noon.",
      "Diane",
    ),
    mood: "thankyou",
  },
  {
    from: "Diane Whitfield",
    subject: "Please hold off on new travel",
    body: paras(
      "Sam,",
      "Priya tells me we are running ahead of our travel budget, so please hold off booking any new trips until we review the Q3 numbers next week. Customer visits that are already on the calendar can go ahead.",
      "If a deal depends on getting on a plane, come see me and we will sort it out.",
      "Thanks,\nDiane",
    ),
    importance: "high",
  },

  // Carl Jensen, Senior Account Manager
  {
    from: "Carl Jensen",
    subject: "Northwind call moved to Tuesday",
    body: paras(
      "Sam,",
      "Northwind's procurement director asked to move our renewal call to Tuesday at 10:00, and I said yes. The good news is that they want to talk about a two-year term, so bring Priya's margin numbers.",
      "I'll send a new invitation from my calendar.",
      "Carl",
    ),
  },
  {
    from: "Carl Jensen",
    subject: "Fabrikam wants a second demo",
    body: paras(
      "Sam,",
      "Fabrikam's operations team liked the demo so much that they want us to run it again for their plant managers, ideally next Wednesday afternoon.",
      "Can you check with Raj that the demo server is free? And let's test the projector the day before. Last time it took us ten minutes to get the laptop and the projector on speaking terms.",
      "Carl",
    ),
  },
  {
    from: "Carl Jensen",
    subject: "Bowling Thursday?",
    body: paras(
      "Sam,",
      "A few of us are going bowling Thursday after work at the lanes on Route 9. Shoe rental is three dollars; pride is extra.",
      "Let me know if you're in and I'll add you to our lane. Kevin claims he once bowled a 200, so we have that to look forward to.",
      "Carl",
    ),
    importance: "low",
    mood: "personal",
  },
  {
    from: "Carl Jensen",
    subject: "Contoso asking about volume pricing",
    body: paras(
      "Sam,",
      "Contoso's partner manager wants to know whether the volume discount still applies if two of their divisions order separately. I think it should, but I don't want to promise anything until Priya has run the numbers.",
      "Do you want to take this one, or shall I?",
      "Carl",
    ),
    mood: "fyi",
  },

  // Priya Nair, Financial Analyst
  {
    from: "Priya Nair",
    subject: "Fabrikam pricing model, version 3",
    body: paras(
      "Sam,",
      "Attached is version 3 of the Fabrikam pricing model. I added a tab for the three-year option and fixed the shipping formula that was counting freight twice.",
      "At the discount you proposed, margin lands at 19%. If we can hold the discount to 8%, we're back above 21%.",
      "Priya",
    ),
    attachment: { name: "Fabrikam Pricing v3.xls", sizeKb: 236 },
  },
  {
    from: "Priya Nair",
    subject: "Q3 expense estimates due Friday",
    body: paras(
      "Hi Sam,",
      "A friendly reminder that Q3 expense estimates for your accounts are due to Finance by Friday at 5:00. The template is the same as last quarter, so you can overwrite the old numbers and save it under a new name.",
      "Please round to the nearest hundred dollars. Last quarter someone estimated their postage to the penny. I admired it, but it did not help.",
      "Thanks,\nPriya",
    ),
    mood: "reminder",
  },
  {
    from: "Priya Nair",
    subject: "Travel budget is 80% spent",
    body: paras(
      "Sam,",
      "Quick heads-up: Sales has used 80% of its travel budget for the year, and we still have a full quarter to go. I've let Diane know as well.",
      "If you have customer visits planned, send me the dates and estimated costs so I can build them into the forecast.",
      "Priya",
    ),
    importance: "high",
  },
  {
    from: "Priya Nair",
    subject: "Cake for Maria at 3:00",
    body: paras(
      "Hi everyone,",
      "It's Maria's birthday today. There is a chocolate cake hidden in the second-floor break room, and a card on my desk waiting for your signature.",
      "Please gather in the break room at 3:00. Maria thinks she is coming to a budget meeting.",
      "Priya",
    ),
    importance: "low",
    mood: "personal",
  },

  // Linda Park, Product Manager (covering marketing while Tom is out)
  {
    from: "Linda Park",
    subject: "Launch checklist for the 4.0 release",
    body: paras(
      "Sam,",
      "Attached is the launch checklist for the 4.0 release. Sales owns items 12 through 18: the updated price sheets, the customer letter and the demo script.",
      "Could you read the customer letter in particular? You know better than anyone how Northwind and Contoso will take it.",
      "Thanks,\nLinda",
    ),
    attachment: { name: "4.0 Launch Checklist.doc", sizeKb: 88 },
  },
  {
    from: "Linda Park",
    subject: "Covering for Tom while he's out",
    body: paras(
      "Hi Sam,",
      "Tom is out of the office this week, so I'm covering marketing requests until he's back. Send brochure changes, trade show questions and logo requests my way.",
      "I'll do my best, but please don't ask me to choose paper stock. That is strictly Tom's department.",
      "Linda",
    ),
    mood: "fyi",
  },
  {
    from: "Linda Park",
    subject: "Customer quotes for the launch brochure?",
    body: paras(
      "Sam,",
      "For the 4.0 launch brochure we need two short quotes from happy customers. Do you think anyone at Northwind or Contoso would give us a sentence or two about working with Acme?",
      "Susan will review the wording before anything goes to the printer.",
      "Linda",
    ),
    mood: "question",
  },

  // Raj Patel, Engineering Lead
  {
    from: "Raj Patel",
    subject: "4.0 release candidate is on the demo server",
    body: paras(
      "Sam,",
      "The 4.0 release candidate is now installed on the demo server. The faster reporting screens are in, and the export problem Fabrikam found is fixed.",
      "If anything looks odd during a customer demo, write down what you clicked and send it to me. A screen shot is even better.",
      "Raj",
    ),
  },
  {
    from: "Raj Patel",
    subject: "Demo server down 2:00 to 3:00 today",
    body: paras(
      "Sam,",
      "We need to take the demo server down from 2:00 to 3:00 today to add memory. If you have a demo scheduled in that window, let me know and we'll move the work to tomorrow morning.",
      "Sorry for the short notice.",
      "Raj",
    ),
    importance: "high",
  },
  {
    from: "Raj Patel",
    subject: "Trivia rematch: Engineering vs. Sales",
    body: paras(
      "Sam,",
      "Engineering would like a rematch in the Friday trivia league. We maintain that last month's question about state capitals was unfair to anyone who grew up somewhere else.",
      "Winner gets the good conference room for a week. Are you in?",
      "Raj",
    ),
    importance: "low",
  },

  // Maria Gonzalez, Office Manager
  {
    from: "Maria Gonzalez",
    subject: "Parking garage: level 2 closed Monday",
    body: paras(
      "Hello everyone,",
      "Level 2 of the parking garage will be closed all day Monday for repainting. Please park on levels 3 and 4, or in the overflow lot across the street. A map is attached.",
      "Cars left on level 2 after Sunday evening will be moved by the garage staff, who are not known for putting seats back where they found them.",
      "Thanks,\nMaria",
    ),
    attachment: { name: "Garage Map.gif", sizeKb: 48 },
  },
  {
    from: "Maria Gonzalez",
    subject: "Badge photo retakes on Wednesday",
    body: paras(
      "Hello everyone,",
      "If you are unhappy with your badge photo (and judging by the requests, many of you are), the photographer will be in the Maple Room on Wednesday from 9:00 to 11:00.",
      "New badges will be ready by Friday. Please bring me your old badge when you pick up the new one.",
      "Maria",
    ),
  },
  {
    from: "Maria Gonzalez",
    subject: "The new color printer is here",
    body: paras(
      "Hello everyone,",
      "The new color printer is installed next to the supply closet on the third floor. It prints on both sides, it staples, and it is much faster than the old one.",
      "Color toner is expensive, so please print customer proposals in color and everything else in black and white. Yes, that includes the lunch menu.",
      "Maria",
    ),
  },
  {
    from: "Maria Gonzalez",
    subject: "Refrigerator cleanout Friday at 3:00",
    body: paras(
      "Hi all,",
      "The break room refrigerator will be emptied Friday at 3:00. Anything without a name and date on it will be thrown out, containers and all.",
      "If you have been wondering what is in the blue container on the bottom shelf, so have we.",
      "Maria",
    ),
    mood: "reminder",
  },
  {
    from: "Maria Gonzalez",
    subject: "PLEASE reset the copier after 11x17 jobs",
    body: paras(
      "To whoever keeps printing on 11x17 paper and leaving the copier set that way:",
      "Three people have printed their reports on giant paper this week. When you finish, please set the copier back to letter size.",
      "The rest of us thank you. So does the recycling bin.",
      "Maria",
    ),
    mood: "flame",
  },
  {
    from: "Maria Gonzalez",
    subject: "Potluck Friday: sign-up sheet attached",
    body: paras(
      "Hi everyone,",
      "Our end-of-quarter potluck is Friday at noon in the Birch Conference Room. The sign-up sheet is attached, and a paper copy is on the bulletin board by the fax machine.",
      "So far we have eleven desserts and one salad, so savory dishes are especially welcome.",
      "Maria",
    ),
    importance: "low",
    attachment: { name: "Potluck Signup.doc", sizeKb: 24 },
  },

  // Kevin O'Brien, Sales Representative
  {
    from: "Kevin O'Brien",
    subject: "Question about discounts for Contoso",
    body: paras(
      "Hi Sam,",
      "Contoso's buyer asked whether we can match last year's discount if they add a second site. I didn't want to say anything until I checked with you.",
      "What's the most I can offer without getting Diane involved?",
      "Thanks,\nKevin",
    ),
    mood: "question",
  },
  {
    from: "Kevin O'Brien",
    subject: "I closed my first deal!",
    body: paras(
      "Sam,",
      "Fabrikam's parts division just faxed back the signed order! It's a small one, but it's mine, and I wanted you to be the first to know, since you walked me through the proposal.",
      "I owe you a coffee. Possibly two.",
      "Kevin",
    ),
  },
  {
    from: "Kevin O'Brien",
    subject: "Did you get the memo about the memo?",
    body: paras(
      "Hi Sam,",
      "Just checking that you received the memo about the new cover sheets for memos. I sent this memo to confirm that my earlier memo about the cover sheets arrived.",
      "I've printed all three and put them in a binder. The binder has a cover sheet too.",
      "Kevin",
    ),
    importance: "low",
    mood: "joke",
  },
  {
    from: "Kevin O'Brien",
    subject: "Softball Thursday: Sales needs a shortstop",
    body: paras(
      "Sam,",
      "Sales plays Engineering on Thursday at 6:00 at the field behind the high school, and we're short a shortstop. I've heard rumors about your arm.",
      "Bring a glove if you have one. If you don't, Carl has three for some reason.",
      "Kevin",
    ),
    importance: "low",
  },

  // Susan Lee, Corporate Counsel
  {
    from: "Susan Lee",
    subject: "Northwind master agreement: redlines attached",
    body: paras(
      "Sam,",
      "Attached are my redlines on the Northwind master agreement. The two changes that matter are the limitation of liability in section 9 and the automatic renewal language in section 14.",
      "Please don't forward this version outside Acme. If Northwind asks for a copy, I'll send them a clean draft.",
      "Susan",
    ),
    importance: "high",
    attachment: { name: "Northwind MSA Redline.doc", sizeKb: 156 },
    mood: "confidential",
  },
  {
    from: "Susan Lee",
    subject: "Reminder: NDAs come to Legal first",
    body: paras(
      "Hello everyone,",
      "A reminder that every nondisclosure agreement must come to Legal before anyone signs it, even when the customer says it is their standard form. Standard forms have a way of containing surprises.",
      "Most NDAs take me less than a day, so please send them over as soon as they arrive.",
      "Thanks,\nSusan",
    ),
    mood: "reminder",
  },
  {
    from: "Susan Lee",
    subject: "Please keep all Fabrikam files",
    body: paras(
      "Sam,",
      "Please don't shred or throw away any Fabrikam paperwork, including old proposals, faxes and meeting notes, until you hear from me. This is routine and nothing to worry about.",
      "If you're running out of cabinet space, Maria has extra file boxes.",
      "Susan",
    ),
  },
  {
    from: "Susan Lee",
    subject: "Customer quotes need written approval",
    body: paras(
      "Sam,",
      "Linda asked me to review the customer quotes for the 4.0 brochure. Before we print anything, each customer has to approve the exact wording in writing. A fax or a memo from them is fine.",
      "Could you ask your contacts at Northwind and Contoso to confirm theirs?",
      "Susan",
    ),
  },

  // IT Help Desk (mail-in database)
  {
    from: "IT Help Desk",
    subject: "Network maintenance Saturday night",
    body: paras(
      "The Acme network will be unavailable Saturday from 10:00 PM until 2:00 AM Sunday while we replace equipment in the server room.",
      "During that time you will not be able to reach Mail01/Acme or Apps01/Acme, either from the office or by dial-up. Mail sent to you during the outage will be delivered when the network is back.",
      "Please save your work and exit Notes before you leave on Friday.",
      "IT Help Desk",
    ),
    importance: "high",
  },
  {
    from: "IT Help Desk",
    subject: "New dial-up numbers for remote access",
    body: paras(
      "The dial-up numbers for remote access have changed. Starting Monday, please use 555-0142 for local calls or 1-800-555-0199 from anywhere else.",
      "If you use a laptop at home or on the road, bring it by the Help Desk and we will update it for you, or call us at x4357 and we will walk you through it.",
      "IT Help Desk",
    ),
    mood: "fyi",
  },
  {
    from: "IT Help Desk",
    subject: "Virus warnings: please don't forward them",
    body: paras(
      "Several of you have received a message warning that simply reading a memo will erase your hard drive, and asking you to forward the warning to everyone you know. The warning is a hoax.",
      "Please do not forward it, especially not to the All Acme group. If you are ever unsure about a message or an attachment, call us at x4357 before you open it.",
      "IT Help Desk",
    ),
  },
  {
    from: "IT Help Desk",
    subject: "After-hours support now by pager",
    body: paras(
      "Starting this week, an on-call technician with a pager handles after-hours support. If you have a problem outside business hours that cannot wait until morning, call the Help Desk at x4357 and follow the instructions to page the technician.",
      "Please leave a number where we can reach you. The technician will call you back within 30 minutes.",
      "IT Help Desk",
    ),
  },

  // Human Resources (mail-in database)
  {
    from: "Human Resources",
    subject: "Timesheets due Friday at noon",
    body: paras(
      "This is a reminder that timesheets for this pay period are due Friday at noon. Late timesheets hold up payroll for your whole department.",
      "If you will be out on Friday, please turn in your timesheet on Thursday.",
      "Human Resources",
    ),
    mood: "reminder",
  },
  {
    from: "Human Resources",
    subject: "Free flu shots Thursday",
    body: paras(
      "Free flu shots will be available Thursday from 9:00 to noon in the Birch Conference Room. No appointment is needed.",
      "Please bring your badge, and wear sleeves you can roll up.",
      "Human Resources",
    ),
  },
  {
    from: "Human Resources",
    subject: "Updated employee handbook",
    body: paras(
      "The updated employee handbook is attached. This edition covers the new business casual policy for Fridays, an extra floating holiday and clearer rules for booking conference rooms.",
      "Please read it, sign the acknowledgment form on the last page, and return the form to us by the end of next week.",
      "Human Resources",
    ),
    attachment: { name: "Employee Handbook.pdf", sizeKb: 640 },
  },
  {
    from: "Human Resources",
    subject: "Lunch and learn: your retirement savings plan",
    body: paras(
      "Join us Wednesday at noon in the Maple Room for a lunch and learn about the company retirement savings plan. A representative from the plan will explain how contributions and matching work and answer your questions.",
      "Lunch will be provided, which we suspect may be the main attraction.",
      "Human Resources",
    ),
  },

  // Domino Administrator
  {
    from: "Domino Administrator",
    subject: "Press F5 when you leave your desk",
    body: paras(
      "A reminder to everyone: when you step away from your desk, press F5 to lock your Notes ID. Anyone who sits down at your computer will then need your password to read your mail or send memos in your name.",
      "Last night's walk-through found eleven unlocked workstations, three of them with half-written memos to the VP of Sales.",
      "Domino Administrator",
    ),
  },
  {
    from: "Domino Administrator",
    subject: "Traveling? Replicate before you go",
    body: paras(
      "If you are taking a laptop on the road, replicate your mail before you leave the office: open the Replicator, make sure your mail database is selected, and click Start.",
      "While you are away, memos you send will wait in Outgoing Mail until you connect and replicate again. Remember to switch your location back to Office (Network) when you return.",
      "Domino Administrator",
    ),
  },
  {
    from: "Domino Administrator",
    subject: "New group in Acme's Directory: Q3 Planning Committee",
    body: paras(
      "A new group, Q3 Planning Committee, has been added to Acme's Directory. Mail addressed to the group goes to every member of the committee.",
      "If you think you should be on the list, please ask Diane Whitfield.",
      "Domino Administrator",
    ),
  },
  {
    from: "Domino Administrator",
    subject: "Mail01/Acme restart tonight at 11:00 PM",
    body: paras(
      "Mail01/Acme will be restarted tonight at 11:00 PM for routine maintenance. The server should be back within fifteen minutes.",
      "Mail sent during the restart will be delivered as soon as the server is back up. No action is needed on your part.",
      "Domino Administrator",
    ),
  },
];

// ---------------------------------------------------------------------------
// Replies to memos the user wrote
// ---------------------------------------------------------------------------
/** Replies a colleague sends to a memo the user wrote. Placeholders: {first} = "Sam", {subject} = original subject without RE:, {me} = the replier's first name. Sign with {me}. */
export const REPLY_TEMPLATES: string[] = [
  "Thanks, {first}. I'll look this over today and get back to you.\n\n{me}",
  "Got it. Let's talk it through at our next meeting.\n\n{me}",
  "Sounds good to me. Go ahead.\n\n{me}",
  "{first}, I'm in meetings most of today, but I'll send you a proper answer tomorrow morning.\n\n{me}",
  "Thanks for sending this. I printed it out and will read it on the train home.\n\n{me}",
  "Makes sense. Can you send me the latest version before we go any further?\n\n{me}",
  "I'm at a customer site with only a dial-up connection, so I'll keep this short: yes, let's do it.\n\n{me}",
  "Good thinking, {first}. Let's go with your suggestion.\n\n{me}",
  "Agreed on all points. Please keep me posted.\n\n{me}",
  "Before I answer, is this for Q3, or does it affect this quarter too?\n\n{me}",
  "Works for me. I've blocked out the time on my calendar.\n\n{me}",
  "Thanks for the heads-up. I'll pass it along to the rest of my team.\n\n{me}",
  "Can we talk about this in person? Stop by my desk whenever you have ten minutes.\n\n{me}",
  "Perfect, that's exactly what I needed. Thank you!\n\n{me}",
  "I don't feel strongly either way, so it's your call, {first}.\n\n{me}",
  "Let me pull a few numbers together first. You'll have my answer by tomorrow afternoon.\n\n{me}",
  "Received, thanks. I've filed your note about \"{subject}\" and will come back to it this week.\n\n{me}",
  "Happy to help. Can you give me until Friday?\n\n{me}",
  "I read your memo about \"{subject}\" on my Palm Pilot between meetings, and I think you're right. More when I'm back at my desk.\n\n{me}",
  "Thanks, {first}. I have a few small comments; I'll add them in Permanent Pen and send it back this afternoon.\n\n{me}",
  "Quick answer on \"{subject}\": yes. Longer answer when I'm off the phone.\n\n{me}",
];

/** IT Help Desk auto-acknowledgment. Placeholders {ticket} and {subject}. */
export const HELPDESK_REPLY: string = paras(
  "Thank you for contacting the IT Help Desk. Your request has been logged as ticket {ticket}:",
  "{subject}",
  "A technician will contact you within one business day. If the problem is urgent, call the Help Desk at x4357 and give the technician your ticket number.",
  "To add information to this request, reply to this memo and keep the ticket number in the subject line.",
  "While you wait: many problems go away if you choose File > Exit Notes and start Notes again. If that fixes it, reply and let us know, and we will close your ticket.",
  "IT Help Desk",
);

// ---------------------------------------------------------------------------
// Acme Team Discussion traffic
// ---------------------------------------------------------------------------
export const NEW_TOPICS: TopicTemplate[] = [
  {
    author: "Linda Park",
    subject: "4.0 launch: materials and questions",
    category: "Announcements",
    body: paras(
      "The 4.0 release is on schedule to ship at the end of the month. As the launch materials are finished (price sheets, the customer letter and the demo script), I'll post them as responses to this topic.",
      "If you have questions about the launch, please ask them here rather than by memo, so everyone can see the answers.",
    ),
  },
  {
    author: "Raj Patel",
    subject: "Proposal: a sign-up calendar for the demo server",
    category: "Tools",
    body: paras(
      "Twice this month, two people have booked customer demos on the demo server at the same time. I'd like to set up a shared calendar where you reserve the server before promising a customer a time slot.",
      "Any objections, or a better idea?",
    ),
  },
  {
    author: "Maria Gonzalez",
    subject: "Conference room etiquette",
    category: "Process",
    body: paras(
      "A few reminders so everyone can find a room when they need one:",
      "Book the room before you use it. Erase the whiteboard when you leave. Take your coffee cups with you. If your meeting ends early, release the booking so someone else can have the room.",
      "Thank you!",
    ),
  },
  {
    author: "Kevin O'Brien",
    subject: "Best lunch within walking distance?",
    category: "Off-topic",
    body: paras(
      "I'm still learning the neighborhood. Where do people go for lunch when they have 45 minutes and want something better than the vending machine?",
      "Bonus points for places that can seat eight without a reservation.",
    ),
  },
  {
    author: "Domino Administrator",
    subject: "Notes tip: Quick Search",
    category: "Tools",
    body: paras(
      "You can find a document in a long view without scrolling. Click in the view and start typing: the Quick Search box opens with what you typed, and when you press Enter, Notes jumps to the first document that matches.",
      "It works in your mail, in Acme's Directory and right here.",
    ),
  },
  {
    author: "Human Resources",
    subject: "Service anniversaries this quarter",
    category: "Announcements",
    body: paras(
      "Please join us in congratulating the colleagues celebrating service anniversaries this quarter, including Carl Jensen, who reaches five years with Acme.",
      "Cake will be served in the second-floor break room on the last Friday of the month.",
    ),
  },
  {
    author: "Carl Jensen",
    subject: "Sharing call notes on shared accounts",
    category: "Process",
    body: paras(
      "When more than one of us works an account, we keep calling the same people on the same day. How about this: after any customer call on a shared account, post a three-line summary here with the account name in the subject.",
      "Northwind and Contoso would be a good place to start.",
    ),
  },
  {
    author: "Priya Nair",
    subject: "New expense report form",
    category: "Announcements",
    body: paras(
      "Finance has a new expense report form. It adds a column for the customer name, so we can track spending by account, and it totals your mileage for you.",
      "We will accept the old form through the end of the quarter. Questions? Post them here.",
    ),
  },
  {
    author: "Susan Lee",
    subject: "How long contract reviews take",
    category: "Process",
    body: paras(
      "To help you plan deals, here is how long Legal usually needs:",
      "Nondisclosure agreements: one business day. Amendments: two to three days. New master agreements: one to two weeks.",
      "Customer paper takes longer than our own forms. Send drafts early, even before the deal is final.",
    ),
  },
  {
    author: "Diane Whitfield",
    subject: "Making the Monday sales meeting more useful",
    category: "Process",
    body: paras(
      "Our Monday sales meeting has been running long, and I'm not convinced it's the best use of an hour. What should we keep, what should we drop, and would a shorter stand-up meeting work better?",
      "Honest answers welcome. I promise not to take it personally.",
    ),
  },
  {
    author: "Maria Gonzalez",
    subject: "Lost and found: umbrella, pager, stapler",
    category: "Off-topic",
    body: paras(
      "The lost and found box at reception now holds a black umbrella, a pager (still beeping) and a red stapler.",
      "Please claim your things by Friday. After that, the umbrella goes to the next person caught in the rain.",
    ),
  },
  {
    author: "Raj Patel",
    subject: "Slow dial-up from home?",
    category: "Tools",
    body: paras(
      "Since the new dial-up numbers went in, my connection from home has slowed to a crawl, and replicating my mail takes most of a cup of coffee.",
      "Is anyone else seeing this, or is it time for a new modem?",
    ),
  },
  {
    author: "Kevin O'Brien",
    subject: "Chili cook-off at the next potluck?",
    category: "Off-topic",
    body: paras(
      "Proposal for the next potluck: a chili cook-off, with a secret-ballot vote for the winner.",
      "I will supply the ballots. Someone else should probably supply the antacids.",
    ),
  },
];

export const DISCUSSION_REPLIES: DiscussionReplyTemplate[] = [
  { author: "Diane Whitfield", body: "Good idea. Let's try it for a month and see how it goes." },
  { author: "Carl Jensen", body: "Agreed. I'll bring it up with my team this week." },
  {
    author: "Priya Nair",
    body: "Finance is in favor. Anything that saves us a round of follow-up memos gets my vote.",
  },
  {
    author: "Linda Park",
    body: "Thanks for posting this. Could we add a short summary at the top for people who only read the first paragraph?",
  },
  { author: "Raj Patel", body: "Makes sense to me. If Engineering can help, let me know." },
  {
    author: "Maria Gonzalez",
    body: "If this needs a room or supplies, tell me the date and the headcount and I'll take care of it.",
  },
  {
    author: "Kevin O'Brien",
    body: "I'm new here, so maybe this is obvious, but how did we handle this before?",
  },
  {
    author: "Susan Lee",
    body: "No objection from Legal, as long as nothing confidential ends up in here.",
  },
  {
    author: "Diane Whitfield",
    body: "Let's discuss this at Monday's meeting before we commit to anything.",
  },
  {
    author: "Carl Jensen",
    body: "I've seen this work well before. The trick is getting everyone to actually do it.",
  },
  {
    author: "Priya Nair",
    body: "Do we know how often this comes up? I'm happy to pull the numbers if someone tells me where to look.",
  },
  {
    author: "Linda Park",
    body: "Tom will want to weigh in when he's back. I'll make sure he sees this thread.",
  },
  {
    author: "Raj Patel",
    body: "Can we write the outcome down somewhere more permanent than a discussion thread? Otherwise we'll have this conversation again in six months.",
  },
  { author: "Maria Gonzalez", body: "Thank you for raising this. I'd been wondering the same thing." },
  { author: "Kevin O'Brien", body: "Count me in!" },
  {
    author: "Susan Lee",
    body: "Sounds reasonable. Please send me the final wording before anything goes out to customers.",
  },
  {
    author: "Domino Administrator",
    body: "A reminder that everything posted in this database can be read by everyone at Acme.",
  },
  {
    author: "Carl Jensen",
    body: "Seconded. Also, whoever brings donuts to the next meeting gets my vote for anything.",
  },
  {
    author: "Priya Nair",
    body: "I like it, but let's keep it simple. The last new process we adopted came with a four-page form.",
  },
  {
    author: "Diane Whitfield",
    body: "Thanks, everyone, for the thoughtful responses. I'll summarize what I'm hearing and post it here by Friday.",
  },
  {
    author: "Raj Patel",
    body: "We tried something similar in Engineering last quarter. Happy to share what worked and what didn't.",
  },
  { author: "Linda Park", body: "Quick show of hands: respond here if you're in favor." },
  { author: "Kevin O'Brien", body: "Great point. I printed this thread to read on the train." },
  { author: "Maria Gonzalez", body: "I'll add this to the agenda for the next staff meeting." },
  {
    author: "Human Resources",
    body: "Thank you for the suggestion. We are looking into it and will follow up here.",
  },
  {
    author: "Susan Lee",
    body: "One small request: let's leave customer names out of the subject lines. Otherwise, fine by me.",
  },
];

// ---------------------------------------------------------------------------
// Meeting invitations
// ---------------------------------------------------------------------------
export const MEETING_INVITES: MeetingInviteTemplate[] = [
  {
    chair: "Diane Whitfield",
    subject: "Q3 planning: Sales priorities",
    location: "Birch Conference Room",
    durationMin: 90,
    description:
      "Working session to agree on the Sales team's top priorities for Q3. Please bring your account plans and a rough budget estimate for each priority.",
  },
  {
    chair: "Diane Whitfield",
    subject: "Weekly sales meeting",
    location: "Birch Conference Room",
    durationMin: 60,
    description:
      "Pipeline updates, wins and losses, and anything that needs a decision. Please update your forecast before the meeting.",
  },
  {
    chair: "Diane Whitfield",
    subject: "1:1 check-in",
    location: "Diane's office",
    durationMin: 30,
    description: "Our regular check-in. Bring anything that is blocking you, and anything you want to brag about.",
  },
  {
    chair: "Carl Jensen",
    subject: "Northwind renewal strategy",
    location: "Maple Room",
    durationMin: 60,
    description:
      "Plan our approach for the renewal call: pricing options, the two-year term and who covers which topics. Priya will join for the margin discussion.",
  },
  {
    chair: "Carl Jensen",
    subject: "Contoso volume pricing call",
    location: "Dial-in: 555-0100 x2219",
    durationMin: 45,
    description:
      "Call with Contoso's partner manager about how the volume discount applies when two divisions order separately.",
  },
  {
    chair: "Priya Nair",
    subject: "Q3 budget review",
    location: "Dial-in: 555-0100 x3107",
    durationMin: 60,
    description:
      "Line-by-line review of the Q3 budget requests for Sales. Please have your expense estimates in front of you.",
  },
  {
    chair: "Linda Park",
    subject: "4.0 launch readiness review",
    location: "Birch Conference Room",
    durationMin: 60,
    description:
      "Go/no-go review of the launch checklist. Each owner reports the status of their items. Sales owns items 12 through 18.",
  },
  {
    chair: "Linda Park",
    subject: "Pick the customer quotes for the launch brochure",
    location: "Dial-in: 555-0100 x2219",
    durationMin: 30,
    description: "Quick call to choose the two customer quotes for the 4.0 brochure. Susan will join to review the wording.",
  },
  {
    chair: "Raj Patel",
    subject: "Fabrikam demo dry run",
    location: "Training Room B",
    durationMin: 45,
    description:
      "Run through the demo script on the 4.0 release candidate before we show it to Fabrikam's plant managers. Bring your laptop if you plan to drive the demo.",
  },
  {
    chair: "Susan Lee",
    subject: "Contoso agreement: open issues",
    location: "Susan's office",
    durationMin: 30,
    description:
      "Walk through the open issues in the Contoso agreement and agree on our fallback positions before the next call with their counsel.",
  },
  {
    chair: "Maria Gonzalez",
    subject: "Third-floor seating plan",
    location: "Maple Room",
    durationMin: 30,
    description:
      "Review the proposed seating plan before the movers arrive. Bring your requests, but please remember that there are only four window desks.",
  },
  {
    chair: "Kevin O'Brien",
    subject: "Account plan review: Fabrikam parts division",
    location: "Oak Room",
    durationMin: 30,
    description: "I'd appreciate your advice on my account plan before I send it to Diane. Coffee is on me.",
  },
  {
    chair: "Human Resources",
    subject: "Benefits information session",
    location: "Maple Room",
    durationMin: 60,
    description:
      "Representatives from the medical and dental plans will explain your options and answer questions. Lunch will be provided.",
  },
  {
    chair: "Domino Administrator",
    subject: "Notes tips and tricks",
    location: "Training Room B",
    durationMin: 60,
    description:
      "A hands-on session on the Replicator, locations, delivery options and other Notes features you may not be using yet. Laptops welcome.",
  },
  {
    chair: "IT Help Desk",
    subject: "Laptop check before your trip",
    location: "IT Help Desk, first floor",
    durationMin: 30,
    description:
      "Bring your laptop so we can set up the new dial-up numbers and test replication before you travel.",
  },
];
