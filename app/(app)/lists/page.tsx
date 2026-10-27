import ListsClient from "./ListsClient";
import { pageMember } from "@/lib/auth";
import { listRowsFor } from "./listRows";

export default async function ListsPage() {
  const viewer = await pageMember();
  return <ListsClient lists={await listRowsFor(viewer, false)} />;
}
