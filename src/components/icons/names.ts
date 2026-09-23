// ============================================================================
// Every icon name the app uses. The pixel art lives in three data files:
//   icons16a.ts  – ICON16A_NAMES (applications, chrome, mail, status bar)
//   icons16b.ts  – ICON16B_NAMES (calendar, contacts, to do, notebook,
//                  discussion, text formatting, mood stamps, sidebar)
//   icons32.ts   – ICON32_NAMES  (Workspace database icons, R5 bookmarks)
// The comment beside each name says what the icon should depict.
// ============================================================================

export const ICON16A_NAMES = [
  // --- applications / databases (16px, for toolbars, tabs, navigators) ---
  "home", // small house (Welcome page)
  "workspace", // 2x2 grid of colored database tiles
  "mail", // closed envelope
  "calendar", // desk calendar page with red header and binder rings
  "addressbook", // address book / card file
  "todo", // clipboard with check marks
  "notebook", // spiral-bound notebook (Personal Journal)
  "discussion", // two overlapping speech balloons
  "search", // magnifying glass
  "replicator", // two curved arrows chasing each other in a circle
  "help", // blue book with a yellow question mark
  "directory", // blue book with a small globe (Domino Directory)
  "outbox", // envelope over an out-tray (Outgoing Mail / mail.box)
  "database", // generic database: gray cylinder
  // --- chrome / navigation ---
  "back", // green arrow pointing left
  "forward", // green arrow pointing right
  "stop", // red octagon / red circle with white bar
  "refresh", // two green curved arrows (circle)
  "favorites", // yellow star
  "bookmark-folder", // manila folder with a small star
  "history", // clock face
  "print", // printer with paper
  "open", // open folder with arrow (Open Database)
  "new-database", // database cylinder with a yellow sparkle
  // --- mail actions and navigator ---
  "new-memo", // sheet of paper with a yellow sparkle in the corner
  "reply", // purple arrow curving back to the left
  "reply-all", // double purple arrows curving left
  "forward-mail", // blue arrow pointing right over a sheet
  "follow-up", // flag on a pole; flag cloth drawn with the tint slot "@"
  "mark-read", // opened envelope
  "mark-unread", // closed envelope with a small red star
  "trash", // gray trash can
  "copy-into", // two overlapping sheets with a small arrow
  "folder", // closed yellow manila folder
  "folder-open", // open yellow folder
  "move-to-folder", // folder with a green arrow entering it
  "rules", // funnel / filter
  "inbox", // in-tray holding a letter
  "drafts", // sheet with a pencil
  "sent", // out-tray with an arrow leaving
  "all-documents", // stack of sheets
  "junk", // envelope under a red circle-slash
  "chat-history", // speech balloon with a small clock
  "view", // Notes view icon: small window with striped rows
  "archive", // filing cabinet
  "tools", // wrench
  "other-mail", // two stacked envelopes
  "meetings", // two small people heads over a calendar
  // --- view columns / selection margin ---
  "attachment", // paperclip
  "importance", // bold red exclamation mark
  "unread-star", // small red star (unread mark in the view margin)
  "check", // black check mark (selection margin)
  "replied", // small purple curved arrow (you replied)
  "forwarded", // small blue straight arrow (you forwarded)
  "conflict", // yellow diamond with a black "!" (replication conflict)
  "response", // small sheet with an indent arrow (response document)
  // --- compose / editing ---
  "send", // envelope with motion lines / green arrow
  "send-file", // envelope plus small folder
  "save", // blue floppy disk
  "delivery-options", // envelope with a small gear
  "address", // address book with an arrow
  "discard", // red X
  "attach", // paperclip on a sheet
  "edit", // pencil
  "permanent-pen", // red pen
  "section", // twistie triangle beside horizontal lines (collapsible section)
  "table", // small grid table
  "doclink", // tiny page with a blue curl/link mark (Notes DocLink)
  "dblink", // tiny database cylinder with link mark
  // --- status bar / system ---
  "bolt", // yellow lightning bolt (network activity)
  "bolt-idle", // same bolt in gray (no activity)
  "key", // gold key (access level)
  "location-office", // office building
  "location-home", // small house with a phone line
  "location-travel", // suitcase
  "location-island", // palm tree on a small island (disconnected)
  "mail-new", // envelope with a burst/star (new mail waiting)
  "lock", // padlock (Lock ID)
  "server", // gray tower server
  "pc", // desktop monitor
  "info", // blue circle with white "i"
  "properties", // InfoBox: small window with a tab and "i"
  "question", // blue circle with white "?"
  "warning", // yellow triangle with black "!"
  "error", // red circle with white X
  "chat", // single speech balloon (Sametime)
  "close-x", // small black X (tab close)
] as const;

