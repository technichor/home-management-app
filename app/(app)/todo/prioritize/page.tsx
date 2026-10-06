import Link from "next/link";
import { Breadcrumb } from "antd";
import { pageHouseholdId } from "@/lib/auth";
import { loadTodo } from "@/lib/todo";
import CompareClient from "@/app/(app)/lists/[id]/compare/CompareClient";
import { recordTodoComparisonAction } from "../actions";

export default async function PrioritizeTodoPage() {
  const householdId = await pageHouseholdId();
  const { open } = await loadTodo(householdId);
  return (
    <div>
      <Breadcrumb style={{ marginBottom: 16 }} items={[{ title: <Link href="/todo">To-do</Link> }, { title: "Prioritize" }]} />
      <CompareClient
        backHref="/todo"
        backLabel="Back to the to-do list"
        compare={recordTodoComparisonAction}
        items={open.map((i) => ({ id: i.id, text: i.text, detail: i.assigneeName ?? "Anyone", rating: i.rating, comparisonCount: i.comparisonCount }))}
      />
    </div>
  );
}
