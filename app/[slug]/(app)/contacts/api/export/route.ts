import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getHouseholdId } from "@/lib/auth";
import { householdsToCSV, contactsToCSV } from "@/lib/csv";

export async function GET(request: NextRequest) {
  if (!(await getHouseholdId())) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const which = new URL(request.url).searchParams.get("file");

  if (which === "households") {
    const households = await prisma.household.findMany({
      where: { deletedAt: null },
      // Never include urlSlug or passwordHash — those are account fields.
      select: {
        id: true,
        displayName: true,
        mailingAddress: true,
        tags: true,
        notes: true,
      },
      orderBy: { displayName: "asc" },
    });

    const csv = householdsToCSV(households);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="households.csv"',
      },
    });
  }

  if (which === "contacts") {
    const contacts = await prisma.contact.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        householdId: true,
        firstName: true,
        lastName: true,
        nickname: true,
        category: true,
        address: true,
        phoneMobile: true,
        phoneHome: true,
        phoneWork: true,
        emailPrimary: true,
        emailSecondary: true,
        tags: true,
        favorite: true,
        relationshipNotes: true,
        linkedFamilyMember: true,
        importantDate1: true,
        importantDate1Label: true,
        importantDate2: true,
        importantDate2Label: true,
        notes: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const csv = contactsToCSV(contacts);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="contacts.csv"',
      },
    });
  }

  return new NextResponse("Specify ?file=households or ?file=contacts", {
    status: 400,
  });
}