export const ICON16B_NAMES = [
  // --- calendar ---
  "cal-new", // calendar page with a yellow sparkle
  "cal-today", // calendar page with a red dot on one day
  "cal-day", // calendar page showing one column
  "cal-twodays", // calendar page split into two columns
  "cal-week", // calendar page with seven narrow columns
  "cal-workweek", // calendar page with five columns
  "cal-twoweeks", // calendar page with two rows of seven cells
  "cal-month", // calendar page with a grid of cells
  "cal-list", // list of rows with small clock marks (All Entries)
  "recurrence", // circular arrow
  "alarm", // alarm clock with bells
  "appointment", // clock face
  "meeting", // two people heads
  "reminder", // yellow sticky note with a pin
  "event", // small flag on a calendar / banner
  "anniversary", // wrapped gift box
  "invitation", // envelope with a small calendar
  "accept", // green check mark
  "decline", // red X
  "tentative", // blue question mark
  "delegate", // person with a right arrow
  "propose", // clock with a curved arrow
  "scheduler", // timeline bars (free/busy)
  "snooze", // "Zz" beside a small clock
  // --- contacts ---
  "person", // head and shoulders
  "person-new", // person with a yellow sparkle
  "group", // two people
  "company", // office building (small)
  "tag", // price tag (category)
  "by-name", // letters "A" and "Z" with an arrow
  "vcard-export", // business card with an arrow out
  "vcard-import", // business card with an arrow in
  "write-memo", // envelope with a pencil
  "business-card", // business card
  // --- to do ---
  "todo-new", // clipboard with a yellow sparkle
  "complete", // green check in a box
  "incomplete", // empty checkbox with a curved undo arrow
  "overdue", // clock with a red mark
  "by-status", // small bar chart
  "due-date", // small calendar with a red corner
  // --- notebook ---
  "note-new", // notebook with a yellow sparkle
  "note", // sheet with ruled lines
  // --- discussion ---
  "topic-new", // speech balloon with a yellow sparkle
  "topic", // single speech balloon with text lines
  "response-new", // small balloon with an indent arrow
  "thread", // three small stacked balloons, indented
  "by-author", // person with a speech balloon
  // --- text formatting / edit SmartIcons ---
  "fmt-bold", // bold "B"
  "fmt-italic", // italic "I"
  "fmt-underline", // underlined "U"
  "fmt-strike", // struck-through "S"
  "fmt-bullets", // bulleted list
  "fmt-numbers", // numbered list
  "fmt-indent", // lines with a right arrow
  "fmt-outdent", // lines with a left arrow
  "fmt-left", // left-aligned lines
  "fmt-center", // centered lines
  "fmt-right", // right-aligned lines
  "fmt-color", // letter "A" over a red bar
  "fmt-font", // letters "Aa"
  "cut", // scissors
  "copy", // two sheets
  "paste", // clipboard with a sheet
  "undo", // curved arrow pointing left
  "expand-all", // box with a plus sign
  "collapse-all", // box with a minus sign
  "twistie-right", // small solid triangle pointing right (collapsed)
  "twistie-down", // small solid triangle pointing down (expanded)
  // --- mood stamps (shown in the memo header) ---
  "mood-personal", // person silhouette
  "mood-confidential", // red rubber stamp mark
  "mood-private", // padlock
  "mood-thankyou", // red heart / bouquet
  "mood-flame", // orange flame
  "mood-goodjob", // gold star / thumbs up
  "mood-joke", // yellow smiley face
  "mood-fyi", // blue "i" on a note
  "mood-question", // big blue question mark
  "mood-reminder", // string tied on a finger / bell
  // --- Notes 8 sidebar ---
  "activities", // clipboard with a checklist
  "feeds", // orange RSS waves
  "quickr", // folder with a small "Q"
  "sidekick", // folded map
  "day-glance", // calendar page with a clock
] as const;

export const ICON32_NAMES = [
  // Workspace database icons (32x32, the classic "chiclet" artwork)
  "db-mail", // envelope over an in-tray, the mail file
  "db-calendar", // calendar page with rings
  "db-todo", // clipboard with check marks
  "db-addressbook", // open address book / card file
  "db-journal", // spiral notebook with pen
  "db-discussion", // several speech balloons / people talking
  "db-help", // book with a large question mark
  "db-welcome", // house / home page
  "db-replicator", // two computers with arrows between them
  "db-directory", // thick book with a globe (Domino Directory)
  "db-outbox", // out-tray with envelopes (Outgoing Mail)
  "db-generic", // plain database cylinder
  "db-doclib", // file folders / document library
  // R5 bookmark bar
  "bm-favorites", // folder with a gold star
  "bm-databases", // stack of database cylinders / drawer
  "bm-more", // folder with a right arrow
  "bm-history", // clock
  "bm-workspace", // grid of colored tiles
] as const;

export type Icon16AName = (typeof ICON16A_NAMES)[number];
export type Icon16BName = (typeof ICON16B_NAMES)[number];
export type Icon32Name = (typeof ICON32_NAMES)[number];
export type IconName = Icon16AName | Icon16BName | Icon32Name;
