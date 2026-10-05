import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageHouseholdId } from "@/lib/auth";
import MealForm from "../../MealForm";

export default async function EditMealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const householdId = await pageHouseholdId();
  const meal = await prisma.meal.findFirst({ where: { id, householdId } });
  if (!meal) notFound();
  return <MealForm meal={{ id: meal.id, name: meal.name, description: meal.description }} />;
}
