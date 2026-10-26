import ArchivedListsClient from "./ArchivedListsClient";
import { pageMember } from "@/lib/auth";
import { listRowsFor } from "../listRows";

export default async function ArchivedListsPage() {
  const viewer = await pageMember();
  // Archiving is the owner's; an archived list shows to everyone who can still see it.
  const lists = await listRowsFor(viewer, true);
  return <ArchivedListsClient lists={lists.map((l) => ({ ...l, archivedAt: l.archivedAt! }))} />;
}
