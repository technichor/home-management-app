import { prisma } from "@/lib/db";
import { pageSuperuser } from "@/lib/auth";
import AdminEmailPanel from "@/components/AdminEmailPanel";

export default async function AdminEmailPage() {
  await pageSuperuser(); // the layout checks too; a page must never rely on that alone
  const entries = await prisma.emailLogEntry.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Email</h3>
      <AdminEmailPanel
        entries={entries.map((e) => ({
          id: e.id,
          to: e.toAddress,
          subject: e.subject,
          status: e.status,
          providerId: e.providerId,
          error: e.error,
          createdAt: e.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
