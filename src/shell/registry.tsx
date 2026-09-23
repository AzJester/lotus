// ============================================================================
// Which component renders a window: one per view (database) and one per
// document collection. Document windows read their document from the tab.
// ============================================================================

import type { ComponentType } from "react";
import type { DocColl, OpenTab, ViewId } from "../data/ui";
import Welcome from "./Welcome";
import Workspace from "./Workspace";
import Mail, { MemoDocument } from "../apps/mail/Mail";
import Calendar, { CalendarDocument } from "../apps/calendar/Calendar";
import Contacts, { ContactDocument } from "../apps/contacts/Contacts";
import Todo, { TodoDocument } from "../apps/todo/Todo";
import Notebook, { JournalDocument } from "../apps/journal/Notebook";
import Discussion, { PostDocument } from "../apps/discussion/Discussion";
import SearchResults from "../apps/search/SearchResults";
import Replicator from "../apps/replication/Replicator";
import Help, { HelpDocument } from "../apps/help/Help";
import Outbox from "../apps/outbox/Outbox";
import Directory from "../apps/directory/Directory";

export const VIEW_COMPONENTS: Record<ViewId, ComponentType> = {
  welcome: Welcome,
  workspace: Workspace,
  mail: Mail,
  calendar: Calendar,
  contacts: Contacts,
  todo: Todo,
  journal: Notebook,
  discussion: Discussion,
  search: SearchResults,
  replicator: Replicator,
  help: Help,
  outbox: Outbox,
  directory: Directory,
};

export const DOC_COMPONENTS: Record<DocColl, ComponentType> = {
  mail: MemoDocument,
  calendar: CalendarDocument,
  contacts: ContactDocument,
  todos: TodoDocument,
  journal: JournalDocument,
  discussion: PostDocument,
  help: HelpDocument,
};

export function componentFor(tab: OpenTab): ComponentType {
  return tab.doc ? DOC_COMPONENTS[tab.doc.coll] : VIEW_COMPONENTS[tab.view];
}
