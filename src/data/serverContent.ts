// ============================================================================
// Placeholder traffic for the simulated Domino server. Replaced by the full
// content module; the exported shapes are the contract server.ts relies on.
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
  from: string;
  subject: string;
  body: string;
  importance?: "high" | "normal" | "low";
  attachment?: { name: string; sizeKb: number };
  mood?: Mood;
}

export const INCOMING_MEMOS: MemoTemplate[] = [
  {
    from: "Maria Gonzalez",
    subject: "Parking garage resurfacing Thursday",
    body: "Hi all,\n\nLevels 2 and 3 of the garage will be closed Thursday for resurfacing. Please use the overflow lot.\n\nMaria",
  },
  {
    from: "Priya Nair",
    subject: "Updated Contoso forecast",
    body: "Sam,\n\nAttached is the updated Contoso forecast. The numbers moved a bit after the last call.\n\nPriya",
    attachment: { name: "contoso-forecast.xls", sizeKb: 84 },
  },
];

export const REPLY_TEMPLATES: string[] = [
  "Thanks, {first}. Got it, I'll take a look at \"{subject}\" this afternoon.\n\n{me}",
  "Sounds good to me, {first}.\n\n{me}",
];

export const HELPDESK_REPLY =
  "Thank you for contacting the IT Help Desk. Your request \"{subject}\" has been logged as ticket {ticket}.\n\nIT Help Desk";

export const NEW_TOPICS: { author: string; subject: string; category: string; body: string }[] = [
  {
    author: "Linda Park",
    subject: "Naming ideas for the spring release",
    category: "Announcements",
    body: "We need a code name for the spring release. Suggestions welcome.",
  },
];

export const DISCUSSION_REPLIES: { author: string; body: string }[] = [
  { author: "Raj Patel", body: "Good point. Let's discuss at the next staff meeting." },
  { author: "Kevin O'Brien", body: "Agreed, count me in." },
];

export const MEETING_INVITES: {
  chair: string;
  subject: string;
  location: string;
  durationMin: number;
  description: string;
}[] = [
  {
    chair: "Diane Whitfield",
    subject: "Northwind renewal strategy",
    location: "Birch Conference Room",
    durationMin: 60,
    description: "Let's align on the two-year proposal before we send it to Marcus.",
  },
];
